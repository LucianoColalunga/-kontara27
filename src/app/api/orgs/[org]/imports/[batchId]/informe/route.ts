import { getServices } from "@/server/container";
import { fileResponse, handleRouteError, json, routeTenant } from "@/server/http/route";
import { isUuid } from "@/server/platform/ids";

export async function GET(_: Request, { params }: { params: Promise<{ org: string; batchId: string }> }) {
  try {
    const { org, batchId } = await params;
    if (!isUuid(batchId)) return json({ error: "not_found" }, 404);
    const tenant = await routeTenant(org, "imports.run");
    if (!tenant.ok) return tenant.response;
    const report = await (await getServices()).imports.exportReport(tenant.value, batchId);
    return fileResponse(report.bytes, report.filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } catch (error) {
    return handleRouteError(error);
  }
}
