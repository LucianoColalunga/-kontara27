/**
 * Dinero en unidades menores enteras (bigint). Nunca se usa `number` para importes: 0,1 + 0,2 ≠ 0,3.
 * Este archivo no depende del servidor: lo usan la interfaz (formato y parseo) y el dominio.
 */

const exponentCache = new Map<string, number>();

/** Cantidad de decimales de una moneda ISO 4217 (ARS 2, CLP 0, JPY 0, BHD 3…). */
export function currencyExponent(currency: string): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  let exponent = 2;
  try {
    exponent = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    exponent = 2;
  }
  exponentCache.set(currency, exponent);
  return exponent;
}

export class MoneyParseError extends Error {}

/**
 * Convierte lo que escribe una persona en unidades menores. Acepta «1.234,56», «1234,56»,
 * «1,234.56», «1234.56», «$ 1.234» y negativos con «-». Rechaza más decimales de los que admite
 * la moneda en lugar de redondear en silencio.
 *
 * Caso ambiguo (un solo separador seguido de tres dígitos, como «1.234» o «10,555»): decide el
 * separador decimal del idioma (en es-AR la coma es decimal y el punto agrupa miles).
 */
export function parseMoney(input: string, currency: string, options: { decimalSeparator?: "," | "." } = {}): bigint {
  const localeDecimal = options.decimalSeparator ?? ",";
  const exponent = currencyExponent(currency);
  let text = input.trim().replace(/[\s $€£]|[A-Z]{3}/g, "");
  if (!text) throw new MoneyParseError("Ingresá un importe.");
  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) throw new MoneyParseError("El importe solo puede tener números, puntos y comas.");

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let integerPart = text;
  let fraction = "";
  const decimalSep = lastComma > lastDot ? "," : lastDot > lastComma ? "." : null;
  if (decimalSep) {
    const idx = text.lastIndexOf(decimalSep);
    const after = text.slice(idx + 1);
    const thousandsSep = decimalSep === "," ? "." : ",";
    const sepCount = text.split(decimalSep).length - 1;
    // «1,234,567» (separador repetido) siempre agrupa miles; «1.234» depende del idioma.
    const looksLikeThousands = !text.includes(thousandsSep) && (sepCount > 1 || (after.length === 3 && decimalSep !== localeDecimal));
    if (looksLikeThousands) {
      integerPart = text.split(decimalSep).join("");
    } else {
      integerPart = text.slice(0, idx).split(thousandsSep).join("");
      fraction = after;
    }
  }
  if (!/^\d+$/.test(integerPart || "0") || !/^\d*$/.test(fraction)) throw new MoneyParseError("Formato de importe no reconocido.");
  if (fraction.length > exponent) throw new MoneyParseError(exponent === 0 ? `${currency} no admite decimales.` : `Usá como máximo ${exponent} decimales.`);
  const minor = BigInt(integerPart || "0") * 10n ** BigInt(exponent) + BigInt((fraction || "").padEnd(exponent, "0") || "0");
  return negative ? -minor : minor;
}

/** Convierte un número de una planilla (ya leído como texto exacto) a unidades menores, sin redondear. */
export function decimalStringToMinor(value: string, currency: string): bigint {
  const exponent = currencyExponent(currency);
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new MoneyParseError(`Número no válido: ${value}`);
  const [, sign, int, frac = ""] = match;
  const trimmedFrac = frac.replace(/0+$/, "");
  if (trimmedFrac.length > exponent) throw new MoneyParseError(`El importe ${value} tiene más de ${exponent} decimales.`);
  const minor = BigInt(int!) * 10n ** BigInt(exponent) + BigInt(trimmedFrac.padEnd(exponent, "0") || "0");
  return sign ? -minor : minor;
}

/** Importe como texto decimal sin formato regional: «1234.56». Útil para CSV y XLSX. */
export function minorToDecimalString(minor: bigint, currency: string): string {
  const exponent = currencyExponent(currency);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const factor = 10n ** BigInt(exponent);
  const int = abs / factor;
  const frac = abs % factor;
  const text = exponent === 0 ? int.toString() : `${int}.${frac.toString().padStart(exponent, "0")}`;
  return negative ? `-${text}` : text;
}

/** Formato para mostrar: «$ 1.234,56» en es-AR. Usa la ruta decimal exacta, sin pasar por float. */
export function formatMoney(minor: bigint, currency: string, locale = "es-AR", options: { compact?: boolean; signDisplay?: "auto" | "always" | "exceptZero" } = {}): string {
  const decimal = minorToDecimalString(minor, currency);
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: options.compact ? "compact" : "standard",
    signDisplay: options.signDisplay ?? "auto",
    maximumFractionDigits: options.compact ? 1 : currencyExponent(currency),
    minimumFractionDigits: options.compact ? 0 : currencyExponent(currency),
  });
  // Intl acepta strings decimales exactos («1234.56») sin convertirlos a double cuando no hay pérdida.
  return formatter.format(decimal as unknown as number);
}

export function sumMinor(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/** Porcentaje entero redondeado (para barras y alertas), sin float para valores grandes. */
export function percentOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 1000n) / whole) / 10;
}
