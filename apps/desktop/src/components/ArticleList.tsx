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
        >
          <div className="flex items-center justify-between">
            <div className="font-medium text-slate-900">{article.title}</div>
            <span
              className={`text-xs ${article.isRead ? "text-slate-400" : "text-emerald-600"}`}
            >
              {article.isRead ? "Read" : "Unread"}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {article.sourceName ?? "Unknown source"} ·{" "}
            {new Date(article.publishedAt ?? article.fetchedAt).toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">{article.summary ?? "No summary yet."}</div>
        </button>
      ))}
    </div>
  );
}
