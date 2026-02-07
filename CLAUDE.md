# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dispatch is a local-first, AI-native news reader. It runs a local server alongside a desktop UI to collect sources, extract articles, and build daily digests. Supports Telegram notifications for breaking news and digests.

## Commands

### Development
```bash
pnpm dev                              # Run all packages (Turborepo)
pnpm --filter @dispatch/server dev    # Run server only
pnpm --filter @dispatch/desktop dev   # Run desktop only
```

### Build
```bash
pnpm build                            # Build all packages
```

### Database
```bash
pnpm --filter @dispatch/db migrate    # Run migrations
pnpm --filter @dispatch/db seed       # Seed database
pnpm --filter @dispatch/db generate   # Generate migration from schema changes
pnpm --filter @dispatch/db verify     # Verify database schema
```

### Testing
```bash
pnpm test                                           # Run all tests
pnpm --filter @dispatch/server test                 # Server tests (backend + LLM pipeline)
pnpm --filter @dispatch/server test:backend         # Backend/tRPC tests only
pnpm --filter @dispatch/server test:scraper         # Scraper tests (LLM disabled)
pnpm --filter @dispatch/server test:scraper:advanced # Advanced scraper tests
pnpm --filter @dispatch/server test:llm             # Single LLM pipeline test
pnpm --filter @dispatch/server test:llm:live        # All live LLM tests (requires API keys)
pnpm --filter @dispatch/desktop test                # Type checking
pnpm --filter @dispatch/desktop test:e2e            # E2E Playwright tests
```

Run a single server test file:
```bash
pnpm --filter @dispatch/server exec vitest run test/<test-file>.test.ts
```

### Lint
```bash
pnpm lint
```

## Architecture

### Package Structure
- `apps/desktop` - Electron + React + Vite desktop application
- `packages/server` - Hono + tRPC API server with background jobs
- `packages/db` - SQLite (better-sqlite3) + Drizzle ORM schema and migrations
- `packages/lib` - Shared AI client (Anthropic, OpenAI via Vercel AI SDK)
- `packages/api` - Re-exports tRPC `AppRouter` type for client consumption

### Desktop-Server Communication
The desktop app runs the server as a child process and communicates via IPC proxy:
1. Electron main process (`electron/main.ts`) spawns the server, scanning ports 3001–3010
2. Preload script (`electron/preload.ts`) exposes `window.dispatchApi` with `request()`, `getServerUrl()`, `openExternal()`
3. tRPC client (`src/lib/trpc.ts`) routes all API calls through the IPC proxy to the local server
4. In packaged builds, the server is bundled via `scripts/bundle-server.sh` and runs as a separate Node process

### Data Flow
1. **Sources** → RSS feeds or web pages registered by user
2. **Scraper** → Fetches and extracts article content (RSS parser or Playwright for SPAs)
3. **Skill Generator** → Creates extraction skills for web sources using LLM agents
4. **LLM Pipeline** → Summarizes, classifies, and grades articles
5. **Digests** → Scheduled daily summaries of top articles
6. **Vector Store** → LanceDB for article embeddings and similarity search
7. **Notifications** → Telegram bot (via Grammy) sends digests and breaking news alerts

### Key Server Services (`packages/server/src/services/`)
- `scheduler.ts` - Cron-based job scheduler for scraping and digest generation
- `scraper.ts` - Article fetching with RSS and Playwright strategies
- `skill-generator.ts` - LLM agent that generates extraction rules for web sources
- `extraction-agent.ts` - Uses generated skills to extract articles
- `llm.ts` - AI pipeline for summarization, classification, grading, and embeddings
- `digest.ts` - Generates daily digest summaries
- `vector.ts` - LanceDB vector store operations
- `settings.ts` - Loads/saves settings from `dispatch.settings.json` (Zod-validated)
- `notifications.ts` - Telegram notifications with pairing code flow

### tRPC Routes (`packages/server/src/routes/`)
- `sources` - CRUD for news sources
- `articles` - Article listing, search, similarity
- `settings` - Settings management (models, UI, digest, schedules, agents, notifications)
- `digests` - Digest history and generation
- `tasks` - Background task status
- `agents` - Agent chat and discovery endpoints
- `notifications` - Notification provider config and testing

### Desktop App (`apps/desktop/`)
- React components in `src/components/`
- tRPC client in `src/lib/trpc.ts`
- Zustand store in `src/store/`
- Electron main process in `electron/main.ts`
- UI components use Radix UI primitives with Tailwind CSS
- Onboarding wizard (`OnboardingWizard.tsx`) runs on first launch: providers → models → task router → first source

## Configuration

### Files (stored at workspace root in dev, `userData` in packaged builds)
- `dispatch.settings.json` - App settings and model configuration
- `dispatch.dev.db` - SQLite database
- `dispatch.vectors` - LanceDB vector store
- `.env` - Environment variables (loaded by server); see `sample.env`

### Environment Variables
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` - API keys for LLM providers
- `OPENAI_BASE_URL` - For OpenAI-compatible endpoints
- `DISPATCH_DB_PATH` - Custom database path
- `DISPATCH_SETTINGS_PATH` - Custom settings path
- `DISPATCH_VECTOR_PATH` - Custom LanceDB vector store path
- `DISPATCH_HOST` / `DISPATCH_PORT` - Server binding
- `DISPATCH_DISABLE_SCHEDULER` - Disable background scheduler
- `DISPATCH_DISABLE_LLM` - Disable LLM calls in tests
- `DISPATCH_LIVE=1` - Enable live LLM tests
- `DISPATCH_E2E=1` - E2E testing mode
- `DISPATCH_ALLOW_EXISTING_SERVER=1` - Allow reusing an already-running server

### Settings Sections (in `dispatch.settings.json`)
Models (catalog + task assignments), UI, grading weights, digest formatting, cron schedules, agent config, notifications (Telegram), and onboarding state. All validated with Zod schemas in `settings.ts`.

### Model Configuration
Models are configured in settings with a catalog and task assignments. Tasks: `summarize`, `classify`, `grade`, `embed`, `digest`, `skill`. Providers: `anthropic`, `openai` (compatible endpoints), `mock`.

## Database Schema

Three main tables in `packages/db/src/schema.ts`:
- `sources` - RSS/web sources with health tracking and skill metadata
- `articles` - Fetched articles with summaries, grades, and processing state
- `digests` - Generated daily summaries

Drizzle config (`packages/db/drizzle.config.ts`) auto-discovers the workspace root. Migrations live in `packages/db/drizzle/`.
