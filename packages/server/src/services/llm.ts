import { z } from "zod";
import { generateText } from "ai";
import { createProviderMap, getModelConfig, type LlmConfig } from "@dispatch/lib";
import { getLlmConfig } from "./settings";

const summarySchema = z.string().min(1);

export async function summarizeArticle(
  content: string,
  configOverride?: LlmConfig
): Promise<string> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Cannot summarize empty content");
  }

  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, "summarize");

  if (modelConfig.provider === "mock") {
    const short = trimmed.split("\n")[0].slice(0, 140);
    return summarySchema.parse(`Mock summary: ${short}`);
  }

  const providerMap = createProviderMap(config.providers);
  const provider = providerMap[modelConfig.provider];

  if (!provider) {
    throw new Error(`Unsupported provider: ${modelConfig.provider}`);
  }

  const model = provider(modelConfig.model);
  const prompt =
    "Summarize the article in a single concise sentence. Avoid markdown.\n\nArticle:\n" +
    trimmed;

  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.2,
    maxTokens: 120
  });

  return summarySchema.parse(text.trim());
}
