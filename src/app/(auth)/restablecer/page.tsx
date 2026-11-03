import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/ui/primitives";
import { ResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await searchParams;
  return (
    <div className="fade-in">
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Elegí una contraseña nueva</h1>
      <p className="mt-1 mb-6 text-sm text-text-2">Al guardarla se cierran todas las sesiones abiertas de tu cuenta.</p>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <Callout tone="warning">
          Falta el enlace de recuperación. <Link href="/recuperar" className="font-semibold text-accent">Pedí uno nuevo</Link>.
        </Callout>
      )}
    </div>
  );
}
