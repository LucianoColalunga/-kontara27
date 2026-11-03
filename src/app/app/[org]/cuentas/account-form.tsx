"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { saveAccountAction } from "./actions";

export const ACCOUNT_TYPE_LABELS: Record<string, string> = { cash: "Caja / efectivo", bank: "Cuenta bancaria", wallet: "Billetera virtual", credit_card: "Tarjeta de crédito", investment: "Inversiones", other: "Otra" };

export function AccountForm({ org, currencies, defaults }: { org: string; currencies: string[]; defaults?: { id: string; name: string; type: string; currency: string; openingBalance: string; institution: string | null; numberLast4: string | null; locked: boolean } }) {
  const [state, action] = useActionState(saveAccountAction, { ok: false } as FormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={`name-${defaults?.id ?? "new"}`} error={fieldError(state, "name")}>
          <Input id={`name-${defaults?.id ?? "new"}`} name="name" defaultValue={defaults?.name} required placeholder="Ej.: Banco Nación" />
        </Field>
        <Field label="Tipo" htmlFor={`type-${defaults?.id ?? "new"}`}>
          <Select id={`type-${defaults?.id ?? "new"}`} name="type" defaultValue={defaults?.type ?? "bank"}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Moneda" htmlFor={`currency-${defaults?.id ?? "new"}`} hint={defaults?.locked ? "Tiene movimientos: la moneda no se puede cambiar." : undefined}>
          <Select id={`currency-${defaults?.id ?? "new"}`} name="currency" defaultValue={defaults?.currency ?? currencies[0]} disabled={defaults?.locked}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          {defaults?.locked ? <input type="hidden" name="currency" value={defaults.currency} /> : null}
        </Field>
        <Field label="Saldo inicial" htmlFor={`opening-${defaults?.id ?? "new"}`} error={fieldError(state, "openingBalance")} hint="Lo que había antes del primer movimiento registrado.">
          <Input id={`opening-${defaults?.id ?? "new"}`} name="openingBalance" inputMode="decimal" defaultValue={defaults?.openingBalance ?? "0"} className="tabular" />
        </Field>
        <Field label="Entidad (opcional)" htmlFor={`inst-${defaults?.id ?? "new"}`}>
          <Input id={`inst-${defaults?.id ?? "new"}`} name="institution" defaultValue={defaults?.institution ?? ""} placeholder="Banco, billetera…" />
        </Field>
        <Field label="Últimos 4 dígitos (opcional)" htmlFor={`last4-${defaults?.id ?? "new"}`} error={fieldError(state, "numberLast4")} hint="Nunca guardamos el número completo.">
          <Input id={`last4-${defaults?.id ?? "new"}`} name="numberLast4" inputMode="numeric" maxLength={4} defaultValue={defaults?.numberLast4 ?? ""} />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Guardando…">{defaults ? "Guardar cambios" : "Crear cuenta"}</SubmitButton>
    </form>
  );
}
