/**
 * Carga una planilla en revisión desde la línea de comandos (mismo servicio que la interfaz).
 * No confirma nada: la revisión y la confirmación se hacen en /app/<empresa>/importar/<id>.
 *
 *   npm run import:workbook -- --email persona@empresa.com --org slug-empresa --file "C:\ruta\planilla.xlsx" [--currency ARS]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadEnvFiles } from "./support/env";

loadEnvFiles();

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const email = arg("email");
const slug = arg("org");
const file = arg("file");
if (!email || !slug || !file) {
  console.error("Uso: --email <correo> --org <slug> --file <ruta.xlsx> [--currency ARS]");
  process.exit(1);
}

const { getServices } = await import("../src/server/container");
const { closeSharedDb } = await import("../src/server/platform/db");
const services = await getServices();
const user = await services.users.findByEmail(email.trim().toLowerCase());
if (!user) throw new Error("No existe un usuario con ese correo.");
const ctx = await services.tenancy.resolveContext(user.id, slug);
if (!ctx) throw new Error("El usuario no es miembro de esa empresa.");
const bytes = new Uint8Array(readFileSync(file));
const batchId = await services.imports.preview(ctx, { name: path.basename(file), bytes }, { currency: arg("currency") }, { ip: "cli", userAgent: "scripts/import-workbook" });
const { stats, reconciliation } = await services.imports.getBatch(ctx, batchId);
console.log(`Importación en revisión: ${batchId}`);
console.log(`Filas: ${JSON.stringify(stats)}`);
console.log(`Hallazgos: ${reconciliation.findings.length}`);
console.log(`Revisala en ${process.env.APP_URL ?? "http://localhost:3000"}/app/${slug}/importar/${batchId}`);
await closeSharedDb();
