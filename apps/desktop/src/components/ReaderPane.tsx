import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

export type ReaderArticle = {
  title: string;
  cleanContent?: string | null;
  rawHtml?: string | null;
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
