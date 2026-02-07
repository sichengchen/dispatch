## Context

The scheduler currently manages three independent jobs (fetch, pipeline, digest), each with its own:
- Preset-to-cron map constant (`FETCH_PRESET_CRONS`, `PIPELINE_PRESET_CRONS`, `DIGEST_PRESET_CRONS`)
- Resolve function (`resolveFetchCron`, `resolveDigestCron`, `resolvePipelineCron`)
- Settings schema and getter (`fetchScheduleConfigSchema` / `digestConfigSchema` / `pipelineScheduleConfigSchema`)
- Module-level active cron variable (`activeFetchCron`, `activeDigestCron`, `activePipelineCron`)

In `dispatch.settings.json`, fetch and pipeline schedules live at top-level keys (`fetchSchedule`, `pipelineSchedule`), while digest schedule fields (`enabled`, `preset`, `cronExpression`) are mixed into the `digest` object alongside content config (`topN`, `hoursBack`, etc.). The frontend's `DashboardPage` already treats them as three parallel schedule tabs but reads/writes them from three different schema shapes.

The Zod schemas are duplicated between `settings.ts` (service) and `settings.ts` (route), which will both need updating.

## Goals / Non-Goals

**Goals:**
- Single `schedules` key in settings with `fetch`, `pipeline`, `digest` sub-keys, each using the same shape
- One shared `resolveScheduleCron(taskName)` function replacing three separate resolvers
- One unified preset registry data structure instead of three separate constants
- Clean separation: schedule config (when to run) vs. task config (what to do)
- Frontend reads/writes the new unified shape

**Non-Goals:**
- Adding new scheduled tasks (only restructuring existing three)
- Changing the actual cron behavior or preset values
- Reworking the `node-schedule` integration or job lifecycle
- Unifying the task-specific configs themselves (batchSize, topN, etc. stay where they are)
- Removing the advanced custom cron input — it stays

## Decisions

### 1. Settings shape: `schedules` map with shared entry type

New shape in `dispatch.settings.json`:

```jsonc
{
  "schedules": {
    "fetch":    { "enabled": true, "preset": "hourly",   "cronExpression": null },
    "pipeline": { "enabled": true, "preset": "every15m", "cronExpression": null },
    "digest":   { "enabled": true, "preset": "daily",    "cronExpression": null }
  },
  "digest": {
    // content config only — no scheduling fields
    "scheduledTime": "06:00",
    "topN": 10,
    "hoursBack": 24,
    "preferredLanguage": "English",
    "useBold": true
  },
  "pipeline": {
    "batchSize": 10
  }
  // fetchSchedule and pipelineSchedule keys removed
}
```

**Rationale**: A single `schedules` map makes the parallel structure explicit. Each entry is the same Zod type (`ScheduleEntry`), eliminating per-task schema duplication. Task-specific config stays in dedicated keys.

**Alternative considered**: Keep separate keys but use a shared Zod type. Rejected because it doesn't fix the structural inconsistency in the JSON — three different places to look for schedule config.

**Note on pipeline config**: Currently `batchSize` lives inside `pipelineSchedule`. It will move to a new `pipeline` top-level key to match the separation pattern (schedule config vs task config). The `pipelineSchedule` key is removed entirely.

### 2. Shared `ScheduleEntry` Zod schema

```ts
const scheduleEntrySchema = z.object({
  enabled: z.boolean().optional(),
  preset: z.string().optional(),           // validated per-task at runtime
  cronExpression: z.string().optional(),
});
type ScheduleEntry = z.infer<typeof scheduleEntrySchema>;
```

The `preset` field is typed as `string` in the shared schema since each task has different valid presets. Preset validation happens in the resolve function where the task-specific registry is known.

**Rationale**: A strict per-task union on `preset` at the Zod level would require three different schema instances, defeating the purpose. Runtime validation when resolving is sufficient and already how it works (fallback to default on unknown preset).

### 3. Unified preset registry

Replace three separate `PRESET_CRONS` constants with a single registry:

```ts
const PRESET_CRONS: Record<string, Record<string, string>> = {
  fetch:    { hourly: "0 * * * *", every2h: "0 */2 * * *", ... },
  pipeline: { every5m: "*/5 * * * *", every15m: "*/15 * * * *", ... },
  digest:   { daily: "", every12h: "0 */12 * * *", every6h: "0 */6 * * *" },
};

const DEFAULT_PRESETS: Record<string, string> = {
  fetch: "hourly",
  pipeline: "every15m",
  digest: "daily",
};
```

### 4. Shared cron resolver

```ts
function resolveScheduleCron(task: string, entry: ScheduleEntry): string {
  if (entry.cronExpression) return entry.cronExpression;
  const preset = entry.preset ?? DEFAULT_PRESETS[task];
  const presetMap = PRESET_CRONS[task] ?? {};
  const cron = presetMap[preset];
  if (cron !== undefined) return cron;
  // fallback: use default preset's cron
  return presetMap[DEFAULT_PRESETS[task]] ?? "0 * * * *";
}
```

For digest `"daily"` preset (where the cron map returns `""`), the scheduler's `startScheduler()` handles the special case by reading `digestConfig.scheduledTime` to build the cron, same as today. This keeps the resolver generic — the special case is in the caller.

**Alternative considered**: Passing `scheduledTime` into the resolver. Rejected because it leaks task-specific knowledge into the shared function.

### 5. Settings route changes

The `settings.get` tRPC route will return the new shape:

```ts
{
  schedules: getSchedulesConfig(),    // { fetch, pipeline, digest }
  digest: getDigestConfig(),          // content config only
  pipeline: getPipelineConfig(),      // { batchSize }
  // fetchSchedule and pipelineSchedule removed
}
```

The `settings.update` input schema will accept the new shape. The route Zod schemas (duplicated in `routes/settings.ts`) will be updated in parallel with the service schemas.

### 6. Frontend changes

`DashboardPage` state management simplifies:
- Replace `fetchEnabled/fetchPreset/fetchCron` + `pipelineEnabled/pipelinePreset/pipelineCron` + `digestEnabled/digestPreset/digestCron` with a pattern that reads from `settings.schedules.{task}`.
- `handleSaveSchedules` writes `schedules: { fetch: {...}, pipeline: {...}, digest: {...} }` plus task-specific config.
- `pipelineBatchSize` reads from `settings.pipeline.batchSize` instead of `settings.pipelineSchedule.batchSize`.
- The three tab contents remain structurally the same — only the data source changes.

### 7. Dashboard `scheduledTasks` array

The `tasks.dashboard` route builds the `scheduledTasks` array using `getSchedulerSnapshot()`. Since the snapshot now derives from the unified `schedules` config, the digest entry's `frequency` field will properly reflect the actual schedule (preset label or cron), not just "Daily at {time}".

## Risks / Trade-offs

- **[Breaking settings file]** → This is a breaking change to the settings shape. Old `fetchSchedule`, `pipelineSchedule` keys and scheduling fields in `digest` are simply removed. Users must reconfigure schedules after updating. No migration logic needed.
- **[Duplicate Zod schemas]** → The route file (`routes/settings.ts`) duplicates schemas from `services/settings.ts`. Both must be updated. Consider importing from services in a follow-up, but that's out of scope here.
- **[Digest scheduledTime special case]** → Keeping this in the scheduler caller rather than the shared resolver means the resolver alone isn't sufficient for digest. This is a conscious trade-off to keep the shared function generic. Document it clearly in code.
- **[Pipeline config key rename]** → `pipelineSchedule.batchSize` moves to `pipeline.batchSize`. Any code that directly reads `pipelineSchedule.batchSize` must be updated.
