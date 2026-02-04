import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { sources } from "@dispatch/db";
import { t } from "../trpc";
import { discoverSources } from "../services/discovery";
import { scrapeSource } from "../services/scraper";

export const sourcesRouter = t.router({
  list: t.procedure.query(({ ctx }) => {
    return ctx.db.select().from(sources).all();
  }),
  add: t.procedure
    .input(
      z.object({
        url: z.string().url(),
        name: z.string().min(1),
        type: z.enum(["rss", "web"]).default("rss")
      })
    )
    .mutation(({ ctx, input }) => {
      const insertResult = ctx.db
        .insert(sources)
        .values({
          url: input.url,
          name: input.name,
          type: input.type
        })
        .run();

      const id = Number(insertResult.lastInsertRowid);
      const row = ctx.db
        .select()
        .from(sources)
        .where(eq(sources.id, id))
        .get();

      if (!row) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      return row;
    }),
  delete: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const result = ctx.db
        .delete(sources)
        .where(eq(sources.id, input.id))
        .run();

      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Source not found" });
      }

      return { ok: true };
    }),
  deleteMany: t.procedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1)
      })
    )
    .mutation(({ ctx, input }) => {
      const uniqueIds = Array.from(new Set(input.ids));
      const result = ctx.db
        .delete(sources)
        .where(inArray(sources.id, uniqueIds))
        .run();

      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Sources not found" });
      }

      return { ok: true, deleted: result.changes };
    }),
  refresh: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const result = await scrapeSource(input.id);
      return { ok: true, ...result };
    }),
  retry: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      ctx.db
        .update(sources)
        .set({
          consecutiveFailures: 0,
          healthStatus: "healthy",
          isActive: true,
          lastErrorAt: null,
        })
        .where(eq(sources.id, input.id))
        .run();
      const result = await scrapeSource(input.id);
      return { ok: true, ...result };
    }),
  discover: t.procedure
    .input(z.object({ query: z.string().min(3).max(200) }))
    .mutation(async ({ input }) => {
      const suggestions = await discoverSources(input.query);
      return suggestions;
    })
});
