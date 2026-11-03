"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { loginAction, mfaAction, registerAction, requestResetAction, resendVerificationAction, resetPasswordAction, verifyEmailAction } from "./actions";

const initial: FormState = { ok: false };

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <Field label="Correo electrónico" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/recuperar" className="text-[13px] font-semibold text-accent hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Verificando…">
        Ingresar
      </SubmitButton>
    </form>
  );
}

export function MfaForm({ next }: { next: string }) {
  const [state, action] = useActionState(mfaAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Código de 6 dígitos o código de recuperación" htmlFor="code" error={fieldError(state, "code")}>
        <Input id="code" name="code" autoComplete="one-time-code" inputMode="text" required autoFocus className="text-center text-lg tracking-[0.3em]" maxLength={11} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Verificando…">
        Verificar
      </SubmitButton>
    </form>
  );
}

export function RegisterForm({ countries }: { countries: Array<{ code: string; name: string }> }) {
  const [state, action] = useActionState(registerAction, initial);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Nombre y apellido" htmlFor="name" error={fieldError(state, "name")}>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Correo electrónico" htmlFor="email" error={fieldError(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={fieldError(state, "password")} hint="Al menos 10 caracteres. Una frase es más segura y fácil de recordar.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Repetí la contraseña" htmlFor="confirm" error={fieldError(state, "confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="País de residencia" htmlFor="country" hint="Define qué normativa de privacidad te aplica. No usamos tu IP para esto.">
        <Select id="country" name="country" defaultValue="AR">
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2.5 text-[13px] text-text-2">
        <input type="checkbox" name="terms" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" required />
        <span>
          Acepto los <Link href="/legal/terminos" className="font-semibold text-accent hover:underline">términos</Link> y la{" "}
          <Link href="/legal/privacidad" className="font-semibold text-accent hover:underline">política de privacidad</Link>.
        </span>
      </label>
      {fieldError(state, "acceptTerms") ? <p className="text-[13px] text-critical">{fieldError(state, "acceptTerms")}</p> : null}
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmailAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Confirmando…">
        Confirmar mi correo
      </SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Field label="¿No te llegó? Reenviar a" htmlFor="resend-email">
        <Input id="resend-email" name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" className="w-full" pendingLabel="Enviando…">
        Reenviar correo de confirmación
      </SubmitButton>
    </form>
  );
}

export function RequestResetForm() {
  const [state, action] = useActionState(requestResetAction, initial);
  if (state.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-4">
      <Field label="Correo de tu cuenta" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Enviando…">
        Enviar enlace
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Contraseña nueva" htmlFor="password" error={fieldError(state, "password")} hint="Al menos 10 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} autoFocus />
      </Field>
      <Field label="Repetí la contraseña" htmlFor="confirm" error={fieldError(state, "confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" size="lg" pendingLabel="Guardando…">
        Guardar y cerrar las demás sesiones
      </SubmitButton>
    </form>
  );
}
