/** Períodos de análisis. «Hoy» se calcula en la zona horaria de la empresa, no la del servidor. */
export type PeriodPreset = "mes" | "mes-anterior" | "trimestre" | "anio" | "12m" | "personalizado";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  mes: "Este mes",
  "mes-anterior": "Mes anterior",
  trimestre: "Este trimestre",
  anio: "Este año",
  "12m": "Últimos 12 meses",
  personalizado: "Personalizado",
};

export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
}

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function resolvePeriod(params: { periodo?: string; desde?: string; hasta?: string }, timezone: string, now = new Date()): { preset: PeriodPreset; from: string; to: string } {
  const today = todayIn(timezone, now);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const preset = (Object.keys(PERIOD_LABELS) as PeriodPreset[]).includes(params.periodo as PeriodPreset) ? (params.periodo as PeriodPreset) : "mes";
  const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)));
  switch (preset) {
    case "mes-anterior": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { preset, from: iso(py, pm, 1), to: iso(py, pm, lastDay(py, pm)) };
    }
    case "trimestre": {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return { preset, from: iso(y, qStart, 1), to: iso(y, qStart + 2, lastDay(y, qStart + 2)) };
    }
    case "anio":
      return { preset, from: iso(y, 1, 1), to: iso(y, 12, 31) };
    case "12m": {
      const startMonth = m === 12 ? 1 : m + 1;
      const startYear = m === 12 ? y : y - 1;
      return { preset, from: iso(startYear, startMonth, 1), to: iso(y, m, lastDay(y, m)) };
    }
    case "personalizado":
      if (isDate(params.desde) && isDate(params.hasta) && params.desde! <= params.hasta!) return { preset, from: params.desde!, to: params.hasta! };
      return { preset: "mes", from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    default:
      return { preset: "mes", from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
  }
}

/** Ventana de 12 meses que termina en el mes de `to`, para las series del panel. */
export function trailingYear(to: string): { from: string; to: string } {
  const [y, m] = to.split("-").map(Number) as [number, number];
  const startMonth = m === 12 ? 1 : m + 1;
  const startYear = m === 12 ? y : y - 1;
  return { from: iso(startYear, startMonth, 1), to: iso(y, m, lastDay(y, m)) };
}

export function monthLabel(month: string, locale = "es-AR", style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1, 1));
  if (style === "long") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
}

export function formatDate(isoDate: string, locale = "es-AR", options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
