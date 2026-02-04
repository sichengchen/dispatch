import { describe, expect, it, beforeEach, beforeAll } from "vitest";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import type { ModelsConfig } from "@dispatch/lib";
import {
  classifyArticle,
  gradeArticle,
  summarizeArticle,
  summarizeArticleFull,
  processArticle
} from "../src/services/llm";
import { saveSettings } from "../src/services/settings";

let testCounter = 0;

const mockConfig: ModelsConfig = {
  assignment: [
    { task: "summarize", modelId: "mock:mock" },
    { task: "classify", modelId: "mock:mock" },
    { task: "grade", modelId: "mock:mock" },
    { task: "embed", modelId: "mock:mock" }
  ],
  catalog: [
    {
      id: "mock:mock",
      providerType: "mock",
      model: "mock",
      capabilities: ["chat", "embedding"]
    }
  ]
};

describe("LLM Pipeline (Mock)", () => {
  let testSourceId: number;
  let testArticleId: number;

  beforeAll(() => {
    process.env.DISPATCH_SETTINGS_PATH = "/tmp/dispatch.test.settings.json";
  });

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

    saveSettings({
      models: mockConfig,
      search: undefined,
      ui: { verbose: false },
      grading: {
        weights: {
          importancy: 0.5,
          quality: 0.5,
          interest: 0,
          source: 0
        },
        interestByTag: {},
        sourceWeights: {},
        clamp: { min: 1, max: 10 }
      },
      digest: {
        enabled: true,
        scheduledTime: "06:00",
        topN: 10,
        hoursBack: 24,
        preferredLanguage: "English"
      }
    });
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
      const result = await gradeArticle(
        "Some content",
        { sourceName: "Test Source", tags: [] },
        mockConfig,
        {
          weights: {
            importancy: 0.5,
            quality: 0.5,
            interest: 0,
            source: 0
          },
          interestByTag: {},
          sourceWeights: {},
          clamp: { min: 1, max: 10 }
        }
      );
      expect(result).toEqual({
        score: 5,
        justification: "Mock grade",
        importancy: 5,
        quality: 5
      });
    });

    it("returns default for empty content", async () => {
      const result = await gradeArticle(
        "",
        { sourceName: "Test Source", tags: [] },
        mockConfig
      );
      expect(result).toEqual({
        score: 1,
        justification: "Empty content",
        importancy: 1,
        quality: 1
      });
    });

    it("applies interest weights when configured", async () => {
      const result = await gradeArticle(
        "Some content",
        { sourceName: "Test Source", tags: ["ai"] },
        mockConfig,
        {
          weights: {
            importancy: 1,
            quality: 0,
            interest: 1,
            source: 0
          },
          interestByTag: {
            ai: 10
          },
          sourceWeights: {}
        }
      );
      expect(result.score).toBe(8);
      expect(result.importancy).toBe(5);
      expect(result.quality).toBe(5);
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
      expect(updated!.importancy).toBe(5);
      expect(updated!.quality).toBe(5);
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
