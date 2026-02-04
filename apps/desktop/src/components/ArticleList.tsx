import { trpc } from "../lib/trpc";
import { useUiStore } from "../store/ui";

export function ArticleList() {
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const selectedArticleId = useUiStore((state) => state.selectedArticleId);
  const setSelectedArticleId = useUiStore((state) => state.setSelectedArticleId);
  const utils = trpc.useUtils();
  const markRead = trpc.articles.markRead.useMutation({
    onSuccess: () => {
      utils.articles.list.invalidate();
    }
  });

  const { data: articles = [], isLoading } = trpc.articles.list.useQuery(
    {
      sourceId: selectedSourceId ?? undefined,
      page: 1,
      pageSize: 50
    },
    { enabled: true }
  );

  return (
    <div className="space-y-2">
      {isLoading && <div className="text-sm text-slate-500">Loading...</div>}
      {!isLoading && articles.length === 0 && (
        <div className="text-sm text-slate-500">No articles yet.</div>
      )}
      {articles.map((article) => (
        <button
          key={article.id}
          type="button"
          onClick={() => {
            setSelectedArticleId(article.id);
            if (!article.isRead) {
              markRead.mutate({ id: article.id });
            }
          }}
          className={`w-full rounded-lg border px-3 py-2 text-left transition ${
            selectedArticleId === article.id
              ? "border-slate-900 bg-slate-50"
              : "border-slate-200 hover:border-slate-300"
          }`}
          aria-label={`Read article: ${article.title}`}
        >
          <div className="flex items-center justify-between">
            <div className="font-medium text-slate-900">{article.title}</div>
            <span
              className={`text-xs ${article.isRead ? "text-slate-400" : "text-emerald-600"}`}
            >
              {article.isRead ? "Read" : "Unread"}
            </span>
          </div>
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
          {article.tags && (() => {
            try {
              const parsed = JSON.parse(article.tags) as string[];
              if (parsed.length > 0) {
                return (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {parsed.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                );
              }
              return null;
            } catch {
              return null;
            }
          })()}
          <div className="mt-1 text-xs text-slate-500">{article.summary ?? "No summary yet."}</div>
        </button>
      ))}
    </div>
  );
}
