import { Hono } from "hono";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "./context";
import { sourcesRouter } from "./routes/sources";
import { articlesRouter } from "./routes/articles";
import { settingsRouter } from "./routes/settings";
import { digestsRouter } from "./routes/digests";
import { t } from "./trpc";

export const appRouter = t.router({
  sources: sourcesRouter,
  articles: articlesRouter,
  settings: settingsRouter,
  digests: digestsRouter,
});

export type AppRouter = typeof appRouter;

export const app = new Hono();

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
