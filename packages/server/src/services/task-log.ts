export type TaskKind =
  | "fetch-source"
  | "fetch-batch"
  | "pipeline-article"
  | "pipeline-batch"
  | "digest";

export type TaskStatus = "running" | "success" | "warning" | "error";

export type TaskRun = {
  id: number;
  kind: TaskKind;
  label: string;
  status: TaskStatus;
  startedAt: number;
  finishedAt?: number | null;
  durationMs?: number | null;
  meta?: Record<string, unknown>;
};

const MAX_TASK_RUNS = 200;
const runs: TaskRun[] = [];
let nextId = 1;

export function startTaskRun(
  kind: TaskKind,
  label: string,
  meta?: Record<string, unknown>
): number {
  const run: TaskRun = {
    id: nextId++,
    kind,
    label,
    status: "running",
    startedAt: Date.now(),
    meta
  };
  runs.push(run);
  if (runs.length > MAX_TASK_RUNS) {
    runs.splice(0, runs.length - MAX_TASK_RUNS);
  }
  return run.id;
}

export function updateTaskRun(
  id: number,
  patch: Partial<Omit<TaskRun, "id" | "kind" | "label" | "startedAt">>
) {
  const run = runs.find((entry) => entry.id === id);
  if (!run) return;
  if (patch.status) run.status = patch.status;
  if (patch.finishedAt !== undefined) run.finishedAt = patch.finishedAt;
  if (patch.durationMs !== undefined) run.durationMs = patch.durationMs;
  if (patch.meta) {
    run.meta = { ...(run.meta ?? {}), ...patch.meta };
  }
}

export function finishTaskRun(
  id: number,
  status: TaskStatus,
  meta?: Record<string, unknown>
) {
  const run = runs.find((entry) => entry.id === id);
  if (!run) return;
  const finishedAt = Date.now();
  run.status = status;
  run.finishedAt = finishedAt;
  run.durationMs = finishedAt - run.startedAt;
  if (meta) {
    run.meta = { ...(run.meta ?? {}), ...meta };
  }
}

export function listTaskRuns(options?: {
  kind?: TaskKind;
  limit?: number;
}): TaskRun[] {
  const limit = options?.limit ?? 20;
  const filtered = options?.kind
    ? runs.filter((run) => run.kind === options.kind)
    : runs.slice();
  return filtered
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}
