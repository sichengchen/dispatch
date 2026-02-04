import { z } from "zod";
import { generateText } from "ai";
import { db, articles } from "@dispatch/db";
import { eq } from "drizzle-orm";
import {
  createProviderMap,
  getModelConfig,
  type LlmConfig,
  type LlmTask,
  type ProviderId,
  type ProviderKeyMap,
  type ModelConfig
} from "@dispatch/lib";
import { getLlmConfig } from "./settings";
import { upsertArticleVector } from "./vector";
import { clearPipelineEvents, recordPipelineEvent } from "./pipeline-log";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const summarySchema = z.string().min(1);

const classifySchema = z.object({
  tags: z.array(z.string().min(1)).min(1)
});

const gradeSchema = z.object({
  score: z.number().int().min(1).max(10),
  justification: z.string().min(1)
});

const fullSummarySchema = z.object({
  oneLiner: z.string().min(1),
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

function getCatalogEntry(
  config: LlmConfig,
  provider: ProviderId,
  model: string
) {
  return config.catalog?.find(
    (entry) => entry.provider === provider && entry.model === model
  );
}

function resolveOpenAiApiKey(config: LlmConfig, modelConfig: ModelConfig) {
  if (modelConfig.provider !== "openaiCompatible") {
    return null;
  }
  const entry = getCatalogEntry(config, modelConfig.provider, modelConfig.model);
  const entryKey = entry?.providerConfig?.apiKey?.trim();
  return entryKey || config.providers.openaiCompatible?.apiKey || null;
}

function resolveOpenAiBaseUrl(config: LlmConfig, modelConfig: ModelConfig) {
  if (modelConfig.provider !== "openaiCompatible") {
    return null;
  }
  const entry = getCatalogEntry(config, modelConfig.provider, modelConfig.model);
  const entryBaseUrl = entry?.providerConfig?.baseUrl?.trim();
  return entryBaseUrl || config.providers.openaiCompatible?.baseUrl || null;
}

function resolveProviderOverrides(
  config: LlmConfig,
  modelConfig: ModelConfig
): ProviderKeyMap | undefined {
  const entry = getCatalogEntry(config, modelConfig.provider, modelConfig.model);
  if (!entry?.providerConfig) return undefined;

  if (modelConfig.provider === "anthropic") {
    const apiKey = entry.providerConfig.apiKey?.trim();
    return apiKey ? { anthropic: apiKey } : undefined;
  }

  if (modelConfig.provider === "openaiCompatible") {
    const apiKey =
      entry.providerConfig.apiKey?.trim() || config.providers.openaiCompatible?.apiKey;
    const baseUrl =
      entry.providerConfig.baseUrl?.trim() || config.providers.openaiCompatible?.baseUrl;
    if (!apiKey || !baseUrl) return undefined;
    return { openaiCompatible: { apiKey, baseUrl } };
  }

  return undefined;
}

async function callLlm(
  task: LlmTask,
  prompt: string,
  configOverride?: LlmConfig
): Promise<string> {
  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, task);
  const providerOverrides = resolveProviderOverrides(config, modelConfig);

  if (modelConfig.provider === "mock") {
    return `Mock ${task} response`;
  }

  if (modelConfig.provider === "openaiCompatible") {
    const chatEndpoint = process.env.DISPATCH_LLM_CHAT_ENDPOINT;
    const baseUrl = resolveOpenAiBaseUrl(config, modelConfig);
    if (chatEndpoint && !baseUrl) {
      const apiKey = resolveOpenAiApiKey(config, modelConfig);
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

  const providerMap = createProviderMap(config.providers, providerOverrides);
  const provider = providerMap[modelConfig.provider];

  if (!provider) {
    throw new Error(`Unsupported provider: ${modelConfig.provider}`);
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
  configOverride?: LlmConfig
): Promise<string[]> {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, "classify");

  if (modelConfig.provider === "mock") {
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
// Grade — returns score 1-10 with justification
// ---------------------------------------------------------------------------

export async function gradeArticle(
  content: string,
  sourceName: string,
  configOverride?: LlmConfig
): Promise<{ score: number; justification: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { score: 1, justification: "Empty content" };

  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, "grade");

  if (modelConfig.provider === "mock") {
    return { score: 5, justification: "Mock grade" };
  }

  const prompt = `Grade the following article on a scale of 1-10 based on information density, depth, and relevance. Consider the source "${sourceName}" in your assessment.

Return a JSON object with:
- "score": integer 1-10
- "justification": one sentence explaining the score

Respond ONLY with valid JSON, no markdown or explanation.

Example response: {"score": 7, "justification": "In-depth technical analysis with actionable insights."}

Article:
${trimmed.slice(0, 3000)}`;

  const raw = await callLlm("grade", prompt, configOverride);
  try {
    return parseJsonFromLlm(raw, gradeSchema);
  } catch {
    console.warn("Failed to parse grade response, using default");
    return { score: 5, justification: "Could not parse grade response" };
  }
}

// ---------------------------------------------------------------------------
// Summarize (full) — returns oneLiner + keyPoints
// ---------------------------------------------------------------------------

export async function summarizeArticleFull(
  content: string,
  configOverride?: LlmConfig
): Promise<{ oneLiner: string; keyPoints: string[] }> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Cannot summarize empty content");
  }

  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, "summarize");

  if (modelConfig.provider === "mock") {
    const short = trimmed.split("\n")[0].slice(0, 100);
    return {
      oneLiner: `Mock summary: ${short}`,
      keyPoints: ["Mock key point 1", "Mock key point 2"]
    };
  }

  const prompt = `Summarize the following article. Return a JSON object with:
- "oneLiner": a single concise sentence summarizing the article
- "keyPoints": an array of 2-5 key takeaway bullet points (each a short sentence)

Respond ONLY with valid JSON, no markdown or explanation.

Example response: {"oneLiner": "Researchers find new method for...", "keyPoints": ["Key finding one.", "Key finding two."]}

Article:
${trimmed}`;

  const raw = await callLlm("summarize", prompt, configOverride);
  try {
    return parseJsonFromLlm(raw, fullSummarySchema);
  } catch {
    // Fallback: use the raw text as a one-liner
    const cleaned = sanitizeSummary(raw);
    return {
      oneLiner: cleaned || raw.slice(0, 300),
      keyPoints: []
    };
  }
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator: classify → grade → summarize
// ---------------------------------------------------------------------------

export async function processArticle(
  articleId: number,
  configOverride?: LlmConfig
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

  const content = article.cleanContent || article.rawHtml || article.title;
  if (!content) {
    console.warn(`Article ${articleId} has no content to process`);
    recordPipelineEvent(articleId, "classify", "skip", "No content");
    return;
  }

  // 1. Classify
  let tags: string[] = [];
  try {
    recordPipelineEvent(articleId, "classify", "start");
    tags = await classifyArticle(content, configOverride);
    recordPipelineEvent(articleId, "classify", "success");
  } catch (err) {
    console.error(`[pipeline] classify failed for article ${articleId}`, err);
    recordPipelineEvent(
      articleId,
      "classify",
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }

  // 2. Grade
  let grade = { score: 5, justification: "" };
  try {
    recordPipelineEvent(articleId, "grade", "start");
    grade = await gradeArticle(content, article.title, configOverride);
    recordPipelineEvent(articleId, "grade", "success");
  } catch (err) {
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
  let keyPoints: string[] = [];
  try {
    recordPipelineEvent(articleId, "summarize", "start");
    const full = await summarizeArticleFull(content, configOverride);
    summary = full.oneLiner;
    keyPoints = full.keyPoints;
    recordPipelineEvent(articleId, "summarize", "success");
  } catch (err) {
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
      summary,
      keyPoints: JSON.stringify(keyPoints),
      processedAt: new Date()
    })
    .where(eq(articles.id, articleId))
    .run();

  // 5. Vectorize for related-articles search
  try {
    recordPipelineEvent(articleId, "vectorize", "start");
    await upsertArticleVector(
      { ...article, summary },
      configOverride
    );
    recordPipelineEvent(articleId, "vectorize", "success");
  } catch (err) {
    console.error(`[pipeline] vectorization failed for article ${articleId}`, err);
    recordPipelineEvent(
      articleId,
      "vectorize",
      "error",
      err instanceof Error ? err.message : String(err)
    );
  }
}
