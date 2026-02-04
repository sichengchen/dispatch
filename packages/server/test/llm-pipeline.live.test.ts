import { describe, expect, it } from "vitest";
import type { ModelsConfig } from "@dispatch/lib";
import {
  classifyArticle,
  gradeArticle,
  summarizeArticleFull
} from "../src/services/llm";

const isLive = process.env.DISPATCH_LIVE === "1";
const describeLive = isLive ? describe : describe.skip;

function getLocalLlmConfig(): ModelsConfig {
  const baseUrl =
    process.env.DISPATCH_LLM_BASE_URL ?? process.env.OPENAI_BASE_URL;
  const model =
    process.env.DISPATCH_LLM_MODEL ?? process.env.OPENAI_MODEL;
  const apiKey =
    process.env.DISPATCH_LLM_KEY ?? process.env.OPENAI_API_KEY ?? "local";

  if (!baseUrl || !model) {
    throw new Error(
      "Missing local LLM config. Set DISPATCH_LLM_BASE_URL and DISPATCH_LLM_MODEL."
    );
  }

  return {
    assignment: [
      { task: "summarize", modelId: "openai:local" },
      { task: "classify", modelId: "openai:local" },
      { task: "grade", modelId: "openai:local" }
    ],
    catalog: [
      {
        id: "openai:local",
        providerType: "openai",
        model,
        capabilities: ["chat"],
        providerConfig: {
          apiKey,
          baseUrl
        }
      }
    ]
  };
}

const sampleArticle = `
Researchers at MIT have developed a new method for training large language models
that reduces compute costs by up to 40%. The technique, called "progressive
distillation," works by starting with a smaller model and gradually increasing
its capacity during training. The team tested the approach on several benchmark
tasks and found that the resulting models performed comparably to those trained
with conventional methods, while using significantly fewer GPU hours. The paper,
published in Nature Machine Intelligence, suggests this could make AI research
more accessible to smaller labs and universities.
`.trim();

describeLive("LLM Pipeline (Live)", () => {
  describe("classifyArticle", () => {
    it("returns an array of topic tags", { timeout: 120000 }, async () => {
      const tags = await classifyArticle(sampleArticle, getLocalLlmConfig());
      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.length).toBeLessThanOrEqual(5);
      for (const tag of tags) {
        expect(typeof tag).toBe("string");
        expect(tag.length).toBeGreaterThan(0);
        expect(tag).toBe(tag.toLowerCase());
      }
    });

    it("returns relevant tags for tech content", { timeout: 120000 }, async () => {
      const tags = await classifyArticle(sampleArticle, getLocalLlmConfig());
      const combined = tags.join(" ");
      // At least one tag should be tech/AI related
      expect(combined).toMatch(/technolog|ai|machine|learn|comput|science|research/i);
    });

    it("returns empty array for empty content", async () => {
      const tags = await classifyArticle("", getLocalLlmConfig());
      expect(tags).toEqual([]);
    });
  });

  describe("gradeArticle", () => {
    it("returns score and justification", { timeout: 120000 }, async () => {
      const result = await gradeArticle(
        sampleArticle,
        { sourceName: "MIT News", tags: ["ai"] },
        getLocalLlmConfig()
      );
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.importancy).toBeGreaterThanOrEqual(1);
      expect(result.importancy).toBeLessThanOrEqual(10);
      expect(result.quality).toBeGreaterThanOrEqual(1);
      expect(result.quality).toBeLessThanOrEqual(10);
      expect(result.justification.length).toBeGreaterThan(0);
    });

    it("returns default for empty content", async () => {
      const result = await gradeArticle(
        "",
        { sourceName: "Test", tags: [] },
        getLocalLlmConfig()
      );
      expect(result.score).toBe(1);
      expect(result.justification).toBe("Empty content");
      expect(result.importancy).toBe(1);
      expect(result.quality).toBe(1);
    });
  });

  describe("summarizeArticleFull", () => {
    it("returns oneLiner and keyPoints", { timeout: 120000 }, async () => {
      const result = await summarizeArticleFull(
        sampleArticle,
        getLocalLlmConfig()
      );
      expect(result.oneLiner.length).toBeGreaterThan(0);
      expect(result.oneLiner.length).toBeLessThan(500);
      expect(Array.isArray(result.keyPoints)).toBe(true);
      expect(result.keyPoints.length).toBeGreaterThan(0);
      for (const point of result.keyPoints) {
        expect(typeof point).toBe("string");
        expect(point.length).toBeGreaterThan(0);
      }
    });

    it("throws for empty content", async () => {
      await expect(
        summarizeArticleFull("", getLocalLlmConfig())
      ).rejects.toThrow("Cannot summarize empty content");
    });
  });
});
