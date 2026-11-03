import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader, scrollable } from "@/components/ui/primitives";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { formatDate, monthLabel, todayIn } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can, SUPPORTED_CURRENCIES } from "@/server/modules/tenancy";
import { dismissReminderAction } from "./actions";
import { CompleteReminderForm, ReminderForm, REMINDER_KINDS } from "./forms";

export const metadata: Metadata = { title: "Vencimientos" };

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function RemindersPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await params;
  const q = await searchParams;
  const { ctx } = await requireTenant(org, "reminders.view");
  const services = await getServices();
  const locale = ctx.organization.locale;
  const today = todayIn(ctx.organization.timezone);
  const month = q.mes && /^\d{4}-\d{2}$/.test(q.mes) ? q.mes : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const [inMonth, upcoming, categories, accounts] = await Promise.all([
    services.reminders.list(ctx, { from, to }, "all"),
    services.reminders.upcoming(ctx, 30),
    services.catalog.listCategories(ctx),
    can(ctx, "accounts.view") ? services.catalog.listAccounts(ctx) : [],
  ]);
  const base = `/app/${ctx.organization.slug}/vencimientos`;
  const firstWeekday = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? `${month}-${String(day).padStart(2, "0")}` : null;
  });
  const byDay = new Map<string, typeof inMonth>();
  for (const r of inMonth) byDay.set(r.reminder.dueOn, [...(byDay.get(r.reminder.dueOn) ?? []), r]);
  const manage = can(ctx, "reminders.manage");

  return (
    <>
      <PageHeader title="Vencimientos" description="Alquileres, servicios, impuestos, proveedores, pagos recurrentes y cobros pendientes. Avisamos dentro de la app con la anticipación que elijas." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between px-5 pt-5">
            <h2 className="text-[15px] font-semibold first-letter:uppercase">{monthLabel(month, locale, "long")}</h2>
            <div className="flex gap-1">
              <Link href={`${base}?mes=${shiftMonth(month, -1)}`} className={buttonClass("ghost", "sm")} aria-label="Mes anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Link>
              <Link href={base} className={buttonClass("ghost", "sm")}>
                Hoy
              </Link>
              <Link href={`${base}?mes=${shiftMonth(month, 1)}`} className={buttonClass("ghost", "sm")} aria-label="Mes siguiente">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto p-5" {...scrollable("Calendario de vencimientos")}>
            <table className="w-full min-w-[560px] table-fixed border-collapse text-[12px]">
              <caption className="sr-only">Calendario de vencimientos de {monthLabel(month, locale, "long")}</caption>
              <thead>
                <tr className="text-muted">
                  {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => (
                    <th key={d} scope="col" className="pb-2 text-left font-semibold">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: cells.length / 7 }, (_, w) => (
                  <tr key={w}>
                    {cells.slice(w * 7, w * 7 + 7).map((date, i) => (
                      <td key={i} className={`h-24 border border-border p-1.5 align-top ${date === today ? "bg-accent-soft" : ""}`}>
                        {date ? (
                          <>
                            <span className={`text-[12px] font-semibold ${date === today ? "text-accent" : "text-text-2"}`}>{Number(date.slice(8))}</span>
                            <ul className="mt-1 space-y-1">
                              {(byDay.get(date) ?? []).map(({ reminder: r }) => (
                                <li key={r.id} className={`truncate rounded px-1 py-0.5 text-[11px] ${r.status !== "open" ? "text-muted line-through" : date < today ? "bg-critical-soft text-critical" : "bg-surface-2 text-text"}`} title={r.title}>
                                  {r.title}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Próximos 30 días y vencidos" />
          {upcoming.length === 0 ? (
            <EmptyState title="Nada por vencer" description="Agendá alquileres, servicios o impuestos para recibir avisos." />
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {upcoming.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="text-[12px] text-muted">
                          {REMINDER_KINDS[r.kind]} · {formatDate(r.dueOn, locale)}
                          {r.amountMinor ? ` · ${formatMoney(r.amountMinor, r.currency, locale)}` : ""}
                        </span>
                      </span>
                      {r.recurrence !== "none" ? <Repeat className="h-3.5 w-3.5 text-muted" aria-label="Recurrente" /> : null}
                      {r.overdue ? <Badge tone="critical">Vencido</Badge> : <Badge tone="warning">Pendiente</Badge>}
                    </summary>
                    {manage ? (
                      <div className="mt-3 space-y-2">
                        <CompleteReminderForm org={ctx.organization.slug} reminder={{ id: r.id, title: r.title, direction: r.direction, amount: r.amountMinor ? minorToDecimalString(r.amountMinor, r.currency).replace(".", ",") : "", categoryId: r.categoryId, accountId: r.accountId }} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} today={today} canCreateMovement={can(ctx, "movements.create")} />
                        <form action={dismissReminderAction}>
                          <input type="hidden" name="org" value={ctx.organization.slug} />
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="text-[13px] font-semibold text-muted hover:text-critical">
                            Descartar este vencimiento
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {manage ? (
        <Card className="mt-6">
          <CardHeader title="Agendar un vencimiento" />
          <div className="p-5">
            <ReminderForm org={ctx.organization.slug} currencies={[ctx.organization.currency, ...SUPPORTED_CURRENCIES.filter((c) => c !== ctx.organization.currency)]} categories={categories.map((c) => ({ id: c.id, name: c.name }))} accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} today={today} />
          </div>
        </Card>
      ) : null}
    </>
  );
}
