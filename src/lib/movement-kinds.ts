/**
 * Semántica de cada naturaleza de movimiento (ADR 0004). Es la única fuente de verdad sobre cómo
 * impacta un movimiento en saldos, resultados y flujo de caja. Se usa en el servidor y en la interfaz.
 */
export const MOVEMENT_KINDS = ["income", "expense", "refund_in", "refund_out", "adjustment_in", "adjustment_out", "transfer", "investment", "contribution", "withdrawal"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export type CashflowClass = "operating" | "investing" | "financing" | "adjustment" | "internal";

export interface KindInfo {
  label: string;
  /** +1 entra dinero a la cuenta, −1 sale, 0 se mueve entre cuentas propias. */
  direction: 1 | -1 | 0;
  /** Efecto en el estado de resultados. */
  pnl: "income" | "expense" | "contra_income" | "contra_expense" | "none";
  cashflow: CashflowClass;
  /** Qué categorías se pueden elegir. */
  categoryScope: "income" | "expense" | null;
}

export const KIND_INFO: Record<MovementKind, KindInfo> = {
  income: { label: "Ingreso", direction: 1, pnl: "income", cashflow: "operating", categoryScope: "income" },
  expense: { label: "Gasto", direction: -1, pnl: "expense", cashflow: "operating", categoryScope: "expense" },
  refund_in: { label: "Devolución recibida", direction: 1, pnl: "contra_expense", cashflow: "operating", categoryScope: "expense" },
  refund_out: { label: "Devolución emitida", direction: -1, pnl: "contra_income", cashflow: "operating", categoryScope: "income" },
  adjustment_in: { label: "Ajuste positivo", direction: 1, pnl: "none", cashflow: "adjustment", categoryScope: null },
  adjustment_out: { label: "Ajuste negativo", direction: -1, pnl: "none", cashflow: "adjustment", categoryScope: null },
  transfer: { label: "Transferencia", direction: 0, pnl: "none", cashflow: "internal", categoryScope: null },
  investment: { label: "Inversión", direction: -1, pnl: "none", cashflow: "investing", categoryScope: "expense" },
  contribution: { label: "Aporte de socios", direction: 1, pnl: "none", cashflow: "financing", categoryScope: null },
  withdrawal: { label: "Retiro de socios", direction: -1, pnl: "none", cashflow: "financing", categoryScope: null },
};

export function isMovementKind(value: unknown): value is MovementKind {
  return typeof value === "string" && (MOVEMENT_KINDS as readonly string[]).includes(value);
}

/** Importe con signo según el impacto en el saldo de la cuenta principal del movimiento. */
export function signedAmount(kind: MovementKind, amountMinor: bigint): bigint {
  const direction = KIND_INFO[kind].direction;
  return direction === 0 ? -amountMinor : BigInt(direction) * amountMinor;
}

export function categoryAllowed(kind: MovementKind, scope: "income" | "expense" | "both"): boolean {
  const required = KIND_INFO[kind].categoryScope;
  if (!required) return true;
  return scope === "both" || scope === required;
}
