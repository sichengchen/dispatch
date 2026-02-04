import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LlmTask = "summarize" | "classify" | "grade" | "embed";
export type ProviderType = "anthropic" | "openai" | "mock";

export type ProviderKeyMap = {
  anthropic?: string;
  openai?: { apiKey: string; baseUrl: string };
};

export type ModelProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
};

export type ModelCatalogEntry = {
  id: string;
  providerType: ProviderType;
  model: string;
  label?: string;
  capabilities?: Array<"chat" | "embedding">;
  providerConfig?: ModelProviderConfig;
};

export type ModelAssignment = {
  task: LlmTask;
  modelId: string;
};

export type ModelConfig = {
  task: LlmTask;
  modelId: string;
  providerType: ProviderType;
  model: string;
};

export type LlmConfig = {
  providers: ProviderKeyMap;
  assignment: ModelAssignment[];
  catalog?: ModelCatalogEntry[];
};

export function getDefaultLlmConfig(): LlmConfig {
  const defaultModel = "claude-3-5-sonnet-20240620";
  return {
    providers: {},
    assignment: [
      {
        task: "summarize",
        modelId: `anthropic:${defaultModel}`
      },
      {
        task: "embed",
        modelId: "mock:mock"
      }
    ],
    catalog: [
      {
        id: `anthropic:${defaultModel}`,
        providerType: "anthropic",
        model: defaultModel,
        label: "Claude 3.5 Sonnet",
        capabilities: ["chat"]
      },
      {
        id: "mock:mock",
        providerType: "mock",
        model: "mock",
        label: "Mock",
        capabilities: ["chat", "embedding"]
      }
    ]
  };
}

export function getModelConfig(config: LlmConfig, task: LlmTask): ModelConfig {
  const assignment = config.assignment.find((item) => item.task === task);
  const fromCatalog = assignment
    ? config.catalog?.find((entry) => entry.id === assignment.modelId)
    : undefined;

  if (assignment && fromCatalog) {
    return {
      task,
      modelId: fromCatalog.id,
      providerType: fromCatalog.providerType,
      model: fromCatalog.model
    };
  }

  const fallback = getDefaultLlmConfig();
  const fallbackAssignment = fallback.assignment.find((item) => item.task === task);
  const fallbackEntry = fallbackAssignment
    ? fallback.catalog?.find((entry) => entry.id === fallbackAssignment.modelId)
    : undefined;

  if (fallbackAssignment && fallbackEntry) {
    return {
      task,
      modelId: fallbackEntry.id,
      providerType: fallbackEntry.providerType,
      model: fallbackEntry.model
    };
  }

  return {
    task,
    modelId: "mock:mock",
    providerType: "mock",
    model: "mock"
  };
}

export function createProviderMap(
  keys: ProviderKeyMap,
  overrides?: ProviderKeyMap
) {
  const anthropicKey = overrides?.anthropic ?? keys.anthropic;
  const openaiCfg = overrides?.openai ?? keys.openai;
  return {
    anthropic: (modelName: string): LanguageModel => {
      if (!anthropicKey) {
        throw new Error("Anthropic API key is missing");
      }
      return createAnthropic({ apiKey: anthropicKey })(modelName);
    },
    openai: (modelName: string): LanguageModel => {
      const cfg = openaiCfg;
      if (!cfg?.apiKey || !cfg.baseUrl) {
        throw new Error("OpenAI config is missing");
      }
      return createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })(modelName);
    }
  };
}
