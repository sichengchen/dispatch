import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LlmTask = "summarize" | "classify" | "grade";
export type ProviderId = "anthropic" | "openaiCompatible" | "mock";

export type ProviderKeyMap = {
  anthropic?: string;
  openaiCompatible?: { apiKey: string; baseUrl: string };
};

export type ModelProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
};

export type ModelCatalogEntry = {
  id: string;
  provider: ProviderId;
  model: string;
  label?: string;
  providerConfig?: ModelProviderConfig;
};

export type ModelConfig = {
  task: LlmTask;
  provider: ProviderId;
  model: string;
};

export type LlmConfig = {
  providers: ProviderKeyMap;
  models: ModelConfig[];
  catalog?: ModelCatalogEntry[];
};

export function getDefaultLlmConfig(): LlmConfig {
  const defaultModel = "claude-3-5-sonnet-20240620";
  return {
    providers: {},
    models: [
      {
        task: "summarize",
        provider: "anthropic",
        model: defaultModel
      }
    ],
    catalog: [
      {
        id: `anthropic:${defaultModel}`,
        provider: "anthropic",
        model: defaultModel,
        label: "Claude 3.5 Sonnet"
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

export function createProviderMap(
  keys: ProviderKeyMap,
  overrides?: ProviderKeyMap
) {
  const anthropicKey = overrides?.anthropic ?? keys.anthropic;
  const openaiCompatibleCfg = overrides?.openaiCompatible ?? keys.openaiCompatible;
  return {
    anthropic: (modelName: string): LanguageModel => {
      if (!anthropicKey) {
        throw new Error("Anthropic API key is missing");
      }
      return createAnthropic({ apiKey: anthropicKey })(modelName);
    },
    openaiCompatible: (modelName: string): LanguageModel => {
      const cfg = openaiCompatibleCfg;
      if (!cfg?.apiKey || !cfg.baseUrl) {
        throw new Error("OpenAI-compatible config is missing");
      }
      return createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })(modelName);
    }
  };
}
