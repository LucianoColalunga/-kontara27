import "server-only";
import type { TenantContext } from "@/server/modules/tenancy";
import type { Table } from "../infrastructure/exporters";
import { monthsBetween, previousPeriod, type ReportingService } from "./reporting-service";

/**
 * Arma los reportes formales (estado de resultados, flujo de caja, comparación mensual) a partir de
 * los agregados del servicio. Lo usan la pantalla de reportes y las exportaciones, así coinciden siempre.
 */
export async function buildReports(reporting: ReportingService, ctx: TenantContext, period: { from: string; to: string; currency: string }) {
  const [summary, previous, lastYear, monthly, expenses, incomes, balances, unassigned] = await Promise.all([
    reporting.summary(ctx, period),
    reporting.summary(ctx, { ...previousPeriod(period.from, period.to), currency: period.currency }),
    reporting.summary(ctx, { from: shiftYear(period.from, -1), to: shiftYear(period.to, -1), currency: period.currency }),
    reporting.monthly(ctx, period),
    reporting.byCategory(ctx, period, "expense"),
    reporting.byCategory(ctx, period, "income"),
    reporting.accountBalances(ctx, period),
    reporting.unassignedFlow(ctx, period),
  ]);

  const incomeStatement: Table = {
    title: "Estado de resultados",
    columns: [
      { header: "Concepto", kind: "text", width: 40 },
      { header: "Importe", kind: "money", width: 18 },
      { header: "% sobre ingresos", kind: "percent", width: 14 },
    ],
    rows: [
      ["INGRESOS", null, null],
      ...incomes.map((c) => [`  ${c.name}`, c.totalMinor, share(c.totalMinor, summary.netIncome)] as Array<string | bigint | number | null>),
      ["Ingresos netos", summary.netIncome, summary.netIncome > 0n ? 100 : null],
      ["GASTOS", null, null],
      ...expenses.map((c) => [`  ${c.name}`, c.totalMinor, share(c.totalMinor, summary.netIncome)] as Array<string | bigint | number | null>),
      ["Gastos netos", summary.netExpense, share(summary.netExpense, summary.netIncome)],
    ],
    footer: [["Resultado del período", summary.result, summary.margin]],
  };

  const cashFlow: Table = {
    title: "Flujo de caja",
    columns: [
      { header: "Mes", kind: "text", width: 14 },
      { header: "Entradas operativas", kind: "money", width: 16 },
      { header: "Salidas operativas", kind: "money", width: 16 },
      { header: "Inversiones", kind: "money", width: 14 },
      { header: "Aportes", kind: "money", width: 14 },
      { header: "Retiros", kind: "money", width: 14 },
      { header: "Ajustes netos", kind: "money", width: 14 },
      { header: "Flujo neto", kind: "money", width: 16 },
    ],
    rows: monthly.map((m) => [m.month, m.income + m.refundIn, -(m.expense + m.refundOut), -m.investment, m.contribution, -m.withdrawal, m.adjustmentIn - m.adjustmentOut, m.netCashFlow]),
    footer: [["Total", summary.income + summary.refundIn, -(summary.expense + summary.refundOut), -summary.investment, summary.contribution, -summary.withdrawal, summary.adjustmentIn - summary.adjustmentOut, summary.netCashFlow]],
  };

  const comparison: Table = {
    title: "Comparación mensual",
    columns: [
      { header: "Mes", kind: "text", width: 14 },
      { header: "Ingresos", kind: "money", width: 16 },
      { header: "Gastos", kind: "money", width: 16 },
      { header: "Resultado", kind: "money", width: 16 },
      { header: "Margen", kind: "percent", width: 12 },
      { header: "Movimientos", kind: "integer", width: 12 },
    ],
    rows: monthly.map((m) => [m.month, m.netIncome, m.netExpense, m.result, m.margin, m.movementCount]),
  };

  const accounts: Table = {
    title: "Saldos de cuentas",
    columns: [
      { header: "Cuenta", kind: "text", width: 30 },
      { header: "Saldo inicial", kind: "money", width: 18 },
      { header: "Saldo final", kind: "money", width: 18 },
      { header: "Variación", kind: "money", width: 18 },
    ],
    rows: balances.map((b) => [b.name, b.openingMinor, b.closingMinor, b.closingMinor - b.openingMinor]),
  };

  return { summary, previous, lastYear, monthly, expenses, incomes, balances, unassigned, tables: { incomeStatement, cashFlow, comparison, accounts }, months: monthsBetween(period.from, period.to) };
}

function share(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 10000n) / whole) / 100;
}

export function shiftYear(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}
