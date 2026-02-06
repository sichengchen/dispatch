import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { openArticleReference } from "../lib/digest-utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

type HistoryDigestPageProps = {
  digestId: number;
  onBack: () => void;
  onSelectArticle?: (id: number) => void;
  referenceLinkBehavior?: "internal" | "external";
};

type DigestContent = {
  overview: string;
  topics: {
    topic: string;
    keyPoints: { text: string; refs: number[] }[];
  }[];
};

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

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function HistoryDigestPage({
  digestId,
  onBack,
  onSelectArticle,
  referenceLinkBehavior = "internal"
}: HistoryDigestPageProps) {
  const utils = trpc.useUtils();
  const { data: digest, isLoading, error } = trpc.digests.byId.useQuery({
    id: digestId
  });

  const { data: articles = [] } = trpc.articles.byIds.useQuery(
    { ids: digest?.articleIds ?? [] },
    { enabled: (digest?.articleIds?.length ?? 0) > 0 }
  );

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

  const renderRefs = (refs: number[]) => {
    const unique = Array.from(new Set(refs)).filter((ref) => Number.isFinite(ref));
    if (unique.length === 0) return null;
    return (
      <span className="ml-2 text-xs text-slate-500">
        [
        {unique.map((ref, index) => {
          const articleId = referenceMap.get(ref);
          return (
            <span key={`${ref}-${index}`}>
              {articleId ? (
                <button
                  type="button"
                  className="underline hover:text-slate-900"
                  onClick={() =>
                    openArticleReference(
                      articleId,
                      referenceLinkBehavior,
                      utils.client,
                      onSelectArticle
                    )
                  }
                >
                  {ref}
                </button>
              ) : (
                <span className="underline">{ref}</span>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Digest #{digestId}
          </h2>
          <p className="text-sm text-slate-500">
            Full digest detail and referenced articles.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to History
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Digest Detail</CardTitle>
          <CardDescription>
            {digest
              ? new Date(digest.generatedAt).toLocaleString()
              : "Loading digest"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && (
            <div className="text-sm text-slate-500">Loading digest…</div>
          )}
          {error && (
            <div className="text-sm text-rose-600">
              Failed to load digest: {error.message}
            </div>
          )}
          {digest && parsed?.overview && (
            <p className="text-sm leading-7 text-slate-700">{parsed.overview}</p>
          )}
          {digest && parsed?.topics?.length ? (
            <div className="space-y-5">
              {parsed.topics.map((topic) => (
                <div key={topic.topic} className="space-y-2">
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
                  </div>
                </div>
              ))}
            </div>
          ) : digest ? (
            <>
              <Separator />
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-line">
                {digest.content}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Articles in This Digest</CardTitle>
          <CardDescription>
            {digest ? `${digest.articleIds.length} referenced articles` : "Loading"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {digest && digest.articleIds.length === 0 && (
            <div className="text-sm text-slate-500">No articles referenced.</div>
          )}
          {articles.length > 0 && (
            <div className="space-y-3">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {article.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {article.sourceName ?? "Unknown source"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => onSelectArticle?.(article.id)}
                    >
                      Open
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {article.summary ?? article.summaryLong ?? "No summary yet."}
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
