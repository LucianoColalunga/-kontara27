import { sql } from "drizzle-orm";
import { env } from "@/server/platform/env";
import { getDb } from "@/server/platform/db";
import { logger } from "@/server/platform/logger";

/**
 * Readiness: configuración válida, base accesible con un rol restringido (sin BYPASSRLS) y migraciones
 * aplicadas. Devuelve solo estados, nunca valores de configuración.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};
  try {
    env();
    checks.config = "ok";
  } catch (error) {
    logger.error("health.config", { error });
    checks.config = "fail";
  }
  try {
    const db = await getDb(); // incluye la verificación del rol restringido
    const result = await db.execute<{ n: number }>(sql`select count(*)::int as n from drizzle.__drizzle_migrations`).catch(() => ({ rows: [{ n: -1 }] }));
    checks.database = "ok";
    checks.migrations = (result.rows[0]?.n ?? -1) > 0 ? "ok" : "fail";
  } catch (error) {
    logger.error("health.database", { error });
    checks.database = "fail";
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return new Response(JSON.stringify({ status: healthy ? "ok" : "degraded", checks }), { status: healthy ? 200 : 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
