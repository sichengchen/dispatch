import { useState } from "react";
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
import type { Provider } from "./types";

export function ProvidersSection() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addFormData, setAddFormData] = useState<{
    name: string;
    type: "anthropic" | "openai-compatible";
    apiKey: string;
    baseUrl: string;
  }>({
    name: "",
    type: "anthropic",
    apiKey: "",
    baseUrl: ""
  });

  const utils = trpc.useUtils();
  const { data: providers = [], isLoading } = trpc.settings.getProviders.useQuery();
  const addProvider = trpc.settings.addProvider.useMutation({
    onSuccess: () => {
      utils.settings.getProviders.invalidate();
      resetAddForm();
    }
  });
  const updateProvider = trpc.settings.updateProvider.useMutation({
    onSuccess: () => {
      utils.settings.getProviders.invalidate();
      setEditingId(null);
    }
  });
  const deleteProvider = trpc.settings.deleteProvider.useMutation({
    onSuccess: () => {
      utils.settings.getProviders.invalidate();
    }
  });

  const resetAddForm = () => {
    setAddFormData({
      name: "",
      type: "anthropic",
      apiKey: "",
      baseUrl: ""
    });
    setIsAdding(false);
  };

  const handleAdd = () => {
    if (!addFormData.name || !addFormData.apiKey) return;

    addProvider.mutate({
      name: addFormData.name,
      type: addFormData.type,
      credentials: {
        apiKey: addFormData.apiKey,
        ...(addFormData.type === "openai-compatible" && { baseUrl: addFormData.baseUrl })
      }
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this provider? Models using this provider will become invalid.")) {
      deleteProvider.mutate({ id });
    }
  };

  const handleRefresh = async (providerId: string) => {
    try {
      await utils.settings.discoverModels.fetch({
        providerId,
        forceRefresh: true
      });
    } catch (error) {
      console.error("Failed to refresh models:", error);
    }
  };

  if (isLoading) {
    return <div className="mt-4 text-sm text-slate-500">Loading providers...</div>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-900">Providers</div>
          <div className="text-xs text-slate-500">
            Configure API providers for model discovery and usage.
          </div>
        </div>
        {!isAdding && (
          <Button
            size="sm"
            type="button"
            onClick={() => setIsAdding(true)}
          >
            + Add Provider
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 text-sm font-medium">New Provider</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Provider Name</Label>
              <Input
                placeholder="My Provider"
                value={addFormData.name}
                onChange={(e) =>
                  setAddFormData((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Provider Type</Label>
              <Select
                value={addFormData.type}
                onValueChange={(value: "anthropic" | "openai-compatible") =>
                  setAddFormData((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addFormData.type === "openai-compatible" && (
              <div className="col-span-2 space-y-1">
                <Label>Base URL</Label>
                <Input
                  placeholder="https://api.example.com/v1"
                  value={addFormData.baseUrl}
                  onChange={(e) =>
                    setAddFormData((prev) => ({ ...prev, baseUrl: e.target.value }))
                  }
                />
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder="sk-..."
                value={addFormData.apiKey}
                onChange={(e) =>
                  setAddFormData((prev) => ({ ...prev, apiKey: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              type="button"
              onClick={handleAdd}
              disabled={!addFormData.name || !addFormData.apiKey || addProvider.isPending}
            >
              {addProvider.isPending ? "Adding..." : "Add"}
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
          {addProvider.error && (
            <div className="mt-2 text-xs text-red-600">
              {addProvider.error.message}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isEditing={editingId === provider.id}
            onEdit={() => setEditingId(provider.id)}
            onCancelEdit={() => setEditingId(null)}
            onUpdate={updateProvider.mutate}
            onDelete={handleDelete}
            onRefresh={handleRefresh}
            isUpdating={updateProvider.isPending}
            updateError={updateProvider.error?.message}
          />
        ))}
      </div>

      {providers.length === 0 && !isAdding && (
        <div className="rounded border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          No providers configured. Add a provider to enable model discovery.
        </div>
      )}

      {deleteProvider.error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {deleteProvider.error.message}
        </div>
      )}
    </div>
  );
}

type ProviderCardProps = {
  provider: Provider;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (data: any) => void;
  onDelete: (id: string) => void;
  onRefresh: (id: string) => void;
  isUpdating: boolean;
  updateError?: string;
};

function ProviderCard({
  provider,
  isEditing,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onRefresh,
  isUpdating,
  updateError
}: ProviderCardProps) {
  const [editData, setEditData] = useState({
    name: provider.name,
    type: provider.type,
    apiKey: provider.credentials.apiKey,
    baseUrl: provider.credentials.baseUrl || ""
  });

  const handleUpdate = () => {
    if (!editData.name || !editData.apiKey) return;

    onUpdate({
      id: provider.id,
      name: editData.name,
      type: editData.type,
      credentials: {
        apiKey: editData.apiKey,
        ...(editData.type === "openai-compatible" && { baseUrl: editData.baseUrl })
      }
    });
  };

  if (isEditing) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 text-sm font-medium">Edit Provider</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Provider Name</Label>
            <Input
              value={editData.name}
              onChange={(e) =>
                setEditData((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label>Provider Type</Label>
            <Select
              value={editData.type}
              onValueChange={(value: "anthropic" | "openai-compatible") =>
                setEditData((prev) => ({ ...prev, type: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="openai-compatible">OpenAI Compatible</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {editData.type === "openai-compatible" && (
            <div className="col-span-2 space-y-1">
              <Label>Base URL</Label>
              <Input
                placeholder="https://api.example.com/v1"
                value={editData.baseUrl}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, baseUrl: e.target.value }))
                }
              />
            </div>
          )}
          <div className="col-span-2 space-y-1">
            <Label>API Key</Label>
            <Input
              type="password"
              value={editData.apiKey}
              onChange={(e) =>
                setEditData((prev) => ({ ...prev, apiKey: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            type="button"
            onClick={handleUpdate}
            disabled={!editData.name || !editData.apiKey || isUpdating}
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-900">
              {provider.name}
            </div>
            <div className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
              {provider.type === "anthropic" ? "Anthropic" : "OpenAI Compatible"}
            </div>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {provider.type === "openai-compatible" && provider.credentials.baseUrl && (
              <div>Base URL: {provider.credentials.baseUrl}</div>
            )}
            <div>API Key: {provider.credentials.apiKey.slice(0, 8)}...</div>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => onRefresh(provider.id)}
          >
            Refresh
          </Button>
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
            onClick={() => onDelete(provider.id)}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
