import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LlmTask = "summarize" | "classify" | "grade" | "embed" | "digest" | "skill";
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

export type ModelsConfig = {
  assignment: ModelAssignment[];
  catalog?: ModelCatalogEntry[];
};

export function getDefaultModelsConfig(): ModelsConfig {
  const defaultModel = "claude-3-5-sonnet-20240620";
  return {
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

export function getModelConfig(config: ModelsConfig, task: LlmTask): ModelConfig {
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

  const fallback = getDefaultModelsConfig();
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
  keys: ProviderKeyMap
) {
  const anthropicKey = keys.anthropic;
  const openaiCfg = keys.openai;
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
      const client = createOpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl });
      const forceChat = process.env.DISPATCH_OPENAI_USE_CHAT_COMPLETIONS;
      if (forceChat && ["1", "true", "yes"].includes(forceChat.toLowerCase())) {
        return client.chat(modelName);
      }
      try {
        const host = new URL(cfg.baseUrl).host;
        if (host && host !== "api.openai.com") {
          return client.chat(modelName);
        }
      } catch {
        return client.chat(modelName);
      }
      return client(modelName);
    }
  };
}
