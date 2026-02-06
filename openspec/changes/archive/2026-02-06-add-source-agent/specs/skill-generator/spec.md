## MODIFIED Requirements

### Requirement: Type-safe source updates

The skill generator SHALL update source records using properly typed values that match the database schema, without bypassing TypeScript's type checking. The function SHALL accept an optional `robotsTxt` parameter to provide crawling guidance context.

#### Scenario: Updating source after skill generation

- **WHEN** a skill is successfully generated for a source
- **THEN** the source record is updated with `hasSkill: true`, `skillVersion`, `skillGeneratedAt`, and `scrapingStrategy: "skill"`
- **AND** all values pass TypeScript type checking without `as any` casts
- **AND** the `scrapingStrategy` value is constrained to the schema enum `["rss", "skill"]`

#### Scenario: Generating skill with robots.txt context

- **WHEN** `generateSkill` is called with a `robotsTxt` option containing robots.txt content
- **THEN** the robots.txt content is included in the skill-generator agent's system prompt
- **AND** the agent uses robots.txt rules to avoid forbidden paths during discovery

#### Scenario: Generating skill without robots.txt context

- **WHEN** `generateSkill` is called without a `robotsTxt` option
- **THEN** the skill-generator agent operates without robots.txt guidance
- **AND** the function remains backward-compatible with existing callers

## ADDED Requirements

### Requirement: Robots.txt-aware crawling guidance

The skill-generator agent SHALL incorporate robots.txt rules when provided to avoid crawling forbidden paths.

#### Scenario: Respecting disallow rules

- **WHEN** robots.txt specifies `Disallow: /private/`
- **AND** the agent is discovering article selectors
- **THEN** the agent avoids testing selectors that would match URLs under `/private/`

#### Scenario: No robots.txt provided

- **WHEN** no robots.txt content is provided
- **THEN** the agent proceeds with standard discovery without path restrictions
