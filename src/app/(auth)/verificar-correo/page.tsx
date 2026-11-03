import type { Metadata } from "next";
import { MailCheck } from "lucide-react";
import { ResendVerificationForm, VerifyEmailForm } from "../forms";

export const metadata: Metadata = { title: "Confirmar correo" };

/**
 * La confirmación requiere un clic (POST). Un GET que consuma el token dejaría que los escáneres
 * de enlaces de los servicios de correo confirmen cuentas por su cuenta.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  return (
    <div className="fade-in space-y-6">
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
        <MailCheck className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Confirmá tu correo</h1>
        <p className="mt-1 text-sm text-text-2">Un paso más para activar tu cuenta.</p>
      </div>
      {token ? <VerifyEmailForm token={token} /> : null}
      <div className="border-t border-border pt-6">
        <ResendVerificationForm />
      </div>
    </div>
  );
}
