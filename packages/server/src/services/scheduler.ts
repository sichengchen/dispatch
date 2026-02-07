import schedule from "node-schedule";
import { db, sources, articles } from "@dispatch/db";
import { eq, isNull } from "drizzle-orm";
import { enqueueScrape } from "./scraper";
import { getDigestConfig, getFetchScheduleConfig, getPipelineScheduleConfig } from "./settings";
import { generateDigest } from "./digest";
import { processArticle } from "./llm";
import { notificationService } from "./notifications.js";

const FETCH_PRESET_CRONS: Record<string, string> = {
  hourly: "0 * * * *",
  every2h: "0 */2 * * *",
  every6h: "0 */6 * * *",
  every12h: "0 */12 * * *",
  daily: "0 6 * * *"
};

const DIGEST_PRESET_CRONS: Record<string, string> = {
  daily: "", // special: uses scheduledTime
  every12h: "0 */12 * * *",
  every6h: "0 */6 * * *"
};

const PIPELINE_PRESET_CRONS: Record<string, string> = {
  every5m: "*/5 * * * *",
  every15m: "*/15 * * * *",
  every30m: "*/30 * * * *",
  hourly: "0 * * * *"
};

let lastStartedAt: number | null = null;
let activeFetchCron = FETCH_PRESET_CRONS.hourly;
let activeDigestCron = "";
let activePipelineCron = PIPELINE_PRESET_CRONS.every15m;

function resolveFetchCron(): string {
  const config = getFetchScheduleConfig();
  if (config.cronExpression) {
    return config.cronExpression;
  }
  return FETCH_PRESET_CRONS[config.preset ?? "hourly"] ?? FETCH_PRESET_CRONS.hourly;
}

function resolveDigestCron(): string {
  const config = getDigestConfig();
  if (config.cronExpression) {
    return config.cronExpression;
  }
  const preset = config.preset ?? "daily";
  if (preset === "daily") {
    const [hour, minute] = (config.scheduledTime ?? "06:00").split(":").map(Number);
    return `${minute} ${hour} * * *`;
  }
  return DIGEST_PRESET_CRONS[preset] ?? `0 6 * * *`;
}

function resolvePipelineCron(): string {
  const config = getPipelineScheduleConfig();
  if (config.cronExpression) {
    return config.cronExpression;
  }
  return PIPELINE_PRESET_CRONS[config.preset ?? "every15m"] ?? PIPELINE_PRESET_CRONS.every15m;
}

export function startScheduler() {
  if (process.env.DISPATCH_DISABLE_SCHEDULER === "true") {
    return null;
  }
  lastStartedAt = Date.now();

  const fetchConfig = getFetchScheduleConfig();
  const digestConfig = getDigestConfig();
  const pipelineConfig = getPipelineScheduleConfig();

  // Scrape job based on fetch schedule config
  let scrapeJob: schedule.Job | null = null;
  if (fetchConfig.enabled !== false) {
    activeFetchCron = resolveFetchCron();
    console.log(`[scheduler] Starting fetch job with cron: ${activeFetchCron}`);
    scrapeJob = schedule.scheduleJob(activeFetchCron, async () => {
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

  // Pipeline job to process pending articles
  let pipelineJob: schedule.Job | null = null;
  if (pipelineConfig.enabled !== false) {
    activePipelineCron = resolvePipelineCron();
    console.log(`[scheduler] Starting pipeline job with cron: ${activePipelineCron}`);

    pipelineJob = schedule.scheduleJob(activePipelineCron, async () => {
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

  // Digest job based on digest config
  let digestJob: schedule.Job | null = null;
  if (digestConfig.enabled !== false) {
    activeDigestCron = resolveDigestCron();
    console.log(`[scheduler] Starting digest job with cron: ${activeDigestCron}`);

    digestJob = schedule.scheduleJob(activeDigestCron, async () => {
      try {
        console.log("[scheduler] Generating digest...");
        const digest = await generateDigest({
          topN: digestConfig.topN,
          hoursBack: digestConfig.hoursBack,
        });
        console.log("[scheduler] Digest generated successfully");

        // Send digest notification if enabled
        try {
          await notificationService.sendDigestNotification(digest);
        } catch (notificationError) {
          // Log but don't fail the digest job
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
  const fetchConfig = getFetchScheduleConfig();
  const pipelineConfig = getPipelineScheduleConfig();
  const digestConfig = getDigestConfig();

  const fetchCron = resolveFetchCron();
  const pipelineCron = resolvePipelineCron();
  const digestCron = resolveDigestCron();

  const fetchNextRun = disabled || fetchConfig.enabled === false
    ? null
    : getNextRunFromCron(fetchCron);
  const pipelineNextRun = disabled || pipelineConfig.enabled === false
    ? null
    : getNextRunFromCron(pipelineCron);
  const digestNextRun = disabled || digestConfig.enabled === false
    ? null
    : getNextRunFromCron(digestCron);

  return {
    enabled: !disabled,
    startedAt: lastStartedAt,
    scrape: {
      enabled: fetchConfig.enabled !== false,
      cron: fetchCron,
      preset: fetchConfig.preset ?? "hourly",
      nextRunAt: fetchNextRun?.getTime() ?? null
    },
    pipeline: {
      enabled: pipelineConfig.enabled !== false,
      cron: pipelineCron,
      preset: pipelineConfig.preset ?? "every15m",
      batchSize: pipelineConfig.batchSize ?? 10,
      nextRunAt: pipelineNextRun?.getTime() ?? null
    },
    digest: {
      enabled: digestConfig.enabled !== false,
      cron: digestCron,
      preset: digestConfig.preset ?? "daily",
      scheduledTime: digestConfig.scheduledTime ?? "06:00",
      nextRunAt: digestNextRun?.getTime() ?? null
    }
  };
}
