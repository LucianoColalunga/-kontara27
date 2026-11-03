import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT } from "./scripts/e2e/paths";

/**
 * Pruebas de punta a punta contra el build de producción (CSP estricta incluida) y una base propia.
 * Antes: `npm run build`. Base local: `npm run db:local` (en CI, el servicio postgres del workflow).
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Una sola base para la corrida: cada prueba crea sus propios usuarios y empresas, en serie.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive\.spec\.ts/ },
    { name: "celular", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: "npx tsx scripts/e2e/server.ts",
    url: `http://localhost:${E2E_PORT}/api/health/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
