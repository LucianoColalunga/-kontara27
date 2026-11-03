import { cellAt, type Cell, columnLetters, type Sheet, type Workbook } from "../infrastructure/xlsx-reader";
import { matchHeader, monthFromSheetName, normalizeLabel } from "./text";
import type { DeclaredTotal, ExtractedRow, Extraction, RawCellValue, WorkbookFinding } from "./types";

type Column = "date" | "category" | "description" | "expense" | "income" | "amount" | "type";

const raw = (cell: Cell | undefined): RawCellValue => (cell && cell.value !== "" ? { text: cell.value, type: cell.type } : { text: null, type: null });

/** Busca la fila de encabezado en las primeras 15 filas y devuelve las columnas reconocidas. */
function findHeader(sheet: Sheet): { row: number; columns: Partial<Record<Column, number>> } | null {
  for (let row = 1; row <= Math.min(15, sheet.maxRow); row++) {
    const columns: Partial<Record<Column, number>> = {};
    for (let col = 1; col <= Math.min(sheet.maxCol, 30); col++) {
      const cell = cellAt(sheet, col, row);
      if (cell?.type !== "string") continue;
      const key = matchHeader(cell.value);
      if (key && columns[key] === undefined) columns[key] = col;
    }
    const hasAmounts = (columns.expense && columns.income) || columns.amount;
    if (columns.date && hasAmounts) return { row, columns };
  }
  return null;
}

const TOTAL_LABELS: Array<{ key: "expense" | "income" | "net"; re: RegExp }> = [
  { key: "expense", re: /^(gastos?|egresos?) totales?$|^total (de )?(gastos?|egresos?)$/ },
  { key: "income", re: /^ingresos? totales?$|^total (de )?ingresos?$/ },
  { key: "net", re: /^(ahorros?|diferencia( total)?|resultado|saldo|balance|neto)$/ },
];

/** Totales que declara una hoja: una etiqueta («GASTOS TOTALES») y el primer número a su derecha. */
function declaredTotals(sheet: Sheet): { expense?: DeclaredTotal; income?: DeclaredTotal; net?: DeclaredTotal } {
  const out: { expense?: DeclaredTotal; income?: DeclaredTotal; net?: DeclaredTotal } = {};
  for (const cell of sheet.cells.values()) {
    if (cell.type !== "string") continue;
    const label = normalizeLabel(cell.value);
    const match = TOTAL_LABELS.find((t) => t.re.test(label));
    if (!match || out[match.key]) continue;
    for (let col = cell.col + 1; col <= cell.col + 5; col++) {
      const target = cellAt(sheet, col, cell.row);
      if (target && (target.type === "number" || target.formula)) {
        out[match.key] = { sheet: sheet.name, cell: target.ref, label: cell.value, value: target.type === "number" ? target.value : "0", formula: target.formula, shared: target.formulaShared ?? false };
        break;
      }
    }
  }
  return out;
}

function decimal(text: string | null): bigint | null {
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  const [int, frac = ""] = text.replace("-", "").split(".");
  const value = BigInt(int!) * 1_000_000n + BigInt(frac.slice(0, 6).padEnd(6, "0"));
  return text.startsWith("-") ? -value : value;
}

/** Diferencia en texto decimal (micro-unidades → «45000» o «0.5»). */
function microToText(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const int = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

/**
 * Plantilla de hojas mensuales (formato habitual de planillas contables caseras): una hoja por mes con columnas
 * Fecha / Categoría / Descripción / Gasto / Ingreso, bloques de totales y una hoja anual.
 */
export function extractMonthlySheets(workbook: Workbook): Extraction | null {
  const monthSheets = workbook.sheets
    .map((sheet) => ({ sheet, month: monthFromSheetName(sheet.name), header: findHeader(sheet) }))
    .filter((s) => s.month !== null && s.header && s.header.columns.expense && s.header.columns.income);
  if (monthSheets.length < 1) return null;

  const rows: ExtractedRow[] = [];
  const findings: WorkbookFinding[] = [];
  const perSheet: Extraction["declared"]["perSheet"] = {};
  const years = new Map<number, number>();

  for (const { sheet, month, header } of monthSheets) {
    const cols = header!.columns;
    let lastDataRow = 0;
    let firstDataRow = 0;
    let recomputedExpense = 0n;
    let recomputedIncome = 0n;
    for (let row = header!.row + 1; row <= sheet.maxRow; row++) {
      const get = (col?: number) => (col ? cellAt(sheet, col, row) : undefined);
      const extracted: ExtractedRow = {
        position: rows.length + 1,
        sheet: sheet.name,
        rowNumber: row,
        sourceRef: `${sheet.name}!${row}`,
        sheetMonth: month,
        date: raw(get(cols.date)),
        category: raw(get(cols.category)),
        description: raw(get(cols.description)),
        expense: raw(get(cols.expense)),
        income: raw(get(cols.income)),
      };
      const values = [extracted.date, extracted.category, extracted.description, extracted.expense, extracted.income];
      if (values.every((v) => v.text === null || v.text.trim() === "")) continue;
      rows.push(extracted);
      lastDataRow = row;
      firstDataRow ||= row;
      if (extracted.date.type === "date") {
        const y = Number(extracted.date.text!.slice(0, 4));
        years.set(y, (years.get(y) ?? 0) + 1);
      }
      recomputedExpense += decimal(extracted.expense.text) ?? 0n;
      recomputedIncome += decimal(extracted.income.text) ?? 0n;
    }

    const totals = declaredTotals(sheet);
    perSheet[sheet.name] = totals;
    for (const [key, total] of Object.entries(totals) as Array<["expense" | "income" | "net", DeclaredTotal]>) {
      if (!total.formula) {
        findings.push({ code: "TOTAL_HARDCODED", severity: "warning", sheet: sheet.name, cell: total.cell, message: `«${total.label}» (${sheet.name}!${total.cell}) es un valor escrito a mano (${total.value}), no una fórmula.` });
      }
      const column = key === "expense" ? cols.expense : key === "income" ? cols.income : undefined;
      const sumRange = total.formula && !total.shared ? /^SUM\(\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)\)$/i.exec(total.formula.replace(/\s/g, "")) : null;
      if (sumRange && column && sumRange[1]!.toUpperCase() === columnLetters(column)) {
        const start = Number(sumRange[2]);
        const end = Number(sumRange[4]);
        if (start > header!.row + 1) {
          const skipped = rows.filter((r) => r.sheet === sheet.name && r.rowNumber < start && (key === "expense" ? r.expense.text : r.income.text));
          findings.push({ code: "SUM_RANGE_SKIPS_ROWS", severity: skipped.length ? "error" : "warning", sheet: sheet.name, cell: total.cell, message: `${sheet.name}!${total.cell} suma desde la fila ${start} (${total.formula}): las filas ${header!.row + 1}–${start - 1} quedan afuera${skipped.length ? ` y tienen ${skipped.length} importe(s)` : " (hoy vacías)"}.` });
        }
        if (lastDataRow > end) {
          findings.push({ code: "DATA_OUTSIDE_SUM_RANGE", severity: "error", sheet: sheet.name, cell: total.cell, message: `${sheet.name}!${total.cell} suma hasta la fila ${end}, pero hay datos hasta la fila ${lastDataRow}.` });
        }
      }
    }
    // Totales declarados vs. recálculo independiente.
    const compare = (key: "expense" | "income", recomputed: bigint) => {
      const declared = totals[key] ? decimal(totals[key]!.value) : null;
      if (declared !== null && declared !== recomputed) {
        findings.push({ code: "TOTAL_MISMATCH", severity: "error", sheet: sheet.name, cell: totals[key]!.cell, message: `${sheet.name}: la planilla declara ${key === "expense" ? "gastos" : "ingresos"} por ${totals[key]!.value} y la suma de las filas da ${microToText(recomputed)}.`, impact: microToText(declared - recomputed) });
      }
    };
    compare("expense", recomputedExpense);
    compare("income", recomputedIncome);
    if (totals.net) {
      const declaredNet = decimal(totals.net.value);
      const expected = recomputedIncome - recomputedExpense;
      if (declaredNet !== null && declaredNet !== expected) {
        findings.push({ code: "NET_MISMATCH", severity: "error", sheet: sheet.name, cell: totals.net.cell, message: `${sheet.name}!${totals.net.cell} («${totals.net.label}») muestra ${totals.net.value}, pero ingresos − gastos da ${microToText(expected)}.`, impact: microToText(declaredNet - expected) });
      }
    }
    // Resúmenes por categoría (SUMIFS) que no cubren todos los importes.
    for (const [key, column, recomputed] of [["expense", cols.expense, recomputedExpense], ["income", cols.income, recomputedIncome]] as const) {
      const letter = columnLetters(column!);
      const sumifs = [...sheet.cells.values()].filter((c) => c.formula && new RegExp(`^SUMIFS\\(\\$?${letter}\\$?\\d`, "i").test(c.formula.replace(/\s/g, "")));
      if (sumifs.length === 0) continue;
      const covered = sumifs.reduce((acc, c) => acc + (decimal(c.value) ?? 0n), 0n);
      if (covered < recomputed) {
        findings.push({ code: "CATEGORY_SUMMARY_GAP", severity: "warning", sheet: sheet.name, message: `${sheet.name}: el resumen por categoría de ${key === "expense" ? "gastos" : "ingresos"} suma ${microToText(covered)} de ${microToText(recomputed)}; ${microToText(recomputed - covered)} no aparecen en ningún renglón del resumen.`, impact: microToText(recomputed - covered) });
      }
    }
    void firstDataRow;
  }

  // Hoja anual: qué meses suma y si el resultado coincide.
  const totalSheet = workbook.sheets.find((s) => /^(total|totales|resumen|anual|resumen anual)$/.test(normalizeLabel(s.name)));
  const workbookTotals = totalSheet ? declaredTotals(totalSheet) : {};
  if (totalSheet) {
    const monthsWithData = new Set(rows.map((r) => r.sheet));
    for (const [key, total] of Object.entries(workbookTotals) as Array<["expense" | "income" | "net", DeclaredTotal]>) {
      if (!total.formula) {
        findings.push({ code: "TOTAL_HARDCODED", severity: "warning", sheet: totalSheet.name, cell: total.cell, message: `«${total.label}» (${totalSheet.name}!${total.cell}) es un valor escrito a mano.` });
        continue;
      }
      const referenced = new Set([...total.formula.matchAll(/'?([A-Za-zÁÉÍÓÚÑáéíóúñ ]+)'?!/g)].map((m) => normalizeLabel(m[1]!)));
      const missing = monthSheets.filter((s) => !referenced.has(normalizeLabel(s.sheet.name)));
      if (missing.length) {
        const withData = missing.filter((s) => monthsWithData.has(s.sheet.name));
        findings.push({ code: "TOTAL_SHEET_SCOPE", severity: withData.length ? "error" : "warning", sheet: totalSheet.name, cell: total.cell, message: `${totalSheet.name}!${total.cell} («${total.label}») no incluye ${missing.map((s) => s.sheet.name).join(", ")}${withData.length ? `, y ${withData.map((s) => s.sheet.name).join(", ")} tiene(n) movimientos` : " (hoy sin movimientos)"}.` });
      }
      void key;
    }
    const allExpense = rows.reduce((acc, r) => acc + (decimal(r.expense.text) ?? 0n), 0n);
    const allIncome = rows.reduce((acc, r) => acc + (decimal(r.income.text) ?? 0n), 0n);
    const check = (key: "expense" | "income" | "net", expected: bigint, label: string) => {
      const t = workbookTotals[key];
      const declared = t ? decimal(t.value) : null;
      if (t && declared !== null && declared !== expected) {
        findings.push({ code: "WORKBOOK_TOTAL_MISMATCH", severity: "error", sheet: totalSheet.name, cell: t.cell, message: `${totalSheet.name}!${t.cell} muestra ${label} ${t.value}; el recálculo de todas las filas da ${microToText(expected)}.`, impact: microToText(declared - expected) });
      }
    };
    check("expense", allExpense, "gastos por");
    check("income", allIncome, "ingresos por");
    check("net", allIncome - allExpense, "una diferencia de");
  }

  const detectedYear = [...years.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { format: "monthly_sheets", rows, findings, declared: { perSheet, workbook: workbookTotals }, detectedYear };
}

/** Tabla simple en una hoja: Fecha, Descripción, Categoría y un importe con signo o columnas Debe/Haber. */
export function extractTabular(workbook: Workbook): Extraction | null {
  for (const sheet of workbook.sheets.filter((s) => s.state === "visible")) {
    const header = findHeader(sheet);
    if (!header) continue;
    const cols = header.columns;
    const rows: ExtractedRow[] = [];
    for (let row = header.row + 1; row <= sheet.maxRow; row++) {
      const get = (col?: number) => (col ? cellAt(sheet, col, row) : undefined);
      const extracted: ExtractedRow = {
        position: rows.length + 1,
        sheet: sheet.name,
        rowNumber: row,
        sourceRef: `${sheet.name}!${row}`,
        sheetMonth: null,
        date: raw(get(cols.date)),
        category: raw(get(cols.category)),
        description: raw(get(cols.description)),
        expense: raw(get(cols.expense)),
        income: raw(get(cols.income)),
        signedAmount: cols.amount ? raw(get(cols.amount)) : undefined,
      };
      const values = [extracted.date, extracted.category, extracted.description, extracted.expense, extracted.income, extracted.signedAmount ?? { text: null, type: null }];
      if (values.every((v) => v.text === null || v.text.trim() === "")) continue;
      rows.push(extracted);
    }
    if (rows.length) return { format: "tabular", rows, findings: [], declared: { perSheet: {}, workbook: {} }, detectedYear: null };
  }
  return null;
}

export function extract(workbook: Workbook): Extraction | null {
  return extractMonthlySheets(workbook) ?? extractTabular(workbook);
}
