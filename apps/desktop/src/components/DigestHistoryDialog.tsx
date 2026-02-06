import { useMemo, useState } from "react";
import { trpc } from "../lib/trpc";
import { openArticleReference } from "../lib/digest-utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";

type DigestHistoryDialogProps = {
  onSelectArticle?: (id: number) => void;
  referenceLinkBehavior?: "internal" | "external";
};

type DigestContent = {
  overview?: string;
  topics?: Array<{ topic: string }>;
};

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) return objectMatch[1].trim();
  return trimmed;
}

function getDigestPreview(content: string): string {
  try {
    const cleaned = extractJsonBlock(content);
    const parsed = JSON.parse(cleaned) as DigestContent | string;
    if (typeof parsed === "string") {
      return getDigestPreview(parsed);
    }
    if (parsed?.overview) return parsed.overview;
  } catch {
    // ignore parse errors
  }
  return content;
}

export function DigestHistoryDialog({
  onSelectArticle,
  referenceLinkBehavior = "internal"
}: DigestHistoryDialogProps) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const { data: digests = [], isLoading } = trpc.digests.list.useQuery({
    limit: 14
  });

  const hasDigests = useMemo(() => digests.length > 0, [digests]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">History</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Digest History</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[520px] pr-4">
          {isLoading && (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-4 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && !hasDigests && (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              No digests yet.
            </div>
          )}
          {!isLoading && hasDigests && (
            <div className="space-y-4">
              {digests.map((digest, index) => (
                <div key={digest.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Digest #{digest.id}
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(digest.generatedAt).toLocaleString()}
                      </div>
                    </div>
                    {index === 0 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                        Latest
                      </span>
                    )}
                  </div>
                  <Separator className="my-3" />
                  <div className="whitespace-pre-line text-sm text-slate-700">
                    {getDigestPreview(digest.content)}
                  </div>
                  {digest.articleIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {digest.articleIds.map((id: number) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            openArticleReference(
                              id,
                              referenceLinkBehavior,
                              utils.client,
                              onSelectArticle
                            );
                            setOpen(false);
                          }}
                          className="text-xs text-slate-600 underline hover:text-slate-900"
                        >
                          Article #{id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
