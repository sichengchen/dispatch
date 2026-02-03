import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LlmTask = "summarize" | "classify" | "grade";
export type ProviderId = "anthropic" | "openaiCompatible" | "mock";

export type ProviderKeyMap = {
  anthropic?: string;
  openaiCompatible?: { apiKey: string; baseUrl: string };
};

export type ModelConfig = {
  task: LlmTask;
  provider: ProviderId;
  model: string;
};

export type LlmConfig = {
  providers: ProviderKeyMap;
  models: ModelConfig[];
};

export function getDefaultLlmConfig(): LlmConfig {
  return {
    providers: {},
    models: [
      {
        task: "summarize",
        provider: "anthropic",
        model: "claude-3-5-sonnet-20240620"
      }
    ]
  };
}

export function getModelConfig(config: LlmConfig, task: LlmTask): ModelConfig {
  const match = config.models.find((model) => model.task === task);
  if (match) return match;
  return {
    task,
    provider: "anthropic",
    model: "claude-3-5-sonnet-20240620"
  };
}

export function createProviderMap(keys: ProviderKeyMap) {
  return {
    anthropic: (modelName: string): LanguageModel => {
      if (!keys.anthropic) {
        throw new Error("Anthropic API key is missing");
      }
      return createAnthropic({ apiKey: keys.anthropic })(modelName);
    },
    openaiCompatible: (modelName: string): LanguageModel => {
      const cfg = keys.openaiCompatible;
      if (!cfg?.apiKey || !cfg.baseUrl) {
        throw new Error("OpenAI-compatible config is missing");
      }
      return createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })(modelName);
    }
  };
}
