import Parser from "rss-parser";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { summarizeArticle } from "./llm";

const parser = new Parser();

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ScrapeResult = {
  inserted: number;
  skipped: number;
};

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
      if (process.env.DISPATCH_DISABLE_LLM === "1") {
        continue;
      }
      try {
        const summary = await summarizeArticle(content || item.title || "");
        if (summary) {
          db.update(articles)
            .set({ summary })
            .where(eq(articles.url, url))
            .run();
        }
      } catch (err) {
        console.error("LLM summary failed", err);
      }
    }

    db.update(sources)
      .set({ lastFetchedAt: new Date(), lastErrorAt: null })
      .where(eq(sources.id, source.id as number))
      .run();

    return { inserted, skipped };
  } catch (error) {
    db.update(sources)
      .set({ lastErrorAt: new Date() })
      .where(eq(sources.id, source.id as number))
      .run();
    console.error("RSS scrape failed", error);
    throw error;
  }
}
