"use client";

import { Download, ShieldCheck } from "lucide-react";
import { useActionState } from "react";
import { Button, Callout, Field, Input, Select } from "@/components/ui/primitives";
import { fieldError, FormMessage, type FormState, SubmitButton } from "@/components/ui/form-controls";
import { changePasswordAction, confirmMfaAction, deleteAccountAction, disableMfaAction, exportDataAction, regenerateCodesAction, startMfaAction, updateProfileAction } from "./actions";

const initial: FormState = { ok: false };

export function ProfileForm({ name, country, countries }: { name: string; country: string | null; countries: Array<{ code: string; name: string }> }) {
  const [state, action] = useActionState(updateProfileAction, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nombre y apellido" htmlFor="p-name" error={fieldError(state, "name")}>
          <Input id="p-name" name="name" defaultValue={name} required autoComplete="name" />
        </Field>
        <Field label="País de residencia" htmlFor="p-country" hint="Define qué normativa de privacidad te aplica.">
          <Select id="p-country" name="country" defaultValue={country ?? ""}>
            <option value="">Sin indicar (se aplica el criterio más estricto)</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingLabel="Guardando…">
        Guardar perfil
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Contraseña actual" htmlFor="pw-current" error={fieldError(state, "currentPassword")}>
          <Input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="Nueva" htmlFor="pw-new" error={fieldError(state, "newPassword")}>
          <Input id="pw-new" name="newPassword" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Field label="Repetí la nueva" htmlFor="pw-confirm" error={fieldError(state, "confirm")}>
          <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingLabel="Cambiando…">
        Cambiar contraseña
      </SubmitButton>
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const download = () => {
    const blob = new Blob([`Códigos de recuperación de KONTARA 27\nCada uno sirve una sola vez. Guardalos en un lugar seguro.\n\n${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kontara27-codigos-de-recuperacion.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <Callout tone="warning" title="Guardá estos códigos ahora">
        Se muestran una sola vez. Cada uno sirve para entrar una vez si perdés el teléfono.
      </Callout>
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 font-mono text-[14px] sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={download}>
        <Download className="h-4 w-4" aria-hidden /> Descargar como .txt
      </Button>
    </div>
  );
}

export function MfaSetup() {
  const [start, startAction] = useActionState(startMfaAction, initial);
  const [confirm, confirmAction] = useActionState(confirmMfaAction, initial);
  const codes = confirm.data?.recoveryCodes as string[] | undefined;
  if (codes) return <RecoveryCodes codes={codes} />;
  if (!start.data) {
    return (
      <form action={startAction} className="space-y-3">
        <p className="text-sm text-text-2">Agregá un segundo paso con una app de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</p>
        <FormMessage state={start} />
        <SubmitButton pendingLabel="Preparando…">
          <ShieldCheck className="h-4 w-4" aria-hidden /> Activar verificación en dos pasos
        </SubmitButton>
      </form>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en el servidor como data URL */}
      <img src={String(start.data.qr)} alt="Código QR para la app de autenticación" width={180} height={180} className="rounded-xl bg-white p-2" />
      <form action={confirmAction} className="space-y-3">
        <p className="text-sm text-text-2">1. Escaneá el código con tu app. Si no podés, ingresá esta clave a mano:</p>
        <p className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[13px] break-all">{String(start.data.secret)}</p>
        <Field label="2. Ingresá el código de 6 dígitos que muestra la app" htmlFor="mfa-code" error={fieldError(confirm, "code")}>
          <Input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="max-w-40 text-center text-lg tracking-[0.3em]" />
        </Field>
        <FormMessage state={confirm} />
        <SubmitButton pendingLabel="Verificando…">Confirmar y activar</SubmitButton>
      </form>
    </div>
  );
}

export function MfaManage() {
  const [disable, disableAction] = useActionState(disableMfaAction, initial);
  const [regen, regenAction] = useActionState(regenerateCodesAction, initial);
  const codes = regen.data?.recoveryCodes as string[] | undefined;
  return (
    <div className="space-y-5">
      {codes ? <RecoveryCodes codes={codes} /> : null}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <form action={regenAction} className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-[14px] font-semibold">Códigos de recuperación nuevos</p>
          <Field label="Tu contraseña" htmlFor="regen-pw" error={fieldError(regen, "password")}>
            <Input id="regen-pw" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {!codes ? <FormMessage state={regen} /> : null}
          <SubmitButton variant="secondary" size="sm" pendingLabel="Generando…">
            Generar códigos
          </SubmitButton>
        </form>
        <form action={disableAction} className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-[14px] font-semibold">Desactivar la verificación en dos pasos</p>
          <Field label="Tu contraseña" htmlFor="disable-pw" error={fieldError(disable, "password")}>
            <Input id="disable-pw" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <FormMessage state={disable} />
          <SubmitButton variant="ghost" size="sm" className="text-critical" pendingLabel="Desactivando…">
            Desactivar
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export function ExportDataForm() {
  const [state, action] = useActionState(exportDataAction, initial);
  return (
    <form action={action} className="space-y-3">
      <Field label="Confirmá con tu contraseña" htmlFor="export-pw" error={fieldError(state, "password")}>
        <Input id="export-pw" name="password" type="password" autoComplete="current-password" required className="max-w-sm" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton variant="secondary" pendingLabel="Preparando…">
        <Download className="h-4 w-4" aria-hidden /> Descargar mis datos (JSON)
      </SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action] = useActionState(deleteAccountAction, initial);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tu contraseña" htmlFor="del-pw" error={fieldError(state, "password")}>
          <Input id="del-pw" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="Escribí ELIMINAR" htmlFor="del-confirm" error={fieldError(state, "confirm")}>
          <Input id="del-confirm" name="confirm" required autoComplete="off" />
        </Field>
      </div>
      <FormMessage state={state} />
      <SubmitButton variant="danger" pendingLabel="Eliminando…">
        Eliminar mi cuenta
      </SubmitButton>
    </form>
  );
}
