import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { UiConfig } from "@dispatch/api";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { GeneralTab } from "./settings/GeneralTab";
import { ModelsTab } from "./settings/ModelsTab";
import { RouterTab } from "./settings/RouterTab";
import { ProvidersSection } from "./settings/ProvidersSection";
import {
  type CatalogEntry,
  type GradingWeights,
  type RoutingState,
  type ScoreRow,
  TASKS,
  DEFAULT_GRADING_WEIGHTS,
  generateId
} from "./settings/types";

type InitialState = {
  gradingWeights: GradingWeights;
  interestScores: ScoreRow[];
  sourceScores: ScoreRow[];
  routing: RoutingState;
  digestPreferredLanguage: string;
  skillGeneratorMaxSteps: number;
  extractionAgentMaxSteps: number;
  chatAgentMaxSteps: number;
  digestReferenceLinkBehavior: "internal" | "external";
  externalLinkBehavior: "internal" | "external";
};

type Tab = "general" | "providers" | "models" | "router";

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
  const handleTabChange = (value: string) => setActiveTab(value as Tab);
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: false
  });
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      settingsQuery.refetch();
      toast.success("Settings saved");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save settings");
    }
  });

  const [gradingWeights, setGradingWeights] = useState<GradingWeights>(
    DEFAULT_GRADING_WEIGHTS
  );
  const [interestScores, setInterestScores] = useState<ScoreRow[]>([]);
  const [sourceScores, setSourceScores] = useState<ScoreRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [routing, setRouting] = useState<RoutingState>({
    summarize: "",
    classify: "",
    grade: "",
    embed: "",
    digest: "",
    skill: ""
  });
  const [digestPreferredLanguage, setDigestPreferredLanguage] = useState("English");
  const [skillGeneratorMaxSteps, setSkillGeneratorMaxSteps] = useState(100);
  const [extractionAgentMaxSteps, setExtractionAgentMaxSteps] = useState(100);
  const [chatAgentMaxSteps, setChatAgentMaxSteps] = useState(10);
  const [digestReferenceLinkBehavior, setDigestReferenceLinkBehavior] =
    useState<"internal" | "external">("internal");
  const [externalLinkBehavior, setExternalLinkBehavior] =
    useState<"internal" | "external">("internal");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const initialStateRef = useRef<InitialState | null>(null);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const cfg = settingsQuery.data;
    const llm = cfg.models;

    setDigestReferenceLinkBehavior(cfg.ui?.digestReferenceLinkBehavior ?? "internal");
    setExternalLinkBehavior(cfg.ui?.externalLinkBehavior ?? "internal");
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
    setChatAgentMaxSteps(cfg.agent?.chatAgentMaxSteps ?? 10);

    const nextCatalog: CatalogEntry[] =
      llm.catalog && llm.catalog.length > 0
        ? llm.catalog.map((entry) => ({
            id: entry.id,
            providerId: entry.providerId,
            model: entry.model,
            label: entry.label ?? "",
            capabilities: entry.capabilities ?? ["chat"]
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
            model: "unknown",
            label: "Missing model",
            capabilities: ["chat"]
          };
          nextCatalog.push(entry);
        }
        nextRouting[task.id] = entry.id;
      }
    }

    // Only auto-assign routing if there are models in the catalog
    if (nextCatalog.length > 0) {
      const supportsTask = (entry: CatalogEntry, task: string) => {
        const capabilities = entry.capabilities ?? [];
        if (task === "embed") return capabilities.includes("embedding");
        return capabilities.includes("chat") || capabilities.length === 0;
      };

      for (const task of TASKS) {
        if (!nextRouting[task.id]) {
          const fallback = nextCatalog.find((entry) => supportsTask(entry, task.id));
          nextRouting[task.id] = (fallback ?? nextCatalog[0]).id;
        }
      }
    }

    setCatalog(nextCatalog);
    setRouting(nextRouting);
    setErrorMessage(null);

    // Store initial state for change detection
    initialStateRef.current = {
      gradingWeights: {
        importancy: nextWeights?.importancy ?? DEFAULT_GRADING_WEIGHTS.importancy,
        quality: nextWeights?.quality ?? DEFAULT_GRADING_WEIGHTS.quality,
        interest: nextWeights?.interest ?? DEFAULT_GRADING_WEIGHTS.interest,
        source: nextWeights?.source ?? DEFAULT_GRADING_WEIGHTS.source
      },
      interestScores: buildScoreRows(cfg.grading?.interestByTag),
      sourceScores: buildScoreRows(cfg.grading?.sourceWeights),
      routing: nextRouting,
      digestPreferredLanguage: cfg.digest?.preferredLanguage ?? "English",
      skillGeneratorMaxSteps: cfg.agent?.skillGeneratorMaxSteps ?? 40,
      extractionAgentMaxSteps: cfg.agent?.extractionAgentMaxSteps ?? 20,
      chatAgentMaxSteps: cfg.agent?.chatAgentMaxSteps ?? 10,
      digestReferenceLinkBehavior: cfg.ui?.digestReferenceLinkBehavior ?? "internal",
      externalLinkBehavior: cfg.ui?.externalLinkBehavior ?? "internal"
    };
  }, [settingsQuery.data]);

  const hasChanges = useMemo(() => {
    const initial = initialStateRef.current;
    if (!initial) return false;

    // Compare grading weights
    if (
      gradingWeights.importancy !== initial.gradingWeights.importancy ||
      gradingWeights.quality !== initial.gradingWeights.quality ||
      gradingWeights.interest !== initial.gradingWeights.interest ||
      gradingWeights.source !== initial.gradingWeights.source
    ) {
      return true;
    }

    // Compare interest scores (by key and score, ignoring generated ids)
    const currentInterest = interestScores.map((r) => `${r.key}:${r.score}`).sort().join(",");
    const initialInterest = initial.interestScores.map((r) => `${r.key}:${r.score}`).sort().join(",");
    if (currentInterest !== initialInterest) return true;

    // Compare source scores
    const currentSource = sourceScores.map((r) => `${r.key}:${r.score}`).sort().join(",");
    const initialSource = initial.sourceScores.map((r) => `${r.key}:${r.score}`).sort().join(",");
    if (currentSource !== initialSource) return true;

    // Compare routing
    for (const task of TASKS) {
      if (routing[task.id] !== initial.routing[task.id]) return true;
    }

    // Compare simple values
    if (digestPreferredLanguage !== initial.digestPreferredLanguage) return true;
    if (skillGeneratorMaxSteps !== initial.skillGeneratorMaxSteps) return true;
    if (extractionAgentMaxSteps !== initial.extractionAgentMaxSteps) return true;
    if (chatAgentMaxSteps !== initial.chatAgentMaxSteps) return true;
    if (digestReferenceLinkBehavior !== initial.digestReferenceLinkBehavior) return true;
    if (externalLinkBehavior !== initial.externalLinkBehavior) return true;

    return false;
  }, [
    gradingWeights,
    interestScores,
    sourceScores,
    routing,
    digestPreferredLanguage,
    skillGeneratorMaxSteps,
    extractionAgentMaxSteps,
    chatAgentMaxSteps,
    digestReferenceLinkBehavior,
    externalLinkBehavior
  ]);

  const missingModelName = catalog.some((entry) => !entry.model.trim());
  const hasCatalog = catalog.length > 0;
  const saveDisabled = updateSettings.isPending || missingModelName || !hasCatalog || !hasChanges;

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

    // Only create assignments for tasks with valid model routing
    const resolvedModels = TASKS.filter((task) => {
      const routedModelId = routing[task.id];
      return routedModelId && catalog.find((item) => item.id === routedModelId);
    }).map((task) => {
      return {
        task: task.id,
        modelId: routing[task.id]
      };
    });

    const existingDigest = settingsQuery.data?.digest;
    const existingProviders = settingsQuery.data?.providers ?? [];
    const existingCatalog = settingsQuery.data?.models.catalog ?? [];
    updateSettings.mutate({
      providers: existingProviders,
      models: {
        assignment: resolvedModels,
        catalog: existingCatalog
      },
      ui: {
        digestReferenceLinkBehavior,
        externalLinkBehavior
      } as UiConfig,
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
        extractionAgentMaxSteps,
        chatAgentMaxSteps
      }
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-2">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="router">Router</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab
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
            chatAgentMaxSteps={chatAgentMaxSteps}
            setChatAgentMaxSteps={setChatAgentMaxSteps}
            digestReferenceLinkBehavior={digestReferenceLinkBehavior}
            setDigestReferenceLinkBehavior={setDigestReferenceLinkBehavior}
            externalLinkBehavior={externalLinkBehavior}
            setExternalLinkBehavior={setExternalLinkBehavior}
          />
        </TabsContent>

        <TabsContent value="providers">
          <ProvidersSection />
        </TabsContent>

        <TabsContent value="models">
          <ModelsTab />
        </TabsContent>

        <TabsContent value="router">
          <RouterTab catalog={catalog} routing={routing} setRouting={setRouting} />
        </TabsContent>
      </Tabs>

      {errorMessage && (
        <Alert variant="destructive" className="mt-3">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-end gap-2">
        {hasChanges && (
          <Button
            variant="outline"
            onClick={() => settingsQuery.refetch()}
            type="button"
          >
            Discard Changes
          </Button>
        )}
        <Button onClick={handleSave} disabled={saveDisabled} type="button">
          {updateSettings.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
