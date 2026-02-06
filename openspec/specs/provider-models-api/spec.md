## ADDED Requirements

### Requirement: getProviders endpoint
The system SHALL expose a tRPC query endpoint to retrieve all configured providers.

#### Scenario: Retrieve all providers
- **WHEN** client calls getProviders query
- **THEN** the system SHALL return an array of all providers from settings

#### Scenario: Return empty array when no providers
- **WHEN** client calls getProviders and no providers exist
- **THEN** the system SHALL return an empty array

#### Scenario: Provider credentials included
- **WHEN** getProviders returns providers
- **THEN** each provider SHALL include credentials (apiKey and baseUrl if applicable)

### Requirement: addProvider endpoint
The system SHALL expose a tRPC mutation endpoint to create a new provider.

#### Scenario: Create valid provider
- **WHEN** client calls addProvider with valid name, type, and credentials
- **THEN** the system SHALL generate an ID, store the provider, and return the created provider

#### Scenario: Validate required fields
- **WHEN** client calls addProvider with missing name or credentials
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Validate provider type
- **WHEN** client calls addProvider with invalid type
- **THEN** the system SHALL reject the request with a validation error

#### Scenario: Persist to settings file
- **WHEN** addProvider successfully creates a provider
- **THEN** the system SHALL persist the updated settings to dispatch.settings.json

### Requirement: updateProvider endpoint
The system SHALL expose a tRPC mutation endpoint to update an existing provider.

#### Scenario: Update provider fields
- **WHEN** client calls updateProvider with id and updated fields
- **THEN** the system SHALL update the provider and return the updated provider

#### Scenario: Non-existent provider returns error
- **WHEN** client calls updateProvider with an ID that does not exist
- **THEN** the system SHALL return an error indicating provider not found

#### Scenario: Partial updates allowed
- **WHEN** client calls updateProvider with only some fields
- **THEN** the system SHALL update only the provided fields and preserve others

#### Scenario: Persist to settings file
- **WHEN** updateProvider successfully updates a provider
- **THEN** the system SHALL persist the updated settings to dispatch.settings.json

### Requirement: deleteProvider endpoint
The system SHALL expose a tRPC mutation endpoint to delete a provider by ID.

#### Scenario: Delete existing provider
- **WHEN** client calls deleteProvider with a valid provider ID
- **THEN** the system SHALL remove the provider from settings

#### Scenario: Non-existent provider returns error
- **WHEN** client calls deleteProvider with an ID that does not exist
- **THEN** the system SHALL return an error indicating provider not found

#### Scenario: Persist to settings file
- **WHEN** deleteProvider successfully deletes a provider
- **THEN** the system SHALL persist the updated settings to dispatch.settings.json

### Requirement: discoverModels endpoint
The system SHALL expose a tRPC query endpoint to fetch available models from a provider.

#### Scenario: Discover models for provider
- **WHEN** client calls discoverModels with providerId
- **THEN** the system SHALL fetch models from the provider API and return DiscoveredModel array

#### Scenario: Return cached models by default
- **WHEN** client calls discoverModels without forceRefresh
- **THEN** the system SHALL return cached models if available and not expired

#### Scenario: Force refresh bypasses cache
- **WHEN** client calls discoverModels with forceRefresh=true
- **THEN** the system SHALL bypass the cache and fetch fresh models from the provider API

#### Scenario: Non-existent provider returns error
- **WHEN** client calls discoverModels with an ID that does not exist
- **THEN** the system SHALL return an error indicating provider not found

#### Scenario: Discovery failure returns error
- **WHEN** model discovery fails (network, credentials, etc.)
- **THEN** the system SHALL return an error with details about the failure

### Requirement: Input validation
The system SHALL validate all inputs to provider API endpoints using Zod schemas.

#### Scenario: addProvider validates input schema
- **WHEN** client calls addProvider with invalid input structure
- **THEN** the system SHALL return a validation error before attempting to create provider

#### Scenario: updateProvider validates input schema
- **WHEN** client calls updateProvider with invalid input structure
- **THEN** the system SHALL return a validation error before attempting to update provider

#### Scenario: deleteProvider validates input schema
- **WHEN** client calls deleteProvider with invalid input structure
- **THEN** the system SHALL return a validation error before attempting to delete provider

#### Scenario: discoverModels validates input schema
- **WHEN** client calls discoverModels with invalid input structure
- **THEN** the system SHALL return a validation error before attempting to discover models

### Requirement: Error responses
The system SHALL return consistent error responses for API failures.

#### Scenario: Not found errors
- **WHEN** an operation references a non-existent provider
- **THEN** the system SHALL return an error with code "NOT_FOUND" and descriptive message

#### Scenario: Validation errors
- **WHEN** input validation fails
- **THEN** the system SHALL return an error with code "BAD_REQUEST" and validation details

#### Scenario: Internal errors
- **WHEN** an unexpected error occurs during processing
- **THEN** the system SHALL return an error with code "INTERNAL_SERVER_ERROR" and error message

### Requirement: Type safety
The system SHALL use TypeScript types exported from the API package for frontend consumption.

#### Scenario: Provider type exported
- **WHEN** frontend imports provider types
- **THEN** the types SHALL match the backend Provider interface exactly

#### Scenario: DiscoveredModel type exported
- **WHEN** frontend imports DiscoveredModel types
- **THEN** the types SHALL match the backend DiscoveredModel interface exactly

#### Scenario: Endpoint input types exported
- **WHEN** frontend calls tRPC endpoints
- **THEN** input types SHALL be inferred from Zod schemas automatically
