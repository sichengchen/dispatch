import { db, sources, articles } from "@dispatch/db";
import { eq, max } from "drizzle-orm";

const DEGRADED_THRESHOLD = 3;
const DEAD_THRESHOLD = 7;
const STALE_DAYS = 30;

export function recordScrapeSuccess(sourceId: number): void {
  db.update(sources)
    .set({
      consecutiveFailures: 0,
      healthStatus: "healthy",
      lastErrorAt: null,
    })
    .where(eq(sources.id, sourceId))
    .run();
}

export function recordScrapeFailure(sourceId: number): void {
  const source = db
    .select({ consecutiveFailures: sources.consecutiveFailures })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .get();

  if (!source) return;

  const failures = source.consecutiveFailures + 1;
  let healthStatus: "healthy" | "degraded" | "dead" = "healthy";
  let isActive = true;

  if (failures >= DEAD_THRESHOLD) {
    healthStatus = "dead";
    isActive = false;
  } else if (failures >= DEGRADED_THRESHOLD) {
    healthStatus = "degraded";
  }

  db.update(sources)
    .set({
      consecutiveFailures: failures,
      healthStatus,
      isActive,
      lastErrorAt: new Date(),
    })
    .where(eq(sources.id, sourceId))
    .run();
}

export function checkStaleSource(sourceId: number): boolean {
  const result = db
    .select({ latest: max(articles.publishedAt) })
    .from(articles)
    .where(eq(articles.sourceId, sourceId))
    .get();

  if (!result?.latest) return true;

  const latestDate = new Date(result.latest);
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  return latestDate < cutoff;
}
