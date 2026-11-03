import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Info, XCircle } from "lucide-react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ Botones

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ink";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-[0_1px_0_rgba(0,0,0,0.04)]",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  ghost: "text-text-2 hover:bg-surface-2 hover:text-text",
  danger: "bg-critical text-critical-fg hover:opacity-90",
  ink: "bg-ink text-ink-fg hover:opacity-90",
};
const sizes: Record<Size, string> = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-5 text-[15px] gap-2" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-[10px] font-semibold whitespace-nowrap transition-colors duration-150 select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
    variants[variant],
    sizes[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ------------------------------------------------------------------ Formularios

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("block text-[13px] font-semibold text-text-2 mb-1.5", className)} {...props} />;
}

const control =
  "w-full rounded-[10px] border border-border-strong bg-surface px-3 text-sm text-text placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-3 focus:ring-[color-mix(in_oklab,var(--accent)_22%,transparent)] aria-[invalid=true]:border-critical";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(control, "h-10 appearance-none pr-9")} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "py-2.5 min-h-24", className)} {...props} />;
}

export function Field({ label, htmlFor, error, hint, children, className }: { label: string; htmlFor: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-[13px] text-critical" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Superficies

/**
 * Atributos para un contenedor con desplazamiento horizontal (tablas o gráficos anchos en pantallas
 * chicas): enfocable para recorrerlo con el teclado (WCAG 2.1.1) y anunciado con un nombre.
 */
export function scrollable(label: string) {
  return { role: "region", "aria-label": label, tabIndex: 0 } as const;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("card", className)} {...props} />;
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{eyebrow}</div> : null}
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.01em] text-text sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-text-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "accent" | "good" | "warning" | "critical";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-text-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

const calloutIcons = { info: Info, good: CheckCircle2, warning: AlertTriangle, critical: XCircle };

/** Mensaje con ícono + texto: el color nunca comunica solo. */
export function Callout({ tone = "info", title, children, className }: { tone?: "info" | "good" | "warning" | "critical"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = calloutIcons[tone];
  const palette = { info: "bg-accent-soft text-text", good: "bg-good-soft text-text", warning: "bg-warning-soft text-text", critical: "bg-critical-soft text-text" }[tone];
  const iconColor = { info: "text-accent", good: "text-good", warning: "text-warning", critical: "text-critical" }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl px-4 py-3 text-sm", palette, className)} role={tone === "critical" ? "alert" : "status"}>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? "mt-0.5" : "", "text-text-2")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">{icon ?? <DotGrid />}</div>
      <h3 className="text-[15px] font-semibold text-text">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** Motivo 3 × 3 de la marca (27 = 3³), para estados vacíos. */
export function DotGrid() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={6 + c * 6} cy={6 + r * 6} r={r === 1 && c === 1 ? 2.2 : 1.6} fill={r === 1 && c === 1 ? "var(--accent)" : "currentColor"} />))}
    </svg>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">{children}</kbd>;
}
