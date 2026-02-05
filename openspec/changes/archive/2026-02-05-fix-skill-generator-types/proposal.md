## Why

The `skill-generator.ts` service uses `as any` type casts to work around type mismatches that no longer exist. The schema was simplified (removing "html" and "spa" scraping strategies), but the code still references these stale types and uses unnecessary casts that bypass TypeScript's safety checks.

## What Changes

- Remove unnecessary `as any` casts when accessing source properties
- Update the `scrapingStrategy` type literal to match the current schema enum
- Let TypeScript properly validate the database update payload

## Capabilities

### Modified Capabilities
- `skill-generator`: Database update in `generateSkillForSource` will be properly type-checked

## Impact

- `packages/server/src/services/skill-generator.ts`: Remove 3 type casts (~lines 846, 854, 855)
