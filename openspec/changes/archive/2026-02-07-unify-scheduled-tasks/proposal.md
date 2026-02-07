## Why

The three scheduled tasks (fetch, pipeline, digest) each have duplicated logic for cron resolution, preset mapping, and settings schema — yet they live in different places in `dispatch.settings.json` (`fetchSchedule`, `pipelineSchedule`, and `digest` which mixes scheduling with digest-specific config). The digest schedule in settings still uses a top-level `digest.scheduledTime` / `digest.enabled` pattern instead of a shared schedule structure, creating an inconsistency between how the backend stores schedules and how the frontend presents them as three parallel schedule tabs. Each task should share a common schedule shape (enabled, preset, cronExpression) stored under a unified `schedules` key in settings, while keeping task-specific options (batchSize, topN, hoursBack, etc.) separate from the schedule config.

## What Changes

- **BREAKING**: Replace the three separate settings keys (`fetchSchedule`, `pipelineSchedule`, and scheduling fields within `digest`) with a single `schedules` map in `dispatch.settings.json`. Each entry keyed by task name (`fetch`, `pipeline`, `digest`) uses a shared schedule shape: `{ enabled, preset, cronExpression }`.
- Move digest-specific config (`topN`, `hoursBack`, `preferredLanguage`, `useBold`, `scheduledTime`) to a pure `digest` key that no longer contains schedule fields (`enabled`, `preset`, `cronExpression`).
- Unify the scheduler service so each task's cron resolution uses shared logic (`resolveScheduleCron(taskName)`) instead of three separate `resolveFetchCron` / `resolveDigestCron` / `resolvePipelineCron` functions.
- Unify preset cron maps into a single registry with per-task defaults, removing the three separate `FETCH_PRESET_CRONS` / `DIGEST_PRESET_CRONS` / `PIPELINE_PRESET_CRONS` constants.
- Keep the existing custom cron expression override (advanced mode) working for all tasks.
- Keep the `scheduledTime` concept for digest: when digest preset is `"daily"`, the `scheduledTime` from digest config (not schedule config) is used to build the cron, same as today.
- Update `getSchedulerSnapshot()` to derive data from the unified schedules structure.
- Update the frontend `DashboardPage` to read/write the new `schedules` structure, and update the `handleSaveSchedules` to use the new shape.
- Update tRPC `settings` routes and `tasks.dashboard` to reflect the new schema.
- No backward-compatible migration — this is a clean breaking change to the settings shape.

## Capabilities

### New Capabilities
- `unified-schedules`: Shared schedule configuration shape and resolution logic for all scheduled tasks, stored under a single `schedules` key in settings.

### Modified Capabilities
_(none — no existing specs are affected)_

## Impact

- **Settings file** (`dispatch.settings.json`): Schema changes — old `fetchSchedule`, `pipelineSchedule` keys removed; scheduling fields removed from `digest`; new `schedules` key added. Breaking change, no migration.
- **Server** (`packages/server/src/services/scheduler.ts`): Refactored cron resolution into shared utility.
- **Server** (`packages/server/src/services/settings.ts`): New unified schedule schema and getters.
- **Server** (`packages/server/src/routes/tasks.ts`): Dashboard endpoint updated for new schedule shape.
- **Desktop** (`apps/desktop/src/components/DashboardPage.tsx`): Schedule configuration UI updated to read/write `schedules.*` instead of separate keys.
- **tRPC types** (`packages/api`): Updated settings type re-exports.
