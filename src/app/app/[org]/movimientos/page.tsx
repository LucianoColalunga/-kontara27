import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Paperclip, Plus, Search } from "lucide-react";
import { Money } from "@/components/ui/money";
import { Badge, buttonClass, Callout, Card, EmptyState, Input, LinkButton, PageHeader, Select, scrollable } from "@/components/ui/primitives";
import { KIND_INFO, MOVEMENT_KINDS } from "@/lib/movement-kinds";
import { formatDate } from "@/lib/periods";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can } from "@/server/modules/tenancy";

export const metadata: Metadata = { title: "Movimientos" };

export default async function MovementsPage({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org } = await params;
  const q = await searchParams;
  const { ctx } = await requireTenant(org, "movements.view");
  const services = await getServices();
  const base = `/app/${ctx.organization.slug}`;
  const locale = ctx.organization.locale;
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const isId = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
  const filters = {
    q: q.q?.slice(0, 100) || undefined,
    from: isDate(q.desde),
    to: isDate(q.hasta),
    kinds: q.tipo && (MOVEMENT_KINDS as readonly string[]).includes(q.tipo) ? [q.tipo as (typeof MOVEMENT_KINDS)[number]] : undefined,
    categoryId: isId(q.categoria),
    accountId: isId(q.cuenta),
    importBatchId: isId(q.importacion),
    reconciled: q.conciliado === "si" ? ("yes" as const) : q.conciliado === "no" ? ("no" as const) : undefined,
    deleted: q.eliminados === "1" && can(ctx, "movements.delete") ? ("only" as const) : ("exclude" as const),
    page: Math.max(1, Number(q.pagina) || 1),
    pageSize: 50,
  };
  const [result, categories, accounts] = await Promise.all([services.movements.list(ctx, filters), services.catalog.listCategories(ctx, { includeArchived: true }), can(ctx, "accounts.view") ? services.catalog.listAccounts(ctx, { includeArchived: true }) : []]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const current = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as Array<[string, string]>);
  const pageHref = (page: number) => {
    const next = new URLSearchParams(current);
    next.set("pagina", String(page));
    return `${base}/movimientos?${next.toString()}`;
  };
  const exportHref = (format: string) => {
    const next = new URLSearchParams(current);
    next.delete("pagina");
    next.set("formato", format);
    return `/api/orgs/${ctx.organization.slug}/exports/movimientos?${next.toString()}`;
  };
  const hasFilters = Boolean(filters.q || filters.from || filters.to || filters.kinds || filters.categoryId || filters.accountId || filters.reconciled || filters.importBatchId || filters.deleted === "only");

  return (
    <>
      <PageHeader
        title={filters.deleted === "only" ? "Movimientos eliminados" : "Movimientos"}
        description={`${result.total.toLocaleString(locale)} ${result.total === 1 ? "movimiento" : "movimientos"}${hasFilters ? " con los filtros aplicados" : ""}.`}
        actions={
          <>
            {can(ctx, "reports.export") ? (
              <details className="relative">
                <summary className={buttonClass("secondary", "md", "list-none cursor-pointer [&::-webkit-details-marker]:hidden")}>
                  <Download className="h-4 w-4" aria-hidden /> Exportar
                </summary>
                <div className="card absolute right-0 z-20 mt-2 w-44 p-1.5">
                  {[
                    ["xlsx", "Excel (.xlsx)"],
                    ["csv", "CSV"],
                    ["pdf", "PDF"],
                  ].map(([f, label]) => (
                    <a key={f} href={exportHref(f!)} className="block rounded-lg px-3 py-2 text-[14px] hover:bg-surface-2">
                      {label}
                    </a>
                  ))}
                </div>
              </details>
            ) : null}
            {can(ctx, "movements.create") ? (
              <LinkButton href={`${base}/movimientos/nuevo`}>
                <Plus className="h-4 w-4" aria-hidden /> Nuevo
              </LinkButton>
            ) : null}
          </>
        }
      />
      {q.eliminado ? <Callout tone="good" className="mb-4">Movimiento eliminado. Queda en «Eliminados» y en el historial; se puede restaurar.</Callout> : null}

      <form action={`${base}/movimientos`} className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]" role="search">
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input name="q" defaultValue={filters.q} placeholder="Buscar en descripción, notas o comprobante" className="pl-9" />
        </label>
        <label>
          <span className="sr-only">Desde</span>
          <Input type="date" name="desde" defaultValue={filters.from} aria-label="Desde" />
        </label>
        <label>
          <span className="sr-only">Hasta</span>
          <Input type="date" name="hasta" defaultValue={filters.to} aria-label="Hasta" />
        </label>
        <Select name="tipo" defaultValue={q.tipo ?? ""} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {MOVEMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].label}
            </option>
          ))}
        </Select>
        <Select name="categoria" defaultValue={filters.categoryId ?? ""} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.isArchived ? " (archivada)" : ""}
            </option>
          ))}
        </Select>
        <Select name="cuenta" defaultValue={filters.accountId ?? ""} aria-label="Cuenta">
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("ink", "md", "flex-1")}>
            Filtrar
          </button>
          {hasFilters ? (
            <Link href={`${base}/movimientos`} className={buttonClass("ghost", "md")}>
              Limpiar
            </Link>
          ) : null}
        </div>
        {can(ctx, "movements.delete") ? (
          <label className="flex items-center gap-2 text-[13px] text-text-2 sm:col-span-2 lg:col-span-7">
            <input type="checkbox" name="eliminados" value="1" defaultChecked={filters.deleted === "only"} className="h-4 w-4 accent-[var(--accent)]" /> Ver solo eliminados
          </label>
        ) : null}
      </form>

      <Card>
        {result.rows.length === 0 ? (
          <EmptyState title={hasFilters ? "Sin resultados" : "Todavía no hay movimientos"} description={hasFilters ? "Probá con otros filtros." : "Registrá el primero o importá tu planilla."} action={!hasFilters && can(ctx, "movements.create") ? <LinkButton href={`${base}/movimientos/nuevo`}>Nuevo movimiento</LinkButton> : undefined} />
        ) : (
          <div className="overflow-x-auto" {...scrollable("Listado de movimientos")}>
            <table className="w-full min-w-[640px] text-left text-[14px]">
              <caption className="sr-only">Movimientos</caption>
              <thead>
                <tr className="border-b border-border text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">
                  <th scope="col" className="px-5 py-3">Fecha</th>
                  <th scope="col" className="py-3 pr-4">Detalle</th>
                  <th scope="col" className="hidden py-3 pr-4 md:table-cell">Cuenta</th>
                  <th scope="col" className="hidden py-3 pr-4 lg:table-cell">Estado</th>
                  <th scope="col" className="px-5 py-3 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((m) => {
                  const direction = KIND_INFO[m.kind].direction;
                  return (
                    <tr key={m.id} className="hover:bg-surface-2">
                      <td className="px-5 py-3 align-top whitespace-nowrap text-text-2 tabular">{formatDate(m.occurredOn, locale)}</td>
                      <td className="py-3 pr-4 align-top">
                        <Link href={`${base}/movimientos/${m.id}`} className="font-medium text-text hover:text-accent">
                          {m.description || m.typeName}
                        </Link>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                          <span>{m.typeName}</span>
                          {m.categoryName ? (
                            <span className="inline-flex items-center gap-1">
                              <svg width="6" height="6" viewBox="0 0 6 6" aria-hidden>
                                <circle cx="3" cy="3" r="3" fill={m.categoryColor ?? "var(--muted)"} />
                              </svg>
                              {m.categoryName}
                            </span>
                          ) : null}
                          {m.attachmentCount ? (
                            <span className="inline-flex items-center gap-0.5" title="Con comprobante">
                              <Paperclip className="h-3 w-3" aria-label="Con comprobante" />
                              {m.attachmentCount}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden py-3 pr-4 align-top text-text-2 md:table-cell">{m.kind === "transfer" ? `${m.accountName} → ${m.counterAccountName}` : (m.accountName ?? <span className="text-muted">Sin cuenta</span>)}</td>
                      <td className="hidden py-3 pr-4 align-top lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {m.status !== "completed" ? <Badge tone={m.status === "pending" ? "warning" : "neutral"}>{m.status === "pending" ? "Pendiente" : "Anulado"}</Badge> : null}
                          {m.reconciled ? (
                            <Badge tone="good">
                              <CheckCircle2 className="h-3 w-3" aria-hidden /> Conciliado
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        <Money minor={direction === 0 ? m.amountMinor : BigInt(direction) * m.amountMinor} currency={m.currency} locale={locale} signed={direction !== 0} tone={direction > 0 ? "income" : undefined} className="font-semibold" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav className="flex items-center justify-between border-t border-border px-5 py-3 text-[13px]" aria-label="Paginación">
            <span className="text-muted">
              Página {result.page} de {pages}
            </span>
            <div className="flex gap-1">
              {result.page > 1 ? (
                <Link href={pageHref(result.page - 1)} className={buttonClass("secondary", "sm")}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
                </Link>
              ) : null}
              {result.page < pages ? (
                <Link href={pageHref(result.page + 1)} className={buttonClass("secondary", "sm")}>
                  Siguiente <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </Card>
    </>
  );
}
