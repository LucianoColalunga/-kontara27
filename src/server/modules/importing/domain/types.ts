import type { MovementKind } from "@/lib/movement-kinds";

export type Severity = "error" | "warning" | "info";

export interface RawCellValue {
  text: string | null;
  type: "number" | "string" | "boolean" | "error" | "date" | null;
}

export interface ExtractedRow {
  position: number;
  sheet: string;
  rowNumber: number;
  /** «AGOSTO!5»: permite rastrear cada movimiento hasta su celda de origen. */
  sourceRef: string;
  /** Mes calendario que representa la hoja (1–12), si la plantilla es mensual. */
  sheetMonth: number | null;
  date: RawCellValue;
  category: RawCellValue;
  description: RawCellValue;
  expense: RawCellValue;
  income: RawCellValue;
  /** Formato tabular con un solo importe con signo. */
  signedAmount?: RawCellValue;
}

export interface DeclaredTotal {
  sheet: string;
  cell: string;
  label: string;
  /** Valor exacto que muestra la planilla (texto decimal). */
  value: string;
  formula: string | null;
}

export interface WorkbookFinding {
  code: string;
  severity: Severity;
  message: string;
  sheet?: string;
  cell?: string;
  /** Diferencia en unidades de la moneda (texto decimal), si se puede cuantificar. */
  impact?: string;
}

export interface Extraction {
  format: "monthly_sheets" | "tabular";
  rows: ExtractedRow[];
  declared: { perSheet: Record<string, { expense?: DeclaredTotal; income?: DeclaredTotal; net?: DeclaredTotal }>; workbook: { expense?: DeclaredTotal; income?: DeclaredTotal; net?: DeclaredTotal } };
  findings: WorkbookFinding[];
  detectedYear: number | null;
}

export interface RowIssue {
  code: string;
  severity: Severity;
  message: string;
}

export type RowStatus = "ready" | "needs_review" | "blocked" | "excluded" | "imported";

export interface RowDraft {
  position: number;
  sourceRef: string;
  sheet: string;
  raw: Record<string, unknown>;
  occurredOn: string | null;
  kind: MovementKind | null;
  amountMinor: bigint | null;
  categoryLabel: string | null;
  description: string;
  issues: RowIssue[];
  status: RowStatus;
}
