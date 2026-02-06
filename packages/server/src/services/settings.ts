import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ModelsConfig, ModelCatalogEntry, Provider } from "@dispatch/lib";
import { getDefaultModelsConfig } from "@dispatch/lib";

const assignmentSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed", "digest", "skill"]),
  modelId: z.string().min(1)
});

const providerSchema: z.ZodType<Provider> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["anthropic", "openai-compatible"]),
  credentials: z.object({
    apiKey: z.string().min(1),
    baseUrl: z.string().url().optional()
  })
});

const catalogSchema: z.ZodType<ModelCatalogEntry> = z.object({
  id: z.string().min(1),
  providerId: z.string().optional(),
  model: z.string().min(1),
  label: z.string().optional(),
  capabilities: z.array(z.enum(["chat", "embedding"])).optional()
});

const modelsConfigSchema: z.ZodType<ModelsConfig> = z.object({
  assignment: z.array(assignmentSchema),
  catalog: z.array(catalogSchema).optional()
});

const uiConfigSchema = z.object({
  verbose: z.boolean().optional(),
  digestReferenceLinkBehavior: z.enum(["internal", "external"]).optional(),
  externalLinkBehavior: z.enum(["internal", "external"]).optional()
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
  preset: z.enum(["daily", "every12h", "every6h"]).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  cronExpression: z.string().optional(),
  topN: z.number().int().positive().max(50).optional(),
  hoursBack: z.number().positive().optional(),
  preferredLanguage: z.string().min(1).optional(),
});

const fetchScheduleConfigSchema = z.object({
  enabled: z.boolean().optional(),
  preset: z.enum(["hourly", "every2h", "every6h", "every12h", "daily"]).optional(),
  cronExpression: z.string().optional(),
});

const pipelineScheduleConfigSchema = z.object({
  enabled: z.boolean().optional(),
  preset: z.enum(["every5m", "every15m", "every30m", "hourly"]).optional(),
  cronExpression: z.string().optional(),
  batchSize: z.number().int().min(1).max(50).optional(),
});

const agentConfigSchema = z.object({
  skillGeneratorMaxSteps: z.number().int().min(5).max(100).optional(),
  extractionAgentMaxSteps: z.number().int().min(5).max(100).optional(),
});

const settingsSchema = z.object({
  providers: z.array(providerSchema).optional(),
  models: modelsConfigSchema,
  ui: uiConfigSchema.optional(),
  grading: gradingConfigSchema.optional(),
  digest: digestConfigSchema.optional(),
  fetchSchedule: fetchScheduleConfigSchema.optional(),
  pipelineSchedule: pipelineScheduleConfigSchema.optional(),
  agent: agentConfigSchema.optional(),
});

export type UiConfig = {
  verbose?: boolean;
  digestReferenceLinkBehavior?: "internal" | "external";
  externalLinkBehavior?: "internal" | "external";
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

export type FetchScheduleConfig = z.infer<typeof fetchScheduleConfigSchema>;

export type PipelineScheduleConfig = z.infer<typeof pipelineScheduleConfigSchema>;

export type AgentConfig = z.infer<typeof agentConfigSchema>;

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

/**
 * Get data paths for storing app data (skills, cache, etc.)
 */
export function getDataPaths(): { userDataPath: string; settingsPath: string } {
  const settingsPath = getSettingsPath();
  // userDataPath is the directory containing settings
  const userDataPath = process.env.DISPATCH_DATA_PATH ?? path.dirname(settingsPath);
  return { userDataPath, settingsPath };
}

// Migration code removed - users should reconfigure providers/models with new UI

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
    providers: parsed.providers ?? [],
    models: parsed.models ?? getDefaultModelsConfig(),
    ui: parsed.ui,
    grading: parsed.grading ?? getDefaultGradingConfig(),
    digest: parsed.digest,
    fetchSchedule: parsed.fetchSchedule,
    pipelineSchedule: parsed.pipelineSchedule,
    agent: parsed.agent,
  };

  return settingsSchema.parse({
    providers: merged.providers,
    models: merged.models,
    ui: merged.ui,
    grading: merged.grading,
    digest: merged.digest,
    fetchSchedule: merged.fetchSchedule,
    pipelineSchedule: merged.pipelineSchedule,
    agent: merged.agent,
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
    ui: getUiConfig(),
    grading: getGradingConfig(),
    digest: getDigestConfig(),
    fetchSchedule: getFetchScheduleConfig(),
    pipelineSchedule: getPipelineScheduleConfig(),
    agent: getAgentConfig(),
  }).models;
}

export function getModelsConfig(): ModelsConfig {
  return loadSettings().models;
}

export function getProviders(): Provider[] {
  return loadSettings().providers ?? [];
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

export function getDefaultFetchScheduleConfig(): FetchScheduleConfig {
  return {
    enabled: true,
    preset: "hourly",
  };
}

export function getFetchScheduleConfig(): FetchScheduleConfig {
  return loadSettings().fetchSchedule ?? getDefaultFetchScheduleConfig();
}

export function getDefaultPipelineScheduleConfig(): PipelineScheduleConfig {
  return {
    enabled: true,
    preset: "every15m",
    batchSize: 10,
  };
}

export function getPipelineScheduleConfig(): PipelineScheduleConfig {
  return loadSettings().pipelineSchedule ?? getDefaultPipelineScheduleConfig();
}

export function getDefaultAgentConfig(): AgentConfig {
  return {
    skillGeneratorMaxSteps: 100,
    extractionAgentMaxSteps: 100,
  };
}

export function getAgentConfig(): AgentConfig {
  return loadSettings().agent ?? getDefaultAgentConfig();
}
