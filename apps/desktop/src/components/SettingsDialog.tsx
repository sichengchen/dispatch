import { useEffect, useMemo, useState } from "react";
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

type Task = "summarize" | "classify" | "grade";

type ProviderId = "anthropic" | "openaiCompatible" | "mock";

type ModelRouting = Record<Task, { provider: ProviderId; model: string }>;

type Tab = "providers" | "models";

type ProviderTab = "anthropic" | "openaiCompatible";

const TASKS: Array<{ id: Task; label: string; hint: string }> = [
  { id: "summarize", label: "Summarize", hint: "One-liner and key points" },
  { id: "classify", label: "Classify", hint: "Topic tags" },
  { id: "grade", label: "Grade", hint: "Quality score" }
];

const DEFAULT_MODEL = "claude-3-5-sonnet-20240620";

function buildDefaultRouting(): ModelRouting {
  return {
    summarize: { provider: "anthropic", model: DEFAULT_MODEL },
    classify: { provider: "anthropic", model: DEFAULT_MODEL },
    grade: { provider: "anthropic", model: DEFAULT_MODEL }
  };
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("providers");
  const [providerTab, setProviderTab] = useState<ProviderTab>("anthropic");
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      setOpen(false);
      settingsQuery.refetch();
    }
  });

  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
  const [modelRouting, setModelRouting] = useState<ModelRouting>(buildDefaultRouting());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsQuery.data || !open) return;
    const cfg = settingsQuery.data;

    setAnthropicKey(cfg.providers.anthropic ?? "");
    setOpenaiKey(cfg.providers.openaiCompatible?.apiKey ?? "");
    setOpenaiBaseUrl(cfg.providers.openaiCompatible?.baseUrl ?? "");

    const nextRouting = buildDefaultRouting();
    for (const model of cfg.models) {
      if (model.task in nextRouting) {
        nextRouting[model.task as Task] = {
          provider: model.provider as ProviderId,
          model: model.model
        };
      }
    }
    setModelRouting(nextRouting);
    setErrorMessage(null);
  }, [settingsQuery.data, open]);

  const usesOpenAICompatible = useMemo(
    () =>
      TASKS.some((task) => modelRouting[task.id].provider === "openaiCompatible"),
    [modelRouting]
  );

  const missingOpenAIConfig = usesOpenAICompatible && (!openaiKey || !openaiBaseUrl);

  const missingModelName = TASKS.some((task) =>
    !modelRouting[task.id].model.trim()
  );

  const saveDisabled = updateSettings.isPending || missingModelName;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Settings</Button>
      </DialogTrigger>
      <DialogContent className="w-[560px]">
        <DialogHeader>
          <DialogTitle>LLM Settings</DialogTitle>
        </DialogHeader>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("providers")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTab === "providers"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Providers
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("models")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              activeTab === "models"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Model Router
          </button>
        </div>

        {activeTab === "providers" && (
          <div className="mt-4 space-y-4">
            <div className="flex rounded-lg border border-slate-200 p-1 text-xs">
              <button
                type="button"
                onClick={() => setProviderTab("anthropic")}
                className={`flex-1 rounded-md px-2 py-1 font-medium transition ${
                  providerTab === "anthropic"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600"
                }`}
              >
                Anthropic
              </button>
              <button
                type="button"
                onClick={() => setProviderTab("openaiCompatible")}
                className={`flex-1 rounded-md px-2 py-1 font-medium transition ${
                  providerTab === "openaiCompatible"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600"
                }`}
              >
                OpenAI Compatible
              </button>
            </div>

            {providerTab === "anthropic" && (
              <div className="space-y-1">
                <Label htmlFor="anthropic-key">Anthropic API Key</Label>
                <Input
                  id="anthropic-key"
                  value={anthropicKey}
                  onChange={(e) => {
                    setAnthropicKey(e.target.value);
                    setErrorMessage(null);
                  }}
                />
              </div>
            )}

            {providerTab === "openaiCompatible" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="openai-key">OpenAI-Compatible API Key</Label>
                  <Input
                    id="openai-key"
                    value={openaiKey}
                    onChange={(e) => {
                      setOpenaiKey(e.target.value);
                      setErrorMessage(null);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="openai-base-url">OpenAI-Compatible Base URL</Label>
                  <Input
                    id="openai-base-url"
                    placeholder="https://api.example.com/v1"
                    value={openaiBaseUrl}
                    onChange={(e) => {
                      setOpenaiBaseUrl(e.target.value);
                      setErrorMessage(null);
                    }}
                  />
                </div>
              </div>
            )}

            {missingOpenAIConfig && (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                Some tasks use OpenAI-compatible models, but the API key or base URL is missing.
              </div>
            )}
          </div>
        )}

        {activeTab === "models" && (
          <div className="mt-4 space-y-3">
            {TASKS.map((task) => {
              const route = modelRouting[task.id];
              return (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{task.label}</div>
                      <div className="text-xs text-slate-500">{task.hint}</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Provider</Label>
                      <Select
                        value={route.provider}
                        onValueChange={(value) => {
                          setModelRouting((prev) => ({
                            ...prev,
                            [task.id]: {
                              ...prev[task.id],
                              provider: value as ProviderId
                            }
                          }));
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
                      <Label>Model</Label>
                      <Input
                        value={route.model}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          setModelRouting((prev) => ({
                            ...prev,
                            [task.id]: {
                              ...prev[task.id],
                              model: nextValue
                            }
                          }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
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
            onClick={() =>
              updateSettings.mutate({
                providers: {
                  anthropic: anthropicKey || undefined,
                  openaiCompatible:
                    openaiKey && openaiBaseUrl
                      ? { apiKey: openaiKey, baseUrl: openaiBaseUrl }
                      : undefined
                },
                models: TASKS.map((task) => ({
                  task: task.id,
                  provider: modelRouting[task.id].provider,
                  model: modelRouting[task.id].model.trim()
                }))
              })
            }
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
