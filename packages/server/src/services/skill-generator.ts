import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { chromium } from "playwright";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { callLlm } from "./llm";
import { type ModelsConfig } from "@dispatch/lib";
import { getModelsConfig, getDataPaths } from "./settings";

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
// Homepage analysis and skill generation
// ---------------------------------------------------------------------------

type SelectorHints = {
  containerSelector?: string;
  linkSelector?: string;
  titleSelector?: string;
  dateSelector?: string;
};

interface PageAnalysis {
  html: string;
  url: string;
  tier: "html" | "spa";
  articleLinks: Array<{ href: string; text: string }>;
  selectorHints?: SelectorHints;
}

function pickMostCommonClass(
  elements: Element[],
  minShare = 0.4
): string | undefined {
  const counts = new Map<string, number>();
  elements.forEach((el) => {
    el.classList.forEach((cls) => {
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
    });
  });
  let bestCls: string | undefined;
  let bestCount = 0;
  for (const [cls, count] of counts) {
    if (!bestCls || count > bestCount) {
      bestCls = cls;
      bestCount = count;
    }
  }
  if (!bestCls) return undefined;
  if (bestCount / Math.max(1, elements.length) < minShare) return undefined;
  return bestCls;
}

function inferListSelectors(doc: Document, baseUrl: string): SelectorHints | undefined {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    origin = baseUrl;
  }

  const anchors = Array.from(doc.querySelectorAll("a[href]")).filter((el) => {
    const anchor = el as HTMLAnchorElement;
    if (!anchor.href || !anchor.textContent?.trim()) return false;
    if (!anchor.href.startsWith(origin)) return false;
    try {
      const pathname = new URL(anchor.href).pathname;
      return /\/20\d{2}\/\d{2}\/\d{2}\//.test(pathname);
    } catch {
      return false;
    }
  });

  if (anchors.length < 3) return undefined;

  const linkClass = pickMostCommonClass(anchors, 0.35);
  const linkSelector = linkClass ? `a.${linkClass}` : "a[href]";

  const containerCandidates: Element[] = [];
  anchors.forEach((anchor) => {
    let current = anchor.parentElement;
    while (current && current !== doc.body) {
      if (current.tagName.toLowerCase() === "li" || current.tagName.toLowerCase() === "article") {
        containerCandidates.push(current);
        return;
      }
      if (current.classList.length > 0) {
        containerCandidates.push(current);
        return;
      }
      current = current.parentElement;
    }
  });

  const containerClass = pickMostCommonClass(containerCandidates, 0.3);
  const containerSelector = containerClass
    ? (containerCandidates[0]?.tagName
        ? `${containerCandidates[0].tagName.toLowerCase()}.${containerClass}`
        : `.${containerClass}`)
    : undefined;

  const timeElements: Element[] = [];
  containerCandidates.forEach((container) => {
    const time = container.querySelector("time[datetime]");
    if (time) timeElements.push(time);
  });

  const timeClass = pickMostCommonClass(timeElements, 0.35);
  const dateSelector = timeElements.length
    ? (timeClass ? `time.${timeClass}` : "time[datetime]")
    : undefined;

  return {
    containerSelector,
    linkSelector,
    titleSelector: linkSelector,
    dateSelector,
  };
}

/**
 * Fetch and analyze a homepage to understand its structure
 */
async function analyzeHomepage(url: string): Promise<PageAnalysis> {
  // Try static fetch first
  let html: string;
  let tier: "html" | "spa" = "html";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Dispatch/1.0; +https://dispatch.app)"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    // Fall back to Playwright for SPAs
    tier = "spa";
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      html = await page.content();
    } finally {
      await browser.close();
    }
  }

  // Extract potential article links
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const links: Array<{ href: string; text: string }> = [];

  // Common article link patterns
  const selectors = [
    "article a",
    "a[href*='/post']",
    "a[href*='/article']",
    "a[href*='/blog']",
    "a[href*='/news']",
    ".post a",
    ".article a",
    ".entry a",
    "h2 a",
    "h3 a",
  ];

  for (const selector of selectors) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el: Element) => {
        const anchor = el as HTMLAnchorElement;
        if (anchor.href && anchor.textContent?.trim()) {
          links.push({
            href: anchor.href,
            text: anchor.textContent.trim().slice(0, 100),
          });
        }
      });
    } catch {
      // Selector might be invalid
    }
  }

  // Dedupe links
  const seen = new Set<string>();
  const uniqueLinks = links.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });

  const selectorHints = inferListSelectors(doc, url);

  return {
    html,
    url,
    tier,
    articleLinks: uniqueLinks.slice(0, 20),
    selectorHints,
  };
}

/**
 * Use LLM to generate SKILL.md content from homepage analysis
 */
async function generateSkillContent(
  sourceId: number,
  sourceName: string,
  analysis: PageAnalysis,
  configOverride?: ModelsConfig
): Promise<string> {
  const config = configOverride ?? getModelsConfig();

  // Truncate HTML for prompt
  const htmlSample = analysis.html.slice(0, 15000);
  const linksSample = analysis.articleLinks
    .slice(0, 10)
    .map((l) => `- ${l.text}: ${l.href}`)
    .join("\n");
  const selectorHints = analysis.selectorHints;
  const selectorHintText = selectorHints
    ? `\nSelector hints (derived from the HTML sample):\n- Container selector: ${selectorHints.containerSelector ?? "unknown"}\n- Link selector: ${selectorHints.linkSelector ?? "unknown"}\n- Title selector: ${selectorHints.titleSelector ?? "unknown"}\n- Date selector: ${selectorHints.dateSelector ?? "unknown"}\nUse these selectors if they match the HTML sample. Do not invent selectors that are not present in the HTML.`
    : "";

  const prompt = `Analyze this webpage and generate a SKILL.md file for extracting articles.

Website URL: ${analysis.url}
Site Name: ${sourceName}

Sample article links found:
${linksSample}

HTML sample (truncated):
\`\`\`html
${htmlSample}
\`\`\`
${selectorHintText}

Generate a SKILL.md file with:
1. YAML frontmatter with name, description, and metadata (version, generatedAt, sourceId, tier, homepageUrl)
2. Markdown instructions for extracting articles including:
   - List Page section: CSS selectors for finding article links, titles, dates
   - Article Page section: CSS selectors for content extraction, with fallback to Readability
   - Pagination section if applicable

The skill name should be lowercase-hyphenated (e.g., "${sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-extractor").
The tier should be "${analysis.tier}".

Return ONLY the complete SKILL.md content, starting with ---.`;

  const raw = await callLlm("skill", prompt, config);
  
  // Clean up the response
  let content = raw.trim();
  
  // Remove markdown code fences if present
  if (content.startsWith("```")) {
    content = content.replace(/^```(?:markdown|md)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  
  // Ensure it starts with frontmatter
  if (!content.startsWith("---")) {
    content = `---
name: ${sourceName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-extractor
description: Extracts articles from ${sourceName}.
metadata:
  version: "1"
  generatedAt: "${new Date().toISOString()}"
  sourceId: "${sourceId}"
  tier: "${analysis.tier}"
  homepageUrl: "${analysis.url}"
---

${content}`;
  }

  return content;
}

/**
 * Validate a skill by testing extraction on sample articles
 */
async function validateSkill(
  skillContent: string,
  analysis: PageAnalysis,
  configOverride?: ModelsConfig
): Promise<{ valid: boolean; error?: string; sampleCount: number }> {
  // Parse the skill to check syntax
  const tempPath = path.join(getSkillsDir(), "_temp_validation", "SKILL.md");
  const tempDir = path.dirname(tempPath);
  
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(tempPath, skillContent);
    
    const skill = await parseSkillFile(tempPath, configOverride);

    // Validate list page selectors against homepage HTML
    try {
      const listDom = new JSDOM(analysis.html, { url: analysis.url });
      const listDoc = listDom.window.document;
      const selector = skill.extraction.listPage.articleLinkSelector;
      const nodes = Array.from(listDoc.querySelectorAll(selector));
      const validLinks = nodes.filter((node) => {
        const anchor = node as HTMLAnchorElement;
        return Boolean(anchor.href && anchor.textContent?.trim());
      });
      const expectedMin = Math.max(1, Math.min(3, analysis.articleLinks.length));
      if (validLinks.length < expectedMin) {
        return {
          valid: false,
          error: `List selector "${selector}" returned ${validLinks.length} links (expected at least ${expectedMin}).`,
          sampleCount: 0,
        };
      }
    } catch (listErr) {
      return {
        valid: false,
        error: `Failed to validate list selectors: ${
          listErr instanceof Error ? listErr.message : String(listErr)
        }`,
        sampleCount: 0,
      };
    }
    
    // Test extraction on at least one article
    if (analysis.articleLinks.length === 0) {
      return { valid: false, error: "No article links found on homepage", sampleCount: 0 };
    }

    // Try to fetch and extract one article
    const testUrl = analysis.articleLinks[0].href;
    let testHtml: string;

    try {
      if (skill.extraction.tier === "spa") {
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(testUrl, { waitUntil: "networkidle", timeout: 30000 });
          testHtml = await page.content();
        } finally {
          await browser.close();
        }
      } else {
        const res = await fetch(testUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        testHtml = await res.text();
      }
    } catch (fetchErr) {
      return {
        valid: false,
        error: `Failed to fetch test article: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        sampleCount: 0,
      };
    }

    // Try to extract content
    const dom = new JSDOM(testHtml, { url: testUrl });
    const doc = dom.window.document;

    let contentFound = false;
    if (skill.extraction.articlePage?.contentSelector) {
      const contentEl = doc.querySelector(skill.extraction.articlePage.contentSelector);
      if (contentEl?.textContent?.trim()) {
        contentFound = true;
      }
    }

    if (!contentFound && skill.extraction.articlePage?.fallbackToReadability !== false) {
      const reader = new Readability(doc);
      const result = reader.parse();
      contentFound = Boolean(result?.textContent?.trim());
    }

    if (!contentFound) {
      return { valid: false, error: "Could not extract content from test article", sampleCount: 1 };
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
    // 1. Analyze the homepage
    console.log(`[skill-generator] Analyzing homepage: ${homepageUrl}`);
    const analysis = await analyzeHomepage(homepageUrl);
    console.log(`[skill-generator] Found ${analysis.articleLinks.length} potential article links, tier=${analysis.tier}`);

    if (analysis.articleLinks.length === 0) {
      return {
        success: false,
        error: "Could not find any article links on the homepage. Please check the URL.",
      };
    }

    // 2. Generate SKILL.md content
    console.log(`[skill-generator] Generating SKILL.md content...`);
    const skillContent = await generateSkillContent(sourceId, sourceName, analysis, configOverride);

    // 3. Validate the skill
    console.log(`[skill-generator] Validating skill...`);
    const validationResult = await validateSkill(skillContent, analysis, configOverride);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceAny = source as any;
    const newVersion = (sourceAny?.skillVersion ?? 0) + 1;

    db.update(sources)
      .set({
        hasSkill: true,
        skillVersion: newVersion,
        skillGeneratedAt: new Date(),
        scrapingStrategy: "skill" as "rss" | "html" | "spa" | "skill",
      } as any)
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
