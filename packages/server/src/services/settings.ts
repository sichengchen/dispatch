import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { LlmConfig, ProviderKeyMap } from "@dispatch/lib";
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
  task: z.enum(["summarize", "classify", "grade"]),
  provider: z.enum(["anthropic", "openaiCompatible", "mock"]),
  model: z.string().min(1)
});

const llmConfigSchema: z.ZodType<LlmConfig> = z.object({
  providers: providerKeysSchema,
  models: z.array(modelConfigSchema)
});

const settingsSchema = z.object({
  llm: llmConfigSchema
});

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
  const parsed = JSON.parse(raw) as Partial<Settings>;
  const merged = {
    llm: parsed.llm ?? getDefaultLlmConfig()
  };

  const fallback = getDefaultLlmConfig();
  const migrated = (() => {
    const llm = merged.llm as LlmConfig;
    const providers = { ...llm.providers };
    delete (providers as { gemini?: string }).gemini;
    const models = llm.models.filter(
      (model) => (model.provider as string) !== "gemini"
    );
    return {
      providers,
      models: models.length ? models : fallback.models
    } satisfies LlmConfig;
  })();

  return settingsSchema.parse({ llm: migrated });
}

export function saveSettings(next: Settings): Settings {
  const filePath = getSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const validated = settingsSchema.parse(next);
  fs.writeFileSync(filePath, JSON.stringify(validated, null, 2));
  return validated;
}

export function updateLlmConfig(next: LlmConfig): LlmConfig {
  return saveSettings({ llm: llmConfigSchema.parse(next) }).llm;
}

export function getLlmConfig(): LlmConfig {
  return loadSettings().llm;
}

export function getProviderKeys(): ProviderKeyMap {
  return getLlmConfig().providers;
}
