import { getServices } from "@/server/container";
import { fileResponse, handleRouteError, json, routeTenant } from "@/server/http/route";
import { getSession } from "@/server/http/session";
import { isUuid } from "@/server/platform/ids";

/**
 * Descarga de archivos privados. Exige a la vez: enlace firmado y vigente (5 min) ligado al usuario,
 * sesión activa, membresía en la empresa (RLS) y el permiso que corresponde al tipo de archivo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const slug = url.searchParams.get("org") ?? "";
    if (!isUuid(id)) return json({ error: "not_found" }, 404);
    const session = await getSession();
    if (!session) return json({ error: "auth_required" }, 401);
    const services = await getServices();
    if (!services.documents.verifyDownloadLink(id, session.user.id, Number(url.searchParams.get("exp")), url.searchParams.get("sig") ?? "")) {
      return json({ error: "link_expired", message: "El enlace venció. Volvé a abrirlo desde la aplicación." }, 403);
    }
    const tenant = await routeTenant(slug);
    if (!tenant.ok) return tenant.response;
    const file = await services.documents.readFile(tenant.value, id);
    if ("redirect" in file) return Response.redirect(file.redirect, 302);
    const inline = file.contentType === "application/pdf" || file.contentType.startsWith("image/");
    return fileResponse(file.bytes, file.name, file.contentType, inline ? "inline" : "attachment");
  } catch (error) {
    return handleRouteError(error);
  }
}
