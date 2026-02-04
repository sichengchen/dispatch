import { z } from "zod";
import { generateText } from "ai";
import { createProviderMap, getModelConfig, type LlmConfig } from "@dispatch/lib";
import { getLlmConfig } from "./settings";

const summarySchema = z.string().min(1);

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

  // If the model returned JSON, extract common summary fields.
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

  // Strip common "thinking" wrappers used by reasoning models.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "");
  text = text.replace(/```(?:thought|analysis)[\s\S]*?```/gi, "");

  // If a "final" marker exists, keep only the last segment after it.
  const markers = ["final:", "answer:", "summary:"];
  const lower = text.toLowerCase();
  for (const marker of markers) {
    const idx = lower.lastIndexOf(marker);
    if (idx !== -1) {
      text = text.slice(idx + marker.length);
      break;
    }
  }

  // Remove any leading labels and collapse whitespace/newlines.
  text = text.replace(/^(summary|final|answer)\s*[:\-]\s*/i, "");
  text = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  // If reasoning markers still exist, keep only the last paragraph/line.
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

  // Enforce concise output: prefer the last sentence when text is too long.
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

  if (modelConfig.provider === "openaiCompatible") {
    const chatEndpoint = process.env.DISPATCH_LLM_CHAT_ENDPOINT;
    if (chatEndpoint) {
      const apiKey = config.providers.openaiCompatible?.apiKey;
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          model: modelConfig.model,
          system_prompt:
            "Summarize the article in a single concise sentence. Avoid markdown.",
          input: trimmed
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

      const cleaned = sanitizeSummary(candidate.trim());
      return summarySchema.parse(cleaned || candidate.trim());
    }
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

  const cleaned = sanitizeSummary(text.trim());
  return summarySchema.parse(cleaned || text.trim());
}
