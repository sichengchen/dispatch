import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chromium } from "playwright";
import { generateText, stepCountIs, tool, zodSchema } from "ai";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { callLlm } from "./llm";
import { getModelConfig, createProviderMap, type ModelsConfig } from "@dispatch/lib";
import { getModelsConfig, getDataPaths, getAgentConfig } from "./settings";

// ---------------------------------------------------------------------------
// Skill schema and types
// ---------------------------------------------------------------------------

const skillMetadataSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  sourceId: z.string(),
  tier: z.enum(["html", "spa"]),
  homepageUrl: z.string(),
});

const listPageConfigSchema = z.object({
  articleLinkSelector: z.string(),
  titleSelector: z.string().nullish(),
  dateSelector: z.string().nullish(),
  maxArticles: z.number().nullish(),
});

const articlePageConfigSchema = z.object({
  contentSelector: z.string().nullish(),
  titleSelector: z.string().nullish(),
  dateSelector: z.string().nullish(),
  fallbackToReadability: z.boolean().nullish(),
});

const paginationConfigSchema = z.object({
  nextLinkSelector: z.string().nullish(),
  maxPages: z.number().nullish(),
});

const extractionConfigSchema = z.object({
  tier: z.enum(["html", "spa"]),
  listPage: listPageConfigSchema,
  articlePage: articlePageConfigSchema.nullish(),
  pagination: paginationConfigSchema.nullish(),
});

export type SkillMetadata = z.infer<typeof skillMetadataSchema>;
export type ListPageConfig = z.infer<typeof listPageConfigSchema>;
export type ArticlePageConfig = z.infer<typeof articlePageConfigSchema>;
export type PaginationConfig = z.infer<typeof paginationConfigSchema>;
export type ExtractionConfig = z.infer<typeof extractionConfigSchema>;

export interface ParsedSkill {
  name: string;
  description: string;
  metadata: SkillMetadata;
  extraction: ExtractionConfig;
  rawContent: string;
}

// ---------------------------------------------------------------------------
// SKILL.md parsing
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a SKILL.md file
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Invalid SKILL.md: missing YAML frontmatter");
  }

  const yamlStr = match[1];
  const body = match[2];

  // Simple YAML parser for our needs
  const frontmatter: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentIndent = 0;
  let nestedObj: Record<string, unknown> | null = null;

  for (const line of yamlStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const colonIdx = trimmed.indexOf(":");

    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (indent === 0) {
      if (value === "") {
        // Start of nested object
        currentKey = key;
        nestedObj = {};
        currentIndent = 2; // expect 2-space indent
        frontmatter[key] = nestedObj;
      } else {
        currentKey = null;
        nestedObj = null;
        frontmatter[key] = value;
      }
    } else if (nestedObj && currentKey && indent >= currentIndent) {
      nestedObj[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Extract extraction config from SKILL.md body using LLM
 */
async function extractConfigFromBody(
  body: string,
  metadata: SkillMetadata,
  configOverride?: ModelsConfig
): Promise<ExtractionConfig> {
  const prompt = `Parse the following extraction instructions and return a JSON configuration object.

Instructions:
${body}

Return a JSON object matching this schema:
{
  "tier": "html" or "spa",
  "listPage": {
    "articleLinkSelector": "CSS selector for article links",
    "titleSelector": "optional CSS selector for title",
    "dateSelector": "optional CSS selector for date",
    "maxArticles": optional number
  },
  "articlePage": {
    "contentSelector": "optional CSS selector for content",
    "titleSelector": "optional CSS selector for title",
    "dateSelector": "optional CSS selector for date",
    "fallbackToReadability": true or false
  },
  "pagination": {
    "nextLinkSelector": "optional CSS selector for next page",
    "maxPages": optional number
  }
}

Use the tier "${metadata.tier}" from metadata if not specified.
Respond ONLY with valid JSON.`;

  const raw = await callLlm("skill", prompt, configOverride);
  
  // Parse JSON from response
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1]?.trim() ?? raw;
  const parsed = JSON.parse(jsonStr);

  // Build config with safe defaults
  const listPage = parsed.listPage ?? {};
  const articlePage = parsed.articlePage ?? null;
  const pagination = parsed.pagination ?? null;
  
  return extractionConfigSchema.parse({
    tier: parsed.tier ?? metadata.tier,
    listPage: {
      articleLinkSelector: listPage.articleLinkSelector ?? "a[href]",
      titleSelector: listPage.titleSelector,
      dateSelector: listPage.dateSelector,
      maxArticles: listPage.maxArticles,
    },
    articlePage,
    pagination,
  });
}

/**
 * Parse a SKILL.md file into a structured skill object
 */
export async function parseSkillFile(
  skillPath: string,
  configOverride?: ModelsConfig
): Promise<ParsedSkill> {
  const content = fs.readFileSync(skillPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  const name = frontmatter.name as string;
  const description = frontmatter.description as string;
  const metadataRaw = frontmatter.metadata as Record<string, unknown>;

  if (!name || !description) {
    throw new Error("SKILL.md missing required name or description");
  }

  const metadata = skillMetadataSchema.parse({
    version: metadataRaw?.version ?? "1",
    generatedAt: metadataRaw?.generatedAt ?? new Date().toISOString(),
    sourceId: metadataRaw?.sourceId ?? "0",
    tier: metadataRaw?.tier ?? "html",
    homepageUrl: metadataRaw?.homepageUrl ?? "",
  });

  const extraction = await extractConfigFromBody(body, metadata, configOverride);

  return {
    name,
    description,
    metadata,
    extraction,
    rawContent: content,
  };
}

// ---------------------------------------------------------------------------
// Skill file paths
// ---------------------------------------------------------------------------

export function getSkillsDir(): string {
  const { userDataPath } = getDataPaths();
  return path.join(userDataPath, "sources-skills");
}

export function getSkillPath(sourceId: number): string {
  return path.join(getSkillsDir(), String(sourceId), "SKILL.md");
}

export function skillExists(sourceId: number): boolean {
  return fs.existsSync(getSkillPath(sourceId));
}

// ---------------------------------------------------------------------------
// Agentic Skill Generation - Tools and Agent
// ---------------------------------------------------------------------------

/**
 * Fetch HTML from a URL (static or with browser)
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
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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
  tag: string;
  classes: string[];
  outerHtml: string;
}> {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;
  const elements = doc.querySelectorAll(selector);

  const results: Array<{ text: string; href?: string; tag: string; classes: string[]; outerHtml: string }> = [];
  elements.forEach((el: Element) => {
    const anchor = el as HTMLAnchorElement;
    results.push({
      text: el.textContent?.trim().slice(0, 200) ?? "",
      href: anchor.href || undefined,
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList),
      outerHtml: el.outerHTML.slice(0, 500)
    });
  });

  return results;
}

/**
 * Get HTML structure summary for a page
 */
function getHtmlStructure(html: string, baseUrl: string): {
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
    content: article.textContent?.slice(0, 1000) ?? "",
    excerpt: article.excerpt ?? ""
  };
}

// Tool schemas for the agentic skill generator
const fetchPageSchema = z.object({
  url: z.string().describe("The URL to fetch"),
  spa: z.boolean().optional().describe("Use headless browser for JavaScript-heavy sites")
});

const runSelectorSchema = z.object({
  selector: z.string().describe("CSS selector to run on the cached page"),
  limit: z.number().optional().describe("Maximum number of results to return (default 20)")
});

const getStructureSchema = z.object({});

const testArticleLinkSchema = z.object({
  url: z.string().describe("Article URL to test"),
  spa: z.boolean().optional().describe("Use headless browser")
});

const finishSkillSchema = z.object({
  tier: z.enum(["html", "spa"]).describe("Whether the site requires JavaScript rendering"),
  articleLinkSelector: z.string().describe("CSS selector to find article links on the list page"),
  titleSelector: z.string().optional().describe("CSS selector for article title (on list or article page)"),
  dateSelector: z.string().optional().describe("CSS selector for article date"),
  contentSelector: z.string().optional().describe("CSS selector for article content"),
  fallbackToReadability: z.boolean().describe("Whether to use Readability.js as fallback for content extraction"),
  notes: z.string().optional().describe("Any special notes about extracting from this site")
});

/**
 * Create tools for the skill generator agent
 */
function createSkillGeneratorTools(
  homepageUrl: string,
  pageCache: Map<string, string>,
  result: { skill: SkillDiscovery | null }
) {
  return {
    fetch_page: tool({
      description: "Fetch HTML content from a URL. Use spa=true for JavaScript-heavy sites that require browser rendering.",
      inputSchema: zodSchema(fetchPageSchema),
      execute: async (input) => {
        try {
          console.log(`[skill-generator] fetch_page: ${input.url} (spa=${input.spa ?? false})`);
          const html = await fetchPage(input.url, input.spa ?? false);
          pageCache.set(input.url, html);
          return { success: true, length: html.length, cached: true };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),

    get_structure: tool({
      description: "Get an overview of the HTML structure of the homepage (main sections, element counts, etc.)",
      inputSchema: zodSchema(getStructureSchema),
      execute: async () => {
        const html = pageCache.get(homepageUrl);
        if (!html) {
          return { error: "Homepage not cached. Call fetch_page first." };
        }
        console.log(`[skill-generator] get_structure`);
        return getHtmlStructure(html, homepageUrl);
      }
    }),

    run_selector: tool({
      description: "Run a CSS selector on the cached homepage to find elements. Returns text, href, tag, classes for each match.",
      inputSchema: zodSchema(runSelectorSchema),
      execute: async (input) => {
        const html = pageCache.get(homepageUrl);
        if (!html) {
          return { error: "Homepage not cached. Call fetch_page first." };
        }
        try {
          console.log(`[skill-generator] run_selector: ${input.selector}`);
          let results = runSelector(html, input.selector, homepageUrl);
          if (input.limit && results.length > input.limit) {
            results = results.slice(0, input.limit);
          }
          // Filter to show article-like links
          const articleLinks = results.filter(r => {
            if (!r.href) return false;
            try {
              const url = new URL(r.href);
              const origin = new URL(homepageUrl).origin;
              if (url.origin !== origin) return false;
              if (url.pathname === "/" || url.pathname === "") return false;
              return true;
            } catch {
              return false;
            }
          });
          return {
            totalMatches: results.length,
            articleLikeLinks: articleLinks.length,
            results: results.slice(0, input.limit ?? 20)
          };
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),

    test_article_link: tool({
      description: "Fetch an article page and test if content can be extracted with Readability.js",
      inputSchema: zodSchema(testArticleLinkSchema),
      execute: async (input) => {
        try {
          console.log(`[skill-generator] test_article_link: ${input.url}`);
          const html = await fetchPage(input.url, input.spa ?? false);
          pageCache.set(input.url, html);

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
          return { error: error instanceof Error ? error.message : String(error) };
        }
      }
    }),

    finish_skill: tool({
      description: "Finalize the skill configuration after discovering the correct selectors. Call this when you have found working selectors.",
      inputSchema: zodSchema(finishSkillSchema),
      execute: async (input) => {
        console.log(`[skill-generator] finish_skill: tier=${input.tier}, selector=${input.articleLinkSelector}`);
        result.skill = {
          tier: input.tier,
          articleLinkSelector: input.articleLinkSelector,
          titleSelector: input.titleSelector,
          dateSelector: input.dateSelector,
          contentSelector: input.contentSelector,
          fallbackToReadability: input.fallbackToReadability,
          notes: input.notes
        };
        return { success: true, message: "Skill configuration saved" };
      }
    })
  };
}

interface SkillDiscovery {
  tier: "html" | "spa";
  articleLinkSelector: string;
  titleSelector?: string;
  dateSelector?: string;
  contentSelector?: string;
  fallbackToReadability: boolean;
  notes?: string;
}

/**
 * Use an AI agent to discover the extraction selectors for a website
 */
async function discoverSkillWithAgent(
  homepageUrl: string,
  sourceName: string,
  configOverride?: ModelsConfig
): Promise<SkillDiscovery> {
  console.log(`[skill-generator] Starting agentic skill discovery for ${sourceName}`);

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

  // Page cache and result container
  const pageCache = new Map<string, string>();
  const result: { skill: SkillDiscovery | null } = { skill: null };

  // Create tools
  const tools = createSkillGeneratorTools(homepageUrl, pageCache, result);

  const systemPrompt = `You are a web scraping expert. Your job is to analyze a website and discover the CSS selectors needed to extract articles from it.

You have these tools available:
- fetch_page: Fetch HTML from a URL (use spa=true for JavaScript-heavy sites)
- get_structure: Get an overview of the page structure
- run_selector: Test a CSS selector and see what elements it matches
- test_article_link: Test if an article can be extracted with Readability.js
- finish_skill: Save the final selector configuration

Your goal is to find:
1. A CSS selector that finds article links on the homepage/list page
2. Whether the site needs JavaScript rendering (spa) or works with static HTML
3. Optional: selectors for titles, dates, and content

Strategy:
1. First fetch the homepage (try without spa first)
2. Use get_structure to understand the page layout
3. Try different selectors to find article links:
   - Look for <article> elements with links inside
   - Look for elements with classes containing "article", "post", "story", "card"
   - Look for links in main/section elements
   - Check for date patterns in URLs (like /2024/01/15/)
4. Test at least one article link to verify Readability.js works
5. If static fetch finds no articles, retry with spa=true
6. Call finish_skill when you've found working selectors

Be thorough but efficient. Try multiple selector strategies if the first ones don't work.`;

  const userPrompt = `Discover the extraction selectors for:
- Website: ${homepageUrl}
- Name: ${sourceName}

Find the CSS selector that will extract article links from this website. Start by fetching the homepage.`;

  try {
    const agentConfig = getAgentConfig();
    const maxSteps = agentConfig.skillGeneratorMaxSteps ?? 100;

    const agentResult = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      tools,
      stopWhen: stepCountIs(maxSteps),
      temperature: 0.1
    });

    console.log(`[skill-generator] Agent completed with ${agentResult.steps.length} steps (max: ${maxSteps})`);

    if (!result.skill) {
      throw new Error("Agent did not produce a skill configuration. The website may be too complex or require special handling.");
    }

    return result.skill;

  } catch (error) {
    console.error("[skill-generator] Agent error:", error);
    throw error;
  }
}

/**
 * Generate SKILL.md content from discovered configuration
 */
function generateSkillContent(
  sourceId: number,
  sourceName: string,
  homepageUrl: string,
  discovery: SkillDiscovery
): string {
  const skillName = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-extractor";

  let content = `---
name: ${skillName}
description: Extracts articles from ${sourceName}.
metadata:
  version: "1"
  generatedAt: "${new Date().toISOString()}"
  sourceId: "${sourceId}"
  tier: "${discovery.tier}"
  homepageUrl: "${homepageUrl}"
---

# ${sourceName} Extraction Skill

## List Page

Fetch the homepage: \`${homepageUrl}\`
${discovery.tier === "spa" ? "\n**Note:** This site requires JavaScript rendering. Use spa=true when fetching." : ""}

### Article Links

Use the following CSS selector to find article links:

\`\`\`
${discovery.articleLinkSelector}
\`\`\`
`;

  if (discovery.titleSelector) {
    content += `
### Title Selector

\`\`\`
${discovery.titleSelector}
\`\`\`
`;
  }

  if (discovery.dateSelector) {
    content += `
### Date Selector

\`\`\`
${discovery.dateSelector}
\`\`\`
`;
  }

  content += `
## Article Page
`;

  if (discovery.contentSelector) {
    content += `
### Content Selector

\`\`\`
${discovery.contentSelector}
\`\`\`
`;
  }

  content += `
### Fallback

${discovery.fallbackToReadability ? "Use Readability.js to extract article content if the selector fails." : "Do not use Readability.js fallback."}
`;

  if (discovery.notes) {
    content += `
## Notes

${discovery.notes}
`;
  }

  return content;
}

/**
 * Validate a generated skill by testing the selector
 */
async function validateSkill(
  skillContent: string,
  homepageUrl: string,
  discovery: SkillDiscovery,
  configOverride?: ModelsConfig
): Promise<{ valid: boolean; error?: string; sampleCount: number }> {
  // Parse the skill to check syntax
  const tempPath = path.join(getSkillsDir(), "_temp_validation", "SKILL.md");
  const tempDir = path.dirname(tempPath);

  try {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(tempPath, skillContent);

    await parseSkillFile(tempPath, configOverride);

    // Fetch homepage and validate selector
    const html = await fetchPage(homepageUrl, discovery.tier === "spa");
    const dom = new JSDOM(html, { url: homepageUrl });
    const doc = dom.window.document;

    const nodes = Array.from(doc.querySelectorAll(discovery.articleLinkSelector));
    const validLinks = nodes.filter((node) => {
      const anchor = node as HTMLAnchorElement;
      return Boolean(anchor.href && anchor.textContent?.trim());
    });

    if (validLinks.length < 1) {
      return {
        valid: false,
        error: `Selector "${discovery.articleLinkSelector}" returned no links.`,
        sampleCount: 0,
      };
    }

    // Test extraction on one article
    const firstLink = validLinks[0] as HTMLAnchorElement;
    const testUrl = firstLink.href;

    try {
      const testHtml = await fetchPage(testUrl, discovery.tier === "spa");
      const testDom = new JSDOM(testHtml, { url: testUrl });
      const testDoc = testDom.window.document;

      let contentFound = false;
      if (discovery.contentSelector) {
        const contentEl = testDoc.querySelector(discovery.contentSelector);
        if (contentEl?.textContent?.trim()) {
          contentFound = true;
        }
      }

      if (!contentFound && discovery.fallbackToReadability) {
        const reader = new Readability(testDoc);
        const result = reader.parse();
        contentFound = Boolean(result?.textContent?.trim());
      }

      if (!contentFound) {
        return { valid: false, error: "Could not extract content from test article", sampleCount: 1 };
      }
    } catch (fetchErr) {
      return {
        valid: false,
        error: `Failed to fetch test article: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        sampleCount: 0,
      };
    }

    return { valid: true, sampleCount: 1 };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
      sampleCount: 0,
    };
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ---------------------------------------------------------------------------
// Main skill generation entry point
// ---------------------------------------------------------------------------

export interface SkillGenerationResult {
  success: boolean;
  skillPath?: string;
  error?: string;
  validationResult?: {
    valid: boolean;
    error?: string;
    sampleCount: number;
  };
}

/**
 * Generate an extraction skill for a source
 */
export async function generateSkill(
  sourceId: number,
  homepageUrl: string,
  sourceName: string,
  configOverride?: ModelsConfig
): Promise<SkillGenerationResult> {
  console.log(`[skill-generator] Generating skill for source ${sourceId}: ${sourceName}`);

  try {
    // 1. Use AI agent to discover selectors
    console.log(`[skill-generator] Starting agentic discovery for: ${homepageUrl}`);
    const discovery = await discoverSkillWithAgent(homepageUrl, sourceName, configOverride);
    console.log(`[skill-generator] Agent discovered: tier=${discovery.tier}, selector=${discovery.articleLinkSelector}`);

    // 2. Generate SKILL.md content from discovery
    console.log(`[skill-generator] Generating SKILL.md content...`);
    const skillContent = generateSkillContent(sourceId, sourceName, homepageUrl, discovery);

    // 3. Validate the skill
    console.log(`[skill-generator] Validating skill...`);
    const validationResult = await validateSkill(skillContent, homepageUrl, discovery, configOverride);

    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error ?? "Skill validation failed",
        validationResult,
      };
    }

    // 4. Save the skill
    const skillDir = path.join(getSkillsDir(), String(sourceId));
    const skillPath = path.join(skillDir, "SKILL.md");
    
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(skillPath, skillContent);
    console.log(`[skill-generator] Saved skill to ${skillPath}`);

    // 5. Update source in database
    const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
    const newVersion = (source?.skillVersion ?? 0) + 1;

    db.update(sources)
      .set({
        hasSkill: true,
        skillVersion: newVersion,
        skillGeneratedAt: new Date(),
        scrapingStrategy: "skill",
      })
      .where(eq(sources.id, sourceId))
      .run();

    console.log(`[skill-generator] Updated source ${sourceId} with skill version ${newVersion}`);

    return {
      success: true,
      skillPath,
      validationResult,
    };
  } catch (err) {
    console.error(`[skill-generator] Failed to generate skill for source ${sourceId}:`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Regenerate an existing skill
 */
export async function regenerateSkill(
  sourceId: number,
  configOverride?: ModelsConfig
): Promise<SkillGenerationResult> {
  const source = db.select().from(sources).where(eq(sources.id, sourceId)).get();
  if (!source) {
    return { success: false, error: `Source ${sourceId} not found` };
  }

  return generateSkill(sourceId, source.url, source.name, configOverride);
}
