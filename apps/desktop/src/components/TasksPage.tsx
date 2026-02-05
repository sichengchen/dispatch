import { type ReactNode } from "react";
import { trpc } from "../lib/trpc";
import { cn } from "../lib/utils";
import { AddSourceDialog } from "./AddSourceDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

type StatusTone = "ok" | "warning" | "error" | "neutral";

type TaskRun = {
  id: number;
  kind: string;
  status: "running" | "success" | "warning" | "error";
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

function formatDateTime(value?: number | Date | null): string {
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

type TasksPageProps = {
  onOpenHistory?: () => void;
};

export function TasksPage({ onOpenHistory }: TasksPageProps) {
  const utils = trpc.useUtils();
  const { data: dashboard } = trpc.tasks.dashboard.useQuery();

  const generateDigest = trpc.digests.generate.useMutation({
    onSuccess: () => {
      utils.digests.latest.invalidate();
      utils.digests.list.invalidate();
      utils.tasks.dashboard.invalidate();
    }
  });

  const runFetch = trpc.tasks.runFetch.useMutation({
    onSuccess: () => {
      utils.tasks.dashboard.invalidate();
    }
  });
  const runPipeline = trpc.tasks.runPipeline.useMutation({
    onSuccess: () => {
      utils.tasks.dashboard.invalidate();
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

  const ingestionRuns = (dashboard?.ingestionRuns ?? []) as TaskRun[];
  const pipelineRuns = (dashboard?.pipelineRuns ?? []) as TaskRun[];
  const recentRuns = (dashboard?.recentRuns ?? []) as TaskRun[];
  const scheduledTasks = (dashboard?.scheduledTasks ?? []) as ScheduledTask[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Tasks</CardTitle>
            <CardDescription>
              Operational overview of ingestion, AI processing, and digests.
            </CardDescription>
          </div>
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

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.2fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Fetching from Sources</CardTitle>
              <CardDescription>Most recent ingestion status.</CardDescription>
            </div>
            <AddSourceDialog />
          </CardHeader>
          <CardContent className="space-y-3">
            {ingestionRuns.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No fetch jobs yet. Add sources to start ingestion.
              </div>
            )}
            {ingestionRuns.map((run) => {
              const meta = run.meta ?? {};
              const inserted = Number(meta.inserted ?? 0);
              const skipped = Number(meta.skipped ?? 0);
              const tier = meta.tier ? String(meta.tier) : "—";
              const sourceName = meta.sourceName ? String(meta.sourceName) : run.label;
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium text-slate-900">{sourceName}</div>
                    <div className="text-xs text-slate-500">
                      {formatDateTime(run.startedAt)} · {tier}
                    </div>
                    <div className="text-xs text-slate-500">
                      Inserted {inserted} · Skipped {skipped}
                    </div>
                  </div>
                  <StatusPill tone={resolveRunTone(run.status)}>
                    {run.status}
                  </StatusPill>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Article Pipeline</CardTitle>
            <CardDescription>
              Recent AI pipeline activity by article.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {["Classify", "Grade", "Summarize", "Vectorize"].map((stage) => (
                <Badge key={stage} variant="secondary" className="text-xs">
                  {stage}
                </Badge>
              ))}
            </div>
            {pipelineRuns.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No pipeline runs yet. New articles will appear here after ingest.
              </div>
            )}
            <div className="space-y-3">
              {pipelineRuns.map((run) => {
                const meta = run.meta ?? {};
                const title = meta.title ? String(meta.title) : run.label;
                const step = meta.step ? String(meta.step) : "pending";
                return (
                <div
                  key={run.id}
                  className="rounded-lg border border-slate-100 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {title}
                      </div>
                      <div className="text-xs text-slate-500">
                        Stage: {step} · {formatDateTime(run.startedAt)}
                      </div>
                    </div>
                    <StatusPill tone={resolveRunTone(run.status)}>
                      {run.status}
                    </StatusPill>
                  </div>
                </div>
              );
              })}
            </div>
            <div className="text-xs text-slate-500">{pipelineSampleNote}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Digest Generation</CardTitle>
            <CardDescription>Latest briefing status and controls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-slate-100 bg-white px-3 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-900">Latest Digest</div>
                <StatusPill tone={digestInfo?.lastGeneratedAt ? "ok" : "neutral"}>
                  {digestInfo?.lastGeneratedAt ? "ready" : "waiting"}
                </StatusPill>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Generated: {formatDateTime(digestInfo?.lastGeneratedAt ?? null)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Articles: {digestInfo?.articleCount ?? 0}
              </div>
              <Separator className="my-3" />
              <div className="text-xs text-slate-500">
                Next scheduled digest: {digestSchedule}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => onOpenHistory?.()}
              >
                View History
              </Button>
              <Button
                size="sm"
                onClick={() => generateDigest.mutate()}
                disabled={generateDigest.isPending}
              >
                {generateDigest.isPending ? "Generating…" : "Generate Now"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled Tasks</CardTitle>
          <CardDescription>Upcoming automated runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduledTasks.map((task) => (
            <div
              key={task.name}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-slate-900">{task.name}</div>
                <div className="text-xs text-slate-500">
                  Frequency: {task.frequency}
                </div>
              </div>
              <div className="text-xs text-slate-500">
                Next: {formatDateTime(task.nextRunAt)}
              </div>
              <div className="text-xs text-slate-500">
                Last: {formatDateTime(task.lastRunAt)}
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
          <CardTitle className="text-base">Recent Runs & Errors</CardTitle>
          <CardDescription>Latest system activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentRuns.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              No recent runs yet.
            </div>
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
