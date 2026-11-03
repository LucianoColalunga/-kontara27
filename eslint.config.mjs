import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Límites entre capas (ver docs/architecture/README.md):
// - la presentación solo usa la API pública de cada módulo (src/server/modules/<m>/index.ts);
// - ningún módulo entra en las carpetas internas de otro.
const moduleInternals = [
  "@/server/modules/*/domain/*",
  "@/server/modules/*/application/*",
  "@/server/modules/*/infrastructure/*",
];

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "private/**", "storage/**", ".data/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts", "public/sw.js"],
  },
  {
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "react/no-danger": "error",
    },
  },
  {
    files: ["src/app/**", "src/components/**", "src/lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: moduleInternals, message: "Usá la API pública del módulo (src/server/modules/<módulo>)." },
            { group: ["@/server/db/*", "@/server/platform/db*"], message: "La presentación no accede a la base de datos." },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/platform/logger.ts", "scripts/**", "tests/**"],
    rules: { "no-console": "off" },
  },
];

export default config;
