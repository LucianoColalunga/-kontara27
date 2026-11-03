import "server-only";
import { MOVEMENT_KINDS } from "@/lib/movement-kinds";
import { formatDate, resolvePeriod } from "@/lib/periods";
import { recordAudit } from "@/server/platform/audit";
import type { RequestMeta } from "@/server/platform/audit";
import { type Database, withTenant } from "@/server/platform/db";
import { RATE_LIMITS, type RateLimiter } from "@/server/platform/rate-limit";
import type { MovementService } from "@/server/modules/ledger";
import { authorize, type TenantContext, tenantScope } from "@/server/modules/tenancy";
import { movementsTable, type Table, toCsv, toXlsx } from "../infrastructure/exporters";
import { renderTablesPdf } from "../infrastructure/pdf";
import { buildReports } from "./report-builder";
import type { ReportingService } from "./reporting-service";

export type ExportFormat = "xlsx" | "csv" | "pdf";
export interface ExportFile {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

const REPORT_TITLES: Record<string, string> = { resultados: "Estado de resultados", flujo: "Flujo de caja", mensual: "Comparación mensual", cuentas: "Saldos de cuentas", completo: "Reportes financieros" };
const CONTENT_TYPES: Record<ExportFormat, string> = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv; charset=utf-8", pdf: "application/pdf" };

export function parseFormat(value: string | null): ExportFormat {
  return value === "csv" || value === "pdf" ? value : "xlsx";
}

/** Exportaciones: límite por usuario, registro de auditoría en la empresa y el mismo armado que la pantalla. */
export class ExportService {
  constructor(private readonly deps: { db: Database; movements: MovementService; reporting: ReportingService; rateLimiter: RateLimiter }) {}

  private async render(ctx: TenantContext, tables: Table[], format: ExportFormat, currency: string, title: string, subtitle: string, filename: string): Promise<ExportFile> {
    let bytes: Uint8Array;
    if (format === "csv") bytes = toCsv(tables[0]!, currency, ctx.organization.locale.startsWith("es"));
    else if (format === "pdf") bytes = await renderTablesPdf({ organizationName: ctx.organization.name, title, subtitle, tables, currency, locale: ctx.organization.locale, generatedAt: new Date(), timezone: ctx.organization.timezone });
    else bytes = toXlsx(tables, currency, { title, creator: ctx.organization.name });
    return { filename: `${filename}.${format}`, contentType: CONTENT_TYPES[format], bytes };
  }

  async exportMovements(ctx: TenantContext, query: URLSearchParams, meta: RequestMeta): Promise<ExportFile> {
    authorize(ctx, "movements.view", "reports.export");
    await this.deps.rateLimiter.consume(RATE_LIMITS.exportsByUser, ctx.userId);
    const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const isId = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    const tipo = query.get("tipo");
    const filters = {
      q: query.get("q")?.slice(0, 100) || undefined,
      from: isDate(query.get("desde")),
      to: isDate(query.get("hasta")),
      kinds: tipo && (MOVEMENT_KINDS as readonly string[]).includes(tipo) ? [tipo] : undefined,
      categoryId: isId(query.get("categoria")),
      accountId: isId(query.get("cuenta")),
      importBatchId: isId(query.get("importacion")),
      sort: "date_asc",
    };
    const rows = await this.deps.movements.listAll(ctx, filters);
    const format = parseFormat(query.get("formato"));
    await withTenant(this.deps.db, tenantScope(ctx), (tx) => recordAudit(tx, { action: "export.movements", actorUserId: ctx.userId, organizationId: ctx.organizationId, metadata: { format, rows: rows.length }, request: meta }));
    const currency = ctx.organization.currency;
    const period = filters.from || filters.to ? `del ${filters.from ?? "inicio"} al ${filters.to ?? "hoy"}` : "todo el historial";
    return this.render(ctx, [movementsTable(rows, currency)], format, currency, "Movimientos", `${rows.length} movimientos · ${period}`, `movimientos-${ctx.organization.slug}-${new Date().toISOString().slice(0, 10)}`);
  }

  async exportReport(ctx: TenantContext, query: URLSearchParams, meta: RequestMeta): Promise<ExportFile> {
    authorize(ctx, "reports.view", "reports.export");
    await this.deps.rateLimiter.consume(RATE_LIMITS.exportsByUser, ctx.userId);
    const currencies = await this.deps.reporting.currencies(ctx);
    const currency = currencies.includes(query.get("moneda") ?? "") ? query.get("moneda")! : ctx.organization.currency;
    const period = resolvePeriod({ periodo: query.get("periodo") ?? "anio", desde: query.get("desde") ?? undefined, hasta: query.get("hasta") ?? undefined }, ctx.organization.timezone);
    const report = await buildReports(this.deps.reporting, ctx, { from: period.from, to: period.to, currency });
    const tipo = REPORT_TITLES[query.get("tipo") ?? ""] ? query.get("tipo")! : "completo";
    const tables: Record<string, Table[]> = {
      resultados: [report.tables.incomeStatement],
      flujo: [report.tables.cashFlow],
      mensual: [report.tables.comparison],
      cuentas: [report.tables.accounts],
      completo: [report.tables.incomeStatement, report.tables.cashFlow, report.tables.comparison, report.tables.accounts],
    };
    const format = parseFormat(query.get("formato"));
    await withTenant(this.deps.db, tenantScope(ctx), (tx) => recordAudit(tx, { action: "export.report", actorUserId: ctx.userId, organizationId: ctx.organizationId, metadata: { tipo, format, from: period.from, to: period.to, currency }, request: meta }));
    const subtitle = `Del ${formatDate(period.from, ctx.organization.locale)} al ${formatDate(period.to, ctx.organization.locale)} · ${currency} · solo movimientos realizados`;
    return this.render(ctx, tables[tipo]!, format, currency, REPORT_TITLES[tipo]!, subtitle, `${tipo}-${ctx.organization.slug}-${period.from}_${period.to}`);
  }
}
