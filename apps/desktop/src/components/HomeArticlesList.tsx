import { useMemo } from "react";
import { trpc } from "../lib/trpc";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

type HomeArticlesListProps = {
  onSelectArticle?: (id: number) => void;
};

type ArticleRow = {
  id: number;
  title: string;
  summary: string | null;
  sourceName: string | null;
  grade: number | null;
};

function formatWeight(weight: number | null | undefined): string {
  if (weight == null || Number.isNaN(weight)) return "—";
  return weight.toFixed(1);
}

export function HomeArticlesList({ onSelectArticle }: HomeArticlesListProps) {
  const { data: articles = [], isLoading } = trpc.articles.list.useQuery(
    { page: 1, pageSize: 300 },
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
          <div className="text-sm text-slate-500">Loading articles…</div>
        )}
        {!isLoading && ordered.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            No articles yet.
          </div>
        )}
        {!isLoading && ordered.length > 0 && (
          <ul className="list-disc space-y-4 pl-5 text-sm text-slate-800">
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
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
