## ADDED Requirements

### Requirement: Loading state display

The LoadingButton component SHALL display a spinner when in loading state.

#### Scenario: Button loading

- **WHEN** the `loading` prop is true
- **THEN** a spinner icon replaces or accompanies the button text
- **AND** the button is disabled
- **AND** pointer events are blocked

#### Scenario: Button idle

- **WHEN** the `loading` prop is false
- **THEN** the button displays normally with no spinner
