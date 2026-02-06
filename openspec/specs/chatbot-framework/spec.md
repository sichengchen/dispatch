## ADDED Requirements

### Requirement: Chat UI component

The system SHALL provide a reusable `ChatDialog` component that renders a conversational interface with message history, input field, streaming response support, and interactive choice prompts.

#### Scenario: Rendering chat messages

- **WHEN** the chat dialog is open with messages in state
- **THEN** each message is displayed with appropriate styling (user vs assistant)
- **AND** assistant messages support markdown rendering
- **AND** assistant messages support choice prompt code blocks
- **AND** messages are scrolled to show the most recent

#### Scenario: Sending a user message

- **WHEN** user types in the input field and presses Enter or clicks Send
- **THEN** the message is added to the message history
- **AND** the input field is cleared
- **AND** the message is sent to the backend agent endpoint

#### Scenario: Streaming assistant response

- **WHEN** the backend returns a streaming response
- **THEN** the assistant message is rendered incrementally as tokens arrive
- **AND** a loading indicator is shown while streaming
- **AND** the final message replaces the streaming content when complete

#### Scenario: Rendering choice prompts in messages

- **WHEN** an assistant message contains a choices code block
- **THEN** the ChatMessage component SHALL render clickable buttons
- **AND** clicking a button SHALL trigger the onSend callback with the option value
- **AND** the input field SHALL remain available for manual responses

### Requirement: Agent definition registry

The system SHALL maintain a registry of agent definitions that can be loaded by ID.

#### Scenario: Loading an agent by ID

- **WHEN** a chat session is started with an agent ID
- **THEN** the system loads the agent's system prompt and tool set
- **AND** the agent's initial greeting message is displayed if configured

#### Scenario: Unknown agent ID

- **WHEN** a chat session is started with an invalid agent ID
- **THEN** the system returns an error indicating the agent was not found

### Requirement: Agent chat backend route

The system SHALL provide a tRPC route `agents.chat` that accepts messages and returns streaming responses.

#### Scenario: Processing a chat request

- **WHEN** a chat request is received with agent ID and message history
- **THEN** the system loads the agent definition
- **AND** invokes the LLM with the agent's system prompt and tools
- **AND** returns a streaming response

#### Scenario: Tool execution during chat

- **WHEN** the LLM requests a tool call during chat
- **THEN** the tool is executed server-side
- **AND** the result is returned to the LLM for continued processing
- **AND** tool execution status is streamed to the client

### Requirement: Chat session state management

The system SHALL manage chat session state on the client using the Vercel AI SDK `useChat` hook.

#### Scenario: Initializing a chat session

- **WHEN** the chat dialog opens
- **THEN** a new session is created with empty message history
- **AND** the agent's initial message is displayed if configured

#### Scenario: Aborting a chat request

- **WHEN** user closes the dialog or clicks a cancel button while streaming
- **THEN** the ongoing request is aborted
- **AND** partial response is preserved in the message history

### Requirement: Maximum turn limit

The system SHALL enforce a maximum number of agent turns (20) to prevent runaway conversations.

#### Scenario: Reaching turn limit

- **WHEN** the conversation reaches 20 agent turns
- **THEN** the agent is forced to provide a final response
- **AND** the user is informed that the turn limit was reached
