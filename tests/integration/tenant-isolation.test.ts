import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/server/platform/errors";
import type { TenantContext } from "@/server/modules/tenancy";
import { categoryId, createOrganization, createVerifiedUser, typeId } from "@tests/support/factories";
import { createTestEnvironment, meta, type TestEnvironment } from "@tests/support/test-db";

/**
 * La información de una empresa jamás debe ser accesible desde otra. Estas pruebas atacan el
 * aislamiento por todas las vías: servicios con contexto falsificado, SQL directo con el rol de la
 * aplicación, referencias cruzadas por UUID y cobertura de políticas en todas las tablas.
 */
describe("aislamiento multiempresa", () => {
  let env: TestEnvironment;
  let empresaA: TenantContext;
  let otra: TenantContext;
  let movementA: string;
  let categoryA: string;
  let accountA: string;

  beforeAll(async () => {
    env = await createTestEnvironment();
    const ana = await createVerifiedUser(env, { name: "Ana" });
    const bruno = await createVerifiedUser(env, { name: "Bruno" });
    empresaA = (await createOrganization(env, ana.id, { name: "Empresa A" })).ctx;
    otra = (await createOrganization(env, bruno.id, { name: "Otra empresa" })).ctx;
    categoryA = await categoryId(env, empresaA, "Ventas");
    accountA = (await env.services.catalog.listAccounts(empresaA))[0]!.id;
    movementA = await env.services.movements.create(empresaA, { typeId: await typeId(env, empresaA, "income"), occurredOn: "2026-08-08", amount: "25000", categoryId: categoryA, accountId: accountA, description: "Dato confidencial de la empresa A" }, meta);
  });
  afterAll(() => env.dispose());

  it("otra empresa no ve los movimientos, categorías ni cuentas de la empresa A", async () => {
    const list = await env.services.movements.list(otra, {});
    expect(list.rows.map((r) => r.description)).not.toContain("Dato confidencial de la empresa A");
    expect((await env.services.catalog.listCategories(otra)).map((c) => c.id)).not.toContain(categoryA);
    expect((await env.services.catalog.listAccounts(otra)).map((a) => a.id)).not.toContain(accountA);
  });

  it("un contexto falsificado (organizationId ajeno) no devuelve nada ni permite escribir", async () => {
    // Bruno con el id de la empresa A pero sin membresía: RLS anula el contexto.
    const forged: TenantContext = { ...otra, organizationId: empresaA.organizationId };
    const list = await env.services.movements.list(forged, {});
    expect(list.total).toBe(0);
    await expect(env.services.movements.get(forged, movementA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(env.services.movements.remove(forged, movementA, "intento de borrado", meta)).rejects.toBeInstanceOf(NotFoundError);
    await expect(env.services.movements.create(forged, { typeId: await typeId(env, otra, "income"), occurredOn: "2026-08-08", amount: "1", description: "inyectado" }, meta)).rejects.toThrow();
    expect((await env.services.movements.list(empresaA, {})).total).toBe(1);
  });

  it("resolver la organización por slug exige membresía", async () => {
    expect(await env.services.tenancy.resolveContext(otra.userId, empresaA.organization.slug)).toBeNull();
    expect(await env.services.tenancy.resolveContext(empresaA.userId, empresaA.organization.slug)).not.toBeNull();
  });

  it("no se puede referenciar una categoría o cuenta ajena aunque se conozca su UUID", async () => {
    await expect(
      env.services.movements.create(otra, { typeId: await typeId(env, otra, "income"), occurredOn: "2026-08-08", amount: "10", categoryId: categoryA, accountId: accountA, description: "x" }, meta),
    ).rejects.toThrow(/no existe/);
  });

  it("SQL directo con el rol de la aplicación respeta RLS y las claves compuestas", async () => {
    const client = await env.appClient();
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)", [otra.userId, otra.organizationId]);
    const visible = await client.query("select count(*)::int as n from movements where organization_id = $1", [empresaA.organizationId]);
    expect(visible.rows[0].n).toBe(0);
    const updated = await client.query("update movements set description = 'pisado' where id = $1", [movementA]);
    expect(updated.rowCount).toBe(0);
    await expect(client.query("insert into categories (organization_id, name) values ($1, 'intrusa')", [empresaA.organizationId])).rejects.toThrow(/row-level security/);
    await client.query("rollback");

    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)", [otra.userId, otra.organizationId]);
    const otherType = await client.query("select id from movement_types where organization_id = $1 limit 1", [otra.organizationId]);
    // La FK compuesta (organization_id, category_id) impide apuntar a la categoría de la empresa A.
    await expect(
      client.query("insert into movements (organization_id, type_id, kind, occurred_on, amount_minor, currency, category_id, created_by) values ($1, $2, 'income', '2026-01-01', 100, 'ARS', $3, $4)", [otra.organizationId, otherType.rows[0].id, categoryA, otra.userId]),
    ).rejects.toThrow(/foreign key/);
    await client.query("rollback");
  });

  it("sin contexto no se ve ninguna fila de negocio", async () => {
    const client = await env.appClient();
    for (const table of ["movements", "categories", "accounts", "budgets", "files", "import_batches", "audit_events"]) {
      const result = await client.query(`select count(*)::int as n from ${table} where organization_id is not null`);
      expect(result.rows[0].n, table).toBe(0);
    }
  });

  it("toda tabla con organization_id tiene RLS habilitado", async () => {
    const client = await env.appClient();
    const result = await client.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from information_schema.columns col where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'organization_id')`);
    expect(result.rows.length).toBeGreaterThan(15);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname} sin RLS`).toBe(true);
      expect(Number(row.policies), `${row.relname} sin políticas`).toBeGreaterThan(0);
      if (!["organizations", "memberships", "invitations"].includes(row.relname)) expect(row.relforcerowsecurity, `${row.relname} sin FORCE`).toBe(true);
    }
  });

  it("el rol de la aplicación no puede saltear RLS ni borrar historial", async () => {
    const client = await env.appClient();
    const role = await client.query("select rolsuper, rolbypassrls from pg_roles where rolname = current_user");
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
    const privileges = await client.query(`
      select has_table_privilege('movements', 'DELETE') as del_movements,
             has_table_privilege('audit_events', 'UPDATE') as upd_audit,
             has_table_privilege('audit_events', 'DELETE') as del_audit,
             has_table_privilege('movement_revisions', 'INSERT') as ins_revisions`);
    expect(privileges.rows[0]).toEqual({ del_movements: false, upd_audit: false, del_audit: false, ins_revisions: false });
    await expect(client.query("alter table movements disable row level security")).rejects.toThrow(/owner|permission/);
  });

  it("los permisos finos se aplican dentro de la empresa", async () => {
    const viewer = { ...empresaA, permissions: new Set(["movements.view", "reports.view"] as const) } as TenantContext;
    await expect(env.services.movements.create(viewer, {}, meta)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(env.services.catalog.createCategory(viewer, { name: "X", scope: "both" }, meta)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
