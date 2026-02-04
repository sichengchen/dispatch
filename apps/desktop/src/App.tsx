import { trpc } from "./lib/trpc";
import { useUiStore } from "./store/ui";
import { AddSourceDialog } from "./components/AddSourceDialog";
import { DiscoverSourcesDialog } from "./components/DiscoverSourcesDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { SourceList } from "./components/SourceList";
import { ArticleList } from "./components/ArticleList";
import { ReaderPane } from "./components/ReaderPane";

export default function App() {
  const selectedArticleId = useUiStore((state) => state.selectedArticleId);

  const { data: selectedArticle } = trpc.articles.byId.useQuery(
    { id: selectedArticleId ?? 0 },
    { enabled: selectedArticleId != null }
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dispatch</h1>
          <p className="text-sm text-slate-500">Local-first news reader</p>
        </div>
        <div className="flex items-center gap-2">
          <AddSourceDialog />
          <DiscoverSourcesDialog />
          <SettingsDialog />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr_1.4fr] gap-4">
        <aside className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
            Sources
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SourceList />
          </div>
        </aside>
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
            Articles
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ArticleList />
          </div>
        </section>
        <section className="min-h-0">
          <ReaderPane article={selectedArticle ?? null} />
        </section>
      </div>
    </div>
  );
}
