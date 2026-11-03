import { brand } from "@/config/brand";
import { ISOTYPE_PALETTES, isotypeFaces, MONO_OPACITY } from "@/lib/isotype";

/** Isotipo «Cubo 27» en SVG (sin estilos en línea: compatible con la CSP). */
export function Isotype({ size = 32, variant = "tile", className, title }: { size?: number; variant?: "tile" | "light" | "dark" | "mono"; className?: string; title?: string }) {
  const palette = variant === "tile" ? ISOTYPE_PALETTES.onInk : variant === "dark" ? ISOTYPE_PALETTES.onDark : variant === "mono" ? ISOTYPE_PALETTES.monoInk : ISOTYPE_PALETTES.onLight;
  const faces = isotypeFaces(32, 32, variant === "tile" ? 24 : 27.5);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {variant === "tile" ? <rect width="64" height="64" rx="14" fill="#0B1A2E" /> : null}
      {faces.map((f) => (
        <polygon key={f.role} points={f.points} fill={palette[f.role]} fillOpacity={variant === "mono" ? MONO_OPACITY[f.role] : undefined} />
      ))}
    </svg>
  );
}

/** Logotipo horizontal: isotipo + nombre. El número lleva el color de acento. */
export function Logo({ size = 28, className, showText = true }: { size?: number; className?: string; showText?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Isotype size={size} title={showText ? undefined : brand.name} />
      {showText ? (
        <span className="font-display text-[15px] font-semibold tracking-[0.12em] text-text">
          {brand.wordmark} <span className="text-accent">{brand.numeral}</span>
        </span>
      ) : null}
    </span>
  );
}
