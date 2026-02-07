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

// Provider type for provider-based model management
export type Provider = {
  id: string;
  name: string;
  type: "anthropic" | "openai-compatible";
  credentials: {
    apiKey: string;
    baseUrl?: string;
  };
};

// Discovered model from provider API
export type DiscoveredModel = {
  id: string;
  name: string;
  capabilities: Array<"chat" | "embedding">;
  ownedBy?: string;
};

export type ModelCatalogEntry = {
  id: string;
  providerId?: string;
  model: string;
  label?: string;
  capabilities?: Array<"chat" | "embedding">;
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
  return {
    assignment: [],
    catalog: []
  };
}

export function getModelConfig(
  config: ModelsConfig,
  task: LlmTask,
  providers?: Provider[]
): ModelConfig {
  const assignment = config.assignment.find((item) => item.task === task);
  const fromCatalog = assignment
    ? config.catalog?.find((entry) => entry.id === assignment.modelId)
    : undefined;

  if (assignment && fromCatalog) {
    // Derive providerType from the provider
    let providerType: ProviderType = "mock";
    if (fromCatalog.providerId && providers) {
      const provider = providers.find((p) => p.id === fromCatalog.providerId);
      if (provider) {
        providerType = provider.type === "anthropic" ? "anthropic" : "openai";
      }
    }

    return {
      task,
      modelId: fromCatalog.id,
      providerType,
      model: fromCatalog.model
    };
  }

  // No model configured for this task - throw error with helpful message
  throw new Error(
    `No model configured for task "${task}". Please configure a model in Settings > Models > Router.`
  );
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
