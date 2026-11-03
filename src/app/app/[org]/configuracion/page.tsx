import type { Metadata } from "next";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { COUNTRIES, TIMEZONES } from "@/lib/geo";
import { KIND_INFO } from "@/lib/movement-kinds";
import { getServices } from "@/server/container";
import { requireTenant } from "@/server/http/session";
import { can, SUPPORTED_CURRENCIES, TAX_ID_TYPES } from "@/server/modules/tenancy";
import { archiveCatalogItemAction } from "./actions";
import { CatalogItemForm, CategoryDangerZone, CategoryForm, LogoForm, OrganizationSettingsForm } from "./forms";

export const metadata: Metadata = { title: "Configuración" };

const SCOPE_LABEL = { income: "Ingresos", expense: "Gastos", both: "Ambos" } as const;

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { ctx } = await requireTenant(org);
  if (!can(ctx, "org.manage") && !can(ctx, "catalog.manage")) {
    const { redirect } = await import("next/navigation");
    redirect(`/app/${org}?sinpermiso=1`);
  }
  const services = await getServices();
  const [details, categories, types, sectors, payments] = await Promise.all([
    can(ctx, "org.manage") ? services.tenancy.getOrganizationDetails(ctx) : null,
    services.catalog.listCategories(ctx, { includeArchived: true }),
    services.catalog.listMovementTypes(ctx),
    services.catalog.listSectors(ctx),
    services.catalog.listPaymentMethods(ctx),
  ]);
  const slug = ctx.organization.slug;
  const manageCatalog = can(ctx, "catalog.manage");

  return (
    <>
      <PageHeader title="Configuración" description="Datos de la empresa y catálogos: categorías, tipos de movimiento, sectores y medios de pago." />
      <div className="space-y-6">
        {details ? (
          <Card>
            <CardHeader title="Datos de la empresa" />
            <div className="grid grid-cols-1 gap-8 p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <OrganizationSettingsForm
                org={slug}
                values={{ name: details.name, legalName: details.legalName, taxIdType: details.taxIdType, taxId: details.taxId, country: details.country, currency: details.currency, timezone: details.timezone, fiscalYearStartMonth: details.fiscalYearStartMonth, address: details.address }}
                countries={COUNTRIES.map(({ code, name }) => ({ code, name }))}
                currencies={SUPPORTED_CURRENCIES}
                timezones={TIMEZONES}
                taxIdTypes={TAX_ID_TYPES}
              />
              <div>
                <h3 className="mb-2 text-[14px] font-semibold">Logo</h3>
                {details.logoFileId ? <p className="mb-3 text-[13px] text-muted">La empresa ya tiene un logo cargado. Podés reemplazarlo.</p> : <p className="mb-3 text-[13px] text-muted">Aparece en los reportes PDF y en el selector de empresas.</p>}
                <LogoForm org={slug} />
              </div>
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={`Categorías (${categories.filter((c) => !c.isArchived).length})`} description="Una categoría puede servir para ingresos, gastos o ambos. Si tiene movimientos, para eliminarla elegís a dónde pasan; si no, podés archivarla." />
          <ul className="mt-3 divide-y divide-border">
            {categories.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                      <circle cx="5" cy="5" r="5" fill={c.color ?? "var(--muted)"} />
                    </svg>
                    <span className="font-medium">{c.name}</span>
                    <Badge>{SCOPE_LABEL[c.scope]}</Badge>
                    {c.isArchived ? <Badge tone="warning">Archivada</Badge> : null}
                    <span className="ml-auto text-[13px] text-muted">{c.movementCount} movimientos</span>
                  </summary>
                  {manageCatalog ? (
                    <div className="mt-3 space-y-3">
                      <CategoryForm org={slug} category={{ id: c.id, name: c.name, scope: c.scope, color: c.color }} />
                      <CategoryDangerZone org={slug} category={{ id: c.id, isArchived: c.isArchived, movementCount: c.movementCount }} others={categories.filter((o) => o.id !== c.id && !o.isArchived).map((o) => ({ id: o.id, name: o.name }))} />
                    </div>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
          {manageCatalog ? (
            <div className="border-t border-border p-5">
              <CategoryForm org={slug} />
            </div>
          ) : null}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader title="Tipos de movimiento" description="Los tipos propios heredan el comportamiento de un tipo base." />
            <ul className="mt-3 divide-y divide-border">
              {types.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-5 py-2.5 text-[14px]">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  {t.isSystem ? <Badge>Base</Badge> : <span className="text-[12px] text-muted">como {KIND_INFO[t.baseKind].label.toLowerCase()}</span>}
                  {manageCatalog && !t.isSystem ? (
                    <form action={archiveCatalogItemAction}>
                      <input type="hidden" name="org" value={slug} />
                      <input type="hidden" name="kind" value="type" />
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="text-[12px] font-semibold text-muted hover:text-critical">
                        Archivar
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
            {manageCatalog ? (
              <div className="border-t border-border p-5">
                <CatalogItemForm org={slug} kind="type" label="Nuevo tipo" />
              </div>
            ) : null}
          </Card>
          {(
            [
              ["sector", "Sectores", "Áreas o centros de costo, para presupuestos y reportes.", sectors],
              ["payment", "Medios de pago", "Cómo se pagó o cobró cada movimiento.", payments],
            ] as const
          ).map(([kind, title, description, items]) => (
            <Card key={kind}>
              <CardHeader title={title} description={description} />
              <ul className="mt-3 divide-y divide-border">
                {items.length === 0 ? <li className="px-5 py-3 text-sm text-muted">Sin elementos.</li> : null}
                {items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 px-5 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    {manageCatalog ? (
                      <form action={archiveCatalogItemAction}>
                        <input type="hidden" name="org" value={slug} />
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="id" value={i.id} />
                        <button type="submit" className="text-[12px] font-semibold text-muted hover:text-critical">
                          Archivar
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
              {manageCatalog ? (
                <div className="border-t border-border p-5">
                  <CatalogItemForm org={slug} kind={kind} label={kind === "sector" ? "Nuevo sector" : "Nuevo medio de pago"} />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
