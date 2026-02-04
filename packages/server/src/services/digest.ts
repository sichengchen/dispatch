import { db, articles, digests } from "@dispatch/db";
import { desc, gte, and, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { callLlm } from "./llm";
import { getDigestConfig } from "./settings";

const digestTopicSchema = z.object({
  topic: z.string().min(1),
  keyPoints: z
    .array(
      z.object({
        text: z.string().min(1),
        refs: z.array(z.number().int().positive()).min(1)
      })
    )
    .min(1)
});

const digestSchema = z.object({
  overview: z.string().min(1),
  topics: z.array(digestTopicSchema).min(1)
});

function stripReasoning(raw: string): string {
  let text = raw;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, "");
  text = text.replace(/```(?:thought|analysis)[\s\S]*?```/gi, "");
  return text.trim();
}

function parseDigestJson(raw: string) {
  const cleaned = stripReasoning(raw);
  const jsonMatch =
    cleaned.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    cleaned.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1]?.trim() ?? cleaned;
  const parsed = JSON.parse(jsonStr);
  return digestSchema.parse(parsed);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((tag) => typeof tag === "string") as string[];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

export async function generateDigest(options?: {
  topN?: number;
  hoursBack?: number;
}): Promise<{ id: number; content: string; articleIds: number[] }> {
  const config = getDigestConfig();
  const topN = options?.topN ?? config.topN ?? 10;
  const hoursBack = options?.hoursBack ?? config.hoursBack ?? 24;

  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const topArticles = db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      tags: articles.tags,
    })
    .from(articles)
    .where(
      and(
        gte(articles.publishedAt, cutoff),
        isNotNull(articles.grade),
        isNotNull(articles.processedAt)
      )
    )
    .orderBy(desc(articles.grade))
    .limit(topN)
    .all();

  if (topArticles.length === 0) {
    const content = "No notable articles in the last " + hoursBack + " hours.";
    const result = db
      .insert(digests)
      .values({ generatedAt: new Date(), content, articleIds: "[]" })
      .run();
    return {
      id: Number(result.lastInsertRowid),
      content,
      articleIds: [],
    };
  }

  const articleIds = topArticles.map((a) => a.id);
  const articlesWithTopic = topArticles.map((article, index) => ({
    index: index + 1,
    id: article.id,
    title: article.title,
    summary: article.summary ?? "No summary",
    topic: parseTags(article.tags)[0] ?? "Other"
  }));

  const topics = new Map<string, typeof articlesWithTopic>();
  for (const article of articlesWithTopic) {
    const bucket = topics.get(article.topic) ?? [];
    bucket.push(article);
    topics.set(article.topic, bucket);
  }

  const topicsBlock = Array.from(topics.entries())
    .map(([topic, items]) => {
      const list = items
        .map(
          (item) =>
            `  [${item.index}] ${item.title}\n     Summary: ${item.summary}`
        )
        .join("\n");
      return `Topic: ${topic}\n${list}`;
    })
    .join("\n\n");

  const prompt = `You are a news briefing editor. Use the summaries below to create a topic-based digest.

Rules:
- Group by the provided Topic sections.
- Merge overlapping information across articles.
- Produce GENERAL key points for each topic (no repetition).
- For each key point and detail sentence, include references as article numbers.
- If a point is supported by multiple articles, include multiple refs.
- Return STRICT JSON, no markdown.

JSON schema:
{
  "overview": "1-2 sentence overview",
  "topics": [
    {
      "topic": "Topic name",
      "keyPoints": [
        { "text": "Key point", "refs": [1,3] }
      ]
    }
  ]
}

Topics with articles:
${topicsBlock}`;

  const raw = await callLlm("digest", prompt);
  let content: string;
  try {
    const parsed = parseDigestJson(raw);
    content = JSON.stringify(parsed);
  } catch {
    content = raw;
  }
  const result = db
    .insert(digests)
    .values({
      generatedAt: new Date(),
      content,
      articleIds: JSON.stringify(articleIds),
    })
    .run();

  return {
    id: Number(result.lastInsertRowid),
    content,
    articleIds,
  };
}
