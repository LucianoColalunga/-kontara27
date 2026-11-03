import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isMovementKind, KIND_INFO, MOVEMENT_KINDS, type MovementKind } from "@/lib/movement-kinds";
import { minorToDecimalString, parseMoney } from "@/lib/money";
import { accounts, categories, importBatches, importRows, movements, movementTypes } from "@/server/db/schema";
import { recordAudit, type RequestMeta } from "@/server/platform/audit";
import { type Database, withTenant } from "@/server/platform/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/platform/errors";
import { MAX_IMPORT_BYTES, sniffFileType } from "@/server/platform/file-types";
import { uuidv7 } from "@/server/platform/ids";
import { RATE_LIMITS, type RateLimiter } from "@/server/platform/rate-limit";
import type { FileStorage } from "@/server/platform/storage";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";
import type { MovementService } from "@/server/modules/ledger";
import { extract } from "../domain/extract";
import { normalizeLabel, suggestCategoryName } from "../domain/text";
import type { RowIssue } from "../domain/types";
import { duplicateKey, revalidateEdited, validateRows } from "../domain/validate-rows";
import { readWorkbook, WorkbookReadError } from "../infrastructure/xlsx-reader";
import { writeWorkbook, type XlsxValue } from "../infrastructure/xlsx-writer";

/** Puerto para guardar el archivo original (lo implementa el módulo de documentos). */
export interface SourceFileStore {
  storeFile(ctx: TenantContext, upload: { name: string; bytes: Uint8Array }, purpose: "import_source", allowed: Set<string>, maxBytes: number): Promise<{ id: string; sha256: string }>;
}

export interface ImportDeps {
  db: Database;
  storage: FileStorage;
  movements: MovementService;
  rateLimiter: RateLimiter;
  files?: SourceFileStore;
}

const rowPatch = z.object({
  occurredOn: z.union([z.iso.date(), z.literal(""), z.null()]).optional().transform((v) => v || null),
  kind: z.union([z.enum(MOVEMENT_KINDS), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  amount: z.string().trim().max(32),
  categoryLabel: z.string().trim().max(80).transform((v) => v || null),
  description: z.string().trim().max(500),
});

/** Colores de las categorías creadas al importar (misma paleta validada de los gráficos y tonos de apoyo). */
const IMPORTED_CATEGORY_COLORS = ["#2A78D6", "#EB6834", "#1BAF7A", "#EDA100", "#E87BA4", "#008300", "#6250D6", "#E34948"];

export class ImportService {
  constructor(private readonly deps: ImportDeps) {}

  setFileStore(files: SourceFileStore) {
    this.deps.files = files;
  }

  /** Lee y valida la planilla y deja todo en revisión. No crea ningún movimiento todavía. */
  async preview(ctx: TenantContext, upload: { name: string; bytes: Uint8Array }, options: { currency?: string }, meta: RequestMeta): Promise<string> {
    authorize(ctx, "imports.run");
    await this.deps.rateLimiter.consume(RATE_LIMITS.importsByOrg, ctx.organizationId);
    if (upload.bytes.byteLength > MAX_IMPORT_BYTES) throw new ValidationError("El archivo supera el máximo de 5 MB.");
    if (sniffFileType(upload.bytes)?.mime !== "application/zip") throw new ValidationError("Subí un archivo .xlsx (Excel o Google Sheets → Descargar → .xlsx).");
    const currency = options.currency ?? ctx.organization.currency;
    if (!/^[A-Z]{3}$/.test(currency)) throw new ValidationError("Moneda inválida.");

    let workbook;
    try {
      workbook = readWorkbook(upload.bytes);
    } catch (error) {
      if (error instanceof WorkbookReadError) throw new ValidationError(error.message);
      throw error;
    }
    const extraction = extract(workbook);
    if (!extraction || extraction.rows.length === 0) {
      throw new ValidationError("No encontramos movimientos. La planilla necesita una fila de encabezado con Fecha y columnas de importe (Gasto/Ingreso o Importe).");
    }

    const dates = extraction.rows.map((r) => (r.date.type === "date" ? r.date.text! : null)).filter(Boolean) as string[];
    const existingKeys = new Set<string>();
    const priorImports: Array<{ id: string; committedAt: Date | null }> = [];
    const orgCategories = await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      if (dates.length) {
        const from = dates.reduce((a, b) => (a < b ? a : b));
        const to = dates.reduce((a, b) => (a > b ? a : b));
        const existing = await tx.select({ occurredOn: movements.occurredOn, kind: movements.kind, amountMinor: movements.amountMinor, description: movements.description }).from(movements).where(and(sql`${movements.deletedAt} is null`, sql`${movements.occurredOn} between ${from} and ${to}`));
        for (const m of existing) existingKeys.add(duplicateKey(m.occurredOn, m.kind, m.amountMinor, m.description));
      }
      return tx.select({ id: categories.id, name: categories.name, scope: categories.scope }).from(categories);
    });

    const drafts = validateRows(extraction.rows, { currency, existingKeys });
    const stored = this.deps.files ? await this.deps.files.storeFile(ctx, upload, "import_source", new Set(["application/zip"]), MAX_IMPORT_BYTES) : null;
    const sha256 = stored?.sha256 ?? "";
    const findings = [...extraction.findings];

    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const previous = await tx.select({ id: importBatches.id, committedAt: importBatches.committedAt }).from(importBatches).where(and(eq(importBatches.sourceSha256, sha256), eq(importBatches.status, "committed")));
      priorImports.push(...previous);
    });
    if (priorImports.length) {
      findings.unshift({ code: "FILE_ALREADY_IMPORTED", severity: "warning", message: `Este mismo archivo ya se importó${priorImports[0]!.committedAt ? ` el ${priorImports[0]!.committedAt.toISOString().slice(0, 10)}` : ""}. Si lo confirmás de nuevo, los movimientos quedarán duplicados.` });
    }
    if (workbook.creator && /openpyxl|xlsxwriter/i.test(workbook.creator)) {
      findings.push({ code: "GENERATED_BY_TOOL", severity: "info", message: `El archivo fue guardado por última vez por una herramienta automática (${workbook.creator}). Se usan los valores calculados que contiene y se verifican contra un recálculo propio.` });
    }

    // Sugerencias de categoría: coincidencia por nombre normalizado; si no hay, se propone crearla.
    const mapping: Record<string, string | null> = {};
    for (const label of new Set(drafts.map((d) => d.categoryLabel).filter(Boolean) as string[])) {
      const target = normalizeLabel(suggestCategoryName(label));
      const match = orgCategories.find((c) => normalizeLabel(c.name) === normalizeLabel(label) || normalizeLabel(c.name) === target);
      mapping[label] = match?.id ?? null;
    }

    const batchId = uuidv7();
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await tx.insert(importBatches).values({
        id: batchId,
        organizationId: ctx.organizationId,
        sourceFileId: stored?.id ?? null,
        sourceFilename: upload.name.slice(0, 200),
        sourceSha256: sha256,
        format: extraction.format,
        currency,
        categoryMapping: mapping,
        sourceTotals: { declared: extraction.declared, detectedYear: extraction.detectedYear, sheets: workbook.sheets.map((s) => s.name) } as Record<string, unknown>,
        workbookFindings: findings as unknown as Array<Record<string, unknown>>,
        createdBy: ctx.userId,
      });
      for (let i = 0; i < drafts.length; i += 500) {
        await tx.insert(importRows).values(
          drafts.slice(i, i + 500).map((d) => ({
            id: uuidv7(),
            organizationId: ctx.organizationId,
            batchId,
            position: d.position,
            sourceRef: d.sourceRef,
            raw: { ...d.raw, sheet: d.sheet, sheetMonth: extraction.rows[d.position - 1]?.sheetMonth ?? null },
            occurredOn: d.occurredOn,
            kind: d.kind,
            amountMinor: d.amountMinor,
            categoryLabel: d.categoryLabel,
            description: d.description,
            status: d.status,
            issues: d.issues,
          })),
        );
      }
      await recordAudit(tx, { action: "import.previewed", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "import_batch", entityId: batchId, metadata: { rows: drafts.length, format: extraction.format, sha256 }, request: meta });
    });
    return batchId;
  }

  async listBatches(ctx: TenantContext) {
    authorize(ctx, "imports.run");
    return withTenant(this.deps.db, tenantScope(ctx), (tx) =>
      tx
        .select({ id: importBatches.id, filename: importBatches.sourceFilename, status: importBatches.status, createdAt: importBatches.createdAt, committedAt: importBatches.committedAt, rows: sql<number>`(select count(*)::int from import_rows r where r.batch_id = ${importBatches.id})` })
        .from(importBatches)
        .orderBy(desc(importBatches.createdAt)),
    );
  }

  async getBatch(ctx: TenantContext, batchId: string) {
    authorize(ctx, "imports.run");
    return withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
      if (!batch) throw new NotFoundError("La importación no existe.");
      const rows = await tx.select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(asc(importRows.position));
      const orgCategories = await tx.select({ id: categories.id, name: categories.name, scope: categories.scope }).from(categories).where(eq(categories.isArchived, false)).orderBy(asc(categories.name));
      const accountList = await tx.select({ id: accounts.id, name: accounts.name, currency: accounts.currency }).from(accounts).where(and(eq(accounts.isArchived, false), eq(accounts.currency, batch.currency)));
      const imported = batch.status === "committed" ? await this.importedTotals(tx, batchId) : null;

      const stats = { total: rows.length, ready: 0, needs_review: 0, blocked: 0, excluded: 0, imported: 0 } as Record<string, number>;
      for (const r of rows) stats[r.status] = (stats[r.status] ?? 0) + 1;

      const labels = new Map<string, { count: number; kinds: Set<MovementKind> }>();
      for (const r of rows) {
        if (!r.categoryLabel || r.status === "excluded") continue;
        const entry = labels.get(r.categoryLabel) ?? { count: 0, kinds: new Set<MovementKind>() };
        entry.count += 1;
        if (r.kind) entry.kinds.add(r.kind);
        labels.set(r.categoryLabel, entry);
      }
      const mapping = [...labels.entries()].map(([label, info]) => {
        const categoryId = batch.categoryMapping[label] ?? null;
        return { label, suggestedName: suggestCategoryName(label), categoryId, categoryName: orgCategories.find((c) => c.id === categoryId)?.name ?? null, count: info.count, kinds: [...info.kinds] };
      });

      return { batch, rows, stats, mapping, categories: orgCategories, accounts: accountList, reconciliation: this.reconcile(batch, rows, imported) };
    });
  }

  /**
   * Conciliación: lo que declara la planilla, lo que suman sus filas (columnas originales), lo que
   * se va a importar o se importó (por naturaleza) y lo excluido. Cada diferencia queda explicada
   * por un hallazgo o por filas excluidas.
   */
  private reconcile(batch: typeof importBatches.$inferSelect, rows: Array<typeof importRows.$inferSelect>, imported: Record<string, bigint> | null) {
    const toMinor = (text: unknown) => {
      if (typeof text !== "string" || !/^-?\d+(\.\d+)?$/.test(text)) return 0n;
      try {
        return parseMoney(text, batch.currency);
      } catch {
        return 0n;
      }
    };
    const perSheet = new Map<string, { sourceExpense: bigint; sourceIncome: bigint; toImport: Record<string, bigint>; excluded: bigint; rows: number }>();
    const totals = { sourceExpense: 0n, sourceIncome: 0n, excludedExpense: 0n, excludedIncome: 0n, pendingRows: 0 };
    const toImport: Record<string, bigint> = {};
    for (const r of rows) {
      const raw = r.raw as Record<string, unknown>;
      const sheet = String(raw.sheet ?? "");
      const entry = perSheet.get(sheet) ?? { sourceExpense: 0n, sourceIncome: 0n, toImport: {}, excluded: 0n, rows: 0 };
      const gasto = toMinor(raw.gasto);
      const ingreso = toMinor(raw.ingreso);
      entry.sourceExpense += gasto;
      entry.sourceIncome += ingreso;
      entry.rows += 1;
      totals.sourceExpense += gasto;
      totals.sourceIncome += ingreso;
      if (r.status === "excluded") {
        entry.excluded += gasto + ingreso;
        totals.excludedExpense += gasto;
        totals.excludedIncome += ingreso;
      } else if (r.kind && r.amountMinor) {
        entry.toImport[r.kind] = (entry.toImport[r.kind] ?? 0n) + r.amountMinor;
        toImport[r.kind] = (toImport[r.kind] ?? 0n) + r.amountMinor;
      } else totals.pendingRows += 1;
      perSheet.set(sheet, entry);
    }
    const declared = (batch.sourceTotals as { declared?: { perSheet?: Record<string, Record<string, { value: string; cell: string }>>; workbook?: Record<string, { value: string; cell: string; sheet: string }> } }).declared ?? {};
    const sheets = [...perSheet.entries()].map(([sheet, e]) => ({
      sheet,
      rows: e.rows,
      declaredExpense: declared.perSheet?.[sheet]?.expense?.value ?? null,
      declaredIncome: declared.perSheet?.[sheet]?.income?.value ?? null,
      declaredNet: declared.perSheet?.[sheet]?.net?.value ?? null,
      sourceExpense: e.sourceExpense,
      sourceIncome: e.sourceIncome,
      toImport: e.toImport,
      excluded: e.excluded,
    }));
    return {
      currency: batch.currency,
      sheets,
      workbook: { declaredExpense: declared.workbook?.expense?.value ?? null, declaredIncome: declared.workbook?.income?.value ?? null, declaredNet: declared.workbook?.net?.value ?? null },
      totals,
      toImport,
      imported,
      findings: batch.workbookFindings as unknown as Array<{ code: string; severity: string; message: string; impact?: string }>,
    };
  }

  private async importedTotals(tx: Parameters<Parameters<typeof withTenant>[2]>[0], batchId: string): Promise<Record<string, bigint>> {
    const result = await tx.execute<{ kind: string; total: string }>(sql`select kind, sum(amount_minor)::text as total from movements where import_batch_id = ${batchId} and deleted_at is null group by kind`);
    return Object.fromEntries(result.rows.map((r) => [r.kind, BigInt(r.total)]));
  }

  private async assertReviewable(tx: Parameters<Parameters<typeof withTenant>[2]>[0], batchId: string) {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1).for("update");
    if (!batch) throw new NotFoundError("La importación no existe.");
    if (batch.status !== "review") throw new ConflictError("batch_closed", "La importación ya fue confirmada o cancelada.");
    return batch;
  }

  async updateRow(ctx: TenantContext, batchId: string, rowId: string, raw: unknown, meta: RequestMeta): Promise<void> {
    authorize(ctx, "imports.run");
    const patch = rowPatch.parse(raw);
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const batch = await this.assertReviewable(tx, batchId);
      const [row] = await tx.select().from(importRows).where(and(eq(importRows.id, rowId), eq(importRows.batchId, batchId))).limit(1);
      if (!row) throw new NotFoundError();
      let amountMinor: bigint | null = null;
      if (patch.amount) {
        try {
          amountMinor = parseMoney(patch.amount, batch.currency);
        } catch (error) {
          throw new ValidationError((error as Error).message, { amount: (error as Error).message });
        }
      }
      const rawData = row.raw as { sheet?: string; sheetMonth?: number | null };
      const { issues, status } = revalidateEdited({ occurredOn: patch.occurredOn, kind: patch.kind, amountMinor, categoryLabel: patch.categoryLabel, description: patch.description }, rawData.sheetMonth ?? null, rawData.sheet ?? "");
      const keep = (row.issues as RowIssue[]).filter((i) => i.code === "POSSIBLE_REFUND" && patch.kind === "income");
      await tx.update(importRows).set({ occurredOn: patch.occurredOn, kind: patch.kind, amountMinor, categoryLabel: patch.categoryLabel, description: patch.description, issues: [...keep, ...issues], status, excludeReason: null, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(importRows.id, rowId));
      if (patch.categoryLabel && !(patch.categoryLabel in batch.categoryMapping)) {
        await tx.update(importBatches).set({ categoryMapping: { ...batch.categoryMapping, [patch.categoryLabel]: null } }).where(eq(importBatches.id, batchId));
      }
      await recordAudit(tx, { action: "import.row_edited", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "import_row", entityId: rowId, metadata: { sourceRef: row.sourceRef, before: { occurredOn: row.occurredOn, kind: row.kind, amountMinor: row.amountMinor?.toString() ?? null, categoryLabel: row.categoryLabel, description: row.description } }, request: meta });
    });
  }

  async setRowExcluded(ctx: TenantContext, batchId: string, rowId: string, exclude: boolean, reason: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "imports.run");
    if (exclude && reason.trim().length < 3) throw new ValidationError("Indicá por qué excluís la fila (queda en el informe de migración).", { reason: "Requerido" });
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await this.assertReviewable(tx, batchId);
      const [row] = await tx.select().from(importRows).where(and(eq(importRows.id, rowId), eq(importRows.batchId, batchId))).limit(1);
      if (!row) throw new NotFoundError();
      let status: typeof row.status = "excluded";
      if (!exclude) {
        const rawData = row.raw as { sheet?: string; sheetMonth?: number | null };
        const result = row.kind || row.amountMinor || row.occurredOn ? revalidateEdited({ occurredOn: row.occurredOn, kind: row.kind, amountMinor: row.amountMinor, categoryLabel: row.categoryLabel, description: row.description }, rawData.sheetMonth ?? null, rawData.sheet ?? "") : { status: "blocked" as const };
        status = result.status;
      }
      await tx.update(importRows).set({ status, excludeReason: exclude ? reason.trim().slice(0, 300) : null, updatedBy: ctx.userId, updatedAt: new Date() }).where(eq(importRows.id, rowId));
      await recordAudit(tx, { action: exclude ? "import.row_excluded" : "import.row_included", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "import_row", entityId: rowId, metadata: { sourceRef: row.sourceRef, reason }, request: meta });
    });
  }

  async updateSettings(ctx: TenantContext, batchId: string, input: { mapping: Record<string, string | null>; defaultAccountId: string | null }, meta: RequestMeta): Promise<void> {
    authorize(ctx, "imports.run");
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const batch = await this.assertReviewable(tx, batchId);
      const ids = Object.values(input.mapping).filter(Boolean) as string[];
      if (ids.length) {
        const found = await tx.select({ id: categories.id }).from(categories).where(inArray(categories.id, ids));
        if (found.length !== new Set(ids).size) throw new ValidationError("Alguna categoría elegida no existe.");
      }
      if (input.defaultAccountId) {
        const [account] = await tx.select().from(accounts).where(eq(accounts.id, input.defaultAccountId)).limit(1);
        if (!account || account.currency !== batch.currency) throw new ValidationError(`Elegí una cuenta en ${batch.currency}.`, { defaultAccountId: "Cuenta inválida" });
      }
      const mapping = Object.fromEntries(Object.keys(batch.categoryMapping).map((label) => [label, input.mapping[label] ?? null]));
      await tx.update(importBatches).set({ categoryMapping: mapping, defaultAccountId: input.defaultAccountId }).where(eq(importBatches.id, batchId));
      await recordAudit(tx, { action: "import.settings_updated", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "import_batch", entityId: batchId, request: meta });
    });
  }

  /**
   * Crea los movimientos en una sola transacción. Al final compara los totales grabados con los de
   * las filas: si no coinciden al centavo, se revierte todo (no puede perderse ni sobrar nada).
   */
  async commit(ctx: TenantContext, batchId: string, meta: RequestMeta): Promise<{ imported: number; createdCategories: number }> {
    authorize(ctx, "imports.run", "movements.create");
    return withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      const batch = await this.assertReviewable(tx, batchId);
      const rows = await tx.select().from(importRows).where(eq(importRows.batchId, batchId)).orderBy(asc(importRows.position));
      const blocked = rows.filter((r) => r.status === "blocked");
      if (blocked.length) throw new ConflictError("rows_blocked", `Quedan ${blocked.length} fila(s) con errores. Corregilas o excluilas antes de confirmar.`);
      const toImport = rows.filter((r) => r.status === "ready" || r.status === "needs_review");

      // Categorías nuevas: alcance según el uso real (ingresos, gastos o ambos).
      const mapping = { ...batch.categoryMapping };
      let createdCategories = 0;
      const existing = await tx.select({ id: categories.id, name: categories.name }).from(categories);
      for (const label of new Set(toImport.map((r) => r.categoryLabel).filter(Boolean) as string[])) {
        if (mapping[label]) continue;
        const name = suggestCategoryName(label);
        const found = existing.find((c) => normalizeLabel(c.name) === normalizeLabel(name));
        if (found) {
          mapping[label] = found.id;
          continue;
        }
        const scopes = new Set(toImport.filter((r) => r.categoryLabel === label && r.kind).map((r) => KIND_INFO[r.kind!].categoryScope).filter(Boolean));
        const scope = scopes.size === 1 ? ([...scopes][0] as "income" | "expense") : "both";
        const id = uuidv7();
        await tx.insert(categories).values({ id, organizationId: ctx.organizationId, name, scope, color: IMPORTED_CATEGORY_COLORS[createdCategories % IMPORTED_CATEGORY_COLORS.length], sortOrder: 500 + createdCategories });
        existing.push({ id, name });
        mapping[label] = id;
        createdCategories += 1;
      }

      const types = await tx.select({ id: movementTypes.id, baseKind: movementTypes.baseKind }).from(movementTypes).where(eq(movementTypes.isSystem, true));
      const typeFor = (kind: MovementKind) => {
        const type = types.find((t) => t.baseKind === kind);
        if (!type) throw new ConflictError("missing_type", `Falta el tipo de movimiento base «${KIND_INFO[kind].label}».`);
        return type.id;
      };

      for (const row of toImport) {
        if (!row.kind || !isMovementKind(row.kind) || !row.amountMinor || !row.occurredOn) throw new ConflictError("row_incomplete", `La fila ${row.sourceRef} está incompleta.`);
        const movementId = await this.deps.movements.create(
          ctx,
          {
            typeId: typeFor(row.kind),
            occurredOn: row.occurredOn,
            amount: minorToDecimalString(row.amountMinor, batch.currency),
            categoryId: row.categoryLabel ? mapping[row.categoryLabel] : null,
            accountId: row.kind === "transfer" ? null : batch.defaultAccountId,
            description: row.description,
            notes: `Importado de ${batch.sourceFilename} (${row.sourceRef})`,
            status: "completed",
          },
          meta,
          { tx, importBatchId: batchId, importRowRef: row.sourceRef },
        );
        await tx.update(importRows).set({ status: "imported", movementId }).where(eq(importRows.id, row.id));
      }

      // Verificación final al centavo.
      const expected: Record<string, bigint> = {};
      for (const r of toImport) expected[r.kind!] = (expected[r.kind!] ?? 0n) + r.amountMinor!;
      const actual = await this.importedTotals(tx, batchId);
      const kinds = new Set([...Object.keys(expected), ...Object.keys(actual)]);
      for (const kind of kinds) {
        if ((expected[kind] ?? 0n) !== (actual[kind] ?? 0n)) throw new Error(`Conciliación fallida para ${kind}: esperado ${expected[kind]}, grabado ${actual[kind]}`);
      }
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(movements).where(eq(movements.importBatchId, batchId));
      if ((count?.n ?? 0) !== toImport.length) throw new Error(`Conciliación fallida: ${toImport.length} filas y ${count?.n} movimientos`);

      await tx.update(importBatches).set({ status: "committed", committedAt: new Date(), committedBy: ctx.userId, categoryMapping: mapping }).where(eq(importBatches.id, batchId));
      await recordAudit(tx, { action: "import.committed", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "import_batch", entityId: batchId, metadata: { imported: toImport.length, excluded: rows.length - toImport.length, totals: Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v.toString()])), createdCategories }, request: meta });
      return { imported: toImport.length, createdCategories };
    });
  }

  async cancel(ctx: TenantContext, batchId: string, meta: RequestMeta): Promise<void> {
    authorize(ctx, "imports.run");
    await withTenant(this.deps.db, tenantScope(ctx), async (tx) => {
      await this.assertReviewable(tx, batchId);
      await tx.update(importBatches).set({ status: "cancelled" }).where(eq(importBatches.id, batchId));
      await recordAudit(tx, { action: "import.cancelled", actorUserId: ctx.userId, organizationId: ctx.organizationId, entityType: "import_batch", entityId: batchId, request: meta });
    });
  }

  /** Informe descargable: cada fila de origen con su resultado (importada, excluida y motivo, observaciones). */
  async exportReport(ctx: TenantContext, batchId: string): Promise<{ filename: string; bytes: Uint8Array }> {
    const { batch, rows, reconciliation } = await this.getBatch(ctx, batchId);
    const money = (v: bigint | null) => (v === null ? ({ kind: "empty" } as XlsxValue) : ({ kind: "number", value: minorToDecimalString(v, batch.currency) } as XlsxValue));
    const text = (v: string | null | undefined): XlsxValue => (v ? { kind: "text", value: v } : { kind: "empty" });
    const statusLabel: Record<string, string> = { ready: "Lista", needs_review: "Revisar", blocked: "Con errores", excluded: "Excluida", imported: "Importada" };
    const bytes = writeWorkbook(
      [
        {
          name: "Movimientos migrados",
          columns: [{ header: "Origen", width: 16 }, { header: "Fecha", width: 12 }, { header: "Tipo", width: 20 }, { header: "Categoría (planilla)", width: 20 }, { header: "Descripción", width: 40 }, { header: `Importe (${batch.currency})`, width: 16 }, { header: "Estado", width: 12 }, { header: "Motivo de exclusión", width: 30 }, { header: "Observaciones", width: 60 }, { header: "ID del movimiento", width: 38 }],
          rows: rows.map((r) => [
            text(r.sourceRef),
            r.occurredOn ? { kind: "date", value: r.occurredOn } : { kind: "empty" },
            text(r.kind ? KIND_INFO[r.kind].label : null),
            text(r.categoryLabel),
            text(r.description),
            money(r.amountMinor),
            text(statusLabel[r.status] ?? r.status),
            text(r.excludeReason),
            text((r.issues as RowIssue[]).filter((i) => i.severity !== "info").map((i) => i.message).join(" | ")),
            text(r.movementId),
          ]),
        },
        {
          name: "Conciliación",
          columns: [{ header: "Hoja", width: 16 }, { header: "Filas", width: 8 }, { header: "Gastos declarados", width: 18 }, { header: "Gastos (filas)", width: 18 }, { header: "Ingresos declarados", width: 18 }, { header: "Ingresos (filas)", width: 18 }, { header: "Resultado declarado", width: 20 }, { header: "Excluido", width: 14 }],
          rows: reconciliation.sheets.map((s) => [text(s.sheet), { kind: "number", value: String(s.rows), style: "integer" }, s.declaredExpense ? { kind: "number", value: s.declaredExpense } : { kind: "empty" }, money(s.sourceExpense), s.declaredIncome ? { kind: "number", value: s.declaredIncome } : { kind: "empty" }, money(s.sourceIncome), s.declaredNet ? { kind: "number", value: s.declaredNet } : { kind: "empty" }, money(s.excluded)]),
        },
        {
          name: "Hallazgos",
          columns: [{ header: "Código", width: 26 }, { header: "Severidad", width: 10 }, { header: "Detalle", width: 100 }, { header: "Impacto", width: 14 }],
          rows: reconciliation.findings.map((f) => [text(f.code), text(f.severity), text(f.message), f.impact ? { kind: "number", value: f.impact } : { kind: "empty" }]),
        },
      ],
      { title: `Migración ${batch.sourceFilename}`, creator: ctx.organization.name },
    );
    return { filename: `migracion-${batch.createdAt.toISOString().slice(0, 10)}.xlsx`, bytes };
  }
}
