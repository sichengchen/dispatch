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
import { parseSkillFile, getSkillPath, skillExists, type ParsedSkill } from "./skill-generator";

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
  tier?: "rss" | "html" | "spa" | "skill";
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
// Fallback chain: L1 (RSS) → L2 (HTML) → L3 (SPA) → Skill (agent-generated)
// ---------------------------------------------------------------------------

type ScrapeTier = "rss" | "html" | "spa" | "skill";

function getTierOrder(source: {
  type: string;
  scrapingStrategy: string | null;
  hasSkill?: boolean | null;
}): ScrapeTier[] {
  // If source has a skill, use skill tier only (no fallback)
  if (source.hasSkill && skillExists(source.hasSkill ? 1 : 0)) {
    return ["skill"];
  }

  // If a strategy is cached from a previous successful scrape, try it first
  if (source.scrapingStrategy && source.scrapingStrategy !== "skill") {
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
          scrapingStrategy: tier as "rss" | "html" | "spa",
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
    case "skill": {
      return scrapeWithSkill(sourceId);
    }
  }
}

// ---------------------------------------------------------------------------
// Skill-based scraping using agent-generated SKILL.md
// ---------------------------------------------------------------------------

async function scrapeWithSkill(sourceId: number): Promise<ScrapeResult> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  const skillPath = getSkillPath(sourceId);
  if (!skillExists(sourceId)) {
    throw new Error(`No skill found for source ${sourceId}. Generate a skill first.`);
  }

  console.log(`[scraper] Using skill for source ${sourceId}: ${skillPath}`);
  const skill = await parseSkillFile(skillPath);
  const extraction = skill.extraction;

  // Fetch the list page (homepage)
  let listHtml: string;
  if (extraction.tier === "spa") {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(source.url, { waitUntil: "networkidle", timeout: 30000 });
      listHtml = await page.content();
    } finally {
      await browser.close();
    }
  } else {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Dispatch/1.0; +https://dispatch.app)"
      }
    });
    if (!res.ok) throw new Error(`Failed to fetch homepage: HTTP ${res.status}`);
    listHtml = await res.text();
  }

  // Parse the list page and extract article links
  const listDom = new JSDOM(listHtml, { url: source.url });
  const listDoc = listDom.window.document;
  const linkElements = listDoc.querySelectorAll(extraction.listPage.articleLinkSelector);

  if (linkElements.length === 0) {
    throw new Error(`No article links found using selector: ${extraction.listPage.articleLinkSelector}`);
  }

  const maxArticles = extraction.listPage.maxArticles ?? 20;
  const articleUrls: string[] = [];

  linkElements.forEach((el: Element) => {
    if (articleUrls.length >= maxArticles) return;
    const anchor = el as HTMLAnchorElement;
    if (anchor.href) {
      articleUrls.push(anchor.href);
    }
  });

  console.log(`[scraper] Found ${articleUrls.length} article links for source ${sourceId}`);

  let inserted = 0;
  let skipped = 0;

  for (const articleUrl of articleUrls) {
    try {
      // Fetch the article page
      let articleHtml: string;
      if (extraction.tier === "spa") {
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(articleUrl, { waitUntil: "networkidle", timeout: 30000 });
          articleHtml = await page.content();
        } finally {
          await browser.close();
        }
      } else {
        const res = await fetch(articleUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Dispatch/1.0; +https://dispatch.app)"
          }
        });
        if (!res.ok) {
          console.warn(`[scraper] Failed to fetch ${articleUrl}: HTTP ${res.status}`);
          skipped++;
          continue;
        }
        articleHtml = await res.text();
      }

      // Extract content
      const articleDom = new JSDOM(articleHtml, { url: articleUrl });
      const articleDoc = articleDom.window.document;

      let title = "(untitled)";
      let content = "";
      let publishedDate: Date | null = null;

      // Try custom selectors first
      if (extraction.articlePage?.titleSelector) {
        const titleEl = articleDoc.querySelector(extraction.articlePage.titleSelector);
        if (titleEl?.textContent?.trim()) {
          title = titleEl.textContent.trim();
        }
      }

      if (extraction.articlePage?.contentSelector) {
        const contentEl = articleDoc.querySelector(extraction.articlePage.contentSelector);
        if (contentEl?.textContent?.trim()) {
          content = contentEl.textContent.trim();
        }
      }

      if (extraction.articlePage?.dateSelector) {
        const dateEl = articleDoc.querySelector(extraction.articlePage.dateSelector);
        if (dateEl) {
          const dateAttr = dateEl.getAttribute("datetime") ?? dateEl.textContent;
          if (dateAttr) {
            const parsed = new Date(dateAttr);
            if (!Number.isNaN(parsed.getTime())) {
              publishedDate = parsed;
            }
          }
        }
      }

      // Fall back to Readability if no content found
      if (!content && extraction.articlePage?.fallbackToReadability !== false) {
        const reader = new Readability(articleDoc);
        const result = reader.parse();
        if (result) {
          title = result.title ?? title;
          content = result.textContent ?? "";
          if (!publishedDate && result.publishedTime) {
            const parsed = new Date(result.publishedTime);
            if (!Number.isNaN(parsed.getTime())) {
              publishedDate = parsed;
            }
          }
        }
      }

      if (!content) {
        console.warn(`[scraper] No content extracted from ${articleUrl}`);
        skipped++;
        continue;
      }

      // Insert into DB
      const result = db
        .insert(articles)
        .values({
          sourceId,
          title,
          url: articleUrl,
          rawHtml: null,
          cleanContent: content,
          publishedAt: publishedDate,
          fetchedAt: new Date(),
          isRead: false
        })
        .onConflictDoNothing()
        .run();

      if (result.changes === 0) {
        skipped++;
      } else {
        inserted++;
        await processIfEnabled(articleUrl);
      }
    } catch (err) {
      console.error(`[scraper] Error processing ${articleUrl}:`, err);
      skipped++;
    }
  }

  return { inserted, skipped, tier: "skill" };
}

// ---------------------------------------------------------------------------
// Queue wrapper for concurrency control
// ---------------------------------------------------------------------------

export function enqueueScrape(sourceId: number): Promise<ScrapeResult> {
  return scrapeQueue.add(() => scrapeSource(sourceId)) as Promise<ScrapeResult>;
}
