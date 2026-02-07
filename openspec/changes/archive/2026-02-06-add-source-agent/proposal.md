## Why

Adding new website sources currently requires users to understand whether a site has RSS, whether the feed is useful, or manually configure extraction skills. This friction reduces adoption. A conversational agent can guide users through this process intelligently, checking RSS availability, evaluating feed quality, and falling back to agentic extraction when needed.

Additionally, Dispatch will benefit from conversational AI assistants in multiple contexts (source onboarding, article reading assistance, etc.), so we need a reusable chatbot architecture rather than a one-off implementation.

## What Changes

- **New chatbot UI framework**: Reusable chat interface component that can host different agent personalities/capabilities
- **Add-source agent**: First agent implementation that guides users through adding a new website source
  - Prompts user for website URL
  - Fetches and analyzes the website (checks for RSS feed, robots.txt)
  - Evaluates RSS feed quality (full articles vs. summaries only)
  - Offers user choice: use RSS feed or agentic extraction
  - If RSS chosen: adds source with RSS strategy and ends
  - If agentic extraction chosen (or no RSS available): invokes skill-generator to create extraction skill
  - Passes robots.txt content to skill-generator for crawling guidance
- **Model router integration**: Uses "Agent" (skill) model task type for the conversational agent

## Capabilities

### New Capabilities
- `chatbot-framework`: Reusable chat UI and agent orchestration infrastructure supporting multiple agent types
- `add-source-agent`: Conversational agent that guides users through website source onboarding with RSS detection and skill generation

### Modified Capabilities
- `skill-generator`: Extend to accept robots.txt content as additional context for generating extraction skills

## Impact

- **UI**: New chat interface component in `apps/desktop/src/components/`
- **Server**: New tRPC routes for agent conversations, integration with existing skill-generator service
- **Model Config**: New "skill" task type usage for agent model routing
- **Existing Services**: `skill-generator.ts` needs to accept robots.txt context parameter
