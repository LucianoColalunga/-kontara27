import { AlertTriangle, CheckCircle2, OctagonAlert } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { cn } from "@/components/ui/primitives";

/**
 * Gráficos en SVG generado en el servidor. Especificación (ver docs/brand/README.md, sección Datos):
 * columnas ≤ 24 px con extremo redondeado de 4 px y base recta, 2 px de separación entre marcas,
 * líneas de 2 px con relleno al 10 %, cuadrícula de 1 px recesiva, leyenda con ≥ 2 series,
 * etiquetas selectivas, tooltip con foco de teclado y tabla de datos como alternativa.
 * Sin estilos en línea: todo son atributos SVG y clases (compatible con la CSP estricta).
 */

const toMajor = (minor: bigint) => Number(minor) / 100;

/** Marcas «redondas» del eje: 0, 25K, 50K… */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

function compact(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1, style: value === 0 ? "decimal" : "currency", currency }).format(value);
}

function columnPath(x: number, yTop: number, width: number, baseline: number, radius = 4) {
  const h = baseline - yTop;
  if (h <= 0.5) return "";
  const r = Math.min(radius, h, width / 2);
  return `M${x},${baseline}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + width - r}Q${x + width},${yTop} ${x + width},${yTop + r}V${baseline}Z`;
}

function estimateWidth(text: string, size: number) {
  return text.length * size * 0.56;
}

export interface SeriesPoint {
  label: string;
  /** Etiqueta larga para el tooltip y la tabla (por ejemplo, «octubre de 2026»). */
  longLabel: string;
  values: bigint[];
}

export function Legend({ items }: { items: Array<{ label: string; colorVar: string; kind?: "rect" | "line" }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-2" aria-label="Referencias">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            {item.kind === "line" ? <line x1="1" y1="6" x2="11" y2="6" stroke={`var(${item.colorVar})`} strokeWidth="2" strokeLinecap="round" /> : <rect x="1" y="1" width="10" height="10" rx="2.5" fill={`var(${item.colorVar})`} />}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Columnas agrupadas por período (por ejemplo, ingresos y gastos por mes). */
export function GroupedColumns({ points, series, currency, locale = "es-AR", height = 240, title }: { points: SeriesPoint[]; series: Array<{ label: string; colorVar: string }>; currency: string; locale?: string; height?: number; title: string }) {
  const width = Math.max(560, points.length * 64 + 64);
  const padding = { top: 16, right: 12, bottom: 28, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = Math.max(0, ...points.flatMap((p) => p.values.map(toMajor)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const y = (v: number) => padding.top + plotH - (v / top) * plotH;
  const band = plotW / Math.max(1, points.length);
  const barW = Math.min(24, (band - 16) / series.length - 2);
  const groupW = series.length * barW + (series.length - 1) * 2;
  const baseline = y(0);

  return (
    <figure className="m-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Legend items={series} />
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[560px]" role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth="1" />
              <text x={padding.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">
                {compact(t, currency, locale)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const x0 = padding.left + i * band + (band - groupW) / 2;
            const tipLines = series.map((s, j) => `${formatMoney(p.values[j] ?? 0n, currency, locale)}  ${s.label}`);
            const tipW = Math.max(estimateWidth(p.longLabel, 12), ...tipLines.map((l) => estimateWidth(l, 12))) + 28;
            const tipX = Math.min(Math.max(padding.left, x0 + groupW / 2 - tipW / 2), width - padding.right - tipW);
            return (
              <g key={p.label} className="viz-group outline-none" tabIndex={0} aria-label={`${p.longLabel}: ${tipLines.join(", ")}`}>
                <rect x={padding.left + i * band} y={padding.top} width={band} height={plotH} fill="transparent" />
                {series.map((s, j) => (
                  <path key={s.label} className="viz-bar" d={columnPath(x0 + j * (barW + 2), y(toMajor(p.values[j] ?? 0n)), barW, baseline)} fill={`var(${s.colorVar})`} />
                ))}
                <text x={padding.left + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {p.label}
                </text>
                <g className="viz-tip">
                  <rect x={tipX} y={padding.top} width={tipW} height={22 + series.length * 18} rx="8" fill="var(--surface)" stroke="var(--border-strong)" />
                  <text x={tipX + 12} y={padding.top + 16} fontSize="11" fill="var(--muted)">
                    {p.longLabel}
                  </text>
                  {series.map((s, j) => (
                    <g key={s.label}>
                      <line x1={tipX + 12} x2={tipX + 22} y1={padding.top + 30 + j * 18} y2={padding.top + 30 + j * 18} stroke={`var(${s.colorVar})`} strokeWidth="2" strokeLinecap="round" />
                      <text x={tipX + 28} y={padding.top + 34 + j * 18} fontSize="12" fill="var(--text)" fontWeight="600" className="tabular">
                        {formatMoney(p.values[j] ?? 0n, currency, locale)}
                        <tspan fill="var(--text-2)" fontWeight="400">{`  ${s.label}`}</tspan>
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <DataTable caption={title} headers={["Período", ...series.map((s) => s.label)]} rows={points.map((p) => [p.longLabel, ...p.values.map((v) => formatMoney(v, currency, locale))])} />
    </figure>
  );
}

/** Línea con relleno suave (una serie), con cruz de lectura por período. */
export function TrendLine({ points, label, currency, locale = "es-AR", height = 200, colorVar = "--series-1" }: { points: Array<{ label: string; longLabel: string; value: bigint }>; label: string; currency: string; locale?: string; height?: number; colorVar?: string }) {
  const width = Math.max(560, points.length * 56 + 64);
  const padding = { top: 18, right: 64, bottom: 28, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const values = points.map((p) => toMajor(p.value));
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const ticksPos = niceTicks(Math.max(maxV, Math.abs(minV)));
  const step = ticksPos[1] ?? 1;
  const lo = minV < 0 ? -Math.ceil(Math.abs(minV) / step) * step : 0;
  const hi = maxV > 0 ? Math.ceil(maxV / step) * step : step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  const y = (v: number) => padding.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const x = (i: number) => padding.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join("");
  const area = `${line}L${x(values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const last = values.length - 1;
  const band = points.length > 1 ? plotW / (points.length - 1) : plotW;

  return (
    <figure className="m-0">
      <div className="-mx-1 overflow-x-auto px-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[560px]" role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padding.left} x2={width - padding.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth="1" />
              <text x={padding.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tabular">
                {compact(t, currency, locale)}
              </text>
            </g>
          ))}
          <path d={area} fill={colorVar === "--series-1" ? "var(--series-1-wash)" : "transparent"} />
          <path d={line} fill="none" stroke={`var(${colorVar})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {last >= 0 ? (
            <>
              <circle cx={x(last)} cy={y(values[last]!)} r="4" fill={`var(${colorVar})`} stroke="var(--surface)" strokeWidth="2" />
              <text x={x(last) + 10} y={y(values[last]!) + 4} fontSize="12" fontWeight="600" fill="var(--text)" className="tabular">
                {compact(values[last]!, currency, locale)}
              </text>
            </>
          ) : null}
          {points.map((p, i) => {
            const text = formatMoney(p.value, currency, locale);
            const tipW = Math.max(estimateWidth(p.longLabel, 11), estimateWidth(text, 12)) + 24;
            const tipX = Math.min(Math.max(padding.left, x(i) - tipW / 2), width - padding.right - tipW);
            return (
              <g key={p.label} className="viz-group outline-none" tabIndex={0} aria-label={`${p.longLabel}: ${text}`}>
                <rect x={x(i) - band / 2} y={padding.top} width={band} height={plotH} fill="transparent" />
                <line className="viz-crosshair" x1={x(i)} x2={x(i)} y1={padding.top} y2={padding.top + plotH} stroke="var(--border-strong)" strokeWidth="1" />
                <text x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {p.label}
                </text>
                <g className="viz-tip">
                  <circle cx={x(i)} cy={y(values[i]!)} r="4" fill={`var(${colorVar})`} stroke="var(--surface)" strokeWidth="2" />
                  <rect x={tipX} y={padding.top - 14} width={tipW} height="38" rx="8" fill="var(--surface)" stroke="var(--border-strong)" />
                  <text x={tipX + 12} y={padding.top} fontSize="11" fill="var(--muted)">
                    {p.longLabel}
                  </text>
                  <text x={tipX + 12} y={padding.top + 16} fontSize="12" fontWeight="600" fill="var(--text)" className="tabular">
                    {text}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <DataTable caption={label} headers={["Período", label]} rows={points.map((p) => [p.longLabel, formatMoney(p.value, currency, locale)])} />
    </figure>
  );
}

/** Barras horizontales por categoría (magnitud: un solo tono). El color propio de la categoría va en el punto junto al nombre. */
export function CategoryBars({ items, currency, locale = "es-AR", emptyLabel }: { items: Array<{ name: string; color: string | null; totalMinor: bigint; share: number }>; currency: string; locale?: string; emptyLabel: string }) {
  const visible = items.filter((i) => i.totalMinor > 0n).slice(0, 8);
  const rest = items.filter((i) => i.totalMinor > 0n).slice(8);
  if (rest.length) visible.push({ name: `Otras (${rest.length})`, color: null, totalMinor: rest.reduce((a, b) => a + b.totalMinor, 0n), share: Math.round(rest.reduce((a, b) => a + b.share, 0) * 10) / 10 });
  if (!visible.length) return <p className="py-8 text-center text-sm text-muted">{emptyLabel}</p>;
  const max = visible.reduce((m, i) => (i.totalMinor > m ? i.totalMinor : m), 0n);
  return (
    <ul className="space-y-3">
      {visible.map((item) => {
        const pct = max > 0n ? Number((item.totalMinor * 1000n) / max) / 10 : 0;
        return (
          <li key={item.name}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="inline-flex min-w-0 items-center gap-2 text-text">
                <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className="shrink-0">
                  <circle cx="4" cy="4" r="4" fill={item.color ?? "var(--muted)"} />
                </svg>
                <span className="truncate">{item.name}</span>
              </span>
              <span className="shrink-0 text-text-2 tabular">
                {formatMoney(item.totalMinor, currency, locale)} <span className="text-muted">· {item.share.toLocaleString(locale)} %</span>
              </span>
            </div>
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-2 w-full" aria-hidden>
              <rect x="0" y="0" width="100" height="8" rx="4" fill="var(--surface-2)" />
              <rect x="0" y="0" width={Math.max(pct, 1.5)} height="8" rx="4" fill="var(--series-1)" />
            </svg>
          </li>
        );
      })}
    </ul>
  );
}

/** Medidor de presupuesto: el estado se comunica con ícono + texto, no solo con color. */
export function BudgetMeter({ pct, state, label }: { pct: number; state: "ok" | "warning" | "exceeded"; label?: string }) {
  const fill = state === "exceeded" ? "var(--critical)" : state === "warning" ? "var(--warning)" : "var(--series-1)";
  const Icon = state === "exceeded" ? OctagonAlert : state === "warning" ? AlertTriangle : CheckCircle2;
  const text = label ?? (state === "exceeded" ? "Superado" : state === "warning" ? "Cerca del límite" : "Dentro del presupuesto");
  return (
    <div>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(pct))} aria-label={`${Math.round(pct)} % utilizado`}>
        <rect x="0" y="0" width="100" height="10" rx="5" fill="var(--meter-track)" />
        <rect x="0" y="0" width={Math.min(100, Math.max(pct, pct > 0 ? 2 : 0))} height="10" rx="5" fill={fill} />
      </svg>
      <p className={cn("mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold", state === "exceeded" ? "text-critical" : state === "warning" ? "text-warning" : "text-text-2")}>
        <Icon className="h-3.5 w-3.5" aria-hidden /> {text} · {pct.toLocaleString("es-AR")} %
      </p>
    </div>
  );
}

/** Tabla de datos de un gráfico: el tooltip nunca es la única forma de leer un valor. */
export function DataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-3 text-[13px]">
      <summary className="cursor-pointer select-none text-muted hover:text-text">Ver datos en tabla</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border text-muted">
              {headers.map((h) => (
                <th key={h} scope="col" className="py-1.5 pr-4 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-b border-border/60">
                {r.map((cell, i) => (
                  <td key={i} className={cn("py-1.5 pr-4", i > 0 && "tabular text-text")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
