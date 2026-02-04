import { beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, sources, articles } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { scrapeRSS } from "../src/services/scraper";
import { app } from "../src/app";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const feedXml = fs.readFileSync(
  path.join(__dirname, "fixtures", "sample.rss.xml"),
  "utf-8"
);

let testSourceId: number | null = null;

beforeAll(() => {
  process.env.DISPATCH_TEST_RSS_XML = feedXml;
  process.env.DISPATCH_DISABLE_LLM = "1";
  const result = db
    .insert(sources)
    .values({
      url: `https://example.com/rss/test-${Date.now()}`,
      name: "Test Feed",
      type: "rss",
      isActive: true
    })
    .run();
  testSourceId = Number(result.lastInsertRowid);
});

afterAll(() => {
  if (testSourceId) {
    db.delete(articles).where(eq(articles.sourceId, testSourceId)).run();
    db.delete(sources).where(eq(sources.id, testSourceId)).run();
  }
  delete process.env.DISPATCH_TEST_RSS_XML;
  delete process.env.DISPATCH_DISABLE_LLM;
});

describe("RSS Scraper", () => {
  it("Scrape.KnownFeed: inserts articles", async () => {
    const result = await scrapeRSS(testSourceId as number);
    expect(result.inserted).toBeGreaterThan(0);
  });

  it("Scrape.Dedup: no duplicates on second run", async () => {
    const first = await scrapeRSS(testSourceId as number);
    const second = await scrapeRSS(testSourceId as number);
    expect(first.inserted).toBeGreaterThanOrEqual(0);
    expect(second.inserted).toBe(0);
  });

  it("Scrape.Refresh: sources.refresh triggers scrape", async () => {
    const res = await app.request("/trpc/sources.refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: testSourceId })
    });
    const json = await res.json();
    expect(res.ok).toBe(true);
    expect(json?.result?.data?.inserted).toBeDefined();
  });

  it("Scrape.InvalidUrl: marks lastErrorAt on failure", async () => {
    process.env.DISPATCH_TEST_RSS_XML = "invalid";
    await expect(scrapeRSS(testSourceId as number)).rejects.toBeTruthy();

    const source = db
      .select()
      .from(sources)
      .where(eq(sources.id, testSourceId as number))
      .get();

    expect(source?.lastErrorAt).toBeTruthy();
    process.env.DISPATCH_TEST_RSS_XML = feedXml;
  });
});
