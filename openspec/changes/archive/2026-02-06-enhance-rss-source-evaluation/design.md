## Context

The current `evaluateFeed` function in [add-source-tools.ts:140-195](packages/server/src/services/agents/add-source-tools.ts#L140-L195) determines feed quality using a simple heuristic: average content length > 500 chars = "full", otherwise "summary". This misses two important signals:

1. **Format**: Content may be HTML (common in RSS) which inflates character count but needs processing
2. **Truncation**: Long content may still be truncated (ends with "Read Full Story", "[...]", etc.)

The add-source agent needs these signals to make better recommendations about RSS vs agentic extraction.

## Goals / Non-Goals

**Goals:**
- Detect whether RSS content is plain text or HTML
- Use LLM to analyze sample content for truncation indicators
- Return richer metadata so the agent can make informed recommendations
- Keep evaluation fast (< 5 seconds for typical feeds)

**Non-Goals:**
- Full HTML-to-text conversion (that's the scraper's job)
- Validating every item in the feed (sample-based is sufficient)
- Caching evaluation results (evaluate on-demand only)

## Decisions

### Decision 1: HTML Detection via Tag Presence

**Approach**: Check for common HTML tags (`<p>`, `<div>`, `<a>`, `<br>`) in content samples.

**Alternatives considered**:
- Content-type header inspection: Not reliable, RSS often uses generic XML types
- Full HTML parsing: Overkill for detection; just need presence check

**Return value**: `contentFormat: "html" | "text" | "mixed"`

### Decision 2: LLM-Based Quality Determination (Replace Character Length Heuristic)

**Approach**: Remove the character length heuristic entirely. Use LLM to determine quality by analyzing sample articles for:
1. Does this appear to be a complete article or a truncated excerpt?
2. Are there truncation indicators ("Read more", "Continue reading", "[...]", abrupt endings)?
3. Does the content have a coherent conclusion?

**Why remove character length**: Character count is unreliable—HTML markup inflates counts, and long excerpts can still be truncated. LLM can understand semantic completeness.

**Model selection**: Use the existing `summarize` task model (already configured, capable of this analysis). Adding a new task type `evaluate` would add configuration complexity for marginal benefit.

**Alternatives considered**:
- Keep character length as fallback: Still unreliable, creates false confidence
- Regex pattern matching: Brittle, misses paraphrased indicators ("Click here for the full story")
- Always use agentic extraction for HTML: Too aggressive, many HTML feeds are complete

**Return values**:
- `quality: "full" | "summary" | "unknown"` - LLM-determined (or "unknown" if LLM disabled)
- `truncationIndicators: string[]` - Specific issues found (empty if none)

### Decision 3: Integrate LLM Call in evaluateFeed Tool

**Approach**: Add optional LLM analysis as the final step in `evaluateFeed`, gated by a parameter `useLlm: boolean` (default: true).

**Why in the tool**: Keeps all evaluation logic centralized. The agent already handles async tool calls.

**Alternatives considered**:
- Separate `analyze_content` tool: Adds another tool call round-trip, complicates agent flow
- Always require LLM: Some users may want fast evaluation without LLM cost

### Decision 4: Sample Size for Analysis

**Approach**: Analyze first 3 items with content > 100 characters. Truncate each to 2000 chars for LLM input.

**Rationale**: Balances accuracy with token cost. 3 items provide enough signal without excessive cost.

## Risks / Trade-offs

**[Risk] LLM latency adds 1-3s to evaluation** → Acceptable for one-time source evaluation. Gate with `useLlm` parameter for users who want speed over accuracy.

**[Risk] LLM may hallucinate truncation indicators** → Use structured output with Zod schema. Prompt emphasizes only reporting what's actually present.

**[Risk] Token cost for evaluation** → Minimal (~500 input tokens per evaluation). Only runs during source addition, not ongoing scraping.

**[Trade-off] Using `summarize` model for evaluation** → Simpler configuration at cost of less control. If evaluation needs differ significantly from summarization, can add dedicated `evaluate` task later.
