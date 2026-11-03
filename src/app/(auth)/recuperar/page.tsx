import type { Metadata } from "next";
import Link from "next/link";
import { RequestResetForm } from "../forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <div className="fade-in">
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Recuperar contraseña</h1>
      <p className="mt-1 mb-6 text-sm text-text-2">Te enviamos un enlace de un solo uso que vence en 30 minutos.</p>
      <RequestResetForm />
      <p className="mt-6 text-center text-[13px] text-muted">
        <Link href="/ingresar" className="hover:text-text">
          Volver a ingresar
        </Link>
      </p>
    </div>
  );
}
