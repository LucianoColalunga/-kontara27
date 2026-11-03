import "server-only";
import { sql } from "drizzle-orm";
import { sha256Hex } from "./crypto";
import type { Database } from "./db";
import { RateLimitedError } from "./errors";

export interface RateLimitRule {
  /** Nombre del límite (login_ip, login_account, password_reset…). */
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimiter {
  /** Suma un intento y lanza RateLimitedError si se superó el límite. */
  consume(rule: RateLimitRule, identifier: string): Promise<void>;
  reset(rule: RateLimitRule, identifier: string): Promise<void>;
}

/**
 * Ventana fija persistida en PostgreSQL: funciona igual con muchas instancias serverless.
 * La clave se guarda hasheada para no almacenar IPs ni correos en claro.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private key(rule: RateLimitRule, identifier: string) {
    return sha256Hex(`${rule.scope}:${identifier.toLowerCase()}`);
  }

  private windowStart(rule: RateLimitRule): Date {
    const ms = rule.windowSeconds * 1000;
    return new Date(Math.floor(this.now().getTime() / ms) * ms);
  }

  async consume(rule: RateLimitRule, identifier: string): Promise<void> {
    const start = this.windowStart(rule);
    const result = await this.db.execute<{ count: number }>(sql`
      insert into rate_limit_buckets (key, window_start, count) values (${this.key(rule, identifier)}, ${start.toISOString()}, 1)
      on conflict (key, window_start) do update set count = rate_limit_buckets.count + 1
      returning count`);
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > rule.limit) {
      const retryAfter = Math.max(1, Math.ceil((start.getTime() + rule.windowSeconds * 1000 - this.now().getTime()) / 1000));
      throw new RateLimitedError(retryAfter);
    }
  }

  async reset(rule: RateLimitRule, identifier: string): Promise<void> {
    await this.db.execute(sql`delete from rate_limit_buckets where key = ${this.key(rule, identifier)}`);
  }
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();
  async consume(rule: RateLimitRule, identifier: string): Promise<void> {
    const key = `${rule.scope}:${identifier}`;
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    if (count > rule.limit) throw new RateLimitedError(rule.windowSeconds);
  }
  async reset(rule: RateLimitRule, identifier: string): Promise<void> {
    this.counts.delete(`${rule.scope}:${identifier}`);
  }
}

export const RATE_LIMITS = {
  loginByIp: { scope: "login_ip", limit: 30, windowSeconds: 15 * 60 },
  loginByAccount: { scope: "login_account", limit: 8, windowSeconds: 15 * 60 },
  mfaByAccount: { scope: "mfa_account", limit: 8, windowSeconds: 15 * 60 },
  registerByIp: { scope: "register_ip", limit: 10, windowSeconds: 60 * 60 },
  passwordResetByIp: { scope: "reset_ip", limit: 10, windowSeconds: 60 * 60 },
  passwordResetByAccount: { scope: "reset_account", limit: 3, windowSeconds: 60 * 60 },
  verificationResend: { scope: "verify_resend", limit: 5, windowSeconds: 60 * 60 },
  invitationsByOrg: { scope: "invite_org", limit: 50, windowSeconds: 24 * 60 * 60 },
  importsByOrg: { scope: "import_org", limit: 30, windowSeconds: 60 * 60 },
  exportsByUser: { scope: "export_user", limit: 60, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;
