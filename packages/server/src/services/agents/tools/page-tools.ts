/**
 * Page tools - fetch_page and get_structure
 */

import { z } from "zod";
import { JSDOM } from "jsdom";
import { chromium } from "playwright";
import { tool, zodSchema } from "ai";
import type { ToolContext } from "./types.js";
import { getUserAgent } from "./user-agent.js";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Fetch HTML from a URL (static or with headless browser)
 */
export async function fetchPage(url: string, useSpa: boolean = false): Promise<string> {
  if (useSpa) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      return await page.content();
    } finally {
      await browser.close();
    }
  } else {
    const res = await fetch(url, {
      headers: {
        "User-Agent": getUserAgent()
      }
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    return await res.text();
  }
}

/**
 * Fetch markdown content using Cloudflare's Markdown for Agents (if available).
 * Returns null when the origin does not serve text/markdown.
 */
export async function fetchMarkdown(url: string): Promise<{
  markdown: string;
  tokenCount?: number;
} | null> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": getUserAgent(),
      Accept: "text/markdown, text/html;q=0.9"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/markdown")) {
    return null;
  }
  const markdown = await res.text();
  const tokenCountHeader = res.headers.get("x-markdown-tokens");
  const tokenCount = tokenCountHeader ? Number(tokenCountHeader) : undefined;
  return {
    markdown,
    tokenCount: Number.isFinite(tokenCount) ? tokenCount : undefined
  };
}

/**
 * Get HTML structure summary for a page
 */
export function getHtmlStructure(html: string, baseUrl: string): {
  title: string;
  metaDescription: string;
  mainSections: Array<{ tag: string; classes: string[]; childCount: number }>;
  linkCount: number;
  articleElementCount: number;
} {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  const title = doc.querySelector("title")?.textContent ?? "";
  const metaDescription = doc.querySelector("meta[name='description']")?.getAttribute("content") ?? "";

  const mainSections: Array<{ tag: string; classes: string[]; childCount: number }> = [];
  doc.querySelectorAll("main, section, article, [role='main'], .content, #content").forEach((el: Element) => {
    mainSections.push({
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList),
      childCount: el.children.length
    });
  });

  const linkCount = doc.querySelectorAll("a[href]").length;
  const articleElementCount = doc.querySelectorAll("article, [class*='article'], [class*='post'], [class*='story']").length;

  return { title, metaDescription, mainSections, linkCount, articleElementCount };
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export const fetchPageSchema = z.object({
  url: z.string().describe("The URL to fetch"),
  spa: z.boolean().optional().describe("Use headless browser for JavaScript-heavy sites")
});

export const getStructureSchema = z.object({
  url: z.string().optional().describe("URL of cached page to analyze (defaults to base URL)")
});

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

/**
 * Create the fetch_page tool
 */
export function createFetchPageTool(ctx: ToolContext) {
  return tool({
    description: "Fetch HTML content from a URL. Use spa=true for JavaScript-heavy sites that require browser rendering.",
    inputSchema: zodSchema(fetchPageSchema),
    execute: async (input) => {
      try {
        console.log(`[tools] fetch_page: ${input.url} (spa=${input.spa ?? false})`);
        const html = await fetchPage(input.url, input.spa ?? false);
        ctx.pageCache.set(input.url, html);
        return { success: true, length: html.length, cached: true };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the get_structure tool
 */
export function createGetStructureTool(ctx: ToolContext) {
  return tool({
    description: "Get an overview of the HTML structure of a cached page (main sections, element counts, etc.)",
    inputSchema: zodSchema(getStructureSchema),
    execute: async (input) => {
      const url = input.url ?? ctx.baseUrl;
      const html = ctx.pageCache.get(url);
      if (!html) {
        return { error: `Page not cached: ${url}. Call fetch_page first.` };
      }
      console.log(`[tools] get_structure: ${url}`);
      return getHtmlStructure(html, url);
    }
  });
}
