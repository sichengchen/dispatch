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
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs";
import { TooltipProvider } from "./components/ui/tooltip";

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

  const { data: uiSettings } = trpc.settings.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    select: (data) => data.ui
  });

  const digestLinkBehavior = uiSettings?.digestReferenceLinkBehavior ?? "internal";
  const externalLinkBehavior = uiSettings?.externalLinkBehavior ?? "internal";

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
    <TooltipProvider>
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
          <Tabs
            value={activeView === "history-detail" ? "history" : activeView === "article" ? "home" : activeView}
            onValueChange={(value) => {
              if (value === "history") {
                setHistoryDigestId(null);
              }
              setActiveView(value as typeof activeView);
            }}
          >
            <TabsList>
              <TabsTrigger value="home">Home</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="sources">Sources</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        {activeView === "home" ? (
          <div className="space-y-6">
            <HomeDigest
              onSelectArticle={openArticle}
              referenceLinkBehavior={digestLinkBehavior}
            />
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
            referenceLinkBehavior={digestLinkBehavior}
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
            externalLinkBehavior={externalLinkBehavior}
          />
        )}
      </main>
      <Toaster position="bottom-right" richColors />
    </div>
    </TooltipProvider>
  );
}
