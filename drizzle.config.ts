import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_OWNER_URL ?? "postgres://app_owner:local-owner-only@127.0.0.1:54329/kontara",
  },
});
