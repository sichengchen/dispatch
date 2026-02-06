import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { generateText, stepCountIs, tool, zodSchema } from "ai";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { callLlm } from "./llm";
import { getModelConfig, createProviderMap, type ModelsConfig } from "@dispatch/lib";
import { getModelsConfig, getProviders, getDataPaths, getAgentConfig } from "./settings";
import {
  createToolContext,
  createSkillGeneratorToolSet,
  closeBrowserSession,
  fetchPage
} from "./agents/tools";
import type { ToolContext } from "./agents/tools";

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

const finishSkillSchema = z.object({
  tier: z.enum(["html", "spa"]).describe("Whether the site requires JavaScript rendering"),
  instructionBody: z.string().describe("Markdown instructions for extracting articles from this site. Write detailed, clear instructions including selectors, patterns, and any special handling needed."),
  hints: z.object({
    articleLinkSelector: z.string().optional().describe("Primary CSS selector for article links (for validation)"),
    urlPattern: z.string().optional().describe("Regex pattern that article URLs should match")
  }).optional().describe("Optional structured hints for validation")
});

/**
 * Create tools for the skill generator agent
 */
function createSkillGeneratorAgentTools(
  ctx: ToolContext,
  result: { skill: SkillDiscovery | null }
) {
  // Get shared tools
  const sharedTools = createSkillGeneratorToolSet(ctx);

  // Add the finish_skill tool specific to skill generation
  return {
    ...sharedTools,
    finish_skill: tool({
      description: "Finalize the skill by writing extraction instructions. Write clear, detailed markdown instructions that explain HOW to extract articles. Include specific selectors (CSS/XPath), patterns, and any special handling needed.",
      inputSchema: zodSchema(finishSkillSchema),
      execute: async (input) => {
        console.log(`[skill-generator] finish_skill: tier=${input.tier}`);
        result.skill = {
          tier: input.tier,
          instructionBody: input.instructionBody,
          hints: input.hints
        };
        return { success: true, message: "Skill instructions saved" };
      }
    })
  };
}

interface SkillDiscovery {
  tier: "html" | "spa";
  instructionBody: string;
  hints?: {
    articleLinkSelector?: string;
    urlPattern?: string;
  };
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

  // Create tool context and result container
  const ctx = createToolContext({ baseUrl: homepageUrl, continueOnError: true });
  const result: { skill: SkillDiscovery | null } = { skill: null };

  // Create tools
  const tools = createSkillGeneratorAgentTools(ctx, result);

  const systemPrompt = `You are a web scraping expert. Your job is to analyze a website and write detailed extraction instructions.

You have these tools available:
- fetch_page: Fetch HTML from a URL (use spa=true for JavaScript-heavy sites)
- get_structure: Get an overview of the page structure
- run_selector: Test a CSS selector
- run_xpath: Test an XPath expression (useful for complex DOM traversal)
- run_regex: Test a regular expression pattern
- test_article_link: Test if an article can be extracted with Readability.js
- browser_navigate, browser_click, browser_scroll, browser_wait_for, browser_get_html: Browser tools for SPA sites
- finish_skill: Save your extraction instructions

Your goal is to write comprehensive extraction instructions that will guide an extraction agent.

Strategy:
1. First fetch the homepage (try without spa first)
2. Use get_structure to understand the page layout
3. Try different selectors to find article links:
   - CSS selectors (preferred): article a, [class*='post'] a, etc.
   - XPath for complex patterns: //article//a[@href]
   - Regex for URL patterns: /articles/\\d{4}/
4. Test at least one article link to verify Readability.js works
5. If static fetch finds no articles, try browser tools for SPA sites
6. Call finish_skill with detailed markdown instructions

When you call finish_skill, write the instructionBody as detailed markdown that:
1. Explains the page structure and layout you observed
2. Provides specific selectors (CSS and/or XPath) for finding article links
3. Describes any URL patterns to filter or validate links
4. Explains how to extract article content (Readability, selectors, etc.)
5. Notes any special handling needed (pagination, lazy loading, etc.)

Be thorough - the extraction agent will only have your instructions to work with.`;

  const userPrompt = `Analyze this website and write extraction instructions:
- Website: ${homepageUrl}
- Name: ${sourceName}

Start by fetching the homepage, then discover how to extract articles. When done, call finish_skill with comprehensive markdown instructions.`;

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
  } finally {
    // Cleanup browser session if used
    await closeBrowserSession(ctx);
  }
}

/**
 * Generate SKILL.md content from discovered configuration
 *
 * The frontmatter is system-controlled, but the body is LLM-authored.
 */
function generateSkillContent(
  sourceId: number,
  sourceName: string,
  homepageUrl: string,
  discovery: SkillDiscovery
): string {
  const skillName = sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-extractor";

  // Only frontmatter is system-generated
  const frontmatter = `---
name: ${skillName}
description: Extracts articles from ${sourceName}.
metadata:
  version: "1"
  generatedAt: "${new Date().toISOString()}"
  sourceId: "${sourceId}"
  tier: "${discovery.tier}"
  homepageUrl: "${homepageUrl}"
---

`;

  // Body is LLM-authored
  return frontmatter + discovery.instructionBody;
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

    // Parse skill to verify syntax and extract config
    const parsedSkill = await parseSkillFile(tempPath, configOverride);

    // Get selector from hints or parsed extraction config
    const articleLinkSelector = discovery.hints?.articleLinkSelector
      ?? parsedSkill.extraction.listPage.articleLinkSelector;

    if (!articleLinkSelector) {
      return {
        valid: false,
        error: "No article link selector found in skill",
        sampleCount: 0,
      };
    }

    // Fetch homepage and validate selector
    const html = await fetchPage(homepageUrl, discovery.tier === "spa");
    const dom = new JSDOM(html, { url: homepageUrl });
    const doc = dom.window.document;

    const nodes = Array.from(doc.querySelectorAll(articleLinkSelector));
    const validLinks = nodes.filter((node) => {
      const anchor = node as HTMLAnchorElement;
      return Boolean(anchor.href && anchor.textContent?.trim());
    });

    if (validLinks.length < 1) {
      return {
        valid: false,
        error: `Selector "${articleLinkSelector}" returned no links.`,
        sampleCount: 0,
      };
    }

    // Test extraction on one article using Readability
    const firstLink = validLinks[0] as HTMLAnchorElement;
    const testUrl = firstLink.href;

    try {
      const testHtml = await fetchPage(testUrl, discovery.tier === "spa");
      const testDom = new JSDOM(testHtml, { url: testUrl });
      const testDoc = testDom.window.document;

      const reader = new Readability(testDoc);
      const result = reader.parse();
      const contentFound = Boolean(result?.textContent?.trim());

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
    console.log(`[skill-generator] Agent discovered: tier=${discovery.tier}, hints=${JSON.stringify(discovery.hints)}`);

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
