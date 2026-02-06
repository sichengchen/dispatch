## Why

The current RSS feed quality evaluation in the add-source agent is simplistic—it only measures character count to determine if feeds contain full articles or summaries. This misses important signals: HTML content that needs processing, and truncation indicators like "Read Full Story" that reveal the feed only provides snippets regardless of length.

## What Changes

- Enhance `evaluate_feed` tool to detect content format (plain text vs HTML) and flag when HTML processing may be needed
- Add LLM-based content analysis to detect truncation indicators (e.g., "Read Full Story", "Continue reading", "[...]") that signal incomplete articles
- Return richer quality metadata to help the agent make better recommendations about RSS vs agentic extraction

## Capabilities

### New Capabilities

_(None - this enhances existing capability)_

### Modified Capabilities

- `add-source-agent`: The `evaluate_feed` tool requirements change to include format detection and LLM-based truncation analysis. New return fields for `contentFormat` and `truncationIndicators`.

## Impact

- **Code**: `packages/server/src/services/agents/add-source-tools.ts` - `evaluateFeed` function
- **Dependencies**: Will need LLM client access in the tool (already available via `@dispatch/lib`)
- **Agent behavior**: The add-source agent system prompt may need updates to handle new quality signals
- **Specs**: Delta spec needed for `add-source-agent` to document new `evaluate_feed` behavior
