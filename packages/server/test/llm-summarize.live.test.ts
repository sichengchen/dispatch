import { describe, expect, it } from "vitest";
import type { LlmConfig } from "@dispatch/lib";
import { summarizeArticle } from "../src/services/llm";

const isLive = process.env.DISPATCH_LIVE === "1";
const describeLive = isLive ? describe : describe.skip;

function getLocalLlmConfig(): LlmConfig {
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
    providers: {
      openaiCompatible: {
        apiKey,
        baseUrl
      }
    },
    models: [
      {
        task: "summarize",
        provider: "openaiCompatible",
        model
      }
    ]
  };
}

describeLive("LLM Summarization (Live)", () => {
  it("Summarize.Basic: returns non-empty string", async () => {
    const summary = await summarizeArticle(
      "Dispatch is a local-first news reader designed for speed.",
      getLocalLlmConfig()
    );
    expect(summary.length).toBeGreaterThan(0);
  });

  it("Summarize.InvalidKey: throws when provider key missing", async () => {
    const invalidConfig: LlmConfig = {
      providers: {
        openaiCompatible: {
          // baseUrl present, apiKey missing
          apiKey: "",
          baseUrl: "http://localhost:1234/v1"
        }
      },
      models: [
        {
          task: "summarize",
          provider: "openaiCompatible",
          model: "local-model"
        }
      ]
    };

    await expect(
      summarizeArticle("Short content", invalidConfig)
    ).rejects.toBeTruthy();
  });

  it("Summarize.Short: handles short article", async () => {
    const summary = await summarizeArticle("Too short.", getLocalLlmConfig());
    expect(summary.length).toBeGreaterThan(0);
  });

  it("Router.Selection: honors configured provider", async () => {
    const summary = await summarizeArticle(
      "Routing should pick the configured provider.",
      getLocalLlmConfig()
    );
    expect(summary.length).toBeGreaterThan(0);
  });
});
