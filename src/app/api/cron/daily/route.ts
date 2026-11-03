import { and, isNotNull, lt, or, sql } from "drizzle-orm";
import { getServices } from "@/server/container";
import { rateLimitBuckets, sessions, userTokens } from "@/server/db/schema";
import { json } from "@/server/http/route";
import { constantTimeEqual } from "@/server/platform/crypto";
import { getDb } from "@/server/platform/db";
import { env } from "@/server/platform/env";
import { logger } from "@/server/platform/logger";

/**
 * Tarea diaria (Vercel Cron → GET con «Authorization: Bearer CRON_SECRET»):
 *  - alertas de presupuesto de cada empresa;
 *  - notificaciones de vencimientos próximos;
 *  - limpieza de sesiones, tokens y contadores de intentos vencidos (retención mínima).
 */
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !constantTimeEqual(auth, `Bearer ${secret}`)) return json({ error: "forbidden" }, 403);

  const db = await getDb();
  const services = await getServices();
  const targets = await db.execute<{ organization_id: string; slug: string; owner_user_id: string }>(sql`select * from app.cron_targets()`);
  let alerts = 0;
  let reminders = 0;
  for (const t of targets.rows) {
    try {
      const ctx = await services.tenancy.resolveContext(t.owner_user_id, t.slug);
      if (!ctx) continue;
      alerts += await services.budgets.evaluateAlerts(ctx);
      reminders += await services.reminders.notifyUpcoming(ctx);
    } catch (error) {
      logger.error("cron.organization_failed", { error, organization: t.organization_id });
    }
  }
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  await db.delete(sessions).where(or(lt(sessions.absoluteExpiresAt, now), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, thirtyDaysAgo))));
  await db.delete(userTokens).where(lt(userTokens.expiresAt, thirtyDaysAgo));
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - 2 * 86_400_000)));
  logger.info("cron.daily", { organizations: targets.rows.length, alerts, reminders });
  return json({ ok: true, organizations: targets.rows.length, alerts, reminders });
}
