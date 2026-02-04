import { z } from "zod";
import { t } from "../trpc";
import {
  getLlmConfig,
  getSearchConfig,
  getUiConfig,
  saveSettings
} from "../services/settings";

const assignmentSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed"]),
  modelId: z.string().min(1)
});

const catalogSchema = z.object({
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

const llmConfigSchema = z.object({
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
  models: llmConfigSchema,
  search: searchConfigSchema.optional(),
  ui: uiConfigSchema.optional()
});

export const settingsRouter = t.router({
  get: t.procedure.query(() => {
    return {
      models: getLlmConfig(),
      search: getSearchConfig(),
      ui: getUiConfig()
    };
  }),
  update: t.procedure.input(settingsSchema).mutation(({ input }) => {
    const next = saveSettings(input);
    return next.models;
  })
});
