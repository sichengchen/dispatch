/**
 * Tools for the add-source agent
 */

import { z } from "zod";
import { JSDOM } from "jsdom";
import Parser from "rss-parser";
import { generateText, tool, zodSchema } from "ai";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { createProviderMap, getModelConfig, type ProviderKeyMap } from "@dispatch/lib";
import { generateSkill, type SkillGenerationOptions } from "../skill-generator.js";
import { getModelsConfig, getProviders } from "../settings.js";
import { getUserAgent } from "./tools/user-agent.js";

const parser = new Parser();

// ---------------------------------------------------------------------------
// check_rss - Detect RSS feeds on a website
// ---------------------------------------------------------------------------

const checkRssSchema = z.object({
  url: z.string().url().describe("The website URL to check for RSS feeds"),
});

/**
 * Check a website for RSS feed availability
 */
async function checkRss(url: string): Promise<{
  found: boolean;
  feeds: Array<{ url: string; type: string; title?: string }>;
  error?: string;
}> {
  try {
    // Parse the base URL
    const parsedUrl = new URL(url);
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Fetch the page HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent": getUserAgent(),
      },
    });

    if (!response.ok) {
      return { found: false, feeds: [], error: `Failed to fetch page: HTTP ${response.status}` };
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;

    const feeds: Array<{ url: string; type: string; title?: string }> = [];

    // 1. Check for RSS/Atom link tags in <head>
    const linkSelectors = [
      'link[type="application/rss+xml"]',
      'link[type="application/atom+xml"]',
      'link[type="application/feed+json"]',
      'link[rel="alternate"][type*="rss"]',
      'link[rel="alternate"][type*="atom"]',
    ];

    for (const selector of linkSelectors) {
      const links = doc.querySelectorAll(selector);
      links.forEach((link) => {
        const href = link.getAttribute("href");
        const type = link.getAttribute("type") || "rss";
        const title = link.getAttribute("title") || undefined;

        if (href) {
          const feedUrl = href.startsWith("http") ? href : new URL(href, baseUrl).toString();
          if (!feeds.some((f) => f.url === feedUrl)) {
            feeds.push({ url: feedUrl, type, title });
          }
        }
      });
    }

    // 2. Check common feed paths if no links found
    if (feeds.length === 0) {
      const commonPaths = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml", "/index.xml"];

      for (const path of commonPaths) {
        const feedUrl = `${baseUrl}${path}`;
        try {
          const feedResponse = await fetch(feedUrl, {
            method: "HEAD",
            headers: { "User-Agent": getUserAgent() },
          });

          if (feedResponse.ok) {
            const contentType = feedResponse.headers.get("content-type") || "";
            if (
              contentType.includes("xml") ||
              contentType.includes("rss") ||
              contentType.includes("atom")
            ) {
              feeds.push({ url: feedUrl, type: "rss" });
              break; // Found one, stop checking
            }
          }
        } catch {
          // Ignore fetch errors for common paths
        }
      }
    }

    return { found: feeds.length > 0, feeds };
  } catch (error) {
    return {
      found: false,
      feeds: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function createCheckRssTool() {
  return tool({
    description:
      "Check a website for RSS/Atom feed availability. Looks for feed links in HTML and checks common feed paths.",
    inputSchema: zodSchema(checkRssSchema),
    execute: async ({ url }) => {
      console.log(`[add-source-tools] check_rss: ${url}`);
      return await checkRss(url);
    },
  });
}

// ---------------------------------------------------------------------------
// evaluate_feed - Assess RSS feed quality
// ---------------------------------------------------------------------------

const evaluateFeedSchema = z.object({
  feedUrl: z.string().url().describe("The RSS/Atom feed URL to evaluate"),
  useLlm: z.boolean().optional().default(true).describe("Whether to use LLM for quality analysis (default: true)"),
});

// Schema for LLM quality analysis response
const qualityAnalysisSchema = z.object({
  isComplete: z.boolean().describe("Whether the articles appear to be complete"),
  truncationIndicators: z.array(z.string()).describe("List of truncation indicators found (e.g., 'Read Full Story', '[...]')"),
  reasoning: z.string().describe("Brief explanation of the assessment"),
});

/**
 * Detect content format (HTML vs plain text) in RSS content
 */
function detectContentFormat(samples: string[]): "html" | "text" | "mixed" {
  const htmlTagRegex = /<(p|div|a|br|span|img|h[1-6]|ul|ol|li|table|blockquote)[^>]*>/i;

  let htmlCount = 0;
  let textCount = 0;

  for (const sample of samples) {
    if (htmlTagRegex.test(sample)) {
      htmlCount++;
    } else {
      textCount++;
    }
  }

  if (htmlCount === 0) return "text";
  if (textCount === 0) return "html";
  return "mixed";
}

/**
 * Use LLM to analyze content quality and detect truncation
 */
async function analyzeContentQuality(
  samples: Array<{ title: string; content: string }>
): Promise<{
  quality: "full" | "summary";
  truncationIndicators: string[];
}> {
  const modelsConfig = getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(modelsConfig, "skill", providers);

  // Handle mock provider or missing config
  if (modelConfig.providerType === "mock") {
    return { quality: "summary", truncationIndicators: ["Unable to analyze - mock provider configured"] };
  }

  // Find the provider for this model from catalog
  const catalogEntry = modelsConfig.catalog?.find((e) => e.id === modelConfig.modelId);
  const modelProvider = catalogEntry?.providerId
    ? providers.find((p) => p.id === catalogEntry.providerId)
    : undefined;

  if (!modelProvider) {
    return { quality: "summary", truncationIndicators: ["Unable to analyze - no provider configured"] };
  }

  // Build provider keys from the provider credentials
  const providerKeys: ProviderKeyMap = {};
  if (modelConfig.providerType === "anthropic") {
    providerKeys.anthropic = modelProvider.credentials.apiKey;
  } else if (modelConfig.providerType === "openai") {
    providerKeys.openai = {
      apiKey: modelProvider.credentials.apiKey,
      baseUrl: modelProvider.credentials.baseUrl || "",
    };
  }

  const providerMap = createProviderMap(providerKeys);
  const provider = providerMap[modelConfig.providerType as "anthropic" | "openai"];

  if (!provider) {
    return { quality: "summary", truncationIndicators: ["Unable to analyze - no LLM configured"] };
  }

  const model = provider(modelConfig.model);

  // Prepare sample content for analysis (truncate to 2000 chars each)
  const sampleText = samples
    .map((s, i) => `Article ${i + 1}: "${s.title}"\n${s.content.slice(0, 2000)}`)
    .join("\n\n---\n\n");

  const prompt = `Analyze these RSS feed article samples to determine if they contain full articles or truncated excerpts.

Look for signs of truncation:
- Explicit indicators like "Read Full Story", "Continue reading", "Read more", "[...]", "Click here"
- Abrupt endings mid-sentence or mid-thought
- Content that seems incomplete or cuts off suddenly
- Very short content that appears to be a teaser

SAMPLES:
${sampleText}

Respond with JSON matching this schema:
{
  "isComplete": boolean (true if articles appear complete, false if truncated),
  "truncationIndicators": string[] (specific phrases or issues found, empty if none),
  "reasoning": string (brief explanation)
}`;

  try {
    const { text } = await generateText({
      model,
      prompt,
      temperature: 0.1,
    });

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { quality: "summary", truncationIndicators: ["Failed to parse LLM response"] };
    }

    const parsed = qualityAnalysisSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      return { quality: "summary", truncationIndicators: ["Invalid LLM response format"] };
    }

    return {
      quality: parsed.data.isComplete ? "full" : "summary",
      truncationIndicators: parsed.data.truncationIndicators,
    };
  } catch (error) {
    console.error("[add-source-tools] LLM analysis failed:", error);
    return { quality: "summary", truncationIndicators: ["LLM analysis failed"] };
  }
}

/**
 * Evaluate an RSS feed's quality using LLM-based content analysis
 */
async function evaluateFeed(
  feedUrl: string,
  useLlm: boolean = true
): Promise<{
  success: boolean;
  quality: "full" | "summary" | "unknown";
  contentFormat: "html" | "text" | "mixed";
  truncationIndicators: string[];
  itemCount: number;
  sampleTitles: string[];
  error?: string;
}> {
  try {
    const feed = await parser.parseURL(feedUrl);

    if (!feed.items || feed.items.length === 0) {
      return {
        success: true,
        quality: "unknown",
        contentFormat: "text",
        truncationIndicators: [],
        itemCount: 0,
        sampleTitles: [],
        error: "Feed has no items",
      };
    }

    // Extract content samples for analysis
    const samples = feed.items.slice(0, 3).map((item) => ({
      title: item.title || "Untitled",
      content: item.content || item["content:encoded"] || item.contentSnippet || "",
    }));

    const sampleTitles = samples.map((s) => s.title);
    const contentStrings = samples.map((s) => s.content);

    // Detect content format (HTML vs text)
    const contentFormat = detectContentFormat(contentStrings);

    // Determine quality using LLM or return unknown if disabled
    let quality: "full" | "summary" | "unknown" = "unknown";
    let truncationIndicators: string[] = [];

    if (useLlm) {
      const analysis = await analyzeContentQuality(samples);
      quality = analysis.quality;
      truncationIndicators = analysis.truncationIndicators;
    }

    return {
      success: true,
      quality,
      contentFormat,
      truncationIndicators,
      itemCount: feed.items.length,
      sampleTitles,
    };
  } catch (error) {
    return {
      success: false,
      quality: "unknown",
      contentFormat: "text",
      truncationIndicators: [],
      itemCount: 0,
      sampleTitles: [],
      error: error instanceof Error ? error.message : "Failed to parse feed",
    };
  }
}

export function createEvaluateFeedTool() {
  return tool({
    description:
      "Evaluate an RSS feed to determine if it contains full article content or just summaries. Uses LLM analysis to detect truncation indicators. Returns quality assessment, content format, and any truncation issues found.",
    inputSchema: zodSchema(evaluateFeedSchema),
    execute: async ({ feedUrl, useLlm }) => {
      console.log(`[add-source-tools] evaluate_feed: ${feedUrl} (useLlm: ${useLlm})`);
      return await evaluateFeed(feedUrl, useLlm);
    },
  });
}

// ---------------------------------------------------------------------------
// fetch_robots - Fetch robots.txt content
// ---------------------------------------------------------------------------

const fetchRobotsSchema = z.object({
  url: z.string().url().describe("The website URL (robots.txt will be fetched from root)"),
});

/**
 * Fetch robots.txt from a website
 */
async function fetchRobots(url: string): Promise<{
  found: boolean;
  content?: string;
  error?: string;
}> {
  try {
    const parsedUrl = new URL(url);
    const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;

    const response = await fetch(robotsUrl, {
      headers: { "User-Agent": getUserAgent() },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { found: false };
      }
      return { found: false, error: `HTTP ${response.status}` };
    }

    const content = await response.text();
    return { found: true, content };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function createFetchRobotsTool() {
  return tool({
    description: "Fetch the robots.txt file from a website to understand crawling rules.",
    inputSchema: zodSchema(fetchRobotsSchema),
    execute: async ({ url }) => {
      console.log(`[add-source-tools] fetch_robots: ${url}`);
      return await fetchRobots(url);
    },
  });
}

// ---------------------------------------------------------------------------
// add_rss_source - Add a source with RSS strategy
// ---------------------------------------------------------------------------

const addRssSourceSchema = z.object({
  name: z.string().min(1).describe("Name for the source"),
  feedUrl: z.string().url().describe("RSS/Atom feed URL"),
});

/**
 * Add a new RSS source to the database
 */
async function addRssSource(
  name: string,
  feedUrl: string
): Promise<{
  success: boolean;
  sourceId?: number;
  error?: string;
}> {
  try {
    // Check for existing source with same URL
    const existing = db
      .select()
      .from(sources)
      .where(eq(sources.url, feedUrl))
      .get();

    if (existing) {
      return {
        success: false,
        error: `A source with URL "${feedUrl}" already exists (${existing.name})`,
      };
    }

    // Insert new source
    const result = db
      .insert(sources)
      .values({
        name,
        url: feedUrl,
        type: "rss",
        isActive: true,
        scrapingStrategy: "rss",
      })
      .run();

    const sourceId = Number(result.lastInsertRowid);
    console.log(`[add-source-tools] Added RSS source: ${name} (ID: ${sourceId})`);

    return { success: true, sourceId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add source",
    };
  }
}

export function createAddRssSourceTool() {
  return tool({
    description: "Add a new RSS source to the system. Use this when the user chooses to use RSS.",
    inputSchema: zodSchema(addRssSourceSchema),
    execute: async ({ name, feedUrl }) => {
      console.log(`[add-source-tools] add_rss_source: ${name} -> ${feedUrl}`);
      return await addRssSource(name, feedUrl);
    },
  });
}

// ---------------------------------------------------------------------------
// generate_skill - Invoke skill generator for agentic extraction
// ---------------------------------------------------------------------------

const generateSkillSchema = z.object({
  name: z.string().min(1).describe("Name for the source"),
  url: z.string().url().describe("Website URL to generate extraction skill for"),
  robotsTxt: z.string().optional().describe("Optional robots.txt content for crawling guidance"),
});

/**
 * Generate a skill for agentic article extraction
 */
async function invokeGenerateSkill(
  name: string,
  url: string,
  robotsTxt?: string
): Promise<{
  success: boolean;
  sourceId?: number;
  skillPath?: string;
  error?: string;
}> {
  try {
    // Check for existing source with same URL
    const existing = db
      .select()
      .from(sources)
      .where(eq(sources.url, url))
      .get();

    if (existing) {
      return {
        success: false,
        error: `A source with URL "${url}" already exists (${existing.name})`,
      };
    }

    // Insert new source first
    const result = db
      .insert(sources)
      .values({
        name,
        url,
        type: "web",
        isActive: true,
      })
      .run();

    const sourceId = Number(result.lastInsertRowid);

    // Generate skill with optional robots.txt context
    const options: SkillGenerationOptions = robotsTxt ? { robotsTxt } : {};
    const skillResult = await generateSkill(sourceId, url, name, options);

    if (!skillResult.success) {
      return {
        success: false,
        sourceId,
        error: skillResult.error ?? "Skill generation failed",
      };
    }

    console.log(`[add-source-tools] Generated skill for source: ${name} (ID: ${sourceId})`);

    return {
      success: true,
      sourceId,
      skillPath: skillResult.skillPath,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate skill",
    };
  }
}

export function createGenerateSkillTool() {
  return tool({
    description:
      "Generate an extraction skill for a website using AI. Use this when there is no RSS feed or the user prefers agentic extraction.",
    inputSchema: zodSchema(generateSkillSchema),
    execute: async ({ name, url, robotsTxt }) => {
      console.log(`[add-source-tools] generate_skill: ${name} -> ${url}`);
      return await invokeGenerateSkill(name, url, robotsTxt);
    },
  });
}

// ---------------------------------------------------------------------------
// Export all tools as a set
// ---------------------------------------------------------------------------

export function createAddSourceToolSet() {
  return {
    check_rss: createCheckRssTool(),
    evaluate_feed: createEvaluateFeedTool(),
    fetch_robots: createFetchRobotsTool(),
    add_rss_source: createAddRssSourceTool(),
    generate_skill: createGenerateSkillTool(),
  };
}
