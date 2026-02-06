## 1. Backend Types & Schema

- [x] 1.1 Create Provider type in packages/lib/src/models.ts with id, name, type, and credentials fields
- [x] 1.2 Create DiscoveredModel type in packages/lib/src/models.ts with id, name, and capabilities fields
- [x] 1.3 Update CatalogEntry type to replace providerConfig with providerId reference
- [x] 1.4 Add Provider Zod schema in packages/server/src/services/settings.ts
- [x] 1.5 Update Settings type to include providers array at top level
- [x] 1.6 Update settingsSchema Zod validator to include providers array (optional for backward compatibility)

## 2. Settings Migration

- [x] 2.1 Implement extractProvidersFromCatalog() function to group catalog entries by credentials
- [x] 2.2 Implement provider name generation logic (Anthropic, OpenAI 1, OpenAI 2, etc.)
- [x] 2.3 Handle mock provider extraction with special case (no credentials)
- [x] 2.4 Implement updateCatalogWithProviderIds() to replace providerConfig with providerId references
- [x] 2.5 Add migration logic to loadSettings() that runs when providers array is missing
- [x] 2.6 Add migration tests to verify correct provider extraction and catalog updates
- [x] 2.7 Test migration with existing dispatch.settings.json files

## 3. Model Discovery Service

- [x] 3.1 Create packages/server/src/services/model-discovery.ts file
- [x] 3.2 Implement in-memory cache with Map structure (key: providerId, value: {models, timestamp})
- [x] 3.3 Implement cache TTL logic (1 hour expiration check)
- [x] 3.4 Implement discoverModels() function with provider parameter
- [x] 3.5 Add Anthropic API call to GET https://api.anthropic.com/v1/models with x-api-key header
- [x] 3.6 Add OpenAI-compatible API call to GET {baseUrl}/models with Authorization Bearer header
- [x] 3.7 Implement response normalization to DiscoveredModel format for Anthropic
- [x] 3.8 Implement response normalization to DiscoveredModel format for OpenAI-compatible
- [x] 3.9 Infer capabilities (chat/embedding) from model metadata
- [x] 3.10 Add 10-second timeout to all API requests
- [x] 3.11 Implement error handling for 401 Unauthorized (invalid credentials)
- [x] 3.12 Implement error handling for 429 Too Many Requests (rate limits)
- [x] 3.13 Implement error handling for network timeouts (return cached results if available)
- [x] 3.14 Implement error handling for malformed JSON responses
- [x] 3.15 Add forceRefresh parameter to bypass cache

## 4. tRPC API Endpoints

- [x] 4.1 Add getProviders query procedure to packages/server/src/routes/settings.ts
- [x] 4.2 Add addProvider mutation with Zod input validation (name, type, credentials)
- [x] 4.3 Implement provider ID generation using UUID in addProvider
- [x] 4.4 Add updateProvider mutation with Zod input validation (id, partial fields)
- [x] 4.5 Add deleteProvider mutation with id validation
- [x] 4.6 Handle provider deletion cascade (mark models with deleted providerId as invalid)
- [x] 4.7 Add discoverModels query with input schema (providerId, forceRefresh)
- [x] 4.8 Integrate model-discovery service into discoverModels endpoint
- [x] 4.9 Add error handling for provider not found in all endpoints
- [x] 4.10 Add error handling for validation failures with descriptive messages
- [x] 4.11 Ensure all mutations call saveSettings() to persist changes

## 5. Frontend Types & Updates

- [x] 5.1 Export Provider type from packages/api for frontend consumption
- [x] 5.2 Export DiscoveredModel type from packages/api for frontend consumption
- [x] 5.3 Update apps/desktop/src/components/settings/types.ts to import Provider type
- [x] 5.4 Update apps/desktop/src/components/settings/types.ts to remove embedded providerConfig from CatalogEntry
- [x] 5.5 Add providerId field to CatalogEntry type in frontend

## 6. UI Components - Providers

- [x] 6.1 Create apps/desktop/src/components/settings/ProvidersSection.tsx component file
- [x] 6.2 Add "+ Add Provider" button to ProvidersSection
- [x] 6.3 Implement provider creation form (name input, type selector, credentials inputs)
- [x] 6.4 Show baseUrl input conditionally for openai-compatible type
- [x] 6.5 Add tRPC addProvider mutation call on form submit
- [x] 6.6 Implement provider list display with provider cards
- [x] 6.7 Add "Refresh" button to each provider card
- [x] 6.8 Implement refresh button click handler (call discoverModels with forceRefresh=true)
- [x] 6.9 Add "Edit" functionality for updating provider name and credentials
- [x] 6.10 Add "Delete" button with confirmation dialog
- [x] 6.11 Add tRPC deleteProvider mutation call on delete confirmation
- [x] 6.12 Display error messages when provider operations fail
- [x] 6.13 Show loading states during provider creation/update/delete

## 7. UI Components - Models

- [x] 7.1 Update apps/desktop/src/components/settings/ModelsTab.tsx to fetch providers via tRPC
- [x] 7.2 Replace provider type selector with provider dropdown (select from providers list)
- [x] 7.3 Add discovered models fetching when provider is selected
- [x] 7.4 Replace model ID text input with model selector dropdown
- [x] 7.5 Show discovered models in dropdown with model.name as display text
- [x] 7.6 Add fallback to manual text entry when model discovery fails
- [x] 7.7 Display error message when model discovery fails (invalid credentials, network error, etc.)
- [x] 7.8 Show loading indicator while fetching discovered models
- [x] 7.9 Auto-fill model ID field when user selects from discovered models dropdown
- [x] 7.10 Remove providerConfig inputs (API key, baseUrl) from model entry form
- [x] 7.11 Update model catalog entry creation to use providerId instead of providerConfig
- [x] 7.12 Handle orphaned models (display error if providerId references deleted provider)

## 8. Integration & Testing

- [x] 8.1 Test provider CRUD operations end-to-end (create, list, update, delete) - Manual E2E test passed
- [x] 8.2 Test model discovery with valid Anthropic credentials - Automated test in model-discovery.test.ts
- [x] 8.3 Test model discovery with valid OpenAI-compatible credentials - Automated test in model-discovery.test.ts
- [x] 8.4 Test model discovery caching (verify second call uses cache) - Automated test in model-discovery.test.ts
- [x] 8.5 Test force refresh bypasses cache - Automated test in model-discovery.test.ts
- [x] 8.6 Test error handling: invalid API key shows appropriate error - Automated test in model-discovery.test.ts
- [x] 8.7 Test error handling: network timeout shows appropriate error - Automated test in model-discovery.test.ts
- [x] 8.8 Test provider deletion cascades to models correctly - Manual E2E test passed
- [x] 8.9 Test settings migration with existing dispatch.settings.json - Automated test in settings-providers.test.ts
- [x] 8.10 Test full workflow: add provider → discover models → add model → assign to router - Manual E2E test passed
- [x] 8.11 Verify backward compatibility (app still works with migrated settings) - Automated test in settings-providers.test.ts
- [x] 8.12 Test UI shows correct error states for all failure scenarios - Manual E2E test passed
