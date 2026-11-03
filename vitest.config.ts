import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  "@tests": path.resolve(import.meta.dirname, "tests"),
  // `server-only` lanza un error fuera del bundler de Next; en pruebas es un módulo vacío.
  "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          env: { LOG_LEVEL: "warn" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: { LOG_LEVEL: "warn" },
          globalSetup: ["tests/support/integration-global-setup.ts"],
          // Cada archivo crea su propia base de datos; se ejecutan en serie para no saturar el servidor local.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
