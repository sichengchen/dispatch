## ADDED Requirements

### Requirement: Add-source agent definition

The system SHALL provide an agent definition for "add-source" that guides users through adding a new website source.

#### Scenario: Agent greeting

- **WHEN** the add-source chat session starts
- **THEN** the agent greets the user and asks for the website URL they want to add

### Requirement: URL analysis tool

The agent SHALL have access to a `check_rss` tool that analyzes a URL for RSS feed availability.

#### Scenario: RSS feed detected via link tag

- **WHEN** the agent calls `check_rss` with a URL
- **AND** the page contains an RSS/Atom link tag in the HTML head
- **THEN** the tool returns the feed URL and type (RSS/Atom)

#### Scenario: RSS feed detected via common paths

- **WHEN** the agent calls `check_rss` with a URL
- **AND** no link tag is found but a feed exists at `/feed`, `/rss`, or `/atom.xml`
- **THEN** the tool returns the discovered feed URL

#### Scenario: No RSS feed found

- **WHEN** the agent calls `check_rss` with a URL
- **AND** no RSS feed is detected
- **THEN** the tool returns a result indicating no feed was found

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

### Requirement: Robots.txt fetch tool

The agent SHALL have access to a `fetch_robots` tool that retrieves robots.txt content.

#### Scenario: Robots.txt exists

- **WHEN** the agent calls `fetch_robots` with a domain URL
- **AND** robots.txt exists at the domain root
- **THEN** the tool returns the robots.txt content

#### Scenario: No robots.txt

- **WHEN** the agent calls `fetch_robots` with a domain URL
- **AND** robots.txt does not exist (404)
- **THEN** the tool returns a result indicating no robots.txt was found

### Requirement: RSS source addition tool

The agent SHALL have access to an `add_rss_source` tool that creates a source with RSS strategy.

#### Scenario: Adding RSS source

- **WHEN** the agent calls `add_rss_source` with name and feed URL
- **THEN** a new source is created in the database with type "rss"
- **AND** the tool returns the created source ID and confirmation

#### Scenario: Duplicate source URL

- **WHEN** the agent calls `add_rss_source` with a URL that already exists
- **THEN** the tool returns an error indicating a source with that URL already exists

### Requirement: Skill generation tool

The agent SHALL have access to a `generate_skill` tool that invokes the skill-generator for agentic extraction.

#### Scenario: Generating skill with robots.txt

- **WHEN** the agent calls `generate_skill` with URL, name, and robots.txt content
- **THEN** the skill-generator is invoked with robots.txt passed as context
- **AND** the tool returns skill generation status (success/failure)

#### Scenario: Generating skill without robots.txt

- **WHEN** the agent calls `generate_skill` with URL and name but no robots.txt
- **THEN** the skill-generator is invoked without robots.txt context
- **AND** the tool returns skill generation status

### Requirement: User choice for feed quality

The agent SHALL ask the user to choose between RSS and agentic extraction when feed quality is "summary".

#### Scenario: User chooses RSS despite summary quality

- **WHEN** the agent detects a summary-only RSS feed
- **AND** asks the user for their preference
- **AND** the user chooses "Use RSS feed"
- **THEN** the agent calls `add_rss_source` to add the source

#### Scenario: User chooses agentic extraction

- **WHEN** the agent detects a summary-only RSS feed
- **AND** asks the user for their preference
- **AND** the user chooses "Use agentic extraction"
- **THEN** the agent proceeds to call `generate_skill`

### Requirement: Conversation completion

The agent SHALL confirm successful source addition and end the conversation gracefully.

#### Scenario: Successful RSS addition

- **WHEN** `add_rss_source` succeeds
- **THEN** the agent confirms the source was added with its name
- **AND** suggests the user can close the dialog

#### Scenario: Successful skill generation

- **WHEN** `generate_skill` succeeds
- **THEN** the agent confirms the source was added with agentic extraction
- **AND** explains that articles will be extracted automatically

#### Scenario: Skill generation failure

- **WHEN** `generate_skill` fails
- **THEN** the agent explains the failure reason
- **AND** suggests the user try a different URL or contact support
