import { trpc } from "../lib/trpc";
import { useUiStore } from "../store/ui";

export function SourceList() {
  const { data: sources = [], isLoading } = trpc.sources.list.useQuery();
  const selectedSourceId = useUiStore((state) => state.selectedSourceId);
  const setSelectedSourceId = useUiStore((state) => state.setSelectedSourceId);

  return (
    <div className="space-y-1">
      {isLoading && <div className="text-sm text-slate-500">Loading...</div>}
      {!isLoading && sources.length === 0 && (
        <div className="text-sm text-slate-500">No sources yet.</div>
      )}
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => setSelectedSourceId(source.id)}
          className={`w-full rounded px-3 py-2 text-left text-sm transition ${
            selectedSourceId === source.id
              ? "bg-slate-900 text-white"
              : "hover:bg-slate-100"
          }`}
        >
          <div className="font-medium">{source.name}</div>
          <div className={`text-xs ${selectedSourceId === source.id ? "text-slate-200" : "text-slate-500"}`}>
            {source.url}
          </div>
        </button>
      ))}
    </div>
  );
}
