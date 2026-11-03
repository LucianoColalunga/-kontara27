import { describe, expect, it } from "vitest";
import { categoryAllowed, signedAmount } from "@/lib/movement-kinds";
import { checkPassword } from "@/server/modules/identity/domain/password-policy";
import { normalizeEmail } from "@/server/modules/identity/domain/email";
import { isValidCuit, slugify } from "@/server/modules/tenancy/domain/organization";
import { validateMovement } from "@/server/modules/ledger/domain/movement-rules";
import { summarize } from "@/server/modules/reporting/application/reporting-service";
import { monthsBetween, previousPeriod } from "@/server/modules/reporting/application/reporting-service";
import { budgetPeriod, budgetState } from "@/server/modules/budgeting/application/budget-service";
import { nextOccurrence } from "@/server/modules/scheduling/application/reminder-service";
import { resolveJurisdiction } from "@/server/modules/privacy/application/privacy-service";
import { ValidationError } from "@/server/platform/errors";

describe("política de contraseñas", () => {
  it("exige longitud y rechaza contraseñas comunes o derivadas", () => {
    expect(checkPassword("corta")).toMatch(/al menos 10/);
    expect(checkPassword("contraseña123")).toMatch(/común/);
    expect(checkPassword("1234567890")).not.toBeNull();
    expect(checkPassword("aaaaaaaaaaaa")).toMatch(/repetido/);
    expect(checkPassword("luciano-2026-x", { email: "luciano@example.com" })).toMatch(/correo/);
    expect(checkPassword("Tarde de lluvia en Corrientes")).toBeNull();
  });
});

describe("identidad y organización", () => {
  it("normaliza correos sin alterar su titularidad", () => {
    expect(normalizeEmail("  Ana.Perez+Caja@Example.COM ")).toBe("ana.perez+caja@example.com");
  });

  it("valida el dígito verificador del CUIT", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("20-12345678-7")).toBe(false);
    expect(isValidCuit("30-71234567-1")).toBe(true);
    expect(isValidCuit("30-71234567-2")).toBe(false);
    expect(isValidCuit("123")).toBe(false);
  });

  it("genera slugs seguros", () => {
    expect(slugify("Acme Servicios Técnicos S.R.L.")).toBe("acme-servicios-tecnicos-s-r-l");
    expect(slugify("!!!")).toBe("empresa");
  });
});

describe("semántica de movimientos", () => {
  it("el signo depende de la naturaleza", () => {
    expect(signedAmount("income", 100n)).toBe(100n);
    expect(signedAmount("expense", 100n)).toBe(-100n);
    expect(signedAmount("refund_in", 100n)).toBe(100n);
    expect(signedAmount("investment", 100n)).toBe(-100n);
  });

  it("solo admite categorías compatibles", () => {
    expect(categoryAllowed("expense", "income")).toBe(false);
    expect(categoryAllowed("expense", "both")).toBe(true);
    expect(categoryAllowed("refund_in", "expense")).toBe(true);
    expect(categoryAllowed("transfer", "income")).toBe(true);
  });

  const base = { typeId: "00000000-0000-7000-8000-000000000000", occurredOn: "2026-08-10", amount: "1.000,50", categoryId: null, accountId: null, counterAccountId: null, sectorId: null, paymentMethodId: null, description: "", notes: null, reference: null, status: "completed" as const };
  const rc = { organizationCurrency: "ARS", category: null, account: null, counterAccount: null, allowArchived: false };

  it("calcula el importe en centavos con la moneda de la cuenta", () => {
    expect(validateMovement(base, { ...rc, kind: "expense" })).toEqual({ amountMinor: 100050n, currency: "ARS" });
    expect(validateMovement({ ...base, amount: "10.5", accountId: "a" }, { ...rc, kind: "expense", account: { currency: "USD", isArchived: false } })).toEqual({ amountMinor: 1050n, currency: "USD" });
  });

  it("una transferencia exige dos cuentas distintas de la misma moneda", () => {
    expect(() => validateMovement(base, { ...rc, kind: "transfer" })).toThrow(ValidationError);
    expect(() => validateMovement({ ...base, accountId: "a", counterAccountId: "a" }, { ...rc, kind: "transfer", account: { currency: "ARS", isArchived: false }, counterAccount: { currency: "ARS", isArchived: false } })).toThrow(/distintas/);
    expect(() => validateMovement({ ...base, accountId: "a", counterAccountId: "b" }, { ...rc, kind: "transfer", account: { currency: "ARS", isArchived: false }, counterAccount: { currency: "USD", isArchived: false } })).toThrow(/misma moneda/);
  });

  it("rechaza importes cero o negativos y categorías del lado equivocado", () => {
    expect(() => validateMovement({ ...base, amount: "0" }, { ...rc, kind: "income" })).toThrow(/mayor a cero/);
    expect(() => validateMovement({ ...base, amount: "-5" }, { ...rc, kind: "income" })).toThrow(/mayor a cero/);
    expect(() => validateMovement({ ...base, categoryId: "c" }, { ...rc, kind: "expense", category: { scope: "income", isArchived: false } })).toThrow(/no corresponde/);
  });
});

describe("cálculos financieros", () => {
  const zero = { income: 0n, refundOut: 0n, expense: 0n, refundIn: 0n, investment: 0n, contribution: 0n, withdrawal: 0n, adjustmentIn: 0n, adjustmentOut: 0n, movementCount: 0 };

  it("las devoluciones netean y las transferencias no existen para el resultado", () => {
    const s = summarize({ ...zero, income: 184250000n, expense: 131760425n, refundIn: 12300000n });
    expect(s.netIncome).toBe(184250000n);
    expect(s.netExpense).toBe(131760425n - 12300000n);
    expect(s.result).toBe(184250000n - (131760425n - 12300000n));
  });

  it("las inversiones y retiros mueven caja pero no el resultado", () => {
    const s = summarize({ ...zero, income: 1000n, expense: 400n, investment: 300n, withdrawal: 100n, contribution: 50n });
    expect(s.result).toBe(600n);
    expect(s.netCashFlow).toBe(1000n + 50n - 400n - 300n - 100n);
    expect(s.margin).toBe(60);
  });

  it("sin ingresos no hay margen", () => {
    expect(summarize({ ...zero, expense: 10n }).margin).toBeNull();
  });

  it("períodos y meses", () => {
    expect(monthsBetween("2026-06-01", "2026-11-30")).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(previousPeriod("2026-11-01", "2026-11-30")).toEqual({ from: "2026-10-02", to: "2026-10-31" });
    expect(budgetPeriod("monthly", "2026-02-14")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", key: "2026-02" });
    expect(budgetPeriod("annual", "2026-02-14")).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect(budgetState(85, 80)).toBe("warning");
    expect(budgetState(100, 80)).toBe("exceeded");
    expect(budgetState(10, 80)).toBe("ok");
  });

  it("las recurrencias respetan los meses cortos", () => {
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextOccurrence("2026-11-15", "quarterly")).toBe("2027-02-15");
    expect(nextOccurrence("2024-02-29", "yearly")).toBe("2025-02-28");
    expect(nextOccurrence("2026-12-29", "weekly")).toBe("2027-01-05");
  });
});

describe("privacidad", () => {
  it("la jurisdicción sale de la residencia declarada, no de la IP", () => {
    expect(resolveJurisdiction("AR")).toBe("AR");
    expect(resolveJurisdiction("ES")).toBe("EU");
    expect(resolveJurisdiction(null, "AR")).toBe("AR");
    expect(resolveJurisdiction(null, null)).toBe("OTHER_STRICT");
  });
});
