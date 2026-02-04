import schedule from "node-schedule";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { enqueueScrape } from "./scraper";
import { getDigestConfig } from "./settings";
import { generateDigest } from "./digest";

const DEFAULT_CRON = "0 * * * *"; // hourly

export function startScheduler(cron = DEFAULT_CRON) {
  if (process.env.DISPATCH_DISABLE_SCHEDULER === "true") {
    return null;
  }

  // Hourly scrape job
  const scrapeJob = schedule.scheduleJob(cron, async () => {
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

  // Daily digest job
  const digestConfig = getDigestConfig();
  let digestJob: schedule.Job | null = null;
  if (digestConfig.enabled !== false) {
    const [hour, minute] = (digestConfig.scheduledTime ?? "06:00")
      .split(":")
      .map(Number);
    const digestCron = `${minute} ${hour} * * *`;

    digestJob = schedule.scheduleJob(digestCron, async () => {
      try {
        console.log("[scheduler] Generating daily digest...");
        await generateDigest({
          topN: digestConfig.topN,
          hoursBack: digestConfig.hoursBack,
        });
        console.log("[scheduler] Daily digest generated successfully");
      } catch (err) {
        console.error("[scheduler] Digest generation failed:", err);
      }
    });
  }

  return { scrapeJob, digestJob };
}
