import { createHmac, randomBytes } from "node:crypto";

/**
 * TOTP según RFC 6238 (HMAC-SHA1, 6 dígitos, pasos de 30 s), compatible con Google Authenticator,
 * 1Password, Authy y Microsoft Authenticator. Implementado sobre node:crypto y verificado con los
 * vectores de prueba del RFC (tests/unit/totp.test.ts).
 */
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Secreto base32 inválido");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Secreto de 160 bits (longitud recomendada por el RFC 4226 para SHA-1). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function timeStep(at: Date | number): number {
  const ms = typeof at === "number" ? at : at.getTime();
  return Math.floor(ms / 1000 / TOTP_PERIOD_SECONDS);
}

export interface TotpVerification {
  valid: boolean;
  /** Paso aceptado: se guarda para rechazar el mismo código si se vuelve a enviar. */
  step?: number;
}

/**
 * Acepta el paso actual y uno de tolerancia hacia cada lado (desfase de reloj de hasta 30 s).
 * Rechaza pasos menores o iguales al último usado (protección contra repetición).
 */
export function verifyTotp(secretBase32: string, code: string, at: Date | number, lastUsedStep: number | null): TotpVerification {
  if (!/^\d{6}$/.test(code)) return { valid: false };
  const secret = base32Decode(secretBase32);
  const current = timeStep(at);
  for (const step of [current, current - 1, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (timingSafeCodeEqual(hotp(secret, step), code)) return { valid: true, step };
  }
  return { valid: false };
}

function timingSafeCodeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function totpUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
