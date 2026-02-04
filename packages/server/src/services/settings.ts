import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LlmConfig, ModelCatalogEntry, ProviderKeyMap } from "@dispatch/lib";
import { getDefaultLlmConfig } from "@dispatch/lib";

const providerKeysSchema = z.object({
  anthropic: z.string().min(1).optional(),
  openaiCompatible: z
    .object({
      apiKey: z.string().min(1),
      baseUrl: z.string().url()
    })
    .optional()
});

const modelConfigSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed"]),
  provider: z.enum(["anthropic", "openaiCompatible", "mock"]),
  model: z.string().min(1)
});

const catalogSchema: z.ZodType<ModelCatalogEntry> = z.object({
  id: z.string().min(1),
  provider: z.enum(["anthropic", "openaiCompatible", "mock"]),
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

const llmConfigSchema: z.ZodType<LlmConfig> = z.object({
  providers: providerKeysSchema,
  models: z.array(modelConfigSchema),
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
  llm: llmConfigSchema,
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
    return { llm: getDefaultLlmConfig() };
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  let parsed: Partial<Settings>;
  try {
    parsed = JSON.parse(raw) as Partial<Settings>;
  } catch (err) {
    console.warn("Failed to parse settings file, using defaults.", err);
    return { llm: getDefaultLlmConfig() };
  }
  const merged = {
    llm: parsed.llm ?? getDefaultLlmConfig(),
    search: parsed.search,
    ui: parsed.ui
  };

  const fallback = getDefaultLlmConfig();
  const migrated = (() => {
    const llm = merged.llm as LlmConfig;
    const providers = { ...llm.providers };
    delete (providers as { gemini?: string }).gemini;
    const models = llm.models.filter(
      (model) => (model.provider as string) !== "gemini"
    );
    const hasEmbed = models.some((model) => model.task === "embed");
    return {
      providers,
      models: hasEmbed ? models : [...models, { task: "embed", provider: "mock", model: "mock" }],
      catalog: Array.isArray((llm as LlmConfig).catalog)
        ? (llm as LlmConfig).catalog
        : fallback.catalog
    } satisfies LlmConfig;
  })();

  return settingsSchema.parse({
    llm: migrated,
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

export function updateLlmConfig(next: LlmConfig): LlmConfig {
  return saveSettings({
    llm: llmConfigSchema.parse(next),
    search: getSearchConfig(),
    ui: getUiConfig()
  }).llm;
}

export function getLlmConfig(): LlmConfig {
  return loadSettings().llm;
}

export function getProviderKeys(): ProviderKeyMap {
  return getLlmConfig().providers;
}

export function getSearchConfig(): SearchConfig {
  return loadSettings().search ?? {};
}

export function getUiConfig(): UiConfig {
  return loadSettings().ui ?? {};
}
