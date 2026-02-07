## Context

The `generateSkillForSource` function in `skill-generator.ts` updates the database after generating a skill. It currently uses three `as any` casts to bypass type checking—a workaround that's no longer necessary since the schema properly types all fields.

## Goals / Non-Goals

**Goals:**
- Remove all `as any` casts in the source update logic
- Ensure the code compiles with strict TypeScript checking

**Non-Goals:**
- Refactoring unrelated parts of skill-generator.ts
- Adding new functionality

## Decisions

### Decision 1: Direct property access instead of `any` cast

The `source` object returned by Drizzle's `.get()` is already typed with `skillVersion`. We'll access it directly via optional chaining (`source?.skillVersion`) instead of casting to `any`.

### Decision 2: Remove stale enum type annotation

The `scrapingStrategy` field no longer needs a type assertion. The literal `"skill"` matches the schema enum `["rss", "skill"]` and TypeScript will infer it correctly.
