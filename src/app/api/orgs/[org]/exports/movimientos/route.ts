import { getServices } from "@/server/container";
import { fileResponse, handleRouteError, routeTenant } from "@/server/http/route";
import { requestMeta } from "@/server/http/session";
import { recordAudit } from "@/server/platform/audit";
import { getDb, withTenant } from "@/server/platform/db";
import { RATE_LIMITS } from "@/server/platform/rate-limit";
import { PostgresRateLimiter } from "@/server/platform/rate-limit";
import { movementsTable, renderTablesPdf, toCsv, toXlsx } from "@/server/modules/reporting";
import { MOVEMENT_KINDS } from "@/lib/movement-kinds";
import { tenantScope } from "@/server/modules/tenancy";

export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  try {
    const { org } = await params;
    const tenant = await routeTenant(org, "movements.view", "reports.export");
    if (!tenant.ok) return tenant.response;
    const ctx = tenant.value;
    const db = await getDb();
    await new PostgresRateLimiter(db).consume(RATE_LIMITS.exportsByUser, ctx.userId);
    const q = new URL(request.url).searchParams;
    const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const isId = (v: string | null) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    const tipo = q.get("tipo");
    const filters = {
      q: q.get("q")?.slice(0, 100) || undefined,
      from: isDate(q.get("desde")),
      to: isDate(q.get("hasta")),
      kinds: tipo && (MOVEMENT_KINDS as readonly string[]).includes(tipo) ? [tipo] : undefined,
      categoryId: isId(q.get("categoria")),
      accountId: isId(q.get("cuenta")),
      importBatchId: isId(q.get("importacion")),
      sort: "date_asc",
    };
    const services = await getServices();
    const rows = await services.movements.listAll(ctx, filters);
    const currency = ctx.organization.currency;
    const table = movementsTable(rows, currency);
    const format = q.get("formato") === "csv" ? "csv" : q.get("formato") === "pdf" ? "pdf" : "xlsx";
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `movimientos-${ctx.organization.slug}-${stamp}`;
    const meta = await requestMeta();
    await withTenant(db, tenantScope(ctx), (tx) => recordAudit(tx, { action: "export.movements", actorUserId: ctx.userId, organizationId: ctx.organizationId, metadata: { format, rows: rows.length }, request: meta }));
    if (format === "csv") return fileResponse(toCsv(table, currency, ctx.organization.locale.startsWith("es")), `${name}.csv`, "text/csv; charset=utf-8");
    if (format === "pdf") {
      const period = filters.from || filters.to ? `del ${filters.from ?? "inicio"} al ${filters.to ?? "hoy"}` : "todo el historial";
      const bytes = await renderTablesPdf({ organizationName: ctx.organization.name, title: "Movimientos", subtitle: `${rows.length} movimientos · ${period}`, tables: [table], currency, locale: ctx.organization.locale, generatedAt: new Date(), timezone: ctx.organization.timezone });
      return fileResponse(bytes, `${name}.pdf`, "application/pdf");
    }
    return fileResponse(toXlsx([table], currency, { title: "Movimientos", creator: ctx.organization.name }), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } catch (error) {
    return handleRouteError(error);
  }
}
