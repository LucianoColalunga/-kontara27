import "server-only";

export interface UserRecord {
  id: string;
  email: string;
  emailNormalized: string;
  name: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  locale: string;
  residenceCountry: string | null;
  deletedAt: Date | null;
  passwordChangedAt: Date;
  createdAt: Date;
}

export interface NewUser {
  id: string;
  email: string;
  emailNormalized: string;
  name: string;
  passwordHash: string;
  /** Del reloj de la aplicación, el mismo que fecha las sesiones (ver SessionService.resolve). */
  passwordChangedAt: Date;
  locale: string;
  residenceCountry: string | null;
}

export interface UserRepository {
  findByEmail(emailNormalized: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(user: NewUser): Promise<void>;
  markEmailVerified(id: string, at: Date): Promise<void>;
  updatePassword(id: string, passwordHash: string, at: Date): Promise<void>;
  recordLoginSuccess(id: string, at: Date): Promise<void>;
  recordLoginFailure(id: string): Promise<void>;
  updateProfile(id: string, data: { name?: string; locale?: string; residenceCountry?: string | null }, at: Date): Promise<void>;
}

export interface SessionRecord {
  id: string;
  userId: string;
  mfaSatisfied: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  reauthenticatedAt: Date;
  ip: string | null;
  userAgent: string | null;
  revokedAt: Date | null;
}

export interface SessionRepository {
  create(session: Omit<SessionRecord, "revokedAt" | "lastSeenAt">): Promise<void>;
  findActive(id: string, now: Date): Promise<SessionRecord | null>;
  touch(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  markMfaSatisfied(id: string): Promise<void>;
  markReauthenticated(id: string, at: Date): Promise<void>;
  revoke(id: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date, exceptId?: string): Promise<number>;
  listActiveForUser(userId: string, now: Date): Promise<SessionRecord[]>;
}

export type TokenPurpose = "email_verification" | "password_reset";

export interface TokenRepository {
  create(token: { id: string; userId: string; purpose: TokenPurpose; email: string; expiresAt: Date }): Promise<void>;
  /** Consulta un token válido sin consumirlo (para validar datos antes de gastarlo). */
  peek(id: string, purpose: TokenPurpose, now: Date): Promise<{ userId: string; email: string } | null>;
  /** Marca el token como usado de forma atómica y lo devuelve solo si era válido. */
  consume(id: string, purpose: TokenPurpose, now: Date): Promise<{ userId: string; email: string } | null>;
  invalidateAll(userId: string, purpose: TokenPurpose, now: Date): Promise<void>;
}

export interface TotpRecord {
  userId: string;
  secretEncrypted: string;
  confirmedAt: Date | null;
  lastUsedStep: number | null;
}

export interface MfaRepository {
  getTotp(userId: string): Promise<TotpRecord | null>;
  savePendingTotp(userId: string, secretEncrypted: string): Promise<void>;
  confirmTotp(userId: string, at: Date, step: number): Promise<void>;
  /** Guarda el paso usado solo si es posterior al último (evita carreras con el mismo código). */
  advanceStep(userId: string, step: number): Promise<boolean>;
  deleteTotp(userId: string): Promise<void>;
  replaceRecoveryCodes(userId: string, codeHashes: string[]): Promise<void>;
  consumeRecoveryCode(userId: string, codeHash: string, at: Date): Promise<boolean>;
  countUnusedRecoveryCodes(userId: string): Promise<number>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  needsRehash(hash: string): boolean;
}
