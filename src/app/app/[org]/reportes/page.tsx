import type { Metadata } from "next";
import { Download } from "lucide-react";
import { PeriodFilter } from "@/components/filters/period-filter";
import { ReportTable } from "@/components/reports/report-table";
import { buttonClass, Callout, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat";
import { formatMoney } from "@/lib/money";
import { formatDate, monthLabel, resolvePeriod } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can } from "@/server/modules/tenancy";
import { buildReports } from "@/server/modules/reporting";

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await params;
  const q = await searchParams;
  const { ctx } = await requireTenant(org, "reports.view");
  const services = await getServices();
  const locale = ctx.organization.locale;
  const currencies = await services.reporting.currencies(ctx);
  const currency = q.moneda && currencies.includes(q.moneda) ? q.moneda : ctx.organization.currency;
  const period = resolvePeriod({ periodo: q.periodo ?? "anio", desde: q.desde, hasta: q.hasta }, ctx.organization.timezone);
  const report = await buildReports(services.reporting, ctx, { from: period.from, to: period.to, currency });
  const base = `/app/${ctx.organization.slug}`;
  const monthLabels = Object.fromEntries(report.months.map((m) => [m, monthLabel(m, locale, "long")]));
  const exportHref = (tipo: string, formato: string) => `/api/orgs/${ctx.organization.slug}/exports/reportes?${new URLSearchParams({ tipo, formato, periodo: period.preset, desde: period.from, hasta: period.to, moneda: currency }).toString()}`;
  const exportMenu = (tipo: string) =>
    can(ctx, "reports.export") ? (
      <details className="relative">
        <summary className={buttonClass("ghost", "sm", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
          <Download className="h-4 w-4" aria-hidden /> Exportar
        </summary>
        <div className="card absolute right-0 z-20 mt-2 w-40 p-1.5">
          {[
            ["xlsx", "Excel"],
            ["csv", "CSV"],
            ["pdf", "PDF"],
          ].map(([f, label]) => (
            <a key={f} href={exportHref(tipo, f!)} className="block rounded-lg px-3 py-2 text-[14px] hover:bg-surface-2">
              {label}
            </a>
          ))}
        </div>
      </details>
    ) : null;

  return (
    <>
      <PageHeader
        title="Reportes"
        description={`Del ${formatDate(period.from, locale)} al ${formatDate(period.to, locale)}, en ${currency}. Solo movimientos realizados; las transferencias internas no son ingresos ni gastos.`}
        actions={
          can(ctx, "reports.export") ? (
            <a href={exportHref("completo", "xlsx")} className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> Libro completo (.xlsx)
            </a>
          ) : null
        }
      />
      <PeriodFilter basePath={`${base}/reportes`} current={period.preset} from={period.from} to={period.to} currencies={currencies} currency={currency} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Ingresos netos" minor={report.summary.netIncome} previous={report.lastYear.netIncome} previousLabel="mismo período del año anterior" currency={currency} locale={locale} />
        <StatTile label="Gastos netos" minor={report.summary.netExpense} previous={report.lastYear.netExpense} previousLabel="mismo período del año anterior" currency={currency} locale={locale} upIsGood={false} />
        <StatTile label="Resultado" minor={report.summary.result} previous={report.previous.result} previousLabel="período anterior" currency={currency} locale={locale} />
        <StatTile label="Flujo de caja neto" minor={report.summary.netCashFlow} previous={report.previous.netCashFlow} previousLabel="período anterior" currency={currency} locale={locale} />
      </div>

      {report.unassigned !== 0n ? (
        <Callout tone="info" className="mb-6">
          Hay movimientos sin cuenta asignada (por ejemplo, históricos importados) con un flujo neto de {formatMoney(report.unassigned, currency, locale)} en el período: cuentan en los resultados y en el flujo, pero no en el saldo de ninguna cuenta.
        </Callout>
      ) : null}

      <div className="space-y-6">
        <Card>
          <CardHeader title="Estado de resultados" description={`Margen: ${report.summary.margin === null ? "—" : `${report.summary.margin.toLocaleString(locale)} %`} · inversiones del período: ${formatMoney(report.summary.investment, currency, locale)} (se capitalizan, no son gasto)`} action={exportMenu("resultados")} />
          <div className="p-5">
            <ReportTable table={report.tables.incomeStatement} currency={currency} locale={locale} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Flujo de caja por mes" description="Entradas y salidas por actividad. Las salidas se muestran con signo negativo." action={exportMenu("flujo")} />
          <div className="p-5">
            <ReportTable table={report.tables.cashFlow} currency={currency} locale={locale} monthLabels={monthLabels} />
          </div>
        </Card>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Comparación mensual" action={exportMenu("mensual")} />
            <div className="p-5">
              <ReportTable table={report.tables.comparison} currency={currency} locale={locale} monthLabels={monthLabels} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Saldos de cuentas" description="Al inicio y al cierre del período, en esta moneda." action={exportMenu("cuentas")} />
            <div className="p-5">
              {report.balances.length ? <ReportTable table={report.tables.accounts} currency={currency} locale={locale} /> : <p className="text-sm text-muted">No hay cuentas en {currency}.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
