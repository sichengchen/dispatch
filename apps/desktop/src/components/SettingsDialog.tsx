import { useEffect, useState } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";

type Task = "summarize" | "classify" | "grade" | "embed" | "digest";

type ProviderType = "anthropic" | "openai" | "mock";

type CatalogEntry = {
  id: string;
  providerType: ProviderType;
  model: string;
  label: string;
  capabilities: Array<"chat" | "embedding">;
  providerConfig: {
    apiKey: string;
    baseUrl: string;
  };
};

type Tab = "general" | "discover" | "models" | "router";

type RoutingState = Record<Task, string>;

type GradingWeights = {
  importancy: number;
  quality: number;
  interest: number;
  source: number;
};

type ScoreRow = {
  id: string;
  key: string;
  score: string;
};

const TASKS: Array<{ id: Task; label: string; hint: string }> = [
  { id: "summarize", label: "Summarize", hint: "One-liner and key points" },
  { id: "classify", label: "Classify", hint: "Topic tags" },
  { id: "grade", label: "Grade", hint: "Quality score" },
  { id: "embed", label: "Embeddings", hint: "Related articles" },
  { id: "digest", label: "Digest", hint: "Daily briefing generation" }
];

const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";

const DEFAULT_GRADING_WEIGHTS: GradingWeights = {
  importancy: 0.5,
  quality: 0.5,
  interest: 0,
  source: 0
};

function createFallbackId(provider: ProviderType, model: string) {
  return `${provider}:${model || "model"}`;
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `model-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function createScoreRow(): ScoreRow {
  return {
    id: generateId(),
    key: "",
    score: "0"
  };
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatWeight(value: number) {
  return value.toFixed(2);
}

function buildScoreRows(map?: Record<string, number>): ScoreRow[] {
  if (!map) return [];
  return Object.entries(map).map(([key, score]) => ({
    id: generateId(),
    key,
    score: String(score)
  }));
}

function buildDefaultCatalog(): CatalogEntry[] {
  return [
    {
      id: createFallbackId("anthropic", DEFAULT_MODEL),
      providerType: "anthropic",
      model: DEFAULT_MODEL,
      label: "Claude 3.5 Sonnet",
      capabilities: ["chat"],
      providerConfig: {
        apiKey: "",
        baseUrl: ""
      }
    }
  ];
}

function resolveCatalogEntry(
  entries: CatalogEntry[],
  modelId: string
) {
  return entries.find((entry) => entry.id === modelId);
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      setOpen(false);
      settingsQuery.refetch();
    }
  });

  const [searchProvider, setSearchProvider] = useState("brave");
  const [searchApiKey, setSearchApiKey] = useState("");
  const [searchEndpoint, setSearchEndpoint] = useState("");
  const [verboseMode, setVerboseMode] = useState(false);
  const [gradingWeights, setGradingWeights] = useState<GradingWeights>(
    DEFAULT_GRADING_WEIGHTS
  );
  const [interestScores, setInterestScores] = useState<ScoreRow[]>([]);
  const [sourceScores, setSourceScores] = useState<ScoreRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(buildDefaultCatalog());
  const [routing, setRouting] = useState<RoutingState>(() => ({
    summarize: createFallbackId("anthropic", DEFAULT_MODEL),
    classify: createFallbackId("anthropic", DEFAULT_MODEL),
    grade: createFallbackId("anthropic", DEFAULT_MODEL),
    embed: createFallbackId("mock", "mock"),
    digest: createFallbackId("anthropic", DEFAULT_MODEL)
  }));
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState("06:00");
  const [digestTopN, setDigestTopN] = useState(10);
  const [digestHoursBack, setDigestHoursBack] = useState(24);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data || !open) return;
    const cfg = settingsQuery.data;
    const llm = cfg.models;

    setSearchProvider(cfg.search?.provider ?? "brave");
    setSearchApiKey(cfg.search?.apiKey ?? "");
    setSearchEndpoint(cfg.search?.endpoint ?? "");
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
    setDigestEnabled(cfg.digest?.enabled ?? true);
    setDigestTime(cfg.digest?.scheduledTime ?? "06:00");
    setDigestTopN(cfg.digest?.topN ?? 10);
    setDigestHoursBack(cfg.digest?.hoursBack ?? 24);

    const nextCatalog = llm.catalog && llm.catalog.length > 0
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
      digest: ""
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
            providerConfig: {
              apiKey: "",
              baseUrl: ""
            }
          };
          nextCatalog.push(entry);
        }
        nextRouting[task.id] = entry.id;
      }
    }

    if (nextCatalog.length === 0) {
      nextCatalog.push(...buildDefaultCatalog());
    }

    const supportsTask = (entry: CatalogEntry, task: Task) => {
      if (entry.providerType === "mock") return true;
      const capabilities = entry.capabilities ?? [];
      if (task === "embed") return capabilities.includes("embedding");
      return capabilities.includes("chat") || capabilities.length === 0;
    };

    const getEmbeddingFallback = () => {
      const compatible = nextCatalog.find(
        (entry) =>
          supportsTask(entry, "embed")
      );
      if (compatible) return compatible;
      const mockEntry: CatalogEntry = {
        id: createFallbackId("mock", "mock"),
        providerType: "mock",
        model: "mock",
        label: "Mock Embedding",
        capabilities: ["chat", "embedding"],
        providerConfig: {
          apiKey: "",
          baseUrl: ""
        }
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
  }, [settingsQuery.data, open]);

  const searchNeedsKey = searchProvider === "brave" || searchProvider === "serper";
  const missingSearchConfig = searchNeedsKey && !searchApiKey;

  const missingModelName = catalog.some((entry) => !entry.model.trim());
  const missingProviderConfig = catalog.some((entry) => {
    if (entry.providerType === "anthropic") {
      return !entry.providerConfig.apiKey.trim();
    }
    if (entry.providerType === "openai") {
      return !entry.providerConfig.apiKey.trim() || !entry.providerConfig.baseUrl.trim();
    }
    return false;
  });
  const hasCatalog = catalog.length > 0;

  const saveDisabled = updateSettings.isPending || missingModelName || !hasCatalog;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Settings</Button>
      </DialogTrigger>
      <DialogContent className="w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

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
            variant={activeTab === "discover" ? "default" : "outline"}
            onClick={() => setActiveTab("discover")}
            type="button"
          >
            Discover
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
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">Diagnostics</div>
              <div className="mt-1 text-xs text-slate-500">
                Show detailed pipeline steps for each article.
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  id="verbose-mode"
                  checked={verboseMode}
                  onCheckedChange={(checked) => {
                    setVerboseMode(checked === true);
                  }}
                />
                <Label htmlFor="verbose-mode">Verbose mode</Label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">Grading</div>
              <div className="mt-1 text-xs text-slate-500">
                Configure the grade equation. Weights auto-normalize.
              </div>
              <div className="mt-3 space-y-4">
                {([
                  { id: "importancy", label: "Importancy weight" },
                  { id: "quality", label: "Quality weight" },
                  { id: "interest", label: "Interest weight" },
                  { id: "source", label: "Source weight" }
                ] as const).map((item) => (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-700">
                      <Label>{item.label}</Label>
                      <span className="font-mono text-xs text-slate-500">
                        {formatWeight(gradingWeights[item.id])}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Less important</span>
                        <span>Default</span>
                        <span>More important</span>
                      </div>
                      <Slider
                        value={[gradingWeights[item.id]]}
                        min={0}
                        max={2}
                        step={0.05}
                        onValueChange={(value) => {
                          const nextValue = value[0] ?? 0;
                          setGradingWeights((prev) => ({
                            ...prev,
                            [item.id]: nextValue
                          }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-700">Interest by tag</div>
                    <div className="text-[11px] text-slate-500">
                      Scores range from -10 to 10.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setInterestScores((prev) => [...prev, createScoreRow()]);
                    }}
                  >
                    + Add Tag
                  </Button>
                </div>
                {interestScores.length === 0 && (
                  <div className="text-xs text-slate-500">No tag weights yet.</div>
                )}
                {interestScores.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_120px_auto] gap-2">
                    <Input
                      placeholder="ai"
                      value={row.key}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setInterestScores((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, key: nextValue } : item
                          )
                        );
                      }}
                    />
                    <Input
                      type="number"
                      min="-10"
                      max="10"
                      step="1"
                      value={row.score}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setInterestScores((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, score: nextValue } : item
                          )
                        );
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setInterestScores((prev) =>
                          prev.filter((item) => item.id !== row.id)
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-700">Source weights</div>
                    <div className="text-[11px] text-slate-500">
                      Match by source ID, name, or domain. Scores range from -10 to 10.
                    </div>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setSourceScores((prev) => [...prev, createScoreRow()]);
                    }}
                  >
                    + Add Source
                  </Button>
                </div>
                {sourceScores.length === 0 && (
                  <div className="text-xs text-slate-500">No source weights yet.</div>
                )}
                {sourceScores.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_120px_auto] gap-2">
                    <Input
                      placeholder="source id, name, or domain"
                      value={row.key}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setSourceScores((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, key: nextValue } : item
                          )
                        );
                      }}
                    />
                    <Input
                      type="number"
                      min="-10"
                      max="10"
                      step="1"
                      value={row.score}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setSourceScores((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, score: nextValue } : item
                          )
                        );
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        setSourceScores((prev) =>
                          prev.filter((item) => item.id !== row.id)
                        );
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">Daily Digest</div>
              <div className="mt-1 text-xs text-slate-500">
                Auto-generate a daily briefing from top-rated articles.
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <Checkbox
                  id="digest-enabled"
                  checked={digestEnabled}
                  onCheckedChange={(checked) => {
                    setDigestEnabled(checked === true);
                  }}
                />
                <Label htmlFor="digest-enabled">Enable daily digest</Label>
              </div>
              {digestEnabled && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>Scheduled time</Label>
                    <Input
                      type="time"
                      value={digestTime}
                      onChange={(e) => setDigestTime(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Top N articles</Label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={digestTopN}
                      onChange={(e) =>
                        setDigestTopN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Hours back</Label>
                    <Input
                      type="number"
                      min="1"
                      max="72"
                      value={digestHoursBack}
                      onChange={(e) =>
                        setDigestHoursBack(Math.max(1, Math.min(72, Number(e.target.value) || 1)))
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "discover" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">Search</div>
              <div className="mt-1 text-xs text-slate-500">
                Configure the web search provider for source discovery.
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Provider</Label>
                  <Select
                    value={searchProvider}
                    onValueChange={(value) => {
                      setSearchProvider(value);
                      setErrorMessage(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brave">Brave Search</SelectItem>
                      <SelectItem value="serper">Serper (Google)</SelectItem>
                      <SelectItem value="duckduckgo">DuckDuckGo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {searchNeedsKey && (
                  <div className="space-y-1">
                    <Label>API Key</Label>
                    <Input
                      value={searchApiKey}
                      onChange={(e) => {
                        setSearchApiKey(e.target.value);
                        setErrorMessage(null);
                      }}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Endpoint (optional)</Label>
                  <Input
                    placeholder={
                      searchProvider === "serper"
                        ? "https://google.serper.dev/search"
                        : searchProvider === "duckduckgo"
                          ? "https://api.duckduckgo.com/"
                          : "https://api.search.brave.com/res/v1/web/search"
                    }
                    value={searchEndpoint}
                    onChange={(e) => {
                      setSearchEndpoint(e.target.value);
                      setErrorMessage(null);
                    }}
                  />
                </div>
              </div>
              {missingSearchConfig && (
                <div className="mt-2 text-xs text-amber-700">
                  This provider requires an API key.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "models" && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Model Catalog</div>
                <div className="text-xs text-slate-500">
                  Add multiple models across providers. Router picks from this list.
                </div>
              </div>
              <Button
                size="sm"
                type="button"
                onClick={() =>
                  setCatalog((prev) => [
                    ...prev,
                    {
                      id: generateId(),
                      providerType: "anthropic",
                      model: "",
                      label: "",
                      capabilities: ["chat"],
                      providerConfig: {
                        apiKey: "",
                        baseUrl: ""
                      }
                    }
                  ])
                }
              >
                + Add Model
              </Button>
            </div>

            <div className="space-y-3">
              {catalog.map((entry) => {
                const showRemove = catalog.length > 1;
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid flex-1 grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Provider</Label>
                          <Select
                            value={entry.providerType}
                            onValueChange={(value) => {
                              const nextProvider = value as ProviderType;
                              setCatalog((prev) =>
                                prev.map((item) =>
                                  item.id === entry.id
                                    ? {
                                        ...item,
                                        providerType: nextProvider,
                                        capabilities:
                                          nextProvider === "openai" ||
                                          nextProvider === "mock"
                                            ? item.capabilities
                                            : ["chat"],
                                        providerConfig: {
                                          apiKey: "",
                                          baseUrl: ""
                                        }
                                      }
                                    : item
                                )
                              );
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select provider" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="anthropic">Anthropic</SelectItem>
                              <SelectItem value="openai">OpenAI Compatible</SelectItem>
                              <SelectItem value="mock">Mock</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>Model ID</Label>
                          <Input
                            value={entry.model}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setCatalog((prev) =>
                                prev.map((item) =>
                                  item.id === entry.id
                                    ? { ...item, model: nextValue }
                                    : item
                                )
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Display Name (optional)</Label>
                          <Input
                            value={entry.label}
                            onChange={(e) => {
                              const nextValue = e.target.value;
                              setCatalog((prev) =>
                                prev.map((item) =>
                                  item.id === entry.id
                                    ? { ...item, label: nextValue }
                                    : item
                                )
                              );
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Capabilities</Label>
                          <Select
                            value={
                              entry.capabilities.includes("chat") &&
                              entry.capabilities.includes("embedding")
                                ? "both"
                                : entry.capabilities.includes("embedding")
                                  ? "embedding"
                                  : "chat"
                            }
                            onValueChange={(value) => {
                              const nextCapabilities =
                                value === "both"
                                  ? (["chat", "embedding"] as const)
                                  : value === "embedding"
                                    ? (["embedding"] as const)
                                    : (["chat"] as const);
                              setCatalog((prev) =>
                                prev.map((item) =>
                                  item.id === entry.id
                                    ? { ...item, capabilities: [...nextCapabilities] }
                                    : item
                                )
                              );
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select capability" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chat">Chat only</SelectItem>
                              {(entry.providerType === "openai" ||
                                entry.providerType === "mock") && (
                                <>
                                  <SelectItem value="embedding">Embeddings only</SelectItem>
                                  <SelectItem value="both">Chat + Embeddings</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        {entry.providerType === "anthropic" && (
                          <div className="space-y-1">
                            <Label>Anthropic API Key</Label>
                            <Input
                              value={entry.providerConfig.apiKey}
                              onChange={(e) => {
                                const nextValue = e.target.value;
                                setCatalog((prev) =>
                                  prev.map((item) =>
                                    item.id === entry.id
                                      ? {
                                          ...item,
                                          providerConfig: {
                                            ...item.providerConfig,
                                            apiKey: nextValue
                                          }
                                        }
                                      : item
                                  )
                                );
                              }}
                            />
                          </div>
                        )}
                        {entry.providerType === "openai" && (
                          <>
                            <div className="space-y-1">
                              <Label>OpenAI-Compatible Base URL</Label>
                              <Input
                                placeholder="https://api.example.com/v1"
                                value={entry.providerConfig.baseUrl}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setCatalog((prev) =>
                                    prev.map((item) =>
                                      item.id === entry.id
                                        ? {
                                            ...item,
                                            providerConfig: {
                                              ...item.providerConfig,
                                              baseUrl: nextValue
                                            }
                                          }
                                        : item
                                    )
                                  );
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>OpenAI-Compatible API Key</Label>
                              <Input
                                value={entry.providerConfig.apiKey}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setCatalog((prev) =>
                                    prev.map((item) =>
                                      item.id === entry.id
                                        ? {
                                            ...item,
                                            providerConfig: {
                                              ...item.providerConfig,
                                              apiKey: nextValue
                                            }
                                          }
                                        : item
                                    )
                                  );
                                }}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="pt-6">
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={!showRemove}
                          onClick={() => {
                            setCatalog((prev) => prev.filter((item) => item.id !== entry.id));
                            setRouting((prev) => {
                              const remaining = catalog.filter((item) => item.id !== entry.id);
                              const fallbackId = remaining[0]?.id ?? "";
                              const next: RoutingState = { ...prev };
                              for (const task of TASKS) {
                                if (next[task.id] === entry.id) {
                                  if (task.id === "embed") {
                                    const compatible = remaining.find(
                                      (item) =>
                                        item.providerType === "mock" ||
                                        item.capabilities.includes("embedding")
                                    );
                                    next[task.id] = compatible?.id ?? fallbackId;
                                  } else {
                                    const compatible = remaining.find(
                                      (item) =>
                                        item.providerType === "mock" ||
                                        item.capabilities.includes("chat") ||
                                        item.capabilities.length === 0
                                    );
                                    next[task.id] = compatible?.id ?? fallbackId;
                                  }
                                }
                              }
                              return next;
                            });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {missingProviderConfig && (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                Some selected providers are missing credentials.
              </div>
            )}
          </div>
        )}

        {activeTab === "router" && (
          <div className="mt-4 space-y-3">
            {TASKS.map((task) => {
              const selectedId = routing[task.id];
              const options = catalog.filter((entry) => {
                if (entry.providerType === "mock") return true;
                if (task.id === "embed") return entry.capabilities.includes("embedding");
                return entry.capabilities.includes("chat") || entry.capabilities.length === 0;
              });
              return (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{task.label}</div>
                    <div className="text-xs text-slate-500">{task.hint}</div>
                  </div>
                  <div className="mt-3 space-y-1">
                    <Label>Model</Label>
                    <Select
                      value={selectedId}
                      onValueChange={(value) => {
                        setRouting((prev) => ({
                          ...prev,
                          [task.id]: value
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select model" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.label?.trim() || entry.model} ({entry.providerType})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {options.length === 0 && (
                      <div className="text-xs text-amber-700">
                        Add a compatible model in Models.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!hasCatalog && (
              <div className="rounded border border-dashed border-slate-200 p-4 text-xs text-slate-500">
                Add models in the Models tab to configure routing.
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} type="button">
            Cancel
          </Button>
          <Button
            onClick={() => {
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
              const sourceWeights = buildScoreMap(sourceScores);

              const resolvedCatalog = (catalog.length ? catalog : buildDefaultCatalog()).map(
                (entry) => {
                  const label = entry.label.trim();
                  const apiKey = entry.providerConfig.apiKey.trim();
                  const baseUrl = entry.providerConfig.baseUrl.trim();
                  const capabilities: Array<"chat" | "embedding"> = entry.capabilities
                    .length
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
                    entry.providerType === "mock" ||
                    entry.capabilities?.includes("embedding")
                );
                if (compatible) return compatible;
                const mockEntry: CatalogEntry = {
                  id: createFallbackId("mock", "mock"),
                  providerType: "mock",
                  model: "mock",
                  label: "Mock Embedding",
                  capabilities: ["chat", "embedding"],
                  providerConfig: {
                    apiKey: "",
                    baseUrl: ""
                  }
                };
                resolvedCatalog.push(mockEntry);
                return mockEntry;
              };

              const resolvedModels = TASKS.map((task) => {
                let entry = resolvedCatalog.find((item) => item.id === routing[task.id]) ?? resolvedCatalog[0];
                if (task.id === "embed") {
                  const isCompatible =
                    entry?.providerType === "mock" ||
                    entry?.capabilities?.includes("embedding");
                  if (!isCompatible) {
                    entry = ensureEmbeddingEntry();
                  }
                }
                return {
                  task: task.id,
                  modelId: entry.id
                };
              });
              updateSettings.mutate({
                models: {
                  assignment: resolvedModels,
                  catalog: resolvedCatalog
                },
                search: {
                  provider: searchProvider as "brave" | "serper" | "duckduckgo",
                  apiKey: searchApiKey || undefined,
                  endpoint: searchEndpoint || undefined
                },
                ui: {
                  verbose: verboseMode
                },
                grading: {
                  weights,
                  interestByTag: Object.keys(interestByTag).length
                    ? interestByTag
                    : undefined,
                  sourceWeights: Object.keys(sourceWeights).length
                    ? sourceWeights
                    : undefined
                },
                digest: {
                  enabled: digestEnabled,
                  scheduledTime: digestTime,
                  topN: digestTopN,
                  hoursBack: digestHoursBack,
                }
              });
            }}
            disabled={saveDisabled}
            type="button"
          >
            {updateSettings.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
