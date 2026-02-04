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

type Task = "summarize" | "classify" | "grade" | "embed";

type ProviderId = "anthropic" | "openaiCompatible" | "mock";

type CatalogEntry = {
  id: string;
  provider: ProviderId;
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

const TASKS: Array<{ id: Task; label: string; hint: string }> = [
  { id: "summarize", label: "Summarize", hint: "One-liner and key points" },
  { id: "classify", label: "Classify", hint: "Topic tags" },
  { id: "grade", label: "Grade", hint: "Quality score" },
  { id: "embed", label: "Embeddings", hint: "Related articles" }
];

const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";

function createFallbackId(provider: ProviderId, model: string) {
  return `${provider}:${model || "model"}`;
}

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `model-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function buildDefaultCatalog(): CatalogEntry[] {
  return [
    {
      id: createFallbackId("anthropic", DEFAULT_MODEL),
      provider: "anthropic",
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
  provider: ProviderId,
  model: string
) {
  return entries.find(
    (entry) => entry.provider === provider && entry.model === model
  );
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
  const [catalog, setCatalog] = useState<CatalogEntry[]>(buildDefaultCatalog());
  const [routing, setRouting] = useState<RoutingState>(() => ({
    summarize: createFallbackId("anthropic", DEFAULT_MODEL),
    classify: createFallbackId("anthropic", DEFAULT_MODEL),
    grade: createFallbackId("anthropic", DEFAULT_MODEL),
    embed: createFallbackId("mock", "mock")
  }));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data || !open) return;
    const cfg = settingsQuery.data;
    const llm = cfg.llm;

    setSearchProvider(cfg.search?.provider ?? "brave");
    setSearchApiKey(cfg.search?.apiKey ?? "");
    setSearchEndpoint(cfg.search?.endpoint ?? "");
    setVerboseMode(cfg.ui?.verbose ?? false);

  const nextCatalog = llm.catalog && llm.catalog.length > 0
      ? llm.catalog.map((entry) => ({
          id: entry.id,
          provider: entry.provider as ProviderId,
          model: entry.model,
          label: entry.label ?? "",
          capabilities:
            entry.capabilities ??
            (entry.provider === "mock"
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
      embed: ""
    };

    for (const task of TASKS) {
      const taskConfig = llm.models.find((model) => model.task === task.id);
      if (taskConfig) {
        let entry = resolveCatalogEntry(nextCatalog, taskConfig.provider as ProviderId, taskConfig.model);
        if (!entry) {
          const id = createFallbackId(taskConfig.provider as ProviderId, taskConfig.model);
          entry = {
            id,
            provider: taskConfig.provider as ProviderId,
            model: taskConfig.model,
            label: "",
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
      if (entry.provider === "mock") return true;
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
        provider: "mock",
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
    if (entry.provider === "anthropic") {
      return !entry.providerConfig.apiKey.trim();
    }
    if (entry.provider === "openaiCompatible") {
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
      <DialogContent className="w-[640px]">
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
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900"
                  checked={verboseMode}
                  onChange={(e) => setVerboseMode(e.target.checked)}
                />
                Verbose mode
              </label>
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
                      provider: "anthropic",
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
                            value={entry.provider}
                            onValueChange={(value) => {
                              const nextProvider = value as ProviderId;
                              setCatalog((prev) =>
                                prev.map((item) =>
                                  item.id === entry.id
                                    ? {
                                        ...item,
                                        provider: nextProvider,
                                        capabilities:
                                          nextProvider === "openaiCompatible" ||
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
                              <SelectItem value="openaiCompatible">OpenAI Compatible</SelectItem>
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
                              {(entry.provider === "openaiCompatible" ||
                                entry.provider === "mock") && (
                                <>
                                  <SelectItem value="embedding">Embeddings only</SelectItem>
                                  <SelectItem value="both">Chat + Embeddings</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        {entry.provider === "anthropic" && (
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
                        {entry.provider === "openaiCompatible" && (
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
                                        item.provider === "mock" ||
                                        item.capabilities.includes("embedding")
                                    );
                                    next[task.id] = compatible?.id ?? fallbackId;
                                  } else {
                                    const compatible = remaining.find(
                                      (item) =>
                                        item.provider === "mock" ||
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
                if (entry.provider === "mock") return true;
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
                            {entry.label?.trim() || entry.model} ({entry.provider})
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
                    entry.provider === "anthropic"
                      ? apiKey
                        ? { apiKey }
                        : undefined
                      : entry.provider === "openaiCompatible"
                        ? apiKey || baseUrl
                          ? {
                              ...(apiKey ? { apiKey } : {}),
                              ...(baseUrl ? { baseUrl } : {})
                            }
                          : undefined
                        : undefined;
                  return {
                    id: entry.id,
                    provider: entry.provider,
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
                    entry.provider === "mock" ||
                    entry.capabilities?.includes("embedding")
                );
                if (compatible) return compatible;
                const mockEntry: CatalogEntry = {
                  id: createFallbackId("mock", "mock"),
                  provider: "mock",
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
                    entry?.provider === "mock" ||
                    entry?.capabilities?.includes("embedding");
                  if (!isCompatible) {
                    entry = ensureEmbeddingEntry();
                  }
                }
                return {
                  task: task.id,
                  provider: entry.provider,
                  model: entry.model
                };
              });
              const providerDefaults = resolvedCatalog.reduce<{
                anthropic?: string;
                openaiCompatible?: { apiKey: string; baseUrl: string };
              }>((acc, entry) => {
                if (entry.provider === "anthropic" && entry.providerConfig?.apiKey) {
                  acc.anthropic ??= entry.providerConfig.apiKey;
                }
                if (
                  entry.provider === "openaiCompatible" &&
                  entry.providerConfig?.apiKey &&
                  entry.providerConfig?.baseUrl
                ) {
                  acc.openaiCompatible ??= {
                    apiKey: entry.providerConfig.apiKey,
                    baseUrl: entry.providerConfig.baseUrl
                  };
                }
                return acc;
              }, {});

              updateSettings.mutate({
                llm: {
                  providers: providerDefaults,
                  models: resolvedModels,
                  catalog: resolvedCatalog
                },
                search: {
                  provider: searchProvider as "brave" | "serper" | "duckduckgo",
                  apiKey: searchApiKey || undefined,
                  endpoint: searchEndpoint || undefined
                },
                ui: {
                  verbose: verboseMode
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
