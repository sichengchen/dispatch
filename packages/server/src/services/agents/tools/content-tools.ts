/**
 * Content tools - extract_readable, parse_date, test_article_link
 */

import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { tool, zodSchema } from "ai";
import type { ToolContext, ReadableContent } from "./types";
import { fetchPage } from "./page-tools";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Extract readable content from HTML using Readability.js
 */
export function extractReadable(html: string, url: string): ReadableContent | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) return null;

  return {
    title: article.title ?? "",
    content: article.textContent ?? "",
    excerpt: article.excerpt ?? ""
  };
}

/**
 * Parse date string to Date object
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export const extractReadableSchema = z.object({
  url: z.string().describe("URL of the cached page to extract content from")
});

export const parseDateSchema = z.object({
  dateStr: z.string().describe("The date string to parse")
});

export const testArticleLinkSchema = z.object({
  url: z.string().describe("Article URL to test"),
  spa: z.boolean().optional().describe("Use headless browser")
});

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

/**
 * Create the extract_readable tool
 */
export function createExtractReadableTool(ctx: ToolContext) {
  return tool({
    description: "Extract main content from a cached page using Readability.js. Returns title, content, and excerpt.",
    inputSchema: zodSchema(extractReadableSchema),
    execute: async (input) => {
      const html = ctx.pageCache.get(input.url);
      if (!html) {
        return { error: `Page not cached: ${input.url}. Call fetch_page first.` };
      }
      try {
        console.log(`[tools] extract_readable: ${input.url}`);
        const readable = extractReadable(html, input.url);
        if (!readable) {
          return { error: "Could not extract readable content" };
        }
        return {
          title: readable.title,
          content: readable.content.slice(0, 2000),
          excerpt: readable.excerpt
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the parse_date tool
 */
export function createParseDateTool(ctx: ToolContext) {
  return tool({
    description: "Parse a date string into ISO format.",
    inputSchema: zodSchema(parseDateSchema),
    execute: async (input) => {
      try {
        const date = parseDate(input.dateStr);
        return date ? { date: date.toISOString() } : { error: "Could not parse date" };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the test_article_link tool (for skill generator)
 */
export function createTestArticleLinkTool(ctx: ToolContext) {
  return tool({
    description: "Fetch an article page and test if content can be extracted with Readability.js. Use this to verify the extraction strategy works.",
    inputSchema: zodSchema(testArticleLinkSchema),
    execute: async (input) => {
      try {
        console.log(`[tools] test_article_link: ${input.url}`);
        const html = await fetchPage(input.url, input.spa ?? false);
        ctx.pageCache.set(input.url, html);

        const readable = extractReadable(html, input.url);
        if (!readable) {
          return { success: false, error: "Readability could not extract content" };
        }
        return {
          success: true,
          title: readable.title,
          excerpt: readable.excerpt,
          contentLength: readable.content.length
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}
