import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { AddSourceDialog } from "./AddSourceDialog";
import { SourceList } from "./SourceList";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";

type Suggestion = {
  name: string;
  url: string;
  description: string;
  type?: "rss" | "web";
};

export function SourcesPage() {
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
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sources</CardTitle>
          <CardDescription>
            Discover new sources and manage the ones you already follow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discover-query">Discover sources</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="discover-query"
                placeholder="e.g. indie iOS blogs, climate tech newsletters"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setErrorMessage(null);
                }}
                className="min-w-[240px] flex-1"
              />
              <Button
                onClick={() => discover.mutate({ query })}
                disabled={!canSearch || discover.isPending}
                type="button"
              >
                {discover.isPending ? "Searching…" : "Search"}
              </Button>
            </div>
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
          <div className="grid gap-2 md:grid-cols-2">
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
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 text-left">
          <div>
            <CardTitle className="text-base">Managed Sources</CardTitle>
            <CardDescription>Refresh, retry, and remove sources.</CardDescription>
          </div>
          <AddSourceDialog />
        </CardHeader>
        <CardContent className="w-full">
          <Separator className="mb-3" />
          <div className="w-full text-left">
            <SourceList />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
