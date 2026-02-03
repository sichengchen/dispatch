import { defineConfig } from "drizzle-kit";

const dbPath = process.env.DISPATCH_DB_PATH ?? "./dispatch.dev.db";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath
  }
});
