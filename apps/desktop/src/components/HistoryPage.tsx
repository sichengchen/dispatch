import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { getDigestPreview } from "../lib/digest-utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

type HistoryPageProps = {
  onOpenDigest: (id: number) => void;
};

export function HistoryPage({ onOpenDigest }: HistoryPageProps) {
  const { data: digests = [], isLoading, error } = trpc.digests.list.useQuery({
    limit: 30
  });

  const digestCards = useMemo(() => {
    return digests.map((digest) => ({
      ...digest,
      preview: getDigestPreview(digest.content)
    }));
  }, [digests]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8">
            <div className="text-sm text-slate-500 text-center">Loading history…</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8">
            <div className="text-sm text-rose-600 text-center">
              Failed to load history: {error.message}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (digestCards.length === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8">
            <div className="text-sm text-slate-500 text-center">No digests yet.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {digestCards.map((digest) => (
        <Card key={digest.id}>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base">Digest #{digest.id}</CardTitle>
              <CardDescription>
                {new Date(digest.generatedAt).toLocaleString()}
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => onOpenDigest(digest.id)}
            >
              Open
            </Button>
          </CardHeader>
          <CardContent>
            <div className="whitespace-pre-line text-sm text-slate-700">
              {digest.preview}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
