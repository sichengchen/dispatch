import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export * from "./schema";
import * as schema from "./schema";

const DEFAULT_DB_PATH = path.resolve(
  process.env.DISPATCH_DB_PATH ?? "dispatch.dev.db"
);

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createDbClient(dbPath = DEFAULT_DB_PATH) {
  ensureDir(dbPath);
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema });
}

export const db = createDbClient();
export type DbClient = ReturnType<typeof createDbClient>;
