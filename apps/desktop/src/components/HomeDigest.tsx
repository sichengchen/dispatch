import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

type HomeDigestProps = {
  onSelectArticle?: (id: number) => void;
};

type DigestArticle = {
  id: number;
  title: string;
  summary: string | null;
  keyPoints: string | null;
  tags: string | null;
  grade: number | null;
  sourceName: string | null;
};

type TopicGroup = {
  name: string;
  weight: number;
  articles: {
    article: DigestArticle;
    keyPoints: string[];
  }[];
};

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string") as string[];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function buildTopicGroups(articles: DigestArticle[]): TopicGroup[] {
  const grouped = new Map<string, TopicGroup>();
  const sorted = [...articles].sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));

  for (const article of sorted) {
    const tags = parseStringArray(article.tags);
    const topicName = tags[0] ?? "Other";
    const keyPoints = parseStringArray(article.keyPoints);
    const existing = grouped.get(topicName) ?? {
      name: topicName,
      weight: 0,
      articles: []
    };
    existing.articles.push({ article, keyPoints });
    existing.weight += article.grade ?? 0;
    grouped.set(topicName, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.weight - a.weight);
}

function formatWeight(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(weight)) return "—";
  return weight.toFixed(1);
}

export function HomeDigest({ onSelectArticle }: HomeDigestProps) {
  const utils = trpc.useUtils();
  const { data: digest } = trpc.digests.latest.useQuery();
  const { data: articles = [], isLoading, error } = trpc.articles.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: true }
  );
  const generateDigest = trpc.digests.generate.useMutation({
    onSuccess: () => {
      utils.digests.latest.invalidate();
      utils.digests.list.invalidate();
    }
  });

  const digestArticles = useMemo(() => {
    const list = articles as DigestArticle[];
    if (digest?.articleIds && digest.articleIds.length > 0) {
      const allow = new Set(digest.articleIds);
      return list.filter((article) => allow.has(article.id));
    }
    return list;
  }, [articles, digest?.articleIds]);
  const topics = useMemo(() => buildTopicGroups(digestArticles), [digestArticles]);
  const referenceMap = useMemo(() => {
    const sorted = [...digestArticles].sort(
      (a, b) => (b.grade ?? 0) - (a.grade ?? 0)
    );
    return new Map(sorted.map((article, index) => [article.id, index + 1]));
  }, [digestArticles]);
  const overviewLine = useMemo(() => {
    if (!digest?.content) return null;
    const lines = digest.content.split("\n").map((line) => line.trim()).filter(Boolean);
    return lines[0] ?? null;
  }, [digest?.content]);

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
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {overviewLine}
          </div>
        )}
        {isLoading && (
          <div className="text-sm text-slate-500">Loading digest content…</div>
        )}
        {error && (
          <div className="text-sm text-rose-600">
            Failed to load digest data: {error.message}
          </div>
        )}
        {!isLoading && !error && topics.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No articles yet. Add sources to generate a digest.
          </div>
        )}
        {!isLoading && !error && topics.length > 0 && (
          <div className="space-y-4">
            {topics.map((topic) => (
              <div key={topic.name} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {topic.name}
                  </div>
                  <Badge variant="secondary">
                    Weight {formatWeight(topic.weight)}
                  </Badge>
                </div>
                <Separator className="my-3" />
                <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Key Points
                    </div>
                    <ul className="list-disc space-y-2 pl-4 text-sm text-slate-700">
                      {topic.articles.map(({ article, keyPoints }) =>
                        keyPoints.length > 0
                          ? keyPoints.map((point, index) => (
                              <li key={`${article.id}-kp-${index}`} className="leading-relaxed">
                                {point}
                                <button
                                  type="button"
                                  onClick={() => onSelectArticle?.(article.id)}
                                  className="ml-2 text-xs text-slate-500 underline hover:text-slate-900"
                                >
                                  [{referenceMap.get(article.id) ?? "?"}]
                                </button>
                              </li>
                            ))
                          : null
                      )}
                      {topic.articles.every(({ keyPoints }) => keyPoints.length === 0) && (
                        <li className="text-slate-500">
                          No key points available for this topic yet.
                        </li>
                      )}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Details
                    </div>
                    <ScrollArea className="max-h-[220px] pr-2">
                      <div className="space-y-3 text-sm text-slate-700">
                        {topic.articles.map(({ article }) => (
                          <p key={`${article.id}-detail`} className="leading-relaxed">
                            {article.summary ?? "No summary yet."}
                            <button
                              type="button"
                              onClick={() => onSelectArticle?.(article.id)}
                              className="ml-2 text-xs text-slate-500 underline hover:text-slate-900"
                            >
                              [{referenceMap.get(article.id) ?? "?"}]
                            </button>
                          </p>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
