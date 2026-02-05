import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type HomeDigestProps = {
  onSelectArticle?: (id: number) => void;
};

type DigestContent = {
  overview: string;
  topics: {
    topic: string;
    keyPoints: { text: string; refs: number[] }[];
  }[];
};

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) return objectMatch[1].trim();
  return trimmed;
}

function parseDigestContent(raw?: string | null): DigestContent | null {
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

export function HomeDigest({ onSelectArticle }: HomeDigestProps) {
  const utils = trpc.useUtils();
  const { data: digest, isLoading, error } = trpc.digests.latest.useQuery();
  const generateDigest = trpc.digests.generate.useMutation({
    onSuccess: () => {
      utils.digests.latest.invalidate();
      utils.digests.list.invalidate();
    }
  });

  const parsed = useMemo(
    () => parseDigestContent(digest?.content),
    [digest?.content]
  );
  const referenceMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!digest?.articleIds) return map;
    digest.articleIds.forEach((id, index) => {
      map.set(index + 1, id);
    });
    return map;
  }, [digest?.articleIds]);
  const overviewLine = parsed?.overview ?? null;

  const renderRefs = (refs: number[]) => {
    const unique = Array.from(new Set(refs)).filter((ref) => Number.isFinite(ref));
    if (unique.length === 0) return null;
    return (
      <span className="ml-2 text-xs text-slate-500">
        [
        {unique.map((ref, index) => {
          const articleId = referenceMap.get(ref);
          const content = (
            <span className="underline hover:text-slate-900">{ref}</span>
          );
          return (
            <span key={`${ref}-${index}`}>
              {articleId ? (
                <button type="button" onClick={() => onSelectArticle?.(articleId)}>
                  {content}
                </button>
              ) : (
                content
              )}
              {index < unique.length - 1 ? ", " : ""}
            </span>
          );
        })}
        ]
      </span>
    );
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-lg text-slate-900">Today’s Digest</CardTitle>
          <div className="text-xs text-slate-500">
            {digest
              ? `Generated ${new Date(digest.generatedAt).toLocaleString()}`
              : "No digest generated yet"}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => generateDigest.mutate()}
          disabled={generateDigest.isPending}
        >
          {generateDigest.isPending ? "Generating…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {overviewLine && (
          <p className="text-sm leading-7 text-slate-700">{overviewLine}</p>
        )}
        {isLoading && (
          <div className="text-sm text-slate-500">Loading digest content…</div>
        )}
        {error && (
          <div className="text-sm text-rose-600">
            Failed to load digest data: {error.message}
          </div>
        )}
        {!isLoading && !error && !parsed && digest?.content && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-line">
            {digest.content}
          </div>
        )}
        {!isLoading && !error && !parsed && !digest?.content && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No structured digest yet. Generate one to see topic summaries.
          </div>
        )}
        {!isLoading && !error && parsed?.topics.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No articles yet. Add sources to generate a digest.
          </div>
        )}
        {!isLoading && !error && parsed?.topics && parsed.topics.length > 0 && (
          <div className="space-y-6">
            {parsed.topics.map((topic) => (
              <div key={topic.topic} className="space-y-3">
                <div className="text-sm font-semibold text-slate-900">
                  {capitalizeFirst(topic.topic)}
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  {topic.keyPoints.map((point, index) => (
                    <p key={`${topic.topic}-kp-${index}`} className="leading-relaxed">
                      {point.text}
                      {renderRefs(point.refs)}
                    </p>
                  ))}
                  {topic.keyPoints.length === 0 && (
                    <p className="text-slate-500">
                      No key points available for this topic yet.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
