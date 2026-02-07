import type { GradingConfig, GradingWeights } from "./settings";

export type GradeInputs = {
  sourceId?: number;
  sourceName?: string;
  sourceUrl?: string;
  tags?: string[];
};

export const DEFAULT_GRADING_WEIGHTS: GradingWeights = {
  importancy: 0.5,
  quality: 0.5,
  interest: 0,
  source: 0
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeScoreMap(
  map: Record<string, number> | undefined
): Record<string, number> {
  if (!map) return {};
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(map)) {
    const key = normalizeKey(rawKey);
    if (!key) continue;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    normalized[key] = clampNumber(value, -10, 10);
  }
  return normalized;
}

export function normalizeWeights(
  weights: Partial<GradingWeights> | undefined,
  fallback: GradingWeights = DEFAULT_GRADING_WEIGHTS
): GradingWeights {
  const sanitize = (value: number | undefined, fallbackValue: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return Math.max(0, fallbackValue);
    return Math.max(0, num);
  };
  const safe = {
    importancy: sanitize(weights?.importancy, fallback.importancy),
    quality: sanitize(weights?.quality, fallback.quality),
    interest: sanitize(weights?.interest, fallback.interest),
    source: sanitize(weights?.source, fallback.source)
  };
  const sum = safe.importancy + safe.quality + safe.interest + safe.source;
  if (sum <= 0) {
    const fallbackSum =
      fallback.importancy + fallback.quality + fallback.interest + fallback.source || 1;
    return {
      importancy: fallback.importancy / fallbackSum,
      quality: fallback.quality / fallbackSum,
      interest: fallback.interest / fallbackSum,
      source: fallback.source / fallbackSum
    };
  }
  return {
    importancy: safe.importancy / sum,
    quality: safe.quality / sum,
    interest: safe.interest / sum,
    source: safe.source / sum
  };
}

export function computeInterestScore(
  tags: string[] | undefined,
  interestByTag: Record<string, number> | undefined
): number {
  if (!tags || tags.length === 0) return 0;
  const normalized = normalizeScoreMap(interestByTag);
  const scores = tags
    .map((tag) => normalized[normalizeKey(tag)])
    .filter((value) => typeof value === "number") as number[];
  if (scores.length === 0) return 0;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function computeSourceScore(
  inputs: GradeInputs,
  sourceWeights: Record<string, number> | undefined
): number {
  const normalized = normalizeScoreMap(sourceWeights);
  const candidates: string[] = [];
  if (typeof inputs.sourceId === "number") {
    candidates.push(String(inputs.sourceId));
  }
  if (inputs.sourceName) {
    candidates.push(inputs.sourceName);
  }
  if (inputs.sourceUrl) {
    try {
      const hostname = new URL(inputs.sourceUrl).hostname;
      candidates.push(hostname);
      candidates.push(hostname.replace(/^www\./, ""));
    } catch {
      // ignore invalid URLs
    }
  }
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (key in normalized) {
      return normalized[key];
    }
  }
  return 0;
}

export function computeFinalGrade(
  base: { importancy: number; quality: number },
  inputs: GradeInputs,
  gradingConfig: GradingConfig
): {
  score: number;
  interestScore: number;
  sourceScore: number;
  weights: GradingWeights;
} {
  const weights = normalizeWeights(gradingConfig.weights, DEFAULT_GRADING_WEIGHTS);
  const interestScore = computeInterestScore(
    inputs.tags,
    gradingConfig.interestByTag
  );
  const sourceScore = computeSourceScore(inputs, gradingConfig.sourceWeights);

  const clampMin = clampNumber(gradingConfig.clamp?.min ?? 1, 1, 10);
  const clampMax = clampNumber(gradingConfig.clamp?.max ?? 10, 1, 10);
  const clampLow = Math.min(clampMin, clampMax);
  const clampHigh = Math.max(clampMin, clampMax);

  const rawScore =
    base.importancy * weights.importancy +
    base.quality * weights.quality +
    interestScore * weights.interest +
    sourceScore * weights.source;

  const score = Math.round(clampNumber(rawScore, clampLow, clampHigh));
  return { score, interestScore, sourceScore, weights };
}
