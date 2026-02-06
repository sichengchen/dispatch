type TrpcClient = {
  articles: {
    byId: {
      query: (input: { id: number }) => Promise<{ id: number; url: string | null } | null>;
    };
  };
};

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
