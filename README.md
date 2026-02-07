# The Dispatch

The Dispatch is a local-first, AI-native desktop news reader.
It runs on your computer, pulls stories from your sources, notify you when there's a breaking news, and generates daily digests.

## Capabilities

- Agents that fetch articles from any website sources.
- LLM generates summary, tags, grading, key points for each article.
- Model/provider management (supports Anthropic and OpenAI-compatible providers). Per-task model routing.
- Scheduled fetch, articles processing, and digest jobs with cron config.
- IM notifications (supports Telegram).

## Monorepo layout

- `apps/desktop`: Electron + React + Vite UI
- `packages/server`: Hono + tRPC server and background jobs
- `packages/db`: SQLite + Drizzle schema/migrations
- `packages/lib`: shared LLM/provider logic
- `packages/api`: shared API types

## Quick start

1. Install dependencies:

```bash
pnpm install
```

2. Create your local database schema:

```bash
pnpm --filter @dispatch/db migrate
```

3. (Optional) Seed sample data:

```bash
pnpm --filter @dispatch/db seed
```

4. (Optional) Copy env template:

```bash
cp sample.env .env
```

5. Start the workspace:

```bash
pnpm dev
```

`pnpm dev` runs the desktop app and local server via Turborepo.

## Core commands

### Development

```bash
pnpm dev
pnpm --filter @dispatch/server dev
pnpm --filter @dispatch/desktop dev
```

### Build

```bash
pnpm build
```

### Database

```bash
pnpm --filter @dispatch/db migrate
pnpm --filter @dispatch/db generate
pnpm --filter @dispatch/db seed
pnpm --filter @dispatch/db verify
```

### Tests

```bash
pnpm test
pnpm --filter @dispatch/server test
pnpm --filter @dispatch/server test:backend
pnpm --filter @dispatch/server test:scraper
pnpm --filter @dispatch/server test:scraper:advanced
pnpm --filter @dispatch/server test:llm
pnpm --filter @dispatch/server test:llm:live
pnpm --filter @dispatch/desktop test
pnpm --filter @dispatch/desktop test:e2e
```
