import { useState } from "react";
import { trpc } from "./lib/trpc";
import { useUiStore } from "./store/ui";
import { AddSourceDialog } from "./components/AddSourceDialog";
import { DiscoverSourcesDialog } from "./components/DiscoverSourcesDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { DigestHistoryDialog } from "./components/DigestHistoryDialog";
import { HomeDigest } from "./components/HomeDigest";
import { HomeArticlesList } from "./components/HomeArticlesList";
import { ArticleViewer } from "./components/ArticleViewer";
import { SourceList } from "./components/SourceList";
import { ArticleList } from "./components/ArticleList";
import { PipelinePane } from "./components/PipelinePane";
import { Button } from "./components/ui/button";

export default function App() {
  const [activeView, setActiveView] = useState<"home" | "sources" | "article">("home");
  const selectedArticleId = useUiStore((state) => state.selectedArticleId);
  const setSelectedArticleId = useUiStore((state) => state.setSelectedArticleId);

  const { data: selectedArticle } = trpc.articles.byId.useQuery(
    { id: selectedArticleId ?? 0 },
    { enabled: selectedArticleId != null }
  );

  const openArticle = (id: number) => {
    setSelectedArticleId(id);
    setActiveView("article");
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveView("home")}
            className="text-left"
            aria-label="Go to homepage"
          >
            <h1 className="text-2xl font-semibold text-slate-900">Dispatch</h1>
            <p className="text-sm text-slate-500">Your newspaper at home</p>
          </button>
          <div className="flex items-center gap-2">
            <DigestHistoryDialog onSelectArticle={openArticle} />
            <Button
              size="sm"
              variant={activeView === "sources" ? "default" : "outline"}
              onClick={() => setActiveView("sources")}
            >
              Sources
            </Button>
            <DiscoverSourcesDialog />
            <SettingsDialog />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        {activeView === "home" ? (
          <div className="space-y-6">
            <HomeDigest onSelectArticle={openArticle} />
            <HomeArticlesList onSelectArticle={openArticle} />
          </div>
        ) : activeView === "sources" ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Sources & Articles
                </h2>
                <p className="text-sm text-slate-500">
                  Manage sources and read full articles.
                </p>
              </div>
              <AddSourceDialog />
            </div>
            <div className="grid min-h-[70vh] grid-cols-[260px_1fr_1.3fr] gap-4">
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
                <div className="min-h-0 flex-1">
                  <ArticleList />
                </div>
              </section>
              <section className="min-h-0">
                <PipelinePane article={selectedArticle ?? null} />
              </section>
            </div>
          </div>
        ) : (
          <ArticleViewer
            article={selectedArticle ?? null}
            onBack={() => setActiveView("home")}
            onSelectArticle={openArticle}
          />
        )}
      </main>
    </div>
  );
}
