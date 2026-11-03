import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Token aleatorio de `bytes` bytes en base64url (256 bits por defecto). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hmacSha256(key: Buffer, data: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/**
 * Cifrado autenticado AES-256-GCM para datos sensibles en reposo.
 * Formato: v1.<iv>.<tag>.<ciphertext> (base64url). El prefijo de versión permite rotar la clave.
 * `aad` liga el texto cifrado a su contexto (por ejemplo, el id del usuario): no se puede copiar a otra fila.
 */
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

export function encryptString(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptString(key: Buffer, payload: string, aad: string): string {
  const parts = payload.split(".");
  const [version, iv, tag, ciphertext] = parts;
  if (parts.length !== 4 || version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Formato de dato cifrado desconocido");
  const ivBytes = Buffer.from(iv, "base64url");
  const tagBytes = Buffer.from(tag, "base64url");
  // Etiqueta de 16 bytes exactos: GCM aceptaría un prefijo de 4 y falsificar el dato sería mucho más fácil.
  if (ivBytes.length !== GCM_IV_BYTES || tagBytes.length !== GCM_TAG_BYTES) throw new Error("Dato cifrado alterado o incompleto");
  const decipher = createDecipheriv("aes-256-gcm", key, ivBytes, { authTagLength: GCM_TAG_BYTES });
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
