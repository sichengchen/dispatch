import { describe, expect, it, beforeEach } from "vitest";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import type { LlmConfig } from "@dispatch/lib";
import {
  classifyArticle,
  gradeArticle,
  summarizeArticle,
  summarizeArticleFull,
  processArticle
} from "../src/services/llm";

let testCounter = 0;

const mockConfig: LlmConfig = {
  providers: {},
  models: [
    { task: "summarize", provider: "mock", model: "mock" },
    { task: "classify", provider: "mock", model: "mock" },
    { task: "grade", provider: "mock", model: "mock" }
  ]
};

describe("LLM Pipeline (Mock)", () => {
  let testSourceId: number;
  let testArticleId: number;

  beforeEach(() => {
    testCounter += 1;
    const uid = `${Date.now()}-${testCounter}`;

    // Insert a test source
    const sourceResult = db
      .insert(sources)
      .values({
        name: "Pipeline Test Source",
        url: `https://pipeline-test-${uid}.example.com/feed.xml`,
        type: "rss"
      })
      .run();
    testSourceId = Number(sourceResult.lastInsertRowid);

    // Insert a test article
    const articleResult = db
      .insert(articles)
      .values({
        sourceId: testSourceId,
        title: "Test Pipeline Article",
        url: `https://example.com/pipeline-test-${uid}`,
        cleanContent:
          "This is a test article about technology and AI. It covers many important topics.",
        fetchedAt: new Date(),
        isRead: false
      })
      .run();
    testArticleId = Number(articleResult.lastInsertRowid);
  });

  describe("classifyArticle (mock)", () => {
    it("returns mock tags", async () => {
      const tags = await classifyArticle("Some content", mockConfig);
      expect(tags).toEqual(["technology", "general"]);
    });

    it("returns empty for empty content", async () => {
      const tags = await classifyArticle("", mockConfig);
      expect(tags).toEqual([]);
    });
  });

  describe("gradeArticle (mock)", () => {
    it("returns mock grade", async () => {
      const result = await gradeArticle("Some content", "Test Source", mockConfig);
      expect(result).toEqual({ score: 5, justification: "Mock grade" });
    });

    it("returns default for empty content", async () => {
      const result = await gradeArticle("", "Test Source", mockConfig);
      expect(result).toEqual({ score: 1, justification: "Empty content" });
    });
  });

  describe("summarizeArticle (mock)", () => {
    it("returns mock summary string", async () => {
      const summary = await summarizeArticle("Some content here", mockConfig);
      expect(summary).toContain("Mock summary");
    });
  });

  describe("summarizeArticleFull (mock)", () => {
    it("returns mock oneLiner and keyPoints", async () => {
      const result = await summarizeArticleFull("Some content here", mockConfig);
      expect(result.oneLiner).toContain("Mock summary");
      expect(result.keyPoints).toEqual(["Mock key point 1", "Mock key point 2"]);
    });
  });

  describe("processArticle (mock)", () => {
    it("persists tags, grade, summary, and keyPoints", async () => {
      await processArticle(testArticleId, mockConfig);

      const updated = db
        .select()
        .from(articles)
        .where(eq(articles.id, testArticleId))
        .get();

      expect(updated).toBeDefined();
      expect(updated!.summary).toContain("Mock summary");
      expect(updated!.grade).toBe(5);
      expect(updated!.processedAt).toBeTruthy();

      const tags = JSON.parse(updated!.tags!) as string[];
      expect(tags).toEqual(["technology", "general"]);

      const keyPoints = JSON.parse(updated!.keyPoints!) as string[];
      expect(keyPoints).toEqual(["Mock key point 1", "Mock key point 2"]);
    });

    it("throws for non-existent article", async () => {
      await expect(processArticle(999999, mockConfig)).rejects.toThrow(
        "Article 999999 not found"
      );
    });
  });
});
