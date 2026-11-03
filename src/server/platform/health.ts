import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Readiness: configuración válida, base accesible con un rol restringido (sin BYPASSRLS) y migraciones
 * aplicadas. Devuelve solo estados, nunca valores de configuración.
 */
export async function checkReadiness(): Promise<{ healthy: boolean; checks: Record<string, "ok" | "fail"> }> {
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
  return { healthy: Object.values(checks).every((v) => v === "ok"), checks };
}
