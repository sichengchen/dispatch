import { trpc } from "../lib/trpc";
import { useUiStore } from "../store/ui";
import { Button } from "./ui/button";

export function DigestCard() {
  const { data: digest, isLoading } = trpc.digests.latest.useQuery();
  const utils = trpc.useUtils();
  const setSelectedArticleId = useUiStore(
    (state) => state.setSelectedArticleId
  );
  const generateDigest = trpc.digests.generate.useMutation({
    onSuccess: () => {
      utils.digests.latest.invalidate();
    },
  });

  if (isLoading) return null;

  return (
    <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-blue-900">
          Today's Briefing
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => generateDigest.mutate()}
          disabled={generateDigest.isPending}
        >
          {generateDigest.isPending ? "Generating…" : "Refresh"}
        </Button>
      </div>

      {digest ? (
        <>
          <div className="max-h-40 overflow-y-auto text-sm text-blue-800 whitespace-pre-line">
            {digest.content}
          </div>
          {digest.articleIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {digest.articleIds.map((id: number) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedArticleId(id)}
                  className="text-xs text-blue-600 underline hover:text-blue-800"
                >
                  #{id}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1 text-xs text-blue-500">
            {new Date(digest.generatedAt).toLocaleString()}
          </div>
        </>
      ) : (
        <div className="text-sm text-blue-600">
          No briefing yet.{" "}
          <button
            type="button"
            onClick={() => generateDigest.mutate()}
            disabled={generateDigest.isPending}
            className="underline hover:text-blue-800"
          >
            Generate now
          </button>
        </div>
      )}
    </div>
  );
}
