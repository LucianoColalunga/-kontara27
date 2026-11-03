import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptString, encryptString } from "@/server/platform/crypto";

const key = randomBytes(32);
const aad = "usuario:0193a1b2-0000-7000-8000-000000000001";

describe("cifrado en reposo (AES-256-GCM)", () => {
  it("descifra lo que cifró, con el mismo contexto", () => {
    const payload = encryptString(key, "30-71234567-1", aad);
    expect(payload).toMatch(/^v1\.[\w-]{16}\.[\w-]{22}\.[\w-]+$/);
    expect(decryptString(key, payload, aad)).toBe("30-71234567-1");
  });

  it("rechaza el dato copiado a otro contexto (AAD distinta)", () => {
    const payload = encryptString(key, "secreto", aad);
    expect(() => decryptString(key, payload, "usuario:otro")).toThrow();
  });

  it("rechaza un texto cifrado alterado", () => {
    const [v, iv, tag, ct] = encryptString(key, "secreto", aad).split(".");
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0]! ^= 1;
    expect(() => decryptString(key, [v, iv, tag, flipped.toString("base64url")].join("."), aad)).toThrow();
  });

  it("rechaza una etiqueta recortada aunque sea un prefijo de la verdadera", () => {
    // Sin authTagLength, GCM verifica solo los bytes recibidos: 4 de 16 bastaban para aceptar el dato.
    const [v, iv, tag, ct] = encryptString(key, "secreto", aad).split(".");
    const shortTag = Buffer.from(tag!, "base64url").subarray(0, 4).toString("base64url");
    expect(() => decryptString(key, [v, iv, shortTag, ct].join("."), aad)).toThrow(/alterado o incompleto/);
  });

  it("rechaza formatos desconocidos", () => {
    expect(() => decryptString(key, "v2.a.b.c", aad)).toThrow(/desconocido/);
    expect(() => decryptString(key, "v1.a.b", aad)).toThrow(/desconocido/);
    expect(() => decryptString(key, "v1.a.b.c.d", aad)).toThrow(/desconocido/);
  });
});
