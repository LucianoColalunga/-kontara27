import type { Metadata } from "next";
import Link from "next/link";
import { COUNTRIES } from "@/lib/geo";
import { RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <div className="fade-in">
      <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em]">Creá tu cuenta</h1>
      <p className="mt-1 mb-6 text-sm text-text-2">
        Después vas a registrar tu empresa. ¿Ya tenés cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-accent hover:underline">
          Ingresá
        </Link>
      </p>
      <RegisterForm countries={COUNTRIES.map(({ code, name }) => ({ code, name }))} />
    </div>
  );
}
