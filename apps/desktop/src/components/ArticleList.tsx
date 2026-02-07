import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { trpc } from "../lib/trpc";
import { parseStringArray } from "../lib/utils";
import { useUiStore } from "../store/ui";
import { Alert, AlertDescription } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";

export function ArticleList() {
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const selectedArticleId = useUiStore((state) => state.selectedArticleId);
  const setSelectedArticleId = useUiStore((state) => state.setSelectedArticleId);

  const { data: articles = [], isLoading, error } = trpc.articles.list.useQuery(
    {
      sourceId: selectedSourceId ?? undefined,
      page: 1,
      pageSize: 100
    },
    { enabled: true }
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  useEffect(() => {
    rowVirtualizer.scrollToIndex(0);
  }, [selectedSourceId, rowVirtualizer]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load articles: {error.message}</AlertDescription>
      </Alert>
    );
  }

  if (articles.length === 0) {
    return <div className="text-sm text-slate-500">No articles yet.</div>;
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const article = articles[virtualItem.index];
          return (
            <div
              key={article.id}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="pb-2"
            >
              <button
                type="button"
                onClick={() => setSelectedArticleId(article.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                  selectedArticleId === article.id
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                aria-label={`Read article: ${article.title}`}
              >
                <div className="font-medium text-slate-900">{article.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span>
                    {article.sourceName ?? "Unknown source"} ·{" "}
                    {new Date(article.publishedAt ?? article.fetchedAt).toLocaleString()}
                  </span>
                  {article.grade != null && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        article.grade >= 7
                          ? "bg-emerald-100 text-emerald-700"
                          : article.grade >= 4
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {article.grade}/10
                    </span>
                  )}
                </div>
                {(() => {
                  const tags = parseStringArray(article.tags);
                  if (tags.length === 0) return null;
                  return (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                <div className="mt-1 text-xs text-slate-500">{article.summary ?? "No summary yet."}</div>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
