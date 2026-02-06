import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { DigestView } from "./DigestView";

type HistoryDigestPageProps = {
  digestId: number;
  onBack: () => void;
  onSelectArticle?: (id: number) => void;
  referenceLinkBehavior?: "internal" | "external";
};

export function HistoryDigestPage({
  digestId,
  onBack,
  onSelectArticle,
  referenceLinkBehavior = "internal"
}: HistoryDigestPageProps) {
  const { data: settings } = trpc.settings.get.useQuery();
  const useBold = (settings?.digest as { useBold?: boolean } | undefined)?.useBold ?? true;
  const { data: digest, isLoading, error } = trpc.digests.byId.useQuery({
    id: digestId
  });

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
      title={`Digest #${digestId}`}
      isLoading={isLoading}
      error={error}
      onSelectArticle={onSelectArticle}
      referenceLinkBehavior={referenceLinkBehavior}
      useBold={useBold}
      headerAction={
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to History
        </Button>
      }
    />
  );
}
