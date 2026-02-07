## MODIFIED Requirements

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
