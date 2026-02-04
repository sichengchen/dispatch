import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { db, sources, articles } from "@dispatch/db";
import { eq } from "drizzle-orm";
import {
  recordScrapeSuccess,
  recordScrapeFailure,
  checkStaleSource,
} from "../src/services/source-health";

const TEST_URL = `https://health-test-${Date.now()}.example.com/rss`;

let testSourceId: number;

beforeAll(() => {
  const result = db
    .insert(sources)
    .values({ url: TEST_URL, name: "Health Test Source", type: "rss" })
    .run();
  testSourceId = Number(result.lastInsertRowid);
});

afterAll(() => {
  db.delete(sources).where(eq(sources.id, testSourceId)).run();
});

function getSource() {
  return db.select().from(sources).where(eq(sources.id, testSourceId)).get()!;
}

describe("Source Health Monitoring", () => {
  it("starts with healthy status and 0 failures", () => {
    const source = getSource();
    expect(source.healthStatus).toBe("healthy");
    expect(source.consecutiveFailures).toBe(0);
  });

  it("recordScrapeFailure increments consecutiveFailures", () => {
    recordScrapeFailure(testSourceId);
    const source = getSource();
    expect(source.consecutiveFailures).toBe(1);
    expect(source.healthStatus).toBe("healthy");
    expect(source.lastErrorAt).not.toBeNull();
  });

  it("becomes degraded after 3 consecutive failures", () => {
    // Already at 1 failure from previous test
    recordScrapeFailure(testSourceId);
    recordScrapeFailure(testSourceId);
    const source = getSource();
    expect(source.consecutiveFailures).toBe(3);
    expect(source.healthStatus).toBe("degraded");
    expect(source.isActive).toBe(true);
  });

  it("recordScrapeSuccess resets to healthy", () => {
    recordScrapeSuccess(testSourceId);
    const source = getSource();
    expect(source.consecutiveFailures).toBe(0);
    expect(source.healthStatus).toBe("healthy");
    expect(source.lastErrorAt).toBeNull();
  });

  it("becomes dead and inactive after 7 consecutive failures", () => {
    for (let i = 0; i < 7; i++) {
      recordScrapeFailure(testSourceId);
    }
    const source = getSource();
    expect(source.consecutiveFailures).toBe(7);
    expect(source.healthStatus).toBe("dead");
    expect(source.isActive).toBe(false);
  });

  it("success after dead resets everything", () => {
    recordScrapeSuccess(testSourceId);
    const source = getSource();
    expect(source.consecutiveFailures).toBe(0);
    expect(source.healthStatus).toBe("healthy");
    expect(source.lastErrorAt).toBeNull();
  });
});

describe("Stale Source Detection", () => {
  it("returns true when source has no articles", () => {
    expect(checkStaleSource(testSourceId)).toBe(true);
  });

  it("returns true when newest article is older than 30 days", () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    db.insert(articles)
      .values({
        sourceId: testSourceId,
        title: "Old article",
        url: `https://health-test-old-${Date.now()}.example.com`,
        publishedAt: oldDate,
      })
      .run();
    expect(checkStaleSource(testSourceId)).toBe(true);
  });

  it("returns false when newest article is recent", () => {
    db.insert(articles)
      .values({
        sourceId: testSourceId,
        title: "Recent article",
        url: `https://health-test-recent-${Date.now()}.example.com`,
        publishedAt: new Date(),
      })
      .run();
    expect(checkStaleSource(testSourceId)).toBe(false);
  });
});
