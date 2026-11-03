import { formatMoney } from "@/lib/money";
import { cn } from "./primitives";

/** Importe formateado. El signo y el color los decide quien llama (dirección × si es bueno). */
export function Money({ minor, currency, locale = "es-AR", tone, signed, compact, className }: { minor: bigint; currency: string; locale?: string; tone?: "income" | "expense" | "muted"; signed?: boolean; compact?: boolean; className?: string }) {
  const text = formatMoney(minor, currency, locale, { compact, signDisplay: signed ? "exceptZero" : "auto" });
  return <span className={cn("tabular whitespace-nowrap", tone === "income" && "text-good", tone === "expense" && "text-text", tone === "muted" && "text-muted", className)}>{text}</span>;
}
