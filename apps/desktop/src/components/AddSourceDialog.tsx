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
import { Alert, AlertDescription } from "./ui/alert";

type AddingState = "idle" | "adding" | "generating-skill" | "done" | "error";

export function AddSourceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<"rss" | "web">("rss");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [addingState, setAddingState] = useState<AddingState>("idle");
  const [skillError, setSkillError] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const addSource = trpc.sources.add.useMutation({
    onMutate: () => {
      setAddingState(type === "web" ? "generating-skill" : "adding");
      setErrorMessage(null);
      setSkillError(null);
    },
    onSuccess: async (data) => {
      setAddingState("done");
      await utils.sources.list.invalidate();
      
      // Check if skill generation had issues
      const result = data as { skillGenerationResult?: { success: boolean; error?: string } };
      if (result.skillGenerationResult && !result.skillGenerationResult.success) {
        setSkillError(result.skillGenerationResult.error ?? "Skill generation failed");
      }
      
      // Auto-close after short delay on success
      setTimeout(() => {
        setOpen(false);
        setName("");
        setUrl("");
        setType("rss");
        setAddingState("idle");
        setSkillError(null);
      }, 1500);
    },
    onError: (err) => {
      setAddingState("error");
      setErrorMessage(err.message || "Failed to add source.");
    }
  });

  const handleOpenChange = (newOpen: boolean) => {
    // Allow opening anytime
    if (newOpen) {
      setOpen(true);
      return;
    }
    // Only allow closing if not in progress
    if (addingState !== "adding" && addingState !== "generating-skill") {
      setOpen(false);
      setName("");
      setUrl("");
      setType("rss");
      setAddingState("idle");
      setErrorMessage(null);
      setSkillError(null);
    }
  };

  const getButtonText = () => {
    switch (addingState) {
      case "adding":
        return "Adding...";
      case "generating-skill":
        return "Analyzing site...";
      case "done":
        return "✓ Added";
      default:
        return "Save";
    }
  };

  const getProgressMessage = () => {
    switch (addingState) {
      case "adding":
        return "Adding source...";
      case "generating-skill":
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              <span>Analyzing website structure...</span>
            </div>
            <div className="text-xs text-slate-400">
              Generating extraction skill for this site
            </div>
          </div>
        );
      case "done":
        return (
          <div className="flex items-center gap-2 text-emerald-600">
            <span>✓</span>
            <span>Source added successfully</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>+ Add</Button>
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
                disabled={addingState === "adding" || addingState === "generating-skill"}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrorMessage(null);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="source-url">{type === "rss" ? "RSS Feed URL" : "URL of articles listing page"}</Label>
              <Input
                id="source-url"
                value={url}
                disabled={addingState === "adding" || addingState === "generating-skill"}
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
                disabled={addingState === "adding" || addingState === "generating-skill"}
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
                  <SelectItem value="web">Agentic (any website)</SelectItem>
                </SelectContent>
              </Select>
              {type === "web" && addingState === "idle" && (
                <div className="mt-1 text-xs text-slate-500">
                  Web sources are analyzed to extract articles automatically
                </div>
              )}
            </div>
            {/* Progress indicator */}
            {addingState !== "idle" && addingState !== "error" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {getProgressMessage()}
              </div>
            )}
            {/* Skill warning */}
            {skillError && (
              <Alert variant="warning" className="py-2">
                <AlertDescription className="text-xs">
                  {skillError} — You can regenerate the skill later from source settings.
                </AlertDescription>
              </Alert>
            )}
            {/* Error message */}
            {errorMessage && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{errorMessage}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={addingState === "adding" || addingState === "generating-skill"}
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
              disabled={!name || !url || addingState !== "idle"}
              type="button"
            >
              {getButtonText()}
            </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
