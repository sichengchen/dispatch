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
});

export type AppRouter = typeof appRouter;

export const app = new Hono();

// Enable CORS for Electron renderer process
app.use("*", cors());

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
