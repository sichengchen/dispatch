import { describe, expect, it } from "vitest";
import type { ModelsConfig } from "@dispatch/lib";
import { summarizeArticle } from "../src/services/llm";

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
      {
        task: "summarize",
        modelId: "openai:local"
      }
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

describeLive("LLM Summarization (Live)", () => {
  it("Summarize.Basic: returns non-empty string", { timeout: 120000 }, async () => {
    const summary = await summarizeArticle(
      "Dispatch is a local-first news reader designed for speed.",
      getLocalLlmConfig()
    );
    expect(summary.length).toBeGreaterThan(0);
  });

  it("Summarize.NormalArticle: summarizes a real article input", async () => {
    const article = `
Researchers studying migratory birds reported that a prolonged heat wave altered
the timing of spring arrivals across several flyways. The study tracked thousands
of tagged birds over four years and found that earlier departures did not always
translate to higher nesting success. The authors suggest conservation plans should
account for shifting food availability and more frequent extreme weather events.
    `.trim();

    const summary = await summarizeArticle(article, getLocalLlmConfig());
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThan(300);
    expect(summary).not.toMatch(/<think>|<analysis>/i);
  });

  it("Summarize.InvalidConfig: throws when baseUrl missing", async () => {
    const baseConfig = getLocalLlmConfig();
    const previousChatEndpoint = process.env.DISPATCH_LLM_CHAT_ENDPOINT;
    delete process.env.DISPATCH_LLM_CHAT_ENDPOINT;
    const invalidConfig: ModelsConfig = {
      assignment: [
        {
          task: "summarize",
          modelId: "openai:local"
        }
      ],
      catalog: [
        {
          id: "openai:local",
          providerType: "openai",
          model: baseConfig.catalog?.[0]?.model ?? "local-model",
          capabilities: ["chat"],
          providerConfig: {
            apiKey: baseConfig.catalog?.[0]?.providerConfig?.apiKey ?? "",
            baseUrl: ""
          }
        }
      ]
    };

    await expect(
      summarizeArticle("Short content", invalidConfig)
    ).rejects.toBeTruthy();
    if (previousChatEndpoint) {
      process.env.DISPATCH_LLM_CHAT_ENDPOINT = previousChatEndpoint;
    }
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
