import pg from "pg";

export interface BootstrapOptions {
  database: string;
  ownerPassword: string;
  appPassword: string;
}

/**
 * Crea (si faltan) los roles y la base de datos. Idempotente.
 * - app_owner: dueño del esquema; solo lo usan las migraciones.
 * - app_user: rol de la aplicación. Sin BYPASSRLS ni privilegios de creación.
 */
export async function ensureRolesAndDatabase(adminUrl: string, opts: BootstrapOptions): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await upsertRole(client, "app_owner", opts.ownerPassword, "LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS");
    await upsertRole(client, "app_user", opts.appPassword, "LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS NOINHERIT");
    const exists = await client.query("select 1 from pg_database where datname = $1", [opts.database]);
    if (exists.rowCount === 0) {
      await client.query(`create database ${quoteIdent(opts.database)} owner app_owner encoding 'UTF8' template template0`);
    }
    await client.query(`revoke all on database ${quoteIdent(opts.database)} from public`);
    await client.query(`grant connect, temporary on database ${quoteIdent(opts.database)} to app_user`);
  } finally {
    await client.end();
  }
}

async function upsertRole(client: pg.Client, name: string, password: string, attributes: string): Promise<void> {
  const exists = await client.query("select 1 from pg_roles where rolname = $1", [name]);
  const verb = exists.rowCount === 0 ? "create" : "alter";
  // Las contraseñas no admiten parámetros en DDL: se escapan como literal.
  await client.query(`${verb} role ${quoteIdent(name)} with ${attributes} password ${quoteLiteral(password)}`);
}

export function quoteIdent(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error(`Identificador no válido: ${value}`);
  return `"${value}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
