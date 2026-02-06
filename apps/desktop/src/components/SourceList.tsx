import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wand2,
  FileCode,
  X
} from "lucide-react";
import { trpc } from "../lib/trpc";
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
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";

export function SourceList() {
  const { data: sources = [], isLoading } = trpc.sources.list.useQuery();
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const setSelectedSourceId = useUiStore((state) => state.setSelectedSourceId);
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const refreshSource = trpc.sources.refresh.useMutation({
    onMutate: (input) => {
      setRefreshingId(input.id);
    },
    onSuccess: () => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      toast.success("Source refreshed");
    },
    onError: (err) => {
      toast.error(err.message || "Refresh failed");
    },
    onSettled: () => {
      setRefreshingId(null);
    }
  });
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const retrySource = trpc.sources.retry.useMutation({
    onMutate: (input) => {
      setRetryingId(input.id);
    },
    onSuccess: () => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      toast.success("Source retry started");
    },
    onError: (err) => {
      toast.error(err.message || "Retry failed");
    },
    onSettled: () => {
      setRetryingId(null);
    }
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteDialogSourceId, setDeleteDialogSourceId] = useState<number | null>(null);
  const deleteSource = trpc.sources.delete.useMutation({
    onMutate: (input) => {
      setDeletingId(input.id);
    },
    onSuccess: (_, variables) => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      if (selectedSourceId === variables.id) {
        setSelectedSourceId(null);
      }
      toast.success("Source deleted");
    },
    onError: (err) => {
      toast.error(err.message || "Delete failed");
    },
    onSettled: () => {
      setDeletingId(null);
    }
  });
  const deleteMany = trpc.sources.deleteMany.useMutation({
    onSuccess: (_, variables) => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      if (selectedSourceId && variables.ids.includes(selectedSourceId)) {
        setSelectedSourceId(null);
      }
      setSelectedIds(new Set());
      toast.success(`${variables.ids.length} sources deleted`);
    },
    onError: (err) => {
      toast.error(err.message || "Bulk delete failed");
    }
  });

  // Skill management
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const regenerateSkill = trpc.sources.regenerateSkill.useMutation({
    onMutate: (input) => {
      setRegeneratingId(input.id);
      toast.loading("Regenerating skill...", { id: `regenerate-${input.id}` });
    },
    onSuccess: (_, variables) => {
      utils.sources.list.invalidate();
      toast.success("Skill regenerated successfully", { id: `regenerate-${variables.id}` });
    },
    onError: (err, variables) => {
      toast.error(err.message || "Skill regeneration failed", { id: `regenerate-${variables.id}` });
    },
    onSettled: () => {
      setRegeneratingId(null);
    }
  });

  const openSkillFile = async (sourceId: number) => {
    try {
      const result = await utils.client.sources.openSkillFile.query({ id: sourceId });
      if (result.exists && result.skillPath) {
        // Use Electron shell to open the file
        // @ts-expect-error - window.electronAPI may not be typed
        if (window.electronAPI?.openPath) {
          // @ts-expect-error - window.electronAPI may not be typed
          await window.electronAPI.openPath(result.skillPath);
        } else {
          // Fallback: copy path to clipboard
          await navigator.clipboard.writeText(result.skillPath);
          toast.info("Skill path copied to clipboard");
        }
      } else {
        toast.error("Skill file not found. Try regenerating the skill.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open skill file");
    }
  };

  const selectedCount = selectedIds.size;
  const allSelected = useMemo(
    () => sources.length > 0 && selectedIds.size === sources.length,
    [selectedIds, sources.length]
  );

  return (
    <div className="space-y-1">
      {selectedCount > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <span>
            {selectedCount} source{selectedCount === 1 ? "" : "s"} selected
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-600"
                  type="button"
                  disabled={deleteMany.isPending}
                  title="Delete selected"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Delete selected</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete selected sources?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove {selectedCount} source
                    {selectedCount === 1 ? "" : "s"} and their articles. This
                    action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button variant="ghost" type="button">
                      Cancel
                    </Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Button
                      variant="default"
                      className="bg-rose-600 hover:bg-rose-700"
                      type="button"
                      onClick={() =>
                        deleteMany.mutate({ ids: Array.from(selectedIds) })
                      }
                    >
                      Delete
                    </Button>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
      {!isLoading && sources.length > 0 && (
        <div className="flex items-center gap-2 px-1 pb-1 text-xs text-slate-500">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedIds(new Set(sources.map((source) => source.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
          />
          <span>Select all</span>
        </div>
      )}
      {isLoading && (
        <div className="space-y-2 px-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5 py-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}
      {!isLoading && sources.length === 0 && (
        <div className="text-sm text-slate-500">No sources yet.</div>
      )}
      {sources.map((source) => {
        const isRefreshing = refreshingId === source.id;
        const isRetrying = retryingId === source.id;
        const isDeleting = deletingId === source.id;
        const isSelected = selectedIds.has(source.id);
        return (
          <div
            key={source.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedSourceId(source.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedSourceId(source.id);
              }
            }}
            className={`w-full rounded px-3 py-2 text-left text-sm transition ${
              selectedSourceId === source.id
                ? "bg-slate-900 text-white"
                : "hover:bg-slate-100"
            }`}
            aria-label={`Select source: ${source.name}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) {
                        next.add(source.id);
                      } else {
                        next.delete(source.id);
                      }
                      return next;
                    });
                  }}
                  onClick={(event) => event.stopPropagation()}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 truncate font-medium">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      source.healthStatus === "dead"
                        ? "bg-red-500"
                        : source.healthStatus === "degraded"
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                    }`}
                    title={source.healthStatus ?? "healthy"}
                  />
                  <span className="truncate">{source.name}</span>
                  </div>
                  <div
                    className={`mt-0.5 truncate text-xs ${
                      selectedSourceId === source.id ? "text-slate-200" : "text-slate-500"
                    }`}
                  >
                    {source.url}
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    type="button"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  {source.healthStatus !== "healthy" ? (
                    <DropdownMenuItem
                      onClick={() => retrySource.mutate({ id: source.id })}
                      disabled={isRetrying || isDeleting}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {isRetrying ? "Retrying…" : "Retry"}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => refreshSource.mutate({ id: source.id })}
                      disabled={isRefreshing || isDeleting}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {isRefreshing ? "Refreshing…" : "Refresh"}
                    </DropdownMenuItem>
                  )}
                  {source.type === "web" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => regenerateSkill.mutate({ id: source.id })}
                        disabled={regeneratingId === source.id}
                      >
                        <Wand2 className="mr-2 h-4 w-4" />
                        {regeneratingId === source.id ? "Regenerating…" : "Regenerate Skill"}
                      </DropdownMenuItem>
                      {source.hasSkill && (
                        <DropdownMenuItem onClick={() => openSkillFile(source.id)}>
                          <FileCode className="mr-2 h-4 w-4" />
                          Open Skill File
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-rose-600 focus:text-rose-600"
                    onClick={() => setDeleteDialogSourceId(source.id)}
                    disabled={isRefreshing || isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting…" : "Delete"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      })}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteDialogSourceId !== null}
        onOpenChange={(open) => !open && setDeleteDialogSourceId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "
              {sources.find((s) => s.id === deleteDialogSourceId)?.name}" and
              its articles. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="default"
                className="bg-rose-600 hover:bg-rose-700"
                type="button"
                onClick={() => {
                  if (deleteDialogSourceId !== null) {
                    deleteSource.mutate({ id: deleteDialogSourceId });
                    setDeleteDialogSourceId(null);
                  }
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
