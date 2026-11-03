import { checkReadiness } from "@/server/platform/health";

export async function GET() {
  const { healthy, checks } = await checkReadiness();
  return new Response(JSON.stringify({ status: healthy ? "ok" : "degraded", checks }), { status: healthy ? 200 : 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
