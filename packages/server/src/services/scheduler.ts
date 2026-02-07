import schedule from "node-schedule";
import { db, sources, articles } from "@dispatch/db";
import { eq, isNull } from "drizzle-orm";
import { enqueueScrape } from "./scraper";
import { getSchedulesConfig, getDigestConfig, getPipelineConfig } from "./settings";
import { generateDigest } from "./digest";
import { processArticle } from "./llm";
import { notificationService } from "./notifications.js";

let lastStartedAt: number | null = null;

export function startScheduler() {
  if (process.env.DISPATCH_DISABLE_SCHEDULER === "true") {
    return null;
  }
  lastStartedAt = Date.now();

  const schedules = getSchedulesConfig();
  const digestConfig = getDigestConfig();
  const pipelineConfig = getPipelineConfig();

  const fetchEntry = schedules.fetch ?? { enabled: true, cronExpression: "0 * * * *" };
  const pipelineEntry = schedules.pipeline ?? { enabled: true, cronExpression: "*/15 * * * *" };
  const digestEntry = schedules.digest ?? { enabled: true, cronExpression: "0 6 * * *" };

  // Scrape job
  let scrapeJob: schedule.Job | null = null;
  if (fetchEntry.enabled !== false) {
    const fetchCron = fetchEntry.cronExpression ?? "0 * * * *";
    console.log(`[scheduler] Starting fetch job with cron: ${fetchCron}`);
    scrapeJob = schedule.scheduleJob(fetchCron, async () => {
      const activeSources = db
        .select()
        .from(sources)
        .where(eq(sources.isActive, true))
        .all();

      const results = await Promise.allSettled(
        activeSources.map((source) => enqueueScrape(source.id as number))
      );

      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const source = activeSources[index];
          console.error("Scheduled scrape failed", {
            sourceId: source?.id,
            error: result.reason
          });
        }
      });
    });
  }

  // Pipeline job
  let pipelineJob: schedule.Job | null = null;
  if (pipelineEntry.enabled !== false) {
    const pipelineCron = pipelineEntry.cronExpression ?? "*/15 * * * *";
    console.log(`[scheduler] Starting pipeline job with cron: ${pipelineCron}`);

    pipelineJob = schedule.scheduleJob(pipelineCron, async () => {
      const batchSize = pipelineConfig.batchSize ?? 10;
      const pending = db
        .select({ id: articles.id })
        .from(articles)
        .where(isNull(articles.processedAt))
        .limit(batchSize)
        .all()
        .map((row) => row.id as number);

      if (pending.length === 0) return;

      console.log(`[scheduler] Processing ${pending.length} pending articles...`);
      let failed = 0;
      for (const id of pending) {
        try {
          await processArticle(id);
        } catch (err) {
          failed += 1;
          console.error(`[scheduler] Pipeline failed for article ${id}:`, err);
        }
      }
      console.log(`[scheduler] Pipeline completed: ${pending.length - failed} processed, ${failed} failed`);
    });
  }

  // Digest job
  let digestJob: schedule.Job | null = null;
  if (digestEntry.enabled !== false) {
    const digestCron = digestEntry.cronExpression ?? "0 6 * * *";
    console.log(`[scheduler] Starting digest job with cron: ${digestCron}`);

    digestJob = schedule.scheduleJob(digestCron, async () => {
      try {
        console.log("[scheduler] Generating digest...");
        const digest = await generateDigest({
          topN: digestConfig.topN,
        });
        console.log("[scheduler] Digest generated successfully");

        try {
          await notificationService.sendDigestNotification(digest);
        } catch (notificationError) {
          console.error("[scheduler] Failed to send digest notification:", notificationError);
        }
      } catch (err) {
        console.error("[scheduler] Digest generation failed:", err);
      }
    });
  }

  return { scrapeJob, pipelineJob, digestJob };
}

function getNextRunFromCron(cron: string): Date | null {
  try {
    const job = schedule.scheduleJob(cron, () => {});
    if (job) {
      const next = job.nextInvocation();
      job.cancel();
      return next ? new Date(next.getTime()) : null;
    }
  } catch {
    // Invalid cron expression
  }
  return null;
}

export function getSchedulerSnapshot() {
  const disabled = process.env.DISPATCH_DISABLE_SCHEDULER === "true";
  const schedules = getSchedulesConfig();
  const pipelineConfig = getPipelineConfig();

  const fetchEntry = schedules.fetch ?? { enabled: true, cronExpression: "0 * * * *" };
  const pipelineEntry = schedules.pipeline ?? { enabled: true, cronExpression: "*/15 * * * *" };
  const digestEntry = schedules.digest ?? { enabled: true, cronExpression: "0 6 * * *" };

  const fetchCron = fetchEntry.cronExpression ?? "0 * * * *";
  const pipelineCron = pipelineEntry.cronExpression ?? "*/15 * * * *";
  const digestCron = digestEntry.cronExpression ?? "0 6 * * *";

  const fetchNextRun = disabled || fetchEntry.enabled === false
    ? null
    : getNextRunFromCron(fetchCron);
  const pipelineNextRun = disabled || pipelineEntry.enabled === false
    ? null
    : getNextRunFromCron(pipelineCron);
  const digestNextRun = disabled || digestEntry.enabled === false
    ? null
    : getNextRunFromCron(digestCron);

  return {
    enabled: !disabled,
    startedAt: lastStartedAt,
    scrape: {
      enabled: fetchEntry.enabled !== false,
      cron: fetchCron,
      nextRunAt: fetchNextRun?.getTime() ?? null
    },
    pipeline: {
      enabled: pipelineEntry.enabled !== false,
      cron: pipelineCron,
      batchSize: pipelineConfig.batchSize ?? 10,
      nextRunAt: pipelineNextRun?.getTime() ?? null
    },
    digest: {
      enabled: digestEntry.enabled !== false,
      cron: digestCron,
      nextRunAt: digestNextRun?.getTime() ?? null
    }
  };
}
