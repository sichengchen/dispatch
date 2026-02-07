# The Dispatch

The Dispatch is a local-first, AI-native desktop news reader.
It runs on your computer, pulls stories from your sources, notify you when there's a breaking news, and generates daily digests.

## Capabilities

- Agents that fetch articles from any website sources.
- LLM generates summary, tags, grading, key points for each article.
- Model/provider management (supports Anthropic and OpenAI-compatible providers). Per-task model routing.
- Scheduled fetch, articles processing, and digest jobs with cron config.
- IM notifications (supports Telegram).

## Installation

Download the latest release for your platform from [Releases](https://github.com/sichengchen/dispatch/releases):

| Platform | Format |
|----------|--------|
| macOS    | `.dmg` |
| Windows  | `.exe` installer |
| Linux    | `.AppImage` |

### Getting Started

1. Open The Dispatch after installing.
2. The onboarding wizard will guide you through setting up an LLM provider (Anthropic, OpenAI, or any OpenAI-compatible endpoint such as Ollama or LM Studio).
3. Select which models to use for each task (summarization, classification, grading, etc.).
4. Add your first news source — an RSS feed URL or any web page.

The Dispatch will begin fetching and processing articles.

## Monorepo layout

- `apps/desktop`: Electron + React + Vite UI
- `packages/server`: Hono + tRPC server and background jobs
- `packages/db`: SQLite + Drizzle schema/migrations
- `packages/lib`: shared LLM/provider logic
- `packages/api`: shared API types

## Development

1. Install dependencies:

```bash
pnpm install
```

2. Create your local database schema:

```bash
pnpm --filter @dispatch/db migrate
```

3. (Optional) Copy env template:

```bash
cp sample.env .env
```

4. Start:

```bash
pnpm dev
```

`pnpm dev` runs the desktop app and local server via Turborepo.