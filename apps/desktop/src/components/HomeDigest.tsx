import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { DigestView } from "./DigestView";

type HomeDigestProps = {
  onSelectArticle?: (id: number) => void;
  referenceLinkBehavior?: "internal" | "external";
};

export function HomeDigest({
  onSelectArticle,
  referenceLinkBehavior = "internal"
}: HomeDigestProps) {
  const { data: settings } = trpc.settings.get.useQuery();
  const useBold = (settings?.digest as { useBold?: boolean } | undefined)?.useBold ?? true;
  const { data: digest, isLoading, error } = trpc.digests.latest.useQuery();

  const { data: articles = [] } = trpc.articles.byIds.useQuery(
    { ids: digest?.articleIds ?? [] },
    { enabled: (digest?.articleIds?.length ?? 0) > 0 }
  );

  const sortedArticles = useMemo(() => {
    return [...articles].sort((a, b) => {
      const gradeA = (a as { grade?: number | null }).grade ?? 0;
      const gradeB = (b as { grade?: number | null }).grade ?? 0;
      return gradeB - gradeA;
    });
  }, [articles]);

  return (
    <DigestView
      digest={digest}
      articles={sortedArticles}
      title="Today's Digest"
      isLoading={isLoading}
      error={error}
      onSelectArticle={onSelectArticle}
      referenceLinkBehavior={referenceLinkBehavior}
      useBold={useBold}
    />
  );
}
