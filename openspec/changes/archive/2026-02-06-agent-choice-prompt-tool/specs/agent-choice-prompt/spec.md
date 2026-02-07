## ADDED Requirements

### Requirement: Present choices tool

The system SHALL provide a `present_choices` tool that agents can call to display structured options to users.

#### Scenario: Tool schema validation

- **WHEN** an agent calls `present_choices`
- **THEN** the tool SHALL accept a `question` string parameter
- **AND** the tool SHALL accept an `options` array with 2-4 items
- **AND** each option SHALL have a `label` (display text) and `value` (selection identifier)
- **AND** the tool MAY accept an optional `context` string for additional information

#### Scenario: Tool response format

- **WHEN** `present_choices` is called with valid parameters
- **THEN** the tool SHALL return instructions for the agent to output a fenced code block
- **AND** the code block SHALL use the `choices` language tag
- **AND** the code block SHALL contain JSON with `question` and `options` fields

#### Scenario: Invalid options count

- **WHEN** `present_choices` is called with fewer than 2 or more than 4 options
- **THEN** the tool SHALL return an error indicating the valid range

### Requirement: Choice prompt rendering

The system SHALL render choice prompts as clickable buttons in the chat UI.

#### Scenario: Detecting choice blocks in messages

- **WHEN** an assistant message contains a fenced code block with `choices` language tag
- **THEN** the system SHALL parse the JSON content
- **AND** render the question text and option buttons instead of raw code

#### Scenario: Rendering choice buttons

- **WHEN** a valid choices block is detected
- **THEN** each option SHALL be rendered as a clickable button
- **AND** buttons SHALL display the option's `label` text
- **AND** buttons SHALL be visually distinct from regular message content

#### Scenario: Malformed choices block

- **WHEN** a choices code block contains invalid JSON or missing fields
- **THEN** the system SHALL render the raw code block as fallback
- **AND** SHALL NOT crash or show an error to the user

### Requirement: Choice selection handling

The system SHALL handle user selection of choice options.

#### Scenario: User selects an option

- **WHEN** user clicks a choice button
- **THEN** the option's `value` SHALL be sent as a user message
- **AND** the message SHALL appear in the chat history
- **AND** the agent SHALL receive the value and continue the conversation

#### Scenario: Disabling answered choices

- **WHEN** a user has selected an option from a choices block
- **THEN** all buttons in that block SHALL be disabled
- **AND** the selected button SHALL be visually highlighted

#### Scenario: Outdated choices

- **WHEN** a user message exists after a choices block in the message history
- **THEN** the choices buttons SHALL be disabled
- **AND** the previously selected option (if any) SHALL remain highlighted

### Requirement: Choice prompt accessibility

The system SHALL ensure choice prompts are accessible.

#### Scenario: Keyboard navigation

- **WHEN** focus is on the choices area
- **THEN** users SHALL be able to navigate between options using Tab key
- **AND** users SHALL be able to select an option using Enter or Space key

#### Scenario: Screen reader support

- **WHEN** a screen reader encounters a choices block
- **THEN** the question SHALL be announced
- **AND** each option SHALL be announced as a button with its label
