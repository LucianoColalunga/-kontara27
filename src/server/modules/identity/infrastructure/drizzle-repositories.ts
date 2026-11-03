import "server-only";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { sessions, userRecoveryCodes, users, userTokens, userTotp } from "@/server/db/schema";
import type { Database } from "@/server/platform/db";
import type { MfaRepository, NewUser, SessionRecord, SessionRepository, TokenPurpose, TokenRepository, TotpRecord, UserRecord, UserRepository } from "../application/ports";

const userColumns = {
  id: users.id,
  email: users.email,
  emailNormalized: users.emailNormalized,
  name: users.name,
  passwordHash: users.passwordHash,
  emailVerifiedAt: users.emailVerifiedAt,
  locale: users.locale,
  residenceCountry: users.residenceCountry,
  deletedAt: users.deletedAt,
  passwordChangedAt: users.passwordChangedAt,
  createdAt: users.createdAt,
};

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(emailNormalized: string): Promise<UserRecord | null> {
    const [row] = await this.db.select(userColumns).from(users).where(and(eq(users.emailNormalized, emailNormalized), isNull(users.deletedAt))).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db.select(userColumns).from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  async create(user: NewUser): Promise<void> {
    await this.db.insert(users).values(user);
  }

  async markEmailVerified(id: string, at: Date): Promise<void> {
    await this.db.update(users).set({ emailVerifiedAt: at, updatedAt: at }).where(and(eq(users.id, id), isNull(users.emailVerifiedAt)));
  }

  async updatePassword(id: string, passwordHash: string, at: Date): Promise<void> {
    await this.db.update(users).set({ passwordHash, passwordChangedAt: at, updatedAt: at, failedLoginCount: 0 }).where(eq(users.id, id));
  }

  async recordLoginSuccess(id: string, at: Date): Promise<void> {
    await this.db.update(users).set({ lastLoginAt: at, failedLoginCount: 0 }).where(eq(users.id, id));
  }

  async recordLoginFailure(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ failedLoginCount: sql`least(${users.failedLoginCount} + 1, 32000)` })
      .where(eq(users.id, id));
  }

  async updateProfile(id: string, data: { name?: string; locale?: string; residenceCountry?: string | null }, at: Date): Promise<void> {
    await this.db.update(users).set({ ...data, updatedAt: at }).where(eq(users.id, id));
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: Database) {}

  async create(session: Omit<SessionRecord, "revokedAt" | "lastSeenAt">): Promise<void> {
    await this.db.insert(sessions).values({ ...session, lastSeenAt: session.createdAt });
  }

  async findActive(id: string, now: Date): Promise<SessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), gt(sessions.absoluteExpiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  async touch(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, id));
  }

  async markMfaSatisfied(id: string): Promise<void> {
    await this.db.update(sessions).set({ mfaSatisfied: true }).where(eq(sessions.id, id));
  }

  async markReauthenticated(id: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ reauthenticatedAt: at }).where(eq(sessions.id, id));
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: at }).where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
  }

  async revokeAllForUser(userId: string, at: Date, exceptId?: string): Promise<number> {
    const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (exceptId) conditions.push(ne(sessions.id, exceptId));
    const result = await this.db.update(sessions).set({ revokedAt: at }).where(and(...conditions));
    return result.rowCount ?? 0;
  }

  async listActiveForUser(userId: string, now: Date): Promise<SessionRecord[]> {
    return this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
      .orderBy(sql`${sessions.lastSeenAt} desc`);
  }
}

export class DrizzleTokenRepository implements TokenRepository {
  constructor(private readonly db: Database) {}

  async create(token: { id: string; userId: string; purpose: TokenPurpose; email: string; expiresAt: Date }): Promise<void> {
    await this.db.insert(userTokens).values(token);
  }

  async peek(id: string, purpose: TokenPurpose, now: Date): Promise<{ userId: string; email: string } | null> {
    const [row] = await this.db
      .select({ userId: userTokens.userId, email: userTokens.email })
      .from(userTokens)
      .where(and(eq(userTokens.id, id), eq(userTokens.purpose, purpose), isNull(userTokens.usedAt), gt(userTokens.expiresAt, now)))
      .limit(1);
    return row ?? null;
  }

  async consume(id: string, purpose: TokenPurpose, now: Date): Promise<{ userId: string; email: string } | null> {
    // UPDATE … RETURNING: dos clics simultáneos no pueden usar el mismo token.
    const [row] = await this.db
      .update(userTokens)
      .set({ usedAt: now })
      .where(and(eq(userTokens.id, id), eq(userTokens.purpose, purpose), isNull(userTokens.usedAt), gt(userTokens.expiresAt, now)))
      .returning({ userId: userTokens.userId, email: userTokens.email });
    return row ?? null;
  }

  async invalidateAll(userId: string, purpose: TokenPurpose, now: Date): Promise<void> {
    await this.db
      .update(userTokens)
      .set({ usedAt: now })
      .where(and(eq(userTokens.userId, userId), eq(userTokens.purpose, purpose), isNull(userTokens.usedAt)));
  }
}

export class DrizzleMfaRepository implements MfaRepository {
  constructor(private readonly db: Database) {}

  async getTotp(userId: string): Promise<TotpRecord | null> {
    const [row] = await this.db.select().from(userTotp).where(eq(userTotp.userId, userId)).limit(1);
    return row ? { userId: row.userId, secretEncrypted: row.secretEncrypted, confirmedAt: row.confirmedAt, lastUsedStep: row.lastUsedStep } : null;
  }

  async savePendingTotp(userId: string, secretEncrypted: string): Promise<void> {
    await this.db
      .insert(userTotp)
      .values({ userId, secretEncrypted })
      .onConflictDoUpdate({ target: userTotp.userId, set: { secretEncrypted, confirmedAt: null, lastUsedStep: null }, where: isNull(userTotp.confirmedAt) });
  }

  async confirmTotp(userId: string, at: Date, step: number): Promise<void> {
    await this.db.update(userTotp).set({ confirmedAt: at, lastUsedStep: step }).where(eq(userTotp.userId, userId));
  }

  async advanceStep(userId: string, step: number): Promise<boolean> {
    const result = await this.db
      .update(userTotp)
      .set({ lastUsedStep: step })
      .where(and(eq(userTotp.userId, userId), or(isNull(userTotp.lastUsedStep), lt(userTotp.lastUsedStep, step))));
    return (result.rowCount ?? 0) === 1;
  }

  async deleteTotp(userId: string): Promise<void> {
    await this.db.delete(userTotp).where(eq(userTotp.userId, userId));
    await this.db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  }

  async replaceRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
      if (codeHashes.length) await tx.insert(userRecoveryCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
    });
  }

  async consumeRecoveryCode(userId: string, codeHash: string, at: Date): Promise<boolean> {
    const result = await this.db
      .update(userRecoveryCodes)
      .set({ usedAt: at })
      .where(and(eq(userRecoveryCodes.userId, userId), eq(userRecoveryCodes.codeHash, codeHash), isNull(userRecoveryCodes.usedAt)));
    return (result.rowCount ?? 0) === 1;
  }

  async countUnusedRecoveryCodes(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(userRecoveryCodes)
      .where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)));
    return row?.n ?? 0;
  }
}
