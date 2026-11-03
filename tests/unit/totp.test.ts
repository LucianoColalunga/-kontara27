import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, timeStep, totpUri, verifyTotp } from "@/server/modules/identity/domain/totp";

// Vectores de prueba oficiales del RFC 6238, apéndice B (SHA-1, 8 dígitos).
const RFC_SECRET = Buffer.from("12345678901234567890");
const VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(VECTORS)("t=%i produce %s", (seconds, code) => {
    expect(hotp(RFC_SECRET, timeStep(seconds * 1000), 8)).toBe(code);
  });

  it("base32 ida y vuelta", () => {
    const secret = base32Encode(RFC_SECRET);
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret).equals(RFC_SECRET)).toBe(true);
  });

  const secret = base32Encode(RFC_SECRET);
  const at = 1_800_000_000_000;
  const current = hotp(RFC_SECRET, timeStep(at));

  it("acepta el código actual y uno de tolerancia por desfase de reloj", () => {
    expect(verifyTotp(secret, current, at, null).valid).toBe(true);
    const previous = hotp(RFC_SECRET, timeStep(at) - 1);
    expect(verifyTotp(secret, previous, at, null).valid).toBe(true);
    const old = hotp(RFC_SECRET, timeStep(at) - 3);
    expect(verifyTotp(secret, old, at, null).valid).toBe(false);
  });

  it("rechaza reutilizar un código ya usado", () => {
    const first = verifyTotp(secret, current, at, null);
    expect(first.valid).toBe(true);
    expect(verifyTotp(secret, current, at, first.step!).valid).toBe(false);
  });

  it("rechaza formatos inválidos", () => {
    expect(verifyTotp(secret, "12345", at, null).valid).toBe(false);
    expect(verifyTotp(secret, "abcdef", at, null).valid).toBe(false);
  });

  it("arma la URI otpauth para la app de autenticación", () => {
    const uri = totpUri(secret, "ana@example.test", "Kontara 27");
    expect(uri).toMatch(/^otpauth:\/\/totp\/Kontara%2027%3Aana%40example\.test\?/);
    expect(uri).toContain(`secret=${secret}`);
  });
});
