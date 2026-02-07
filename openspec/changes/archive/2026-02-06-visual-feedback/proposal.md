## Why

Many interactions in the desktop app lack visual feedback—mutations complete silently, async operations show no progress, and destructive actions have no confirmation. This makes the app feel unresponsive and leaves users uncertain whether their actions succeeded.

Additionally, the "mark as read" feature adds complexity without significant value. Removing it simplifies the data model and UI.

## What Changes

- Add a toast notification system for success/error feedback on all mutations
- Create a reusable `LoadingButton` component with consistent spinner and disabled states
- Add confirmation dialogs before destructive actions (delete source, stop task)
- Improve loading states on buttons that currently only show text changes
- **Remove "mark as read" functionality entirely**
- **Remove `isRead` column from articles table**

## Capabilities

### New Capabilities
- `toast-notifications`: Global toast system for success/error/info messages across the app
- `loading-button`: Reusable button component with built-in loading spinner and disabled state

### Modified Capabilities
- `articles`: Remove `isRead` field and mark-as-read mutation

## Impact

- `apps/desktop/src/components/` - Multiple components will use new toast and loading patterns
- `apps/desktop/src/App.tsx` - Toast provider wrapper
- New dependencies: `sonner` (or similar toast library)

**Components to update:**
- SourceList.tsx - toast on add/delete/refresh, confirmation on delete
- PipelinePane.tsx - toast on reprocess complete
- HomeDigest.tsx - toast on digest generation
- DashboardPage.tsx - toast on task actions, confirmation on stop
- SettingsPage.tsx - toast on save
- ArticleList.tsx - remove mark-as-read button and logic

**Database/API changes:**
- `packages/db/src/schema.ts` - remove `isRead` column, remove index
- `packages/server/src/routes/articles.ts` - remove `markRead` mutation
- New migration to drop column
