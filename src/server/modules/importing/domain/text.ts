/** Normaliza para comparar etiquetas: sin tildes, minúsculas, espacios simples. */
export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Correcciones sugeridas para etiquetas frecuentes (se proponen, el usuario confirma). */
const SUGGESTED_SPELLING: Record<string, string> = {
  trasporte: "Transporte",
  transporte: "Transporte",
  programacion: "Programación",
  inversion: "Inversión",
  inversiones: "Inversiones",
  publicidad: "Publicidad",
  administracion: "Administración",
  comision: "Comisión",
  comisiones: "Comisiones",
  credito: "Crédito",
  telefonia: "Telefonía",
};

export function suggestCategoryName(label: string): string {
  const key = normalizeLabel(label);
  if (SUGGESTED_SPELLING[key]) return SUGGESTED_SPELLING[key];
  const trimmed = label.replace(/\s+/g, " ").trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTHS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Mes (1–12) que representa el nombre de una hoja: «ENERO», «Septiembre», «setiembre», «Jan»… */
export function monthFromSheetName(name: string): number | null {
  const n = normalizeLabel(name).replace(/[^a-z]/g, "");
  if (n === "setiembre") return 9;
  for (let i = 0; i < 12; i++) {
    if (n === MONTHS_ES[i] || n === MONTHS_EN[i] || n === MONTHS_ES[i]!.slice(0, 3) || n === MONTHS_EN[i]!.slice(0, 3)) return i + 1;
  }
  return null;
}

export const HEADER_SYNONYMS: Record<"date" | "category" | "description" | "expense" | "income" | "amount" | "type", string[]> = {
  date: ["fecha", "date", "dia", "fecha de pago", "fecha operacion"],
  category: ["categoria", "category", "rubro", "cuenta contable", "concepto general"],
  description: ["descripcion", "detalle", "concepto", "description", "observacion", "observaciones", "glosa"],
  expense: ["gasto", "gastos", "egreso", "egresos", "debe", "salida", "salidas", "expense", "debito", "pago"],
  income: ["ingreso", "ingresos", "haber", "entrada", "entradas", "income", "credito", "cobro"],
  amount: ["importe", "monto", "amount", "valor", "total"],
  type: ["tipo", "type", "movimiento"],
};

export function matchHeader(text: string): keyof typeof HEADER_SYNONYMS | null {
  const n = normalizeLabel(text);
  for (const [key, list] of Object.entries(HEADER_SYNONYMS) as Array<[keyof typeof HEADER_SYNONYMS, string[]]>) {
    if (list.includes(n)) return key;
  }
  return null;
}

const REFUND_WORDS = /\b(devolucion|devoluciones|reintegro|reembolso|refund|nota de credito)\b/;
export const looksLikeRefund = (description: string) => REFUND_WORDS.test(normalizeLabel(description));
