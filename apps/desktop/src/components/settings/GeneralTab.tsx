import { toast } from "sonner";
import { trpc } from "../../lib/trpc";
import { Button } from "../ui/button";
import { Combobox } from "../ui/combobox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
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
  appTitle: string;
  setAppTitle: (value: string) => void;
  gradingWeights: GradingWeights;
  setGradingWeights: React.Dispatch<React.SetStateAction<GradingWeights>>;
  interestScores: ScoreRow[];
  setInterestScores: React.Dispatch<React.SetStateAction<ScoreRow[]>>;
  sourceScores: ScoreRow[];
  setSourceScores: React.Dispatch<React.SetStateAction<ScoreRow[]>>;
  digestPreferredLanguage: string;
  setDigestPreferredLanguage: (value: string) => void;
  digestUseBold: boolean;
  setDigestUseBold: (value: boolean) => void;
  skillGeneratorMaxSteps: number;
  setSkillGeneratorMaxSteps: (value: number) => void;
  extractionAgentMaxSteps: number;
  setExtractionAgentMaxSteps: (value: number) => void;
  extractionMaxArticles: number;
  setExtractionMaxArticles: (value: number) => void;
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
  appTitle,
  setAppTitle,
  gradingWeights,
  setGradingWeights,
  interestScores,
  setInterestScores,
  sourceScores,
  setSourceScores,
  digestPreferredLanguage,
  setDigestPreferredLanguage,
  digestUseBold,
  setDigestUseBold,
  skillGeneratorMaxSteps,
  setSkillGeneratorMaxSteps,
  extractionAgentMaxSteps,
  setExtractionAgentMaxSteps,
  extractionMaxArticles,
  setExtractionMaxArticles,
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
        <div className="text-sm font-semibold text-slate-900">Appearance</div>
        <div className="mt-1 text-xs text-slate-500">
          Customize how your news reader looks.
        </div>
        <div className="mt-3 space-y-1">
          <Label htmlFor="app-title">App Title</Label>
          <Input
            id="app-title"
            placeholder="The Dispatch"
            value={appTitle}
            onChange={(e) => setAppTitle(e.target.value)}
          />
          <div className="text-[11px] text-slate-500">
            The name displayed in the header. Leave empty for "The Dispatch".
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Reader</div>
        <div className="mt-1 text-xs text-slate-500">
          Configure how the reader behave.
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="digest-link-behavior">Enable built-in article reader</Label>
            <div className="text-[11px] text-slate-500">
              Controls what happens when clicking articles in digest.
            </div>
          </div>
          <Switch
            id="digest-link-behavior"
            checked={digestReferenceLinkBehavior === "internal"}
            onCheckedChange={(checked) =>
              setDigestReferenceLinkBehavior(checked ? "internal" : "external")
            }
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="external-link-behavior">Open links in external browser</Label>
            <div className="text-[11px] text-slate-500">
              Controls what happens when opening external article links.
            </div>
          </div>
          <Switch
            id="external-link-behavior"
            checked={externalLinkBehavior === "external"}
            onCheckedChange={(checked) =>
              setExternalLinkBehavior(checked ? "external" : "internal")
            }
          />
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
            <Label>Interest by tag</Label>
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
            <div key={row.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <Label>{row.key}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="h-auto px-1 py-0 text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => {
                      setInterestScores((prev) =>
                        prev.filter((item) => item.id !== row.id)
                      );
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <span className="font-mono text-xs text-slate-500">
                  {Number(row.score) > 0 ? `+${row.score}` : row.score}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Less interested</span>
                  <span>Neutral</span>
                  <span>More interested</span>
                </div>
                <Slider
                  value={[Number(row.score) || 0]}
                  min={-10}
                  max={10}
                  step={1}
                  onValueChange={(value) => {
                    const nextValue = String(value[0] ?? 0);
                    setInterestScores((prev) =>
                      prev.map((item) =>
                        item.id === row.id ? { ...item, score: nextValue } : item
                      )
                    );
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          <div>
            <Label>Source weights</Label>
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
            <div key={row.id} className="space-y-2">
              <div className="flex items-center justify-between text-sm text-slate-700">
                <div className="flex items-center gap-2">
                  <Label>{row.key}</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    className="h-auto px-1 py-0 text-xs text-slate-400 hover:text-slate-600"
                    onClick={() => {
                      setSourceScores((prev) =>
                        prev.filter((item) => item.id !== row.id)
                      );
                    }}
                  >
                    Remove
                  </Button>
                </div>
                <span className="font-mono text-xs text-slate-500">
                  {Number(row.score) > 0 ? `+${row.score}` : row.score}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>Less trusted</span>
                  <span>Neutral</span>
                  <span>More trusted</span>
                </div>
                <Slider
                  value={[Number(row.score) || 0]}
                  min={-10}
                  max={10}
                  step={1}
                  onValueChange={(value) => {
                    const nextValue = String(value[0] ?? 0);
                    setSourceScores((prev) =>
                      prev.map((item) =>
                        item.id === row.id ? { ...item, score: nextValue } : item
                      )
                    );
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-900">Digest</div>
          <div className="text-xs text-slate-500">
            Configure digest generation preferences.
          </div>
          <div className="mt-2 space-y-1">
            <Label htmlFor="digest-language">Preferred Language</Label>
            <Input
              id="digest-language"
              placeholder="English"
              value={digestPreferredLanguage}
              onChange={(e) => setDigestPreferredLanguage(e.target.value)}
            />
            <div className="text-[11px] text-slate-500">
              Language for digest summaries, topics, and chat agents.
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="digest-bold">Use Bold Text</Label>
              <div className="text-[11px] text-slate-500">
                Allow bold text emphasis in digest key points.
              </div>
            </div>
            <Switch
              id="digest-bold"
              checked={digestUseBold}
              onCheckedChange={setDigestUseBold}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Agents</div>
        <div className="mt-1 text-xs text-slate-500">
          Configure max steps for AI agents used in website analysis, article extraction, and chat.
        </div>
        <div className="mt-3 grid grid-cols-4 gap-4">
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
            <Label htmlFor="extraction-max-articles">Max Articles per Extraction</Label>
            <Input
              id="extraction-max-articles"
              type="number"
              min="1"
              max="50"
              value={extractionMaxArticles}
              onChange={(e) =>
                setExtractionMaxArticles(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
              }
            />
            <div className="text-[11px] text-slate-500">
              Articles extracted per source
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
  const settingsQuery = trpc.settings.get.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const handleRerunSetup = () => {
    if (!settingsQuery.data) return;
    updateSettings.mutate({
      ...settingsQuery.data,
      onboardingComplete: false,
    });
  };
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
    <>
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-900">Setup</div>
      <div className="mt-1 text-xs text-slate-500">
        Re-run the initial setup wizard to reconfigure providers and sources.
      </div>
      <div className="mt-3">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={handleRerunSetup}
          disabled={updateSettings.isPending}
        >
          {updateSettings.isPending ? "Resetting…" : "Re-run Setup Wizard"}
        </Button>
      </div>
    </div>
    <div className="rounded-lg border border-rose-200 bg-white p-3">
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
    </>
  );
}
