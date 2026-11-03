"use client";

import { FileSpreadsheet } from "lucide-react";
import { useActionState } from "react";
import { Field, Input, Select, scrollable } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { KIND_INFO, MOVEMENT_KINDS } from "@/lib/movement-kinds";
import { commitImportAction, excludeImportRowAction, saveImportSettingsAction, updateImportRowAction, uploadImportAction } from "./actions";

const initial: FormState = { ok: false };

export function UploadForm({ org, currencies, defaultCurrency }: { org: string; currencies: readonly string[]; defaultCurrency: string }) {
  const [state, action] = useActionState(uploadImportAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="org" value={org} />
      <label htmlFor="file" className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border-strong px-6 py-10 text-center hover:border-accent hover:bg-accent-soft/40">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <FileSpreadsheet className="h-6 w-6" aria-hidden />
        </span>
        <span className="text-[15px] font-semibold">Elegí tu planilla (.xlsx, hasta 5 MB)</span>
        <span className="text-[13px] text-muted">Excel o Google Sheets → Descargar → Microsoft Excel. Se guarda una copia privada del original.</span>
        <input id="file" name="file" type="file" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-2 max-w-full text-[13px]" />
      </label>
      <Field label="Moneda de los importes" htmlFor="currency" hint="La planilla no indica la moneda: confirmala.">
        <Select id="currency" name="currency" defaultValue={defaultCurrency} className="sm:max-w-xs">
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingLabel="Analizando la planilla…">
        Analizar planilla
      </SubmitButton>
    </form>
  );
}

export function SettingsForm({ org, batchId, mapping, categories, accounts, defaultAccountId, disabled }: { org: string; batchId: string; mapping: Array<{ label: string; suggestedName: string; categoryId: string | null; count: number; kinds: string[] }>; categories: Array<{ id: string; name: string; scope: string }>; accounts: Array<{ id: string; name: string }>; defaultAccountId: string | null; disabled: boolean }) {
  const [state, action] = useActionState(saveImportSettingsAction, initial);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="batchId" value={batchId} />
      <div className="overflow-x-auto" {...scrollable("Categorías de la planilla")}>
        <table className="w-full min-w-[520px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-border text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">
              <th className="py-2 pr-4">En la planilla</th>
              <th className="py-2 pr-4">Filas</th>
              <th className="py-2">Categoría en la plataforma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mapping.map((m) => (
              <tr key={m.label}>
                <td className="py-2.5 pr-4 font-medium">
                  «{m.label}»
                  <span className="block text-[12px] font-normal text-muted">{m.kinds.map((k) => KIND_INFO[k as keyof typeof KIND_INFO]?.label ?? k).join(" y ")}</span>
                </td>
                <td className="py-2.5 pr-4 text-text-2 tabular">{m.count}</td>
                <td className="py-2.5">
                  <Select name={`map:${m.label}`} defaultValue={m.categoryId ?? "__new"} disabled={disabled} aria-label={`Categoría para ${m.label}`}>
                    <option value="__new">Crear «{m.suggestedName}»</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        Usar «{c.name}»
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Field label="Cuenta o caja de destino" htmlFor="defaultAccountId" hint="La planilla no indica cuentas. Si no elegís una, los movimientos quedan «sin cuenta asignada» (no se inventa el dato).">
        <Select id="defaultAccountId" name="defaultAccountId" defaultValue={defaultAccountId ?? ""} disabled={disabled} className="sm:max-w-sm">
          <option value="">Sin cuenta asignada</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormMessage state={state} />
      {!disabled ? (
        <SubmitButton variant="secondary" pendingLabel="Guardando…">
          Guardar mapeo
        </SubmitButton>
      ) : null}
    </form>
  );
}

export function RowEditForm({ org, batchId, row }: { org: string; batchId: string; row: { id: string; occurredOn: string | null; kind: string | null; amount: string; categoryLabel: string | null; description: string } }) {
  const [state, action] = useActionState(updateImportRowAction, initial);
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={row.id} />
      <Field label="Fecha" htmlFor={`d-${row.id}`} error={fieldError(state, "occurredOn")}>
        <Input id={`d-${row.id}`} name="occurredOn" type="date" defaultValue={row.occurredOn ?? ""} />
      </Field>
      <Field label="Tipo" htmlFor={`k-${row.id}`}>
        <Select id={`k-${row.id}`} name="kind" defaultValue={row.kind ?? ""}>
          <option value="">Elegí…</option>
          {MOVEMENT_KINDS.filter((k) => k !== "transfer").map((k) => (
            <option key={k} value={k}>
              {KIND_INFO[k].label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Importe" htmlFor={`a-${row.id}`} error={fieldError(state, "amount")}>
        <Input id={`a-${row.id}`} name="amount" inputMode="decimal" defaultValue={row.amount} className="tabular" />
      </Field>
      <Field label="Categoría (etiqueta)" htmlFor={`c-${row.id}`}>
        <Input id={`c-${row.id}`} name="categoryLabel" defaultValue={row.categoryLabel ?? ""} />
      </Field>
      <Field label="Descripción" htmlFor={`t-${row.id}`} className="sm:col-span-2 lg:col-span-4">
        <Input id={`t-${row.id}`} name="description" defaultValue={row.description} />
      </Field>
      <div className="flex items-end">
        <SubmitButton size="md" pendingLabel="Guardando…">
          Guardar
        </SubmitButton>
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ExcludeForm({ org, batchId, rowId, excluded }: { org: string; batchId: string; rowId: string; excluded: boolean }) {
  const [state, action] = useActionState(excludeImportRowAction, initial);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowId" value={rowId} />
      <input type="hidden" name="exclude" value={excluded ? "0" : "1"} />
      {!excluded ? (
        <Field label="Motivo para excluir (queda en el informe)" htmlFor={`r-${rowId}`} className="min-w-64 flex-1" error={fieldError(state, "reason")}>
          <Input id={`r-${rowId}`} name="reason" placeholder="Ej.: fila sin importe, se carga aparte" />
        </Field>
      ) : null}
      <SubmitButton variant={excluded ? "secondary" : "ghost"} pendingLabel="…">
        {excluded ? "Volver a incluir" : "Excluir fila"}
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CommitForm({ org, batchId, blocked, toImport }: { org: string; batchId: string; blocked: number; toImport: number }) {
  const [state, action] = useActionState(commitImportAction, initial);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="batchId" value={batchId} />
      <FormMessage state={state} />
      <SubmitButton size="lg" pendingLabel="Importando y conciliando…" className={blocked ? "pointer-events-none opacity-50" : undefined}>
        Confirmar importación de {toImport} movimientos
      </SubmitButton>
      {blocked ? <p className="text-[13px] text-critical">Quedan {blocked} fila(s) con errores: corregilas o excluilas para poder confirmar.</p> : null}
    </form>
  );
}
