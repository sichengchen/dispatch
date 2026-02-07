## Why

Currently, when the chat agent needs user input for multiple-choice or yes/no questions (e.g., "Use RSS or agentic extraction?"), users must type their response. This is slow and error-prone. A clickable button UI for structured choices would provide faster, clearer interactions and enable reuse across future chat agents.

## What Changes

- Add a new `present_choices` tool that agents can call to display structured options to users
- Extend the chat UI to render choice buttons when the agent presents options
- Wire up choice selection to send the selected option back to the agent as a user message
- Update the add-source agent to use this tool for decision points (RSS vs agentic, proceed vs cancel)

## Capabilities

### New Capabilities

- `agent-choice-prompt`: Tool and UI for presenting structured choices (multiple-choice, yes/no) to users during agent conversations. Covers the tool schema, frontend rendering, and selection handling.

### Modified Capabilities

- `chatbot-framework`: Extend to support rendering choice prompt UI elements and handling user selection events (requirement-level change to message rendering).

## Impact

- **Backend**: New tool in `packages/server/src/services/agents/` - `present_choices` tool definition
- **Frontend**: Extend `ChatMessage` or add new component to render choice buttons; modify `ChatDialog` to handle choice selection
- **Agent definitions**: Update `add-source-agent` system prompt and tool set to use `present_choices`
- **API**: Streaming response format may need to include choice prompt data (or use tool call metadata)
