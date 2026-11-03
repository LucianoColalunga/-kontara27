import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Permission } from "@/lib/permissions";
import { getServices } from "@/server/container";
import type { RequestMeta } from "@/server/platform/audit";
import { env } from "@/server/platform/env";
import { authorize, type TenantContext } from "@/server/modules/tenancy";
import type { ResolvedSession } from "@/server/modules/identity";

const SESSION_COOKIE_SECURE = "__Host-sid";
const SESSION_COOKIE_DEV = "sid";

export function sessionCookieName(): string {
  return env().APP_URL.startsWith("https://") ? SESSION_COOKIE_SECURE : SESSION_COOKIE_DEV;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(sessionCookieName());
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

/**
 * IP y navegador del pedido. Sin un proxy de confianza (Vercel o TRUST_PROXY_HEADERS=true) la IP queda
 * vacía: X-Forwarded-For lo escribe el cliente y alcanzaría con cambiarlo para esquivar los límites por IP.
 * Con proxy: X-Real-IP o, si falta, la última entrada de X-Forwarded-For, que es la que agrega el proxy.
 */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const trusted = env().VERCEL === "1" || env().TRUST_PROXY_HEADERS === "true";
  const ip = trusted ? h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || null : null;
  return { ip, userAgent: h.get("user-agent") };
}

/** Sesión completa (con segundo factor si corresponde) o null. Memorizada por request. */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const token = await readSessionToken();
  if (!token) return null;
  const services = await getServices();
  const resolved = await services.sessions.resolve(token);
  if (!resolved || !resolved.session.mfaSatisfied) return null;
  return resolved;
});

/** Sesión provisoria que espera el código del segundo factor. */
export async function getPendingMfaSession(): Promise<ResolvedSession | null> {
  const token = await readSessionToken();
  if (!token) return null;
  const resolved = await (await getServices()).sessions.resolve(token);
  return resolved && !resolved.session.mfaSatisfied ? resolved : null;
}

export async function requireUser(): Promise<ResolvedSession> {
  const session = await getSession();
  if (!session) {
    // Vuelve a la página pedida después de ingresar. La acción de ingreso solo acepta rutas internas.
    const path = (await headers()).get("x-pathname");
    redirect(path && path !== "/app" ? `/ingresar?next=${encodeURIComponent(path)}` : "/ingresar");
  }
  return session;
}

/**
 * Contexto de la organización de la URL. Si el usuario no es miembro (o la empresa no existe)
 * responde 404: no se revela si existe una empresa con ese slug.
 */
export const requireTenant = cache(async (slug: string, ...permissions: Permission[]): Promise<{ session: ResolvedSession; ctx: TenantContext }> => {
  const session = await requireUser();
  const ctx = await (await getServices()).tenancy.resolveContext(session.user.id, slug);
  if (!ctx) notFound();
  if (permissions.length) {
    try {
      authorize(ctx, ...permissions);
    } catch {
      redirect(`/app/${slug}?sinpermiso=1`);
    }
  }
  return { session, ctx };
});
