"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { createBudgetAction } from "./actions";

export function BudgetForm({ org, currencies, categories, sectors, today }: { org: string; currencies: string[]; categories: Array<{ id: string; name: string }>; sectors: Array<{ id: string; name: string }>; today: string }) {
  const [state, action] = useActionState(createBudgetAction, { ok: false } as FormState);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Nombre" htmlFor="b-name" error={fieldError(state, "name")}>
          <Input id="b-name" name="name" required placeholder="Ej.: Servicios del mes" />
        </Field>
        <Field label="Período" htmlFor="b-period">
          <Select id="b-period" name="period" defaultValue="monthly">
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
          </Select>
        </Field>
        <Field label="Monto" htmlFor="b-amount" error={fieldError(state, "amount")}>
          <Input id="b-amount" name="amount" inputMode="decimal" required placeholder="0,00" className="tabular" />
        </Field>
        <Field label="Moneda" htmlFor="b-currency">
          <Select id="b-currency" name="currency" defaultValue={currencies[0]}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Categoría" htmlFor="b-category" error={fieldError(state, "categoryId")}>
          <Select id="b-category" name="categoryId" defaultValue="">
            <option value="">Toda la empresa</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sector" htmlFor="b-sector">
          <Select id="b-sector" name="sectorId" defaultValue="">
            <option value="">Todos</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Avisar al llegar al (%)" htmlFor="b-threshold" hint="Entre 1 y 100. También avisamos al superarlo.">
          <Input id="b-threshold" name="alertThresholdPct" type="number" min={1} max={100} defaultValue={80} />
        </Field>
        <Field label="Vigente desde" htmlFor="b-start">
          <Input id="b-start" name="startsOn" type="date" defaultValue={`${today.slice(0, 7)}-01`} required />
        </Field>
        <Field label="Hasta (opcional)" htmlFor="b-end" error={fieldError(state, "endsOn")}>
          <Input id="b-end" name="endsOn" type="date" />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creando…">Crear presupuesto</SubmitButton>
    </form>
  );
}
