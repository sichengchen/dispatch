## ADDED Requirements

### Requirement: Provider storage schema
The system SHALL store providers in a top-level `providers` array in settings with the following structure: `{ id: string, name: string, type: 'anthropic' | 'openai-compatible', credentials: { apiKey: string, baseUrl?: string } }`.

#### Scenario: Provider stored with all fields
- **WHEN** a provider is created with id, name, type, and credentials
- **THEN** the provider SHALL be stored in the providers array with all fields persisted

#### Scenario: OpenAI-compatible provider includes baseUrl
- **WHEN** a provider with type 'openai-compatible' is created
- **THEN** the provider credentials MUST include a baseUrl field

#### Scenario: Anthropic provider omits baseUrl
- **WHEN** a provider with type 'anthropic' is created
- **THEN** the provider credentials MAY omit the baseUrl field

### Requirement: Create provider
The system SHALL allow users to create a new provider by specifying name, type, and credentials.

#### Scenario: Valid provider creation
- **WHEN** user submits a provider with valid name, type 'anthropic', and API key
- **THEN** the system SHALL generate a unique ID and store the provider in settings

#### Scenario: Duplicate provider names allowed
- **WHEN** user creates a provider with a name that already exists
- **THEN** the system SHALL allow creation (names are not unique identifiers)

#### Scenario: Invalid type rejected
- **WHEN** user submits a provider with type not in ['anthropic', 'openai-compatible']
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Missing credentials rejected
- **WHEN** user submits a provider without an API key
- **THEN** the system SHALL reject the request with a validation error

### Requirement: Update provider
The system SHALL allow users to update an existing provider's name, type, or credentials by provider ID.

#### Scenario: Update provider name
- **WHEN** user updates a provider's name field
- **THEN** the system SHALL persist the new name without affecting other fields

#### Scenario: Update provider credentials
- **WHEN** user updates a provider's API key
- **THEN** all models referencing this provider SHALL use the new credentials automatically

#### Scenario: Non-existent provider update fails
- **WHEN** user attempts to update a provider with an ID that does not exist
- **THEN** the system SHALL return an error indicating the provider was not found

### Requirement: Delete provider
The system SHALL allow users to delete a provider by ID and handle orphaned model references.

#### Scenario: Delete provider with no models
- **WHEN** user deletes a provider that has no models referencing it
- **THEN** the system SHALL remove the provider from the providers array

#### Scenario: Delete provider with models
- **WHEN** user deletes a provider that has models referencing it
- **THEN** the system SHALL remove the provider and mark referencing models as invalid

#### Scenario: Orphaned models display error
- **WHEN** a model references a deleted provider
- **THEN** the system SHALL display an error indicating the provider is missing

### Requirement: List providers
The system SHALL allow users to retrieve all configured providers.

#### Scenario: List all providers
- **WHEN** user requests the list of providers
- **THEN** the system SHALL return all providers in the providers array

#### Scenario: Empty providers list
- **WHEN** no providers are configured
- **THEN** the system SHALL return an empty array

### Requirement: Provider ID uniqueness
The system MUST ensure each provider has a unique ID that remains stable across updates.

#### Scenario: ID generated on creation
- **WHEN** a provider is created
- **THEN** the system SHALL generate a unique UUID as the provider ID

#### Scenario: ID immutable during updates
- **WHEN** a provider is updated
- **THEN** the provider ID SHALL NOT change

### Requirement: Model catalog references providers
The system SHALL update the model catalog schema to reference providers by ID instead of embedding credentials.

#### Scenario: Model stores providerId
- **WHEN** a model is added to the catalog
- **THEN** the model SHALL store the providerId field referencing a provider

#### Scenario: Model providerConfig removed
- **WHEN** a model is stored in the new schema
- **THEN** the model SHALL NOT contain a providerConfig field (credentials stored in provider only)

### Requirement: Settings migration
The system SHALL automatically migrate existing settings with embedded providerConfig to the new provider-based schema.

#### Scenario: Migration on first load
- **WHEN** settings are loaded and no providers array exists
- **THEN** the system SHALL extract providers from catalog entries and migrate the schema

#### Scenario: Provider extraction from catalog
- **WHEN** migrating settings
- **THEN** the system SHALL group catalog entries by (providerType, apiKey, baseUrl) to create unique providers

#### Scenario: Provider names generated
- **WHEN** creating providers during migration
- **THEN** the system SHALL generate names like "Anthropic", "OpenAI 1", "OpenAI 2" for each unique provider

#### Scenario: Catalog updated with provider IDs
- **WHEN** migration completes
- **THEN** each catalog entry SHALL have its providerConfig replaced with a providerId reference

#### Scenario: Mock provider created
- **WHEN** migrating catalog entries with providerType 'mock'
- **THEN** the system SHALL create a special mock provider with no credentials

#### Scenario: Migration persists changes
- **WHEN** migration completes
- **THEN** the system SHALL save the updated settings to dispatch.settings.json

#### Scenario: Already migrated settings unchanged
- **WHEN** settings are loaded and providers array exists
- **THEN** the system SHALL NOT run migration again
