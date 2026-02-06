import type { Provider, DiscoveredModel } from "@dispatch/api";

export type Task = "summarize" | "classify" | "grade" | "embed" | "digest" | "skill";

export type ProviderType = "anthropic" | "openai" | "mock";

export type CatalogEntry = {
  id: string;
  providerId?: string;
  model: string;
  label: string;
  capabilities: Array<"chat" | "embedding">;
};

// Re-export Provider and DiscoveredModel for convenience
export type { Provider, DiscoveredModel };

export type RoutingState = Record<Task, string>;

export type GradingWeights = {
  importancy: number;
  quality: number;
  interest: number;
  source: number;
};

export type ScoreRow = {
  id: string;
  key: string;
  score: string;
};

export const TASKS: Array<{ id: Task; label: string; hint: string }> = [
  { id: "summarize", label: "Summarize", hint: "One-liner and key points" },
  { id: "classify", label: "Classify", hint: "Topic tags" },
  { id: "grade", label: "Grade", hint: "Quality score" },
  { id: "embed", label: "Embeddings", hint: "Related articles" },
  { id: "digest", label: "Digest", hint: "Daily briefing generation" },
  { id: "skill", label: "Agentic Extraction", hint: "Agentic web source extraction" }
];

export const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";

export const DEFAULT_GRADING_WEIGHTS: GradingWeights = {
  importancy: 0.5,
  quality: 0.5,
  interest: 0,
  source: 0
};

export function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `model-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function createFallbackId(provider: ProviderType, model: string) {
  return `${provider}:${model || "model"}`;
}

export function createScoreRow(): ScoreRow {
  return {
    id: generateId(),
    key: "",
    score: "0"
  };
}

export function formatWeight(value: number) {
  return value.toFixed(2);
}

export function buildDefaultCatalog(): CatalogEntry[] {
  return [];
}
