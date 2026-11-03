import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "./primitives";

/**
 * Indicador: etiqueta · valor · variación contra un período nombrado.
 * El color de la variación = dirección × si subir es bueno (más gasto en rojo, más ingreso en verde).
 */
export function StatTile({ label, minor, previous, currency, locale = "es-AR", upIsGood = true, previousLabel, hint }: { label: string; minor: bigint; previous?: bigint; currency: string; locale?: string; upIsGood?: boolean; previousLabel?: string; hint?: string }) {
  let delta: { pct: number | null; diff: bigint } | null = null;
  if (previous !== undefined) {
    const diff = minor - previous;
    const base = previous < 0n ? -previous : previous;
    delta = { diff, pct: base === 0n ? null : Number((diff * 1000n) / base) / 10 };
  }
  const up = delta ? delta.diff > 0n : false;
  const flat = delta ? delta.diff === 0n : true;
  const good = flat ? null : up === upIsGood;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="card p-5">
      <p className="text-[13px] font-semibold text-text-2">{label}</p>
      <p className="mt-2 text-[24px] font-bold tracking-[-0.01em] text-text">{formatMoney(minor, currency, locale)}</p>
      {delta ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px]">
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", good === true && "text-good", good === false && "text-critical", good === null && "text-muted")}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {delta.pct === null ? formatMoney(delta.diff, currency, locale, { signDisplay: "exceptZero" }) : `${delta.pct > 0 ? "+" : ""}${delta.pct.toLocaleString(locale)} %`}
          </span>
          <span className="text-muted">vs. {previousLabel ?? "período anterior"}</span>
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
