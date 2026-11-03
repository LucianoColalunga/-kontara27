import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError } from "@/server/platform/errors";
import type { TenantContext } from "@/server/modules/tenancy";
import { readWorkbook } from "@/server/modules/importing";
import { createOrganization, createVerifiedUser } from "@tests/support/factories";
import { createTestEnvironment, meta, type TestEnvironment } from "@tests/support/test-db";
import { monthlyTemplateFixture } from "@tests/support/xlsx-builder";

describe("importación de planillas", () => {
  let env: TestEnvironment;
  let ctx: TenantContext;
  const upload = () => ({ name: "planilla-sintetica.xlsx", bytes: monthlyTemplateFixture() });

  beforeAll(async () => {
    env = await createTestEnvironment();
    const owner = await createVerifiedUser(env);
    ctx = (await createOrganization(env, owner.id, {}, )).ctx;
  });
  afterAll(() => env.dispose());

  it("vista previa: guarda el original, detecta hallazgos y no crea movimientos", async () => {
    const batchId = await env.services.imports.preview(ctx, upload(), {}, meta);
    const { batch, stats, reconciliation, mapping } = await env.services.imports.getBatch(ctx, batchId);
    expect(batch.status).toBe("review");
    expect(batch.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(env.storage.files.size).toBe(1);
    expect(stats).toMatchObject({ total: 8, blocked: 1 });
    expect(reconciliation.totals.sourceExpense).toBe(2250049n + 780000n);
    expect(reconciliation.totals.sourceIncome).toBe(5750050n + 3000000n);
    expect(reconciliation.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["NET_MISMATCH", "WORKBOOK_TOTAL_MISMATCH", "TOTAL_HARDCODED"]));
    expect(mapping.map((m) => m.label).sort()).toEqual(["Insumos", "Servicio técnico", "Servicios"]);
    expect((await env.services.movements.list(ctx, {})).total).toBe(0);
  });

  it("no se confirma con filas bloqueadas; al resolverlas se importa todo y concilia al centavo", async () => {
    const batchId = await env.services.imports.preview(ctx, upload(), {}, meta);
    await expect(env.services.imports.commit(ctx, batchId, meta)).rejects.toBeInstanceOf(ConflictError);

    const { rows } = await env.services.imports.getBatch(ctx, batchId);
    const incomplete = rows.find((r) => r.sourceRef === "ABRIL!4")!;
    await expect(env.services.imports.setRowExcluded(ctx, batchId, incomplete.id, true, "", meta)).rejects.toThrow(/por qué/);
    await env.services.imports.setRowExcluded(ctx, batchId, incomplete.id, true, "Fila sin importe: se carga cuando llegue el comprobante", meta);

    // Reclasificar la devolución como «Devolución recibida».
    const refund = rows.find((r) => r.sourceRef === "MARZO!5")!;
    await env.services.imports.updateRow(ctx, batchId, refund.id, { occurredOn: refund.occurredOn, kind: "refund_in", amount: "12500,50", categoryLabel: "Insumos", description: refund.description }, meta);

    const result = await env.services.imports.commit(ctx, batchId, meta);
    expect(result.imported).toBe(7);
    // «Servicios » (con espacio) coincide con la categoría por defecto «Servicios»: se crean solo las otras dos.
    expect(result.createdCategories).toBe(2);
    const after = await env.services.imports.getBatch(ctx, batchId);
    expect(after.batch.status).toBe("committed");
    expect(after.reconciliation.imported).toEqual({ income: 7500000n, expense: 3030049n, refund_in: 1250050n });

    const summary = await env.services.reporting.summary(ctx, { from: "2026-03-01", to: "2026-04-30", currency: "ARS" });
    expect(summary.netIncome).toBe(7500000n);
    expect(summary.netExpense).toBe(3030049n - 1250050n);
    // Cada movimiento conserva la referencia a su celda de origen.
    const list = await env.services.movements.list(ctx, { importBatchId: batchId, pageSize: 50 });
    expect(list.total).toBe(7);
    const categories = await env.services.catalog.listCategories(ctx);
    expect(categories.map((c) => c.name)).toEqual(expect.arrayContaining(["Insumos", "Servicio técnico"]));

    await expect(env.services.imports.commit(ctx, batchId, meta)).rejects.toThrow(/ya fue confirmada/);
  });

  it("avisa si el mismo archivo ya se importó y marca posibles duplicados", async () => {
    const batchId = await env.services.imports.preview(ctx, upload(), {}, meta);
    const { reconciliation, rows } = await env.services.imports.getBatch(ctx, batchId);
    expect(reconciliation.findings[0]!.code).toBe("FILE_ALREADY_IMPORTED");
    expect(rows.filter((r) => (r.issues as Array<{ code: string }>).some((i) => i.code === "DUPLICATE_EXISTING")).length).toBeGreaterThan(0);
    await env.services.imports.cancel(ctx, batchId, meta);
  });

  it("el informe de migración es un xlsx con filas, conciliación y hallazgos", async () => {
    const [batch] = (await env.services.imports.listBatches(ctx)).filter((b) => b.status === "committed");
    const report = await env.services.imports.exportReport(ctx, batch!.id);
    const wb = readWorkbook(report.bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(["Movimientos migrados", "Conciliación", "Hallazgos"]);
    expect(wb.sheets[0]!.maxRow).toBe(9);
  });

  it("rechaza archivos que no son planillas", async () => {
    await expect(env.services.imports.preview(ctx, { name: "x.xlsx", bytes: new TextEncoder().encode("<html>") }, {}, meta)).rejects.toThrow(/\.xlsx/);
  });
});
