import { useState } from "react";
import { trpc } from "./lib/trpc";
import { useUiStore } from "./store/ui";
import { DiscoverSourcesDialog } from "./components/DiscoverSourcesDialog";
import { SettingsPage } from "./components/SettingsPage";
import { DigestHistoryDialog } from "./components/DigestHistoryDialog";
import { HomeDigest } from "./components/HomeDigest";
import { HomeArticlesList } from "./components/HomeArticlesList";
import { ArticleViewer } from "./components/ArticleViewer";
import { TasksPage } from "./components/TasksPage";
import { Button } from "./components/ui/button";

export default function App() {
  const [activeView, setActiveView] = useState<"home" | "tasks" | "article" | "settings">("home");
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
            <Button
              size="sm"
              variant={activeView === "home" ? "default" : "outline"}
              onClick={() => setActiveView("home")}
            >
              Home
            </Button>
            <DigestHistoryDialog onSelectArticle={openArticle} />
            <Button
              size="sm"
              variant={activeView === "tasks" ? "default" : "outline"}
              onClick={() => setActiveView("tasks")}
            >
              Tasks
            </Button>
            <DiscoverSourcesDialog />
            <Button
              size="sm"
              variant={activeView === "settings" ? "default" : "outline"}
              onClick={() => setActiveView("settings")}
            >
              Settings
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        {activeView === "home" ? (
          <div className="space-y-6">
            <HomeDigest onSelectArticle={openArticle} />
            <HomeArticlesList onSelectArticle={openArticle} />
          </div>
        ) : activeView === "tasks" ? (
          <TasksPage />
        ) : activeView === "settings" ? (
          <SettingsPage />
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
