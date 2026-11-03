import "server-only";
import { z } from "zod";
import type { AuditEntry, RequestMeta } from "@/server/platform/audit";
import type { Clock } from "@/server/platform/clock";
import { randomToken, sha256Hex } from "@/server/platform/crypto";
import type { EmailSender } from "@/server/platform/email";
import { emailTemplates } from "@/server/platform/email-templates";
import { AppError, ValidationError } from "@/server/platform/errors";
import { uuidv7 } from "@/server/platform/ids";
import { logger } from "@/server/platform/logger";
import { RATE_LIMITS, type RateLimiter } from "@/server/platform/rate-limit";
import { emailSchema, normalizeEmail } from "../domain/email";
import { checkPassword, PASSWORD_MAX_LENGTH } from "../domain/password-policy";
import type { MfaService } from "./mfa-service";
import type { PasswordHasher, SessionRecord, TokenRepository, UserRepository } from "./ports";
import { type IssuedSession, SessionService } from "./session-service";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("invalid_credentials", "Correo o contraseña incorrectos.", 401);
  }
}
export class EmailNotVerifiedError extends AppError {
  constructor() {
    super("email_not_verified", "Confirmá tu correo antes de entrar. Si no te llegó, pedí que te lo reenviemos.", 403);
  }
}
export class InvalidTokenError extends AppError {
  constructor() {
    super("invalid_token", "El enlace no es válido o ya venció. Pedí uno nuevo.", 400);
  }
}
export class ReauthRequiredError extends AppError {
  constructor() {
    super("reauth_required", "Por seguridad, volvé a ingresar tu contraseña para continuar.", 403);
  }
}

export const registerInput = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre.").max(120),
  email: emailSchema,
  password: z.string().max(PASSWORD_MAX_LENGTH),
  locale: z.string().max(16).default("es-AR"),
  residenceCountry: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .default(null),
  acceptTerms: z.literal(true, { error: "Tenés que aceptar los términos y la política de privacidad." }),
});

export interface AuthDeps {
  users: UserRepository;
  tokens: TokenRepository;
  hasher: PasswordHasher;
  sessions: SessionService;
  mfa: MfaService;
  email: EmailSender;
  rateLimiter: RateLimiter;
  clock: Clock;
  audit: (entry: AuditEntry) => Promise<void>;
  appUrl: string;
}

export type LoginResult = { status: "authenticated"; session: IssuedSession } | { status: "mfa_required"; session: IssuedSession };

export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly deps: AuthDeps) {}

  /** Hash señuelo: el tiempo de respuesta no revela si un correo tiene cuenta. */
  private getDummyHash() {
    this.dummyHash ??= this.deps.hasher.hash(randomToken(16));
    return this.dummyHash;
  }

  private link(path: string, token: string) {
    return `${this.deps.appUrl.replace(/\/$/, "")}${path}?token=${encodeURIComponent(token)}`;
  }

  private async issueToken(userId: string, email: string, purpose: "email_verification" | "password_reset"): Promise<string> {
    const token = randomToken(32);
    const ttl = purpose === "email_verification" ? EMAIL_VERIFICATION_TTL_MS : PASSWORD_RESET_TTL_MS;
    await this.deps.tokens.invalidateAll(userId, purpose, this.deps.clock.now());
    await this.deps.tokens.create({ id: sha256Hex(token), userId, purpose, email, expiresAt: new Date(this.deps.clock.now().getTime() + ttl) });
    return token;
  }

  /**
   * Alta de usuario. La respuesta es la misma exista o no el correo (anti-enumeración):
   * si ya existe, se le avisa por correo al dueño en lugar de crear otra cuenta.
   */
  async register(input: unknown, meta: RequestMeta): Promise<void> {
    if (meta.ip) await this.deps.rateLimiter.consume(RATE_LIMITS.registerByIp, meta.ip);
    const parsed = registerInput.safeParse(input);
    if (!parsed.success) throw toValidationError(parsed.error);
    const data = parsed.data;
    const passwordProblem = checkPassword(data.password, { email: data.email, name: data.name });
    if (passwordProblem) throw new ValidationError(passwordProblem, { password: passwordProblem });

    const emailNormalized = normalizeEmail(data.email);
    const existing = await this.deps.users.findByEmail(emailNormalized);
    if (existing) {
      await this.deps.hasher.hash(data.password); // iguala el tiempo de respuesta
      if (!existing.emailVerifiedAt) await this.sendVerification(existing.id, existing.email, existing.name);
      else await this.deps.email.send(emailTemplates.accountExists(existing.email, `${this.deps.appUrl.replace(/\/$/, "")}/ingresar`));
      await this.deps.audit({ action: "auth.register_existing_email", actorUserId: existing.id, request: meta });
      return;
    }

    const id = uuidv7();
    await this.deps.users.create({
      id,
      email: data.email.trim(),
      emailNormalized,
      name: data.name,
      passwordHash: await this.deps.hasher.hash(data.password),
      locale: data.locale,
      residenceCountry: data.residenceCountry,
    });
    await this.sendVerification(id, data.email.trim(), data.name);
    await this.deps.audit({ action: "auth.registered", actorUserId: id, request: meta });
  }

  private async sendVerification(userId: string, email: string, name: string) {
    const token = await this.issueToken(userId, normalizeEmail(email), "email_verification");
    await this.deps.email.send(emailTemplates.verifyEmail(email, name, this.link("/verificar-correo", token)));
  }

  async resendVerification(email: string, meta: RequestMeta): Promise<void> {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return;
    const emailNormalized = normalizeEmail(parsed.data);
    await this.deps.rateLimiter.consume(RATE_LIMITS.verificationResend, emailNormalized);
    const user = await this.deps.users.findByEmail(emailNormalized);
    if (user && !user.emailVerifiedAt) await this.sendVerification(user.id, user.email, user.name);
    await this.deps.audit({ action: "auth.verification_resent", actorUserId: user?.id ?? null, request: meta });
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const consumed = await this.deps.tokens.consume(sha256Hex(token), "email_verification", this.deps.clock.now());
    if (!consumed) throw new InvalidTokenError();
    const user = await this.deps.users.findById(consumed.userId);
    if (!user || user.deletedAt || user.emailNormalized !== consumed.email) throw new InvalidTokenError();
    await this.deps.users.markEmailVerified(user.id, this.deps.clock.now());
    await this.deps.audit({ action: "auth.email_verified", actorUserId: user.id, request: meta });
  }

  async login(input: { email: string; password: string }, meta: RequestMeta): Promise<LoginResult> {
    const email = typeof input.email === "string" ? input.email : "";
    const password = typeof input.password === "string" ? input.password.slice(0, PASSWORD_MAX_LENGTH + 1) : "";
    const emailNormalized = normalizeEmail(email);
    if (meta.ip) await this.deps.rateLimiter.consume(RATE_LIMITS.loginByIp, meta.ip);
    await this.deps.rateLimiter.consume(RATE_LIMITS.loginByAccount, emailNormalized);

    const user = emailNormalized ? await this.deps.users.findByEmail(emailNormalized) : null;
    if (!user) {
      await this.deps.hasher.verify(await this.getDummyHash(), password);
      await this.deps.audit({ action: "auth.login_failed", request: meta, metadata: { reason: "unknown_account" } });
      throw new InvalidCredentialsError();
    }
    const ok = await this.deps.hasher.verify(user.passwordHash, password);
    if (!ok) {
      await this.deps.users.recordLoginFailure(user.id);
      await this.deps.audit({ action: "auth.login_failed", actorUserId: user.id, request: meta, metadata: { reason: "bad_password" } });
      throw new InvalidCredentialsError();
    }
    // Recién acá, con la contraseña correcta, se revela si falta verificar el correo.
    if (!user.emailVerifiedAt) throw new EmailNotVerifiedError();

    if (this.deps.hasher.needsRehash(user.passwordHash)) {
      await this.deps.users.updatePassword(user.id, await this.deps.hasher.hash(password), user.passwordChangedAt);
    }
    await this.deps.rateLimiter.reset(RATE_LIMITS.loginByAccount, emailNormalized);
    await this.deps.users.recordLoginSuccess(user.id, this.deps.clock.now());

    const mfaEnabled = await this.deps.mfa.isEnabled(user.id);
    const session = await this.deps.sessions.issue(user.id, !mfaEnabled, meta);
    await this.deps.audit({ action: mfaEnabled ? "auth.mfa_challenge_started" : "auth.login_succeeded", actorUserId: user.id, request: meta });
    return mfaEnabled ? { status: "mfa_required", session } : { status: "authenticated", session };
  }

  /** Segundo paso del login. Devuelve una sesión nueva (rotada) y revoca la provisoria. */
  async completeMfa(sessionToken: string, code: string, meta: RequestMeta): Promise<IssuedSession> {
    const resolved = await this.deps.sessions.resolve(sessionToken);
    if (!resolved || resolved.session.mfaSatisfied) throw new InvalidTokenError();
    await this.deps.rateLimiter.consume(RATE_LIMITS.mfaByAccount, resolved.user.id);
    const result = await this.deps.mfa.verify(resolved.user.id, code);
    if (!result.valid) {
      await this.deps.audit({ action: "auth.mfa_failed", actorUserId: resolved.user.id, request: meta });
      throw new ValidationError("El código no es correcto.", { code: "Código incorrecto" });
    }
    await this.deps.rateLimiter.reset(RATE_LIMITS.mfaByAccount, resolved.user.id);
    const issued = await this.deps.sessions.rotateAfterMfa(resolved.session, meta);
    await this.deps.audit({ action: result.usedRecoveryCode ? "auth.login_recovery_code" : "auth.login_succeeded", actorUserId: resolved.user.id, request: meta, metadata: { mfa: true } });
    return issued;
  }

  async logout(sessionToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!sessionToken) return;
    const sessionId = SessionService.idFromToken(sessionToken);
    const resolved = await this.deps.sessions.resolve(sessionToken);
    await this.deps.sessions.revoke(sessionId);
    if (resolved) await this.deps.audit({ action: "auth.logout", actorUserId: resolved.user.id, request: meta });
  }

  async requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
    if (meta.ip) await this.deps.rateLimiter.consume(RATE_LIMITS.passwordResetByIp, meta.ip);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return;
    const emailNormalized = normalizeEmail(parsed.data);
    try {
      await this.deps.rateLimiter.consume(RATE_LIMITS.passwordResetByAccount, emailNormalized);
    } catch {
      // Límite por cuenta alcanzado: se responde igual que siempre para no revelar nada.
      return;
    }
    const user = await this.deps.users.findByEmail(emailNormalized);
    if (!user) {
      await this.getDummyHash();
      return;
    }
    const token = await this.issueToken(user.id, user.emailNormalized, "password_reset");
    await this.deps.email.send(emailTemplates.passwordReset(user.email, this.link("/restablecer", token)));
    await this.deps.audit({ action: "auth.password_reset_requested", actorUserId: user.id, request: meta });
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const tokenId = sha256Hex(token);
    // Primero se valida la contraseña nueva sin gastar el enlace: un error de tipeo no obliga a pedir otro correo.
    const pending = await this.deps.tokens.peek(tokenId, "password_reset", this.deps.clock.now());
    if (!pending) throw new InvalidTokenError();
    const user = await this.deps.users.findById(pending.userId);
    if (!user || user.deletedAt || user.emailNormalized !== pending.email) throw new InvalidTokenError();
    const problem = checkPassword(newPassword, { email: user.email, name: user.name });
    if (problem) throw new ValidationError(problem, { password: problem });
    const passwordHash = await this.deps.hasher.hash(newPassword);
    // El consumo es atómico: si dos pedidos llegan juntos con el mismo enlace, solo uno cambia la contraseña.
    const consumed = await this.deps.tokens.consume(tokenId, "password_reset", this.deps.clock.now());
    if (!consumed || consumed.userId !== user.id) throw new InvalidTokenError();
    await this.deps.users.updatePassword(user.id, passwordHash, this.deps.clock.now());
    // Si alguien llegó a abrir el enlace, el dueño recupera el control: se cierran todas las sesiones.
    await this.deps.sessions.revokeAll(user.id);
    // Restablecer por correo también prueba la titularidad de la casilla.
    if (!user.emailVerifiedAt) await this.deps.users.markEmailVerified(user.id, this.deps.clock.now());
    await this.deps.email.send(emailTemplates.passwordChanged(user.email));
    await this.deps.audit({ action: "auth.password_reset_completed", actorUserId: user.id, request: meta });
  }

  async reauthenticate(sessionId: string, userId: string, password: string, meta: RequestMeta): Promise<void> {
    await this.deps.rateLimiter.consume(RATE_LIMITS.loginByAccount, `reauth:${userId}`);
    const user = await this.deps.users.findById(userId);
    if (!user || !(await this.deps.hasher.verify(user.passwordHash, password))) {
      await this.deps.audit({ action: "auth.reauth_failed", actorUserId: userId, request: meta });
      throw new ValidationError("La contraseña no es correcta.", { password: "Contraseña incorrecta" });
    }
    await this.deps.sessions.markReauthenticated(sessionId);
  }

  async changePassword(sessionId: string, userId: string, currentPassword: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const user = await this.deps.users.findById(userId);
    if (!user || !(await this.deps.hasher.verify(user.passwordHash, currentPassword))) {
      throw new ValidationError("La contraseña actual no es correcta.", { currentPassword: "Contraseña incorrecta" });
    }
    const problem = checkPassword(newPassword, { email: user.email, name: user.name });
    if (problem) throw new ValidationError(problem, { newPassword: problem });
    const now = this.deps.clock.now();
    await this.deps.users.updatePassword(userId, await this.deps.hasher.hash(newPassword), now);
    const revoked = await this.deps.sessions.revokeAll(userId, sessionId);
    await this.deps.email.send(emailTemplates.passwordChanged(user.email));
    await this.deps.audit({ action: "auth.password_changed", actorUserId: userId, request: meta, metadata: { revokedSessions: revoked } });
  }

  /** Para operaciones sensibles (desactivar MFA, exportar todo, borrar la cuenta). */
  requireRecentReauth(session: SessionRecord) {
    if (!this.deps.sessions.isRecentlyReauthenticated(session)) throw new ReauthRequiredError();
  }

  async onMfaChanged(userId: string, enabled: boolean, meta: RequestMeta) {
    const user = await this.deps.users.findById(userId);
    if (user) {
      await this.deps.email.send(emailTemplates.mfaChanged(user.email, enabled)).catch((error) => logger.error("email.mfa_changed_failed", { error }));
    }
    await this.deps.audit({ action: enabled ? "auth.mfa_enabled" : "auth.mfa_disabled", actorUserId: userId, request: meta });
  }
}

export function toValidationError(error: z.ZodError): ValidationError {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "Revisá los datos ingresados.";
  return new ValidationError(first, fieldErrors);
}
