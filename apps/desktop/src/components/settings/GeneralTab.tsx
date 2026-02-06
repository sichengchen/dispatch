import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { Combobox } from "../ui/combobox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { Slider } from "../ui/slider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "../ui/alert-dialog";
import {
  type GradingWeights,
  type ScoreRow,
  generateId,
  formatWeight
} from "./types";

type GeneralTabProps = {
  gradingWeights: GradingWeights;
  setGradingWeights: React.Dispatch<React.SetStateAction<GradingWeights>>;
  interestScores: ScoreRow[];
  setInterestScores: React.Dispatch<React.SetStateAction<ScoreRow[]>>;
  sourceScores: ScoreRow[];
  setSourceScores: React.Dispatch<React.SetStateAction<ScoreRow[]>>;
  digestPreferredLanguage: string;
  setDigestPreferredLanguage: (value: string) => void;
  skillGeneratorMaxSteps: number;
  setSkillGeneratorMaxSteps: (value: number) => void;
  extractionAgentMaxSteps: number;
  setExtractionAgentMaxSteps: (value: number) => void;
  chatAgentMaxSteps: number;
  setChatAgentMaxSteps: (value: number) => void;
  digestReferenceLinkBehavior: "internal" | "external";
  setDigestReferenceLinkBehavior: (value: "internal" | "external") => void;
  externalLinkBehavior: "internal" | "external";
  setExternalLinkBehavior: (value: "internal" | "external") => void;
};

const WEIGHT_ITEMS = [
  { id: "importancy", label: "Importancy weight" },
  { id: "quality", label: "Quality weight" },
  { id: "interest", label: "Interest weight" },
  { id: "source", label: "Source weight" }
] as const;

export function GeneralTab({
  gradingWeights,
  setGradingWeights,
  interestScores,
  setInterestScores,
  sourceScores,
  setSourceScores,
  digestPreferredLanguage,
  setDigestPreferredLanguage,
  skillGeneratorMaxSteps,
  setSkillGeneratorMaxSteps,
  extractionAgentMaxSteps,
  setExtractionAgentMaxSteps,
  chatAgentMaxSteps,
  setChatAgentMaxSteps,
  digestReferenceLinkBehavior,
  setDigestReferenceLinkBehavior,
  externalLinkBehavior,
  setExternalLinkBehavior
}: GeneralTabProps) {
  const { data: availableTags = [] } = trpc.articles.uniqueTags.useQuery();
  const { data: availableSources = [] } = trpc.sources.listForWeights.useQuery();

  const tagOptions = availableTags.map((tag) => ({ value: tag, label: tag }));
  const sourceOptions = availableSources.map((src) => ({
    value: String(src.id),
    label: `${src.name} (${new URL(src.url).hostname})`
  }));

  const existingTagKeys = interestScores.map((row) => row.key);
  const existingSourceKeys = sourceScores.map((row) => row.key);

  const handleAddTag = (tag: string) => {
    setInterestScores((prev) => [
      ...prev,
      { id: generateId(), key: tag, score: "0" }
    ]);
  };

  const handleAddSource = (sourceId: string) => {
    const source = availableSources.find((s) => String(s.id) === sourceId);
    const key = source ? source.name : sourceId;
    setSourceScores((prev) => [
      ...prev,
      { id: generateId(), key, score: "0" }
    ]);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Reader</div>
        <div className="mt-1 text-xs text-slate-500">
          Configure how the reader behave.
        </div>
        <div className="mt-3 space-y-2">
          <Label htmlFor="digest-link-behavior">Articles</Label>
          <Select
            value={digestReferenceLinkBehavior}
            onValueChange={(value) =>
              setDigestReferenceLinkBehavior(value as "internal" | "external")
            }
          >
            <SelectTrigger id="digest-link-behavior">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Open in article reader</SelectItem>
              <SelectItem value="external">Open original article</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[11px] text-slate-500">
            Controls what happens when clicking articles in digest.
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="external-link-behavior">External Link</Label>
          <Select
            value={externalLinkBehavior}
            onValueChange={(value) =>
              setExternalLinkBehavior(value as "internal" | "external")
            }
          >
            <SelectTrigger id="external-link-behavior">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Open in app</SelectItem>
              <SelectItem value="external">Open in external browser</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[11px] text-slate-500">
            Controls what happens when opening external article links.
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Grading</div>
        <div className="mt-1 text-xs text-slate-500">
          Configure the grade equation. Weights auto-normalize.
        </div>
        <div className="mt-3 space-y-4">
          {WEIGHT_ITEMS.map((item) => (
            <div key={item.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <Label>{item.label}</Label>
                <span className="font-mono text-xs text-slate-500">
                  {formatWeight(gradingWeights[item.id])}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Less important</span>
                  <span>Default</span>
                  <span>More important</span>
                </div>
                <Slider
                  value={[gradingWeights[item.id]]}
                  min={0}
                  max={2}
                  step={0.05}
                  onValueChange={(value) => {
                    const nextValue = value[0] ?? 0;
                    setGradingWeights((prev) => ({
                      ...prev,
                      [item.id]: nextValue
                    }));
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <div>
            <div className="text-xs font-semibold text-slate-700">Interest by tag</div>
            <div className="text-[11px] text-slate-500">
              Scores range from -10 to 10. Search and select tags from your articles.
            </div>
          </div>
          <Combobox
            options={tagOptions}
            placeholder="Add tag..."
            searchPlaceholder="Search tags..."
            emptyText="No tags found."
            onSelect={handleAddTag}
            excludeValues={existingTagKeys}
          />
          {interestScores.length === 0 && (
            <div className="text-xs text-slate-500">No tag weights yet.</div>
          )}
          {interestScores.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
              <div className="rounded bg-slate-100 px-2 py-1.5 text-sm text-slate-700">
                {row.key}
              </div>
              <Input
                type="number"
                min="-10"
                max="10"
                step="1"
                value={row.score}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setInterestScores((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, score: nextValue } : item
                    )
                  );
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  setInterestScores((prev) =>
                    prev.filter((item) => item.id !== row.id)
                  );
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <div>
            <div className="text-xs font-semibold text-slate-700">Source weights</div>
            <div className="text-[11px] text-slate-500">
              Scores range from -10 to 10. Search and select from your sources.
            </div>
          </div>
          <Combobox
            options={sourceOptions}
            placeholder="Add source..."
            searchPlaceholder="Search sources..."
            emptyText="No sources found."
            onSelect={handleAddSource}
            excludeValues={existingSourceKeys}
          />
          {sourceScores.length === 0 && (
            <div className="text-xs text-slate-500">No source weights yet.</div>
          )}
          {sourceScores.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
              <div className="rounded bg-slate-100 px-2 py-1.5 text-sm text-slate-700">
                {row.key}
              </div>
              <Input
                type="number"
                min="-10"
                max="10"
                step="1"
                value={row.score}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSourceScores((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, score: nextValue } : item
                    )
                  );
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  setSourceScores((prev) =>
                    prev.filter((item) => item.id !== row.id)
                  );
                }}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-900">Languages</div>
          <div className="text-xs text-slate-500">
            Preferred language for digest generation, summaries, topics, and chat agents.
          </div>
          <div className="mt-2 space-y-1">
            <Label htmlFor="digest-language">Digest Preferred Language</Label>
            <Input
              id="digest-language"
              placeholder="English"
              value={digestPreferredLanguage}
              onChange={(e) => setDigestPreferredLanguage(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Agents</div>
        <div className="mt-1 text-xs text-slate-500">
          Configure max steps for AI agents used in website analysis, article extraction, and chat.
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="skill-max-steps">Analysis Agent Max Steps</Label>
            <Input
              id="skill-max-steps"
              type="number"
              min="5"
              max="100"
              value={skillGeneratorMaxSteps}
              onChange={(e) =>
                setSkillGeneratorMaxSteps(Math.max(5, Math.min(100, Number(e.target.value) || 40)))
              }
            />
            <div className="text-[11px] text-slate-500">
              Steps for analyzing website structure
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="extraction-max-steps">Extraction Agent Max Steps</Label>
            <Input
              id="extraction-max-steps"
              type="number"
              min="5"
              max="100"
              value={extractionAgentMaxSteps}
              onChange={(e) =>
                setExtractionAgentMaxSteps(Math.max(5, Math.min(100, Number(e.target.value) || 20)))
              }
            />
            <div className="text-[11px] text-slate-500">
              Steps for extracting articles
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="chat-max-steps">Chat Agent Max Steps</Label>
            <Input
              id="chat-max-steps"
              type="number"
              min="1"
              max="20"
              value={chatAgentMaxSteps}
              onChange={(e) =>
                setChatAgentMaxSteps(Math.max(1, Math.min(20, Number(e.target.value) || 10)))
              }
            />
            <div className="text-[11px] text-slate-500">
              Tool call rounds for chat agents
            </div>
          </div>
        </div>
      </div>

      <DangerZone />
    </div>
  );
}

function DangerZone() {
  const utils = trpc.useUtils();
  const deleteAllData = trpc.settings.deleteAllData.useMutation({
    onSuccess: () => {
      toast.success("All data deleted");
      utils.sources.list.invalidate();
      utils.articles.list.invalidate();
      utils.digests.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete data");
    }
  });

  const resetSettings = trpc.settings.resetSettings.useMutation({
    onSuccess: () => {
      toast.success("Settings reset to defaults");
      utils.settings.get.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to reset settings");
    }
  });

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
      <div className="text-sm font-semibold text-rose-900">Danger Zone</div>
      <div className="mt-1 text-xs text-rose-700">
        Irreversible actions. Proceed with caution.
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-rose-300 text-rose-700 hover:bg-rose-100"
              type="button"
              disabled={deleteAllData.isPending}
            >
              {deleteAllData.isPending ? "Deleting…" : "Delete All Data"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all sources, articles, and digests.
                Your settings will be preserved. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost" type="button">
                  Cancel
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="default"
                  className="bg-rose-600 hover:bg-rose-700"
                  type="button"
                  onClick={() => deleteAllData.mutate()}
                >
                  Delete All Data
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-rose-300 text-rose-700 hover:bg-rose-100"
              type="button"
              disabled={resetSettings.isPending}
            >
              {resetSettings.isPending ? "Resetting…" : "Reset All Settings"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all settings?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset all settings to their default values, including
                providers, models, and grading configuration. Your data (sources,
                articles, digests) will be preserved. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel asChild>
                <Button variant="ghost" type="button">
                  Cancel
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  variant="default"
                  className="bg-rose-600 hover:bg-rose-700"
                  type="button"
                  onClick={() => resetSettings.mutate()}
                >
                  Reset Settings
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
