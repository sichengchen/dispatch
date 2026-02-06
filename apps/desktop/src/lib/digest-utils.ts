type TrpcClient = {
  articles: {
    byId: {
      query: (input: { id: number }) => Promise<{ id: number; url: string | null } | null>;
    };
  };
};

export type DigestContent = {
  overview: string;
  topics: {
    topic: string;
    keyPoints: { text: string; refs: number[] }[];
  }[];
};

export function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) return objectMatch[1].trim();
  return trimmed;
}

export function getDigestPreview(content: string): string {
  try {
    const cleaned = extractJsonBlock(content);
    const parsed = JSON.parse(cleaned) as DigestContent | string;
    if (typeof parsed === "string") {
      return getDigestPreview(parsed);
    }
    if (parsed?.overview) return parsed.overview;
  } catch {
    // ignore parse errors
  }
  return content;
}

export function parseDigestContent(raw?: string | null): DigestContent | null {
  if (!raw) return null;
  const cleaned = extractJsonBlock(raw);
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (typeof parsed === "string") {
      return parseDigestContent(parsed);
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      "overview" in parsed &&
      "topics" in parsed
    ) {
      const typed = parsed as DigestContent;
      if (!typed?.overview || !Array.isArray(typed.topics)) return null;
      return typed;
    }
  } catch {
    return null;
  }
  return null;
}

export async function openArticleReference(
  articleId: number,
  behavior: "internal" | "external",
  trpcClient: TrpcClient,
  onOpenInternal?: (id: number) => void
): Promise<void> {
  if (behavior === "external") {
    try {
      const article = await trpcClient.articles.byId.query({ id: articleId });
      if (article?.url) {
        window.open(article.url, "_blank", "noopener,noreferrer");
      } else {
        console.warn("Article URL not available");
        // Fallback to internal viewer
        onOpenInternal?.(articleId);
      }
    } catch (err) {
      console.error("Failed to fetch article for external opening", err);
      // Fallback to internal viewer on error
      onOpenInternal?.(articleId);
    }
  } else {
    onOpenInternal?.(articleId);
  }
}
