import { useState } from "react";
import { trpc } from "../lib/trpc";
import { useUiStore } from "../store/ui";
import { Button } from "./ui/button";
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

export function SourceList() {
  const { data: sources = [], isLoading } = trpc.sources.list.useQuery();
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const setSelectedSourceId = useUiStore((state) => state.setSelectedSourceId);
  const utils = trpc.useUtils();
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

  return (
    <div className="space-y-1">
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
      {sources.map((source) => {
        const isRefreshing = refreshingId === source.id;
        const isDeleting = deletingId === source.id;
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
              <div className="min-w-0">
                <div className="truncate font-medium">{source.name}</div>
                <div
                  className={`mt-0.5 truncate text-xs ${
                    selectedSourceId === source.id ? "text-slate-200" : "text-slate-500"
                  }`}
                >
                  {source.url}
                </div>
              </div>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
