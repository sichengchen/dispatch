import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { articles, digests, sources } from "@dispatch/db";
import { t } from "../trpc.js";
import { listTaskRuns, startTaskRun, finishTaskRun, stopTaskRun } from "../services/task-log.js";
import { scrapeQueue, enqueueScrape } from "../services/scraper.js";
import { getSchedulerSnapshot } from "../services/scheduler.js";
import { processArticle } from "../services/llm.js";
import { getSchedulesConfig, getPipelineConfig } from "../services/settings.js";

function parseArticleIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((id) => typeof id === "number");
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

export const tasksRouter = t.router({
  dashboard: t.procedure.query(({ ctx }) => {
    const sourceRows = ctx.db.select().from(sources).all();
    const totalSources = sourceRows.length;
    const degradedSources = sourceRows.filter(
      (source) => source.healthStatus === "degraded"
    ).length;
    const deadSources = sourceRows.filter(
      (source) => source.healthStatus === "dead"
    ).length;
    const healthySources = totalSources - degradedSources - deadSources;
    const lastFetchedAt = sourceRows
      .map((source) => source.lastFetchedAt)
      .map((value) => (value instanceof Date ? value.getTime() : value))
      .filter((value): value is number => typeof value === "number")
      .sort((a, b) => b - a)[0] ?? null;

    const pendingArticles = ctx.db
      .select({ id: articles.id })
      .from(articles)
      .where(isNull(articles.processedAt))
      .all();

    const lastProcessed = ctx.db
      .select({ processedAt: articles.processedAt })
      .from(articles)
      .where(isNotNull(articles.processedAt))
      .orderBy(desc(articles.processedAt))
      .limit(1)
      .get();

    const latestDigest = ctx.db
      .select({
        id: digests.id,
        generatedAt: digests.generatedAt,
        articleIds: digests.articleIds
      })
      .from(digests)
      .orderBy(desc(digests.generatedAt))
      .limit(1)
      .get();

    const schedules = getSchedulesConfig();
    const pipelineConfig = getPipelineConfig();
    const scheduler = getSchedulerSnapshot();
    const digestArticleIds = latestDigest
      ? parseArticleIds(latestDigest.articleIds)
      : [];

    // Count sources by scraping strategy
    const rssSources = sourceRows.filter((s) => s.scrapingStrategy === "rss").length;
    const skillSources = sourceRows.filter((s) => s.scrapingStrategy === "skill").length;

    const fetchEntry = schedules.fetch ?? { enabled: true, cronExpression: "0 * * * *" };
    const pipelineEntry = schedules.pipeline ?? { enabled: true, cronExpression: "*/15 * * * *" };
    const digestEntry = schedules.digest ?? { enabled: true, cronExpression: "0 6 * * *" };

    // Reverse-match cron expressions to human-readable labels
    const cronLabels: Record<string, string> = {
      "0 * * * *": "Every hour",
      "0 */2 * * *": "Every 2 hours",
      "0 */6 * * *": "Every 6 hours",
      "0 */12 * * *": "Every 12 hours",
      "*/5 * * * *": "Every 5 minutes",
      "*/15 * * * *": "Every 15 minutes",
      "*/30 * * * *": "Every 30 minutes",
    };

    function describeCron(cron: string): string {
      if (cronLabels[cron]) return cronLabels[cron];
      // Detect daily pattern: "M H * * *"
      const dailyMatch = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
      if (dailyMatch) {
        const h = dailyMatch[2].padStart(2, "0");
        const m = dailyMatch[1].padStart(2, "0");
        return `Daily at ${h}:${m}`;
      }
      return cron;
    }

    const fetchCron = fetchEntry.cronExpression ?? "0 * * * *";
    const pipelineCron = pipelineEntry.cronExpression ?? "*/15 * * * *";
    const digestCron = digestEntry.cronExpression ?? "0 6 * * *";

    const fetchFrequency = describeCron(fetchCron);
    const pipelineFrequency = describeCron(pipelineCron);
    const digestFrequency = describeCron(digestCron);

    return {
      overview: {
        sources: {
          total: totalSources,
          healthy: healthySources,
          degraded: degradedSources,
          dead: deadSources,
          lastFetchedAt
        },
        fetchQueue: {
          pending: scrapeQueue.size,
          running: scrapeQueue.pending
        },
        pipeline: {
          pending: pendingArticles.length,
          lastProcessedAt: lastProcessed?.processedAt ?? null
        },
        digest: {
          enabled: digestEntry.enabled !== false,
          frequency: digestFrequency,
          nextRunAt: scheduler?.digest?.nextRunAt ?? null,
          lastGeneratedAt: latestDigest?.generatedAt ?? null,
          articleCount: digestArticleIds.length
        }
      },
      ingestionRuns: listTaskRuns({ kind: "fetch-source", limit: 5 }),
      pipelineRuns: listTaskRuns({ kind: "pipeline-article", limit: 5 }),
      skillRuns: listTaskRuns({ kind: "skill", limit: 5 }),
      recentRuns: listTaskRuns({ limit: 8 }),
      scheduledTasks: [
        {
          name: `RSS Fetch (${rssSources} sources)`,
          frequency: fetchFrequency,
          nextRunAt: scheduler?.scrape?.nextRunAt ?? null,
          lastRunAt: lastFetchedAt,
          status: scheduler?.scrape?.enabled ? "scheduled" : "disabled"
        },
        {
          name: `Agentic Fetch (${skillSources} sources)`,
          frequency: fetchFrequency,
          nextRunAt: scheduler?.scrape?.nextRunAt ?? null,
          lastRunAt: lastFetchedAt,
          status: scheduler?.scrape?.enabled ? "scheduled" : "disabled"
        },
        {
          name: `AI Pipeline (batch ${pipelineConfig.batchSize ?? 10})`,
          frequency: pipelineFrequency,
          nextRunAt: scheduler?.pipeline?.nextRunAt ?? null,
          lastRunAt: lastProcessed?.processedAt ?? null,
          status:
            pipelineEntry.enabled === false || scheduler?.enabled === false
              ? "disabled"
              : "scheduled"
        },
        {
          name: "Digest Generation",
          frequency: digestFrequency,
          nextRunAt: scheduler?.digest?.nextRunAt ?? null,
          lastRunAt: latestDigest?.generatedAt ?? null,
          status:
            digestEntry.enabled === false || scheduler?.enabled === false
              ? "disabled"
              : "scheduled"
        }
      ]
    };
  }),
  runFetch: t.procedure
    .input(
      z
        .object({
          sourceIds: z.array(z.number().int().positive()).optional()
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const selectedIds = input?.sourceIds;
      const rows = ctx.db
        .select({ id: sources.id })
        .from(sources)
        .where(
          selectedIds?.length
            ? and(eq(sources.isActive, true), inArray(sources.id, selectedIds))
            : eq(sources.isActive, true)
        )
        .all();

      const targetIds = rows.map((source) => source.id as number);
      if (targetIds.length === 0) {
        return { ok: true, queued: 0, inserted: 0, skipped: 0, failed: 0 };
      }

      const runId = startTaskRun("fetch-batch", "Fetch: All Sources", {
        count: targetIds.length
      });

      const results = await Promise.allSettled(
        targetIds.map((id) => enqueueScrape(id))
      );

      let inserted = 0;
      let skipped = 0;
      let failed = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          inserted += result.value.inserted;
          skipped += result.value.skipped;
        } else {
          failed += 1;
        }
      });

      finishTaskRun(runId, failed > 0 ? "warning" : "success", {
        inserted,
        skipped,
        failed
      });

      return { ok: true, queued: targetIds.length, inserted, skipped, failed };
    }),
  runPipeline: t.procedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(100).optional()
        })
        .optional()
    )
    .mutation(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const pending = ctx.db
        .select({ id: articles.id })
        .from(articles)
        .where(isNull(articles.processedAt))
        .limit(limit)
        .all()
        .map((row) => row.id as number);

      if (pending.length === 0) {
        return { ok: true, processed: 0, failed: 0 };
      }

      const runId = startTaskRun("pipeline-batch", "Pipeline: Pending Articles", {
        count: pending.length
      });

      let failed = 0;
      for (const id of pending) {
        try {
          await processArticle(id);
        } catch {
          failed += 1;
        }
      }

      finishTaskRun(runId, failed > 0 ? "warning" : "success", {
        processed: pending.length - failed,
        failed
      });

      return { ok: true, processed: pending.length - failed, failed };
    }),
  stopTask: t.procedure
    .input(z.object({ runId: z.number().int().positive() }))
    .mutation(({ input }) => {
      const stopped = stopTaskRun(input.runId);
      return { ok: stopped };
    })
});
