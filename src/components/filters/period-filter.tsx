import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { PERIOD_LABELS, type PeriodPreset } from "@/lib/periods";
import { cn } from "@/components/ui/primitives";

/** Filtro de período en una sola fila sobre el contenido que afecta. Funciona sin JavaScript. */
export function PeriodFilter({ basePath, current, from, to, extra = {}, currencies, currency }: { basePath: string; current: PeriodPreset; from: string; to: string; extra?: Record<string, string>; currencies?: string[]; currency?: string }) {
  const presets: PeriodPreset[] = ["mes", "mes-anterior", "trimestre", "anio", "12m"];
  const query = (params: Record<string, string>) => `${basePath}?${new URLSearchParams({ ...extra, ...(currency ? { moneda: currency } : {}), ...params }).toString()}`;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2" role="group" aria-label="Período">
      <div className="flex flex-wrap rounded-[10px] border border-border bg-surface p-0.5">
        {presets.map((p) => (
          <Link key={p} href={query({ periodo: p })} aria-current={current === p ? "true" : undefined} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors", current === p ? "bg-ink text-ink-fg" : "text-text-2 hover:bg-surface-2")}>
            {PERIOD_LABELS[p]}
          </Link>
        ))}
      </div>
      <form action={basePath} className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-surface px-2 py-1">
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {currency ? <input type="hidden" name="moneda" value={currency} /> : null}
        <input type="hidden" name="periodo" value="personalizado" />
        <CalendarRange className="h-4 w-4 text-muted" aria-hidden />
        <label className="sr-only" htmlFor="desde">
          Desde
        </label>
        <input id="desde" name="desde" type="date" defaultValue={from} className="h-7 rounded-md bg-transparent px-1 text-[13px] text-text" />
        <span className="text-muted">→</span>
        <label className="sr-only" htmlFor="hasta">
          Hasta
        </label>
        <input id="hasta" name="hasta" type="date" defaultValue={to} className="h-7 rounded-md bg-transparent px-1 text-[13px] text-text" />
        <button type="submit" className={cn("rounded-md px-2 py-1 text-[13px] font-semibold", current === "personalizado" ? "bg-ink text-ink-fg" : "text-accent hover:bg-surface-2")}>
          Aplicar
        </button>
      </form>
      {currencies && currencies.length > 1 ? (
        <div className="flex rounded-[10px] border border-border bg-surface p-0.5" role="group" aria-label="Moneda">
          {currencies.map((c) => (
            <Link key={c} href={`${basePath}?${new URLSearchParams({ ...extra, periodo: current, ...(current === "personalizado" ? { desde: from, hasta: to } : {}), moneda: c }).toString()}`} aria-current={c === currency ? "true" : undefined} className={cn("rounded-lg px-2.5 py-1.5 text-[13px] font-semibold", c === currency ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2")}>
              {c}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
