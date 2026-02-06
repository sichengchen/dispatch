/**
 * Shared tool library for agents
 *
 * Re-exports all tools and provides convenience functions for creating tool sets.
 */

// Types
export * from "./types";

// Page tools
export {
  fetchPage,
  getHtmlStructure,
  fetchPageSchema,
  getStructureSchema,
  createFetchPageTool,
  createGetStructureTool
} from "./page-tools";

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
} from "./selector-tools";

// Content tools
export {
  extractReadable,
  parseDate,
  extractReadableSchema,
  parseDateSchema,
  testArticleLinkSchema,
  createExtractReadableTool,
  createParseDateTool,
  createTestArticleLinkTool
} from "./content-tools";

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
} from "./browser-tools";

// Chat tools
export {
  presentChoicesSchema,
  finishConversationSchema,
  createPresentChoicesTool,
  createFinishConversationTool,
  createChatToolSet
} from "./chat-tools";

// ---------------------------------------------------------------------------
// Tool context factory
// ---------------------------------------------------------------------------

import type { ToolContext, PageCache } from "./types";

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

import { createFetchPageTool, createGetStructureTool } from "./page-tools";
import { createRunSelectorTool, createRunXPathTool, createRunRegexTool } from "./selector-tools";
import { createExtractReadableTool, createParseDateTool, createTestArticleLinkTool } from "./content-tools";
import { createBrowserTools } from "./browser-tools";

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
