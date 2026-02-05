import { z } from "zod";
import { t } from "../trpc";
import {
  getModelsConfig,
  getUiConfig,
  getGradingConfig,
  getDigestConfig,
  getFetchScheduleConfig,
  getPipelineScheduleConfig,
  getAgentConfig,
  saveSettings
} from "../services/settings";

const assignmentSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed", "digest", "skill"]),
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
  models: modelsConfigSchema,
  ui: uiConfigSchema.optional(),
  grading: gradingConfigSchema.optional(),
  digest: digestConfigSchema.optional(),
  fetchSchedule: fetchScheduleConfigSchema.optional(),
  pipelineSchedule: pipelineScheduleConfigSchema.optional(),
  agent: agentConfigSchema.optional(),
});

export const settingsRouter = t.router({
  get: t.procedure.query(() => {
    return {
      models: getModelsConfig(),
      ui: getUiConfig(),
      grading: getGradingConfig(),
      digest: getDigestConfig(),
      fetchSchedule: getFetchScheduleConfig(),
      pipelineSchedule: getPipelineScheduleConfig(),
      agent: getAgentConfig(),
    };
  }),
  update: t.procedure.input(settingsSchema).mutation(({ input }) => {
    const next = saveSettings(input);
    return next.models;
  })
});
