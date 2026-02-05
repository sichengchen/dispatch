import { useMemo, useState } from "react";
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
  AlertDialogTrigger
} from "./ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function SourceList() {
  const { data: sources = [], isLoading } = trpc.sources.list.useQuery();
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const setSelectedSourceId = useUiStore((state) => state.setSelectedSourceId);
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshSource = trpc.sources.refresh.useMutation({
    onMutate: (input) => {
      setRefreshingId(input.id);
      setRefreshError(null);
    },
    onSuccess: () => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
    },
    onError: (err) => {
      setRefreshError(err.message || "Refresh failed.");
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
    },
    onSettled: () => {
      setRetryingId(null);
    }
  });
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteSource = trpc.sources.delete.useMutation({
    onMutate: (input) => {
      setDeletingId(input.id);
      setDeleteError(null);
    },
    onSuccess: (_, variables) => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      if (selectedSourceId === variables.id) {
        setSelectedSourceId(null);
      }
    },
    onError: (err) => {
      setDeleteError(err.message || "Delete failed.");
    },
    onSettled: () => {
      setDeletingId(null);
    }
  });
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const deleteMany = trpc.sources.deleteMany.useMutation({
    onSuccess: (_, variables) => {
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      if (selectedSourceId && variables.ids.includes(selectedSourceId)) {
        setSelectedSourceId(null);
      }
      setSelectedIds(new Set());
    },
    onError: (err) => {
      setBulkDeleteError(err.message || "Bulk delete failed.");
    }
  });

  // Skill management
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [skillError, setSkillError] = useState<string | null>(null);
  const regenerateSkill = trpc.sources.regenerateSkill.useMutation({
    onMutate: (input) => {
      setRegeneratingId(input.id);
      setSkillError(null);
    },
    onSuccess: () => {
      utils.sources.list.invalidate();
    },
    onError: (err) => {
      setSkillError(err.message || "Skill regeneration failed.");
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
          alert(`Skill path copied to clipboard:\n${result.skillPath}`);
        }
      } else {
        setSkillError("Skill file not found. Try regenerating the skill.");
      }
    } catch (err) {
      setSkillError(err instanceof Error ? err.message : "Failed to open skill file.");
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
        <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {selectedCount} source{selectedCount === 1 ? "" : "s"} selected
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                type="button"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    type="button"
                    disabled={deleteMany.isPending}
                  >
                    {deleteMany.isPending ? "Deleting…" : "Delete Selected"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete selected sources?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove {selectedCount} source
                      {selectedCount === 1 ? "" : "s"} and their articles. This action cannot be undone.
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
      {isLoading && <div className="text-sm text-slate-500">Loading...</div>}
      {!isLoading && sources.length === 0 && (
        <div className="text-sm text-slate-500">No sources yet.</div>
      )}
      {refreshError && (
        <div className="text-xs text-rose-600">
          {refreshError}
        </div>
      )}
      {deleteError && (
        <div className="text-xs text-rose-600">
          {deleteError}
        </div>
      )}
      {bulkDeleteError && (
        <div className="text-xs text-rose-600">
          {bulkDeleteError}
        </div>
      )}
      {skillError && (
        <div className="text-xs text-rose-600">
          {skillError}
        </div>
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
              <div className="flex items-center gap-2">
                {source.healthStatus !== "healthy" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-50"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      retrySource.mutate({ id: source.id });
                    }}
                    disabled={isRetrying || isDeleting}
                  >
                    {isRetrying ? "Retrying…" : "Retry"}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      refreshSource.mutate({ id: source.id });
                    }}
                    disabled={isRefreshing || isDeleting}
                  >
                    {isRefreshing ? "Refreshing…" : "Refresh"}
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-rose-600 hover:bg-rose-50"
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      disabled={isRefreshing || isDeleting}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete source?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove “{source.name}” and its articles. This action cannot be undone.
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
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteSource.mutate({ id: source.id });
                          }}
                        >
                          Delete
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {/* Skill management dropdown for web sources */}
                {source.type === "web" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        disabled={regeneratingId === source.id}
                      >
                        {regeneratingId === source.id ? "..." : "⚙"}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.stopPropagation();
                          regenerateSkill.mutate({ id: source.id });
                        }}
                        disabled={regeneratingId === source.id}
                      >
                        {regeneratingId === source.id ? "Regenerating..." : "Regenerate Skill"}
                      </DropdownMenuItem>
                      {(source as any).hasSkill && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.stopPropagation();
                              openSkillFile(source.id);
                            }}
                          >
                            Open Skill File
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
