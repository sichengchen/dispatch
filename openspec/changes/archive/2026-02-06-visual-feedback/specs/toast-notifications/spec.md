## ADDED Requirements

### Requirement: Toast notification display

The app SHALL display toast notifications for mutation outcomes.

#### Scenario: Successful mutation

- **WHEN** a mutation completes successfully
- **THEN** a success toast appears with a brief message
- **AND** the toast auto-dismisses after 3-4 seconds

#### Scenario: Failed mutation

- **WHEN** a mutation fails
- **THEN** an error toast appears with the error message
- **AND** the toast persists until dismissed or auto-dismisses after 5 seconds

### Requirement: Toast provider setup

The app SHALL wrap the root component with a toast provider.

#### Scenario: Provider initialization

- **WHEN** the app renders
- **THEN** a Toaster component is mounted at the root level
- **AND** toasts can be triggered from any component
