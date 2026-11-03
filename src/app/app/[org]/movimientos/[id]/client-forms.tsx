"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useActionState, useRef } from "react";
import { Button, Field, Input } from "@/components/ui/primitives";
import { FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { deleteMovementAction, uploadAttachmentAction } from "../actions";

export function DeleteMovementForm({ org, id }: { org: string; id: string }) {
  const [state, action] = useActionState(deleteMovementAction, { ok: false } as FormState);
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" variant="ghost" className="text-critical" onClick={() => dialog.current?.showModal()}>
        <Trash2 className="h-4 w-4" aria-hidden /> Eliminar
      </Button>
      <dialog ref={dialog} className="card m-auto w-[min(92vw,440px)] p-0 text-text backdrop:bg-black/40" aria-labelledby="delete-title">
        <form action={action} className="space-y-4 p-6">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="id" value={id} />
          <h2 id="delete-title" className="text-[17px] font-semibold">
            Eliminar movimiento
          </h2>
          <p className="text-sm text-text-2">Deja de contar en saldos y reportes. Queda en el historial y un usuario con permiso puede restaurarlo.</p>
          <Field label="Motivo" htmlFor="reason" error={state.fieldErrors?.reason}>
            <Input id="reason" name="reason" required minLength={3} maxLength={300} placeholder="Ej.: cargado dos veces" autoFocus />
          </Field>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancelar
            </Button>
            <SubmitButton variant="danger" pendingLabel="Eliminando…">
              Eliminar
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function UploadAttachmentForm({ org, id }: { org: string; id: string }) {
  const [state, action] = useActionState(uploadAttachmentAction, { ok: false } as FormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="org" value={org} />
      <input type="hidden" name="id" value={id} />
      <label htmlFor="attachment" className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-3 py-3 text-sm text-text-2 hover:bg-surface-2">
        <Paperclip className="h-4 w-4 text-muted" aria-hidden />
        <input id="attachment" name="attachment" type="file" required accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" className="w-full text-[13px]" aria-label="Archivo del comprobante" />
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" size="sm" pendingLabel="Subiendo…">
        Adjuntar
      </SubmitButton>
    </form>
  );
}
