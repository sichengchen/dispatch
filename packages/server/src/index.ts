import { serve } from "@hono/node-server";
import fs from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { app } from "./app";
import { resolvePort } from "./services/server-startup";
import { startScheduler } from "./services/scheduler";

export type { AppRouter } from "./app";

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

function loadDotEnv() {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const candidates = [
    workspaceRoot ? path.join(workspaceRoot, ".env") : null,
    path.resolve(process.cwd(), ".env")
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      loadEnv({ path: candidate });
      break;
    }
  }
}

loadDotEnv();

const hostname = process.env.HOST ?? "127.0.0.1";

async function start() {
  const allowExisting = process.env.DISPATCH_ALLOW_EXISTING_SERVER === "1";
  const envPort = process.env.PORT ? Number(process.env.PORT) : null;
  const { port, reused } = await resolvePort({
    hostname,
    preferredPort: envPort,
    allowExistingServer: allowExisting,
    reuseWaitMs: Number(process.env.DISPATCH_SERVER_REUSE_TIMEOUT_MS ?? 2000)
  });

  if (reused) {
    console.log(`Dispatch server already running on http://${hostname}:${port}`);
    return;
  }
  serve({ fetch: app.fetch, port, hostname });
  console.log(`Dispatch server listening on http://${hostname}:${port}`);
  startScheduler();
}

start().catch((err) => {
  console.error("Failed to start Dispatch server:", err);
  process.exit(1);
});
