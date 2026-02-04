import { z } from "zod";
import { t } from "../trpc";
import {
  getModelsConfig,
  getSearchConfig,
  getUiConfig,
  getGradingConfig,
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

const modelsConfigSchema = z.object({
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

const settingsSchema = z.object({
  models: modelsConfigSchema,
  search: searchConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
  grading: gradingConfigSchema.optional()
});

export const settingsRouter = t.router({
  get: t.procedure.query(() => {
    return {
      models: getModelsConfig(),
      search: getSearchConfig(),
      ui: getUiConfig(),
      grading: getGradingConfig()
    };
  }),
  update: t.procedure.input(settingsSchema).mutation(({ input }) => {
    const next = saveSettings(input);
    return next.models;
  })
});
