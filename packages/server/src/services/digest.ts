import { db, articles, sources, digests } from "@dispatch/db";
import { desc, gte, and, isNotNull, eq } from "drizzle-orm";
import { callLlm } from "./llm";
import { getDigestConfig } from "./settings";

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
      keyPoints: articles.keyPoints,
      grade: articles.grade,
      tags: articles.tags,
      sourceName: sources.name,
    })
    .from(articles)
    .leftJoin(sources, eq(articles.sourceId, sources.id))
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

  const articlesBlock = topArticles
    .map((a, i) => {
      const kp = a.keyPoints
        ? (JSON.parse(a.keyPoints) as string[])
        : [];
      return [
        `${i + 1}. "${a.title}" (Grade: ${a.grade}/10, Source: ${a.sourceName ?? "Unknown"})`,
        `   Summary: ${a.summary ?? "No summary"}`,
        kp.length > 0
          ? `   Key points:\n${kp.map((p) => `   - ${p}`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const prompt = `You are a news briefing editor. Create a concise daily briefing from these top-rated articles from the last ${hoursBack} hours.

Structure the briefing as:
1. A brief 1-2 sentence overview of today's main themes
2. A section for each major topic/story, citing the relevant article(s)
3. A brief "Also notable" section for remaining items

Keep the tone professional and informative. Use plain text, no markdown.

Articles:
${articlesBlock}`;

  const content = await callLlm("digest", prompt);

  const articleIds = topArticles.map((a) => a.id);
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
