import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Isotype, Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

export const metadata: Metadata = { title: "Manual de marca" };

const COLORS = [
  { name: "Tinta", hex: "#0B1A2E", use: "Estructura, texto principal, mosaico del ícono" },
  { name: "Cobalto", hex: "#1D5BFF", use: "Acción principal, el «27», la unidad central del cubo" },
  { name: "Cobalto claro", hex: "#5B8CFF", use: "Acento sobre fondos oscuros" },
  { name: "Niebla", hex: "#F5F6F8", use: "Fondo de la aplicación (modo claro)" },
  { name: "Pizarra", hex: "#627089", use: "Texto secundario y ejes de gráficos" },
  { name: "Noche", hex: "#08101C", use: "Fondo de la aplicación (modo oscuro)" },
];
const DATA = [
  { name: "Serie 1 · ingresos", light: "#2A78D6", dark: "#3987E5" },
  { name: "Serie 2 · gastos", light: "#EB6834", dark: "#D95926" },
  { name: "Correcto", light: "#0B7A47", dark: "#3CCB80" },
  { name: "Advertencia", light: "#9A5A00", dark: "#F2B84B" },
  { name: "Crítico", light: "#C42B2B", dark: "#FF7A7A" },
];
const FILES = [
  ["logo-horizontal.svg", "Horizontal, fondos claros"],
  ["logo-horizontal-negativo.svg", "Horizontal, fondos oscuros"],
  ["logo-vertical.svg", "Vertical, fondos claros"],
  ["logo-vertical-negativo.svg", "Vertical, fondos oscuros"],
  ["logo-horizontal-mono.svg", "Monocromo tinta"],
  ["logo-horizontal-mono-negativo.svg", "Monocromo blanco"],
  ["isotipo.svg", "Isotipo con mosaico (ícono)"],
  ["isotipo-sin-fondo.svg", "Isotipo sin fondo"],
];

export default function BrandPage() {
  return (
    <div className="min-h-dvh px-4 py-6 sm:px-8">
      <header className="mx-auto mb-12 flex max-w-5xl items-center justify-between">
        <Link href="/">
          <Logo size={28} />
        </Link>
        <span className="text-[13px] font-semibold text-muted">Manual de marca · v1.0</span>
      </header>
      <main className="mx-auto max-w-5xl space-y-16 pb-20">
        <section>
          <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">Identidad</p>
          <h1 className="mt-2 font-display text-[40px] leading-tight font-semibold tracking-[-0.02em]">{brand.name}</h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-text-2">
            «Kontara» viene de <em>contar</em>: llevar la cuenta y también narrar lo que pasa en una empresa. El <strong>27</strong> es 3³: un cubo de tres unidades por lado. El isotipo dibuja ese cubo con la unidad central resaltada en cobalto — <strong>cada unidad cuenta</strong>. Transmite solidez (un sólido), estructura (una grilla exacta) y precisión (una sola pieza destacada).
          </p>
          <p className="mt-4 text-[15px] font-semibold text-text">Lema: «{brand.tagline}»</p>
        </section>

        <section>
          <h2 className="mb-6 text-[22px] font-semibold">Logotipo e isotipo</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="grid min-h-48 place-items-center rounded-2xl border border-border bg-white p-8">
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo SVG de marca */}
              <img src="/brand/logo-horizontal.svg" alt="Logotipo horizontal sobre fondo claro" className="h-14 w-auto" />
            </div>
            <div className="grid min-h-48 place-items-center rounded-2xl bg-[#0b1a2e] p-8">
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo SVG de marca */}
              <img src="/brand/logo-horizontal-negativo.svg" alt="Logotipo horizontal sobre fondo oscuro" className="h-14 w-auto" />
            </div>
            <div className="grid min-h-48 place-items-center rounded-2xl border border-border bg-white p-8">
              {/* eslint-disable-next-line @next/next/no-img-element -- archivo SVG de marca */}
              <img src="/brand/logo-vertical.svg" alt="Logotipo vertical" className="h-32 w-auto" />
            </div>
            <div className="flex min-h-48 items-center justify-center gap-6 rounded-2xl border border-border bg-surface p-8">
              <Isotype size={96} />
              <Isotype size={48} />
              <Isotype size={24} />
              <Isotype size={16} />
            </div>
          </div>
          <ul className="mt-6 grid grid-cols-1 gap-3 text-[14px] text-text-2 md:grid-cols-3">
            <li><strong className="text-text">Espacio de resguardo:</strong> alrededor del logo, como mínimo la altura de la unidad central del cubo (un tercio de la arista).</li>
            <li><strong className="text-text">Tamaño mínimo:</strong> isotipo 16 px (favicon); logotipo horizontal 120 px de ancho en pantalla o 30 mm impreso.</li>
            <li><strong className="text-text">Siempre con el número:</strong> en el logotipo, «KONTARA 27» en mayúsculas y el 27 en cobalto (o del color del texto en las versiones monocromas). En texto corrido —títulos, asuntos de correo, nombre de la app instalada— «Kontara 27».</li>
          </ul>
          <ul className="mt-4 grid grid-cols-1 gap-3 text-[14px] text-text-2 md:grid-cols-2">
            <li>✕ No rotar, deformar ni cambiar las proporciones del cubo.</li>
            <li>✕ No usar el cobalto para todo el cubo: solo la unidad central.</li>
            <li>✕ No poner el logo sobre fotos con poco contraste; usar el negativo o el monocromo.</li>
            <li>✕ No separar el «27» del nombre ni escribir «Kontara» solo.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-6 text-[22px] font-semibold">Color</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLORS.map((c) => (
              <div key={c.hex} className="card overflow-hidden">
                <svg viewBox="0 0 100 40" className="h-20 w-full" preserveAspectRatio="none" aria-hidden>
                  <rect width="100" height="40" fill={c.hex} />
                </svg>
                <div className="p-4">
                  <p className="font-semibold">
                    {c.name} <span className="font-mono text-[13px] text-muted">{c.hex}</span>
                  </p>
                  <p className="mt-1 text-[13px] text-text-2">{c.use}</p>
                </div>
              </div>
            ))}
          </div>
          <h3 className="mt-10 mb-3 text-[16px] font-semibold">Datos y estados</h3>
          <p className="mb-4 max-w-3xl text-[14px] text-text-2">Los gráficos usan dos series validadas para daltonismo en modo claro y oscuro (azul para ingresos, naranja para gastos). Verde, ámbar y rojo quedan reservados para estados y siempre van acompañados de ícono y texto. Todos los textos cumplen contraste WCAG AA (≥ 4,5:1).</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
            {DATA.map((d) => (
              <div key={d.name} className="card p-3 text-[13px]">
                <svg viewBox="0 0 40 16" className="mb-2 h-6 w-full" aria-hidden>
                  <rect width="20" height="16" rx="3" fill={d.light} />
                  <rect x="20" width="20" height="16" rx="3" fill={d.dark} />
                </svg>
                <p className="font-semibold">{d.name}</p>
                <p className="font-mono text-[12px] text-muted">
                  {d.light} / {d.dark}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-6 text-[22px] font-semibold">Tipografía e iconografía</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card p-6">
              <p className="text-[12px] font-semibold text-muted uppercase">Marca y títulos</p>
              <p className="mt-2 font-display text-[34px] font-semibold">Sora</p>
              <p className="mt-1 font-display text-[20px]">Aa Bb 0123456789 · $ 1.284.900</p>
              <p className="mt-3 text-[13px] text-text-2">Geométrica, con números de lectura clara. Logotipo (600, espaciado amplio) y títulos.</p>
            </div>
            <div className="card p-6">
              <p className="text-[12px] font-semibold text-muted uppercase">Interfaz y datos</p>
              <p className="mt-2 text-[34px] font-semibold">Manrope</p>
              <p className="mt-1 text-[20px] tabular">Aa Bb 0123456789 · $ 1.284.900</p>
              <p className="mt-3 text-[13px] text-text-2">Texto, formularios, tablas y gráficos. En columnas de importes, cifras tabulares para que alineen.</p>
            </div>
          </div>
          <p className="mt-4 text-[14px] text-text-2">Íconos: Lucide, trazo 2 px, 16–20 px, siempre acompañados de texto o etiqueta accesible. Motivo gráfico: la grilla 3 × 3 con el punto central en cobalto (estados vacíos, materiales).</p>
        </section>

        <section>
          <h2 className="mb-6 text-[22px] font-semibold">Aplicaciones</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="card grid place-items-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- ícono de la app */}
              <img src="/icons/icon-512.png" alt="Ícono de la aplicación" width={112} height={112} className="rounded-[24px]" />
              <p className="mt-3 text-[13px] text-text-2">Ícono de app (Android, Windows, Mac)</p>
            </div>
            <div className="card grid place-items-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- ícono maskable */}
              <img src="/icons/icon-maskable-512.png" alt="Ícono adaptable" width={112} height={112} className="rounded-full" />
              <p className="mt-3 text-[13px] text-text-2">Ícono adaptable (zona segura 80 %)</p>
            </div>
            <div className="card grid place-items-center p-6">
              {/* eslint-disable-next-line @next/next/no-img-element -- ícono iOS */}
              <img src="/icons/apple-touch-icon.png" alt="Ícono para iPhone y iPad" width={90} height={90} className="rounded-[20px]" />
              <p className="mt-3 text-[13px] text-text-2">iPhone y iPad</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-[22px] font-semibold">Descargas</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {FILES.map(([file, label]) => (
              <li key={file}>
                <a href={`/brand/${file}`} download className="card flex items-center gap-3 px-4 py-3 text-[14px] hover:border-border-strong">
                  <Download className="h-4 w-4 text-muted" aria-hidden />
                  <span className="flex-1">{label}</span>
                  <span className="font-mono text-[12px] text-muted">{file}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-muted">Los SVG tienen el texto convertido a trazos: no dependen de tener la fuente instalada. Se regeneran con «npm run brand:build».</p>
        </section>
      </main>
    </div>
  );
}
