## 1. Settings Schema & Getters

- [x] 1.1 Add `scheduleEntrySchema` (shared Zod shape: `enabled`, `preset`, `cronExpression`) and `schedulesConfigSchema` (`{ fetch, pipeline, digest }`) in `packages/server/src/services/settings.ts`
- [x] 1.2 Add `pipelineConfigSchema` (`{ batchSize }`) in `packages/server/src/services/settings.ts`
- [x] 1.3 Remove `digestConfigSchema` scheduling fields (`enabled`, `preset`, `cronExpression`) — keep only content fields (`scheduledTime`, `topN`, `hoursBack`, `preferredLanguage`, `useBold`)
- [x] 1.4 Remove `fetchScheduleConfigSchema` and `pipelineScheduleConfigSchema`
- [x] 1.5 Update top-level `settingsSchema` — replace `fetchSchedule`, `pipelineSchedule` with `schedules` and `pipeline`; update `digest` to content-only shape
- [x] 1.6 Add `getSchedulesConfig()`, `getDefaultSchedulesConfig()`, `getPipelineConfig()`, `getDefaultPipelineConfig()` getter functions
- [x] 1.7 Remove `getFetchScheduleConfig()`, `getPipelineScheduleConfig()` and their defaults; update `getDigestConfig()` / `getDefaultDigestConfig()` to exclude scheduling fields
- [x] 1.8 Update `loadSettings()` merged object to use new keys (`schedules`, `pipeline`)
- [x] 1.9 Update `updateModelsConfig()` and any other helpers that spread the full settings object

## 2. Scheduler Service

- [x] 2.1 Replace three `FETCH_PRESET_CRONS`, `PIPELINE_PRESET_CRONS`, `DIGEST_PRESET_CRONS` constants with unified `PRESET_CRONS` registry and `DEFAULT_PRESETS` map in `packages/server/src/services/scheduler.ts`
- [x] 2.2 Replace `resolveFetchCron()`, `resolveDigestCron()`, `resolvePipelineCron()` with single `resolveScheduleCron(task, entry)` function
- [x] 2.3 Handle digest `"daily"` special case in `startScheduler()` — when `resolveScheduleCron` returns `""`, build cron from `digestConfig.scheduledTime`
- [x] 2.4 Update `startScheduler()` to read from `getSchedulesConfig()` instead of three separate getters; read `batchSize` from `getPipelineConfig()`
- [x] 2.5 Update `getSchedulerSnapshot()` to derive data from unified `getSchedulesConfig()`

## 3. tRPC Routes

- [x] 3.1 Update Zod schemas in `packages/server/src/routes/settings.ts` — replace `digestConfigSchema`, `fetchScheduleConfigSchema`, `pipelineScheduleConfigSchema` with new `scheduleEntrySchema`, `schedulesConfigSchema`, `pipelineConfigSchema`, and content-only `digestConfigSchema`
- [x] 3.2 Update `settings.get` to return `schedules`, `pipeline`, and content-only `digest` instead of old keys
- [x] 3.3 Update `settings.update` input schema to accept the new shape
- [x] 3.4 Update `tasks.dashboard` route — read schedule data from `getSchedulesConfig()` and pipeline config from `getPipelineConfig()`; fix digest frequency display to use actual schedule preset/cron

## 4. Frontend

- [x] 4.1 Update `DashboardPage` `useEffect` settings loader to read from `settings.schedules.fetch`, `settings.schedules.pipeline`, `settings.schedules.digest` and `settings.pipeline.batchSize`
- [x] 4.2 Update `handleSaveSchedules` to write `schedules: { fetch, pipeline, digest }` plus `pipeline: { batchSize }` and content-only `digest`
- [x] 4.3 Verify all three schedule tabs (fetch, pipeline, digest) still function correctly with the new data paths

## 5. Settings File & Validation

- [x] 5.1 Update `dispatch.settings.json` to use the new shape — add `schedules` and `pipeline` keys, remove `fetchSchedule`/`pipelineSchedule`, strip scheduling fields from `digest`
- [x] 5.2 Run `pnpm build` to verify no type errors across all packages
- [x] 5.3 Run `pnpm test` to verify existing tests pass (fix any that reference old schema)
- [x] 5.4 Run `pnpm lint` and fix any issues
