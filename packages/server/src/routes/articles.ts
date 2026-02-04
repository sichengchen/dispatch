import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { articles, sources } from "@dispatch/db";
import { t } from "../trpc";

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
    .query(({ ctx, input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const offset = (page - 1) * pageSize;

      const conditions = [];
      if (input?.sourceId) {
        conditions.push(eq(articles.sourceId, input.sourceId));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      return ctx.db
        .select({
          id: articles.id,
          sourceId: articles.sourceId,
          title: articles.title,
          url: articles.url,
          rawHtml: articles.rawHtml,
          cleanContent: articles.cleanContent,
          summary: articles.summary,
          tags: articles.tags,
          grade: articles.grade,
          keyPoints: articles.keyPoints,
          processedAt: articles.processedAt,
          publishedAt: articles.publishedAt,
          fetchedAt: articles.fetchedAt,
          isRead: articles.isRead,
          sourceName: sources.name
        })
        .from(articles)
        .leftJoin(sources, eq(articles.sourceId, sources.id))
        .where(whereClause)
        .orderBy(desc(articles.publishedAt), desc(articles.fetchedAt))
        .limit(pageSize)
        .offset(offset)
        .all();
    }),
  markRead: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const result = ctx.db
        .update(articles)
        .set({ isRead: true })
        .where(eq(articles.id, input.id))
        .run();

      if (result.changes === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      }

      return { ok: true };
    })
});
