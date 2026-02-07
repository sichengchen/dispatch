import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

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

const dbPath = (() => {
  if (process.env.DISPATCH_DB_PATH) {
    return path.resolve(process.env.DISPATCH_DB_PATH);
  }
  const root = findWorkspaceRoot(process.cwd());
  if (root) {
    return path.join(root, "dispatch.dev.db");
  }
  return path.resolve("./dispatch.dev.db");
})();

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath
  }
});
