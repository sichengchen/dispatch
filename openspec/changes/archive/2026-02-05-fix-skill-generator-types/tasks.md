## 1. Remove type casts in skill-generator.ts

- [x] 1.1 Remove `sourceAny` variable and `as any` cast (line 846), access `skillVersion` directly from `source`
- [x] 1.2 Remove the stale enum type assertion on `scrapingStrategy` (line 854)
- [x] 1.3 Remove the `as any` cast on the `.set()` payload (line 855)
- [x] 1.4 Remove the eslint-disable comment (line 845)

## 2. Verify

- [x] 2.1 Run `pnpm --filter @dispatch/server build` to confirm TypeScript compiles without errors
