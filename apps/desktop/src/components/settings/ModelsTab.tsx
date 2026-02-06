import { useState, useEffect } from "react";
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
import { trpc } from "../../lib/trpc";
import { generateId, type Provider, type DiscoveredModel } from "./types";
import type { ModelCatalogEntry } from "@dispatch/api";

export function ModelsTab() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [addFormData, setAddFormData] = useState<{
    providerId: string;
    model: string;
    label: string;
    capabilities: Array<"chat" | "embedding">;
    useCustomModel: boolean;
  }>({
    providerId: "",
    model: "",
    label: "",
    capabilities: ["chat"],
    useCustomModel: false
  });
  const utils = trpc.useUtils();
  const { data: providers = [] } = trpc.settings.getProviders.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const catalog = settings?.models.catalog ?? [];

  // Fetch discovered models for the selected provider
  const { data: discoveredModels = [], isFetching: isDiscovering } = trpc.settings.discoverModels.useQuery(
    { providerId: addFormData.providerId, forceRefresh: false },
    { enabled: !!addFormData.providerId && isAdding }
  );

  const addModel = trpc.settings.addModel.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      resetAddForm();
    }
  });

  const updateModel = trpc.settings.updateModel.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      setEditingId(null);
    }
  });

  const deleteModel = trpc.settings.deleteModel.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
    }
  });

  const resetAddForm = () => {
    setAddFormData({
      providerId: providers[0]?.id || "",
      model: "",
      label: "",
      capabilities: ["chat"],
      useCustomModel: false
    });
    setModelSearchQuery("");
    setIsAdding(false);
  };

  // Auto-set capabilities when a discovered model is selected
  useEffect(() => {
    if (addFormData.model && !addFormData.useCustomModel && discoveredModels) {
      const selectedModel = discoveredModels.find((m: DiscoveredModel) => m.id === addFormData.model);
      if (selectedModel?.capabilities) {
        setAddFormData(prev => ({
          ...prev,
          capabilities: selectedModel.capabilities,
          label: prev.label || selectedModel.name || selectedModel.id
        }));
      }
    }
  }, [addFormData.model, addFormData.useCustomModel, discoveredModels]);

  // Switch back to dropdown when provider changes while in custom mode
  useEffect(() => {
    if (addFormData.useCustomModel && discoveredModels && discoveredModels.length > 0) {
      setAddFormData(prev => ({ ...prev, useCustomModel: false, model: "" }));
    }
  }, [addFormData.providerId, addFormData.useCustomModel, discoveredModels]);

  const handleAdd = () => {
    if (!addFormData.providerId || !addFormData.model) return;

    const provider = providers.find((p) => p.id === addFormData.providerId);
    if (!provider) return;

    addModel.mutate({
      id: generateId(),
      providerId: addFormData.providerId,
      model: addFormData.model,
      label: addFormData.label || addFormData.model,
      capabilities: addFormData.capabilities
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this model? Task assignments using this model will be removed.")) {
      deleteModel.mutate({ id });
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Model Catalog</div>
          <div className="text-xs text-slate-500">
            Add models from your configured providers. Router picks from this list.
          </div>
        </div>
        {!isAdding && (
          <Button
            size="sm"
            type="button"
            disabled={providers.length === 0}
            onClick={() => setIsAdding(true)}
          >
            + Add Model
          </Button>
        )}
      </div>

      {providers.length === 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          No providers configured. Please add a provider in the Providers section first.
        </div>
      )}

      {isAdding && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 text-sm font-medium">New Model</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Provider</Label>
              <Select
                value={addFormData.providerId}
                onValueChange={(value) =>
                  setAddFormData((prev) => ({ ...prev, providerId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name} ({provider.type === "anthropic" ? "Anthropic" : "OpenAI"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Model ID</Label>
              {!addFormData.useCustomModel && discoveredModels && discoveredModels.length > 0 ? (
                <Select
                  value={addFormData.model}
                  onValueChange={(value) => {
                    if (value === "__custom__") {
                      setAddFormData((prev) => ({ ...prev, useCustomModel: true, model: "" }));
                      setModelSearchQuery("");
                    } else {
                      setAddFormData((prev) => ({ ...prev, model: value }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isDiscovering ? "Loading models..." : "Select model"} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="sticky top-0 bg-white p-2 border-b">
                      <Input
                        placeholder="Search models..."
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        className="h-8"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      {discoveredModels
                        .filter((m: DiscoveredModel) => {
                          if (!modelSearchQuery) return true;
                          const query = modelSearchQuery.toLowerCase();
                          const name = (m.name || m.id).toLowerCase();
                          const ownedBy = (m.ownedBy || "").toLowerCase();
                          return name.includes(query) || ownedBy.includes(query);
                        })
                        .map((m: DiscoveredModel) => (
                          <SelectItem key={m.id} value={m.id}>
                            <span className="flex items-center gap-2">
                              {m.name || m.id}
                              {m.ownedBy && (
                                <span className="text-xs text-slate-400">({m.ownedBy})</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      {discoveredModels.filter((m: DiscoveredModel) => {
                        if (!modelSearchQuery) return true;
                        const query = modelSearchQuery.toLowerCase();
                        const name = (m.name || m.id).toLowerCase();
                        const ownedBy = (m.ownedBy || "").toLowerCase();
                        return name.includes(query) || ownedBy.includes(query);
                      }).length === 0 && modelSearchQuery && (
                        <div className="p-2 text-center text-sm text-slate-500">
                          No models found
                        </div>
                      )}
                      <SelectItem value="__custom__">
                        <span className="italic">Enter custom model...</span>
                      </SelectItem>
                    </div>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder={isDiscovering ? "Loading..." : "model-name"}
                  value={addFormData.model}
                  onChange={(e) =>
                    setAddFormData((prev) => ({ ...prev, model: e.target.value }))
                  }
                  disabled={isDiscovering}
                />
              )}
            </div>

            <div className="space-y-1">
              <Label>Display Name (optional)</Label>
              <Input
                placeholder="Friendly name"
                value={addFormData.label}
                onChange={(e) =>
                  setAddFormData((prev) => ({ ...prev, label: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Capabilities</Label>
              <Select
                value={
                  addFormData.capabilities.includes("embedding")
                    ? "embedding"
                    : "chat"
                }
                onValueChange={(value) => {
                  const nextCapabilities =
                    value === "embedding"
                      ? (["embedding"] as const)
                      : (["chat"] as const);
                  setAddFormData((prev) => ({ ...prev, capabilities: [...nextCapabilities] }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="embedding">Embeddings</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              type="button"
              onClick={handleAdd}
              disabled={!addFormData.providerId || !addFormData.model || addModel.isPending}
            >
              {addModel.isPending ? "Adding..." : "Add"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={resetAddForm}
            >
              Cancel
            </Button>
          </div>
          {addModel.error && (
            <div className="mt-2 text-xs text-red-600">
              {addModel.error.message}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {catalog.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            providers={providers}
            isEditing={editingId === model.id}
            onEdit={() => setEditingId(model.id)}
            onCancelEdit={() => setEditingId(null)}
            onUpdate={updateModel.mutate}
            onDelete={handleDelete}
            isUpdating={updateModel.isPending}
            updateError={updateModel.error?.message}
          />
        ))}
      </div>

      {catalog.length === 0 && !isAdding && providers.length > 0 && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          No models configured. Click "+ Add Model" above to add a model from your providers.
        </div>
      )}

      {deleteModel.error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {deleteModel.error.message}
        </div>
      )}
    </div>
  );
}

type ModelCardProps = {
  model: ModelCatalogEntry;
  providers: Provider[];
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (data: {
    id: string;
    providerType: "anthropic" | "openai";
    model: string;
    label: string;
    capabilities: Array<"chat" | "embedding">;
    providerId: string;
  }) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  updateError?: string;
};

function ModelCard({
  model,
  providers,
  isEditing,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  isUpdating,
  updateError
}: ModelCardProps) {
  const [editData, setEditData] = useState({
    providerId: model.providerId || "",
    model: model.model,
    label: model.label || "",
    capabilities: model.capabilities || ["chat"]
  });
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);

  // Fetch discovered models for the selected provider when editing
  const { data: discoveredModels = [], isFetching: isDiscovering } = trpc.settings.discoverModels.useQuery(
    { providerId: editData.providerId, forceRefresh: false },
    { enabled: !!editData.providerId && isEditing }
  );

  const handleUpdate = () => {
    if (!editData.providerId || !editData.model) return;

    const provider = providers.find((p) => p.id === editData.providerId);
    if (!provider) return;

    onUpdate({
      id: model.id,
      providerType: provider.type === "anthropic" ? "anthropic" : "openai",
      model: editData.model,
      label: editData.label || editData.model,
      capabilities: editData.capabilities,
      providerId: editData.providerId
    });
  };

  const provider = providers.find((p) => p.id === model.providerId);

  if (isEditing) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 text-sm font-medium">Edit Model</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Provider</Label>
            <Select
              value={editData.providerId}
              onValueChange={(value) =>
                setEditData((prev) => ({ ...prev, providerId: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name} ({provider.type === "anthropic" ? "Anthropic" : "OpenAI"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Model ID</Label>
            {!useCustomModel && discoveredModels && discoveredModels.length > 0 ? (
              <Select
                value={editData.model}
                onValueChange={(value) => {
                  if (value === "__custom__") {
                    setUseCustomModel(true);
                    setEditData((prev) => ({ ...prev, model: "" }));
                    setModelSearchQuery("");
                  } else {
                    setEditData((prev) => ({ ...prev, model: value }));
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isDiscovering ? "Loading models..." : "Select model"} />
                </SelectTrigger>
                <SelectContent>
                  <div className="sticky top-0 bg-white p-2 border-b">
                    <Input
                      placeholder="Search models..."
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      className="h-8"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {discoveredModels
                      .filter((m: DiscoveredModel) => {
                        if (!modelSearchQuery) return true;
                        const query = modelSearchQuery.toLowerCase();
                        const name = (m.name || m.id).toLowerCase();
                        const ownedBy = (m.ownedBy || "").toLowerCase();
                        return name.includes(query) || ownedBy.includes(query);
                      })
                      .map((m: DiscoveredModel) => (
                        <SelectItem key={m.id} value={m.id}>
                          <span className="flex items-center gap-2">
                            {m.name || m.id}
                            {m.ownedBy && (
                              <span className="text-xs text-slate-400">({m.ownedBy})</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    {discoveredModels.filter((m: DiscoveredModel) => {
                      if (!modelSearchQuery) return true;
                      const query = modelSearchQuery.toLowerCase();
                      const name = (m.name || m.id).toLowerCase();
                      const ownedBy = (m.ownedBy || "").toLowerCase();
                      return name.includes(query) || ownedBy.includes(query);
                    }).length === 0 && modelSearchQuery && (
                      <div className="p-2 text-center text-sm text-slate-500">
                        No models found
                      </div>
                    )}
                    <SelectItem value="__custom__">
                      <span className="italic">Enter custom model...</span>
                    </SelectItem>
                  </div>
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={isDiscovering ? "Loading..." : "model-name"}
                value={editData.model}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, model: e.target.value }))
                }
                disabled={isDiscovering}
              />
            )}
          </div>

          <div className="space-y-1">
            <Label>Display Name (optional)</Label>
            <Input
              value={editData.label}
              onChange={(e) =>
                setEditData((prev) => ({ ...prev, label: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <Label>Capabilities</Label>
            <Select
              value={
                editData.capabilities.includes("embedding")
                  ? "embedding"
                  : "chat"
              }
              onValueChange={(value) => {
                const nextCapabilities =
                  value === "embedding"
                    ? (["embedding"] as const)
                    : (["chat"] as const);
                setEditData((prev) => ({ ...prev, capabilities: [...nextCapabilities] }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat</SelectItem>
                <SelectItem value="embedding">Embeddings</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            type="button"
            onClick={handleUpdate}
            disabled={!editData.providerId || !editData.model || isUpdating}
          >
            {isUpdating ? "Updating..." : "Update"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={onCancelEdit}
          >
            Cancel
          </Button>
        </div>
        {updateError && (
          <div className="mt-2 text-xs text-red-600">
            {updateError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-900">
              {model.label || model.model}
            </div>
            <div className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {model.capabilities?.join(", ") ?? "chat"}
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            <div>Model: {model.model}</div>
            {provider && <div>Provider: {provider.name}</div>}
            {!provider && model.providerId && (
              <div className="text-red-600">Provider not found</div>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => onDelete(model.id)}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
