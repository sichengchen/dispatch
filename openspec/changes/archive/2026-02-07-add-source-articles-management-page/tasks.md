## 1. Server-side: Article count and new mutations

- [x] 1.1 Add `articleCount` subquery to `sources.list` in `packages/server/src/routes/sources.ts` — use a correlated count subquery on the `articles` table grouped by `sourceId`
- [x] 1.2 Add `articles.delete` mutation to `packages/server/src/routes/articles.ts` — accepts `{ id: number }`, deletes the article row, returns `{ ok: true }`
- [x] 1.3 Add `articles.deleteMany` mutation to `packages/server/src/routes/articles.ts` — accepts `{ ids: number[] }`, deletes all matching articles using `inArray`, returns `{ deleted: number }`
- [x] 1.4 Add `articles.reprocessMany` mutation to `packages/server/src/routes/articles.ts` — accepts `{ ids: number[] }`, calls `processArticle` sequentially for each ID, returns `{ processed: number }`

## 2. Navigation: Sources → Article Viewer → Back

- [x] 2.1 Add `"sources"` case to `handleArticleBack` in `apps/desktop/src/App.tsx` — when `articleReturn?.view === "sources"`, set `activeView` to `"sources"`
- [x] 2.2 Update `SourcesPage` to accept an `onSelectArticle` prop (same signature as `HomeDigest`) and pass it from `App.tsx` with `returnTo: { view: "sources" }`

## 3. Sources page dual-pane layout

- [x] 3.1 Refactor `SourcesPage.tsx` from single-card to two-column flex layout — left column (w-80, shrink-0) for the source list card, right column (flex-1) for the articles panel card
- [x] 3.2 Update `SourceList` to display `articleCount` next to each source entry (e.g., "12 articles" in muted text below the URL)

## 4. Source articles panel component

- [x] 4.1 Create `SourceArticlesPanel.tsx` component — fetches articles via `trpc.articles.list` filtered by `selectedSourceId`, renders virtualized list with article title, date, grade badge, tags, and summary. Use shadcn Card, Checkbox, Button, DropdownMenu, and AlertDialog components
- [x] 4.2 Add empty state for no source selected — display a centered message prompting the user to select a source from the list
- [x] 4.3 Add empty state for source with no articles — display a message indicating the selected source has no articles yet
- [x] 4.4 Wire article click to call `onSelectArticle` prop, navigating to the article viewer

## 5. Article management actions

- [x] 5.1 Add per-article action dropdown (shadcn DropdownMenu) with "Reprocess" and "Delete" options — Reprocess calls `articles.reprocess` with toast feedback, Delete shows a shadcn AlertDialog confirmation then calls `articles.delete`
- [x] 5.2 Add checkbox selection to each article row with select-all checkbox and bulk action bar (following `SourceList` pattern) — bar shows selection count with clear button
- [x] 5.3 Add bulk delete button in action bar — shows shadcn AlertDialog confirmation with article count, calls `articles.deleteMany`, clears selection on success
- [x] 5.4 Add bulk reprocess button in action bar — shows shadcn AlertDialog confirmation with article count and API usage warning, calls `articles.reprocessMany`, clears selection on success

## 6. Integration and verification

- [x] 6.1 Verify source list retains all existing functionality (health indicators, bulk source selection, per-source actions, Add Source button) after layout refactor
- [x] 6.2 Verify article count updates after source refresh and article deletion
- [x] 6.3 Verify article viewer back-navigation returns to Sources page with previously selected source preserved
- [x] 6.4 Run `pnpm --filter @dispatch/server test:backend` and `pnpm --filter @dispatch/desktop test` to confirm no regressions
