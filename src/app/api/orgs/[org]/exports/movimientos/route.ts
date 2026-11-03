import { getServices } from "@/server/container";
import { fileResponse, handleRouteError, routeTenant } from "@/server/http/route";
import { requestMeta } from "@/server/http/session";

export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  try {
    const { org } = await params;
    const tenant = await routeTenant(org, "movements.view", "reports.export");
    if (!tenant.ok) return tenant.response;
    const file = await (await getServices()).exports.exportMovements(tenant.value, new URL(request.url).searchParams, await requestMeta());
    return fileResponse(file.bytes, file.filename, file.contentType);
  } catch (error) {
    return handleRouteError(error);
  }
}
