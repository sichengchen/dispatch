import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ModelsConfig, ModelCatalogEntry } from "@dispatch/lib";
import { getDefaultModelsConfig } from "@dispatch/lib";

const assignmentSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed", "digest"]),
  modelId: z.string().min(1)
});

const catalogSchema: z.ZodType<ModelCatalogEntry> = z.object({
  id: z.string().min(1),
  providerType: z.enum(["anthropic", "openai", "mock"]),
  model: z.string().min(1),
  label: z.string().min(1).optional(),
  capabilities: z.array(z.enum(["chat", "embedding"])).optional(),
  providerConfig: z
    .object({
      apiKey: z.string().min(1).optional(),
      baseUrl: z.string().url().optional()
    })
    .optional()
});

const modelsConfigSchema: z.ZodType<ModelsConfig> = z.object({
  assignment: z.array(assignmentSchema),
  catalog: z.array(catalogSchema).optional()
});

const searchConfigSchema = z.object({
  provider: z.enum(["brave", "serper", "duckduckgo"]).optional(),
  apiKey: z.string().min(1).optional(),
  endpoint: z.string().url().optional()
});

const uiConfigSchema = z.object({
  verbose: z.boolean().optional()
});

const gradingWeightsSchema = z.object({
  importancy: z.number().nonnegative(),
  quality: z.number().nonnegative(),
  interest: z.number().nonnegative(),
  source: z.number().nonnegative()
});

const gradingConfigSchema = z.object({
  weights: gradingWeightsSchema.optional(),
  interestByTag: z.record(z.string(), z.number().min(-10).max(10)).optional(),
  sourceWeights: z.record(z.string(), z.number().min(-10).max(10)).optional(),
  clamp: z
    .object({
      min: z.number().min(1).max(10).optional(),
      max: z.number().min(1).max(10).optional()
    })
    .optional()
});

const digestConfigSchema = z.object({
  enabled: z.boolean().optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  topN: z.number().int().positive().max(50).optional(),
  hoursBack: z.number().positive().optional(),
  preferredLanguage: z.string().min(1).optional(),
});

const settingsSchema = z.object({
  models: modelsConfigSchema,
  search: searchConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
  grading: gradingConfigSchema.optional(),
  digest: digestConfigSchema.optional(),
});

export type SearchConfig = {
  provider?: "brave" | "serper" | "duckduckgo";
  apiKey?: string;
  endpoint?: string;
};

export type UiConfig = {
  verbose?: boolean;
};

export type GradingWeights = z.infer<typeof gradingWeightsSchema>;

export type GradingConfig = {
  weights?: GradingWeights;
  interestByTag?: Record<string, number>;
  sourceWeights?: Record<string, number>;
  clamp?: {
    min?: number;
    max?: number;
  };
};

export type DigestConfig = z.infer<typeof digestConfigSchema>;

export type Settings = z.infer<typeof settingsSchema>;

export function getDefaultGradingConfig(): GradingConfig {
  return {
    weights: {
      importancy: 0.5,
      quality: 0.5,
      interest: 0,
      source: 0
    },
    interestByTag: {},
    sourceWeights: {},
    clamp: {
      min: 1,
      max: 10
    }
  };
}

function findWorkspaceRoot(startDir: string) {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, "turbo.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function getSettingsPath(): string {
  const explicit = process.env.DISPATCH_SETTINGS_PATH;
  if (explicit) return explicit;
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) {
    const rootPath = path.join(workspaceRoot, "dispatch.settings.json");
    if (fs.existsSync(rootPath)) {
      return rootPath;
    }
    const cwdPath = path.resolve(process.cwd(), "dispatch.settings.json");
    if (fs.existsSync(cwdPath)) {
      fs.copyFileSync(cwdPath, rootPath);
      return rootPath;
    }
    return rootPath;
  }
  return path.resolve(process.cwd(), "dispatch.settings.json");
}

export function loadSettings(): Settings {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    return {
      models: getDefaultModelsConfig(),
      grading: getDefaultGradingConfig()
    };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: Partial<Settings>;
  try {
    parsed = JSON.parse(raw) as Partial<Settings>;
  } catch (err) {
    console.warn("Failed to parse settings file, using defaults.", err);
    return { models: getDefaultModelsConfig() };
  }
  const merged = {
    models: parsed.models ?? getDefaultModelsConfig(),
    search: parsed.search,
    ui: parsed.ui,
    grading: parsed.grading ?? getDefaultGradingConfig(),
    digest: parsed.digest,
  };

  return settingsSchema.parse({
    models: merged.models,
    search: merged.search,
    ui: merged.ui,
    grading: merged.grading,
    digest: merged.digest,
  });
}

export function saveSettings(next: Settings): Settings {
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const validated = settingsSchema.parse(next);
  fs.writeFileSync(filePath, JSON.stringify(validated, null, 2));
  return validated;
}

export function updateModelsConfig(next: ModelsConfig): ModelsConfig {
  return saveSettings({
    models: modelsConfigSchema.parse(next),
    search: getSearchConfig(),
    ui: getUiConfig(),
    grading: getGradingConfig(),
    digest: getDigestConfig(),
  }).models;
}

export function getModelsConfig(): ModelsConfig {
  return loadSettings().models;
}

export function getSearchConfig(): SearchConfig {
  return loadSettings().search ?? {};
}

export function getUiConfig(): UiConfig {
  return loadSettings().ui ?? {};
}

export function getGradingConfig(): GradingConfig {
  return loadSettings().grading ?? getDefaultGradingConfig();
}

export function getDefaultDigestConfig(): DigestConfig {
  return {
    enabled: true,
    scheduledTime: "06:00",
    topN: 10,
    hoursBack: 24,
    preferredLanguage: "English",
  };
}

export function getDigestConfig(): DigestConfig {
  return loadSettings().digest ?? getDefaultDigestConfig();
}
