import { getServices } from "@/server/container";
import { json } from "@/server/http/route";
import { runScheduledDaily } from "@/server/jobs";

/** Vercel Cron → GET con «Authorization: Bearer CRON_SECRET». */
export async function GET(request: Request) {
  const result = await runScheduledDaily(request.headers.get("authorization"), await getServices());
  return result ? json({ ok: true, ...result }) : json({ error: "forbidden" }, 403);
}
