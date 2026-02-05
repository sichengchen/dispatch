import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import {
  type GradingWeights,
  type ScoreRow,
  createScoreRow,
  formatWeight
} from "./types";

type GeneralTabProps = {
  verboseMode: boolean;
  setVerboseMode: (value: boolean) => void;
  gradingWeights: GradingWeights;
  setGradingWeights: React.Dispatch<React.SetStateAction<GradingWeights>>;
  interestScores: ScoreRow[];
  setInterestScores: React.Dispatch<React.SetStateAction<ScoreRow[]>>;
  sourceScores: ScoreRow[];
  setSourceScores: React.Dispatch<React.SetStateAction<ScoreRow[]>>;
  digestEnabled: boolean;
  setDigestEnabled: (value: boolean) => void;
  digestTime: string;
  setDigestTime: (value: string) => void;
  digestTopN: number;
  setDigestTopN: (value: number) => void;
  digestHoursBack: number;
  setDigestHoursBack: (value: number) => void;
  digestPreferredLanguage: string;
  setDigestPreferredLanguage: (value: string) => void;
};

const WEIGHT_ITEMS = [
  { id: "importancy", label: "Importancy weight" },
  { id: "quality", label: "Quality weight" },
  { id: "interest", label: "Interest weight" },
  { id: "source", label: "Source weight" }
] as const;

export function GeneralTab({
  verboseMode,
  setVerboseMode,
  gradingWeights,
  setGradingWeights,
  interestScores,
  setInterestScores,
  sourceScores,
  setSourceScores,
  digestEnabled,
  setDigestEnabled,
  digestTime,
  setDigestTime,
  digestTopN,
  setDigestTopN,
  digestHoursBack,
  setDigestHoursBack,
  digestPreferredLanguage,
  setDigestPreferredLanguage
}: GeneralTabProps) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Diagnostics</div>
        <div className="mt-1 text-xs text-slate-500">
          Show detailed pipeline steps for each article.
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <Checkbox
            id="verbose-mode"
            checked={verboseMode}
            onCheckedChange={(checked) => {
              setVerboseMode(checked === true);
            }}
          />
          <Label htmlFor="verbose-mode">Verbose mode</Label>
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
          <div className="text-sm font-semibold text-slate-900">Digest</div>
          <div className="text-xs text-slate-500">
            Preferred language for digest overview and topic summaries.
          </div>
          <div className="mt-2 space-y-1">
            <Label htmlFor="digest-language">Preferred Language</Label>
            <Input
              id="digest-language"
              placeholder="English"
              value={digestPreferredLanguage}
              onChange={(e) => setDigestPreferredLanguage(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-700">Interest by tag</div>
              <div className="text-[11px] text-slate-500">
                Scores range from -10 to 10.
              </div>
            </div>
            <Button
              size="sm"
              type="button"
              onClick={() => {
                setInterestScores((prev) => [...prev, createScoreRow()]);
              }}
            >
              + Add Tag
            </Button>
          </div>
          {interestScores.length === 0 && (
            <div className="text-xs text-slate-500">No tag weights yet.</div>
          )}
          {interestScores.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_120px_auto] gap-2">
              <Input
                placeholder="ai"
                value={row.key}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setInterestScores((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, key: nextValue } : item
                    )
                  );
                }}
              />
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
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-700">Source weights</div>
              <div className="text-[11px] text-slate-500">
                Match by source ID, name, or domain. Scores range from -10 to 10.
              </div>
            </div>
            <Button
              size="sm"
              type="button"
              onClick={() => {
                setSourceScores((prev) => [...prev, createScoreRow()]);
              }}
            >
              + Add Source
            </Button>
          </div>
          {sourceScores.length === 0 && (
            <div className="text-xs text-slate-500">No source weights yet.</div>
          )}
          {sourceScores.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_120px_auto] gap-2">
              <Input
                placeholder="source id, name, or domain"
                value={row.key}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSourceScores((prev) =>
                    prev.map((item) =>
                      item.id === row.id ? { ...item, key: nextValue } : item
                    )
                  );
                }}
              />
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
        <div className="text-sm font-semibold text-slate-900">Daily Digest</div>
        <div className="mt-1 text-xs text-slate-500">
          Auto-generate a daily briefing from top-rated articles.
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <Checkbox
            id="digest-enabled"
            checked={digestEnabled}
            onCheckedChange={(checked) => {
              setDigestEnabled(checked === true);
            }}
          />
          <Label htmlFor="digest-enabled">Enable daily digest</Label>
        </div>
        {digestEnabled && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Scheduled time</Label>
              <Input
                type="time"
                value={digestTime}
                onChange={(e) => setDigestTime(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Top N articles</Label>
              <Input
                type="number"
                min="1"
                max="50"
                value={digestTopN}
                onChange={(e) =>
                  setDigestTopN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Hours back</Label>
              <Input
                type="number"
                min="1"
                max="72"
                value={digestHoursBack}
                onChange={(e) =>
                  setDigestHoursBack(Math.max(1, Math.min(72, Number(e.target.value) || 1)))
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
