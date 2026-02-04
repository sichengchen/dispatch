import { z } from "zod";
import { t } from "../trpc";
import { getLlmConfig, getSearchConfig, saveSettings } from "../services/settings";

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

const catalogSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(["anthropic", "openaiCompatible", "mock"]),
  model: z.string().min(1),
  label: z.string().min(1).optional(),
  providerConfig: z
    .object({
      apiKey: z.string().min(1).optional(),
      baseUrl: z.string().url().optional()
    })
    .optional()
});

const llmConfigSchema = z.object({
  providers: providerKeysSchema,
  models: z.array(modelConfigSchema),
  catalog: z.array(catalogSchema).optional()
});

const searchConfigSchema = z.object({
  provider: z.enum(["brave", "serper", "duckduckgo"]).optional(),
  apiKey: z.string().min(1).optional(),
  endpoint: z.string().url().optional()
});

const settingsSchema = z.object({
  llm: llmConfigSchema,
  search: searchConfigSchema.optional()
});

export const settingsRouter = t.router({
  get: t.procedure.query(() => {
    return {
      llm: getLlmConfig(),
      search: getSearchConfig()
    };
  }),
  update: t.procedure.input(settingsSchema).mutation(({ input }) => {
    const next = saveSettings(input);
    return next.llm;
  })
});
