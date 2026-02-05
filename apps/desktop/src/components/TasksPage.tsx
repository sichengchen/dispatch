import { useMemo, type ReactNode } from "react";
import { trpc } from "../lib/trpc";
import { cn } from "../lib/utils";
import { AddSourceDialog } from "./AddSourceDialog";
import { DigestHistoryDialog } from "./DigestHistoryDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

type StatusTone = "ok" | "warning" | "error" | "neutral";

type RecentRun = {
  task: string;
  status: "success" | "warning" | "error" | "idle";
  started: string;
  duration: string;
  details: string;
};

function formatDateTime(value?: number | Date | null): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
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

function resolveSourceTone(health: string | null | undefined): StatusTone {
  if (health === "dead") return "error";
  if (health === "degraded") return "warning";
  if (health === "healthy") return "ok";
  return "neutral";
}

function resolveRunTone(status: RecentRun["status"]): StatusTone {
  if (status === "success") return "ok";
  if (status === "warning") return "warning";
  if (status === "error") return "error";
  return "neutral";
}

export function TasksPage() {
  const utils = trpc.useUtils();
  const { data: sources = [] } = trpc.sources.list.useQuery();
  const { data: digest } = trpc.digests.latest.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: articles = [] } = trpc.articles.list.useQuery({
    page: 1,
    pageSize: 5
  });

  const generateDigest = trpc.digests.generate.useMutation({
    onSuccess: () => {
      utils.digests.latest.invalidate();
      utils.digests.list.invalidate();
    }
  });

  const totalSources = sources.length;
  const deadSources = sources.filter((source) => source.healthStatus === "dead").length;
  const degradedSources = sources.filter(
    (source) => source.healthStatus === "degraded"
  ).length;
  const healthySources = totalSources - deadSources - degradedSources;

  const latestFetchAt = useMemo(() => {
    const timestamps = sources
      .map((source) => source.lastFetchedAt)
      .filter(Boolean) as Array<number | Date>;
    if (!timestamps.length) return null;
    return timestamps
      .map((value) => (value instanceof Date ? value.getTime() : value))
      .sort((a, b) => b - a)[0];
  }, [sources]);

  const pipelinePending = articles.filter((article) => !article.processedAt).length;
  const pipelineSampleNote =
    articles.length > 0 ? "Sample from the last 5 articles" : "No recent articles";

  const digestEnabled = settings?.digest?.enabled ?? true;
  const digestSchedule = settings?.digest?.scheduledTime
    ? `Daily at ${settings.digest.scheduledTime}`
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
      value: totalSources ? "Idle" : "Waiting",
      meta: `Last fetch: ${formatDateTime(latestFetchAt)}`,
      tone: totalSources ? "neutral" : "warning"
    },
    {
      title: "Pipeline Queue",
      value: articles.length ? `${pipelinePending} pending` : "Awaiting data",
      meta: pipelineSampleNote,
      tone: pipelinePending > 0 ? "warning" : "neutral"
    },
    {
      title: "Digest Status",
      value: digest ? "Ready" : digestEnabled ? "Waiting" : "Disabled",
      meta: digest
        ? `Last digest: ${formatDateTime(digest.generatedAt)}`
        : digestSchedule,
      tone: digest ? "ok" : digestEnabled ? "neutral" : "warning"
    }
  ] satisfies Array<{
    title: string;
    value: string;
    meta: string;
    tone: StatusTone;
  }>;

  const recentRuns: RecentRun[] = [
    digest
      ? {
          task: "Digest Generation",
          status: "success",
          started: formatDateTime(digest.generatedAt),
          duration: "—",
          details: `${digest.articleIds.length} articles`
        }
      : null,
    latestFetchAt
      ? {
          task: "RSS Fetch",
          status: "success",
          started: formatDateTime(latestFetchAt),
          duration: "—",
          details: `${totalSources} sources checked`
        }
      : null
  ].filter(Boolean) as RecentRun[];

  const scheduledTasks = [
    {
      name: "RSS Fetch",
      frequency: "Every hour",
      nextRun: "—",
      lastRun: formatDateTime(latestFetchAt),
      status: "idle"
    },
    {
      name: "Digest Generation",
      frequency: digestSchedule,
      nextRun: digestEnabled ? digestSchedule : "Disabled",
      lastRun: digest ? formatDateTime(digest.generatedAt) : "—",
      status: digestEnabled ? "scheduled" : "disabled"
    },
    {
      name: "Health Check",
      frequency: "Daily",
      nextRun: "—",
      lastRun: "—",
      status: "idle"
    },
    {
      name: "Vector Cleanup",
      frequency: "Weekly",
      nextRun: "—",
      lastRun: "—",
      status: "idle"
    }
  ];

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
            <Button size="sm" variant="outline" disabled title="Coming soon">
              Run Fetch
            </Button>
            <Button size="sm" variant="outline" disabled title="Coming soon">
              Run Pipeline
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
            {sources.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No fetch jobs yet. Add sources to start ingestion.
              </div>
            )}
            {sources.slice(0, 5).map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-900">{source.name}</div>
                  <div className="text-xs text-slate-500">
                    Last fetch: {formatDateTime(source.lastFetchedAt)}
                  </div>
                </div>
                <StatusPill tone={resolveSourceTone(source.healthStatus)}>
                  {source.healthStatus ?? "unknown"}
                </StatusPill>
              </div>
            ))}
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
            {articles.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                No pipeline runs yet. New articles will appear here after ingest.
              </div>
            )}
            <div className="space-y-3">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className="rounded-lg border border-slate-100 bg-white px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {article.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        Processed: {formatDateTime(article.processedAt)}
                      </div>
                    </div>
                    <StatusPill tone={article.processedAt ? "ok" : "warning"}>
                      {article.processedAt ? "processed" : "queued"}
                    </StatusPill>
                  </div>
                </div>
              ))}
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
                <StatusPill tone={digest ? "ok" : "neutral"}>
                  {digest ? "ready" : "waiting"}
                </StatusPill>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Generated: {digest ? formatDateTime(digest.generatedAt) : "—"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Articles: {digest ? digest.articleIds.length : 0}
              </div>
              <Separator className="my-3" />
              <div className="text-xs text-slate-500">
                Next scheduled digest: {digestSchedule}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <DigestHistoryDialog />
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
                Next: {task.nextRun}
              </div>
              <div className="text-xs text-slate-500">
                Last: {task.lastRun}
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
                      key={`${run.task}-${index}`}
                      className="border-t border-slate-100 bg-white"
                    >
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {run.task}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill tone={resolveRunTone(run.status)}>
                          {run.status}
                        </StatusPill>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {run.started}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {run.duration}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {run.details}
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
