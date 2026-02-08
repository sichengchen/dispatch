/**
 * Browser tools - Playwright-based tools for SPA and interactive pages
 *
 * These tools share a single browser session per extraction run for efficiency.
 */

import { z } from "zod";
import { chromium, type Browser, type Page } from "playwright";
import { tool, zodSchema } from "ai";
import type { ToolContext, BrowserSession } from "./types.js";

// ---------------------------------------------------------------------------
// Browser session management
// ---------------------------------------------------------------------------

/**
 * Get or create a browser session
 */
async function getOrCreateSession(ctx: ToolContext): Promise<BrowserSession> {
  if (ctx.browserSession) {
    return ctx.browserSession;
  }

  console.log("[tools] Launching browser session");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  ctx.browserSession = { browser, page };
  return ctx.browserSession;
}

/**
 * Close browser session if open
 */
export async function closeBrowserSession(ctx: ToolContext): Promise<void> {
  if (ctx.browserSession) {
    console.log("[tools] Closing browser session");
    await ctx.browserSession.browser.close();
    ctx.browserSession = undefined;
  }
}

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export const browserNavigateSchema = z.object({
  url: z.string().describe("URL to navigate to"),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).optional()
    .describe("When to consider navigation complete (default: networkidle)")
});

export const browserClickSchema = z.object({
  selector: z.string().describe("CSS selector of element to click")
});

export const browserTypeSchema = z.object({
  selector: z.string().describe("CSS selector of input element"),
  text: z.string().describe("Text to type into the input")
});

export const browserScrollSchema = z.object({
  direction: z.enum(["up", "down"]).describe("Direction to scroll"),
  amount: z.number().optional().describe("Pixels to scroll (default: 500)")
});

export const browserWaitForSchema = z.object({
  selector: z.string().describe("CSS selector to wait for"),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 10000)")
});

export const browserScreenshotSchema = z.object({
  fullPage: z.boolean().optional().describe("Capture full page (default: false)")
});

export const browserEvaluateSchema = z.object({
  script: z.string().describe("JavaScript code to evaluate in page context")
});

export const browserGetHtmlSchema = z.object({});

// ---------------------------------------------------------------------------
// Tool factories
// ---------------------------------------------------------------------------

/**
 * Create the browser_navigate tool
 */
export function createBrowserNavigateTool(ctx: ToolContext) {
  return tool({
    description: "Navigate to a URL in the browser. Use this for JavaScript-heavy sites or when you need to interact with the page.",
    inputSchema: zodSchema(browserNavigateSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_navigate: ${input.url}`);

        await page.goto(input.url, {
          waitUntil: input.waitUntil ?? "networkidle",
          timeout: 30000
        });

        // Cache the HTML
        const html = await page.content();
        ctx.pageCache.set(input.url, html);

        return {
          success: true,
          url: page.url(),
          title: await page.title()
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_click tool
 */
export function createBrowserClickTool(ctx: ToolContext) {
  return tool({
    description: "Click an element on the page.",
    inputSchema: zodSchema(browserClickSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_click: ${input.selector}`);

        await page.click(input.selector, { timeout: 10000 });

        // Wait a bit for any navigation/updates
        await page.waitForTimeout(500);

        return { success: true };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_type tool
 */
export function createBrowserTypeTool(ctx: ToolContext) {
  return tool({
    description: "Type text into an input field.",
    inputSchema: zodSchema(browserTypeSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_type: ${input.selector}`);

        await page.fill(input.selector, input.text, { timeout: 10000 });

        return { success: true };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_scroll tool
 */
export function createBrowserScrollTool(ctx: ToolContext) {
  return tool({
    description: "Scroll the page up or down.",
    inputSchema: zodSchema(browserScrollSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        const amount = input.amount ?? 500;
        const delta = input.direction === "down" ? amount : -amount;

        console.log(`[tools] browser_scroll: ${input.direction} ${amount}px`);

        await page.evaluate((scrollAmount) => {
          window.scrollBy(0, scrollAmount);
        }, delta);

        // Wait for any lazy-loaded content
        await page.waitForTimeout(500);

        return { success: true, scrolled: delta };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_wait_for tool
 */
export function createBrowserWaitForTool(ctx: ToolContext) {
  return tool({
    description: "Wait for an element to appear on the page.",
    inputSchema: zodSchema(browserWaitForSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_wait_for: ${input.selector}`);

        await page.waitForSelector(input.selector, {
          timeout: input.timeout ?? 10000
        });

        return { success: true };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_screenshot tool
 */
export function createBrowserScreenshotTool(ctx: ToolContext) {
  return tool({
    description: "Take a screenshot of the current page. Returns base64-encoded PNG.",
    inputSchema: zodSchema(browserScreenshotSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_screenshot`);

        const screenshot = await page.screenshot({
          fullPage: input.fullPage ?? false,
          type: "png"
        });

        return {
          success: true,
          base64: screenshot.toString("base64"),
          mimeType: "image/png"
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_evaluate tool
 */
export function createBrowserEvaluateTool(ctx: ToolContext) {
  return tool({
    description: "Execute JavaScript in the browser page context. The script should return a serializable value.",
    inputSchema: zodSchema(browserEvaluateSchema),
    execute: async (input) => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_evaluate`);

        // Execute with timeout
        const result = await Promise.race([
          page.evaluate(input.script),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Script execution timed out")), 10000)
          )
        ]);

        return { success: true, result };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create the browser_get_html tool
 */
export function createBrowserGetHtmlTool(ctx: ToolContext) {
  return tool({
    description: "Get the current page HTML and cache it for use with selector tools.",
    inputSchema: zodSchema(browserGetHtmlSchema),
    execute: async () => {
      try {
        const { page } = await getOrCreateSession(ctx);
        console.log(`[tools] browser_get_html`);

        const url = page.url();
        const html = await page.content();

        // Cache for selector tools
        ctx.pageCache.set(url, html);

        return {
          success: true,
          url,
          length: html.length,
          cached: true
        };
      } catch (error) {
        if (!ctx.continueOnError) throw error;
        return { error: error instanceof Error ? error.message : String(error) };
      }
    }
  });
}

/**
 * Create all browser tools
 */
export function createBrowserTools(ctx: ToolContext) {
  return {
    browser_navigate: createBrowserNavigateTool(ctx),
    browser_click: createBrowserClickTool(ctx),
    browser_type: createBrowserTypeTool(ctx),
    browser_scroll: createBrowserScrollTool(ctx),
    browser_wait_for: createBrowserWaitForTool(ctx),
    browser_screenshot: createBrowserScreenshotTool(ctx),
    browser_evaluate: createBrowserEvaluateTool(ctx),
    browser_get_html: createBrowserGetHtmlTool(ctx)
  };
}
