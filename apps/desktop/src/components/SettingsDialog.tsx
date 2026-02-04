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

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const settingsQuery = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      setOpen(false);
      settingsQuery.refetch();
    }
  });

  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("claude-3-5-sonnet-20240620");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");

  useEffect(() => {
    if (!settingsQuery.data || !open) return;
    const cfg = settingsQuery.data;
    const summarize = cfg.models.find((item) => item.task === "summarize");
    if (summarize) {
      setProvider(summarize.provider);
      setModel(summarize.model);
    }
    setAnthropicKey(cfg.providers.anthropic ?? "");
    setOpenaiKey(cfg.providers.openaiCompatible?.apiKey ?? "");
    setOpenaiBaseUrl(cfg.providers.openaiCompatible?.baseUrl ?? "");
  }, [settingsQuery.data, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Settings</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>LLM Settings</DialogTitle>
        </DialogHeader>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label>Summarize Provider</Label>
              <Select
                value={provider}
                onValueChange={(value) => setProvider(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="openaiCompatible">OpenAI Compatible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="summarize-model">Summarize Model</Label>
              <Input
                id="summarize-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="anthropic-key">Anthropic API Key</Label>
              <Input
                id="anthropic-key"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="openai-key">OpenAI-Compatible API Key</Label>
              <Input
                id="openai-key"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="openai-base-url">OpenAI-Compatible Base URL</Label>
              <Input
                id="openai-base-url"
                placeholder="https://api.example.com/v1"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              />
            </div>
          </div>
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
                  models: [
                    {
                      task: "summarize",
                      provider: provider as "anthropic" | "openaiCompatible" | "mock",
                      model
                    }
                  ]
                })
              }
              disabled={updateSettings.isPending}
              type="button"
            >
              Save
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
