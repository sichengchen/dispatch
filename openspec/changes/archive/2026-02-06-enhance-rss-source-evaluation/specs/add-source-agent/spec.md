## MODIFIED Requirements

### Requirement: Feed quality evaluation tool

The agent SHALL have access to an `evaluate_feed` tool that assesses RSS feed quality using LLM-based content analysis and format detection.

#### Scenario: Feed with full article content

- **WHEN** the agent calls `evaluate_feed` with a feed URL
- **AND** LLM analysis determines the articles appear complete (no truncation indicators, coherent endings)
- **THEN** the tool returns `quality: "full"` with `contentFormat` and empty `truncationIndicators`

#### Scenario: Feed with truncated content

- **WHEN** the agent calls `evaluate_feed` with a feed URL
- **AND** LLM analysis detects truncation indicators (e.g., "Read Full Story", "Continue reading", "[...]", abrupt endings, "Click here for more")
- **THEN** the tool returns `quality: "summary"` with `truncationIndicators` array listing detected issues
- **AND** recommends considering agentic extraction

#### Scenario: Feed with HTML content

- **WHEN** the agent calls `evaluate_feed` with a feed URL
- **AND** the feed items contain HTML tags (`<p>`, `<div>`, `<a>`, `<br>`)
- **THEN** the tool returns `contentFormat: "html"` indicating HTML processing may be needed

#### Scenario: Feed with plain text content

- **WHEN** the agent calls `evaluate_feed` with a feed URL
- **AND** the feed items contain no HTML tags
- **THEN** the tool returns `contentFormat: "text"`

#### Scenario: Feed parse error

- **WHEN** the agent calls `evaluate_feed` with an invalid or inaccessible feed URL
- **THEN** the tool returns an error with the failure reason

#### Scenario: LLM analysis disabled

- **WHEN** the agent calls `evaluate_feed` with `useLlm: false`
- **THEN** the tool skips LLM-based quality analysis
- **AND** returns `quality: "unknown"` with only format detection results
