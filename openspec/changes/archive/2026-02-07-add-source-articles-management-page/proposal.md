## Why

The Sources page currently only lists sources with health indicators and management actions, but provides no way to view or manage the articles belonging to each source. All the infrastructure exists — the `ArticleList` component supports source filtering, the `articles.list` API accepts a `sourceId` parameter, and the database has proper indexes — but they're not connected in the Sources view. Users must go to the Home page to see articles, where they're sorted by grade across all sources with no per-source context.

## What Changes

- Add a dual-pane layout to the Sources page: source list on the left, article list for the selected source on the right
- Display article count and last-fetched metadata per source in the source list
- Enable clicking into the article viewer from the source articles list (with proper back-navigation to the sources view)
- Add article management actions: reprocess individual articles through the LLM pipeline, delete articles, and bulk selection with bulk delete/reprocess
- Show an empty state when no source is selected and when a selected source has no articles

## Capabilities

### New Capabilities
- `source-articles-panel`: Dual-pane layout integrating source list with a per-source article list, article viewer navigation, and article management actions (reprocess, delete, bulk operations)

### Modified Capabilities

## Impact

- `apps/desktop/src/components/SourcesPage.tsx` — Major rework to add dual-pane layout
- `apps/desktop/src/components/SourceList.tsx` — Add article count display per source, adjust layout for side-by-side view
- `apps/desktop/src/components/ArticleList.tsx` — May need minor adjustments for source-scoped management actions
- `packages/server/src/routes/articles.ts` — May need a delete/bulk-delete mutation (currently missing)
- `apps/desktop/src/App.tsx` — Update view state machine to support article navigation from sources
- `apps/desktop/src/store/ui.ts` — Ensure source selection state works correctly with the new flow
