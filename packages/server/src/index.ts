import { Hono } from "hono";
import { initTRPC } from "@trpc/server";
import { createContext } from "./context";
import { sourcesRouter } from "./routes/sources";
import { articlesRouter } from "./routes/articles";

const t = initTRPC.context<typeof createContext>().create();

export const appRouter = t.router({
  sources: sourcesRouter,
  articles: articlesRouter
});

export type AppRouter = typeof appRouter;

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/", (c) => c.text("Dispatch server placeholder"));

const port = Number(process.env.PORT ?? 3001);

export default {
  port,
  fetch: app.fetch
};
