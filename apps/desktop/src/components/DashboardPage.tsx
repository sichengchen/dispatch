import { type ReactNode, useState, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { cn } from "../lib/utils";
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
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type StatusTone = "ok" | "warning" | "error" | "neutral";

type TaskRun = {
  id: number;
  kind: string;
  status: "running" | "success" | "warning" | "error" | "stopped";
  label: string;
  startedAt: number;
  finishedAt?: number | null;
  durationMs?: number | null;
  meta?: Record<string, unknown>;
};

type ScheduledTask = {
  name: string;
  frequency: string;
  nextRunAt: number | null;
  lastRunAt: number | null;
  status: string;
};

function formatDateTime(value?: number | Date | string | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatDuration(value?: number | null): string {
  if (!value || value <= 0) return "—";
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  const minutesLeft = minutes % 60;
  return `${hours}h ${minutesLeft}m`;
}

function StatusPill({
  tone,
  children
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  const tones: Record<StatusTone, string> = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
    neutral: "border-slate-200 bg-slate-50 text-slate-600"
  };
  return (
    <Badge variant="outline" className={cn("capitalize", tones[tone])}>
      {children}
    </Badge>
  );
}

function resolveRunTone(status: TaskRun["status"]): StatusTone {
  if (status === "success") return "ok";
  if (status === "warning") return "warning";
  if (status === "error") return "error";
  if (status === "running") return "warning";
  if (status === "stopped") return "neutral";
  return "neutral";
}

function getRunDetails(run: TaskRun): string {
  const meta = run.meta ?? {};
  if (run.kind === "fetch-source") {
    const inserted = Number(meta.inserted ?? 0);
    const skipped = Number(meta.skipped ?? 0);
    return `Inserted ${inserted} · Skipped ${skipped}`;
  }
  if (run.kind === "fetch-batch") {
    const inserted = Number(meta.inserted ?? 0);
    const failed = Number(meta.failed ?? 0);
    return `Inserted ${inserted} · Failed ${failed}`;
  }
  if (run.kind === "pipeline-article") {
    const step = meta.step ? String(meta.step) : "—";
    return `Stage: ${step}`;
  }
  if (run.kind === "pipeline-batch") {
    const processed = Number(meta.processed ?? 0);
    const failed = Number(meta.failed ?? 0);
    return `Processed ${processed} · Failed ${failed}`;
  }
  if (run.kind === "digest") {
    const count = Number(meta.articleCount ?? 0);
    return `${count} articles`;
  }
  if (meta.error) return String(meta.error);
  return "—";
}

type FetchPreset = "hourly" | "every2h" | "every6h" | "every12h" | "daily";
type PipelinePreset = "every5m" | "every15m" | "every30m" | "hourly";
type DigestPreset = "daily" | "every12h" | "every6h";

const FETCH_PRESETS: { value: FetchPreset; label: string }[] = [
  { value: "hourly", label: "Every hour" },
  { value: "every2h", label: "Every 2 hours" },
  { value: "every6h", label: "Every 6 hours" },
  { value: "every12h", label: "Every 12 hours" },
  { value: "daily", label: "Once daily" }
];

const PIPELINE_PRESETS: { value: PipelinePreset; label: string }[] = [
  { value: "every5m", label: "Every 5 minutes" },
  { value: "every15m", label: "Every 15 minutes" },
  { value: "every30m", label: "Every 30 minutes" },
  { value: "hourly", label: "Every hour" }
];

const DIGEST_PRESETS: { value: DigestPreset; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "every12h", label: "Every 12 hours" },
  { value: "every6h", label: "Every 6 hours" }
];

export function DashboardPage() {
  const utils = trpc.useUtils();
  const [isPollingFast, setIsPollingFast] = useState(false);

  const { data: dashboard } = trpc.tasks.dashboard.useQuery(undefined, {
    refetchInterval: isPollingFast ? 1500 : 3000
  });
  const { data: settings } = trpc.settings.get.useQuery();

  // Check if there are any running tasks
  const ingestionRuns = (dashboard?.ingestionRuns ?? []) as TaskRun[];
  const pipelineRuns = (dashboard?.pipelineRuns ?? []) as TaskRun[];
  const skillRuns = (dashboard?.skillRuns ?? []) as TaskRun[];
  const hasRunningTasks = ingestionRuns.some(r => r.status === "running") ||
    pipelineRuns.some(r => r.status === "running") ||
    skillRuns.some(r => r.status === "running");

  // Auto-adjust polling speed based on activity
  useEffect(() => {
    if (hasRunningTasks && !isPollingFast) {
      setIsPollingFast(true);
    } else if (!hasRunningTasks && isPollingFast) {
      // Delay before slowing down to catch any new tasks
      const timeout = setTimeout(() => setIsPollingFast(false), 5000);
      return () => clearTimeout(timeout);
    }
  }, [hasRunningTasks, isPollingFast]);

  // Schedule state
  const [fetchEnabled, setFetchEnabled] = useState(true);
  const [fetchPreset, setFetchPreset] = useState<FetchPreset>("hourly");
  const [fetchCron, setFetchCron] = useState("");
  const [pipelineEnabled, setPipelineEnabled] = useState(true);
  const [pipelinePreset, setPipelinePreset] = useState<PipelinePreset>("every15m");
  const [pipelineCron, setPipelineCron] = useState("");
  const [pipelineBatchSize, setPipelineBatchSize] = useState(10);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestPreset, setDigestPreset] = useState<DigestPreset>("daily");
  const [digestTime, setDigestTime] = useState("06:00");
  const [digestCron, setDigestCron] = useState("");
  const [digestTopN, setDigestTopN] = useState(10);
  const [digestHoursBack, setDigestHoursBack] = useState(24);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load settings into state
  useEffect(() => {
    if (!settings) return;
    const fetch = settings.fetchSchedule;
    const pipeline = settings.pipelineSchedule;
    const digest = settings.digest;
    setFetchEnabled(fetch?.enabled ?? true);
    setFetchPreset((fetch?.preset as FetchPreset) ?? "hourly");
    setFetchCron(fetch?.cronExpression ?? "");
    setPipelineEnabled(pipeline?.enabled ?? true);
    setPipelinePreset((pipeline?.preset as PipelinePreset) ?? "every15m");
    setPipelineCron(pipeline?.cronExpression ?? "");
    setPipelineBatchSize(pipeline?.batchSize ?? 10);
    setDigestEnabled(digest?.enabled ?? true);
    setDigestPreset((digest?.preset as DigestPreset) ?? "daily");
    setDigestTime(digest?.scheduledTime ?? "06:00");
    setDigestCron(digest?.cronExpression ?? "");
    setDigestTopN(digest?.topN ?? 10);
    setDigestHoursBack(digest?.hoursBack ?? 24);
  }, [settings]);

  const updateSettings = trpc.settings.update.useMutation({
    onSuccess: () => {
      utils.settings.get.invalidate();
      utils.tasks.dashboard.invalidate();
      toast.success("Schedules saved");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save schedules");
    }
  });

  const handleSaveSchedules = () => {
    if (!settings) return;
    updateSettings.mutate({
      models: settings.models,
      ui: settings.ui,
      grading: settings.grading,
      digest: {
        ...settings.digest,
        enabled: digestEnabled,
        preset: digestPreset,
        scheduledTime: digestTime,
        cronExpression: digestCron || undefined,
        topN: digestTopN,
        hoursBack: digestHoursBack
      },
      fetchSchedule: {
        enabled: fetchEnabled,
        preset: fetchPreset,
        cronExpression: fetchCron || undefined
      },
      pipelineSchedule: {
        enabled: pipelineEnabled,
        preset: pipelinePreset,
        cronExpression: pipelineCron || undefined,
        batchSize: pipelineBatchSize
      },
      agent: settings.agent
    });
  };

  const generateDigest = trpc.digests.generate.useMutation({
    onMutate: () => setIsPollingFast(true),
    onSuccess: () => {
      utils.digests.latest.invalidate();
      utils.digests.list.invalidate();
      utils.tasks.dashboard.invalidate();
      toast.success("Digest generated");
    },
    onError: (err) => {
      toast.error(err.message || "Digest generation failed");
    }
  });

  const runFetch = trpc.tasks.runFetch.useMutation({
    onMutate: () => setIsPollingFast(true),
    onSuccess: () => {
      utils.tasks.dashboard.invalidate();
      toast.success("Fetch started");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start fetch");
    }
  });
  const runPipeline = trpc.tasks.runPipeline.useMutation({
    onMutate: () => setIsPollingFast(true),
    onSuccess: () => {
      utils.tasks.dashboard.invalidate();
      toast.success("Pipeline started");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start pipeline");
    }
  });
  const stopTask = trpc.tasks.stopTask.useMutation({
    onSuccess: () => {
      utils.tasks.dashboard.invalidate();
      toast.success("Task stopped");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to stop task");
    }
  });

  const overview = dashboard?.overview;
  const sourcesHealth = overview?.sources;
  const totalSources = sourcesHealth?.total ?? 0;
  const healthySources = sourcesHealth?.healthy ?? 0;
  const degradedSources = sourcesHealth?.degraded ?? 0;
  const deadSources = sourcesHealth?.dead ?? 0;
  const latestFetchAt = sourcesHealth?.lastFetchedAt ?? null;
  const fetchQueue = overview?.fetchQueue;
  const fetchPending = fetchQueue?.pending ?? 0;
  const fetchRunning = fetchQueue?.running ?? 0;
  const pipelineInfo = overview?.pipeline;
  const digestInfo = overview?.digest;

  const pipelinePending = pipelineInfo?.pending ?? 0;
  const pipelineSampleNote =
    dashboard?.pipelineRuns?.length ? "Sample from recent pipeline runs" : "No recent pipeline runs";
  const digestSchedule = digestInfo?.scheduledTime
    ? `Daily at ${digestInfo.scheduledTime}`
    : "Not scheduled";

  const overviewTiles = [
    {
      title: "Sources Health",
      value: totalSources ? `${healthySources}/${totalSources} healthy` : "No sources",
      meta: degradedSources > 0 || deadSources > 0
        ? `${degradedSources} degraded · ${deadSources} dead`
        : "All sources healthy",
      tone: deadSources > 0 ? "error" : degradedSources > 0 ? "warning" : "ok"
    },
    {
      title: "Fetch Queue",
      value:
        fetchPending + fetchRunning > 0
          ? `${fetchRunning} running · ${fetchPending} queued`
          : totalSources
            ? "Idle"
            : "Waiting",
      meta: `Last fetch: ${formatDateTime(latestFetchAt)}`,
      tone:
        fetchPending + fetchRunning > 0
          ? "warning"
          : totalSources
            ? "neutral"
            : "warning"
    },
    {
      title: "Pipeline Queue",
      value: totalSources ? `${pipelinePending} pending` : "Awaiting data",
      meta: pipelineSampleNote,
      tone: pipelinePending > 0 ? "warning" : "neutral"
    },
    {
      title: "Digest Status",
      value: digestInfo?.lastGeneratedAt ? "Ready" : digestInfo?.enabled ? "Waiting" : "Disabled",
      meta: digestInfo?.lastGeneratedAt
        ? `Last digest: ${formatDateTime(digestInfo.lastGeneratedAt)}`
        : digestSchedule,
      tone: digestInfo?.lastGeneratedAt ? "ok" : digestInfo?.enabled ? "neutral" : "warning"
    }
  ] satisfies Array<{
    title: string;
    value: string;
    meta: string;
    tone: StatusTone;
  }>;

  const recentRuns = (dashboard?.recentRuns ?? []) as TaskRun[];
  const scheduledTasks = (dashboard?.scheduledTasks ?? []) as ScheduledTask[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg">Dashboard</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runFetch.mutate()}
              disabled={runFetch.isPending}
            >
              {runFetch.isPending ? "Queueing…" : "Run Fetch"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runPipeline.mutate()}
              disabled={runPipeline.isPending}
            >
              {runPipeline.isPending ? "Running…" : "Run Pipeline"}
            </Button>
            <Button
              size="sm"
              onClick={() => generateDigest.mutate()}
              disabled={generateDigest.isPending}
            >
              {generateDigest.isPending ? "Generating…" : "Generate Digest"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {overviewTiles.map((tile) => (
            <div
              key={tile.title}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase text-slate-400">
                  {tile.title}
                </div>
                <StatusPill tone={tile.tone}>{tile.tone}</StatusPill>
              </div>
              <div className="mt-3 text-lg font-semibold text-slate-900">
                {tile.value}
              </div>
              <div className="mt-1 text-xs text-slate-500">{tile.meta}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Activity</CardTitle>
          <CardDescription>Live status of running tasks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(() => {
            const runningFetches = ingestionRuns.filter((r) => r.status === "running");
            const runningPipeline = pipelineRuns.filter((r) => r.status === "running");
            const runningSkills = skillRuns.filter((r) => r.status === "running");
            const hasActivity = runningFetches.length > 0 || runningPipeline.length > 0 || runningSkills.length > 0 ||
              runFetch.isPending || runPipeline.isPending || generateDigest.isPending;

            const pipelineStages = ["classify", "grade", "summarize", "vectorize"];
            const getElapsed = (startedAt: number) => {
              const elapsed = Date.now() - startedAt;
              const seconds = Math.floor(elapsed / 1000);
              if (seconds < 60) return `${seconds}s`;
              const minutes = Math.floor(seconds / 60);
              return `${minutes}m ${seconds % 60}s`;
            };

            if (!hasActivity) {
              return (
                <div className="text-sm text-slate-500">
                  No tasks currently running. System is idle.
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {runningFetches.map((run) => {
                  const meta = run.meta ?? {};
                  const sourceName = meta.sourceName ? String(meta.sourceName) : run.label;
                  const sourceUrl = meta.sourceUrl ? String(meta.sourceUrl) : null;
                  const tier = meta.tier ? String(meta.tier) : "unknown";
                  const tierLabel = tier === "skill" ? "Agentic" : tier === "rss" ? "RSS" : tier;
                  return (
                    <div
                      key={run.id}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{tierLabel} fetching</span>
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">
                              {getElapsed(run.startedAt)}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium text-slate-700 truncate">{sourceName}</div>
                          {sourceUrl && (
                            <div className="text-xs text-slate-500 truncate">{sourceUrl}</div>
                          )}
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                              disabled={stopTask.isPending}
                            >
                              Stop
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Stop this task?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will cancel the current fetch operation. You can restart it later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel asChild>
                                <Button variant="ghost">Cancel</Button>
                              </AlertDialogCancel>
                              <AlertDialogAction asChild>
                                <Button
                                  variant="default"
                                  onClick={() => stopTask.mutate({ runId: run.id })}
                                >
                                  Stop Task
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
                {runningPipeline.map((run) => {
                  const meta = run.meta ?? {};
                  const title = meta.title ? String(meta.title) : run.label;
                  const currentStep = meta.step ? String(meta.step) : "processing";
                  const currentStepIndex = pipelineStages.indexOf(currentStep);
                  return (
                    <div
                      key={run.id}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">AI Pipeline</span>
                            <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                              {getElapsed(run.startedAt)}
                            </Badge>
                          </div>
                          <div className="text-sm text-slate-700 truncate">{title}</div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-blue-700 hover:text-blue-900 hover:bg-blue-100"
                              disabled={stopTask.isPending}
                            >
                              Stop
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Stop this task?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will cancel the current pipeline operation. The article will remain unprocessed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel asChild>
                                <Button variant="ghost">Cancel</Button>
                              </AlertDialogCancel>
                              <AlertDialogAction asChild>
                                <Button
                                  variant="default"
                                  onClick={() => stopTask.mutate({ runId: run.id })}
                                >
                                  Stop Task
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      <div className="flex items-center gap-1 ml-5">
                        {pipelineStages.map((stage, idx) => {
                          const isActive = stage === currentStep;
                          const isDone = idx < currentStepIndex;
                          return (
                            <div key={stage} className="flex items-center gap-1">
                              <div
                                className={cn(
                                  "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                                  isActive && "bg-blue-500 text-white",
                                  isDone && "bg-blue-200 text-blue-700",
                                  !isActive && !isDone && "bg-slate-200 text-slate-500"
                                )}
                              >
                                {stage}
                              </div>
                              {idx < pipelineStages.length - 1 && (
                                <div className={cn(
                                  "w-3 h-0.5",
                                  idx < currentStepIndex ? "bg-blue-300" : "bg-slate-200"
                                )} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {runningSkills.map((run) => {
                  const meta = run.meta ?? {};
                  const sourceName = meta.sourceName ? String(meta.sourceName) : run.label;
                  return (
                    <div
                      key={run.id}
                      className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">Skill Regeneration</span>
                            <Badge variant="outline" className="text-xs border-purple-300 text-purple-700">
                              {getElapsed(run.startedAt)}
                            </Badge>
                          </div>
                          <div className="text-sm text-slate-700 truncate">{sourceName}</div>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-purple-700 hover:text-purple-900 hover:bg-purple-100"
                              disabled={stopTask.isPending}
                            >
                              Stop
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Stop this task?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will cancel the skill regeneration. You can restart it later from the source list.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel asChild>
                                <Button variant="ghost">Cancel</Button>
                              </AlertDialogCancel>
                              <AlertDialogAction asChild>
                                <Button
                                  variant="default"
                                  onClick={() => stopTask.mutate({ runId: run.id })}
                                >
                                  Stop Task
                                </Button>
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  );
                })}
                {runFetch.isPending && runningFetches.length === 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                    <div className="flex-1">
                      <span className="font-medium text-slate-900">Queueing fetch jobs...</span>
                      <div className="text-xs text-slate-500">Starting source fetches</div>
                    </div>
                  </div>
                )}
                {runPipeline.isPending && runningPipeline.length === 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    <div className="flex-1">
                      <span className="font-medium text-slate-900">Running AI pipeline...</span>
                      <div className="text-xs text-slate-500">Processing pending articles</div>
                    </div>
                  </div>
                )}
                {generateDigest.isPending && (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                    <div className="flex-1">
                      <span className="font-medium text-slate-900">Generating digest...</span>
                      <div className="text-xs text-slate-500">Creating daily briefing from top articles</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="fetch">
            <TabsList>
              <TabsTrigger value="fetch">Article Fetch</TabsTrigger>
              <TabsTrigger value="pipeline">AI Pipeline</TabsTrigger>
              <TabsTrigger value="digest">Digest</TabsTrigger>
            </TabsList>

            <TabsContent value="fetch" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Article Fetch</div>
                  <div className="text-xs text-slate-500">
                    How often to fetch new articles from sources.
                  </div>
                </div>
                <Checkbox
                  id="fetch-enabled"
                  checked={fetchEnabled}
                  onCheckedChange={(checked) => setFetchEnabled(checked === true)}
                />
              </div>
              {fetchEnabled && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Frequency</Label>
                    <Select
                      value={fetchPreset}
                      onValueChange={(value) => setFetchPreset(value as FetchPreset)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FETCH_PRESETS.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {showAdvanced && (
                    <div className="space-y-1">
                      <Label>Custom cron (overrides preset)</Label>
                      <Input
                        placeholder="0 */2 * * *"
                        value={fetchCron}
                        onChange={(e) => setFetchCron(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="pipeline" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">AI Pipeline</div>
                  <div className="text-xs text-slate-500">
                    Process pending articles through the AI pipeline.
                  </div>
                </div>
                <Checkbox
                  id="pipeline-enabled"
                  checked={pipelineEnabled}
                  onCheckedChange={(checked) => setPipelineEnabled(checked === true)}
                />
              </div>
              {pipelineEnabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Frequency</Label>
                      <Select
                        value={pipelinePreset}
                        onValueChange={(value) => setPipelinePreset(value as PipelinePreset)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_PRESETS.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Batch size</Label>
                      <Input
                        type="number"
                        min="1"
                        max="50"
                        value={pipelineBatchSize}
                        onChange={(e) =>
                          setPipelineBatchSize(Math.max(1, Math.min(50, Number(e.target.value) || 10)))
                        }
                      />
                    </div>
                  </div>
                  {showAdvanced && (
                    <div className="space-y-1">
                      <Label>Custom cron (overrides preset)</Label>
                      <Input
                        placeholder="*/15 * * * *"
                        value={pipelineCron}
                        onChange={(e) => setPipelineCron(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="digest" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Digest Generation</div>
                  <div className="text-xs text-slate-500">
                    When to generate daily briefings.
                  </div>
                </div>
                <Checkbox
                  id="digest-enabled"
                  checked={digestEnabled}
                  onCheckedChange={(checked) => setDigestEnabled(checked === true)}
                />
              </div>
              {digestEnabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Frequency</Label>
                      <Select
                        value={digestPreset}
                        onValueChange={(value) => setDigestPreset(value as DigestPreset)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIGEST_PRESETS.map((preset) => (
                            <SelectItem key={preset.value} value={preset.value}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {digestPreset === "daily" && (
                      <div className="space-y-1">
                        <Label>Time</Label>
                        <Input
                          type="time"
                          value={digestTime}
                          onChange={(e) => setDigestTime(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
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
                  {showAdvanced && (
                    <div className="space-y-1">
                      <Label>Custom cron (overrides preset)</Label>
                      <Input
                        placeholder="0 6 * * *"
                        value={digestCron}
                        onChange={(e) => setDigestCron(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? "Hide advanced" : "Show advanced"}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveSchedules}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? "Saving…" : "Save Schedules"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled Tasks</CardTitle>
          <CardDescription>Upcoming automated runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduledTasks.map((task) => (
            <div
              key={task.name}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">{task.name}</div>
                <div className="text-xs text-slate-500">
                  {task.frequency}
                </div>
              </div>
              <div className="text-xs text-slate-500 text-right">
                <div className="text-slate-400">Next</div>
                <div>{formatDateTime(task.nextRunAt)}</div>
              </div>
              <div className="text-xs text-slate-500 text-right">
                <div className="text-slate-400">Last</div>
                <div>{formatDateTime(task.lastRunAt)}</div>
              </div>
              <StatusPill tone={task.status === "scheduled" ? "ok" : "neutral"}>
                {task.status}
              </StatusPill>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logs</CardTitle>
          <CardDescription>Latest system activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 && (
            <div className="text-sm text-slate-500">No recent runs yet.</div>
          )}
          {recentRuns.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Task</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Started</th>
                    <th className="px-3 py-2 text-left">Duration</th>
                    <th className="px-3 py-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run, index) => (
                    <tr
                      key={`${run.label}-${index}`}
                      className="border-t border-slate-100 bg-white"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {run.label}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill tone={resolveRunTone(run.status)}>
                          {run.status}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatDateTime(run.startedAt)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {getRunDetails(run)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
