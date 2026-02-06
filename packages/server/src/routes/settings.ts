import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { t } from "../trpc";
import {
  getModelsConfig,
  getUiConfig,
  getGradingConfig,
  getDigestConfig,
  getFetchScheduleConfig,
  getPipelineScheduleConfig,
  getAgentConfig,
  saveSettings,
  loadSettings
} from "../services/settings";
import { discoverModels as discoverModelsService } from "../services/model-discovery";

const assignmentSchema = z.object({
  task: z.enum(["summarize", "classify", "grade", "embed", "digest", "skill"]),
  modelId: z.string().min(1)
});

const catalogSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().optional(),
  model: z.string().min(1),
  label: z.string().optional(),
  capabilities: z.array(z.enum(["chat", "embedding"])).optional()
});

const modelsConfigSchema = z.object({
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

const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["anthropic", "openai-compatible"]),
  credentials: z.object({
    apiKey: z.string().min(1),
    baseUrl: z.string().optional()
  })
});

const addProviderInputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["anthropic", "openai-compatible"]),
  credentials: z.object({
    apiKey: z.string().min(1),
    baseUrl: z.string().optional()
  })
});

const updateProviderInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  type: z.enum(["anthropic", "openai-compatible"]).optional(),
  credentials: z.object({
    apiKey: z.string().min(1).optional(),
    baseUrl: z.string().optional()
  }).optional()
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

export const settingsRouter = t.router({
  get: t.procedure.query(() => {
    const settings = loadSettings();
    return {
      providers: settings.providers,
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
  }),

  // Provider management endpoints
  getProviders: t.procedure.query(() => {
    const settings = loadSettings();
    return settings.providers ?? [];
  }),

  addProvider: t.procedure.input(addProviderInputSchema).mutation(({ input }) => {
    const settings = loadSettings();
    const newProvider = {
      id: crypto.randomUUID(),
      name: input.name,
      type: input.type,
      credentials: input.credentials
    };

    const updatedSettings = {
      ...settings,
      providers: [...(settings.providers ?? []), newProvider]
    };

    saveSettings(updatedSettings);
    return newProvider;
  }),

  updateProvider: t.procedure.input(updateProviderInputSchema).mutation(({ input }) => {
    const settings = loadSettings();
    const providers = settings.providers ?? [];

    const providerIndex = providers.findIndex((p) => p.id === input.id);
    if (providerIndex === -1) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Provider with id ${input.id} not found`
      });
    }

    const updatedProvider = {
      ...providers[providerIndex],
      ...(input.name && { name: input.name }),
      ...(input.type && { type: input.type }),
      ...(input.credentials && {
        credentials: {
          ...providers[providerIndex].credentials,
          ...input.credentials
        }
      })
    };

    const updatedProviders = [...providers];
    updatedProviders[providerIndex] = updatedProvider;

    const updatedSettings = {
      ...settings,
      providers: updatedProviders
    };

    saveSettings(updatedSettings);
    return updatedProvider;
  }),

  deleteProvider: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => {
      const settings = loadSettings();
      const providers = settings.providers ?? [];

      const providerExists = providers.some((p) => p.id === input.id);
      if (!providerExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Provider with id ${input.id} not found`
        });
      }

      const updatedSettings = {
        ...settings,
        providers: providers.filter((p) => p.id !== input.id)
      };

      saveSettings(updatedSettings);
      return { success: true };
    }),

  // Model discovery endpoint
  discoverModels: t.procedure
    .input(z.object({
      providerId: z.string().min(1),
      forceRefresh: z.boolean().default(false)
    }))
    .query(async ({ input }) => {
      const settings = loadSettings();
      const providers = settings.providers ?? [];

      const provider = providers.find((p) => p.id === input.providerId);
      if (!provider) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Provider with id ${input.providerId} not found`
        });
      }

      try {
        const models = await discoverModelsService(provider, input.forceRefresh);
        return models;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to discover models"
        });
      }
    }),

  // Model management endpoints
  addModel: t.procedure
    .input(catalogSchema)
    .mutation(({ input }) => {
      const settings = loadSettings();
      const catalog = settings.models.catalog ?? [];

      const newModel = {
        id: input.id,
        providerId: input.providerId,
        model: input.model,
        label: input.label,
        capabilities: input.capabilities
      };

      const updatedSettings = {
        ...settings,
        models: {
          ...settings.models,
          catalog: [...catalog, newModel]
        }
      };

      saveSettings(updatedSettings);
      return newModel;
    }),

  updateModel: t.procedure
    .input(catalogSchema)
    .mutation(({ input }) => {
      const settings = loadSettings();
      const catalog = settings.models.catalog ?? [];

      const modelExists = catalog.some((m) => m.id === input.id);
      if (!modelExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Model with id ${input.id} not found`
        });
      }

      const updatedCatalog = catalog.map((m) =>
        m.id === input.id
          ? {
              id: input.id,
              providerId: input.providerId,
              model: input.model,
              label: input.label,
              capabilities: input.capabilities
            }
          : m
      );

      const updatedSettings = {
        ...settings,
        models: {
          ...settings.models,
          catalog: updatedCatalog
        }
      };

      saveSettings(updatedSettings);
      return updatedCatalog.find((m) => m.id === input.id);
    }),

  deleteModel: t.procedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ input }) => {
      const settings = loadSettings();
      const catalog = settings.models.catalog ?? [];

      const modelExists = catalog.some((m) => m.id === input.id);
      if (!modelExists) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Model with id ${input.id} not found`
        });
      }

      // Also remove any assignments using this model
      const updatedAssignments = settings.models.assignment.filter(
        (a) => a.modelId !== input.id
      );

      const updatedSettings = {
        ...settings,
        models: {
          assignment: updatedAssignments,
          catalog: catalog.filter((m) => m.id !== input.id)
        }
      };

      saveSettings(updatedSettings);
      return { success: true };
    })
});
