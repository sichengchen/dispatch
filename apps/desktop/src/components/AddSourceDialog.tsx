import { useState } from "react";
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

export function AddSourceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"rss" | "web">("rss");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const addSource = trpc.sources.add.useMutation({
    onSuccess: async () => {
      await utils.sources.list.invalidate();
      setOpen(false);
      setName("");
      setUrl("");
      setType("rss");
      setErrorMessage(null);
    },
    onError: (err) => {
      setErrorMessage(err.message || "Failed to add source.");
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">+ Add</Button>
      </DialogTrigger>
      <DialogContent className="w-[360px]">
        <DialogHeader>
          <DialogTitle>Add Source</DialogTitle>
        </DialogHeader>
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="source-name">Name</Label>
              <Input
                id="source-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrorMessage(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="source-url">URL</Label>
              <Input
                id="source-url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setErrorMessage(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as "rss" | "web");
                  setErrorMessage(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rss">RSS</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {errorMessage && (
              <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                {errorMessage}
              </div>
            )}
          </div>
          <DialogFooter>
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
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
