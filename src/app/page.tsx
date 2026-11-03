import Link from "next/link";
import { ArrowRight, FileSpreadsheet, LockKeyhole, ShieldCheck, Smartphone, Users, Wallet } from "lucide-react";
import { Isotype, Logo } from "@/components/brand/logo";
import { LinkButton } from "@/components/ui/primitives";
import { brand } from "@/config/brand";
import { getSession } from "@/server/http/session";

const features = [
  { icon: Wallet, title: "Ingresos, gastos y cajas", text: "Cuentas bancarias, efectivo y billeteras con saldos reales. Las transferencias entre tus cuentas no inflan ingresos ni gastos." },
  { icon: FileSpreadsheet, title: "Tu planilla, sin perder nada", text: "Importá tu Excel: detectamos fórmulas rotas, filas incompletas y duplicados, y conciliamos al centavo antes de confirmar." },
  { icon: Users, title: "Equipo con permisos", text: "Propietario, administrador, contador, empleado o solo lectura. Roles configurables y una persona puede estar en varias empresas." },
  { icon: ShieldCheck, title: "Seguridad por diseño", text: "Aislamiento por empresa en la base de datos, verificación en dos pasos, Argon2id y registro de auditoría inmutable." },
  { icon: Smartphone, title: "En la PC y en el celular", text: "Instalala como app en Android, iPhone, Windows o Mac. Los mismos datos, sincronizados, en todos lados." },
  { icon: LockKeyhole, title: "Privacidad configurable", text: "Solo cookies necesarias por defecto, exportación de tus datos y supresión de la cuenta cuando corresponde." },
];

export default async function HomePage() {
  const session = await getSession();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo size={30} />
        <nav className="flex items-center gap-2">
          {session ? (
            <LinkButton href="/app">
              Ir a la app <ArrowRight className="h-4 w-4" aria-hidden />
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/ingresar" variant="ghost">
                Ingresar
              </LinkButton>
              <LinkButton href="/registrarse">Crear cuenta</LinkButton>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[12px] font-semibold text-text-2">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Gestión financiera multiempresa
            </p>
            <h1 className="font-display text-[40px] leading-[1.05] font-semibold tracking-[-0.02em] sm:text-[56px]">
              Tus números,
              <br />
              <span className="text-accent">en su lugar.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-text-2">{brand.tagline} Registrá movimientos, controlá presupuestos y entendé tu flujo de caja sin fórmulas que se rompen.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href={session ? "/app" : "/registrarse"} size="lg">
                {session ? "Abrir mi panel" : "Empezar gratis"} <ArrowRight className="h-4 w-4" aria-hidden />
              </LinkButton>
              {!session ? (
                <LinkButton href="/ingresar" size="lg" variant="secondary">
                  Ya tengo cuenta
                </LinkButton>
              ) : null}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="card relative overflow-hidden p-8">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-text-2">Resultado de octubre</span>
                <span className="rounded-full bg-good-soft px-2 py-0.5 text-[12px] font-semibold text-good">+18,4 %</span>
              </div>
              <p className="mt-3 text-[40px] leading-none font-bold tracking-[-0.02em]">$ 1.284.900</p>
              <svg viewBox="0 0 320 120" className="mt-6 w-full" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1="0" x2="320" y1={20 + i * 30} y2={20 + i * 30} stroke="var(--grid)" />
                ))}
                {[34, 52, 44, 70, 62, 86, 78, 98].map((h, i) => (
                  <path key={i} d={`M${12 + i * 38},110V${110 - h + 4}Q${12 + i * 38},${110 - h} ${16 + i * 38},${110 - h}H${28 + i * 38}Q${32 + i * 38},${110 - h} ${32 + i * 38},${110 - h + 4}V110Z`} fill={i === 7 ? "var(--accent)" : "var(--series-1-wash)"} />
                ))}
              </svg>
            </div>
            <Isotype size={88} className="absolute -right-6 -bottom-8 drop-shadow-xl" />
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-12 px-4 py-20 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title}>
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <f.icon className="h-5 w-5" aria-hidden />
                </div>
                <h2 className="text-[16px] font-semibold">{f.title}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text-2">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-10 text-[13px] text-muted sm:flex-row sm:items-center sm:px-8">
        <span>
          © {new Date().getFullYear()} {brand.name}
        </span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/legal/privacidad" className="hover:text-text">
            Privacidad
          </Link>
          <Link href="/legal/cookies" className="hover:text-text">
            Cookies
          </Link>
          <Link href="/legal/terminos" className="hover:text-text">
            Términos
          </Link>
          <Link href="/marca" className="hover:text-text">
            Marca
          </Link>
        </nav>
      </footer>
    </div>
  );
}
