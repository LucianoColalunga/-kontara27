import "server-only";
import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../application/ports";

/**
 * Argon2id con los parámetros mínimos recomendados por OWASP (m = 19 MiB, t = 2, p = 1).
 * `needsRehash` permite subir el costo en el futuro: el hash se actualiza en el siguiente login.
 */
export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export class Argon2PasswordHasher implements PasswordHasher {
  constructor(private readonly params: { memoryCost: number; timeCost: number; parallelism: number; outputLen: number } = ARGON2_PARAMS) {}

  hash(password: string): Promise<string> {
    // La librería usa Argon2id por defecto (algorithm = 2).
    return hash(password, this.params);
  }

  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }

  needsRehash(storedHash: string): boolean {
    const match = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
    if (!match) return true;
    const [, m, t, p] = match.map(Number) as [number, number, number, number];
    return m < this.params.memoryCost || t < this.params.timeCost || p !== this.params.parallelism;
  }
}
