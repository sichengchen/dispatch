/**
 * Shared tool library for agents
 *
 * Re-exports all tools and provides convenience functions for creating tool sets.
 */

// Types
export * from "./types.js";

// Page tools
export {
  fetchPage,
  fetchMarkdown,
  getHtmlStructure,
  fetchPageSchema,
  getStructureSchema,
  createFetchPageTool,
  createGetStructureTool
} from "./page-tools.js";

// Selector tools
export {
  runSelector,
  runXPath,
  runRegex,
  runSelectorSchema,
  runXPathSchema,
  runRegexSchema,
  createRunSelectorTool,
  createRunXPathTool,
  createRunRegexTool
} from "./selector-tools.js";

// Content tools
export {
  extractReadable,
  extractReadableFromMarkdown,
  parseDate,
  extractReadableSchema,
  parseDateSchema,
  testArticleLinkSchema,
  createExtractReadableTool,
  createParseDateTool,
  createTestArticleLinkTool
} from "./content-tools.js";

// Browser tools
export {
  closeBrowserSession,
  browserNavigateSchema,
  browserClickSchema,
  browserTypeSchema,
  browserScrollSchema,
  browserWaitForSchema,
  browserScreenshotSchema,
  browserEvaluateSchema,
  browserGetHtmlSchema,
  createBrowserNavigateTool,
  createBrowserClickTool,
  createBrowserTypeTool,
  createBrowserScrollTool,
  createBrowserWaitForTool,
  createBrowserScreenshotTool,
  createBrowserEvaluateTool,
  createBrowserGetHtmlTool,
  createBrowserTools
} from "./browser-tools.js";

// Chat tools
export {
  presentChoicesSchema,
  finishConversationSchema,
  createPresentChoicesTool,
  createFinishConversationTool,
  createChatToolSet
} from "./chat-tools.js";

// ---------------------------------------------------------------------------
// Tool context factory
// ---------------------------------------------------------------------------

import type { ToolContext, PageCache } from "./types.js";

/**
 * Create a tool context for an agent run
 */
export function createToolContext(options: {
  baseUrl: string;
  continueOnError?: boolean;
  pageCache?: PageCache;
}): ToolContext {
  return {
    pageCache: options.pageCache ?? new Map(),
    baseUrl: options.baseUrl,
    continueOnError: options.continueOnError ?? true
  };
}

// ---------------------------------------------------------------------------
// Tool set factories
// ---------------------------------------------------------------------------

import { createFetchPageTool, createGetStructureTool } from "./page-tools.js";
import { createRunSelectorTool, createRunXPathTool, createRunRegexTool } from "./selector-tools.js";
import { createExtractReadableTool, createParseDateTool, createTestArticleLinkTool } from "./content-tools.js";
import { createBrowserTools } from "./browser-tools.js";

/**
 * Create shared tools used by both agents
 */
export function createSharedTools(ctx: ToolContext) {
  return {
    fetch_page: createFetchPageTool(ctx),
    run_selector: createRunSelectorTool(ctx),
    run_xpath: createRunXPathTool(ctx),
    run_regex: createRunRegexTool(ctx),
    extract_readable: createExtractReadableTool(ctx),
    parse_date: createParseDateTool(ctx),
    ...createBrowserTools(ctx)
  };
}

/**
 * Create tools for the skill generator agent
 */
export function createSkillGeneratorToolSet(ctx: ToolContext) {
  return {
    fetch_page: createFetchPageTool(ctx),
    get_structure: createGetStructureTool(ctx),
    run_selector: createRunSelectorTool(ctx),
    run_xpath: createRunXPathTool(ctx),
    run_regex: createRunRegexTool(ctx),
    test_article_link: createTestArticleLinkTool(ctx),
    ...createBrowserTools(ctx)
  };
}

/**
 * Create tools for the extraction agent
 */
export function createExtractionToolSet(ctx: ToolContext) {
  return {
    fetch_page: createFetchPageTool(ctx),
    run_selector: createRunSelectorTool(ctx),
    run_xpath: createRunXPathTool(ctx),
    run_regex: createRunRegexTool(ctx),
    extract_readable: createExtractReadableTool(ctx),
    parse_date: createParseDateTool(ctx),
    ...createBrowserTools(ctx)
  };
}
