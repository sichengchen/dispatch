/**
 * Selector tools - run_selector, run_xpath, run_regex
 */

import { z } from "zod";
import { JSDOM } from "jsdom";
import { tool, zodSchema } from "ai";
import type { ToolContext, SelectorResult, XPathResult, RegexMatch } from "./types.js";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Run CSS selector on HTML and return matching elements
 */
export function runSelector(html: string, selector: string, baseUrl: string): SelectorResult[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const elements = doc.querySelectorAll(selector);

  const results: SelectorResult[] = [];
  elements.forEach((el: Element) => {
    const anchor = el as HTMLAnchorElement;
    results.push({
      text: el.textContent?.trim().slice(0, 200) ?? "",
      href: anchor.href || undefined,
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList),
      html: el.outerHTML.slice(0, 500)
    });
  });

  return results;
}

/**
 * Run XPath expression on HTML and return matching nodes
 */
export function runXPath(html: string, xpath: string, baseUrl: string): XPathResult[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  const result = doc.evaluate(
    xpath,
    doc,
    null,
    7, // XPathResult.ORDERED_NODE_SNAPSHOT_TYPE
    null
  );

  const results: XPathResult[] = [];
  for (let i = 0; i < result.snapshotLength; i++) {
    const node = result.snapshotItem(i);
    if (!node) continue;

    const element = node as Element;
    const anchor = node as HTMLAnchorElement;

    results.push({
      text: node.textContent?.trim().slice(0, 200) ?? "",
      href: anchor.href || undefined,
      html: element.outerHTML?.slice(0, 500) ?? node.textContent?.slice(0, 500) ?? "",
      nodeType: node.nodeType === 1 ? "element" : node.nodeType === 3 ? "text" : "other"
    });
  }

  return results;
}

/**
 * Run regex on content and return matches
 */
export function runRegex(content: string, pattern: string, flags: string = "gi"): RegexMatch[] {
  const regex = new RegExp(pattern, flags);
  const matches = [...content.matchAll(regex)];

  return matches.map(m => ({
    full: m[0],
    groups: m.slice(1),
    index: m.index ?? 0
  }));
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export const runSelectorSchema = z.object({
  url: z.string().optional().describe("URL of cached page (defaults to base URL)"),
  selector: z.string().describe("CSS selector to run"),
  limit: z.number().optional().describe("Maximum number of results to return (default 20)")
});

export const runXPathSchema = z.object({
  url: z.string().optional().describe("URL of cached page (defaults to base URL)"),
  xpath: z.string().describe("XPath expression to evaluate"),
  limit: z.number().optional().describe("Maximum number of results to return (default 20)")
});

export const runRegexSchema = z.object({
  url: z.string().optional().describe("URL of cached page (defaults to base URL)"),
  pattern: z.string().describe("Regular expression pattern"),
  flags: z.string().optional().describe("Regex flags (default 'gi')"),
  target: z.enum(["html", "text"]).optional().describe("Extract from raw HTML or text content (default 'html')")
});

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

/**
 * Create the run_selector tool
 */
export function createRunSelectorTool(ctx: ToolContext) {
  return tool({
    description: "Run a CSS selector on a cached page to find elements. Returns text, href, tag, classes for each match.",
    inputSchema: zodSchema(runSelectorSchema),
    execute: async (input) => {
      const url = input.url ?? ctx.baseUrl;
      const html = ctx.pageCache.get(url);
      if (!html) {
        return { error: `Page not cached: ${url}. Call fetch_page first.` };
      }
      try {
        console.log(`[tools] run_selector: ${input.selector}`);
        let results = runSelector(html, input.selector, url);

        // Filter to article-like links for the skill generator
        const articleLinks = results.filter(r => {
          if (!r.href) return false;
          try {
            const linkUrl = new URL(r.href);
            const origin = new URL(url).origin;
            if (linkUrl.origin !== origin) return false;
            if (linkUrl.pathname === "/" || linkUrl.pathname === "") return false;
            return true;
          } catch {
            return false;
          }
        });

        const limit = input.limit ?? 20;
        return {
          totalMatches: results.length,
          articleLikeLinks: articleLinks.length,
          results: results.slice(0, limit)
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the run_xpath tool
 */
export function createRunXPathTool(ctx: ToolContext) {
  return tool({
    description: "Run an XPath expression on a cached page. Useful for complex DOM traversal (sibling selection, ancestor axes, etc.).",
    inputSchema: zodSchema(runXPathSchema),
    execute: async (input) => {
      const url = input.url ?? ctx.baseUrl;
      const html = ctx.pageCache.get(url);
      if (!html) {
        return { error: `Page not cached: ${url}. Call fetch_page first.` };
      }
      try {
        console.log(`[tools] run_xpath: ${input.xpath}`);
        let results = runXPath(html, input.xpath, url);
        const limit = input.limit ?? 20;
        return {
          totalMatches: results.length,
          results: results.slice(0, limit)
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the run_regex tool
 */
export function createRunRegexTool(ctx: ToolContext) {
  return tool({
    description: "Extract content using a regular expression. Returns all matches with capture groups. Useful for URL patterns, dates, IDs embedded in markup.",
    inputSchema: zodSchema(runRegexSchema),
    execute: async (input) => {
      const url = input.url ?? ctx.baseUrl;
      const html = ctx.pageCache.get(url);
      if (!html) {
        return { error: `Page not cached: ${url}. Call fetch_page first.` };
      }
      try {
        console.log(`[tools] run_regex: ${input.pattern}`);

        // Get content based on target
        let content = html;
        if (input.target === "text") {
          const dom = new JSDOM(html, { url });
          content = dom.window.document.body.textContent ?? "";
        }

        const matches = runRegex(content, input.pattern, input.flags ?? "gi");
        return {
          totalMatches: matches.length,
          matches: matches.slice(0, 50)
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}
