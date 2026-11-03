import type { Metadata } from "next";
import { BudgetMeter } from "@/components/charts/charts";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate, todayIn } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can, SUPPORTED_CURRENCIES } from "@/server/modules/tenancy";
import { archiveBudgetAction } from "./actions";
import { BudgetForm } from "./budget-form";

export const metadata: Metadata = { title: "Presupuestos" };

export default async function BudgetsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org, "budgets.view");
  const services = await getServices();
  const [progress, categories, sectors] = await Promise.all([services.budgets.progress(ctx), services.catalog.listCategories(ctx), services.catalog.listSectors(ctx)]);
  const locale = ctx.organization.locale;
  return (
    <>
      <PageHeader title="Presupuestos" description="Límites de gasto mensuales o anuales, por categoría, por sector o para toda la empresa. Te avisamos al llegar al porcentaje que elijas y al superarlo." />
      <Card>
        <CardHeader title="Período actual" description={`Al ${formatDate(todayIn(ctx.organization.timezone), locale)}. Gasto = gastos + inversiones − devoluciones recibidas.`} />
        {progress.length === 0 ? (
          <EmptyState title="Sin presupuestos" description="Creá el primero: por ejemplo, «Servicios» con un tope mensual." />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {progress.map((b) => (
              <li key={b.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-[12px] text-muted">
                    {b.period === "monthly" ? "Mensual" : "Anual"} · {b.periodLabel}
                    {b.categoryName ? ` · ${b.categoryName}` : " · toda la empresa"}
                    {b.sectorName ? ` · ${b.sectorName}` : ""} · aviso al {b.alertThresholdPct} %
                  </p>
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between gap-2 text-[13px] tabular">
                    <span>{formatMoney(b.spentMinor, b.currency, locale)} usados</span>
                    <span className={b.remainingMinor < 0n ? "font-semibold text-critical" : "text-muted"}>
                      {b.remainingMinor < 0n ? `${formatMoney(-b.remainingMinor, b.currency, locale)} por encima` : `${formatMoney(b.remainingMinor, b.currency, locale)} disponibles`}
                    </span>
                  </div>
                  <BudgetMeter pct={b.pct} state={b.state} />
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  <span className="text-[13px] text-muted tabular">de {formatMoney(b.amountMinor, b.currency, locale)}</span>
                  {can(ctx, "budgets.manage") ? (
                    <form action={archiveBudgetAction}>
                      <input type="hidden" name="org" value={ctx.organization.slug} />
                      <input type="hidden" name="id" value={b.id} />
                      <button type="submit" className="text-[13px] font-semibold text-muted hover:text-critical">
                        Archivar
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {can(ctx, "budgets.manage") ? (
        <Card className="mt-6">
          <CardHeader title="Nuevo presupuesto" />
          <div className="p-5">
            <BudgetForm org={ctx.organization.slug} currencies={[ctx.organization.currency, ...SUPPORTED_CURRENCIES.filter((c) => c !== ctx.organization.currency)]} categories={categories.filter((c) => c.scope !== "income").map((c) => ({ id: c.id, name: c.name }))} sectors={sectors.map((s) => ({ id: s.id, name: s.name }))} today={todayIn(ctx.organization.timezone)} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
