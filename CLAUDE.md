# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dispatch is a local-first, AI-native news reader. It runs a local server alongside a desktop UI to collect sources, extract articles, and build daily digests.

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
```

### Testing
```bash
pnpm test                                           # Run all tests
pnpm --filter @dispatch/server test                 # Server tests (backend + LLM pipeline)
pnpm --filter @dispatch/server test:backend         # Backend/tRPC tests only
pnpm --filter @dispatch/server test:scraper         # Scraper tests (LLM disabled)
pnpm --filter @dispatch/server test:llm:live        # Live LLM tests (requires API keys)
pnpm --filter @dispatch/desktop test:e2e            # E2E Playwright tests
```

### Lint
```bash
pnpm lint
```

## Architecture

### Package Structure
- `apps/desktop` - Electron + React + Vite desktop application
- `packages/server` - Hono + tRPC API server with background jobs
- `packages/db` - SQLite + Drizzle ORM schema and migrations
- `packages/lib` - Shared AI client (Anthropic, OpenAI via Vercel AI SDK)
- `packages/api` - Re-exports tRPC types for client consumption

### Data Flow
1. **Sources** → RSS feeds or web pages registered by user
2. **Scraper** → Fetches and extracts article content (RSS parser or Playwright for SPAs)
3. **Skill Generator** → Creates extraction skills for web sources using LLM agents
4. **LLM Pipeline** → Summarizes, classifies, and grades articles
5. **Digests** → Scheduled daily summaries of top articles
6. **Vector Store** → LanceDB for article embeddings and similarity search

### Key Server Services (`packages/server/src/services/`)
- `scheduler.ts` - Cron-based job scheduler for scraping and digest generation
- `scraper.ts` - Article fetching with RSS and Playwright strategies
- `skill-generator.ts` - LLM agent that generates extraction rules for web sources
- `extraction-agent.ts` - Uses generated skills to extract articles
- `llm.ts` - AI pipeline for summarization, classification, grading, and embeddings
- `digest.ts` - Generates daily digest summaries
- `vector.ts` - LanceDB vector store operations
- `settings.ts` - Loads/saves settings from `dispatch.settings.json`

### tRPC Routes (`packages/server/src/routes/`)
- `sources` - CRUD for news sources
- `articles` - Article listing, search, similarity
- `settings` - Settings management
- `digests` - Digest history
- `tasks` - Background task status

### Desktop App (`apps/desktop/`)
- React components in `src/components/`
- tRPC client in `src/lib/trpc.ts`
- Zustand store in `src/store/`
- Electron main process in `electron/main.ts`
- UI components use Radix UI primitives with Tailwind CSS

## Configuration

### Files (stored at workspace root)
- `dispatch.settings.json` - App settings and model configuration
- `dispatch.dev.db` - SQLite database
- `dispatch.vectors` - LanceDB vector store
- `.env` - Environment variables (loaded by server)

### Environment Variables
- `ANTHROPIC_API_KEY` - For Anthropic models
- `DISPATCH_DB_PATH` - Custom database path
- `DISPATCH_SETTINGS_PATH` - Custom settings path
- `DISPATCH_DISABLE_SCHEDULER` - Disable background scheduler
- `DISPATCH_DISABLE_LLM` - Disable LLM calls in tests

### Model Configuration
Models are configured in settings with a catalog and task assignments. Tasks: `summarize`, `classify`, `grade`, `embed`, `digest`, `skill`. Providers: `anthropic`, `openai` (compatible endpoints), `mock`.

## Database Schema

Three main tables in `packages/db/src/schema.ts`:
- `sources` - RSS/web sources with health tracking and skill metadata
- `articles` - Fetched articles with summaries, grades, and processing state
- `digests` - Generated daily summaries
