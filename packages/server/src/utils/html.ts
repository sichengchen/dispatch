/**
 * HTML utility functions for text processing
 */

import { JSDOM } from "jsdom";

/**
 * Decode HTML entities in a string.
 * Handles both numeric (&#8217;) and named (&amp;) entities.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  // Use JSDOM to decode entities - this handles all standard HTML entities
  const dom = new JSDOM(`<!DOCTYPE html><body>${text}</body>`);
  return dom.window.document.body.textContent ?? text;
}
