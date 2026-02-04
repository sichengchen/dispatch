import http from "node:http";
import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePort } from "../src/services/server-startup";

const HOST = "127.0.0.1";

const servers: Array<http.Server | net.Server> = [];

afterEach(() => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      server.close();
    }
  }
});

function listenHttpServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise<{ server: http.Server; port: number }>((resolve) => {
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      servers.push(server);
      resolve({ server, port });
    });
  });
}

function listenNetServer() {
  const server = net.createServer();
  return new Promise<{ server: net.Server; port: number }>((resolve) => {
    server.listen(0, HOST, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      servers.push(server);
      resolve({ server, port });
    });
  });
}

describe("resolvePort", () => {
  it("reuses a healthy server when preferred port is in use", async () => {
    const { port } = await listenHttpServer();
    const result = await resolvePort({
      hostname: HOST,
      preferredPort: port,
      allowExistingServer: true,
      reuseWaitMs: 500
    });

    expect(result.reused).toBe(true);
    expect(result.port).toBe(port);
  });

  it("throws when preferred port is in use but unhealthy", async () => {
    const { port } = await listenNetServer();

    await expect(
      resolvePort({
        hostname: HOST,
        preferredPort: port,
        allowExistingServer: true,
        reuseWaitMs: 300
      })
    ).rejects.toThrow(/Port .* is already in use/);
  });

  it("returns the preferred port when it is available", async () => {
    const probe = net.createServer();
    const port = await new Promise<number>((resolve) => {
      probe.listen(0, HOST, () => {
        const address = probe.address();
        const resolved = typeof address === "object" && address ? address.port : 0;
        probe.close(() => resolve(resolved));
      });
    });

    const result = await resolvePort({
      hostname: HOST,
      preferredPort: port,
      allowExistingServer: false
    });

    expect(result.reused).toBe(false);
    expect(result.port).toBe(port);
  });
});
