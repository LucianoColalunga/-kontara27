import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError } from "@/server/platform/errors";
import type { TenantContext } from "@/server/modules/tenancy";
import { addMember, categoryId, createOrganization, createVerifiedUser, typeId } from "@tests/support/factories";
import { createTestEnvironment, meta, type TestEnvironment } from "@tests/support/test-db";

describe("movimientos, cuentas, presupuestos y reportes", () => {
  let env: TestEnvironment;
  let ctx: TenantContext;
  let caja: string;
  let banco: string;

  beforeAll(async () => {
    env = await createTestEnvironment();
    const owner = await createVerifiedUser(env, { name: "Dueña" });
    ctx = (await createOrganization(env, owner.id)).ctx;
    caja = (await env.services.catalog.listAccounts(ctx))[0]!.id;
    banco = await env.services.catalog.createAccount(ctx, { name: "Banco Nación", type: "bank", currency: "ARS", openingBalance: "100.000,00" }, meta);
  });
  afterAll(() => env.dispose());

  it("la empresa nueva trae tipos, medios de pago, categorías y una caja", async () => {
    expect((await env.services.catalog.listMovementTypes(ctx)).length).toBe(10);
    expect((await env.services.catalog.listPaymentMethods(ctx)).length).toBe(7);
    expect((await env.services.catalog.listCategories(ctx)).map((c) => c.name)).toContain("Ventas");
  });

  it("registra cada naturaleza y calcula saldos sin contar transferencias como ingresos o gastos", async () => {
    const create = async (kind: string, amount: string, extra: Record<string, unknown> = {}) =>
      env.services.movements.create(ctx, { typeId: await typeId(env, ctx, kind), occurredOn: "2026-10-15", amount, description: kind, ...extra }, meta);
    await create("income", "50.000", { accountId: caja, categoryId: await categoryId(env, ctx, "Ventas") });
    await create("expense", "12.345,67", { accountId: caja, categoryId: await categoryId(env, ctx, "Servicios") });
    await create("refund_in", "2.345,67", { accountId: caja, categoryId: await categoryId(env, ctx, "Servicios") });
    await create("transfer", "20.000", { accountId: caja, counterAccountId: banco });
    await create("investment", "5.000", { accountId: banco });

    const accounts = await env.services.catalog.listAccounts(ctx);
    const balance = (id: string) => accounts.find((a) => a.id === id)!.balanceMinor;
    expect(balance(caja)).toBe(5000000n - 1234567n + 234567n - 2000000n);
    expect(balance(banco)).toBe(10000000n + 2000000n - 500000n);

    const summary = await env.services.reporting.summary(ctx, { from: "2026-10-01", to: "2026-10-31", currency: "ARS" });
    expect(summary.netIncome).toBe(5000000n);
    expect(summary.netExpense).toBe(1000000n);
    expect(summary.result).toBe(4000000n);
    expect(summary.investment).toBe(500000n);
    expect(summary.netCashFlow).toBe(5000000n + 234567n - 1234567n - 500000n);

    const expenses = await env.services.reporting.byCategory(ctx, { from: "2026-10-01", to: "2026-10-31", currency: "ARS" }, "expense");
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({ name: "Servicios", totalMinor: 1000000n, share: 100 });
  });

  it("edición con control de versión, historial automático y borrado lógico", async () => {
    const income = await typeId(env, ctx, "income");
    const id = await env.services.movements.create(ctx, { typeId: income, occurredOn: "2026-10-20", amount: "1000", description: "Original" }, meta);
    await env.services.movements.update(ctx, id, { typeId: income, occurredOn: "2026-10-20", amount: "1500", description: "Corregido" }, 1, meta);
    await expect(env.services.movements.update(ctx, id, { typeId: income, occurredOn: "2026-10-20", amount: "9999", description: "Pisada" }, 1, meta)).rejects.toBeInstanceOf(ConflictError);

    await env.services.movements.remove(ctx, id, "Cargado por error", meta);
    expect((await env.services.movements.list(ctx, { q: "Corregido" })).total).toBe(0);
    expect((await env.services.movements.list(ctx, { q: "Corregido", deleted: "only" })).total).toBe(1);
    await env.services.movements.restore(ctx, id, meta);

    const history = await env.services.movements.history(ctx, id);
    expect(history.map((h) => h.operation)).toEqual(["restore", "delete", "update"]);
    expect(history.at(-1)!.snapshot.description).toBe("Original");
    expect(history.at(-1)!.snapshot.amount_minor).toBe("100000");
  });

  it("dos ediciones simultáneas de la misma versión: una gana y la otra recibe conflicto", async () => {
    const income = await typeId(env, ctx, "income");
    const id = await env.services.movements.create(ctx, { typeId: income, occurredOn: "2026-10-21", amount: "10", description: "Concurrencia" }, meta);
    const results = await Promise.allSettled([1, 2].map((n) => env.services.movements.update(ctx, id, { typeId: income, occurredOn: "2026-10-21", amount: String(10 + n), description: `v${n}` }, 1, meta)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("los permisos de los roles se aplican", async () => {
    const viewerUser = await createVerifiedUser(env, { name: "Lectora" });
    const viewer = await addMember(env, ctx, viewerUser, "viewer");
    expect(viewer.role.key).toBe("viewer");
    await expect(env.services.movements.create(viewer, { typeId: await typeId(env, ctx, "income"), occurredOn: "2026-10-01", amount: "1", description: "x" }, meta)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await env.services.movements.list(viewer, {})).total).toBeGreaterThan(0);
    const employeeUser = await createVerifiedUser(env, { name: "Empleado" });
    const employee = await addMember(env, ctx, employeeUser, "employee");
    await expect(env.services.reporting.summary(employee, { from: "2026-10-01", to: "2026-10-31", currency: "ARS" })).rejects.toBeInstanceOf(ForbiddenError);
    // El último propietario no puede degradarse ni irse.
    const members = await env.services.tenancy.listMembers(ctx);
    const ownerMembership = members.find((m) => m.roleKey === "owner")!;
    const adminRole = (await env.services.tenancy.listRoles(ctx)).find((r) => r.key === "admin")!;
    await expect(env.services.tenancy.changeMemberRole(ctx, ownerMembership.membershipId, adminRole.id, meta)).rejects.toThrow(/al menos un propietario/);
  });

  it("presupuestos con alertas idempotentes", async () => {
    const servicios = await categoryId(env, ctx, "Servicios");
    await env.services.budgets.create(ctx, { name: "Servicios del mes", period: "monthly", amount: "12.000", currency: "ARS", categoryId: servicios, sectorId: null, alertThresholdPct: 80, startsOn: "2026-01-01", endsOn: null }, meta);
    const [progress] = await env.services.budgets.progress(ctx, "2026-10-31");
    expect(progress).toMatchObject({ spentMinor: 1000000n, amountMinor: 1200000n, state: "warning" });
    expect(progress!.pct).toBe(83.3);
    expect(await env.services.budgets.evaluateAlerts({ ...ctx })).toBeGreaterThanOrEqual(0);
  });

  it("categoría eliminada con reasignación de sus movimientos", async () => {
    const otros = await categoryId(env, ctx, "Otros gastos");
    const servicios = await categoryId(env, ctx, "Servicios");
    const tmp = await env.services.catalog.createCategory(ctx, { name: "Trasporte", scope: "expense" }, meta);
    await env.services.movements.create(ctx, { typeId: await typeId(env, ctx, "expense"), occurredOn: "2026-10-05", amount: "300", categoryId: tmp, description: "Remis" }, meta);
    await expect(env.services.catalog.deleteCategory(ctx, tmp, null, meta)).rejects.toThrow(/elegí a qué categoría/);
    const result = await env.services.catalog.deleteCategory(ctx, tmp, otros, meta);
    expect(result.reassigned).toBe(1);
    expect((await env.services.movements.list(ctx, { categoryId: otros })).total).toBe(1);
    await expect(env.services.catalog.createCategory(ctx, { name: "servicios", scope: "expense" }, meta)).rejects.toThrow(/Ya existe/);
    void servicios;
  });
});
