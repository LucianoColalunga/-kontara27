import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Banknote, Building2, CreditCard, Landmark, Smartphone, Wallet } from "lucide-react";
import { Money } from "@/components/ui/money";
import { Badge, buttonClass, Card, CardHeader, EmptyState, LinkButton, PageHeader } from "@/components/ui/primitives";
import { minorToDecimalString } from "@/lib/money";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can, SUPPORTED_CURRENCIES } from "@/server/modules/tenancy";
import { archiveAccountAction } from "./actions";
import { AccountForm, ACCOUNT_TYPE_LABELS } from "./account-form";

export const metadata: Metadata = { title: "Cuentas y cajas" };

const ICONS: Record<string, typeof Wallet> = { cash: Banknote, bank: Landmark, wallet: Smartphone, credit_card: CreditCard, investment: Building2, other: Wallet };

export default async function AccountsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org, "accounts.view");
  const services = await getServices();
  const accounts = await services.catalog.listAccounts(ctx, { includeArchived: true });
  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);
  const base = `/app/${ctx.organization.slug}`;
  const locale = ctx.organization.locale;
  const totals = new Map<string, bigint>();
  for (const a of active) totals.set(a.currency, (totals.get(a.currency) ?? 0n) + a.balanceMinor);
  const currencies = [ctx.organization.currency, ...SUPPORTED_CURRENCIES.filter((c) => c !== ctx.organization.currency)];

  return (
    <>
      <PageHeader
        title="Cuentas y cajas"
        description="Saldos calculados con los movimientos realizados. Las transferencias mueven dinero entre tus cuentas sin contar como ingreso ni gasto."
        actions={
          can(ctx, "movements.create") && active.length > 1 ? (
            <LinkButton href={`${base}/movimientos/nuevo?tipo=transfer`} variant="secondary">
              <ArrowLeftRight className="h-4 w-4" aria-hidden /> Transferir entre cuentas
            </LinkButton>
          ) : null
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...totals.entries()].map(([currency, total]) => (
          <div key={currency} className="card p-5">
            <p className="text-[13px] font-semibold text-text-2">Total en {currency}</p>
            <p className="mt-2 text-[26px] font-bold tracking-[-0.01em]">
              <Money minor={total} currency={currency} locale={locale} />
            </p>
            <p className="mt-1 text-[12px] text-muted">Sin conversión entre monedas: cada total es en su moneda.</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader title="Cuentas activas" />
        {active.length === 0 ? (
          <EmptyState title="Sin cuentas" description="Creá la caja, el banco o la billetera donde se mueve tu dinero." />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {active.map((a) => {
              const Icon = ICONS[a.type] ?? Wallet;
              return (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-text-2">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{a.name}</p>
                      <p className="text-[12px] text-muted">
                        {ACCOUNT_TYPE_LABELS[a.type]}
                        {a.institution ? ` · ${a.institution}` : ""}
                        {a.numberLast4 ? ` · •••• ${a.numberLast4}` : ""} · {a.movementCount} movimientos
                        {a.unreconciled ? ` · ${a.unreconciled} sin conciliar` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money minor={a.balanceMinor} currency={a.currency} locale={locale} className="text-[17px] font-bold" />
                      <p className="text-[12px] text-muted">{a.currency}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 pl-14">
                    <Link href={`${base}/movimientos?cuenta=${a.id}`} className={buttonClass("ghost", "sm")}>
                      Ver movimientos
                    </Link>
                    {can(ctx, "accounts.manage") ? (
                      <>
                        <details className="w-full">
                          <summary className={buttonClass("ghost", "sm", "w-fit list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>Editar</summary>
                          <div className="mt-3 rounded-xl border border-border p-4">
                            <AccountForm org={ctx.organization.slug} currencies={currencies} defaults={{ id: a.id, name: a.name, type: a.type, currency: a.currency, openingBalance: minorToDecimalString(a.openingBalanceMinor, a.currency).replace(".", ","), institution: a.institution, numberLast4: a.numberLast4, locked: a.movementCount > 0 }} />
                          </div>
                        </details>
                        <form action={archiveAccountAction}>
                          <input type="hidden" name="org" value={ctx.organization.slug} />
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="archived" value="1" />
                          <button type="submit" className={buttonClass("ghost", "sm")}>
                            Archivar
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {can(ctx, "accounts.manage") ? (
        <Card className="mt-6">
          <CardHeader title="Nueva cuenta o caja" />
          <div className="p-5">
            <AccountForm org={ctx.organization.slug} currencies={currencies} />
          </div>
        </Card>
      ) : null}

      {archived.length ? (
        <Card className="mt-6">
          <CardHeader title="Archivadas" description="No aparecen al cargar movimientos, pero conservan su historial." />
          <ul className="mt-3 divide-y divide-border">
            {archived.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
                <span>
                  {a.name} <Badge>Archivada</Badge>
                </span>
                <span className="flex items-center gap-3">
                  <Money minor={a.balanceMinor} currency={a.currency} locale={locale} className="text-muted" />
                  {can(ctx, "accounts.manage") ? (
                    <form action={archiveAccountAction}>
                      <input type="hidden" name="org" value={ctx.organization.slug} />
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="archived" value="0" />
                      <button type="submit" className="text-[13px] font-semibold text-accent">
                        Reactivar
                      </button>
                    </form>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
