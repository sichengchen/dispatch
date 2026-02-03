// Placeholder for Vercel AI SDK initialization.
// This will be implemented in Phase 1.7 with a user-configurable model router.
export type LlmTask = "summarize" | "classify" | "grade";

export type ProviderKeyMap = {
  anthropic?: string;
  openaiCompatible?: { apiKey: string; baseUrl: string };
  gemini?: string;
};

export type ModelConfig = {
  task: LlmTask;
  provider: "anthropic" | "openaiCompatible" | "gemini";
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
        provider: "gemini",
        model: "gemini-1.5-flash"
      }
    ]
  };
}
