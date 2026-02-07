import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

export * from "./schema";
import * as schema from "./schema";

function findWorkspaceRoot(startDir: string) {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, "turbo.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function getDefaultDbPath() {
  if (process.env.DISPATCH_DB_PATH) {
    return path.resolve(process.env.DISPATCH_DB_PATH);
  }
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) {
    const targetPath = path.join(workspaceRoot, "dispatch.dev.db");
    if (!fs.existsSync(targetPath)) {
      const legacyCandidates = [
        path.join(workspaceRoot, "packages/server/dispatch.dev.db"),
        path.join(workspaceRoot, "packages/db/dispatch.dev.db"),
        path.resolve(process.cwd(), "dispatch.dev.db")
      ];
      const legacyPath = legacyCandidates.find((candidate) =>
        fs.existsSync(candidate)
      );
      if (legacyPath) {
        fs.copyFileSync(legacyPath, targetPath);
      }
    }
    return targetPath;
  }
  return path.resolve("dispatch.dev.db");
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function createDbClient(dbPath = getDefaultDbPath()) {
  ensureDir(dbPath);
  const sqlite = new Database(dbPath);
  return drizzle(sqlite, { schema });
}

export const db = createDbClient();
export type DbClient = ReturnType<typeof createDbClient>;
