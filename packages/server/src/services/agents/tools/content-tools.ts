/**
 * Content tools - extract_readable, parse_date, test_article_link
 */

import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { tool, zodSchema } from "ai";
import type { ToolContext, ReadableContent } from "./types.js";
import { fetchPage, fetchMarkdown } from "./page-tools.js";

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

function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, string>;
  body: string;
} {
  if (!markdown.startsWith("---\n")) {
    return { frontmatter: {}, body: markdown };
  }

  const endIndex = markdown.indexOf("\n---", 4);
  if (endIndex === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const fmBlock = markdown.slice(4, endIndex).trim();
  const body = markdown.slice(endIndex + 4).replace(/^\s+/, "");
  const frontmatter: Record<string, string> = {};

  for (const line of fmBlock.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1").trim();
    if (value) frontmatter[key] = value;
  }

  return { frontmatter, body };
}

function markdownToText(markdown: string): string {
  let text = markdown.replace(/\r\n/g, "\n");
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, "");
  text = text.replace(/^\s{0,3}\d+\.\s+/gm, "");
  text = text.replace(/^\s{0,3}---\s*$/gm, "");
  text = text.replace(/[*_~]/g, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

export function extractReadableFromMarkdown(markdown: string): ReadableContent | null {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const headingMatch = body.match(/^#\s+(.+)$/m);
  const title = frontmatter.title ?? headingMatch?.[1]?.trim() ?? "";
  const description = frontmatter.description ?? frontmatter.excerpt ?? "";
  const content = markdownToText(body);
  if (!content) return null;
  const excerpt = description || content.slice(0, 200);
  return {
    title,
    content,
    excerpt
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
    description: "Extract main content from a cached page. Prefers Markdown (if available), otherwise falls back to Readability.js. Returns title, content, and excerpt.",
    inputSchema: zodSchema(extractReadableSchema),
    execute: async (input) => {
      const html = ctx.pageCache.get(input.url);
      if (!html) {
        return { error: `Page not cached: ${input.url}. Call fetch_page first.` };
      }
      try {
        console.log(`[tools] extract_readable: ${input.url}`);
        let markdownResult: Awaited<ReturnType<typeof fetchMarkdown>> | null = null;
        try {
          markdownResult = await fetchMarkdown(input.url);
        } catch {
          markdownResult = null;
        }
        if (markdownResult?.markdown) {
          const markdownReadable = extractReadableFromMarkdown(markdownResult.markdown);
          if (markdownReadable) {
            return {
              title: markdownReadable.title,
              content: markdownReadable.content.slice(0, 2000),
              excerpt: markdownReadable.excerpt
            };
          }
        }

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
    description: "Fetch an article page and test if content can be extracted. Prefers Markdown (if available), otherwise falls back to Readability.js. Use this to verify the extraction strategy works.",
    inputSchema: zodSchema(testArticleLinkSchema),
    execute: async (input) => {
      try {
        console.log(`[tools] test_article_link: ${input.url}`);
        let markdownResult: Awaited<ReturnType<typeof fetchMarkdown>> | null = null;
        try {
          markdownResult = await fetchMarkdown(input.url);
        } catch {
          markdownResult = null;
        }
        if (markdownResult?.markdown) {
          const markdownReadable = extractReadableFromMarkdown(markdownResult.markdown);
          if (markdownReadable) {
            return {
              success: true,
              title: markdownReadable.title,
              excerpt: markdownReadable.excerpt,
              contentLength: markdownReadable.content.length
            };
          }
        }

        const html = await fetchPage(input.url, false);
        ctx.pageCache.set(input.url, html);

        const readable = extractReadable(html, input.url);
        if (!readable && input.spa) {
          const spaHtml = await fetchPage(input.url, true);
          ctx.pageCache.set(input.url, spaHtml);
          const spaReadable = extractReadable(spaHtml, input.url);
          if (spaReadable) {
            return {
              success: true,
              title: spaReadable.title,
              excerpt: spaReadable.excerpt,
              contentLength: spaReadable.content.length
            };
          }
        }
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
