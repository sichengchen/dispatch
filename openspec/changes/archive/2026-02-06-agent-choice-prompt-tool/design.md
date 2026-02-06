## Context

The current chat agent communicates via streaming text. When the agent needs user input for multiple-choice questions (e.g., "Use RSS or agentic extraction?"), users must type their responses. The add-source agent already has decision points where structured choices would improve UX.

The chat system uses:
- Backend: Hono streaming endpoint with Vercel AI SDK `streamText`
- Frontend: `ChatDialog` component with message history and `ChatMessage` for rendering
- Tool execution happens server-side; tool results feed back to the LLM

## Goals / Non-Goals

**Goals:**
- Enable agents to present clickable choice buttons to users
- Support multiple-choice (2-4 options) and yes/no patterns
- Integrate with existing streaming architecture without protocol changes
- Make the pattern reusable across future agents

**Non-Goals:**
- Form inputs beyond simple choices (text fields, file uploads)
- Multi-select options (only single selection)
- Changing the streaming protocol or message format
- Custom styling per agent (use consistent UI)

## Decisions

### Decision 1: Choice format in stream

**Choice**: Use a fenced code block with `choices` language tag in the assistant's text output.

**Format**:
```
Here's a question for you:

\`\`\`choices
{
  "question": "How would you like to add this source?",
  "options": [
    { "label": "Use RSS feed", "value": "rss" },
    { "label": "Use agentic extraction", "value": "agentic" }
  ]
}
\`\`\`
```

**Rationale**:
- No streaming protocol changes needed - choices flow through existing text stream
- Frontend can parse markdown code blocks (already supported by react-markdown)
- Agent can include context text before/after the choices block
- Easy to test and debug (visible in raw response)

**Alternatives considered**:
- Custom stream event type: Would require protocol changes, more complex parsing
- Special markdown syntax (e.g., `[choice:a|b]`): Fragile, conflicts with links
- Separate API call for choices: Breaks conversational flow

### Decision 2: Tool behavior

**Choice**: `present_choices` tool returns instructions for the agent to output the formatted block.

**Tool schema**:
```typescript
{
  question: string,      // The question to display
  options: Array<{
    label: string,       // Button text shown to user
    value: string,       // Value sent back when selected
  }>,
  context?: string,      // Optional context to display before choices
}
```

**Tool response**: Returns a formatted prompt instructing the agent to output the choices block:
```
Present this choice to the user using the exact format below:

[context if provided]

\`\`\`choices
{"question":"...","options":[...]}
\`\`\`

Wait for the user to select an option before proceeding.
```

**Rationale**: The tool doesn't directly output to the stream; it guides the agent to produce correctly formatted output. This keeps the agent in control of conversation flow.

### Decision 3: Frontend rendering

**Choice**: Extend `ChatMessage` component to detect and render `choices` code blocks as buttons.

**Implementation**:
1. Custom code block renderer in react-markdown
2. Parse JSON from `choices` blocks
3. Render as `ChoicePrompt` sub-component with buttons
4. Disable buttons after selection or when a newer message exists

**Rationale**: Keeps rendering logic in one place, leverages existing markdown infrastructure.

### Decision 4: Selection handling

**Choice**: Clicking a choice button calls `onSend(option.value)` - treating it as a user message.

**Flow**:
1. User clicks button with value "rss"
2. `ChatDialog.handleSend("rss")` is called
3. User message "rss" appears in chat
4. Agent receives and continues conversation

**Rationale**:
- Consistent with existing message flow
- Agent sees a clear, unambiguous response
- No special handling needed on backend

### Decision 5: Choice state management

**Choice**: Choices are disabled once:
- The user has selected an option (button was clicked), OR
- A newer user message exists after the choices message

**Rationale**: Prevents selecting outdated choices, but keeps them visible for context.

## Risks / Trade-offs

**Risk**: Agent might not format the choices block correctly
**Mitigation**: Clear instructions in tool response + system prompt guidance; frontend gracefully handles malformed blocks by showing raw text

**Risk**: User refreshes page mid-conversation, choices state lost
**Mitigation**: Choices reconstruct from message history; if a user message follows a choice, mark it as answered

**Trade-off**: Using text format means choices appear in message history as JSON
**Acceptance**: Acceptable for MVP; could add UI to hide raw JSON in future

**Trade-off**: Single selection only (no multi-select)
**Acceptance**: Covers all current use cases; can extend later if needed
