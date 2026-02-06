import { useState } from "react";
import { trpc } from "./lib/trpc";
import { useUiStore } from "./store/ui";
import { Toaster } from "sonner";
import { SettingsPage } from "./components/SettingsPage";
import { HomeDigest } from "./components/HomeDigest";
import { HomeArticlesList } from "./components/HomeArticlesList";
import { ArticleViewer } from "./components/ArticleViewer";
import { DashboardPage } from "./components/DashboardPage";
import { HistoryPage } from "./components/HistoryPage";
import { HistoryDigestPage } from "./components/HistoryDigestPage";
import { SourcesPage } from "./components/SourcesPage";
import { Button } from "./components/ui/button";

export default function App() {
  const [activeView, setActiveView] = useState<
    "home" | "dashboard" | "history" | "history-detail" | "sources" | "article" | "settings"
  >("home");
  const [historyDigestId, setHistoryDigestId] = useState<number | null>(null);
  const [articleReturn, setArticleReturn] = useState<{
    view: "home" | "history" | "history-detail" | "dashboard" | "sources" | "settings";
    digestId?: number | null;
  } | null>(null);
  const selectedArticleId = useUiStore((state) => state.selectedArticleId);
  const setSelectedArticleId = useUiStore((state) => state.setSelectedArticleId);

  const { data: selectedArticle } = trpc.articles.byId.useQuery(
    { id: selectedArticleId ?? 0 },
    { enabled: selectedArticleId != null }
  );

  const openArticle = (
    id: number,
    returnTo?: {
      view: "home" | "history" | "history-detail" | "dashboard" | "sources" | "settings";
      digestId?: number | null;
    }
  ) => {
    setSelectedArticleId(id);
    setArticleReturn(returnTo ?? { view: "home" });
    setActiveView("article");
  };

  const openHistoryDetail = (id: number) => {
    setHistoryDigestId(id);
    setActiveView("history-detail");
  };

  const handleArticleBack = () => {
    if (articleReturn?.view === "history-detail") {
      setHistoryDigestId(articleReturn.digestId ?? historyDigestId);
      setActiveView("history-detail");
      return;
    }
    if (articleReturn?.view === "history") {
      setActiveView("history");
      return;
    }
    setActiveView("home");
  };

  const handleRelatedSelect = (id: number) => {
    if (articleReturn) {
      openArticle(id, articleReturn);
      return;
    }
    openArticle(id, { view: "home" });
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
            <Button
              size="sm"
              variant={activeView === "history" ? "default" : "outline"}
              onClick={() => {
                setActiveView("history");
                setHistoryDigestId(null);
              }}
            >
              History
            </Button>
            <Button
              size="sm"
              variant={activeView === "dashboard" ? "default" : "outline"}
              onClick={() => setActiveView("dashboard")}
            >
              Dashboard
            </Button>
            <Button
              size="sm"
              variant={activeView === "sources" ? "default" : "outline"}
              onClick={() => setActiveView("sources")}
            >
              Sources
            </Button>
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
        ) : activeView === "history" ? (
          <HistoryPage onOpenDigest={openHistoryDetail} />
        ) : activeView === "history-detail" && historyDigestId != null ? (
          <HistoryDigestPage
            digestId={historyDigestId}
            onBack={() => setActiveView("history")}
            onSelectArticle={(id) =>
              openArticle(id, { view: "history-detail", digestId: historyDigestId })
            }
          />
        ) : activeView === "history-detail" ? (
          <HistoryPage onOpenDigest={openHistoryDetail} />
        ) : activeView === "dashboard" ? (
          <DashboardPage />
        ) : activeView === "sources" ? (
          <SourcesPage />
        ) : activeView === "settings" ? (
          <SettingsPage />
        ) : (
          <ArticleViewer
            article={selectedArticle ?? null}
            onBack={handleArticleBack}
            onSelectArticle={handleRelatedSelect}
            backLabel={
              articleReturn?.view === "history-detail"
                ? "Back to History Digest"
                : articleReturn?.view === "history"
                  ? "Back to History"
                  : "Back to Digest"
            }
          />
        )}
      </main>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
