"use client";

import { useActionState, useState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { createOrganizationAction } from "./actions";

interface Option {
  code: string;
  name: string;
  timezone: string;
  currency: string;
}

export function OrganizationForm({ countries, currencies, timezones, taxIdTypes }: { countries: Option[]; currencies: readonly string[]; timezones: string[]; taxIdTypes: readonly string[] }) {
  const [state, action] = useActionState(createOrganizationAction, { ok: false } as FormState);
  const [country, setCountry] = useState("AR");
  const suggested = countries.find((c) => c.code === country) ?? countries[0]!;
  return (
    <form action={action} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial" htmlFor="name" error={fieldError(state, "name")} className="sm:col-span-2">
          <Input id="name" name="name" required autoFocus placeholder="Ej.: Taller Norte" />
        </Field>
        <Field label="Razón social (opcional)" htmlFor="legalName" className="sm:col-span-2">
          <Input id="legalName" name="legalName" placeholder="Ej.: Taller Norte S.R.L." />
        </Field>
        <Field label="País" htmlFor="country" error={fieldError(state, "country")}>
          <Select id="country" name="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda principal" htmlFor="currency" error={fieldError(state, "currency")}>
          <Select id="currency" name="currency" key={`cur-${country}`} defaultValue={suggested.currency}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Zona horaria" htmlFor="timezone" error={fieldError(state, "timezone")} className="sm:col-span-2" hint="Define qué día es «hoy» para los reportes y los vencimientos.">
          <Select id="timezone" name="timezone" key={`tz-${country}`} defaultValue={suggested.timezone}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Identificación fiscal" htmlFor="taxIdType">
          <Select id="taxIdType" name="taxIdType" defaultValue={country === "AR" ? "CUIT" : ""}>
            <option value="">Sin identificación</option>
            {taxIdTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Número" htmlFor="taxId" error={fieldError(state, "taxId")} hint="Se guarda cifrado.">
          <Input id="taxId" name="taxId" inputMode="numeric" placeholder={country === "AR" ? "30-12345678-9" : ""} />
        </Field>
      </div>
      <details className="rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer text-[14px] font-semibold">Dirección (opcional)</summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Calle y número" htmlFor="street" className="sm:col-span-2">
            <Input id="street" name="street" autoComplete="street-address" />
          </Field>
          <Field label="Ciudad" htmlFor="city">
            <Input id="city" name="city" autoComplete="address-level2" />
          </Field>
          <Field label="Provincia o estado" htmlFor="region">
            <Input id="region" name="region" autoComplete="address-level1" />
          </Field>
          <Field label="Código postal" htmlFor="postalCode">
            <Input id="postalCode" name="postalCode" autoComplete="postal-code" />
          </Field>
        </div>
      </details>
      <label className="flex items-start gap-2.5 text-[14px] text-text-2">
        <input type="checkbox" name="seedCategories" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          Crear categorías sugeridas (ventas, proveedores, sueldos, servicios…). <span className="text-muted">Si vas a importar tu planilla, podés desmarcarlo y usar las tuyas.</span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Creando empresa…">
        Crear empresa
      </SubmitButton>
    </form>
  );
}
