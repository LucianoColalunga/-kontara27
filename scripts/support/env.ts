import { existsSync, readFileSync } from "node:fs";

/**
 * Carga .env.local y .env (en ese orden de prioridad) para los scripts de Node.
 * No pisa variables ya definidas en el entorno. Next.js hace lo mismo por su cuenta en la app.
 */
export function loadEnvFiles(files = [".env.local", ".env"]): void {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match as unknown as [string, string, string];
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}
