import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { articles, sources } from "@dispatch/db";
import { t } from "../trpc";
import { getRelatedArticles } from "../services/vector";
import { processArticle } from "../services/llm";
import { computeFinalGrade } from "../services/grading";
import { getGradingConfig } from "../services/settings";

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((tag) => typeof tag === "string") as string[];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function resolveComputedGrade(
  row: {
  grade: number | null;
  importancy: number | null;
  quality: number | null;
  tags: string | null;
  sourceId: number;
  sourceName: string | null;
  sourceUrl: string | null;
  },
  gradingConfig: ReturnType<typeof getGradingConfig>
): number | null {
  if (row.importancy == null || row.quality == null) {
    return row.grade;
  }
  const { score } = computeFinalGrade(
    { importancy: row.importancy, quality: row.quality },
    {
      sourceId: row.sourceId,
      sourceName: row.sourceName ?? undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      tags: parseTags(row.tags)
    },
    gradingConfig
  );
  return score;
}

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
          summaryLong: articles.summaryLong,
          tags: articles.tags,
          grade: articles.grade,
          importancy: articles.importancy,
          quality: articles.quality,
          keyPoints: articles.keyPoints,
          processedAt: articles.processedAt,
          publishedAt: articles.publishedAt,
          fetchedAt: articles.fetchedAt,
          sourceName: sources.name,
          sourceUrl: sources.url
        })
        .from(articles)
        .leftJoin(sources, eq(articles.sourceId, sources.id))
        .where(eq(articles.id, input.id))
        .get();

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      }

      const gradingConfig = getGradingConfig();
      const computed = resolveComputedGrade(row, gradingConfig);
      const { importancy, quality, sourceUrl, ...rest } = row;
      return { ...rest, grade: computed };
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

      const gradingConfig = getGradingConfig();
      return ctx.db
        .select({
          id: articles.id,
          sourceId: articles.sourceId,
          title: articles.title,
          url: articles.url,
          rawHtml: articles.rawHtml,
          cleanContent: articles.cleanContent,
          summary: articles.summary,
          summaryLong: articles.summaryLong,
          tags: articles.tags,
          grade: articles.grade,
          importancy: articles.importancy,
          quality: articles.quality,
          keyPoints: articles.keyPoints,
          processedAt: articles.processedAt,
          publishedAt: articles.publishedAt,
          fetchedAt: articles.fetchedAt,
          sourceName: sources.name,
          sourceUrl: sources.url
        })
        .from(articles)
        .leftJoin(sources, eq(articles.sourceId, sources.id))
        .where(whereClause)
        .orderBy(desc(articles.publishedAt), desc(articles.fetchedAt))
        .limit(pageSize)
        .offset(offset)
        .all()
        .map((row) => {
          const computed = resolveComputedGrade(row, gradingConfig);
          const { importancy, quality, sourceUrl, ...rest } = row;
          return { ...rest, grade: computed };
        });
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
          summaryLong: articles.summaryLong,
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
  byIds: t.procedure
    .input(
      z.object({
        ids: z.array(z.number().int().positive()).min(1)
      })
    )
    .query(({ ctx, input }) => {
      const uniqueIds = Array.from(new Set(input.ids));
      const gradingConfig = getGradingConfig();
      const rows = ctx.db
        .select({
          id: articles.id,
          sourceId: articles.sourceId,
          title: articles.title,
          url: articles.url,
          summary: articles.summary,
          summaryLong: articles.summaryLong,
          tags: articles.tags,
          grade: articles.grade,
          importancy: articles.importancy,
          quality: articles.quality,
          publishedAt: articles.publishedAt,
          fetchedAt: articles.fetchedAt,
          sourceName: sources.name,
          sourceUrl: sources.url
        })
        .from(articles)
        .leftJoin(sources, eq(articles.sourceId, sources.id))
        .where(inArray(articles.id, uniqueIds))
        .all();

      const order = new Map(uniqueIds.map((id, index) => [id, index]));
      return rows
        .map((row) => {
          const computed = resolveComputedGrade(row, gradingConfig);
          const { importancy, quality, sourceUrl, ...rest } = row;
          return { ...rest, grade: computed };
        })
        .sort((a, b) => {
          const left = order.get(a.id) ?? 0;
          const right = order.get(b.id) ?? 0;
          return left - right;
        });
    }),
  reprocess: t.procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await processArticle(input.id);
      return { ok: true };
    }),
  uniqueTags: t.procedure.query(({ ctx }) => {
    const rows = ctx.db
      .select({ tags: articles.tags })
      .from(articles)
      .all();

    const tagSet = new Set<string>();
    for (const row of rows) {
      for (const tag of parseTags(row.tags)) {
        tagSet.add(tag);
      }
    }

    return Array.from(tagSet).sort();
  })
});
