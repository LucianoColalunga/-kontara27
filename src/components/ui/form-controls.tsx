"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button, Callout } from "./primitives";

export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: Record<string, unknown>;
}

/** Botón de envío con estado de carga (deshabilitado mientras la acción corre). */
export function SubmitButton({ children, pendingLabel, variant = "primary", size = "md", className, name, value }: { children: React.ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "ghost" | "danger" | "ink"; size?: "sm" | "md" | "lg"; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** Mensaje de resultado de un formulario; se anuncia a lectores de pantalla. */
export function FormMessage({ state, successMessage }: { state: FormState; successMessage?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.message && !state.ok) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state]);
  if (!state.message && !(state.ok && successMessage)) return null;
  return (
    <div ref={ref} aria-live="polite">
      <Callout tone={state.ok ? "good" : "critical"}>{state.ok ? (state.message ?? successMessage) : state.message}</Callout>
    </div>
  );
}

export function fieldError(state: FormState, name: string): string | undefined {
  return state.fieldErrors?.[name];
}
