import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Callout } from "@/components/ui/primitives";
import { safeNext } from "@/lib/safe-next";
import { getSession } from "@/server/http/session";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (await getSession()) redirect("/app");
  return (
    <div className="fade-in">
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Ingresar</h1>
      <p className="mt-1 mb-6 text-sm text-text-2">
        ¿No tenés cuenta?{" "}
        <Link href="/registrarse" className="font-semibold text-accent hover:underline">
          Registrá tu empresa
        </Link>
      </p>
      {params.verificado ? <Callout tone="good" className="mb-4">Correo confirmado. Ya podés ingresar.</Callout> : null}
      {params.restablecida ? <Callout tone="good" className="mb-4">Contraseña actualizada. Cerramos tus otras sesiones por seguridad.</Callout> : null}
      {/* El destino se valida al mostrarlo y de nuevo en la acción: el formulario nunca lleva uno externo. */}
      <LoginForm next={typeof params.next === "string" ? safeNext(params.next) : "/app"} />
    </div>
  );
}
