import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { articles, sources } from "@dispatch/db";
import { t } from "../trpc";
import { getRelatedArticles } from "../services/vector";
import { getPipelineEvents } from "../services/pipeline-log";

export const articlesRouter = t.router({
  byId: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => {
      const row = ctx.db
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
        .where(eq(articles.id, input.id))
        .get();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      }

      return row;
    }),
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
  related: t.procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        topK: z.number().int().positive().max(20).default(5)
      })
    )
    .query(async ({ ctx, input }) => {
      let relatedIds: number[] = [];
      try {
        relatedIds = await getRelatedArticles(input.id, input.topK);
      } catch (err) {
        console.warn(`[articles.related] failed for article ${input.id}`, err);
      }
      if (relatedIds.length === 0) return [];

      const rows = ctx.db
        .select({
          id: articles.id,
          sourceId: articles.sourceId,
          title: articles.title,
          url: articles.url,
          summary: articles.summary,
          publishedAt: articles.publishedAt,
          fetchedAt: articles.fetchedAt,
          sourceName: sources.name
        })
        .from(articles)
        .leftJoin(sources, eq(articles.sourceId, sources.id))
        .where(inArray(articles.id, relatedIds))
        .all();

      const order = new Map(relatedIds.map((id, index) => [id, index]));
      return rows.sort((a, b) => {
        const left = order.get(a.id) ?? 0;
        const right = order.get(b.id) ?? 0;
        return left - right;
      });
    }),
  pipelineLog: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ input }) => {
      return getPipelineEvents(input.id);
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
