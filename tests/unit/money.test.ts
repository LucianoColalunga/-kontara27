import { describe, expect, it } from "vitest";
import { currencyExponent, decimalStringToMinor, formatMoney, minorToDecimalString, MoneyParseError, parseMoney, percentOf, sumMinor } from "@/lib/money";

describe("parseMoney", () => {
  it.each([
    ["1.234,56", 123456n],
    ["1234,56", 123456n],
    ["1,234.56", 123456n],
    ["1234.56", 123456n],
    ["$ 1.234", 123400n],
    ["1.234.567", 123456700n],
    ["0,5", 50n],
    ["12", 1200n],
    ["-15,30", -1530n],
    ["13579.29", 1357929n],
  ])("interpreta %s como %s centavos", (input, expected) => {
    expect(parseMoney(input, "ARS")).toBe(expected);
  });

  it("respeta monedas sin decimales", () => {
    expect(parseMoney("1.500", "CLP")).toBe(1500n);
    expect(() => parseMoney("1500,5", "CLP")).toThrow(MoneyParseError);
  });

  it("rechaza más decimales de los que admite la moneda en lugar de redondear", () => {
    expect(() => parseMoney("10,555", "USD")).toThrow(/2 decimales/);
    expect(() => parseMoney("10.555", "USD", { decimalSeparator: "." })).toThrow(/2 decimales/);
  });

  it("resuelve el caso ambiguo con el separador decimal del idioma", () => {
    expect(parseMoney("1.234", "ARS")).toBe(123400n);
    expect(parseMoney("1,234", "USD", { decimalSeparator: "." })).toBe(123400n);
  });

  it("rechaza texto que no es un importe", () => {
    expect(() => parseMoney("diez", "ARS")).toThrow(MoneyParseError);
    expect(() => parseMoney("", "ARS")).toThrow(MoneyParseError);
  });
});

describe("conversiones exactas", () => {
  it("decimalStringToMinor no pasa por coma flotante", () => {
    expect(decimalStringToMinor("52731.08", "ARS")).toBe(5273108n);
    expect(decimalStringToMinor("0.1", "ARS") + decimalStringToMinor("0.2", "ARS")).toBe(decimalStringToMinor("0.3", "ARS"));
    expect(decimalStringToMinor("128964.730", "ARS")).toBe(12896473n);
    expect(() => decimalStringToMinor("1.005", "ARS")).toThrow();
  });

  it("minorToDecimalString es la inversa", () => {
    expect(minorToDecimalString(1357929n, "ARS")).toBe("13579.29");
    expect(minorToDecimalString(-5n, "ARS")).toBe("-0.05");
    expect(minorToDecimalString(1500n, "CLP")).toBe("1500");
  });

  it("suma millones de importes sin error de redondeo", () => {
    const values = Array.from({ length: 100_000 }, () => 1n);
    expect(sumMinor(values)).toBe(100_000n);
  });

  it("formatea con el idioma de la organización", () => {
    expect(formatMoney(123456n, "ARS", "es-AR").replace(/\s/g, " ")).toMatch(/1\.234,56/);
    expect(formatMoney(123456n, "USD", "en-US")).toBe("$1,234.56");
  });

  it("porcentajes enteros con un decimal", () => {
    expect(percentOf(80n, 100n)).toBe(80);
    expect(percentOf(1n, 3n)).toBe(33.3);
    expect(percentOf(5n, 0n)).toBe(0);
  });

  it("conoce el exponente de cada moneda", () => {
    expect(currencyExponent("ARS")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("BHD")).toBe(3);
  });
});
