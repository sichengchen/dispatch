import { z } from "zod";
import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "../context";

const t = initTRPC.context<TrpcContext>().create();

export const sourcesRouter = t.router({
  list: t.procedure.query(() => []),
  add: t.procedure
    .input(
      z.object({
        url: z.string().url(),
        name: z.string().min(1),
        type: z.enum(["rss", "web"]).default("rss")
      })
    )
    .mutation(() => ({ ok: true })),
  delete: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(() => ({ ok: true }))
});
