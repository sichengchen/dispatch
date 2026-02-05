## ADDED Requirements

### Requirement: Type-safe source updates

The skill generator SHALL update source records using properly typed values that match the database schema, without bypassing TypeScript's type checking.

#### Scenario: Updating source after skill generation

- **WHEN** a skill is successfully generated for a source
- **THEN** the source record is updated with `hasSkill: true`, `skillVersion`, `skillGeneratedAt`, and `scrapingStrategy: "skill"`
- **AND** all values pass TypeScript type checking without `as any` casts
- **AND** the `scrapingStrategy` value is constrained to the schema enum `["rss", "skill"]`
