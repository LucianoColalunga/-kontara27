import "server-only";
import { KIND_INFO } from "@/lib/movement-kinds";
import { minorToDecimalString } from "@/lib/money";
import { neutralizeFormula, writeWorkbook, type XlsxSheet, type XlsxValue } from "@/server/modules/importing";
import type { MovementRow } from "@/server/modules/ledger";

export interface Table {
  title: string;
  columns: Array<{ header: string; kind: "text" | "date" | "money" | "integer" | "percent"; width?: number }>;
  rows: Array<Array<string | bigint | number | null>>;
  footer?: Array<Array<string | bigint | number | null>>;
}

/**
 * CSV compatible con Excel en español: separador «;», coma decimal y BOM UTF-8.
 * Los textos que empiezan con = + - @ se neutralizan (inyección de fórmulas).
 */
export function toCsv(table: Table, currency: string, decimalComma = true): Uint8Array {
  const sep = decimalComma ? ";" : ",";
  const cell = (value: string | bigint | number | null, kind: Table["columns"][number]["kind"]) => {
    if (value === null) return "";
    let text: string;
    if (kind === "money" && typeof value === "bigint") text = minorToDecimalString(value, currency);
    else text = String(value);
    if (decimalComma && (kind === "money" || kind === "percent")) text = text.replace(".", ",");
    if (kind === "text") text = neutralizeFormula(text);
    return /[";\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [table.columns.map((c) => cell(c.header, "text")).join(sep), ...[...table.rows, ...(table.footer ?? [])].map((r) => r.map((v, i) => cell(v, table.columns[i]!.kind)).join(sep))];
  return new TextEncoder().encode(`﻿${lines.join("\r\n")}\r\n`);
}

function xlsxValue(value: string | bigint | number | null, kind: Table["columns"][number]["kind"], currency: string): XlsxValue {
  if (value === null || value === "") return { kind: "empty" };
  if (kind === "money" && typeof value === "bigint") return { kind: "number", value: minorToDecimalString(value, currency) };
  if (kind === "date" && typeof value === "string") return { kind: "date", value };
  if (kind === "integer") return { kind: "number", value: String(value), style: "integer" };
  if (kind === "percent" && typeof value === "number") return { kind: "number", value: String(value / 100), style: "percent" };
  return { kind: "text", value: String(value) };
}

export function toXlsx(tables: Table[], currency: string, meta: { title: string; creator: string }): Uint8Array {
  const sheets: XlsxSheet[] = tables.map((t) => ({
    name: t.title,
    columns: t.columns.map((c) => ({ header: c.header, width: c.width })),
    rows: t.rows.map((r) => r.map((v, i) => xlsxValue(v, t.columns[i]!.kind, currency))),
    footer: t.footer?.map((r) => r.map((v, i) => xlsxValue(v, t.columns[i]!.kind, currency))),
  }));
  return writeWorkbook(sheets, meta);
}

export function movementsTable(rows: MovementRow[], currency: string): Table {
  const signed = (m: MovementRow) => {
    const d = KIND_INFO[m.kind].direction;
    return d === 0 ? m.amountMinor : BigInt(d) * m.amountMinor;
  };
  const sameCurrency = rows.filter((r) => r.currency === currency);
  const income = sameCurrency.filter((r) => KIND_INFO[r.kind].direction > 0).reduce((a, r) => a + r.amountMinor, 0n);
  const outflow = sameCurrency.filter((r) => KIND_INFO[r.kind].direction < 0).reduce((a, r) => a + r.amountMinor, 0n);
  return {
    title: "Movimientos",
    columns: [
      { header: "Fecha", kind: "date", width: 12 },
      { header: "Tipo", kind: "text", width: 20 },
      { header: "Categoría", kind: "text", width: 20 },
      { header: "Descripción", kind: "text", width: 40 },
      { header: "Cuenta", kind: "text", width: 20 },
      { header: "Cuenta destino", kind: "text", width: 18 },
      { header: "Medio de pago", kind: "text", width: 16 },
      { header: "Comprobante", kind: "text", width: 16 },
      { header: "Estado", kind: "text", width: 12 },
      { header: "Conciliado", kind: "text", width: 10 },
      { header: "Moneda", kind: "text", width: 8 },
      { header: "Importe", kind: "money", width: 16 },
    ],
    rows: rows.map((m) => [m.occurredOn, m.typeName, m.categoryName, m.description, m.accountName, m.counterAccountName, m.paymentMethodName, m.reference, m.status === "completed" ? "Realizado" : m.status === "pending" ? "Pendiente" : "Anulado", m.reconciled ? "Sí" : "No", m.currency, signed(m)]),
    footer: [
      [null, null, null, `Entradas (${currency})`, null, null, null, null, null, null, currency, income],
      [null, null, null, `Salidas (${currency})`, null, null, null, null, null, null, currency, -outflow],
    ],
  };
}
