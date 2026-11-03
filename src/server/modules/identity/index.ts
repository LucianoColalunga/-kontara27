import "server-only";

export { AuthService, EmailNotVerifiedError, InvalidCredentialsError, InvalidTokenError, ReauthRequiredError, toValidationError } from "./application/auth-service";
export type { LoginResult } from "./application/auth-service";
export { MfaService } from "./application/mfa-service";
export { SessionService, SESSION_IDLE_TTL_MS } from "./application/session-service";
export type { IssuedSession, ResolvedSession } from "./application/session-service";
export type { SessionRecord, UserRecord } from "./application/ports";
export { Argon2PasswordHasher } from "./infrastructure/argon2-hasher";
export { DrizzleMfaRepository, DrizzleSessionRepository, DrizzleTokenRepository, DrizzleUserRepository } from "./infrastructure/drizzle-repositories";
export { normalizeEmail } from "./domain/email";
export { checkPassword, PASSWORD_MIN_LENGTH } from "./domain/password-policy";
