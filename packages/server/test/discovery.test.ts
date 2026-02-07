import { afterEach, describe, expect, it } from "vitest";
import { discoverSources } from "../src/services/discovery";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("discoverSources", () => {
  it("returns normalized suggestions from test search results when LLM is disabled", async () => {
    process.env.DISPATCH_DISABLE_LLM = "1";
    process.env.DISPATCH_TEST_SEARCH_RESULTS = JSON.stringify([
      {
        title: "Example Tech Blog",
        url: "https://example.com/rss",
        description: "Example RSS feed"
      },
      {
        title: "Example Tech Blog Duplicate",
        url: "https://example.com/news",
        description: "Duplicate host"
      },
      {
        title: "Another Source",
        url: "https://another.example.org/",
        description: "Another source"
      }
    ]);

    const results = await discoverSources("tech blogs");

    expect(results.length).toBe(2);
    expect(results[0].url).toContain("https://example.com/rss");
    expect(results[0].type).toBe("rss");
    expect(results[1].url).toContain("https://another.example.org/");
  });
});
