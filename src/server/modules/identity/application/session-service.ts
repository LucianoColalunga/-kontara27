import "server-only";
import type { Clock } from "@/server/platform/clock";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import type { SessionRecord, SessionRepository, UserRecord, UserRepository } from "./ports";

export const SESSION_IDLE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface IssuedSession {
  /** Valor para la cookie. Nunca se guarda: en la base vive su SHA-256. */
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  session: SessionRecord;
  user: UserRecord;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  static idFromToken(token: string): string {
    return sha256Hex(token);
  }

  async issue(userId: string, mfaSatisfied: boolean, meta: { ip: string | null; userAgent: string | null }): Promise<IssuedSession> {
    const now = this.clock.now();
    const token = randomToken(32);
    const sessionId = SessionService.idFromToken(token);
    const expiresAt = new Date(now.getTime() + SESSION_IDLE_TTL_MS);
    await this.sessions.create({
      id: sessionId,
      userId,
      mfaSatisfied,
      createdAt: now,
      expiresAt,
      absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
      reauthenticatedAt: now,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
    });
    return { token, sessionId, expiresAt };
  }

  /** Valida el token de la cookie. Renueva la expiración deslizante sin pasar el tope absoluto. */
  async resolve(token: string | undefined | null): Promise<ResolvedSession | null> {
    if (!token || token.length < 40 || token.length > 64) return null;
    const now = this.clock.now();
    const session = await this.sessions.findActive(SessionService.idFromToken(token), now);
    if (!session) return null;
    const user = await this.users.findById(session.userId);
    if (!user || user.deletedAt || !user.emailVerifiedAt) return null;
    // Una sesión emitida antes del último cambio de contraseña ya no vale.
    if (session.createdAt.getTime() < user.passwordChangedAt.getTime() - 1000) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      const expiresAt = new Date(Math.min(now.getTime() + SESSION_IDLE_TTL_MS, session.absoluteExpiresAt.getTime()));
      await this.sessions.touch(session.id, now, expiresAt);
      session.lastSeenAt = now;
      session.expiresAt = expiresAt;
    }
    return { session, user };
  }

  /** Tras completar el segundo factor se emite un token nuevo: evita fijación de sesión. */
  async rotateAfterMfa(session: SessionRecord, meta: { ip: string | null; userAgent: string | null }): Promise<IssuedSession> {
    const issued = await this.issue(session.userId, true, meta);
    await this.sessions.revoke(session.id, this.clock.now());
    return issued;
  }

  isRecentlyReauthenticated(session: SessionRecord): boolean {
    return this.clock.now().getTime() - session.reauthenticatedAt.getTime() <= REAUTH_WINDOW_MS;
  }

  markReauthenticated(sessionId: string) {
    return this.sessions.markReauthenticated(sessionId, this.clock.now());
  }

  markMfaSatisfied(sessionId: string) {
    return this.sessions.markMfaSatisfied(sessionId);
  }

  revoke(sessionId: string) {
    return this.sessions.revoke(sessionId, this.clock.now());
  }

  revokeAll(userId: string, exceptSessionId?: string) {
    return this.sessions.revokeAllForUser(userId, this.clock.now(), exceptSessionId);
  }

  list(userId: string) {
    return this.sessions.listActiveForUser(userId, this.clock.now());
  }

  /** Revoca una sesión del propio usuario (nunca la de otro). */
  async revokeOwn(userId: string, sessionId: string): Promise<boolean> {
    const owned = (await this.list(userId)).some((s) => s.id === sessionId);
    if (owned) await this.revoke(sessionId);
    return owned;
  }
}
