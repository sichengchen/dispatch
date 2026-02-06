/**
 * Extraction Agent - Agent-based article extraction with tools
 *
 * This agent reads SKILL.md files and uses tools to extract articles from web sources.
 */

import { generateText, stepCountIs, tool, zodSchema } from "ai";
import { z } from "zod";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { getModelsConfig, getProviders, getAgentConfig } from "./settings";
import { getModelConfig, createProviderMap, type ModelsConfig } from "@dispatch/lib";
import { getSkillPath, skillExists } from "./skill-generator";
import { processArticle } from "./llm";
import fs from "node:fs";
import {
  createToolContext,
  createExtractionToolSet,
  closeBrowserSession
} from "./agents/tools";
import type { ToolContext, ExtractedArticle as BaseExtractedArticle, ExtractionStats } from "./agents/tools";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedArticle extends BaseExtractedArticle {}

export interface ExtractionResult {
  articles: ExtractedArticle[];
  inserted: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// Report articles tool schema
// ---------------------------------------------------------------------------

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

function createExtractionAgentTools(
  ctx: ToolContext,
  extractedArticles: ExtractedArticle[],
  options: {
    sourceId: number;
    stats: ExtractionStats;
  }
) {
  // Get shared tools
  const sharedTools = createExtractionToolSet(ctx);

  // Add the report_articles tool specific to extraction
  return {
    ...sharedTools,
    report_articles: tool({
      description: "Report the extracted articles. Call this frequently (every 2-3 articles) to save progress incrementally.",
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

  // Collected articles
  const extractedArticles: ExtractedArticle[] = [];

  const stats: ExtractionStats = {
    inserted: 0,
    skipped: 0,
    failed: 0
  };
  const envContinue = process.env.DISPATCH_SKILL_CONTINUE_ON_ERROR;
  const continueOnError =
    options?.continueOnError ??
    (envContinue ? envContinue.toLowerCase() === "true" : true);

  // Create tool context
  const ctx = createToolContext({
    baseUrl: source.url,
    continueOnError
  });

  // Create tools
  const tools = createExtractionAgentTools(ctx, extractedArticles, {
    sourceId,
    stats
  });

  // Get model config
  const config = configOverride ?? getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(config, "skill", providers);

  // Find provider from catalog entry
  const catalogEntry = config.catalog?.find(e => e.id === modelConfig.modelId);
  const provider = catalogEntry?.providerId ? providers.find(p => p.id === catalogEntry.providerId) : undefined;

  if (!provider) {
    throw new Error(`No provider found for model ${modelConfig.modelId}`);
  }

  const providerMap = createProviderMap({
    anthropic: provider.type === "anthropic" ? provider.credentials.apiKey : undefined,
    openai: provider.type === "openai-compatible" ? {
      apiKey: provider.credentials.apiKey,
      baseUrl: provider.credentials.baseUrl ?? ""
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
- fetch_page: Fetch HTML from a URL (use spa=true for JavaScript-heavy sites)
- run_selector: Run CSS selectors on fetched pages
- run_xpath: Run XPath expressions for complex DOM traversal
- run_regex: Extract content using regular expressions
- extract_readable: Extract main content using Readability.js
- parse_date: Parse date strings
- browser_navigate, browser_click, browser_scroll, browser_wait_for, browser_get_html: Browser tools for SPA sites
- report_articles: Save extracted articles to the database

Follow the SKILL.md instructions to:
1. Fetch the homepage/list page
2. Find article links using the specified selectors (CSS, XPath, or patterns)
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
  } finally {
    // Cleanup browser session if used
    await closeBrowserSession(ctx);
  }
}
