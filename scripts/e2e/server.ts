/**
 * Servidor de las pruebas E2E (lo levanta Playwright). Base propia que se recrea en cada corrida
 * (kontara_e2e), buzón y archivos en .data/e2e, claves aleatorias y el build de producción con su CSP
 * estricta. Nunca toca la base de desarrollo. Requiere `npm run build` antes.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import pg from "pg";
import { ensureRolesAndDatabase, quoteIdent } from "../db/bootstrap";
import { runMigrations } from "../db/migrate";
import { loadEnvFiles } from "../support/env";
import { E2E_DIR, E2E_OUTBOX_DIR, E2E_PORT, E2E_STORAGE_DIR } from "./paths";

const DATABASE = "kontara_e2e";

loadEnvFiles();
if (!existsSync(".next/BUILD_ID")) throw new Error("Falta el build de producción: corré «npm run build» antes de las pruebas E2E.");

const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ??
  `postgres://postgres:${encodeURIComponent(process.env.LOCAL_PG_SUPERUSER_PASSWORD ?? "local-superuser-only")}@127.0.0.1:${process.env.LOCAL_PG_PORT ?? 54329}/postgres`;
const ownerPassword = process.env.TEST_DB_OWNER_PASSWORD ?? process.env.LOCAL_PG_OWNER_PASSWORD ?? "local-owner-only";
const appPassword = process.env.TEST_DB_APP_PASSWORD ?? process.env.LOCAL_PG_APP_PASSWORD ?? "local-app-only";
const host = new URL(adminUrl).host;

const admin = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
try {
  await admin.connect();
} catch (error) {
  throw new Error(`No hay PostgreSQL para las pruebas E2E (${(error as Error).message}). Iniciá el local con «npm run db:local» o definí TEST_DATABASE_ADMIN_URL.`);
}
await admin.query(`drop database if exists ${quoteIdent(DATABASE)} with (force)`);
await admin.end();
await ensureRolesAndDatabase(adminUrl, { database: DATABASE, ownerPassword, appPassword });
await runMigrations(`postgres://app_owner:${encodeURIComponent(ownerPassword)}@${host}/${DATABASE}`);
await rm(E2E_DIR, { recursive: true, force: true });

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "start", "-p", String(E2E_PORT)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    LOCAL_PRODUCTION_PREVIEW: "true",
    APP_URL: `http://localhost:${E2E_PORT}`,
    DATABASE_URL: `postgres://app_user:${encodeURIComponent(appPassword)}@${host}/${DATABASE}`,
    ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    SIGNING_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: randomBytes(24).toString("base64url"),
    EMAIL_PROVIDER: "console",
    EMAIL_OUTBOX_DIR: E2E_OUTBOX_DIR,
    STORAGE_PROVIDER: "local",
    LOCAL_STORAGE_DIR: E2E_STORAGE_DIR,
    TRUST_PROXY_HEADERS: "false",
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
