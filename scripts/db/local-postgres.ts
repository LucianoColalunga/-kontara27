/**
 * PostgreSQL local para desarrollo, sin Docker (binarios oficiales vía `embedded-postgres`).
 *
 *   npm run db:local           inicia el servidor (Ctrl+C para detenerlo) o reutiliza el que ya corre
 *   npm run db:local -- stop   lo detiene
 *   npm run db:local -- reset  borra el clúster local y lo vuelve a crear
 *
 * Crea los roles `app_owner` (migraciones) y `app_user` (aplicación, sujeto a RLS) y la base `kontara`.
 * Las contraseñas salen de .env.local; los valores por defecto solo sirven en esta máquina.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { loadEnvFiles } from "../support/env";
import { ensureRolesAndDatabase } from "./bootstrap";

loadEnvFiles();

const dataDir = path.resolve(".data/postgres");
const port = Number(process.env.LOCAL_PG_PORT ?? 54329);
const superPassword = process.env.LOCAL_PG_SUPERUSER_PASSWORD ?? "local-superuser-only";
const adminUrl = `postgres://postgres:${encodeURIComponent(superPassword)}@127.0.0.1:${port}/postgres`;
const command = process.argv[2] ?? "start";

/** Ruta de pg_ctl que publica el paquete de binarios de esta plataforma (solo exporta su entrada principal). */
async function pgCtlPath(): Promise<string> {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const binaries = (await import(`@embedded-postgres/${platform}-${process.arch}`)) as { pg_ctl: string };
  return binaries.pg_ctl;
}

async function isRunning(): Promise<boolean> {
  const client = new pg.Client({ connectionString: adminUrl, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function stop(): Promise<void> {
  if (!existsSync(path.join(dataDir, "postmaster.pid"))) return;
  spawnSync(await pgCtlPath(), ["stop", "-D", dataDir, "-m", "fast", "-w"], { stdio: "inherit" });
}

async function bootstrap(): Promise<void> {
  await ensureRolesAndDatabase(adminUrl, {
    database: process.env.LOCAL_PG_DATABASE ?? "kontara",
    ownerPassword: process.env.LOCAL_PG_OWNER_PASSWORD ?? "local-owner-only",
    appPassword: process.env.LOCAL_PG_APP_PASSWORD ?? "local-app-only",
  });
}

if (command === "stop") {
  await stop();
  process.exit(0);
}

if (command === "reset") {
  await stop();
  rmSync(dataDir, { recursive: true, force: true });
  console.log("Clúster local eliminado.");
}

if (await isRunning()) {
  await bootstrap();
  console.log(`PostgreSQL local ya estaba corriendo en 127.0.0.1:${port}; roles y base verificados.`);
  process.exit(0);
}

// Un postmaster.pid sin servidor que responda es un resto de un cierre abrupto.
rmSync(path.join(dataDir, "postmaster.pid"), { force: true });

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: superPassword,
  port,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--auth=scram-sha-256"],
  onLog: process.env.PG_DEBUG ? (message) => console.log(String(message).trim()) : () => {},
  onError: (message) => console.error(String(message)),
});

if (!existsSync(path.join(dataDir, "PG_VERSION"))) await server.initialise();
await server.start();
await bootstrap();

console.log(`PostgreSQL local listo en 127.0.0.1:${port} (datos en ${dataDir}).`);
console.log("Ctrl+C para detenerlo.");

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
