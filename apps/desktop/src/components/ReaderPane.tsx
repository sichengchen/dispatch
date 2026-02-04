import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export type ReaderArticle = {
  title: string;
  cleanContent?: string | null;
  rawHtml?: string | null;
  tags?: string | null;
  grade?: number | null;
  keyPoints?: string | null;
};

export function ReaderPane({ article }: { article: ReaderArticle | null }) {
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
    </div>
  );
}
