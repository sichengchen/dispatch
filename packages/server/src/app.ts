import { Hono } from "hono";
import { cors } from "hono/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./context";
import { sourcesRouter } from "./routes/sources";
import { articlesRouter } from "./routes/articles";
import { settingsRouter } from "./routes/settings";
import { digestsRouter } from "./routes/digests";
import { tasksRouter } from "./routes/tasks";
import { agentsRouter, registerAgentChatEndpoint } from "./routes/agents";
import { notificationsRouter } from "./routes/notifications.js";
import { registerAddSourceAgent } from "./services/agents/add-source-agent";
import { t } from "./trpc";

// Register agents at module load time
registerAddSourceAgent();

export const appRouter = t.router({
  sources: sourcesRouter,
  articles: articlesRouter,
  settings: settingsRouter,
  digests: digestsRouter,
  tasks: tasksRouter,
  agents: agentsRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;

export const app = new Hono();

function isTrustedRendererOrigin(origin: string): boolean {
  if (origin === "null") {
    // Packaged Electron renderer may use the opaque "null" origin.
    return true;
  }
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }
    if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Reject requests from untrusted browser origins before route handling.
app.use("*", async (c, next) => {
  const origin = c.req.header("origin");
  if (origin && !isTrustedRendererOrigin(origin)) {
    return c.json({ error: "Origin not allowed" }, 403);
  }
  await next();
});

// Apply CORS only to trusted renderer origins.
app.use(
  "*",
  cors({
    origin: (origin) => (origin && isTrustedRendererOrigin(origin) ? origin : ""),
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true
  })
);

// Register streaming agent chat endpoint (outside tRPC)
registerAgentChatEndpoint(app);

app.get("/health", (c) => c.json({ status: "ok" }));

app.all("/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext({ req: c.req.raw })
  })
);

app.get("/", (c) => c.text("Dispatch server placeholder"));
