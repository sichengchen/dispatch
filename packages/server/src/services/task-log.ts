export type TaskKind =
  | "fetch-source"
  | "fetch-batch"
  | "pipeline-article"
  | "pipeline-batch"
  | "digest"
  | "skill";

export type TaskStatus = "running" | "success" | "warning" | "error" | "stopped";

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

// AbortController registry for cancellable tasks
const abortControllers = new Map<number, AbortController>();

export function getTaskAbortController(runId: number): AbortController | undefined {
  return abortControllers.get(runId);
}

export function createTaskAbortController(runId: number): AbortController {
  const controller = new AbortController();
  abortControllers.set(runId, controller);
  return controller;
}

export function stopTaskRun(runId: number): boolean {
  const run = runs.find((entry) => entry.id === runId);
  if (!run || run.status !== "running") return false;

  const controller = abortControllers.get(runId);
  if (controller) {
    controller.abort();
    abortControllers.delete(runId);
  }

  const finishedAt = Date.now();
  run.status = "stopped";
  run.finishedAt = finishedAt;
  run.durationMs = finishedAt - run.startedAt;
  run.meta = { ...(run.meta ?? {}), stoppedByUser: true };

  return true;
}

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

  // Clean up abort controller
  abortControllers.delete(id);

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
