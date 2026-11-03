import "server-only";
import { constantTimeEqual } from "@/server/platform/crypto";
import { getDb } from "@/server/platform/db";
import { env } from "@/server/platform/env";
import type { Services } from "@/server/services";
import { runDailyJobs } from "./daily";

/** Verifica el secreto del programador de tareas y ejecuta la tarea diaria. null = no autorizado. */
export async function runScheduledDaily(authorization: string | null, services: Services) {
  const secret = env().CRON_SECRET;
  if (!secret || !constantTimeEqual(authorization ?? "", `Bearer ${secret}`)) return null;
  return runDailyJobs(await getDb(), services);
}

export { runDailyJobs } from "./daily";
