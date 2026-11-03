/** Datos iniciales de una empresa nueva. Todo es editable o archivable después. */

export const DEFAULT_MOVEMENT_TYPES = [
  { name: "Ingreso", baseKind: "income" },
  { name: "Gasto", baseKind: "expense" },
  { name: "Devolución recibida", baseKind: "refund_in" },
  { name: "Devolución emitida", baseKind: "refund_out" },
  { name: "Ajuste positivo", baseKind: "adjustment_in" },
  { name: "Ajuste negativo", baseKind: "adjustment_out" },
  { name: "Transferencia entre cuentas", baseKind: "transfer" },
  { name: "Inversión", baseKind: "investment" },
  { name: "Aporte de socios", baseKind: "contribution" },
  { name: "Retiro de socios", baseKind: "withdrawal" },
] as const;

export const DEFAULT_PAYMENT_METHODS = ["Efectivo", "Transferencia bancaria", "Tarjeta de débito", "Tarjeta de crédito", "Billetera virtual", "Cheque", "Otro"];

export const DEFAULT_CATEGORIES: Array<{ name: string; scope: "income" | "expense" | "both"; color: string }> = [
  { name: "Ventas", scope: "income", color: "#1D5BFF" },
  { name: "Servicios prestados", scope: "income", color: "#0E9F6E" },
  { name: "Otros ingresos", scope: "income", color: "#7C8BA1" },
  { name: "Proveedores", scope: "expense", color: "#E8590C" },
  { name: "Sueldos", scope: "expense", color: "#AE3EC9" },
  { name: "Alquiler", scope: "expense", color: "#C2255C" },
  { name: "Servicios", scope: "expense", color: "#F59F00" },
  { name: "Impuestos", scope: "expense", color: "#495057" },
  { name: "Transporte", scope: "expense", color: "#1098AD" },
  { name: "Otros gastos", scope: "expense", color: "#868E96" },
];
