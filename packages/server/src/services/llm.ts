import { z } from "zod";
import { generateText } from "ai";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import {
  createProviderMap,
  getModelConfig,
  type ModelsConfig,
  type LlmTask,
  type ProviderType,
  type ProviderKeyMap,
  type ModelConfig
} from "@dispatch/lib";
import {
  getGradingConfig,
  getModelsConfig,
  getProviders,
  type GradingConfig
} from "./settings";
import {
  computeFinalGrade,
  type GradeInputs
} from "./grading";
import { upsertArticleVector } from "./vector";
import { clearPipelineEvents, recordPipelineEvent } from "./pipeline-log";
import { finishTaskRun, startTaskRun, updateTaskRun } from "./task-log";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const summarySchema = z.string().min(1);

const classifySchema = z.object({
  tags: z.array(z.string().min(1)).min(1)
});

const gradeSchema = z.object({
  importancy: z.number().int().min(1).max(10),
  quality: z.number().int().min(1).max(10),
  justification: z.string().min(1)
});

const fullSummarySchema = z.object({
  oneLiner: z.string().min(1),
  longSummary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1)
});

// ---------------------------------------------------------------------------
// Text extraction / sanitization helpers
// ---------------------------------------------------------------------------

function extractText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const typedItems = value.filter(
      (item) => item && typeof item === "object" && "type" in (item as object)
    ) as Array<Record<string, unknown>>;

    if (typedItems.length > 0) {
      const messageItem = typedItems.find(
        (item) =>
          item.type === "message" || item.type === "final" || item.type === "output"
      );
      if (messageItem) {
        const messageText =
          extractText(messageItem.content) ??
          extractText(messageItem.text) ??
          extractText(messageItem.output);
        if (messageText) return messageText;
      }

      const nonReasoning = typedItems.filter(
        (item) => item.type !== "reasoning" && item.type !== "analysis"
      );
      if (nonReasoning.length > 0) {
        const last = nonReasoning[nonReasoning.length - 1];
        const lastText =
          extractText(last.content) ?? extractText(last.text) ?? extractText(last.output);
        if (lastText) return lastText;
      }
    }

    const parts = value.map((item) => extractText(item)).filter(Boolean) as string[];
    return parts.length ? parts[parts.length - 1] : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "reasoning" || record.type === "analysis") {
      return null;
    }
    if (typeof record.content === "string") return record.content;
    if (typeof record.text === "string") return record.text;
    if (typeof record.output === "string") return record.output;
  }
  return null;
}

function sanitizeSummary(raw: string): string {
  if (!raw) return raw;
  let text = raw;

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const jsonSummary =
        extractText(parsed.summary) ??
        extractText(parsed.final) ??
        extractText(parsed.answer) ??
        extractText(parsed.output);
      if (jsonSummary) {
        text = jsonSummary;
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "");
  text = text.replace(/```(?:thought|analysis)[\s\S]*?```/gi, "");

  const markers = ["final:", "answer:", "summary:"];
  const lower = text.toLowerCase();
  for (const marker of markers) {
    const idx = lower.lastIndexOf(marker);
    if (idx !== -1) {
      text = text.slice(idx + marker.length);
      break;
    }
  }

  text = text.replace(/^(summary|final|answer)\s*[:\-]\s*/i, "");
  text = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  const reasoningHints =
    /(thoughts?|reasoning|analysis|chain[-\s]?of[-\s]?thought|cot)\s*[:：]/i;
  if (reasoningHints.test(text)) {
    const parts = text
      .split(/\r?\n|(?<=\.)\s+(?=[A-Z])/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) {
      text = parts[parts.length - 1];
    }
  }

  const maxLength = 300;
  if (text.length > maxLength) {
    const sentences = text
      .split(/(?<=[.!?。！？])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      text = sentences[sentences.length - 1];
    }
  }
  if (text.length > maxLength) {
    text = text.slice(0, maxLength).trim();
  }

  return text;
}

function sanitizeLongSummary(raw: string): string {
  if (!raw) return raw;
  let text = raw;

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const jsonSummary =
        extractText(parsed.longSummary) ??
        extractText(parsed.summary) ??
        extractText(parsed.final) ??
        extractText(parsed.answer) ??
        extractText(parsed.output);
      if (jsonSummary) {
        text = jsonSummary;
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  text = stripReasoning(text);
  text = text.replace(/```(?:json)?/gi, "");
  text = text.replace(/```/g, "");
  text = text.replace(/^(summary|final|answer)\s*[:\-]\s*/i, "");
  text = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return text;
}

function stripReasoning(raw: string): string {
  let text = raw;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "");
  text = text.replace(/```(?:thought|analysis)[\s\S]*?```/gi, "");
  return text.trim();
}

function parseJsonFromLlm<T>(raw: string, schema: z.ZodType<T>): T {
  const cleaned = stripReasoning(raw);
  // Try to extract JSON from markdown fences or raw text
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/) ?? cleaned.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1]?.trim() ?? cleaned;
  const parsed = JSON.parse(jsonStr);
  return schema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Generic LLM caller
// ---------------------------------------------------------------------------

function getCatalogEntry(config: ModelsConfig, modelId: string) {
  return config.catalog?.find((entry) => entry.id === modelId);
}

function resolveProviderOverrides(
  config: ModelsConfig,
  modelConfig: ModelConfig,
  providers: import("@dispatch/lib").Provider[]
): ProviderKeyMap | undefined {
  const entry = getCatalogEntry(config, modelConfig.modelId);
  if (!entry?.providerId) return undefined;

  const provider = providers.find(p => p.id === entry.providerId);
  if (!provider) return undefined;

  if (modelConfig.providerType === "anthropic") {
    const apiKey = provider.credentials.apiKey?.trim();
    return apiKey ? { anthropic: apiKey } : undefined;
  }

  if (modelConfig.providerType === "openai") {
    const apiKey = provider.credentials.apiKey?.trim();
    const baseUrl = provider.credentials.baseUrl?.trim();
    if (!apiKey || !baseUrl) return undefined;
    return { openai: { apiKey, baseUrl } };
  }

  return undefined;
}

export async function callLlm(
  task: LlmTask,
  prompt: string,
  configOverride?: ModelsConfig
): Promise<string> {
  const config = configOverride ?? getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(config, task, providers);
  const entry = getCatalogEntry(config, modelConfig.modelId);
  const providerOverrides = resolveProviderOverrides(config, modelConfig, providers);

  if (modelConfig.providerType === "mock") {
    return `Mock ${task} response`;
  }

  if (!entry) {
    throw new Error(`Model not found in catalog: ${modelConfig.modelId}`);
  }

  // Get provider credentials
  const modelProvider = entry.providerId ? providers.find(p => p.id === entry.providerId) : undefined;

  if (modelConfig.providerType === "openai") {
    const chatEndpoint = process.env.DISPATCH_LLM_CHAT_ENDPOINT;
    const baseUrl = modelProvider?.credentials.baseUrl;
    if (chatEndpoint && !baseUrl) {
      const apiKey = modelProvider?.credentials.apiKey;
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model: modelConfig.model,
          system_prompt: prompt.split("\n\n")[0],
          input: prompt
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Local LLM chat endpoint error (${response.status}): ${errorText}`
        );
      }

      const payload = (await response.json()) as {
        output?: string;
        response?: string;
        text?: string;
        message?: { content?: string };
        choices?: Array<{ message?: { content?: string }; text?: string }>;
      };

      const candidate =
        extractText(payload.output) ??
        extractText(payload.response) ??
        extractText(payload.text) ??
        extractText(payload.message) ??
        extractText(payload.choices?.[0]?.message) ??
        extractText(payload.choices?.[0]?.text);

      if (!candidate) {
        throw new Error("Local LLM chat endpoint returned no text.");
      }

      return candidate.trim();
    }
  }

  if (!providerOverrides) {
    throw new Error(`Provider config missing for model ${modelConfig.modelId}`);
  }

  const providerMap = createProviderMap(providerOverrides);
  const provider = providerMap[modelConfig.providerType];

  if (!provider) {
    throw new Error(`Unsupported provider: ${modelConfig.providerType}`);
  }

  const model = provider(modelConfig.model);
  const { text } = await generateText({
    model,
    prompt,
    temperature: 0.2
  });

  return text.trim();
}

// ---------------------------------------------------------------------------
// Summarize (one-liner) — backward-compatible, returns a plain string
// ---------------------------------------------------------------------------

export async function summarizeArticle(
  content: string,
  configOverride?: ModelsConfig
): Promise<string> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Cannot summarize empty content");
  }

  const config = configOverride ?? getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(config, "summarize", providers);

  if (modelConfig.providerType === "mock") {
    const short = trimmed.split("\n")[0].slice(0, 140);
    return summarySchema.parse(`Mock summary: ${short}`);
  }

  const prompt =
    "Summarize the article in a single concise sentence. Avoid markdown.\n\nArticle:\n" +
    trimmed;

  const raw = await callLlm("summarize", prompt, configOverride);
  const cleaned = sanitizeSummary(raw);
  return summarySchema.parse(cleaned || raw);
}

// ---------------------------------------------------------------------------
// Classify — returns topic tags
// ---------------------------------------------------------------------------

export async function classifyArticle(
  content: string,
  configOverride?: ModelsConfig
): Promise<string[]> {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const config = configOverride ?? getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(config, "classify", providers);

  if (modelConfig.providerType === "mock") {
    return ["technology", "general"];
  }

  const prompt = `Classify the following article into topic tags. Return a JSON object with a "tags" field containing an array of 1-5 lowercase topic tags (e.g., "technology", "ai", "finance", "health", "science", "politics", "sports", "entertainment").

Respond ONLY with valid JSON, no markdown or explanation.

Example response: {"tags": ["technology", "ai"]}

Article:
${trimmed}`;

  const raw = await callLlm("classify", prompt, configOverride);
  try {
    const result = parseJsonFromLlm(raw, classifySchema);
    return result.tags.map((t) => t.toLowerCase().trim()).slice(0, 5);
  } catch {
    console.warn("Failed to parse classify response, extracting tags from text");
    const words = raw
      .replace(/[^a-zA-Z,\s]/g, "")
      .split(/[,\s]+/)
      .map((w) => w.toLowerCase().trim())
      .filter((w) => w.length > 2 && w.length < 30);
    return words.length > 0 ? words.slice(0, 5) : ["uncategorized"];
  }
}

// ---------------------------------------------------------------------------
// Grade — returns score 1-10 with configurable weighting
// ---------------------------------------------------------------------------

export async function gradeArticle(
  content: string,
  inputs: GradeInputs,
  configOverride?: ModelsConfig,
  gradingOverride?: GradingConfig
): Promise<{
  score: number;
  justification: string;
  importancy: number;
  quality: number;
}> {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      score: 1,
      justification: "Empty content",
      importancy: 1,
      quality: 1
    };
  }

  const gradingConfig = gradingOverride ?? getGradingConfig();

  const config = configOverride ?? getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(config, "grade", providers);

  let base = {
    importancy: 5,
    quality: 5,
    justification: "Mock grade"
  };

  if (modelConfig.providerType !== "mock") {
    const prompt = `Grade the following article with two scores:
- "importancy": integer 1-10 for newsworthiness and impact
- "quality": integer 1-10 for clarity, evidence, and structure
- "justification": one sentence

Ignore source reputation and personal interest; those are handled separately.

Respond ONLY with valid JSON, no markdown or explanation.

Example response: {"importancy": 7, "quality": 6, "justification": "Clear summary of a meaningful development, though details are limited."}

Article:
${trimmed.slice(0, 3000)}`;

    const raw = await callLlm("grade", prompt, configOverride);
    try {
      base = parseJsonFromLlm(raw, gradeSchema);
    } catch {
      console.warn("Failed to parse grade response, using default");
      base = {
        importancy: 5,
        quality: 5,
        justification: "Could not parse grade response"
      };
    }
  }

  const { score } = computeFinalGrade(
    { importancy: base.importancy, quality: base.quality },
    inputs,
    gradingConfig
  );

  return {
    score,
    justification: base.justification,
    importancy: base.importancy,
    quality: base.quality
  };
}

// ---------------------------------------------------------------------------
// Summarize (full) — returns oneLiner + longSummary + keyPoints
// ---------------------------------------------------------------------------

export async function summarizeArticleFull(
  content: string,
  configOverride?: ModelsConfig
): Promise<{ oneLiner: string; longSummary: string; keyPoints: string[] }> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Cannot summarize empty content");
  }

  const config = configOverride ?? getModelsConfig();
  const providers = getProviders();
  const modelConfig = getModelConfig(config, "summarize", providers);

  if (modelConfig.providerType === "mock") {
    const short = trimmed.split("\n")[0].slice(0, 100);
    const long = trimmed.split("\n").slice(0, 4).join(" ").slice(0, 400);
    return {
      oneLiner: `Mock summary: ${short}`,
      longSummary: `Mock long summary: ${long}`,
      keyPoints: ["Mock key point 1", "Mock key point 2"]
    };
  }

  const prompt = `Summarize the following article. Return a JSON object with:
- "oneLiner": a single concise sentence summarizing the article
- "longSummary": 1-3 short paragraphs that preserve all key facts, names, numbers, and context from the article
- "keyPoints": an array of 2-5 key takeaway bullet points (each a short sentence)

Respond ONLY with valid JSON, no markdown or explanation.

Example response: {"oneLiner": "Researchers find new method for...", "longSummary": "Researchers at X report... (longer summary here)", "keyPoints": ["Key finding one.", "Key finding two."]}

Article:
${trimmed}`;

  const raw = await callLlm("summarize", prompt, configOverride);
  try {
    return parseJsonFromLlm(raw, fullSummarySchema);
  } catch {
    // Fallback: use the raw text as a one-liner
    const cleanedShort = sanitizeSummary(raw);
    const cleanedLong = sanitizeLongSummary(raw);
    return {
      oneLiner: cleanedShort || raw.slice(0, 300),
      longSummary: cleanedLong || cleanedShort || raw,
      keyPoints: []
    };
  }
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator: classify → grade → summarize
// ---------------------------------------------------------------------------

export async function processArticle(
  articleId: number,
  configOverride?: ModelsConfig
): Promise<void> {
  clearPipelineEvents(articleId);
  const article = db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .get();

  if (!article) {
    throw new Error(`Article ${articleId} not found`);
  }

  const runId = startTaskRun("pipeline-article", `Pipeline: ${article.title}`, {
    articleId,
    title: article.title,
    sourceId: article.sourceId
  });
  let pipelineHadError = false;

  const content = article.cleanContent || article.rawHtml || article.title;
  if (!content) {
    console.warn(`Article ${articleId} has no content to process`);
    recordPipelineEvent(articleId, "classify", "skip", "No content");
    finishTaskRun(runId, "warning", { reason: "No content" });
    return;
  }

  const source = db
    .select()
    .from(sources)
    .where(eq(sources.id, article.sourceId))
    .get();

  // 1. Classify
  let tags: string[] = [];
  try {
    updateTaskRun(runId, { meta: { step: "classify" } });
    recordPipelineEvent(articleId, "classify", "start");
    tags = await classifyArticle(content, configOverride);
    recordPipelineEvent(articleId, "classify", "success");
  } catch (err) {
    pipelineHadError = true;
    console.error(`[pipeline] classify failed for article ${articleId}`, err);
    recordPipelineEvent(
      articleId,
      "classify",
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 2. Grade
  let grade = { score: 5, justification: "", importancy: 5, quality: 5 };
  try {
    updateTaskRun(runId, { meta: { step: "grade" } });
    recordPipelineEvent(articleId, "grade", "start");
    grade = await gradeArticle(
      content,
      {
        sourceId: article.sourceId,
        sourceName: source?.name ?? article.title,
        sourceUrl: source?.url,
        tags
      },
      configOverride
    );
    recordPipelineEvent(
      articleId,
      "grade",
      "success",
      `score=${grade.score} importancy=${grade.importancy} quality=${grade.quality}`
    );
  } catch (err) {
    pipelineHadError = true;
    console.error(`[pipeline] grade failed for article ${articleId}`, err);
    recordPipelineEvent(
      articleId,
      "grade",
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 3. Summarize (full)
  let summary = article.summary ?? "";
  let summaryLong = article.summaryLong ?? "";
  let keyPoints: string[] = [];
  try {
    updateTaskRun(runId, { meta: { step: "summarize" } });
    recordPipelineEvent(articleId, "summarize", "start");
    const full = await summarizeArticleFull(content, configOverride);
    summary = full.oneLiner;
    summaryLong = full.longSummary;
    keyPoints = full.keyPoints;
    recordPipelineEvent(articleId, "summarize", "success");
  } catch (err) {
    pipelineHadError = true;
    console.error(`[pipeline] summarize failed for article ${articleId}`, err);
    recordPipelineEvent(
      articleId,
      "summarize",
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 4. Persist results
  db.update(articles)
    .set({
      tags: JSON.stringify(tags),
      grade: grade.score,
      importancy: grade.importancy,
      quality: grade.quality,
      summary,
      summaryLong,
      keyPoints: JSON.stringify(keyPoints),
      processedAt: new Date()
    })
    .where(eq(articles.id, articleId))
    .run();

  // 5. Vectorize for related-articles search
  try {
    updateTaskRun(runId, { meta: { step: "vectorize" } });
    recordPipelineEvent(articleId, "vectorize", "start");
    await upsertArticleVector(
      { ...article, summary, summaryLong },
      configOverride
    );
    recordPipelineEvent(articleId, "vectorize", "success");
  } catch (err) {
    pipelineHadError = true;
    console.error(`[pipeline] vectorization failed for article ${articleId}`, err);
    recordPipelineEvent(
      articleId,
      "vectorize",
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }

  finishTaskRun(runId, pipelineHadError ? "warning" : "success", {
    articleId,
    title: article.title
  });
}
