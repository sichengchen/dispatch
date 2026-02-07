## Context

The Sources page (`SourcesPage.tsx`) renders a single card containing `SourceList`, which displays sources with health indicators, bulk selection, and per-source actions (refresh, retry, regenerate skill, delete). Clicking a source sets `selectedSourceId` in the Zustand store but has no visible effect on the page — there is no article panel.

Meanwhile, `ArticleList` already reads `selectedSourceId` from the store and filters articles accordingly, and the `articles.list` tRPC endpoint accepts an optional `sourceId` parameter. The server also has `articles.reprocess` but no delete mutations for articles.

The `App.tsx` view state machine supports an `openArticle` helper that navigates to the article viewer with a `returnTo` parameter, and `handleArticleBack` already has branching for different return views. However, the "sources" return case currently falls through to "home".

## Goals / Non-Goals

**Goals:**
- Show a dual-pane layout on the Sources page: source list (left) + articles for the selected source (right)
- Display article count per source in the source list
- Enable navigation from the article list into the full article viewer, with correct back-navigation to sources
- Add article management: delete (single + bulk) and reprocess (single + bulk) from the articles panel
- Provide clear empty states for no-source-selected and no-articles

**Non-Goals:**
- Pagination or infinite scroll for the article list (existing 100-article limit is sufficient for per-source views)
- Article creation or manual editing
- Changing the Home page article list behavior
- Full-text search within source articles

## Decisions

### 1. Layout: Side-by-side flex within SourcesPage

**Decision:** Replace the single-card layout with a two-column flex layout. Left column (~320px, fixed) for the source list card. Right column (flex-grow) for the articles panel card.

**Rationale:** This matches common master-detail patterns. The source list is narrow enough to work at a fixed width, and articles need the remaining space for titles/summaries. The existing `max-w-6xl` container in `App.tsx` provides ~1152px, giving ~830px for the article panel — plenty of room.

**Alternative considered:** Tabbed layout (click source → navigate to a separate articles page). Rejected because the side-by-side view lets users quickly switch between sources without losing context.

### 2. Article count: Server-side subquery on sources.list

**Decision:** Add an `articleCount` field to the `sources.list` response using a SQL count subquery joined to the sources query.

**Rationale:** Computing counts client-side would require fetching all articles or making N separate queries. A single subquery is efficient and the `articles_source_id_idx` index already exists. This keeps the client simple — just display the number.

**Alternative considered:** Separate `sources.articleCounts` endpoint. Rejected as unnecessarily complex for a single number per source.

### 3. Reuse existing ArticleList with a wrapper

**Decision:** Create a new `SourceArticlesPanel` component that wraps `ArticleList`-like functionality but adds article management actions (delete, reprocess, bulk operations). Rather than modifying the existing `ArticleList` (used conceptually elsewhere), the new panel is purpose-built for the sources context.

**Rationale:** The existing `ArticleList` is a display-only component. Adding management actions (checkboxes, action bar, dropdown menus) would significantly change its interface and risk breaking its behavior in other contexts. A dedicated component can follow the same patterns as `SourceList` (which already has bulk selection and action dropdowns) for consistency.

### 4. Article delete/bulk-delete: New server mutations

**Decision:** Add `articles.delete` and `articles.deleteMany` mutations to the articles router, following the same pattern as `sources.delete`/`sources.deleteMany`.

**Rationale:** Article deletion is needed for management. The existing cascade-delete (source deletion removes articles) proves the pattern works. Individual article deletion is a straightforward `DELETE WHERE id = ?`. Bulk delete uses `inArray` like sources.

### 5. Bulk reprocess: New server mutation

**Decision:** Add `articles.reprocessMany` mutation that calls `processArticle` for each article ID sequentially.

**Rationale:** Reprocessing calls the LLM pipeline which has rate limits and costs. Sequential processing per article is the safe approach. The existing `articles.reprocess` handles one article — the bulk variant loops over IDs.

### 6. Navigation: Explicit "sources" return handling in App.tsx

**Decision:** Add a `"sources"` case to `handleArticleBack` in `App.tsx` and pass `openArticle` with `returnTo: { view: "sources" }` from `SourcesPage`.

**Rationale:** The infrastructure already exists — `openArticle` accepts a `returnTo` parameter and `handleArticleBack` switches on it. Adding the "sources" case is a one-line addition. `SourcesPage` will receive `onSelectArticle` as a prop, same pattern as `HomeDigest`.

### 7. SourcesPage receives onSelectArticle prop

**Decision:** Pass `onSelectArticle` from `App.tsx` to `SourcesPage`, following the same pattern as `HomeDigest` which receives `onSelectArticle={openArticle}`.

**Rationale:** This keeps navigation logic centralized in `App.tsx` rather than having `SourcesPage` directly manipulate view state. Consistent with the existing architecture.

## Risks / Trade-offs

- **Article count query performance** → The subquery runs on every `sources.list` call. Mitigated by the existing `articles_source_id_idx` index which makes count-by-source fast. If it becomes a concern, counts could be cached or fetched separately.

- **Bulk reprocess cost** → Users could accidentally reprocess many articles, consuming API credits. Mitigated by a confirmation dialog (same pattern as bulk delete) showing the count and a warning about API usage.

- **Layout responsiveness at narrow widths** → The 320px + article panel may feel cramped below ~900px. Mitigated by the app's `max-w-6xl` container already enforcing a reasonable minimum. The Electron window has a default minimum size that accommodates this.

- **ArticleList duplication** → Creating `SourceArticlesPanel` instead of reusing `ArticleList` means some display code is duplicated. Trade-off is worthwhile: the management features require substantially different component structure (checkboxes, action bars) and keeping them separate avoids coupling.
