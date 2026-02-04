import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ModelsConfig, ModelCatalogEntry } from "@dispatch/lib";
import { getDefaultModelsConfig } from "@dispatch/lib";

const assignmentSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed"]),
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

const settingsSchema = z.object({
  models: modelsConfigSchema,
  search: searchConfigSchema.optional(),
  ui: uiConfigSchema.optional()
});

export type SearchConfig = {
  provider?: "brave" | "serper" | "duckduckgo";
  apiKey?: string;
  endpoint?: string;
};

export type UiConfig = {
  verbose?: boolean;
};

export type Settings = z.infer<typeof settingsSchema>;

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
    return { models: getDefaultModelsConfig() };
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
    ui: parsed.ui
  };

  return settingsSchema.parse({
    models: merged.models,
    search: merged.search,
    ui: merged.ui
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
    ui: getUiConfig()
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
