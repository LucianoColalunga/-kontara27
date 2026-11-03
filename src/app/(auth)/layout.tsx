import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_520px]">
      <aside className="relative hidden overflow-hidden bg-[#0b1a2e] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="inline-flex items-center gap-3 text-white">
          <Logo size={34} className="[&_span]:text-white" />
        </Link>
        <div className="max-w-md">
          <p className="font-display text-[34px] leading-tight font-semibold tracking-[-0.01em]">Cada movimiento, en su lugar. Cada empresa, en la suya.</p>
          <p className="mt-4 text-[15px] leading-relaxed text-[#b7c2d3]">Ingresos, gastos, cuentas, presupuestos y reportes con aislamiento total entre empresas, verificación en dos pasos y registro de auditoría.</p>
        </div>
        <CubeField />
        <p className="text-[12px] text-[#8b99af]">Tus datos viajan cifrados y se guardan separados por empresa.</p>
      </aside>
      <main className="flex min-h-dvh flex-col px-4 py-8 sm:px-10">
        <div className="mb-10 lg:hidden">
          <Link href="/">
            <Logo size={30} />
          </Link>
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center">{children}</div>
        <footer className="mt-10 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <Link href="/legal/privacidad" className="hover:text-text">
            Privacidad
          </Link>
          <Link href="/legal/terminos" className="hover:text-text">
            Términos
          </Link>
          <Link href="/legal/cookies" className="hover:text-text">
            Cookies
          </Link>
        </footer>
      </main>
    </div>
  );
}

/** Trama 3 × 9 de cubos tenues: el motivo «27» de la marca. */
function CubeField() {
  return (
    <svg viewBox="0 0 270 90" className="pointer-events-none absolute -right-10 bottom-24 w-[520px] opacity-[0.16]" aria-hidden>
      {Array.from({ length: 27 }, (_, i) => {
        const col = i % 9;
        const row = Math.floor(i / 9);
        const x = 15 + col * 30;
        const y = 15 + row * 30;
        const hot = i === 13;
        return <rect key={i} x={x - 6} y={y - 6} width="12" height="12" rx="3" fill={hot ? "#5b8cff" : "#ffffff"} />;
      })}
    </svg>
  );
}
