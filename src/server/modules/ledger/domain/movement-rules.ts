import { z } from "zod";
import { categoryAllowed, KIND_INFO, type MovementKind } from "@/lib/movement-kinds";
import { MoneyParseError, parseMoney } from "@/lib/money";
import { ValidationError } from "@/server/platform/errors";

const optionalUuid = z
  .union([z.uuid(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const movementInput = z.object({
  typeId: z.uuid({ error: "Elegí el tipo de movimiento." }),
  occurredOn: z.iso.date({ error: "Ingresá una fecha válida." }),
  amount: z.string().trim().min(1, "Ingresá el importe.").max(32),
  categoryId: optionalUuid,
  accountId: optionalUuid,
  counterAccountId: optionalUuid,
  sectorId: optionalUuid,
  paymentMethodId: optionalUuid,
  description: z.string().trim().max(500).default(""),
  notes: optionalText(4000),
  reference: optionalText(120),
  status: z.enum(["completed", "pending", "cancelled"]).default("completed"),
});

export type MovementInput = z.infer<typeof movementInput>;

export interface RuleContext {
  kind: MovementKind;
  organizationCurrency: string;
  category: { scope: "income" | "expense" | "both"; isArchived: boolean } | null;
  account: { currency: string; isArchived: boolean } | null;
  counterAccount: { currency: string; isArchived: boolean } | null;
  /** En una edición se permiten referencias archivadas que el movimiento ya tenía. */
  allowArchived: boolean;
}

/** Reglas de negocio de un movimiento. Devuelve la moneda y el importe en unidades menores. */
export function validateMovement(input: MovementInput, rc: RuleContext): { amountMinor: bigint; currency: string } {
  const errors: Record<string, string> = {};
  const info = KIND_INFO[rc.kind];

  if (rc.kind === "transfer") {
    if (!input.accountId) errors.accountId = "Elegí la cuenta de origen.";
    if (!input.counterAccountId) errors.counterAccountId = "Elegí la cuenta de destino.";
    if (input.accountId && input.accountId === input.counterAccountId) errors.counterAccountId = "Origen y destino tienen que ser cuentas distintas.";
    if (rc.account && rc.counterAccount && rc.account.currency !== rc.counterAccount.currency) {
      errors.counterAccountId = "Las transferencias son entre cuentas de la misma moneda.";
    }
    if (input.categoryId) errors.categoryId = "Las transferencias no llevan categoría.";
  } else if (input.counterAccountId) {
    errors.counterAccountId = "Solo las transferencias tienen cuenta de destino.";
  }

  if (input.categoryId && !rc.category) errors.categoryId = "La categoría no existe.";
  if (rc.category && !categoryAllowed(rc.kind, rc.category.scope)) {
    errors.categoryId = `Esa categoría no corresponde a un movimiento de tipo «${info.label}».`;
  }
  if (input.accountId && !rc.account) errors.accountId = "La cuenta no existe.";
  if (input.counterAccountId && !rc.counterAccount) errors.counterAccountId = "La cuenta de destino no existe.";
  if (!rc.allowArchived) {
    if (rc.category?.isArchived) errors.categoryId = "La categoría está archivada.";
    if (rc.account?.isArchived) errors.accountId = "La cuenta está archivada.";
    if (rc.counterAccount?.isArchived) errors.counterAccountId = "La cuenta de destino está archivada.";
  }

  const currency = rc.account?.currency ?? rc.organizationCurrency;
  let amountMinor = 0n;
  try {
    amountMinor = parseMoney(input.amount, currency);
    if (amountMinor <= 0n) errors.amount = "El importe tiene que ser mayor a cero. El tipo de movimiento define si suma o resta.";
    if (amountMinor > 9_000_000_000_000_000n) errors.amount = "El importe es demasiado grande.";
  } catch (error) {
    errors.amount = error instanceof MoneyParseError ? error.message : "Importe inválido.";
  }

  const year = Number(input.occurredOn.slice(0, 4));
  if (year < 1990 || year > 2100) errors.occurredOn = "Revisá el año de la fecha.";

  if (Object.keys(errors).length) throw new ValidationError(Object.values(errors)[0]!, errors);
  return { amountMinor, currency };
}
