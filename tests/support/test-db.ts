import { randomBytes } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";
import { createDatabase, type Database } from "@/server/platform/db";
import { fixedClock } from "@/server/platform/clock";
import { MemoryEmailSender } from "@/server/platform/email";
import { MemoryFileStorage } from "@/server/platform/storage";
import { buildServices } from "@/server/services";

export interface TestEnvironment {
  db: Database;
  /** Cliente directo con el rol de la aplicación (para probar RLS con SQL crudo). */
  appClient: () => Promise<pg.Client>;
  email: MemoryEmailSender;
  storage: MemoryFileStorage;
  clock: ReturnType<typeof fixedClock>;
  services: ReturnType<typeof buildServices>;
  dispose: () => Promise<void>;
}

/** Base nueva por archivo de prueba, clonada de la plantilla migrada. */
export async function createTestEnvironment(options: { now?: Date } = {}): Promise<TestEnvironment> {
  const name = `kontara_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: inject("dbAdminUrl") });
  await admin.connect();
  await admin.query(`create database "${name}" template kontara_test_template owner app_owner`);
  await admin.query(`grant connect, temporary on database "${name}" to app_user`);
  await admin.end();

  const appUrl = `postgres://app_user:${encodeURIComponent(inject("appPassword"))}@${inject("dbHost")}/${name}`;
  const { db, pool } = createDatabase(appUrl, 6);
  const email = new MemoryEmailSender();
  const storage = new MemoryFileStorage();
  const clock = fixedClock(options.now ?? new Date("2026-11-03T12:00:00Z"));
  const services = buildServices({
    db,
    email,
    storage,
    clock,
    encryptionKey: randomBytes(32),
    signingKey: randomBytes(32),
    appUrl: "https://app.test",
    // Parámetros bajos de Argon2id solo en pruebas para que la suite sea rápida.
    argon2: { memoryCost: 1024, timeCost: 1, parallelism: 1, outputLen: 32 },
  });
  const clients: pg.Client[] = [];
  return {
    db,
    email,
    storage,
    clock,
    services,
    appClient: async () => {
      const client = new pg.Client({ connectionString: appUrl });
      await client.connect();
      clients.push(client);
      return client;
    },
    dispose: async () => {
      for (const c of clients) await c.end().catch(() => {});
      await pool.end();
      const cleanup = new pg.Client({ connectionString: inject("dbAdminUrl") });
      await cleanup.connect();
      await cleanup.query(`drop database if exists "${name}" with (force)`);
      await cleanup.end();
    },
  };
}

export const meta = { ip: "203.0.113.10", userAgent: "vitest" };
