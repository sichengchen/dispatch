import { serve } from "@hono/node-server";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { app } from "./app";
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

async function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, hostname);
  });
}

async function getEphemeralPort() {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, hostname, resolve));
  const address = probe.address();
  probe.close();
  if (address && typeof address === "object") {
    return address.port;
  }
  return 0;
}

async function resolvePort() {
  const envPort = process.env.PORT ? Number(process.env.PORT) : null;
  if (envPort && Number.isFinite(envPort)) {
    if (await isPortAvailable(envPort)) {
      return envPort;
    }
    throw new Error(
      `Port ${envPort} is already in use. Set PORT to a free value or unset it to auto-select.`
    );
  }

  for (let port = 3001; port <= 3010; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  return getEphemeralPort();
}

async function start() {
  const port = await resolvePort();
  serve({ fetch: app.fetch, port, hostname });
  console.log(`Dispatch server listening on http://${hostname}:${port}`);
  startScheduler();
}

start().catch((err) => {
  console.error("Failed to start Dispatch server:", err);
  process.exit(1);
});
