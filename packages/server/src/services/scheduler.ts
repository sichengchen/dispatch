import schedule from "node-schedule";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { scrapeRSS } from "./scraper";

const DEFAULT_CRON = "0 * * * *"; // hourly

export function startScheduler(cron = DEFAULT_CRON) {
  if (process.env.DISPATCH_DISABLE_SCHEDULER === "true") {
    return null;
  }

  return schedule.scheduleJob(cron, async () => {
    const activeSources = db
      .select()
      .from(sources)
      .where(eq(sources.isActive, true))
      .all();

    for (const source of activeSources) {
      try {
        await scrapeRSS(source.id as number);
      } catch (err) {
        console.error("Scheduled scrape failed", err);
      }
    }
  });
}
