import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

type HistoryPageProps = {
  onOpenDigest: (id: number) => void;
};

type DigestContent = {
  overview?: string;
};

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) return objectMatch[1].trim();
  return trimmed;
}

function getDigestPreview(content: string): string {
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Digest History</h2>
        <p className="text-sm text-slate-500">
          Browse previous digests and open full details.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
          <CardDescription>Recent digest runs.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="text-sm text-slate-500">Loading history…</div>
          )}
          {error && (
            <div className="text-sm text-rose-600">
              Failed to load history: {error.message}
            </div>
          )}
          {!isLoading && !error && digestCards.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              No digests yet.
            </div>
          )}
          {!isLoading && !error && digestCards.length > 0 && (
            <div className="space-y-3">
              {digestCards.map((digest) => (
                <div key={digest.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Digest #{digest.id}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(digest.generatedAt).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => onOpenDigest(digest.id)}
                    >
                      Open
                    </Button>
                  </div>
                  <Separator className="my-3" />
                  <div className="whitespace-pre-line text-sm text-slate-700">
                    {digest.preview}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
