## ADDED Requirements

### Requirement: Discover models from provider APIs
The system SHALL fetch available models from provider endpoints based on provider type.

#### Scenario: Fetch models from Anthropic
- **WHEN** discovering models for a provider with type 'anthropic'
- **THEN** the system SHALL call GET https://api.anthropic.com/v1/models with the provider's API key

#### Scenario: Fetch models from OpenAI-compatible
- **WHEN** discovering models for a provider with type 'openai-compatible'
- **THEN** the system SHALL call GET {baseUrl}/models with the provider's API key

#### Scenario: Return normalized model list
- **WHEN** models are successfully fetched from a provider
- **THEN** the system SHALL return an array of DiscoveredModel objects with id, name, and capabilities fields

### Requirement: Model discovery response format
The system SHALL normalize provider API responses into a consistent DiscoveredModel structure: `{ id: string, name: string, capabilities: ('chat' | 'embedding')[] }`.

#### Scenario: Anthropic response normalized
- **WHEN** Anthropic API returns models
- **THEN** the system SHALL map each model to DiscoveredModel format with chat capability

#### Scenario: OpenAI response normalized
- **WHEN** OpenAI-compatible API returns models
- **THEN** the system SHALL map each model to DiscoveredModel format and infer capabilities from model metadata

#### Scenario: Embedding models identified
- **WHEN** a model is identified as an embedding model
- **THEN** the capabilities array SHALL include 'embedding'

#### Scenario: Chat models identified
- **WHEN** a model is identified as a chat model
- **THEN** the capabilities array SHALL include 'chat'

### Requirement: In-memory caching
The system SHALL cache discovered models in memory with a 1-hour TTL to reduce API calls.

#### Scenario: Cache hit returns cached models
- **WHEN** models are requested for a provider within 1 hour of last fetch
- **THEN** the system SHALL return cached models without calling the provider API

#### Scenario: Cache miss triggers API call
- **WHEN** models are requested for a provider after 1 hour has elapsed
- **THEN** the system SHALL call the provider API and update the cache

#### Scenario: Cache key is provider ID
- **WHEN** caching models
- **THEN** the cache key SHALL be the provider ID

#### Scenario: Cache expires after 1 hour
- **WHEN** 1 hour has elapsed since a provider's models were cached
- **THEN** the next request SHALL trigger a fresh API call

### Requirement: Manual refresh
The system SHALL allow users to force-refresh models by bypassing the cache.

#### Scenario: Force refresh clears cache
- **WHEN** user requests models with forceRefresh=true
- **THEN** the system SHALL bypass the cache and call the provider API

#### Scenario: Force refresh updates cache
- **WHEN** force refresh completes successfully
- **THEN** the system SHALL update the cache with new results and reset the TTL

### Requirement: Error handling for invalid credentials
The system SHALL handle authentication failures gracefully when provider credentials are invalid.

#### Scenario: Invalid API key returns error
- **WHEN** provider API returns 401 Unauthorized
- **THEN** the system SHALL return an error indicating invalid credentials

#### Scenario: Invalid credentials allow manual fallback
- **WHEN** model discovery fails due to invalid credentials
- **THEN** users SHALL still be able to manually enter model IDs

### Requirement: Error handling for network failures
The system SHALL handle network errors and timeouts when calling provider APIs.

#### Scenario: Network timeout returns cached results
- **WHEN** provider API request times out and cached results exist
- **THEN** the system SHALL return cached results with a warning

#### Scenario: Network timeout with no cache returns error
- **WHEN** provider API request times out and no cached results exist
- **THEN** the system SHALL return an error indicating network failure

#### Scenario: Connection refused returns error
- **WHEN** provider API endpoint is unreachable
- **THEN** the system SHALL return an error indicating connection failure

### Requirement: Error handling for rate limits
The system SHALL handle rate limit errors from provider APIs.

#### Scenario: Rate limit returns cached results
- **WHEN** provider API returns 429 Too Many Requests
- **THEN** the system SHALL return cached results if available

#### Scenario: Rate limit disables refresh
- **WHEN** provider API returns 429 Too Many Requests
- **THEN** the system SHALL disable refresh for that provider for 1 hour

### Requirement: Error handling for malformed responses
The system SHALL handle unexpected or malformed API responses.

#### Scenario: Invalid JSON returns error
- **WHEN** provider API returns invalid JSON
- **THEN** the system SHALL log the error and return an empty model list

#### Scenario: Missing required fields returns error
- **WHEN** provider API response is missing required model fields
- **THEN** the system SHALL log the error and skip that model

#### Scenario: Unknown response format returns empty list
- **WHEN** provider API response does not match expected format
- **THEN** the system SHALL log the error and return an empty model list

### Requirement: API authentication
The system SHALL include provider credentials in API requests according to provider type.

#### Scenario: Anthropic authentication header
- **WHEN** calling Anthropic models endpoint
- **THEN** the request SHALL include header "x-api-key: {apiKey}"

#### Scenario: OpenAI authentication header
- **WHEN** calling OpenAI-compatible models endpoint
- **THEN** the request SHALL include header "Authorization: Bearer {apiKey}"

### Requirement: Request timeout
The system SHALL apply a timeout to provider API requests to prevent indefinite hanging.

#### Scenario: Request times out after configured duration
- **WHEN** provider API does not respond within 10 seconds
- **THEN** the system SHALL abort the request and return a timeout error
