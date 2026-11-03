import type { MovementKind } from "@/lib/movement-kinds";
import { currencyExponent, decimalStringToMinor, MoneyParseError } from "@/lib/money";
import { looksLikeRefund, normalizeLabel } from "./text";
import type { ExtractedRow, RawCellValue, RowDraft, RowIssue, RowStatus } from "./types";

const BLOCKING = new Set([
  "INCOMPLETE_ROW",
  "DATE_MISSING",
  "DATE_INVALID",
  "AMOUNT_MISSING",
  "AMOUNT_BOTH",
  "AMOUNT_NOT_NUMERIC",
  "AMOUNT_NEGATIVE",
  "AMOUNT_PRECISION",
  "KIND_MISSING",
]);

function statusFor(issues: RowIssue[]): RowStatus {
  if (issues.some((i) => BLOCKING.has(i.code))) return "blocked";
  if (issues.some((i) => i.severity === "warning")) return "needs_review";
  return "ready";
}

function isZero(value: RawCellValue): boolean {
  return value.type === "number" && /^-?0+(\.0+)?$/.test(value.text ?? "");
}

function hasValue(value: RawCellValue | undefined): boolean {
  return Boolean(value && value.text !== null && value.text.trim() !== "" && !isZero(value));
}

/** Fecha desde texto («15/08/2026», «2026-08-15») cuando la planilla no la guardó como fecha. */
export function parseLooseDate(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const latin = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (latin) [d, m, y] = [Number(latin[1]), Number(latin[2]), Number(latin[3])];
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

export interface ValidationOptions {
  currency: string;
  /** Claves «fecha|naturaleza|importe|descripción» de movimientos que ya existen en la organización. */
  existingKeys?: Set<string>;
}

export function duplicateKey(occurredOn: string, kind: MovementKind, amountMinor: bigint, description: string) {
  return `${occurredOn}|${kind}|${amountMinor}|${normalizeLabel(description)}`;
}

/**
 * Convierte filas leídas en borradores de movimiento con sus observaciones. No completa ni inventa
 * nada: si falta la fecha, el importe o el tipo, la fila queda bloqueada hasta que alguien la
 * corrija o la excluya con un motivo.
 */
export function validateRow(row: ExtractedRow, options: ValidationOptions): RowDraft {
  const issues: RowIssue[] = [];
  const add = (code: string, severity: RowIssue["severity"], message: string) => issues.push({ code, severity, message });
  const rawRecord = { fecha: row.date.text, categoria: row.category.text, descripcion: row.description.text, gasto: row.expense.text, ingreso: row.income.text, ...(row.signedAmount ? { importe: row.signedAmount.text } : {}) };

  const description = (row.description.text ?? "").replace(/\s+/g, " ").trim();
  if (row.description.text && row.description.text !== row.description.text.trim()) add("WHITESPACE_TRIMMED", "info", "Se quitaron espacios al principio o al final de la descripción.");
  const categoryLabel = row.category.text ? row.category.text.replace(/\s+/g, " ").trim() || null : null;
  if (row.category.text && row.category.text !== row.category.text.trim()) add("CATEGORY_WHITESPACE", "info", "La categoría tenía espacios sobrantes.");

  const onlyDescription = !hasValue(row.date) && !hasValue(row.expense) && !hasValue(row.income) && !hasValue(row.signedAmount) && !categoryLabel;
  if (onlyDescription) {
    add("INCOMPLETE_ROW", "error", "La fila solo tiene descripción: falta fecha, categoría e importe. Completala o excluila.");
    return { position: row.position, sourceRef: row.sourceRef, sheet: row.sheet, raw: rawRecord, occurredOn: null, kind: null, amountMinor: null, categoryLabel: null, description, issues, status: "blocked" };
  }

  // Fecha
  let occurredOn: string | null = null;
  if (!hasValue(row.date)) add("DATE_MISSING", "error", "Falta la fecha.");
  else if (row.date.type === "date") occurredOn = row.date.text;
  else {
    occurredOn = row.date.type === "string" ? parseLooseDate(row.date.text!) : null;
    if (!occurredOn) add("DATE_INVALID", "error", `La fecha «${row.date.text}» no es válida.`);
    else add("DATE_FROM_TEXT", "info", "La fecha estaba escrita como texto y se interpretó como día/mes/año.");
  }
  if (occurredOn && row.sheetMonth && Number(occurredOn.slice(5, 7)) !== row.sheetMonth) {
    add("DATE_SHEET_MISMATCH", "warning", `La fecha ${occurredOn} no corresponde al mes de la hoja ${row.sheet}.`);
  }

  // Importe y naturaleza
  let kind: MovementKind | null = null;
  let amountMinor: bigint | null = null;
  const parseAmount = (value: RawCellValue, label: string): bigint | null => {
    if (value.type !== "number") {
      add("AMOUNT_NOT_NUMERIC", "error", `${label} «${value.text}» no es un número.`);
      return null;
    }
    try {
      return decimalStringToMinor(value.text!, options.currency);
    } catch (error) {
      add("AMOUNT_PRECISION", "error", error instanceof MoneyParseError ? `${label}: ${error.message} (${options.currency} usa ${currencyExponent(options.currency)} decimales).` : `${label} inválido.`);
      return null;
    }
  };
  if (isZero(row.expense) || isZero(row.income)) add("ZERO_PLACEHOLDER", "info", "Había un 0 en la columna que no corresponde; se ignoró.");

  if (row.signedAmount && hasValue(row.signedAmount)) {
    const signed = parseAmount(row.signedAmount, "El importe");
    if (signed !== null) {
      kind = signed < 0n ? "expense" : "income";
      amountMinor = signed < 0n ? -signed : signed;
    }
  } else {
    const expense = hasValue(row.expense);
    const income = hasValue(row.income);
    if (expense && income) add("AMOUNT_BOTH", "error", "La fila tiene importe en Gasto y en Ingreso. Dejá uno solo.");
    else if (!expense && !income) add("AMOUNT_MISSING", "error", "Falta el importe.");
    else {
      const value = parseAmount(expense ? row.expense : row.income, expense ? "El gasto" : "El ingreso");
      if (value !== null) {
        if (value < 0n) add("AMOUNT_NEGATIVE", "error", "El importe es negativo. Indicá si es una devolución o corregí el signo.");
        else if (value === 0n) add("AMOUNT_MISSING", "error", "El importe es cero.");
        else {
          kind = expense ? "expense" : "income";
          amountMinor = value;
        }
      }
    }
  }

  if (!categoryLabel) add("CATEGORY_MISSING", "warning", "No tiene categoría: se importa sin categoría si no la completás.");
  if (!description) add("DESCRIPTION_MISSING", "warning", "No tiene descripción.");
  if (kind === "income" && description && looksLikeRefund(description)) {
    add("POSSIBLE_REFUND", "warning", "Parece una devolución cargada como ingreso. Si es un reintegro de una compra, cambiá el tipo a «Devolución recibida» para no inflar ingresos y gastos.");
  }
  if (occurredOn && kind && amountMinor && options.existingKeys?.has(duplicateKey(occurredOn, kind, amountMinor, description))) {
    add("DUPLICATE_EXISTING", "warning", "Ya existe un movimiento con la misma fecha, tipo, importe y descripción en la empresa.");
  }

  return { position: row.position, sourceRef: row.sourceRef, sheet: row.sheet, raw: rawRecord, occurredOn, kind, amountMinor, categoryLabel, description, issues, status: statusFor(issues) };
}

export function validateRows(rows: ExtractedRow[], options: ValidationOptions): RowDraft[] {
  const drafts = rows.map((row) => validateRow(row, options));
  // Duplicados dentro del mismo archivo (exactos) y coincidencias de fecha e importe.
  const seen = new Map<string, RowDraft>();
  for (const draft of drafts) {
    if (!draft.occurredOn || !draft.kind || !draft.amountMinor) continue;
    const key = duplicateKey(draft.occurredOn, draft.kind, draft.amountMinor, draft.description);
    const first = seen.get(key);
    if (first) {
      draft.issues.push({ code: "DUPLICATE_IN_FILE", severity: "warning", message: `Es idéntica a la fila ${first.sourceRef}. Confirmá que son dos operaciones distintas o excluí una.` });
      draft.status = statusFor(draft.issues);
    } else seen.set(key, draft);
  }
  return drafts;
}

/** Recalcula una fila editada a mano en la revisión, con las mismas reglas. */
export function revalidateEdited(input: { occurredOn: string | null; kind: MovementKind | null; amountMinor: bigint | null; categoryLabel: string | null; description: string }, sheetMonth: number | null, sheet: string): { issues: RowIssue[]; status: RowStatus } {
  const issues: RowIssue[] = [];
  if (!input.occurredOn) issues.push({ code: "DATE_MISSING", severity: "error", message: "Falta la fecha." });
  else if (sheetMonth && Number(input.occurredOn.slice(5, 7)) !== sheetMonth) issues.push({ code: "DATE_SHEET_MISMATCH", severity: "warning", message: `La fecha no corresponde al mes de la hoja ${sheet}.` });
  if (!input.kind) issues.push({ code: "KIND_MISSING", severity: "error", message: "Elegí el tipo de movimiento." });
  if (!input.amountMinor || input.amountMinor <= 0n) issues.push({ code: "AMOUNT_MISSING", severity: "error", message: "Ingresá un importe mayor a cero." });
  if (!input.categoryLabel && input.kind !== "transfer") issues.push({ code: "CATEGORY_MISSING", severity: "warning", message: "Sin categoría." });
  if (!input.description) issues.push({ code: "DESCRIPTION_MISSING", severity: "warning", message: "Sin descripción." });
  issues.push({ code: "EDITED_IN_REVIEW", severity: "info", message: "Corregida durante la revisión de la importación." });
  return { issues, status: statusFor(issues) };
}
