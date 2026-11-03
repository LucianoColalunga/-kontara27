"use client";

import { useActionState } from "react";
import { FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { saveConsentAction } from "./actions";

export function ConsentForm({ analytics, marketing }: { analytics: boolean; marketing: boolean }) {
  const [state, action] = useActionState(saveConsentAction, { ok: false } as FormState);
  return (
    <form action={action} className="card mt-4 space-y-4 p-5 text-[14px] text-text">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked disabled className="mt-1 h-4 w-4" aria-describedby="nec-desc" />
        <span>
          <span className="font-semibold">Necesarias</span>
          <span id="nec-desc" className="block text-text-2">Sesión y preferencias. Siempre activas: sin ellas el servicio no funciona.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="analytics" defaultChecked={analytics} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="font-semibold">Análisis</span>
          <span className="block text-text-2">Hoy no se usan. Si se habilitan, servirían para medir el uso de forma agregada.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="marketing" defaultChecked={marketing} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="font-semibold">Publicidad</span>
          <span className="block text-text-2">No se usan y no está previsto usarlas.</span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingLabel="Guardando…">
        Guardar preferencias
      </SubmitButton>
    </form>
  );
}
