import { z } from "zod";
import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "../context";

const t = initTRPC.context<TrpcContext>().create();

export const articlesRouter = t.router({
  list: t.procedure
    .input(
      z
        .object({
          sourceId: z.number().int().positive().optional(),
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(20)
        })
        .optional()
    )
    .query(() => []),
  markRead: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(() => ({ ok: true }))
});
