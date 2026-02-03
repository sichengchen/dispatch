import { z } from "zod";
import { t } from "../trpc";
import { getLlmConfig, updateLlmConfig } from "../services/settings";

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

const llmConfigSchema = z.object({
  providers: providerKeysSchema,
  models: z.array(modelConfigSchema)
});

export const settingsRouter = t.router({
  get: t.procedure.query(() => {
    return getLlmConfig();
  }),
  update: t.procedure.input(llmConfigSchema).mutation(({ input }) => {
    return updateLlmConfig(input);
  })
});
