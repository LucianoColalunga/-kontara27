import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { safeNext } from "@/lib/safe-next";
import { getPendingMfaSession } from "@/server/http/session";
import { MfaForm } from "../../forms";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (!(await getPendingMfaSession())) redirect("/ingresar");
  return (
    <div className="fade-in">
      <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </div>
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Verificación en dos pasos</h1>
      <p className="mt-1 mb-6 text-sm text-text-2">Abrí tu app de autenticación e ingresá el código. Si perdiste el teléfono, usá uno de tus códigos de recuperación.</p>
      <MfaForm next={typeof params.next === "string" ? safeNext(params.next) : "/app"} />
      <p className="mt-6 text-center text-[13px] text-muted">
        <Link href="/ingresar" className="hover:text-text">
          Volver
        </Link>
      </p>
    </div>
  );
}
