# Dispatch

Local-first, AI-native news reader. Dispatch runs a local server alongside a desktop UI to collect sources, extract articles, and build daily digests. Your news agency at home.

## Highlights

- AI-powered summary, key points, related articles, and importancy grading.
- Scheduled digests with configurable time window.
- Agent-powered scraping for both static HTML and SPA sites.
- Extraction rules stored as agent skills.
- Configurable models and assignments of models per type of tasks.

## Architecture

- Desktop App: `apps/desktop` (Electron + React + Vite)
- Server: `packages/server` (Hono + tRPC)
- Database: `packages/db` (SQLite + Drizzle)
- Shared AI client: `packages/lib`
- API types: `packages/api`

## Quickstart

```bash
pnpm install
pnpm dev
```

For a single package:

```bash
pnpm --filter @dispatch/server dev
pnpm --filter @dispatch/desktop dev
```

## Configuration

Dispatch loads configuration from a settings file and environment variables.

- Settings file: `dispatch.settings.json`
- Database file: `dispatch.dev.db`
- Vector store: `dispatch.vectors`

## Database

```bash
pnpm --filter @dispatch/db migrate
pnpm --filter @dispatch/db seed
```

## Tests

```bash
pnpm test
```

Package-specific tests:

```bash
pnpm --filter @dispatch/server test
pnpm --filter @dispatch/desktop test
pnpm --filter @dispatch/desktop test:e2e
```

## Repo Layout

- `apps/desktop`: desktop app and Electron shell
- `packages/server`: API server and background jobs
- `packages/db`: Drizzle schema and migrations
- `packages/lib`: shared AI client and utilities
- `packages/api`: shared API types

## Notes

- `pnpm dev` uses Turborepo to run the desktop app and local server together.
- The server loads `.env` from the workspace root if present.
