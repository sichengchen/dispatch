/**
 * Shared types for agent tools
 */

import type { Page, Browser } from "playwright";

/**
 * Cache for fetched pages - maps URL to HTML content
 */
export type PageCache = Map<string, string>;

/**
 * Browser session for Playwright-based tools
 */
export interface BrowserSession {
  browser: Browser;
  page: Page;
}

/**
 * Context shared across all tools in an agent run
 */
export interface ToolContext {
  /** Cache of fetched pages (URL -> HTML) */
  pageCache: PageCache;
  /** Base URL for the source being processed */
  baseUrl: string;
  /** Whether to continue on errors or throw */
  continueOnError: boolean;
  /** Optional browser session for SPA/interactive tools */
  browserSession?: BrowserSession;
}

/**
 * Result from selector-based tools
 */
export interface SelectorResult {
  text: string;
  href?: string;
  html: string;
  tag?: string;
  classes?: string[];
  attributes?: Record<string, string>;
}

/**
 * Result from XPath queries
 */
export interface XPathResult {
  text: string;
  href?: string;
  html: string;
  nodeType: string;
}

/**
 * Result from regex extraction
 */
export interface RegexMatch {
  full: string;
  groups: string[];
  index: number;
}

/**
 * Readable content extracted by Readability.js
 */
export interface ReadableContent {
  title: string;
  content: string;
  excerpt: string;
}

/**
 * Extracted article data
 */
export interface ExtractedArticle {
  url: string;
  title: string;
  content: string;
  excerpt?: string;
  publishedDate?: Date | null;
  author?: string;
}

/**
 * Stats tracked during extraction
 */
export interface ExtractionStats {
  inserted: number;
  skipped: number;
  failed: number;
}
