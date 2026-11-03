import "server-only";
import { randomInt } from "node:crypto";
import { brand } from "@/config/brand";
import type { Clock } from "@/server/platform/clock";
import { decryptString, encryptString, sha256Hex } from "@/server/platform/crypto";
import { ConflictError, ValidationError } from "@/server/platform/errors";
import { generateTotpSecret, totpUri, verifyTotp } from "../domain/totp";
import type { MfaRepository } from "./ports";

const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // sin 0/O, 1/I/L, U
const RECOVERY_CODE_COUNT = 10;

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function looksLikeRecoveryCode(code: string): boolean {
  return normalizeRecoveryCode(code).length === 10 && !/^\d+$/.test(code.trim());
}

export class MfaService {
  constructor(
    private readonly repo: MfaRepository,
    private readonly encryptionKey: Buffer,
    private readonly clock: Clock,
  ) {}

  private aad(userId: string) {
    return `totp:${userId}`;
  }

  async isEnabled(userId: string): Promise<boolean> {
    const totp = await this.repo.getTotp(userId);
    return Boolean(totp?.confirmedAt);
  }

  /** Genera un secreto pendiente de confirmación. No activa nada hasta confirmar con un código. */
  async startEnrollment(userId: string, accountEmail: string): Promise<{ secret: string; uri: string }> {
    const existing = await this.repo.getTotp(userId);
    if (existing?.confirmedAt) throw new ConflictError("mfa_already_enabled", "La verificación en dos pasos ya está activa.");
    const secret = generateTotpSecret();
    await this.repo.savePendingTotp(userId, encryptString(this.encryptionKey, secret, this.aad(userId)));
    return { secret, uri: totpUri(secret, accountEmail, brand.shortName) };
  }

  /** Confirma el alta con un código válido y devuelve los códigos de recuperación (se muestran una sola vez). */
  async confirmEnrollment(userId: string, code: string): Promise<string[]> {
    const totp = await this.repo.getTotp(userId);
    if (!totp || totp.confirmedAt) throw new ValidationError("Volvé a iniciar la configuración de la verificación en dos pasos.");
    const secret = decryptString(this.encryptionKey, totp.secretEncrypted, this.aad(userId));
    const result = verifyTotp(secret, code.trim(), this.clock.now(), null);
    if (!result.valid || result.step === undefined) throw new ValidationError("El código no es correcto. Revisá la hora de tu teléfono y probá de nuevo.", { code: "Código incorrecto" });
    await this.repo.confirmTotp(userId, this.clock.now(), result.step);
    return this.regenerateRecoveryCodes(userId);
  }

  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
    await this.repo.replaceRecoveryCodes(userId, codes.map((c) => sha256Hex(normalizeRecoveryCode(c))));
    return codes;
  }

  /** Verifica un código TOTP o de recuperación. Cada código sirve una sola vez. */
  async verify(userId: string, code: string): Promise<{ valid: boolean; usedRecoveryCode: boolean }> {
    const totp = await this.repo.getTotp(userId);
    if (!totp?.confirmedAt) return { valid: false, usedRecoveryCode: false };
    if (looksLikeRecoveryCode(code)) {
      const ok = await this.repo.consumeRecoveryCode(userId, sha256Hex(normalizeRecoveryCode(code)), this.clock.now());
      return { valid: ok, usedRecoveryCode: ok };
    }
    const secret = decryptString(this.encryptionKey, totp.secretEncrypted, this.aad(userId));
    const result = verifyTotp(secret, code.trim(), this.clock.now(), totp.lastUsedStep);
    if (!result.valid || result.step === undefined) return { valid: false, usedRecoveryCode: false };
    // Si dos pedidos llegan con el mismo código, solo uno logra avanzar el paso.
    const advanced = await this.repo.advanceStep(userId, result.step);
    return { valid: advanced, usedRecoveryCode: false };
  }

  disable(userId: string) {
    return this.repo.deleteTotp(userId);
  }

  remainingRecoveryCodes(userId: string) {
    return this.repo.countUnusedRecoveryCodes(userId);
  }
}
