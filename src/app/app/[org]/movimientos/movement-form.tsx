"use client";

import { Paperclip } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { KIND_INFO, type MovementKind } from "@/lib/movement-kinds";
import { createMovementAction, updateMovementAction } from "./actions";

export interface MovementFormOptions {
  types: Array<{ id: string; name: string; baseKind: MovementKind }>;
  categories: Array<{ id: string; name: string; scope: "income" | "expense" | "both" }>;
  accounts: Array<{ id: string; name: string; currency: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
  sectors: Array<{ id: string; name: string }>;
}

export interface MovementDefaults {
  id?: string;
  version?: number;
  typeId?: string;
  occurredOn: string;
  amount?: string;
  categoryId?: string | null;
  accountId?: string | null;
  counterAccountId?: string | null;
  sectorId?: string | null;
  paymentMethodId?: string | null;
  description?: string;
  notes?: string | null;
  reference?: string | null;
  status?: string;
}

const GROUPS: Array<{ label: string; kinds: MovementKind[] }> = [
  { label: "Operaciones", kinds: ["income", "expense"] },
  { label: "Devoluciones", kinds: ["refund_in", "refund_out"] },
  { label: "Entre cuentas y ajustes", kinds: ["transfer", "adjustment_in", "adjustment_out"] },
  { label: "Inversión y socios", kinds: ["investment", "contribution", "withdrawal"] },
];

export function MovementForm({ org, options, defaults, mode, canAttach }: { org: string; options: MovementFormOptions; defaults: MovementDefaults; mode: "create" | "edit"; canAttach: boolean }) {
  const [state, action] = useActionState(mode === "create" ? createMovementAction : updateMovementAction, { ok: false } as FormState);
  const [typeId, setTypeId] = useState(defaults.typeId ?? options.types.find((t) => t.baseKind === "expense")?.id ?? options.types[0]?.id ?? "");
  const kind = options.types.find((t) => t.id === typeId)?.baseKind ?? "expense";
  const info = KIND_INFO[kind];
  const categories = useMemo(() => options.categories.filter((c) => !info.categoryScope || c.scope === "both" || c.scope === info.categoryScope), [options.categories, info.categoryScope]);
  const err = (name: string) => fieldError(state, name);

  return (
    <form action={action} className="space-y-6" noValidate>
      <input type="hidden" name="org" value={org} />
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {defaults.version ? <input type="hidden" name="version" value={defaults.version} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="typeId" error={err("typeId")}>
          <Select id="typeId" name="typeId" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {options.types
                  .filter((t) => g.kinds.includes(t.baseKind))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Fecha" htmlFor="occurredOn" error={err("occurredOn")}>
          <Input id="occurredOn" name="occurredOn" type="date" defaultValue={defaults.occurredOn} required />
        </Field>
        <Field label="Importe" htmlFor="amount" error={err("amount")} hint={info.direction === 0 ? "Sale de la cuenta de origen y entra en la de destino." : info.direction > 0 ? "Suma al saldo." : "Resta del saldo."}>
          <Input id="amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="0,00" defaultValue={defaults.amount} required className="text-[16px] font-semibold tabular" />
        </Field>
        {info.categoryScope ? (
          <Field label="Categoría" htmlFor="categoryId" error={err("categoryId")}>
            <Select id="categoryId" name="categoryId" defaultValue={defaults.categoryId ?? ""}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="categoryId" value="" />
        )}
        <Field label={kind === "transfer" ? "Cuenta de origen" : "Cuenta o caja"} htmlFor="accountId" error={err("accountId")}>
          <Select id="accountId" name="accountId" defaultValue={defaults.accountId ?? ""}>
            {kind !== "transfer" ? <option value="">Sin cuenta asignada</option> : <option value="">Elegí una cuenta</option>}
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </Select>
        </Field>
        {kind === "transfer" ? (
          <Field label="Cuenta de destino" htmlFor="counterAccountId" error={err("counterAccountId")}>
            <Select id="counterAccountId" name="counterAccountId" defaultValue={defaults.counterAccountId ?? ""}>
              <option value="">Elegí una cuenta</option>
              {options.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Medio de pago" htmlFor="paymentMethodId">
            <Select id="paymentMethodId" name="paymentMethodId" defaultValue={defaults.paymentMethodId ?? ""}>
              <option value="">Sin especificar</option>
              {options.paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Descripción" htmlFor="description" error={err("description")} className="sm:col-span-2">
          <Input id="description" name="description" defaultValue={defaults.description} maxLength={500} placeholder="Ej.: Pago de internet de noviembre" />
        </Field>
      </div>

      <details className="rounded-xl border border-border px-4 py-3" open={Boolean(defaults.notes || defaults.reference || defaults.sectorId || (defaults.status && defaults.status !== "completed"))}>
        <summary className="cursor-pointer text-[14px] font-semibold">Más detalles</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Estado" htmlFor="status" hint="Solo los realizados cuentan en saldos y reportes.">
            <Select id="status" name="status" defaultValue={defaults.status ?? "completed"}>
              <option value="completed">Realizado</option>
              <option value="pending">Pendiente</option>
              <option value="cancelled">Anulado</option>
            </Select>
          </Field>
          <Field label="Sector" htmlFor="sectorId">
            <Select id="sectorId" name="sectorId" defaultValue={defaults.sectorId ?? ""}>
              <option value="">Sin sector</option>
              {options.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comprobante o referencia" htmlFor="reference">
            <Input id="reference" name="reference" defaultValue={defaults.reference ?? ""} maxLength={120} placeholder="Factura B 0001-00001234" />
          </Field>
          <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
            <Textarea id="notes" name="notes" defaultValue={defaults.notes ?? ""} maxLength={4000} />
          </Field>
        </div>
      </details>

      {mode === "create" && canAttach ? (
        <Field label="Adjuntar comprobante (opcional)" htmlFor="attachment" hint="PDF o imagen, hasta 10 MB. Se guarda de forma privada.">
          <label htmlFor="attachment" className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3 py-3 text-sm text-text-2 hover:bg-surface-2">
            <Paperclip className="h-4 w-4 text-muted" aria-hidden />
            <input id="attachment" name="attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" className="w-full text-[13px] file:hidden" />
          </label>
        </Field>
      ) : null}

      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="lg" pendingLabel="Guardando…">
          {mode === "create" ? "Guardar movimiento" : "Guardar cambios"}
        </SubmitButton>
        {mode === "create" ? (
          <SubmitButton size="lg" variant="secondary" name="intent" value="another" pendingLabel="Guardando…">
            Guardar y cargar otro
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
