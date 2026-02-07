import { useState, useEffect } from "react";
import { trpc } from "./lib/trpc";
import { useUiStore } from "./store/ui";
import { Toaster, toast } from "sonner";
import { SettingsPage } from "./components/SettingsPage";
import { HomeDigest } from "./components/HomeDigest";
import { ArticleViewer } from "./components/ArticleViewer";
import { DashboardPage } from "./components/DashboardPage";
import { HistoryPage } from "./components/HistoryPage";
import { HistoryDigestPage } from "./components/HistoryDigestPage";
import { SourcesPage } from "./components/SourcesPage";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { ErrorBoundary } from "./components/ErrorBoundary";
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

  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const utils = trpc.useUtils();

  const uiSettings = settingsQuery.data?.ui;
  const onboardingComplete = settingsQuery.data?.onboardingComplete ?? false;

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });

  useEffect(() => {
    const handler = () => {
      toast.info("A new version of Dispatch is available. Restart to update.", {
        duration: Infinity,
        action: { label: "Restart", onClick: () => window.location.reload() },
      });
    };
    window.ipcRenderer?.on("dispatch:update-available", handler);
    return () => { window.ipcRenderer?.off("dispatch:update-available", handler); };
  }, []);

  const appTitle = uiSettings?.appTitle || "The Dispatch";
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
    if (articleReturn?.view === "sources") {
      setActiveView("sources");
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

  const handleOnboardingComplete = () => {
    if (!settingsQuery.data) return;
    updateSettings.mutate({
      ...settingsQuery.data,
      onboardingComplete: true,
    });
  };

  if (settingsQuery.isLoading) {
    return null;
  }

  if (!onboardingComplete) {
    return (
      <TooltipProvider>
        <OnboardingWizard onComplete={handleOnboardingComplete} />
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={() => setActiveView("home")}
            className="text-left"
            aria-label="Go to homepage"
          >
            <h1 className="text-2xl font-semibold text-slate-900">{appTitle}</h1>
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
      <ErrorBoundary>
      <main className={`mx-auto min-h-0 w-full max-w-6xl flex-1 px-6 py-6 ${activeView === "sources" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {activeView === "home" ? (
          <HomeDigest
            onSelectArticle={openArticle}
            referenceLinkBehavior={digestLinkBehavior}
          />
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
          <SourcesPage
            onSelectArticle={(id) => openArticle(id, { view: "sources" })}
          />
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
                  : articleReturn?.view === "sources"
                    ? "Back to Sources"
                    : "Back to Digest"
            }
            externalLinkBehavior={externalLinkBehavior}
          />
        )}
      </main>
      </ErrorBoundary>
      <Toaster position="bottom-right" richColors />
    </div>
    </TooltipProvider>
  );
}
