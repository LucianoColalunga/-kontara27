import { getServices } from "@/server/container";
import { fileResponse, handleRouteError, json } from "@/server/http/route";
import { getSession, requestMeta } from "@/server/http/session";
import { env } from "@/server/platform/env";

/** Exportación de datos personales. Exige sesión y reautenticación reciente (10 minutos). */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ error: "auth_required" }, 401);
    const services = await getServices();
    if (!services.sessions.isRecentlyReauthenticated(session.session)) return Response.redirect(new URL("/cuenta?reautenticar=1", env().APP_URL), 303);
    const data = await services.privacy.exportUserData(session.user.id, await requestMeta());
    const body = new TextEncoder().encode(JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    return fileResponse(body, `mis-datos-${new Date().toISOString().slice(0, 10)}.json`, "application/json; charset=utf-8");
  } catch (error) {
    return handleRouteError(error);
  }
}
