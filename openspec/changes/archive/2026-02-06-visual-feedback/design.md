## Context

The desktop app uses React with tRPC for mutations. Currently, mutation feedback is inconsistent—some buttons show text changes, others show nothing. There's no global notification system.

## Goals / Non-Goals

**Goals:**
- Consistent visual feedback for all async operations
- Minimal changes to existing component APIs
- Remove unused isRead functionality

**Non-Goals:**
- Redesigning the overall UI
- Adding undo functionality for mutations

## Decisions

### Decision 1: Use shadcn/ui components

Adopt shadcn/ui for toast notifications, buttons, and dialogs. shadcn/ui provides pre-styled components built on Radix UI with Tailwind CSS—matching the project's existing styling approach.

Components to add:
- `sonner` (shadcn/ui's toast solution)
- `button` (with loading variant)
- `alert-dialog` (for confirmations)

### Decision 2: LoadingButton as button variant

Extend shadcn/ui's Button component with a `loading` prop rather than creating a separate component. This keeps the API consistent.

### Decision 3: Migration for isRead removal

Generate a Drizzle migration to drop the `isRead` column and its index. SQLite handles column drops via table recreation.

### Decision 4: Toast integration pattern

Add `<Toaster />` to App.tsx. Use `toast.success()` and `toast.error()` in mutation `onSuccess`/`onError` callbacks.
