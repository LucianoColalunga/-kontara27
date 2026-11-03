import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@/server/db/schema";
import { env } from "./env";
import { logger } from "./logger";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Cualquier cosa que ejecute consultas: la base o una transacción en curso. */
export type Executor = Database | Tx;

export interface TenantScope {
  userId: string;
  organizationId: string;
}

export function createDatabase(connectionString: string, max = 10): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    // Corta consultas desbocadas antes de que agoten el pool.
    statement_timeout: 15_000,
    application_name: "kontara27",
  });
  pool.on("error", (error) => logger.error("db.pool_error", { error }));
  return { db: drizzle(pool, { schema }), pool };
}

let shared: { db: Database; pool: pg.Pool; verified: Promise<void> } | undefined;

/** Base compartida del proceso. La primera vez verifica que el rol no pueda saltear RLS. */
export async function getDb(): Promise<Database> {
  if (!shared) {
    const created = createDatabase(env().DATABASE_URL, Number(process.env.DB_POOL_MAX ?? 10));
    shared = { ...created, verified: assertRestrictedRole(created.db) };
  }
  await shared.verified;
  return shared.db;
}

/**
 * Falla cerrada si la aplicación se conecta con un rol superusuario, con BYPASSRLS o dueño de las
 * tablas: en ese caso RLS no protegería nada y es preferible no atender pedidos.
 */
export async function assertRestrictedRole(db: Database): Promise<void> {
  const result = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean; owns_tables: boolean }>(sql`
    select r.rolsuper, r.rolbypassrls,
           exists (select 1 from pg_tables t where t.schemaname = 'public' and t.tableowner = current_user) as owns_tables
    from pg_roles r where r.rolname = current_user`);
  const row = result.rows[0];
  if (!row || row.rolsuper || row.rolbypassrls || row.owns_tables) {
    throw new Error("DATABASE_URL usa un rol con privilegios que saltean RLS. Configurá el rol app_user (ver docs/deploy/produccion.md).");
  }
}

/** Ejecuta `fn` en una transacción con el contexto de una organización (activa las políticas RLS). */
export async function withTenant<T>(db: Database, scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${scope.userId}, true), set_config('app.org_id', ${scope.organizationId}, true)`);
    return fn(tx);
  });
}

/** Contexto de usuario sin organización: listar sus empresas, crear una nueva, aceptar invitaciones. */
export async function withUser<T>(db: Database, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true), set_config('app.org_id', '', true)`);
    return fn(tx);
  });
}

export async function closeSharedDb(): Promise<void> {
  if (shared) await shared.pool.end();
  shared = undefined;
}
