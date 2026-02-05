import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import {
  type CatalogEntry,
  type ProviderType,
  type RoutingState,
  TASKS,
  generateId
} from "./types";

type ModelsTabProps = {
  catalog: CatalogEntry[];
  setCatalog: React.Dispatch<React.SetStateAction<CatalogEntry[]>>;
  setRouting: React.Dispatch<React.SetStateAction<RoutingState>>;
};

export function ModelsTab({ catalog, setCatalog, setRouting }: ModelsTabProps) {
  const missingProviderConfig = catalog.some((entry) => {
    if (entry.providerType === "anthropic") {
      return !entry.providerConfig.apiKey.trim();
    }
    if (entry.providerType === "openai") {
      return !entry.providerConfig.apiKey.trim() || !entry.providerConfig.baseUrl.trim();
    }
    return false;
  });

  return (
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
  );
}
