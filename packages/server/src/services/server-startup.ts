import net from "node:net";

export type ResolvePortOptions = {
  hostname: string;
  preferredPort?: number | null;
  allowExistingServer?: boolean;
  reuseWaitMs?: number;
  scanStart?: number;
  scanEnd?: number;
};

export type ResolvePortResult = {
  port: number;
  reused: boolean;
};

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isPortAvailable(port: number, hostname: string) {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, hostname);
  });
}

async function checkServerHealthy(hostname: string, port: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const res = await fetch(`http://${hostname}:${port}/health`, {
      signal: controller.signal
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServerHealthy(
  hostname: string,
  port: number,
  timeoutMs: number
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkServerHealthy(hostname, port)) {
      return true;
    }
    await delay(250);
  }
  return false;
}

async function getEphemeralPort(hostname: string) {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, hostname, resolve));
  const address = probe.address();
  probe.close();
  if (address && typeof address === "object") {
    return address.port;
  }
  return 0;
}

export async function resolvePort({
  hostname,
  preferredPort,
  allowExistingServer = false,
  reuseWaitMs = 2000,
  scanStart = 3001,
  scanEnd = 3010
}: ResolvePortOptions): Promise<ResolvePortResult> {
  const envPort = preferredPort ?? null;

  if (envPort && Number.isFinite(envPort)) {
    const port = Number(envPort);
    if (await isPortAvailable(port, hostname)) {
      return { port, reused: false };
    }
    if (allowExistingServer) {
      const healthy = await waitForServerHealthy(hostname, port, reuseWaitMs);
      if (healthy) {
        return { port, reused: true };
      }
    }
    throw new Error(
      `Port ${port} is already in use. Set PORT to a free value or unset it to auto-select.`
    );
  }

  for (let port = scanStart; port <= scanEnd; port += 1) {
    if (await isPortAvailable(port, hostname)) {
      return { port, reused: false };
    }
  }

  const port = await getEphemeralPort(hostname);
  return { port, reused: false };
}
