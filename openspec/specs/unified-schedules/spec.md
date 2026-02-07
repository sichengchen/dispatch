## ADDED Requirements

### Requirement: Shared schedule shape
Every scheduled task (fetch, pipeline, digest) SHALL use a common schedule configuration shape containing `enabled` (boolean) and `cronExpression` (string). Presets are a frontend-only concept; the backend stores only cron expressions.

#### Scenario: Schedule shape consistency
- **WHEN** a schedule entry is read for any task (fetch, pipeline, or digest)
- **THEN** it SHALL contain exactly the fields `enabled` and `cronExpression`, with no task-specific fields or preset names mixed in

#### Scenario: Default values
- **WHEN** a schedule entry is missing from settings
- **THEN** the system SHALL return a default with `enabled: true` and the task's default cron expression (fetch: `"0 * * * *"`, pipeline: `"*/15 * * * *"`, digest: `"0 6 * * *"`)

### Requirement: Unified schedules key in settings
All schedule configurations SHALL be stored under a single `schedules` key in `dispatch.settings.json`, keyed by task name (`fetch`, `pipeline`, `digest`).

#### Scenario: Settings structure
- **WHEN** the settings file is written
- **THEN** it SHALL contain a `schedules` object with keys `fetch`, `pipeline`, and `digest`, each holding the shared schedule shape (`enabled`, `cronExpression`)

#### Scenario: Old keys removed
- **WHEN** settings are saved
- **THEN** the top-level `fetchSchedule` and `pipelineSchedule` keys SHALL NOT be present, and the `digest` key SHALL NOT contain `enabled`, `cronExpression`, `scheduledTime`, or `hoursBack` fields

### Requirement: Task-specific config separated from schedule
Task-specific configuration SHALL remain in its own settings key, separate from schedule config. Pipeline-specific fields (`batchSize`) SHALL be stored under `pipeline`. Digest-specific fields (`topN`, `preferredLanguage`, `useBold`) SHALL remain under `digest`.

#### Scenario: Pipeline batch size location
- **WHEN** pipeline batch size is configured
- **THEN** it SHALL be stored under `pipeline.batchSize` (not inside `schedules.pipeline`)

#### Scenario: Digest content config location
- **WHEN** digest topN, preferredLanguage, or useBold are configured
- **THEN** they SHALL be stored under the `digest` key (not inside `schedules.digest`)

### Requirement: Cron-only schedule resolution
The scheduler SHALL use `cronExpression` directly from each schedule entry. There is no preset resolution on the backend. If `cronExpression` is missing, the scheduler SHALL fall back to the task's default cron.

#### Scenario: Cron used directly
- **WHEN** the scheduler starts a job for any task
- **THEN** it SHALL use `entry.cronExpression` directly, with no preset-to-cron mapping

#### Scenario: Missing cron fallback
- **WHEN** a schedule entry has no `cronExpression`
- **THEN** the scheduler SHALL use the task's default cron (fetch: `"0 * * * *"`, pipeline: `"*/15 * * * *"`, digest: `"0 6 * * *"`)

### Requirement: Frontend preset-to-cron mapping
The frontend SHALL maintain preset-to-cron mappings for each task type. When loading settings, the frontend SHALL reverse-match stored cron expressions to identify the active preset. When saving, the frontend SHALL convert the selected preset to a cron expression.

#### Scenario: Reverse-match on load
- **WHEN** settings are loaded in the dashboard
- **THEN** the frontend SHALL match the stored `cronExpression` against known preset crons to highlight the correct preset in the UI

#### Scenario: Custom cron detection
- **WHEN** the stored `cronExpression` does not match any known preset
- **THEN** the frontend SHALL display it as a custom cron in the advanced input

#### Scenario: Digest daily time extraction
- **WHEN** the digest cron matches the daily pattern (`M H * * *`)
- **THEN** the frontend SHALL extract the time and display the "Daily" preset with the correct time in the time picker

#### Scenario: Save converts preset to cron
- **WHEN** the user saves schedules with a preset selected
- **THEN** the frontend SHALL convert the preset to its cron expression before sending to the backend

### Requirement: Per-task preset definitions (frontend)
The frontend SHALL define presets for each task. Fetch presets: `hourly` (`0 * * * *`), `every2h` (`0 */2 * * *`), `every6h` (`0 */6 * * *`), `every12h` (`0 */12 * * *`), `daily` (`0 6 * * *`). Pipeline presets: `every5m` (`*/5 * * * *`), `every15m` (`*/15 * * * *`), `every30m` (`*/30 * * * *`), `hourly` (`0 * * * *`). Digest presets: `daily` (built from time picker), `every12h` (`0 */12 * * *`), `every6h` (`0 */6 * * *`).

#### Scenario: Fetch preset mapping
- **WHEN** fetch preset `"hourly"` is selected
- **THEN** the saved cron SHALL be `"0 * * * *"`

#### Scenario: Pipeline preset mapping
- **WHEN** pipeline preset `"every15m"` is selected
- **THEN** the saved cron SHALL be `"*/15 * * * *"`

#### Scenario: Digest daily preset with time
- **WHEN** digest preset `"daily"` is selected with time `"08:30"`
- **THEN** the saved cron SHALL be `"30 8 * * *"`

### Requirement: Scheduler snapshot reflects unified structure
The `getSchedulerSnapshot()` function SHALL return schedule data derived from the unified `schedules` config, with each task entry containing `enabled`, `cron`, and `nextRunAt`.

#### Scenario: Snapshot structure
- **WHEN** `getSchedulerSnapshot()` is called
- **THEN** it SHALL return an object with `scrape`, `pipeline`, and `digest` entries, each containing `enabled`, `cron`, and `nextRunAt` derived from the unified schedule config

### Requirement: Human-readable cron display
The backend `tasks.dashboard` route SHALL reverse-match cron expressions to human-readable labels for display. Known crons map to labels (e.g., `"0 * * * *"` -> `"Every hour"`). Daily-pattern crons (`M H * * *`) display as `"Daily at HH:MM"`. Unknown crons display the raw expression.

#### Scenario: Known cron label
- **WHEN** the fetch cron is `"0 */2 * * *"`
- **THEN** the dashboard SHALL display `"Every 2 hours"`

#### Scenario: Daily cron label
- **WHEN** the digest cron is `"0 6 * * *"`
- **THEN** the dashboard SHALL display `"Daily at 06:00"`

#### Scenario: Custom cron label
- **WHEN** the cron is `"0 3,15 * * 1-5"`
- **THEN** the dashboard SHALL display the raw cron expression
