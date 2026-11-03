"use client";

import { useActionState, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { completeReminderAction, createReminderAction } from "./actions";

const initial: FormState = { ok: false };
export const REMINDER_KINDS: Record<string, string> = { rent: "Alquiler", utility: "Servicio", tax: "Impuesto", supplier: "Proveedor", recurring_payment: "Pago recurrente", receivable: "Cobro pendiente", other: "Otro" };

type Option = { id: string; name: string };

export function ReminderForm({ org, currencies, categories, accounts, today }: { org: string; currencies: string[]; categories: Option[]; accounts: Option[]; today: string }) {
  const [state, action] = useActionState(createReminderAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Qué vence" htmlFor="r-title" error={fieldError(state, "title")} className="lg:col-span-2">
          <Input id="r-title" name="title" required placeholder="Ej.: Alquiler del local" />
        </Field>
        <Field label="Tipo" htmlFor="r-kind">
          <Select id="r-kind" name="kind" defaultValue="utility">
            {Object.entries(REMINDER_KINDS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha de vencimiento" htmlFor="r-due" error={fieldError(state, "dueOn")}>
          <Input id="r-due" name="dueOn" type="date" defaultValue={today} required />
        </Field>
        <Field label="Importe estimado (opcional)" htmlFor="r-amount" error={fieldError(state, "amount")}>
          <Input id="r-amount" name="amount" inputMode="decimal" placeholder="0,00" className="tabular" />
        </Field>
        <Field label="Moneda" htmlFor="r-currency">
          <Select id="r-currency" name="currency" defaultValue={currencies[0]}>
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Se repite" htmlFor="r-rec">
          <Select id="r-rec" name="recurrence" defaultValue="monthly">
            <option value="none">No se repite</option>
            <option value="weekly">Cada semana</option>
            <option value="monthly">Cada mes</option>
            <option value="quarterly">Cada trimestre</option>
            <option value="yearly">Cada año</option>
          </Select>
        </Field>
        <Field label="Hasta (opcional)" htmlFor="r-until">
          <Input id="r-until" name="recurrenceUntil" type="date" />
        </Field>
        <Field label="Avisar con (días de anticipación)" htmlFor="r-notify">
          <Input id="r-notify" name="notifyDaysBefore" type="number" min={0} max={60} defaultValue={3} />
        </Field>
        <Field label="Categoría" htmlFor="r-cat">
          <Select id="r-cat" name="categoryId" defaultValue="">
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cuenta" htmlFor="r-acc">
          <Select id="r-acc" name="accountId" defaultValue="">
            <option value="">Sin cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notas" htmlFor="r-notes" className="sm:col-span-2 lg:col-span-3">
          <Textarea id="r-notes" name="notes" className="min-h-16" />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Agendando…">Agendar vencimiento</SubmitButton>
    </form>
  );
}

export function CompleteReminderForm({ org, reminder, accounts, today, canCreateMovement }: { org: string; reminder: { id: string; title: string; direction: string; amount: string; categoryId: string | null; accountId: string | null }; accounts: Option[]; today: string; canCreateMovement: boolean }) {
  const [state, action] = useActionState(completeReminderAction, initial);
  const [register, setRegister] = useState(canCreateMovement);
  return (
    <form action={action} className="space-y-3 rounded-xl bg-surface-2 p-4">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="id" value={reminder.id} />
      <input type="hidden" name="title" value={reminder.title} />
      <input type="hidden" name="direction" value={reminder.direction} />
      <input type="hidden" name="categoryId" value={reminder.categoryId ?? ""} />
      {canCreateMovement ? (
        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" name="registerMovement" checked={register} onChange={(e) => setRegister(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Registrar el {reminder.direction === "receivable" ? "cobro" : "pago"} como movimiento
        </label>
      ) : null}
      {register ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Fecha" htmlFor={`paid-${reminder.id}`}>
            <Input id={`paid-${reminder.id}`} name="paidOn" type="date" defaultValue={today} required />
          </Field>
          <Field label="Importe" htmlFor={`amt-${reminder.id}`} error={fieldError(state, "amount")}>
            <Input id={`amt-${reminder.id}`} name="amount" inputMode="decimal" defaultValue={reminder.amount} required className="tabular" />
          </Field>
          <Field label="Cuenta" htmlFor={`acc-${reminder.id}`}>
            <Select id={`acc-${reminder.id}`} name="accountId" defaultValue={reminder.accountId ?? ""}>
              <option value="">Sin cuenta</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : null}
      <FormMessage state={state} />
      <SubmitButton size="sm" pendingLabel="Guardando…">
        Marcar como {reminder.direction === "receivable" ? "cobrado" : "pagado"}
      </SubmitButton>
    </form>
  );
}
