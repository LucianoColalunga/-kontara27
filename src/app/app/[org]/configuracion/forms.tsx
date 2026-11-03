"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { KIND_INFO, MOVEMENT_KINDS } from "@/lib/movement-kinds";
import { archiveCategoryAction, createCatalogItemAction, deleteCategoryAction, saveCategoryAction, updateOrganizationAction, uploadLogoAction } from "./actions";

const initial: FormState = { ok: false };
const SCOPES = { income: "Ingresos", expense: "Gastos", both: "Ingresos y gastos" };

export interface OrganizationValues {
  name: string;
  legalName: string | null;
  taxIdType: string | null;
  taxId: string | null;
  country: string;
  currency: string;
  timezone: string;
  fiscalYearStartMonth: number;
  address: { street?: string; city?: string; region?: string; postalCode?: string } | null;
}

export function OrganizationSettingsForm({ org, values, countries, currencies, timezones, taxIdTypes }: { org: string; values: OrganizationValues; countries: Array<{ code: string; name: string }>; currencies: readonly string[]; timezones: string[]; taxIdTypes: readonly string[] }) {
  const [state, action] = useActionState(updateOrganizationAction, initial);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial" htmlFor="o-name" error={fieldError(state, "name")}>
          <Input id="o-name" name="name" defaultValue={values.name} required />
        </Field>
        <Field label="Razón social" htmlFor="o-legal">
          <Input id="o-legal" name="legalName" defaultValue={values.legalName ?? ""} />
        </Field>
        <Field label="Identificación fiscal" htmlFor="o-taxtype">
          <Select id="o-taxtype" name="taxIdType" defaultValue={values.taxIdType ?? ""}>
            <option value="">Sin identificación</option>
            {taxIdTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Número" htmlFor="o-tax" error={fieldError(state, "taxId")} hint="Se guarda cifrado; solo lo ven quienes editan la empresa.">
          <Input id="o-tax" name="taxId" defaultValue={values.taxId ?? ""} />
        </Field>
        <Field label="País" htmlFor="o-country">
          <Select id="o-country" name="country" defaultValue={values.country}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda principal" htmlFor="o-currency" hint="Cambiarla no convierte los movimientos existentes: cada uno conserva su moneda.">
          <Select id="o-currency" name="currency" defaultValue={values.currency}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Zona horaria" htmlFor="o-tz">
          <Select id="o-tz" name="timezone" defaultValue={values.timezone}>
            {[...new Set([values.timezone, ...timezones])].map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Inicio del ejercicio" htmlFor="o-fy">
          <Select id="o-fy" name="fiscalYearStartMonth" defaultValue={String(values.fiscalYearStartMonth)}>
            {months.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Calle y número" htmlFor="o-street">
          <Input id="o-street" name="street" defaultValue={values.address?.street ?? ""} />
        </Field>
        <Field label="Ciudad" htmlFor="o-city">
          <Input id="o-city" name="city" defaultValue={values.address?.city ?? ""} />
        </Field>
        <Field label="Provincia o estado" htmlFor="o-region">
          <Input id="o-region" name="region" defaultValue={values.address?.region ?? ""} />
        </Field>
        <Field label="Código postal" htmlFor="o-zip">
          <Input id="o-zip" name="postalCode" defaultValue={values.address?.postalCode ?? ""} />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">Guardar datos</SubmitButton>
    </form>
  );
}

export function LogoForm({ org }: { org: string }) {
  const [state, action] = useActionState(uploadLogoAction, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={org} />
      <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required aria-label="Logo de la empresa" className="py-2" />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Subiendo…">
        Subir logo (PNG, JPG o WEBP, hasta 2 MB)
      </SubmitButton>
    </form>
  );
}

export function CategoryForm({ org, category }: { org: string; category?: { id: string; name: string; scope: string; color: string | null } }) {
  const [state, action] = useActionState(saveCategoryAction, initial);
  const key = category?.id ?? "new";
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] sm:items-end">
      <input type="hidden" name="org" value={org} />
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <Field label="Nombre" htmlFor={`cn-${key}`} error={fieldError(state, "name")}>
        <Input id={`cn-${key}`} name="name" defaultValue={category?.name} required />
      </Field>
      <Field label="Se usa en" htmlFor={`cs-${key}`}>
        <Select id={`cs-${key}`} name="scope" defaultValue={category?.scope ?? "both"}>
          {Object.entries(SCOPES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Color" htmlFor={`cc-${key}`}>
        <Input id={`cc-${key}`} name="color" type="color" defaultValue={category?.color ?? "#2a78d6"} className="h-10 w-16 p-1" />
      </Field>
      <SubmitButton variant={category ? "secondary" : "primary"} pendingLabel="…">
        {category ? "Guardar" : "Agregar"}
      </SubmitButton>
      <div className="sm:col-span-4">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CategoryDangerZone({ org, category, others }: { org: string; category: { id: string; isArchived: boolean; movementCount: number }; others: Array<{ id: string; name: string }> }) {
  const [archiveState, archiveAction] = useActionState(archiveCategoryAction, initial);
  const [deleteState, deleteAction] = useActionState(deleteCategoryAction, initial);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-2 p-3">
      <form action={archiveAction}>
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="archived" value={category.isArchived ? "0" : "1"} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="…">
          {category.isArchived ? "Reactivar" : "Archivar"}
        </SubmitButton>
      </form>
      <form action={deleteAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="org" value={org} />
        <input type="hidden" name="id" value={category.id} />
        {category.movementCount > 0 ? (
          <Field label={`Pasar sus ${category.movementCount} movimientos a`} htmlFor={`re-${category.id}`} error={fieldError(deleteState, "reassignTo")}>
            <Select id={`re-${category.id}`} name="reassignTo" defaultValue="">
              <option value="">Elegí una categoría</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <SubmitButton variant="ghost" size="sm" className="text-critical" pendingLabel="Eliminando…">
          Eliminar
        </SubmitButton>
      </form>
      <div className="w-full">
        <FormMessage state={deleteState.message ? deleteState : archiveState} />
      </div>
    </div>
  );
}

export function CatalogItemForm({ org, kind, label }: { org: string; kind: "type" | "sector" | "payment"; label: string }) {
  const [state, action] = useActionState(createCatalogItemAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="kind" value={kind} />
      <Field label={label} htmlFor={`new-${kind}`} className="min-w-48 flex-1">
        <Input id={`new-${kind}`} name="name" required />
      </Field>
      {kind === "type" ? (
        <Field label="Se comporta como" htmlFor="new-type-kind">
          <Select id="new-type-kind" name="baseKind" defaultValue="income">
            {MOVEMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_INFO[k].label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <SubmitButton variant="secondary" pendingLabel="…">
        Agregar
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
