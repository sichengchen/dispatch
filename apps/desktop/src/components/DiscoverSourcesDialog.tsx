import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type Suggestion = {
  name: string;
  url: string;
  description: string;
  type?: "rss" | "web";
};

export function DiscoverSourcesDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  const discover = trpc.sources.discover.useMutation({
    onSuccess: (data) => {
      setResults(data as Suggestion[]);
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to discover sources.");
    }
  });

  const addSource = trpc.sources.add.useMutation({
    onSuccess: async (data) => {
      await utils.sources.list.invalidate();
      setAddedUrls((prev) => new Set(prev).add(data.url));
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to add source.");
    }
  });

  const canSearch = query.trim().length >= 3;

  const resultCount = useMemo(() => results.length, [results]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Discover</Button>
      </DialogTrigger>
      <DialogContent className="w-[520px]">
        <DialogHeader>
          <DialogTitle>Discover Sources</DialogTitle>
        </DialogHeader>
        <div className="mt-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="discover-query">Describe the sources you want</Label>
            <Input
              id="discover-query"
              placeholder="e.g. indie iOS blogs, climate tech newsletters"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setErrorMessage(null);
              }}
            />
          </div>
          {errorMessage && (
            <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {errorMessage}
            </div>
          )}
          {resultCount > 0 && (
            <div className="text-xs text-slate-500">
              {resultCount} suggestions
            </div>
          )}
          <div className="max-h-[320px] space-y-2 overflow-auto">
            {results.map((item) => {
              const isAdded = addedUrls.has(item.url);
              return (
                <div
                  key={item.url}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {item.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{item.url}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] uppercase text-slate-600">
                        {item.type ?? "web"}
                      </span>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() =>
                          addSource.mutate({
                            name: item.name,
                            url: item.url,
                            type: item.type ?? "web"
                          })
                        }
                        disabled={addSource.isPending || isAdded}
                      >
                        {isAdded ? "Added" : "Add"}
                      </Button>
                    </div>
                  </div>
                  {item.description && (
                    <div className="mt-2 text-xs text-slate-600">
                      {item.description}
                    </div>
                  )}
                </div>
              );
            })}
            {results.length === 0 && !discover.isPending && (
              <div className="rounded border border-dashed border-slate-200 p-4 text-xs text-slate-500">
                No suggestions yet. Try a different query.
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} type="button">
            Close
          </Button>
          <Button
            onClick={() => discover.mutate({ query })}
            disabled={!canSearch || discover.isPending}
            type="button"
          >
            {discover.isPending ? "Searching…" : "Search"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
