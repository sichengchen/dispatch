import { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { GeneralTab } from "./settings/GeneralTab";
import { ModelsTab } from "./settings/ModelsTab";
import { RouterTab } from "./settings/RouterTab";
import {
  type CatalogEntry,
  type GradingWeights,
  type ProviderType,
  type RoutingState,
  type ScoreRow,
  TASKS,
  DEFAULT_GRADING_WEIGHTS,
  buildDefaultCatalog,
  createFallbackId,
  generateId
} from "./settings/types";

type Tab = "general" | "models" | "router";

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function buildScoreRows(map?: Record<string, number>): ScoreRow[] {
  if (!map) return [];
  return Object.entries(map).map(([key, score]) => ({
    id: generateId(),
    key,
    score: String(score)
  }));
}

function resolveCatalogEntry(entries: CatalogEntry[], modelId: string) {
  return entries.find((entry) => entry.id === modelId);
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      settingsQuery.refetch();
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save settings");
    }
  });

  const [verboseMode, setVerboseMode] = useState(false);
  const [gradingWeights, setGradingWeights] = useState<GradingWeights>(
    DEFAULT_GRADING_WEIGHTS
  );
  const [interestScores, setInterestScores] = useState<ScoreRow[]>([]);
  const [sourceScores, setSourceScores] = useState<ScoreRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(buildDefaultCatalog());
  const [routing, setRouting] = useState<RoutingState>(() => ({
    summarize: createFallbackId("anthropic", "claude-3-5-sonnet-20240620"),
    classify: createFallbackId("anthropic", "claude-3-5-sonnet-20240620"),
    grade: createFallbackId("anthropic", "claude-3-5-sonnet-20240620"),
    embed: createFallbackId("mock", "mock"),
    digest: createFallbackId("anthropic", "claude-3-5-sonnet-20240620"),
    skill: createFallbackId("anthropic", "claude-3-5-sonnet-20240620")
  }));
  const [digestPreferredLanguage, setDigestPreferredLanguage] = useState("English");
  const [skillGeneratorMaxSteps, setSkillGeneratorMaxSteps] = useState(100);
  const [extractionAgentMaxSteps, setExtractionAgentMaxSteps] = useState(100);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const cfg = settingsQuery.data;
    const llm = cfg.models;

    setVerboseMode(cfg.ui?.verbose ?? false);
    const nextWeights = cfg.grading?.weights;
    setGradingWeights({
      importancy: nextWeights?.importancy ?? DEFAULT_GRADING_WEIGHTS.importancy,
      quality: nextWeights?.quality ?? DEFAULT_GRADING_WEIGHTS.quality,
      interest: nextWeights?.interest ?? DEFAULT_GRADING_WEIGHTS.interest,
      source: nextWeights?.source ?? DEFAULT_GRADING_WEIGHTS.source
    });
    setInterestScores(buildScoreRows(cfg.grading?.interestByTag));
    setSourceScores(buildScoreRows(cfg.grading?.sourceWeights));
    setDigestPreferredLanguage(cfg.digest?.preferredLanguage ?? "English");
    setSkillGeneratorMaxSteps(cfg.agent?.skillGeneratorMaxSteps ?? 40);
    setExtractionAgentMaxSteps(cfg.agent?.extractionAgentMaxSteps ?? 20);

    const nextCatalog: CatalogEntry[] =
      llm.catalog && llm.catalog.length > 0
        ? llm.catalog.map((entry) => ({
            id: entry.id,
            providerType: entry.providerType as ProviderType,
            model: entry.model,
            label: entry.label ?? "",
            capabilities:
              entry.capabilities ??
              (entry.providerType === "mock"
                ? ["chat", "embedding"]
                : ["chat"]),
            providerConfig: {
              apiKey: entry.providerConfig?.apiKey ?? "",
              baseUrl: entry.providerConfig?.baseUrl ?? ""
            }
          }))
        : [];

    const nextRouting: RoutingState = {
      summarize: "",
      classify: "",
      grade: "",
      embed: "",
      digest: "",
      skill: ""
    };

    for (const task of TASKS) {
      const assignment = llm.assignment.find((item) => item.task === task.id);
      if (assignment) {
        let entry = resolveCatalogEntry(nextCatalog, assignment.modelId);
        if (!entry) {
          entry = {
            id: assignment.modelId,
            providerType: "mock",
            model: "unknown",
            label: "Missing model",
            capabilities: ["chat"],
            providerConfig: { apiKey: "", baseUrl: "" }
          };
          nextCatalog.push(entry);
        }
        nextRouting[task.id] = entry.id;
      }
    }

    if (nextCatalog.length === 0) {
      nextCatalog.push(...buildDefaultCatalog());
    }

    const supportsTask = (entry: CatalogEntry, task: string) => {
      if (entry.providerType === "mock") return true;
      const capabilities = entry.capabilities ?? [];
      if (task === "embed") return capabilities.includes("embedding");
      return capabilities.includes("chat") || capabilities.length === 0;
    };

    const getEmbeddingFallback = () => {
      const compatible = nextCatalog.find((entry) => supportsTask(entry, "embed"));
      if (compatible) return compatible;
      const mockEntry: CatalogEntry = {
        id: createFallbackId("mock", "mock"),
        providerType: "mock",
        model: "mock",
        label: "Mock Embedding",
        capabilities: ["chat", "embedding"],
        providerConfig: { apiKey: "", baseUrl: "" }
      };
      nextCatalog.push(mockEntry);
      return mockEntry;
    };

    for (const task of TASKS) {
      if (!nextRouting[task.id]) {
        if (task.id === "embed") {
          nextRouting[task.id] = getEmbeddingFallback().id;
        } else {
          const fallback = nextCatalog.find((entry) => supportsTask(entry, task.id));
          nextRouting[task.id] = (fallback ?? nextCatalog[0]).id;
        }
      }
    }

    setCatalog(nextCatalog);
    setRouting(nextRouting);
    setErrorMessage(null);
  }, [settingsQuery.data]);

  const missingModelName = catalog.some((entry) => !entry.model.trim());
  const hasCatalog = catalog.length > 0;
  const saveDisabled = updateSettings.isPending || missingModelName || !hasCatalog;

  const handleSave = () => {
    const buildScoreMap = (rows: ScoreRow[]) => {
      const map: Record<string, number> = {};
      for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        const value = clampNumber(Number(row.score) || 0, -10, 10);
        map[key.toLowerCase()] = value;
      }
      return map;
    };

    const weights = {
      importancy: Math.max(0, gradingWeights.importancy),
      quality: Math.max(0, gradingWeights.quality),
      interest: Math.max(0, gradingWeights.interest),
      source: Math.max(0, gradingWeights.source)
    };

    const interestByTag = buildScoreMap(interestScores);
    const sourceWeightsMap = buildScoreMap(sourceScores);

    const resolvedCatalog = (catalog.length ? catalog : buildDefaultCatalog()).map(
      (entry) => {
        const label = entry.label.trim();
        const apiKey = entry.providerConfig.apiKey.trim();
        const baseUrl = entry.providerConfig.baseUrl.trim();
        const capabilities: Array<"chat" | "embedding"> = entry.capabilities.length
          ? entry.capabilities
          : ["chat"];
        const providerConfig =
          entry.providerType === "anthropic"
            ? apiKey
              ? { apiKey }
              : undefined
            : entry.providerType === "openai"
              ? apiKey || baseUrl
                ? {
                    ...(apiKey ? { apiKey } : {}),
                    ...(baseUrl ? { baseUrl } : {})
                  }
                : undefined
              : undefined;
        return {
          id: entry.id,
          providerType: entry.providerType,
          model: entry.model.trim(),
          label: label || undefined,
          capabilities,
          providerConfig
        };
      }
    );

    const ensureEmbeddingEntry = () => {
      const compatible = resolvedCatalog.find(
        (entry) =>
          entry.providerType === "mock" || entry.capabilities?.includes("embedding")
      );
      if (compatible) return compatible;
      const mockEntry: CatalogEntry = {
        id: createFallbackId("mock", "mock"),
        providerType: "mock",
        model: "mock",
        label: "Mock Embedding",
        capabilities: ["chat", "embedding"],
        providerConfig: { apiKey: "", baseUrl: "" }
      };
      resolvedCatalog.push(mockEntry);
      return mockEntry;
    };

    const resolvedModels = TASKS.map((task) => {
      let entry =
        resolvedCatalog.find((item) => item.id === routing[task.id]) ??
        resolvedCatalog[0];
      if (task.id === "embed") {
        const isCompatible =
          entry?.providerType === "mock" || entry?.capabilities?.includes("embedding");
        if (!isCompatible) {
          entry = ensureEmbeddingEntry();
        }
      }
      return {
        task: task.id,
        modelId: entry.id
      };
    });

    const existingDigest = settingsQuery.data?.digest;
    updateSettings.mutate({
      models: {
        assignment: resolvedModels,
        catalog: resolvedCatalog
      },
      ui: {
        verbose: verboseMode
      },
      grading: {
        weights,
        interestByTag: Object.keys(interestByTag).length ? interestByTag : undefined,
        sourceWeights: Object.keys(sourceWeightsMap).length
          ? sourceWeightsMap
          : undefined
      },
      digest: {
        ...existingDigest,
        preferredLanguage: digestPreferredLanguage || undefined
      },
      agent: {
        skillGeneratorMaxSteps,
        extractionAgentMaxSteps
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Settings</h2>
          <p className="text-sm text-slate-500">
            Configure sources, models, and digest preferences.
          </p>
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant={activeTab === "general" ? "default" : "outline"}
          onClick={() => setActiveTab("general")}
          type="button"
        >
          General
        </Button>
        <Button
          size="sm"
          variant={activeTab === "models" ? "default" : "outline"}
          onClick={() => setActiveTab("models")}
          type="button"
        >
          Models
        </Button>
        <Button
          size="sm"
          variant={activeTab === "router" ? "default" : "outline"}
          onClick={() => setActiveTab("router")}
          type="button"
        >
          Router
        </Button>
      </div>

      {activeTab === "general" && (
        <GeneralTab
          verboseMode={verboseMode}
          setVerboseMode={setVerboseMode}
          gradingWeights={gradingWeights}
          setGradingWeights={setGradingWeights}
          interestScores={interestScores}
          setInterestScores={setInterestScores}
          sourceScores={sourceScores}
          setSourceScores={setSourceScores}
          digestPreferredLanguage={digestPreferredLanguage}
          setDigestPreferredLanguage={setDigestPreferredLanguage}
          skillGeneratorMaxSteps={skillGeneratorMaxSteps}
          setSkillGeneratorMaxSteps={setSkillGeneratorMaxSteps}
          extractionAgentMaxSteps={extractionAgentMaxSteps}
          setExtractionAgentMaxSteps={setExtractionAgentMaxSteps}
        />
      )}

      {activeTab === "models" && (
        <ModelsTab catalog={catalog} setCatalog={setCatalog} setRouting={setRouting} />
      )}

      {activeTab === "router" && (
        <RouterTab catalog={catalog} routing={routing} setRouting={setRouting} />
      )}

      {errorMessage && (
        <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setActiveTab("general")}
          type="button"
        >
          Reset View
        </Button>
        <Button onClick={handleSave} disabled={saveDisabled} type="button">
          {updateSettings.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
