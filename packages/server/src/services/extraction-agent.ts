/**
 * Extraction Agent - Agent-based article extraction with tools
 * 
 * This agent reads SKILL.md files and uses tools to extract articles from web sources.
 */

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chromium } from "playwright";
import { generateText, stepCountIs, tool, zodSchema } from "ai";
import { z } from "zod";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { getModelsConfig, getAgentConfig } from "./settings";
import { getModelConfig, createProviderMap, type ModelsConfig } from "@dispatch/lib";
import { getSkillPath, skillExists } from "./skill-generator";
import { processArticle } from "./llm";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedArticle {
  url: string;
  title: string;
  content: string;
  excerpt?: string;
  publishedDate?: Date | null;
  author?: string;
}

export interface ExtractionResult {
  articles: ExtractedArticle[];
  inserted: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Tool implementations (helper functions)
// ---------------------------------------------------------------------------

/**
 * Fetch HTML from a URL
 */
async function fetchPage(url: string, useSpa: boolean = false): Promise<string> {
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
        "User-Agent": "Mozilla/5.0 (compatible; Dispatch/1.0; +https://dispatch.app)"
      }
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    return await res.text();
  }
}

/**
 * Run CSS selector on HTML and return matching elements
 */
function runSelector(html: string, selector: string, baseUrl: string): Array<{
  text: string;
  href?: string;
  html: string;
}> {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const elements = doc.querySelectorAll(selector);
  
  const results: Array<{ text: string; href?: string; html: string }> = [];
  elements.forEach((el: Element) => {
    const anchor = el as HTMLAnchorElement;
    results.push({
      text: el.textContent?.trim() ?? "",
      href: anchor.href || undefined,
      html: el.innerHTML
    });
  });
  
  return results;
}

/**
 * Extract readable content from HTML using Readability.js
 */
function extractReadable(html: string, url: string): {
  title: string;
  content: string;
  excerpt: string;
} | null {
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
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

const fetchPageSchema = z.object({
  url: z.string().describe("The URL to fetch"),
  spa: z.boolean().optional().describe("Use headless browser for SPA sites")
});

const runSelectorSchema = z.object({
  url: z.string().describe("The URL of the cached page to query"),
  selector: z.string().describe("CSS selector to run"),
  limit: z.number().optional().describe("Maximum number of results to return")
});

const extractReadableSchema = z.object({
  url: z.string().describe("The URL of the cached page to extract content from")
});

const parseDateSchema = z.object({
  dateStr: z.string().describe("The date string to parse")
});

const reportArticlesSchema = z.object({
  articles: z.array(z.object({
    url: z.string(),
    title: z.string(),
    content: z.string(),
    excerpt: z.string().optional(),
    publishedDate: z.string().optional(),
    author: z.string().optional()
  }))
});

// ---------------------------------------------------------------------------
// Create tools for the agent
// ---------------------------------------------------------------------------

function createExtractionTools(
  pageCache: Map<string, string>,
  extractedArticles: ExtractedArticle[],
  options: {
    sourceId: number;
    continueOnError: boolean;
    stats: {
      inserted: number;
      skipped: number;
      failed: number;
    };
  }
) {
  return {
    fetch_page: tool({
      description: "Fetch HTML content from a URL. Use spa=true for JavaScript-heavy sites.",
      inputSchema: zodSchema(fetchPageSchema),
      execute: async (input) => {
        try {
          console.log(`[extraction-agent] fetch_page: ${input.url}`);
          const html = await fetchPage(input.url, input.spa ?? false);
          pageCache.set(input.url, html);
          return { success: true, length: html.length, cached: true };
        } catch (error) {
          if (!options.continueOnError) throw error;
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),
    
    run_selector: tool({
      description: "Run a CSS selector on a previously fetched page.",
      inputSchema: zodSchema(runSelectorSchema),
      execute: async (input) => {
        try {
          const html = pageCache.get(input.url);
          if (!html) {
            return { error: `Page not cached: ${input.url}. Call fetch_page first.` };
          }
          console.log(`[extraction-agent] run_selector: ${input.selector}`);
          let results = runSelector(html, input.selector, input.url);
          if (input.limit && results.length > input.limit) {
            results = results.slice(0, input.limit);
          }
          return { count: results.length, results };
        } catch (error) {
          if (!options.continueOnError) throw error;
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),
    
    extract_readable: tool({
      description: "Extract main content from a fetched page using Readability.js.",
      inputSchema: zodSchema(extractReadableSchema),
      execute: async (input) => {
        try {
          const html = pageCache.get(input.url);
          if (!html) {
            return { error: `Page not cached: ${input.url}. Call fetch_page first.` };
          }
          console.log(`[extraction-agent] extract_readable: ${input.url}`);
          const readable = extractReadable(html, input.url);
          if (!readable) {
            return { error: "Could not extract readable content" };
          }
          return readable;
        } catch (error) {
          if (!options.continueOnError) throw error;
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),
    
    parse_date: tool({
      description: "Parse a date string into ISO format.",
      inputSchema: zodSchema(parseDateSchema),
      execute: async (input) => {
        try {
          const date = parseDate(input.dateStr);
          return date ? { date: date.toISOString() } : { error: "Could not parse date" };
        } catch (error) {
          if (!options.continueOnError) throw error;
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),
    
    report_articles: tool({
      description: "Report the extracted articles. Call this when you have finished extracting all articles.",
      inputSchema: zodSchema(reportArticlesSchema),
      execute: async (input) => {
        console.log(`[extraction-agent] report_articles: ${input.articles.length} articles`);
        for (const article of input.articles) {
          if (!article.url || !article.title || !article.content) {
            options.stats.skipped += 1;
            continue;
          }
          extractedArticles.push({
            url: article.url,
            title: article.title,
            content: article.content,
            excerpt: article.excerpt,
            publishedDate: article.publishedDate ? new Date(article.publishedDate) : null,
            author: article.author
          });

          const existing = db
            .select()
            .from(articles)
            .where(eq(articles.url, article.url))
            .get();
          if (existing) {
            options.stats.skipped += 1;
            continue;
          }

          try {
            const insertResult = db.insert(articles)
              .values({
                sourceId: options.sourceId,
                url: article.url,
                title: article.title,
                cleanContent: article.content,
                summary: article.excerpt ?? null,
                publishedAt: article.publishedDate ? new Date(article.publishedDate) : null,
                fetchedAt: new Date()
              })
              .run();
            options.stats.inserted += 1;

            // Process article through AI pipeline if LLM is enabled
            if (process.env.DISPATCH_DISABLE_LLM !== "1" && insertResult.lastInsertRowid) {
              const articleId = Number(insertResult.lastInsertRowid);
              processArticle(articleId).catch((err) => {
                console.warn("[extraction-agent] Pipeline failed for article", { articleId, err });
              });
            }
          } catch (error) {
            options.stats.failed += 1;
            console.warn("[extraction-agent] Failed to insert article", {
              url: article.url,
              error
            });
          }
        }
        return {
          received: input.articles.length,
          inserted: options.stats.inserted,
          skipped: options.stats.skipped,
          failed: options.stats.failed
        };
      }
    })
  };
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

export async function extractArticles(
  sourceId: number,
  configOverride?: ModelsConfig,
  options?: {
    continueOnError?: boolean;
  }
): Promise<ExtractionResult> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) {
    throw new Error(`Source ${sourceId} not found`);
  }

  if (!skillExists(sourceId)) {
    throw new Error(`No skill found for source ${sourceId}. Generate a skill first.`);
  }

  const skillPath = getSkillPath(sourceId);
  const skillContent = fs.readFileSync(skillPath, "utf-8");
  
  console.log(`[extraction-agent] Starting extraction for source ${sourceId}: ${source.name}`);
  
  // Page cache for tool operations
  const pageCache: Map<string, string> = new Map();
  
  // Collected articles
  const extractedArticles: ExtractedArticle[] = [];
  
  const stats = {
    inserted: 0,
    skipped: 0,
    failed: 0
  };
  const envContinue = process.env.DISPATCH_SKILL_CONTINUE_ON_ERROR;
  const continueOnError =
    options?.continueOnError ??
    (envContinue ? envContinue.toLowerCase() === "true" : true);

  // Create tools
  const tools = createExtractionTools(pageCache, extractedArticles, {
    sourceId,
    continueOnError,
    stats
  });
  
  // Get model config
  const config = configOverride ?? getModelsConfig();
  const modelConfig = getModelConfig(config, "skill");
  
  // Find provider config from catalog
  const catalogEntry = config.catalog?.find(e => e.id === modelConfig.modelId);
  const providerConfig = catalogEntry?.providerConfig;
  
  const providerMap = createProviderMap({
    anthropic: providerConfig?.apiKey,
    openai: providerConfig ? {
      apiKey: providerConfig.apiKey ?? "",
      baseUrl: providerConfig.baseUrl ?? ""
    } : undefined
  });
  
  const providerFn = providerMap[modelConfig.providerType as keyof typeof providerMap];
  if (!providerFn) {
    throw new Error(`No provider found for ${modelConfig.providerType}`);
  }
  
  const model = providerFn(modelConfig.model);
  
  // Build prompt with skill instructions
  const systemPrompt = `You are an article extraction agent. Your job is to extract articles from a website using the provided SKILL.md instructions.

You have the following tools available:
- fetch_page: Fetch HTML from a URL
- run_selector: Run CSS selectors on fetched pages
- extract_readable: Extract main content using Readability.js
- parse_date: Parse date strings
- report_articles: Save extracted articles to the database

Follow the SKILL.md instructions to:
1. Fetch the homepage/list page
2. Find article links using the specified selectors
3. For each article, fetch the page and extract content
4. IMPORTANT: Call report_articles frequently to save progress

CRITICAL: Call report_articles after extracting every 2-3 articles. Do NOT wait until the end - you may run out of steps. Save articles incrementally to ensure they are not lost.

Extract up to 10 articles maximum.`;

  const userPrompt = `Extract articles from ${source.url} using these instructions:

${skillContent}

Start by fetching the homepage, then find and extract articles.`;

  try {
    const agentConfig = getAgentConfig();
    const maxSteps = agentConfig.extractionAgentMaxSteps ?? 100;

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      tools,
      stopWhen: stepCountIs(maxSteps),
      temperature: 0.1
    });

    console.log(`[extraction-agent] Agent completed with ${result.steps.length} steps (max: ${maxSteps})`);
    console.log(`[extraction-agent] Extracted ${extractedArticles.length} articles`);
    console.log(
      `[extraction-agent] Inserted ${stats.inserted}, skipped ${stats.skipped}, failed ${stats.failed}`
    );

    return {
      articles: extractedArticles,
      inserted: stats.inserted,
      skipped: stats.skipped
    };
    
  } catch (error) {
    console.error("[extraction-agent] Error:", error);
    throw error;
  }
}
