import "server-only";
import type { Permission } from "@/lib/permissions";
import { getServices } from "@/server/container";
import { isAppError } from "@/server/platform/errors";
import { logger } from "@/server/platform/logger";
import { authorize, type TenantContext } from "@/server/modules/tenancy";
import { getSession } from "./session";

export type RouteResult<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Sesión + membresía + permiso para route handlers. 404 si no es miembro (no revela la empresa). */
export async function routeTenant(slug: string, ...permissions: Permission[]): Promise<RouteResult<TenantContext>> {
  const session = await getSession();
  if (!session) return { ok: false, response: json({ error: "auth_required" }, 401) };
  const ctx = await (await getServices()).tenancy.resolveContext(session.user.id, slug);
  if (!ctx) return { ok: false, response: json({ error: "not_found" }, 404) };
  try {
    authorize(ctx, ...permissions);
  } catch {
    return { ok: false, response: json({ error: "forbidden" }, 403) };
  }
  return { ok: true, value: ctx };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Descarga privada: nunca se cachea, no se interpreta como HTML y no se puede embeber. */
export function fileResponse(bytes: Uint8Array, filename: string, contentType: string, disposition: "attachment" | "inline" = "attachment"): Response {
  const safe = filename.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, "_");
  return new Response(new Blob([new Uint8Array(bytes)]), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${safe.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safe)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function handleRouteError(error: unknown): Promise<Response> {
  if (isAppError(error)) return json({ error: error.code, message: error.userMessage }, error.status);
  logger.error("route.unexpected_error", { error });
  return json({ error: "internal_error" }, 500);
}
