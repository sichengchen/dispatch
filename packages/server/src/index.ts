import { serve } from "@hono/node-server";
import net from "node:net";
import { app } from "./app";
import { startScheduler } from "./services/scheduler";

export type { AppRouter } from "./app";

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
