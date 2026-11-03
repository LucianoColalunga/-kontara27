import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, FileSpreadsheet, Plus, TrendingUp } from "lucide-react";
import { CategoryBars, GroupedColumns, TrendLine, BudgetMeter } from "@/components/charts/charts";
import { PeriodFilter } from "@/components/filters/period-filter";
import { Money } from "@/components/ui/money";
import { Badge, Callout, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat";
import { KIND_INFO } from "@/lib/movement-kinds";
import { formatMoney } from "@/lib/money";
import { formatDate, monthLabel, PERIOD_LABELS, resolvePeriod, todayIn, trailingYear } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can } from "@/server/modules/tenancy";
import { previousPeriod } from "@/server/modules/reporting";

export const metadata: Metadata = { title: "Panel" };

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await params;
  const query = await searchParams;
  const { ctx, session } = await requireTenant(org);
  const services = await getServices();
  const locale = ctx.organization.locale;
  const base = `/app/${ctx.organization.slug}`;
  const firstName = session.user.name.split(" ")[0];

  if (!can(ctx, "reports.view")) {
    return (
      <>
        <PageHeader title={`Hola, ${firstName}`} description={`Estás en ${ctx.organization.name} como ${ctx.role.name}.`} />
        <div className="grid gap-4 sm:grid-cols-2">
          {can(ctx, "movements.create") ? (
            <Card className="p-6">
              <h2 className="font-semibold">Registrar un movimiento</h2>
              <p className="mt-1 text-sm text-muted">Cargá un ingreso o un gasto y adjuntá el comprobante.</p>
              <LinkButton href={`${base}/movimientos/nuevo`} className="mt-4">
                <Plus className="h-4 w-4" aria-hidden /> Nuevo movimiento
              </LinkButton>
            </Card>
          ) : null}
          {can(ctx, "movements.view") ? (
            <Card className="p-6">
              <h2 className="font-semibold">Movimientos</h2>
              <p className="mt-1 text-sm text-muted">Consultá lo registrado en la empresa.</p>
              <LinkButton href={`${base}/movimientos`} variant="secondary" className="mt-4">
                Ver movimientos
              </LinkButton>
            </Card>
          ) : null}
        </div>
        {query.sinpermiso ? <Callout tone="warning" className="mt-6">Tu rol no tiene acceso a esa sección. Pedile a un administrador que ajuste tus permisos.</Callout> : null}
      </>
    );
  }

  const currencies = await services.reporting.currencies(ctx);
  const currency = query.moneda && currencies.includes(query.moneda) ? query.moneda : ctx.organization.currency;
  const period = resolvePeriod({ periodo: query.periodo, desde: query.desde, hasta: query.hasta }, ctx.organization.timezone);
  const prev = previousPeriod(period.from, period.to);
  const year = trailingYear(period.to);
  const p = { from: period.from, to: period.to, currency };

  const [summary, previous, monthly, expenses, incomes, spikes, recent, budgets, upcoming, accounts] = await Promise.all([
    services.reporting.summary(ctx, p),
    services.reporting.summary(ctx, { ...prev, currency }),
    services.reporting.monthly(ctx, { ...year, currency }),
    services.reporting.byCategory(ctx, p, "expense"),
    services.reporting.byCategory(ctx, p, "income"),
    services.reporting.expenseSpikes(ctx, p),
    can(ctx, "movements.view") ? services.movements.list(ctx, { pageSize: 10, sort: "date_desc" }) : null,
    can(ctx, "budgets.view") ? services.budgets.progress(ctx) : [],
    services.reminders.upcoming(ctx),
    can(ctx, "accounts.view") ? services.catalog.listAccounts(ctx) : [],
  ]);
  const hasData = monthly.some((m) => m.movementCount > 0) || (recent?.total ?? 0) > 0;
  // Los meses que todavía no ocurrieron no se dibujan como cero.
  const currentMonth = todayIn(ctx.organization.timezone).slice(0, 7);
  const series = monthly.filter((m) => m.month <= currentMonth);
  const budgetAlerts = budgets.filter((b) => b.state !== "ok" && b.currency === currency);
  const previousLabel = period.preset === "mes" ? "mes anterior" : "período anterior";

  return (
    <>
      <PageHeader
        eyebrow={PERIOD_LABELS[period.preset]}
        title={`Hola, ${firstName}`}
        description={`${ctx.organization.name} · del ${formatDate(period.from, locale)} al ${formatDate(period.to, locale)}`}
        actions={
          can(ctx, "movements.create") ? (
            <LinkButton href={`${base}/movimientos/nuevo`} className="sm:hidden">
              <Plus className="h-4 w-4" aria-hidden /> Nuevo movimiento
            </LinkButton>
          ) : null
        }
      />
      {query.bienvenida ? (
        <Callout tone="good" title="Empresa creada" className="mb-6">
          Ya podés registrar movimientos{can(ctx, "imports.run") ? <> o <Link href={`${base}/importar`} className="font-semibold text-accent">importar tu planilla de Excel</Link></> : null}. También podés invitar a tu equipo desde «Equipo y permisos».
        </Callout>
      ) : null}
      {query.sinpermiso ? <Callout tone="warning" className="mb-6">Tu rol no tiene acceso a esa sección.</Callout> : null}

      <PeriodFilter basePath={base} current={period.preset} from={period.from} to={period.to} currencies={currencies} currency={currency} />

      {!hasData ? (
        <Card>
          <EmptyState
            title="Todavía no hay movimientos"
            description="Registrá el primero o traé tu historial desde una planilla. El panel se arma solo con tus datos."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {can(ctx, "movements.create") ? (
                  <LinkButton href={`${base}/movimientos/nuevo`}>
                    <Plus className="h-4 w-4" aria-hidden /> Nuevo movimiento
                  </LinkButton>
                ) : null}
                {can(ctx, "imports.run") ? (
                  <LinkButton href={`${base}/importar`} variant="secondary">
                    <FileSpreadsheet className="h-4 w-4" aria-hidden /> Importar planilla
                  </LinkButton>
                ) : null}
              </div>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6 fade-in">
          {/* Número principal del período */}
          <section className="card overflow-hidden" aria-labelledby="resultado">
            <div className="grid gap-6 p-6 lg:p-7 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
              <div>
                <h2 id="resultado" className="text-[13px] font-semibold text-text-2">
                  Resultado del período
                </h2>
                <p className="mt-2 text-[36px] leading-none font-bold tracking-[-0.02em] break-words sm:text-[48px]">{formatMoney(summary.result, currency, locale)}</p>
                <p className="mt-3 text-[13px] text-muted">
                  Ingresos netos menos gastos netos. {summary.margin !== null ? <>Margen: <span className="font-semibold text-text-2">{summary.margin.toLocaleString(locale)} %</span>.</> : null} Las transferencias entre cuentas no cuentan.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge tone="neutral">{summary.movementCount} movimientos</Badge>
                  {summary.investment > 0n ? <Badge tone="accent">Inversiones: {formatMoney(summary.investment, currency, locale)}</Badge> : null}
                </div>
              </div>
              <div className="min-w-0">
                <TrendLine
                  label="Resultado mensual"
                  currency={currency}
                  locale={locale}
                  height={190}
                  points={series.map((m) => ({ label: monthLabel(m.month, locale), longLabel: monthLabel(m.month, locale, "long"), value: m.result }))}
                />
              </div>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Ingresos" minor={summary.netIncome} previous={previous.netIncome} currency={currency} locale={locale} previousLabel={previousLabel} />
            <StatTile label="Gastos" minor={summary.netExpense} previous={previous.netExpense} currency={currency} locale={locale} upIsGood={false} previousLabel={previousLabel} />
            <StatTile label="Flujo de caja neto" minor={summary.netCashFlow} previous={previous.netCashFlow} currency={currency} locale={locale} previousLabel={previousLabel} />
            <StatTile label="Inversiones" minor={summary.investment} previous={previous.investment} currency={currency} locale={locale} upIsGood={false} previousLabel={previousLabel} />
          </div>

          {spikes.length || budgetAlerts.length ? (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> Alertas
              </h2>
              <ul className="space-y-2 text-sm">
                {spikes.map((s) => (
                  <li key={s.categoryId ?? s.name} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">Gasto elevado en {s.name}:</span>
                    <span className="text-text-2">
                      {formatMoney(s.currentMinor, currency, locale)} este mes, {s.increasePct.toLocaleString(locale)} % sobre el promedio de los tres meses anteriores ({formatMoney(s.averageMinor, currency, locale)}).
                    </span>
                  </li>
                ))}
                {budgetAlerts.map((b) => (
                  <li key={b.id}>
                    <span className="font-semibold">Presupuesto «{b.name}»:</span> <span className="text-text-2">{b.state === "exceeded" ? "superado" : "cerca del límite"} ({b.pct.toLocaleString(locale)} %).</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Ingresos y gastos por mes" description="Últimos 12 meses hasta el fin del período elegido" />
            <div className="p-5 pt-4">
              <GroupedColumns
                title="Ingresos y gastos por mes"
                currency={currency}
                locale={locale}
                series={[
                  { label: "Ingresos", colorVar: "--series-1" },
                  { label: "Gastos", colorVar: "--series-2" },
                ]}
                points={series.map((m) => ({ label: monthLabel(m.month, locale), longLabel: monthLabel(m.month, locale, "long"), values: [m.netIncome, m.netExpense] }))}
              />
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Gastos por categoría" description="Netos de devoluciones" action={<Link href={`${base}/reportes?${new URLSearchParams({ periodo: period.preset, desde: period.from, hasta: period.to })}`} className="text-[13px] font-semibold text-accent">Ver reporte</Link>} />
              <div className="p-5">
                <CategoryBars items={expenses} currency={currency} locale={locale} emptyLabel="Sin gastos en el período." />
              </div>
            </Card>
            <Card>
              <CardHeader title="Ingresos por categoría" description="Netos de devoluciones emitidas" />
              <div className="p-5">
                <CategoryBars items={incomes} currency={currency} locale={locale} emptyLabel="Sin ingresos en el período." />
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {recent ? (
              <Card>
                <CardHeader title="Últimos movimientos" action={<Link href={`${base}/movimientos`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">Todos <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>} />
                <ul className="mt-2 divide-y divide-border">
                  {recent.rows.map((m) => {
                    const direction = KIND_INFO[m.kind].direction;
                    return (
                      <li key={m.id}>
                        <Link href={`${base}/movimientos/${m.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                          <span className="w-14 shrink-0 text-[12px] text-muted tabular">{formatDate(m.occurredOn, locale, { day: "2-digit", month: "short" })}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium">{m.description || m.typeName}</span>
                            <span className="block truncate text-[12px] text-muted">
                              {m.typeName}
                              {m.categoryName ? ` · ${m.categoryName}` : ""}
                            </span>
                          </span>
                          <Money minor={direction === 0 ? m.amountMinor : BigInt(direction) * m.amountMinor} currency={m.currency} locale={locale} signed={direction !== 0} tone={direction > 0 ? "income" : undefined} className="text-[14px] font-semibold" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : null}
            <div className="space-y-6">
              {budgets.length ? (
                <Card>
                  <CardHeader title="Presupuestos" action={<Link href={`${base}/presupuestos`} className="text-[13px] font-semibold text-accent">Ver todos</Link>} />
                  <ul className="space-y-4 p-5">
                    {budgets.slice(0, 4).map((b) => (
                      <li key={b.id}>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
                          <span className="truncate font-semibold">{b.name}</span>
                          <span className="shrink-0 text-muted tabular">
                            {formatMoney(b.spentMinor, b.currency, locale)} / {formatMoney(b.amountMinor, b.currency, locale)}
                          </span>
                        </div>
                        <BudgetMeter pct={b.pct} state={b.state} />
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {upcoming.length ? (
                <Card>
                  <CardHeader title="Próximos vencimientos" action={<Link href={`${base}/vencimientos`} className="text-[13px] font-semibold text-accent">Calendario</Link>} />
                  <ul className="divide-y divide-border">
                    {upcoming.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[14px]">
                        <CalendarClock className={r.overdue ? "h-4 w-4 text-critical" : "h-4 w-4 text-muted"} aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{r.title}</span>
                        {r.overdue ? <Badge tone="critical">Vencido</Badge> : <span className="text-[12px] text-muted tabular">{formatDate(r.dueOn, locale, { day: "2-digit", month: "short" })}</span>}
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {accounts.length ? (
                <Card>
                  <CardHeader title="Saldos" action={<Link href={`${base}/cuentas`} className="text-[13px] font-semibold text-accent">Cuentas</Link>} />
                  <ul className="divide-y divide-border">
                    {accounts.slice(0, 5).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
                        <span className="truncate">{a.name}</span>
                        <Money minor={a.balanceMinor} currency={a.currency} locale={locale} className="font-semibold" />
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {!budgets.length && can(ctx, "budgets.manage") ? (
                <Card className="p-5">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                    <TrendingUp className="h-4 w-4 text-accent" aria-hidden /> Definí un presupuesto
                  </h2>
                  <p className="mt-1 text-sm text-muted">Te avisamos cuando un gasto llega al porcentaje que elijas.</p>
                  <LinkButton href={`${base}/presupuestos`} variant="secondary" size="sm" className="mt-3">
                    Crear presupuesto
                  </LinkButton>
                </Card>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
