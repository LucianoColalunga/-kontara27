/**
 * Aplica las migraciones de drizzle/ con el rol dueño (DATABASE_OWNER_URL).
 * Nunca usa DATABASE_URL: la aplicación no tiene permisos para cambiar el esquema.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { loadEnvFiles } from "../support/env";

loadEnvFiles();

export async function runMigrations(ownerUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

const isCli = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/db/migrate.ts");
if (isCli) {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) {
    console.error("Falta DATABASE_OWNER_URL (rol dueño del esquema).");
    process.exit(1);
  }
  await runMigrations(ownerUrl);
  console.log("Migraciones aplicadas.");
}
