import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";

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
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline">Settings</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">LLM Settings</Dialog.Title>
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              Summarize Provider
              <select
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="anthropic">Anthropic</option>
                <option value="openaiCompatible">OpenAI Compatible</option>
              </select>
            </label>
            <label className="block text-sm">
              Summarize Model
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Anthropic API Key
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              OpenAI-Compatible API Key
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              OpenAI-Compatible Base URL
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                placeholder="https://api.example.com/v1"
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
