import Parser from "rss-parser";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chromium } from "playwright";
import PQueue from "p-queue";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { processArticle } from "./llm";
import { recordScrapeSuccess, recordScrapeFailure } from "./source-health";
import { finishTaskRun, startTaskRun } from "./task-log";

const parser = new Parser();

const scrapeQueue: InstanceType<typeof PQueue> = new PQueue({ concurrency: 3 });

export { scrapeQueue };

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ScrapeResult = {
  inserted: number;
  skipped: number;
  tier?: "rss" | "html" | "spa";
};

export type ArticleContent = {
  title: string;
  content: string;
  excerpt?: string;
  publishedDate?: Date | null;
  url?: string;
};

// ---------------------------------------------------------------------------
// L2: Static HTML scraping via fetch + Readability
// ---------------------------------------------------------------------------

export async function scrapeHTML(url: string): Promise<ArticleContent | null> {
  const res = await fetch(url);
  if (!res.ok) return null;

  const html = await res.text();
  return extractReadable(html, url);
}

function extractReadable(html: string, url: string): ArticleContent | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const result = reader.parse();
  if (!result || !result.textContent?.trim()) return null;

  return {
    title: result.title ?? "(untitled)",
    content: result.textContent!,
    excerpt: result.excerpt || undefined,
    publishedDate: parseDate(result.publishedTime ?? null)
  };
}

// ---------------------------------------------------------------------------
// L3: Dynamic SPA scraping via Playwright + Readability
// ---------------------------------------------------------------------------

export async function scrapeSPA(url: string): Promise<ArticleContent | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const html = await page.content();
    return extractReadable(html, url);
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// RSS scraping (L1) — unchanged logic, extracted article insertion
// ---------------------------------------------------------------------------

export async function scrapeRSS(sourceId: number): Promise<ScrapeResult> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  try {
    const testXml = process.env.DISPATCH_TEST_RSS_XML;
    const feed = testXml
      ? await parser.parseString(testXml)
      : await parser.parseURL(source.url);

    let inserted = 0;
    let skipped = 0;

    for (const item of feed.items ?? []) {
      const url = item.link ?? item.id ?? "";
      if (!url) {
        skipped += 1;
        continue;
      }

      const content =
        (item as { [key: string]: any })["content:encoded"] ??
        item.content ??
        item.contentSnippet ??
        item.summary ??
        item.title ??
        "";

      const publishedAt =
        parseDate(item.isoDate) ?? parseDate(item.pubDate) ?? null;

      const result = db
        .insert(articles)
        .values({
          sourceId: source.id as number,
          title: item.title ?? "(untitled)",
          url,
          rawHtml: item.content ?? null,
          cleanContent: content || null,
          publishedAt,
          fetchedAt: new Date(),
          isRead: false
        })
        .onConflictDoNothing()
        .run();

      if (result.changes === 0) {
        skipped += 1;
        continue;
      }

      inserted += 1;
      await processIfEnabled(url);
    }

    db.update(sources)
      .set({ lastFetchedAt: new Date(), lastErrorAt: null })
      .where(eq(sources.id, source.id as number))
      .run();

    return { inserted, skipped, tier: "rss" };
  } catch (error) {
    db.update(sources)
      .set({ lastErrorAt: new Date() })
      .where(eq(sources.id, source.id as number))
      .run();
    console.error("RSS scrape failed", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Insert articles from HTML/SPA scraping into DB
// ---------------------------------------------------------------------------

function insertArticleFromContent(
  sourceId: number,
  pageUrl: string,
  content: ArticleContent
): { inserted: boolean } {
  const result = db
    .insert(articles)
    .values({
      sourceId,
      title: content.title || "(untitled)",
      url: pageUrl,
      rawHtml: null,
      cleanContent: content.content || null,
      publishedAt: content.publishedDate ?? null,
      fetchedAt: new Date(),
      isRead: false
    })
    .onConflictDoNothing()
    .run();

  return { inserted: result.changes > 0 };
}

async function processIfEnabled(articleUrl: string): Promise<void> {
  if (process.env.DISPATCH_DISABLE_LLM === "1") return;
  try {
    const row = db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.url, articleUrl))
      .get();
    if (row) {
      await processArticle(row.id);
    }
  } catch (err) {
    console.error("LLM pipeline failed", err);
  }
}

// ---------------------------------------------------------------------------
// Fallback chain: L1 (RSS) → L2 (HTML) → L3 (SPA)
// ---------------------------------------------------------------------------

type ScrapeTier = "rss" | "html" | "spa";

function getTierOrder(source: { type: string; scrapingStrategy: string | null }): ScrapeTier[] {
  // If a strategy is cached from a previous successful scrape, try it first
  if (source.scrapingStrategy) {
    const cached = source.scrapingStrategy as ScrapeTier;
    if (source.type === "web") {
      // Web sources skip RSS
      const remaining = (["html", "spa"] as ScrapeTier[]).filter(t => t !== cached);
      return [cached, ...remaining];
    }
    const remaining = (["rss", "html", "spa"] as ScrapeTier[]).filter(t => t !== cached);
    return [cached, ...remaining];
  }

  // Default order based on source type
  if (source.type === "web") return ["html", "spa"];
  return ["rss", "html", "spa"];
}

export async function scrapeSource(sourceId: number): Promise<ScrapeResult> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const runId = startTaskRun("fetch-source", `Fetch: ${source.name}`, {
    sourceId: source.id,
    sourceName: source.name,
    sourceUrl: source.url
  });

  const tiers = getTierOrder(source);
  const errors: Array<{ tier: ScrapeTier; error: unknown }> = [];

  for (const tier of tiers) {
    try {
      console.log(`[scraper] source=${sourceId} trying tier=${tier}`);
      const result = await runTier(tier, source);
      console.log(`[scraper] source=${sourceId} tier=${tier} inserted=${result.inserted} skipped=${result.skipped}`);

      // Cache the successful strategy
      db.update(sources)
        .set({
          scrapingStrategy: tier,
          lastFetchedAt: new Date(),
        })
        .where(eq(sources.id, sourceId))
        .run();
      recordScrapeSuccess(sourceId);

      finishTaskRun(runId, "success", {
        inserted: result.inserted,
        skipped: result.skipped,
        tier
      });

      return { ...result, tier };
    } catch (err) {
      console.warn(`[scraper] source=${sourceId} tier=${tier} failed`, err);
      errors.push({ tier, error: err });
    }
  }

  // All tiers failed
  recordScrapeFailure(sourceId);

  const tierNames = errors.map(e => e.tier).join(", ");
  finishTaskRun(runId, "error", {
    error: `All scraping tiers failed (tried: ${tierNames})`
  });
  throw new Error(`All scraping tiers failed for source ${sourceId} (tried: ${tierNames})`);
}

async function runTier(
  tier: ScrapeTier,
  source: { id: number | null; url: string }
): Promise<ScrapeResult> {
  const sourceId = source.id as number;

  switch (tier) {
    case "rss": {
      // Delegate to existing scrapeRSS which handles its own DB writes
      return scrapeRSS(sourceId);
    }
    case "html": {
      const content = await scrapeHTML(source.url);
      if (!content) throw new Error("L2 returned no content");
      const { inserted } = insertArticleFromContent(sourceId, source.url, content);
      if (inserted) {
        await processIfEnabled(source.url);
      }
      return { inserted: inserted ? 1 : 0, skipped: inserted ? 0 : 1 };
    }
    case "spa": {
      const content = await scrapeSPA(source.url);
      if (!content) throw new Error("L3 returned no content");
      const { inserted } = insertArticleFromContent(sourceId, source.url, content);
      if (inserted) {
        await processIfEnabled(source.url);
      }
      return { inserted: inserted ? 1 : 0, skipped: inserted ? 0 : 1 };
    }
  }
}

// ---------------------------------------------------------------------------
// Queue wrapper for concurrency control
// ---------------------------------------------------------------------------

export function enqueueScrape(sourceId: number): Promise<ScrapeResult> {
  return scrapeQueue.add(() => scrapeSource(sourceId)) as Promise<ScrapeResult>;
}
