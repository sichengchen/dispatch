import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  MoreHorizontal,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { trpc } from "../lib/trpc";
import { parseStringArray } from "../lib/utils";
import { useUiStore } from "../store/ui";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";

interface SourceArticlesPanelProps {
  onSelectArticle: (id: number) => void;
}

export function SourceArticlesPanel({ onSelectArticle }: SourceArticlesPanelProps) {
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const utils = trpc.useUtils();

  const { data: articles = [], isLoading } = trpc.articles.list.useQuery(
    { sourceId: selectedSourceId ?? undefined, page: 1, pageSize: 100 },
    { enabled: selectedSourceId != null }
  );

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectedCount = selectedIds.size;
  const allSelected = useMemo(
    () => articles.length > 0 && selectedIds.size === articles.length,
    [selectedIds.size, articles.length]
  );

  // Clear selection when source changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedSourceId]);

  // Dialog state
  const [deleteDialogArticleId, setDeleteDialogArticleId] = useState<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkReprocessOpen, setBulkReprocessOpen] = useState(false);

  // Mutations
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const reprocessArticle = trpc.articles.reprocess.useMutation({
    onMutate: (input) => {
      setReprocessingId(input.id);
    },
    onSuccess: () => {
      utils.articles.list.invalidate();
      toast.success("Article reprocessed");
    },
    onError: (err) => {
      toast.error(err.message || "Reprocess failed");
    },
    onSettled: () => {
      setReprocessingId(null);
    },
  });

  const deleteArticle = trpc.articles.delete.useMutation({
    onSuccess: () => {
      utils.articles.list.invalidate();
      utils.sources.list.invalidate();
      toast.success("Article deleted");
    },
    onError: (err) => {
      toast.error(err.message || "Delete failed");
    },
  });

  const deleteMany = trpc.articles.deleteMany.useMutation({
    onSuccess: (_, variables) => {
      utils.articles.list.invalidate();
      utils.sources.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`${variables.ids.length} articles deleted`);
    },
    onError: (err) => {
      toast.error(err.message || "Bulk delete failed");
    },
  });

  const reprocessMany = trpc.articles.reprocessMany.useMutation({
    onSuccess: (data) => {
      utils.articles.list.invalidate();
      setSelectedIds(new Set());
      toast.success(`${data.processed} articles reprocessed`);
    },
    onError: (err) => {
      toast.error(err.message || "Bulk reprocess failed");
    },
  });

  // Virtualizer
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

  // Empty state: no source selected
  if (selectedSourceId == null) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        Select a source to view its articles
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
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

  // Empty state: no articles for source
  if (articles.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">
        No articles for this source yet
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm text-slate-600">
          <span>
            {selectedCount} article{selectedCount === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              type="button"
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear selection</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-slate-600 hover:text-slate-900"
              type="button"
              disabled={reprocessMany.isPending}
              title="Reprocess selected"
              onClick={() => setBulkReprocessOpen(true)}
            >
              <RefreshCw className="mr-1 h-4 w-4" />
              Reprocess
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-600"
              type="button"
              disabled={deleteMany.isPending}
              title="Delete selected"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Select all */}
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(checked) => {
            if (checked) {
              setSelectedIds(new Set(articles.map((a) => a.id)));
            } else {
              setSelectedIds(new Set());
            }
          }}
        />
        <span>Select all ({articles.length})</span>
      </div>

      {/* Article list */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const article = articles[virtualItem.index];
            const isSelected = selectedIds.has(article.id);
            const isReprocessing = reprocessingId === article.id;

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
                className="border-b border-slate-100 px-4 py-2"
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={isSelected}
                    className="mt-1"
                    onCheckedChange={(checked) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(article.id);
                        } else {
                          next.delete(article.id);
                        }
                        return next;
                      });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onSelectArticle(article.id)}
                    className="min-w-0 flex-1 text-left"
                    aria-label={`Read article: ${article.title}`}
                  >
                    <div className="font-medium text-slate-900">{article.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span>
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
                    <div className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {article.summary ?? "No summary yet."}
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 shrink-0 p-0"
                        type="button"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => reprocessArticle.mutate({ id: article.id })}
                        disabled={isReprocessing}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {isReprocessing ? "Reprocessing…" : "Reprocess"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-600 focus:text-rose-600"
                        onClick={() => setDeleteDialogArticleId(article.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Single delete confirmation */}
      <AlertDialog
        open={deleteDialogArticleId !== null}
        onOpenChange={(open) => !open && setDeleteDialogArticleId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &ldquo;
              {articles.find((a) => a.id === deleteDialogArticleId)?.title}
              &rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="default"
                className="bg-rose-600 hover:bg-rose-700"
                type="button"
                onClick={() => {
                  if (deleteDialogArticleId !== null) {
                    deleteArticle.mutate({ id: deleteDialogArticleId });
                    setDeleteDialogArticleId(null);
                  }
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected articles?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedCount} article
              {selectedCount === 1 ? "" : "s"}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="default"
                className="bg-rose-600 hover:bg-rose-700"
                type="button"
                onClick={() => {
                  deleteMany.mutate({ ids: Array.from(selectedIds) });
                  setBulkDeleteOpen(false);
                }}
              >
                Delete {selectedCount} article{selectedCount === 1 ? "" : "s"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk reprocess confirmation */}
      <AlertDialog open={bulkReprocessOpen} onOpenChange={setBulkReprocessOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocess selected articles?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reprocess {selectedCount} article
              {selectedCount === 1 ? "" : "s"} through the LLM pipeline.
              This will consume API credits for each article.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" type="button">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                onClick={() => {
                  reprocessMany.mutate({ ids: Array.from(selectedIds) });
                  setBulkReprocessOpen(false);
                }}
              >
                Reprocess {selectedCount} article{selectedCount === 1 ? "" : "s"}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
