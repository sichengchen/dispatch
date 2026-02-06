import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { trpc } from "../lib/trpc";
import { parseStringArray } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

type ArticleViewerProps = {
  article: {
    id: number;
    title: string;
    url: string;
    cleanContent?: string | null;
    rawHtml?: string | null;
    summary?: string | null;
    tags?: string | null;
    grade?: number | null;
    keyPoints?: string | null;
    sourceName?: string | null;
    publishedAt?: string | Date | null;
    fetchedAt?: string | Date | null;
  } | null;
  onBack: () => void;
  onSelectArticle?: (id: number) => void;
  backLabel?: string;
  externalLinkBehavior?: "internal" | "external";
};

export function ArticleViewer({
  article,
  onBack,
  onSelectArticle,
  backLabel,
  externalLinkBehavior = "internal"
}: ArticleViewerProps) {
  const articleId = article?.id ?? null;
  const { data: related = [], isLoading: isLoadingRelated } =
    trpc.articles.related.useQuery(
      { id: articleId ?? 0, topK: 6 },
      { enabled: articleId != null }
    );

  if (!article) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
        Select an article to read.
      </div>
    );
  }

  const tags = parseStringArray(article.tags);
  const keyPoints = parseStringArray(article.keyPoints);
  const content = article.cleanContent || "";
  const htmlFallback = !content && article.rawHtml ? article.rawHtml : null;
  const sanitizedHtml = htmlFallback ? DOMPurify.sanitize(htmlFallback) : null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          {backLabel ?? "Back"}
        </Button>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {article.sourceName ?? "Unknown source"}
          {article.url && (
            <>
              {externalLinkBehavior === "external" ? (
                <button
                  type="button"
                  onClick={() => window.dispatchApi?.openExternal?.(article.url)}
                  className="underline hover:text-slate-900"
                >
                  Open original
                </button>
              ) : (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-slate-900"
                >
                  Open original
                </a>
              )}
            </>
          )}
        </div>
      </div>

      <h2 className="mt-4 text-2xl font-semibold text-slate-900">
        {article.title}
      </h2>

      {(article.grade != null || tags.length > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {article.grade != null && (
            <Badge variant="secondary">Grade {article.grade}/10</Badge>
          )}
          {tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {keyPoints.length > 0 && (
        <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase text-slate-500">
            Key Points
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {keyPoints.map((point, index) => (
              <li key={`${article.id}-kp-${index}`}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      <Separator className="my-5" />

      <div className="text-sm leading-7 text-slate-700">
        {sanitizedHtml ? (
          <div
            className="space-y-3"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        )}
      </div>

      <Separator className="my-5" />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase text-slate-500">
            Related Articles
          </div>
          {isLoadingRelated && (
            <span className="text-xs text-slate-400">Searching…</span>
          )}
        </div>
        {related.length === 0 && !isLoadingRelated ? (
          <div className="text-xs text-slate-500">No related articles yet.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectArticle?.(item.id)}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300"
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
