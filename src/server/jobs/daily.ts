import "server-only";
import { and, isNotNull, lt, or, sql } from "drizzle-orm";
import { rateLimitBuckets, sessions, userTokens } from "@/server/db/schema";
import type { Database } from "@/server/platform/db";
import { logger } from "@/server/platform/logger";
import type { Services } from "@/server/services";

/**
 * Tarea diaria: alertas de presupuesto y avisos de vencimientos de cada empresa (en nombre de un
 * propietario, con su contexto RLS normal) y limpieza de sesiones, tokens y contadores vencidos.
 */
export async function runDailyJobs(db: Database, services: Services, now = new Date()) {
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
      logger.error("jobs.organization_failed", { error, organization: t.organization_id });
    }
  }
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  await db.delete(sessions).where(or(lt(sessions.absoluteExpiresAt, now), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, thirtyDaysAgo))));
  await db.delete(userTokens).where(lt(userTokens.expiresAt, thirtyDaysAgo));
  await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.windowStart, new Date(now.getTime() - 2 * 86_400_000)));
  logger.info("jobs.daily", { organizations: targets.rows.length, alerts, reminders });
  return { organizations: targets.rows.length, alerts, reminders };
}
