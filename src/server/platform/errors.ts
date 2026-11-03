import "server-only";

/**
 * Errores de la aplicación con un código estable y un mensaje apto para mostrar al usuario.
 * Cualquier otro error se considera interno: se registra y el usuario ve un mensaje genérico.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly userMessage: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    userMessage: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super("validation_failed", userMessage, 422, { fieldErrors });
  }
}

export class AuthRequiredError extends AppError {
  constructor(userMessage = "Iniciá sesión para continuar.") {
    super("auth_required", userMessage, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(userMessage = "No tenés permiso para realizar esta acción.") {
    super("forbidden", userMessage, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(userMessage = "No encontramos lo que buscabas.") {
    super("not_found", userMessage, 404);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, userMessage: string) {
    super(code, userMessage, 409);
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("rate_limited", "Demasiados intentos. Esperá unos minutos y volvé a probar.", 429, { retryAfterSeconds });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Mensaje seguro para la interfaz: nunca expone detalles internos. */
export function publicMessage(error: unknown): string {
  return isAppError(error) ? error.userMessage : "Ocurrió un error inesperado. Ya quedó registrado; probá de nuevo en unos minutos.";
}
