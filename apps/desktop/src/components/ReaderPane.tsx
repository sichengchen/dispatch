import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { trpc } from "../lib/trpc";
import { useUiStore } from "../store/ui";

export type ReaderArticle = {
  id: number;
  title: string;
  cleanContent?: string | null;
  rawHtml?: string | null;
  tags?: string | null;
  grade?: number | null;
  keyPoints?: string | null;
};

export function ReaderPane({ article }: { article: ReaderArticle | null }) {
  const setSelectedArticleId = useUiStore((state) => state.setSelectedArticleId);
  const setSelectedSourceId = useUiStore((state) => state.setSelectedSourceId);

  const articleId = article?.id ?? null;
  const { data: related = [], isLoading: isLoadingRelated } =
    trpc.articles.related.useQuery(
      { id: articleId ?? 0, topK: 5 },
      { enabled: articleId != null }
    );

  if (!article) {
    return (
      <div className="h-full rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
        Select an article to read.
      </div>
    );
  }

  const content = article.cleanContent || "";
  const htmlFallback = !content && article.rawHtml ? article.rawHtml : null;
  const sanitizedHtml = htmlFallback ? DOMPurify.sanitize(htmlFallback) : null;

  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-xl font-semibold text-slate-900">{article.title}</h2>

      {(article.tags || article.grade != null) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {article.grade != null && (
            <span
              className={`rounded px-2 py-0.5 text-sm font-medium ${
                article.grade >= 7
                  ? "bg-emerald-100 text-emerald-700"
                  : article.grade >= 4
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              Grade: {article.grade}/10
            </span>
          )}
          {article.tags && (() => {
            try {
              const parsed = JSON.parse(article.tags) as string[];
              return parsed.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600"
                >
                  {tag}
                </span>
              ));
            } catch {
              return null;
            }
          })()}
        </div>
      )}

      {article.keyPoints && (() => {
        try {
          const points = JSON.parse(article.keyPoints) as string[];
          if (points.length > 0) {
            return (
              <div className="mb-4 rounded-lg bg-slate-50 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Key Points</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {points.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
            );
          }
          return null;
        } catch {
          return null;
        }
      })()}

      {sanitizedHtml ? (
        <div
          className="space-y-3 text-sm leading-6 text-slate-700"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      ) : (
        <div className="space-y-3 text-sm leading-6 text-slate-700">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </div>
      )}

      <div className="mt-6 border-t border-slate-200 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Related Articles</h3>
          {isLoadingRelated && (
            <span className="text-xs text-slate-400">Searching...</span>
          )}
        </div>
        {related.length === 0 && !isLoadingRelated ? (
          <div className="text-xs text-slate-500">No related articles yet.</div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {related.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.sourceId != null) {
                    setSelectedSourceId(item.sourceId);
                  }
                  setSelectedArticleId(item.id);
                }}
                className="min-w-[220px] max-w-[260px] rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300"
              >
                <div className="text-sm font-semibold text-slate-900">
                  {item.title}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {item.sourceName ?? "Unknown source"} ·{" "}
                  {new Date(item.publishedAt ?? item.fetchedAt).toLocaleDateString()}
                </div>
                {item.summary && (
                  <div className="mt-2 text-xs text-slate-600">
                    {item.summary}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
