import { useMemo, type ReactNode } from "react";
import { trpc } from "../lib/trpc";
import {
  capitalizeFirst,
  openArticleReference,
  parseDigestContent
} from "../lib/digest-utils";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type Digest = {
  id: number;
  content: string;
  articleIds: number[];
  generatedAt: string;
};

type Article = {
  id: number;
  title: string;
  summary: string | null;
  sourceName: string | null;
  grade?: number | null;
};

type DigestViewProps = {
  digest: Digest | null | undefined;
  articles?: Article[];
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
  isLoading?: boolean;
  error?: { message: string } | null;
  onSelectArticle?: (id: number) => void;
  referenceLinkBehavior?: "internal" | "external";
};

function formatWeight(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(weight)) return "—";
  return weight.toFixed(1);
}

export function DigestView({
  digest,
  articles = [],
  title,
  subtitle,
  headerAction,
  isLoading = false,
  error = null,
  onSelectArticle,
  referenceLinkBehavior = "internal"
}: DigestViewProps) {
  const utils = trpc.useUtils();

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
                <button
                  type="button"
                  onClick={() =>
                    openArticleReference(
                      articleId,
                      referenceLinkBehavior,
                      utils.client,
                      onSelectArticle
                    )
                  }
                >
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

  const defaultSubtitle = digest
    ? `Generated ${new Date(digest.generatedAt).toLocaleString()}`
    : "No digest generated yet";

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg text-slate-900">{title}</CardTitle>
            <div className="text-xs text-slate-500">
              {subtitle ?? defaultSubtitle}
            </div>
          </div>
          {headerAction}
        </CardHeader>
        <CardContent className="space-y-5">
          {overviewLine && (
            <p className="text-sm leading-7 text-slate-700">{overviewLine}</p>
          )}
          {isLoading && (
            <div className="text-sm text-slate-500">Loading digest content...</div>
          )}
          {error && (
            <div className="text-sm text-rose-600">
              Failed to load digest: {error.message}
            </div>
          )}
          {!isLoading && !error && !parsed && digest?.content && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-line">
              {digest.content}
            </div>
          )}
          {!isLoading && !error && !parsed && !digest?.content && (
            <div className="text-sm text-slate-500">
              No structured digest yet. Generate one to see topic summaries.
            </div>
          )}
          {!isLoading && !error && parsed?.topics.length === 0 && (
            <div className="text-sm text-slate-500">
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

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Articles List</CardTitle>
        </CardHeader>
        <CardContent>
          {articles.length === 0 && (
            <div className="text-sm text-slate-500">No articles yet.</div>
          )}
          {articles.length > 0 && (
            <ol className="list-decimal space-y-4 pl-5 text-sm text-slate-800">
              {articles.map((article) => (
                <li key={article.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectArticle?.(article.id)}
                      className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                    >
                      {article.title}
                    </button>
                    <Badge variant="secondary">
                      Weight {formatWeight(article.grade)}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      {article.sourceName ?? "Unknown source"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    {article.summary ?? "No summary yet."}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
