import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Separator } from "./ui/separator";

export type PipelineArticle = {
  id: number;
  title: string;
  cleanContent?: string | null;
  rawHtml?: string | null;
  tags?: string | null;
  grade?: number | null;
  keyPoints?: string | null;
  url?: string | null;
  sourceName?: string | null;
  publishedAt?: string | Date | null;
  fetchedAt?: string | Date | null;
};

export function PipelinePane({ article }: { article: PipelineArticle | null }) {
  const articleId = article?.id ?? null;
  const utils = trpc.useUtils();
  const { data: settings } = trpc.settings.get.useQuery();
  const verboseMode = settings?.ui?.verbose ?? false;
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);

  const reprocess = trpc.articles.reprocess.useMutation({
    onMutate: () => {
      if (verboseMode) {
        setActiveActionLabel("Re-run AI pipeline");
        setPipelineDialogOpen(true);
      }
    },
    onSuccess: () => {
      utils.articles.byId.invalidate({ id: articleId ?? 0 });
      utils.articles.list.invalidate();
    }
  });

  const { data: pipelineLog = [], isLoading: isLoadingPipeline } =
    trpc.articles.pipelineLog.useQuery(
      { id: articleId ?? 0 },
      {
        enabled: articleId != null,
        refetchInterval: pipelineDialogOpen || reprocess.isPending ? 1000 : false
      }
    );

  const metaDate = useMemo(() => {
    if (!article) return null;
    const date = article.publishedAt ?? article.fetchedAt;
    if (!date) return null;
    return new Date(date).toLocaleString();
  }, [article?.id, article?.fetchedAt, article?.publishedAt]);

  if (!article) {
    return (
      <div className="h-full rounded-lg border border-dashed border-slate-200 p-6 text-sm text-slate-500">
        Select an article to read.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto rounded-lg border border-slate-200 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">{article.title}</h2>
        <div className="text-xs text-slate-500">
          {article.sourceName ?? "Unknown source"}
          {metaDate ? ` · ${metaDate}` : ""}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => reprocess.mutate({ id: article.id })}
          disabled={reprocess.isPending}
        >
          {reprocess.isPending ? "Running…" : "Re-run AI pipeline"}
        </Button>
        {article.url && (
          <Button asChild variant="outline" size="sm">
            <a href={article.url} target="_blank" rel="noreferrer">
              Open original
            </a>
          </Button>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">AI Pipeline</h3>
          {isLoadingPipeline && (
            <span className="text-xs text-slate-400">Loading…</span>
          )}
        </div>
        {pipelineLog.length === 0 ? (
          <div className="text-xs text-slate-500">
            No pipeline events yet. Run the pipeline to generate details.
          </div>
        ) : (
          <div className="space-y-2 text-xs text-slate-600">
            {pipelineLog.map((event, index) => (
              <div
                key={`${event.at}-${index}`}
                className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1"
              >
                <span className="font-medium text-slate-700">
                  {event.step}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                    event.status === "success"
                      ? "bg-emerald-100 text-emerald-700"
                      : event.status === "error"
                        ? "bg-rose-100 text-rose-700"
                        : event.status === "skip"
                          ? "bg-slate-200 text-slate-700"
                          : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {event.status}
                </span>
                <span className="text-slate-400">
                  {new Date(event.at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {activeActionLabel ?? "Pipeline details"}
            </DialogTitle>
          </DialogHeader>
          <Separator className="my-2" />
          {reprocess.isPending && (
            <div className="mb-3 text-xs text-slate-500">Running…</div>
          )}
          {pipelineLog.length === 0 ? (
            <div className="text-sm text-slate-500">
              No pipeline events yet.
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-600">
              {pipelineLog.map((event, index) => (
                <div
                  key={`${event.at}-${index}-dialog`}
                  className="space-y-1 rounded border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-700">
                      {event.step}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        event.status === "success"
                          ? "bg-emerald-100 text-emerald-700"
                          : event.status === "error"
                            ? "bg-rose-100 text-rose-700"
                            : event.status === "skip"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {event.status}
                    </span>
                    <span className="text-slate-400">
                      {new Date(event.at).toLocaleTimeString()}
                    </span>
                  </div>
                  {event.message && (
                    <div className="text-slate-500">{event.message}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
