import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Alert, AlertDescription } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

type HomeArticlesListProps = {
  onSelectArticle?: (id: number) => void;
};

type ArticleRow = {
  id: number;
  title: string;
  summary: string | null;
  sourceName: string | null;
  grade: number | null;
  importancy?: number | null;
  quality?: number | null;
};

function formatWeight(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(weight)) return "—";
  return weight.toFixed(1);
}

export function HomeArticlesList({ onSelectArticle }: HomeArticlesListProps) {
  const { data: articles = [], isLoading, error } = trpc.articles.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: true }
  );

  const ordered = useMemo(() => {
    return [...(articles as ArticleRow[])].sort(
      (a, b) => (b.grade ?? 0) - (a.grade ?? 0)
    );
  }, [articles]);

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">Articles List</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load articles: {error.message}</AlertDescription>
          </Alert>
        )}
        {!isLoading && !error && ordered.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No articles yet.
          </div>
        )}
        {!isLoading && !error && ordered.length > 0 && (
          <ol className="list-decimal space-y-4 pl-5 text-sm text-slate-800">
            {ordered.map((article) => (
              <li key={article.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectArticle?.(article.id)}
                    className="text-sm font-semibold text-slate-900 underline-offset-2 hover:underline"
                  >
                    {article.title}
                  </button>
                  <Badge
                    variant="secondary"
                    title={
                      article.importancy != null || article.quality != null
                        ? `Weight ${formatWeight(article.grade)} · importancy ${formatWeight(
                            article.importancy
                          )} · quality ${formatWeight(article.quality)}`
                        : `Weight ${formatWeight(article.grade)}`
                    }
                  >
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
  );
}
