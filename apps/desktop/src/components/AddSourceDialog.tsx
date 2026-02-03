import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { trpc } from "../lib/trpc";
import { Button } from "./ui/button";

export function AddSourceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"rss" | "web">("rss");
  const utils = trpc.useUtils();
  const addSource = trpc.sources.add.useMutation({
    onSuccess: async () => {
      await utils.sources.list.invalidate();
      setOpen(false);
      setName("");
      setUrl("");
      setType("rss");
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="outline">+ Add</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-4 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">Add Source</Dialog.Title>
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              URL
              <input
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              Type
              <select
                className="mt-1 w-full rounded border border-slate-200 px-2 py-1"
                value={type}
                onChange={(e) => setType(e.target.value as "rss" | "web")}
              >
                <option value="rss">RSS</option>
                <option value="web">Web</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                addSource.mutate({
                  name,
                  url,
                  type
                })
              }
              disabled={!name || !url || addSource.isPending}
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
