## 1. Setup shadcn/ui and dependencies

- [x] 1.1 Install sonner: `pnpm --filter @dispatch/desktop add sonner`
- [x] 1.2 Add `<Toaster />` component to App.tsx

## 2. Create Button with loading variant

- [x] 2.1 Create `components/ui/button.tsx` with shadcn/ui button + loading prop
- [x] 2.2 Add spinner icon (lucide-react Loader2)

## 3. Add confirmation dialogs

- [x] 3.1 Create `components/ui/alert-dialog.tsx` from shadcn/ui
- [x] 3.2 Add confirmation dialog to delete source in SourceList.tsx
- [x] 3.3 Add confirmation dialog to stop task in DashboardPage.tsx

## 4. Add toast notifications to mutations

- [x] 4.1 SourceList.tsx - toast on add/delete/refresh success/error
- [x] 4.2 PipelinePane.tsx - toast on reprocess complete
- [x] 4.3 HomeDigest.tsx - toast on digest generation
- [x] 4.4 DashboardPage.tsx - toast on task actions
- [x] 4.5 SettingsPage.tsx - toast on save

## 5. Remove isRead functionality

- [x] 5.1 Remove `isRead` column and index from schema.ts
- [x] 5.2 Generate migration: `pnpm --filter @dispatch/db generate`
- [x] 5.3 Remove `markRead` mutation from articles.ts route
- [x] 5.4 Remove mark-as-read UI from ArticleList.tsx

## 6. Verify

- [x] 6.1 Run `pnpm build` to confirm no type errors
- [x] 6.2 Run `pnpm --filter @dispatch/db migrate` to apply migration
