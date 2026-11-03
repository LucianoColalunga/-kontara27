/**
 * Levanta el build de producción en esta máquina para probarlo tal como corre en producción (CSP con
 * nonce, cookies, caché, service worker) sin servicios externos: correo de consola y disco local.
 * Requiere `npm run build` antes. env.ts rechaza el permiso si APP_URL no es local o si corre en Vercel.
 *
 *   npm run start:local
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadEnvFiles } from "./support/env";

loadEnvFiles();
const appUrl = new URL(process.env.APP_URL ?? "http://localhost:3000");
const port = appUrl.port || "3000";
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", LOCAL_PRODUCTION_PREVIEW: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
