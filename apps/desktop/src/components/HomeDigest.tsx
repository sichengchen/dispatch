import { useMemo } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { DigestView } from "./DigestView";

type HomeDigestProps = {
  onSelectArticle?: (id: number) => void;
  referenceLinkBehavior?: "internal" | "external";
};

export function HomeDigest({
  onSelectArticle,
  referenceLinkBehavior = "internal"
}: HomeDigestProps) {
  const utils = trpc.useUtils();
  const { data: digest, isLoading, error } = trpc.digests.latest.useQuery();
  const generateDigest = trpc.digests.generate.useMutation({
    onSuccess: () => {
      utils.digests.latest.invalidate();
      utils.digests.list.invalidate();
      toast.success("Digest generated");
    },
    onError: (err) => {
      toast.error(err.message || "Digest generation failed");
    }
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
      title="Today's Digest"
      isLoading={isLoading}
      error={error}
      onSelectArticle={onSelectArticle}
      referenceLinkBehavior={referenceLinkBehavior}
      headerAction={
        <Button
          size="sm"
          variant="outline"
          onClick={() => generateDigest.mutate()}
          disabled={generateDigest.isPending}
        >
          {generateDigest.isPending ? "Generating..." : "Refresh"}
        </Button>
      }
    />
  );
}
