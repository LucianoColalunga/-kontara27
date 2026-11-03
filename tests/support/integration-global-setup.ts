/**
 * Prepara una base plantilla migrada una sola vez; cada archivo de prueba la clona (CREATE DATABASE … TEMPLATE).
 * Usa TEST_DATABASE_ADMIN_URL (CI: servicio postgres) o el PostgreSQL local embebido (npm run db:local).
 */
import pg from "pg";
import type { TestProject } from "vitest/node";
import { ensureRolesAndDatabase } from "../../scripts/db/bootstrap";
import { runMigrations } from "../../scripts/db/migrate";
import { loadEnvFiles } from "../../scripts/support/env";

export const TEMPLATE_DB = "kontara_test_template";

declare module "vitest" {
  export interface ProvidedContext {
    dbAdminUrl: string;
    dbHost: string;
    ownerPassword: string;
    appPassword: string;
  }
}

export default async function setup(project: TestProject) {
  loadEnvFiles();
  const adminUrl =
    process.env.TEST_DATABASE_ADMIN_URL ??
    `postgres://postgres:${encodeURIComponent(process.env.LOCAL_PG_SUPERUSER_PASSWORD ?? "local-superuser-only")}@127.0.0.1:${process.env.LOCAL_PG_PORT ?? 54329}/postgres`;
  const ownerPassword = process.env.TEST_DB_OWNER_PASSWORD ?? process.env.LOCAL_PG_OWNER_PASSWORD ?? "local-owner-only";
  const appPassword = process.env.TEST_DB_APP_PASSWORD ?? process.env.LOCAL_PG_APP_PASSWORD ?? "local-app-only";

  const admin = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`No hay PostgreSQL para las pruebas de integración (${(error as Error).message}). Iniciá el local con "npm run db:local" o definí TEST_DATABASE_ADMIN_URL.`);
  }
  // Borra plantillas y bases de corridas anteriores.
  const stale = await admin.query<{ datname: string }>("select datname from pg_database where datname like 'kontara_test_%'");
  for (const { datname } of stale.rows) await admin.query(`drop database if exists "${datname}" with (force)`);
  await admin.end();

  await ensureRolesAndDatabase(adminUrl, { database: TEMPLATE_DB, ownerPassword, appPassword });
  const host = new URL(adminUrl);
  const ownerUrl = `postgres://app_owner:${encodeURIComponent(ownerPassword)}@${host.host}/${TEMPLATE_DB}`;
  await runMigrations(ownerUrl);

  project.provide("dbAdminUrl", adminUrl);
  project.provide("dbHost", host.host);
  project.provide("ownerPassword", ownerPassword);
  project.provide("appPassword", appPassword);
}
