import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { isAppError, publicMessage, RateLimitedError, ValidationError } from "@/server/platform/errors";
import { logger } from "@/server/platform/logger";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Datos de una sola vez para mostrar (por ejemplo, códigos de recuperación). */
  data?: Record<string, unknown>;
}

export const initialActionState: ActionState = { ok: false };

/**
 * Envuelve una Server Action: traduce errores de dominio a un estado que el formulario muestra
 * y registra los inesperados sin filtrar detalles al usuario. Deja pasar redirect() y notFound().
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, message: Object.values(fieldErrors)[0] ?? "Revisá los datos.", fieldErrors };
    }
    if (error instanceof ValidationError) return { ok: false, message: error.userMessage, fieldErrors: error.fieldErrors };
    if (error instanceof RateLimitedError) return { ok: false, message: error.userMessage };
    if (isAppError(error)) return { ok: false, message: error.userMessage };
    const requestId = (await headers()).get("x-request-id");
    logger.error("action.unexpected_error", { error, requestId });
    return { ok: false, message: `${publicMessage(error)}${requestId ? ` (ref. ${requestId.slice(0, 8)})` : ""}` };
  }
}

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function formFile(form: FormData, key: string): File | null {
  const value = form.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}
