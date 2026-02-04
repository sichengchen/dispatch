import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, sources, articles } from "@dispatch/db";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pageHtml = fs.readFileSync(
  path.join(__dirname, "fixtures", "sample-page.html"),
  "utf-8"
);
const feedXml = fs.readFileSync(
  path.join(__dirname, "fixtures", "sample.rss.xml"),
  "utf-8"
);

// Mock playwright at module level for ESM compatibility
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockGoto = vi.fn().mockResolvedValue(undefined);
const mockContent = vi.fn().mockResolvedValue(pageHtml);

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        goto: mockGoto,
        content: mockContent
      }),
      close: mockClose
    })
  }
}));

let testSourceId: number | null = null;

beforeAll(() => {
  process.env.DISPATCH_DISABLE_LLM = "1";
  process.env.DISPATCH_DISABLE_SCHEDULER = "true";
});

afterAll(() => {
  delete process.env.DISPATCH_DISABLE_LLM;
  delete process.env.DISPATCH_DISABLE_SCHEDULER;
});

describe("L2: scrapeHTML — Readability extraction", () => {
  it("T2.1.1: extracts clean content from a static HTML page", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(pageHtml, {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    );

    const { scrapeHTML } = await import("../src/services/scraper");
    const result = await scrapeHTML("https://example.com/article");

    expect(result).not.toBeNull();
    expect(result!.title).toBeTruthy();
    // Verify main article content is present
    expect(result!.content).toContain("Readability");
    expect(result!.content).toContain("fallback strategy");
    expect(result!.content).toContain("content aggregation");
    // Should NOT contain nav/sidebar/ad content
    expect(result!.content).not.toContain("Buy our product");
    expect(result!.content).not.toContain("Subscribe to our newsletter");

    fetchSpy.mockRestore();
  });

  it("T2.1.1b: returns null for non-200 responses", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );

    const { scrapeHTML } = await import("../src/services/scraper");
    const result = await scrapeHTML("https://example.com/missing");

    expect(result).toBeNull();
    fetchSpy.mockRestore();
  });
});

describe("L3: scrapeSPA — Playwright browser lifecycle", () => {
  beforeEach(() => {
    mockClose.mockClear();
    mockGoto.mockClear();
    mockContent.mockClear();
  });

  it("T2.1.6: closes browser after successful scrape", async () => {
    mockContent.mockResolvedValueOnce(pageHtml);

    const { scrapeSPA } = await import("../src/services/scraper");
    const result = await scrapeSPA("https://example.com/spa-page");

    expect(result).not.toBeNull();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("T2.1.6b: closes browser even when navigation fails", async () => {
    mockGoto.mockRejectedValueOnce(new Error("Navigation timeout"));

    const { scrapeSPA } = await import("../src/services/scraper");
    await expect(scrapeSPA("https://example.com/timeout")).rejects.toThrow("Navigation timeout");

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});

describe("Fallback chain: scrapeSource", () => {
  beforeEach(() => {
    const result = db
      .insert(sources)
      .values({
        url: `https://example.com/fallback-${Date.now()}-${Math.random()}`,
        name: "Fallback Test",
        type: "rss",
        isActive: true
      })
      .run();
    testSourceId = Number(result.lastInsertRowid);
  });

  afterEach(() => {
    if (testSourceId) {
      db.delete(articles).where(eq(articles.sourceId, testSourceId)).run();
      db.delete(sources).where(eq(sources.id, testSourceId)).run();
      testSourceId = null;
    }
    delete process.env.DISPATCH_TEST_RSS_XML;
  });

  it("T2.1.4: falls back from broken RSS (L1) to HTML (L2)", async () => {
    // Set RSS to invalid so L1 fails
    process.env.DISPATCH_TEST_RSS_XML = "not-valid-xml!!";

    // Mock fetch so L2 succeeds with fixture HTML
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(pageHtml, {
        status: 200,
        headers: { "content-type": "text/html" }
      })
    );

    const { scrapeSource } = await import("../src/services/scraper");
    const result = await scrapeSource(testSourceId as number);

    expect(result.tier).toBe("html");
    expect(result.inserted).toBe(1);

    // Verify strategy was cached
    const source = db
      .select()
      .from(sources)
      .where(eq(sources.id, testSourceId as number))
      .get();
    expect(source?.scrapingStrategy).toBe("html");

    fetchSpy.mockRestore();
  });

  it("T2.1.4b: RSS sources use L1 when it succeeds", async () => {
    process.env.DISPATCH_TEST_RSS_XML = feedXml;

    const { scrapeSource } = await import("../src/services/scraper");
    const result = await scrapeSource(testSourceId as number);

    expect(result.tier).toBe("rss");
    expect(result.inserted).toBeGreaterThan(0);

    const source = db
      .select()
      .from(sources)
      .where(eq(sources.id, testSourceId as number))
      .get();
    expect(source?.scrapingStrategy).toBe("rss");
  });
});

describe("Concurrency queue", () => {
  it("T2.1.3: respects concurrency limit", async () => {
    const { scrapeQueue } = await import("../src/services/scraper");

    expect(scrapeQueue.concurrency).toBe(3);

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      scrapeQueue.add(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 20));
        currentConcurrent--;
        return i;
      })
    );

    await Promise.all(tasks);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
