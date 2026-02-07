## Context

**Current State:**
- Model catalog entries in `dispatch.settings.json` contain embedded `providerConfig` with API keys and base URLs
- Users manually type model IDs when adding models (error-prone, no validation)
- Same provider credentials are duplicated across multiple model entries
- No mechanism to discover what models a provider actually offers
- Settings managed via tRPC endpoints in `packages/server/src/routes/settings.ts`

**Target State:**
- Separate `providers` array storing credentials once
- Model catalog entries reference providers by ID instead of embedding credentials
- Auto-discovery of available models from provider APIs
- UI dropdown for model selection instead of free-text input
- Refresh mechanism to re-fetch models on demand

**Constraints:**
- Must maintain backward compatibility with existing `dispatch.settings.json` files
- Cannot break existing deployments during migration
- Provider API calls may fail (network issues, invalid credentials, rate limits)
- Anthropic and OpenAI have different `/models` response formats

## Goals / Non-Goals

**Goals:**
- Separate provider configuration from model selection
- Auto-discover available models from Anthropic and OpenAI-compatible endpoints
- Migrate existing settings without manual user intervention
- Provide UI for managing providers and refreshing model lists
- Reduce configuration errors by replacing text input with selection

**Non-Goals:**
- Supporting providers without a `/models` endpoint (they can still be added manually)
- Real-time synchronization of provider model lists (manual refresh is sufficient)
- Provider health monitoring or status checks beyond model discovery
- Multi-user provider sharing (single workspace, single settings file)

## Decisions

### 1. Provider Storage Schema

**Decision:** Add top-level `providers` array to settings, each with `id`, `type`, `name`, and `credentials`.

```typescript
// New schema addition
type Provider = {
  id: string;              // UUID
  name: string;            // User-friendly name
  type: 'anthropic' | 'openai-compatible';
  credentials: {
    apiKey: string;
    baseUrl?: string;      // Only for openai-compatible
  };
};

type Settings = {
  providers: Provider[];   // NEW
  models: {
    catalog: CatalogEntry[];
    assignment: Assignment[];
  };
  // ... existing fields
};
```

**Rationale:**
- Top-level `providers` array keeps clean separation from model catalog
- Provider `id` enables stable references even if user renames the provider
- Provider `type` determines which API format to use for model discovery
- Optional `baseUrl` only needed for OpenAI-compatible providers

**Alternatives considered:**
- Nested under `models.providers` → Rejected: providers are conceptually separate from the catalog
- Store credentials encrypted → Rejected: no encryption infrastructure exists, settings file is local-only

### 2. Model-to-Provider Reference

**Decision:** Replace `providerConfig` in catalog entries with `providerId` reference.

```typescript
// Before
type CatalogEntry = {
  id: string;
  providerType: 'anthropic' | 'openai' | 'mock';
  model: string;
  providerConfig: { apiKey: string; baseUrl: string; };  // REMOVED
  // ...
};

// After
type CatalogEntry = {
  id: string;
  providerId: string;      // NEW: references providers[].id
  model: string;
  // providerType derived from provider lookup
  // ...
};
```

**Rationale:**
- Eliminates credential duplication
- Single source of truth for provider credentials
- Changing provider credentials updates all models automatically
- `mock` provider type becomes a special provider entry with no credentials

**Alternatives considered:**
- Keep `providerConfig` as optional fallback → Rejected: creates two code paths, defeats purpose
- Store provider inline with normalization → Rejected: overcomplicated

### 3. Model Discovery API

**Decision:** Create `model-discovery` service that calls provider APIs and caches results in memory.

**Service Interface:**
```typescript
// packages/server/src/services/model-discovery.ts
type DiscoveredModel = {
  id: string;              // Model ID from provider
  name: string;            // Display name
  capabilities: ('chat' | 'embedding')[];
};

async function discoverModels(provider: Provider): Promise<DiscoveredModel[]>
```

**API Endpoints:**
- Anthropic: `GET https://api.anthropic.com/v1/models`
- OpenAI-compatible: `GET {baseUrl}/models`

**Caching Strategy:**
- In-memory cache with 1-hour TTL
- Cache key: `provider.id`
- Manual refresh via UI button clears cache and re-fetches

**Rationale:**
- In-memory cache is simple and sufficient for single-user app
- 1-hour TTL balances freshness with API rate limits
- Manual refresh gives users control when they need latest models

**Alternatives considered:**
- Persistent cache in SQLite → Rejected: overkill, models don't change that often
- No caching → Rejected: excessive API calls, poor UX
- Background refresh → Rejected: unnecessary complexity

### 4. tRPC API Design

**Decision:** Add provider endpoints to settings router, plus model discovery endpoint.

```typescript
// New tRPC procedures
settingsRouter = {
  // Provider management
  getProviders: procedure.query(() => Provider[]),
  addProvider: procedure.input(z.object({...})).mutation(),
  updateProvider: procedure.input(z.object({...})).mutation(),
  deleteProvider: procedure.input(z.object({id: string})).mutation(),

  // Model discovery
  discoverModels: procedure
    .input(z.object({ providerId: string, forceRefresh: boolean }))
    .query(() => DiscoveredModel[]),
};
```

**Rationale:**
- Extends existing settings router naturally
- `forceRefresh` flag enables manual refresh UX
- CRUD operations match existing patterns in codebase

### 5. Migration Strategy

**Decision:** Auto-migrate on settings load if `providers` array is missing.

**Migration Logic:**
```typescript
// In loadSettings()
if (!settings.providers) {
  settings.providers = extractProvidersFromCatalog(settings.models.catalog);
  settings.models.catalog = updateCatalogWithProviderIds(
    settings.models.catalog,
    settings.providers
  );
  saveSettings(settings);
}
```

**Provider Extraction Rules:**
1. Group catalog entries by `(providerType, apiKey, baseUrl)`
2. Create one provider per unique group
3. Generate provider names: "Anthropic", "OpenAI 1", "OpenAI 2", etc.
4. Replace `providerConfig` with `providerId` in each catalog entry
5. `mock` entries get a special mock provider (no credentials)

**Rationale:**
- Fully automatic, no user intervention required
- Runs once on first load after upgrade
- Preserves all existing functionality
- Users can rename auto-generated provider names later

**Alternatives considered:**
- Manual migration UI → Rejected: poor UX, users expect seamless upgrades
- Lazy migration per model → Rejected: creates transitional complexity
- Keep both schemas → Rejected: maintenance burden

### 6. Error Handling

**Decision:** Graceful degradation when provider APIs are unreachable.

**Error Cases:**
- **Invalid credentials** → Show error in UI, allow manual model entry as fallback
- **Network timeout** → Cache last successful result, show warning
- **Rate limit exceeded** → Return cached results, disable refresh for 1 hour
- **Unknown provider response format** → Log error, return empty list

**UI Behavior:**
- Model discovery failures don't block provider creation
- Users can always fall back to typing model IDs manually
- Error messages indicate what went wrong and suggest fixes

**Rationale:**
- Network issues are common, app should remain functional
- Cached results provide better UX than complete failure
- Manual fallback ensures users are never completely blocked

### 7. UI Flow

**Decision:** Two-step workflow with separate provider and model management sections.

**New Workflow:**
1. **Add Provider** (ProvidersSection component):
   - Click "+ Add Provider"
   - Select type (Anthropic / OpenAI-compatible)
   - Enter name, API key, base URL (if OpenAI)
   - Save → Auto-fetch models in background

2. **Add Model** (ModelsTab component):
   - Click "+ Add Model"
   - Select provider from dropdown
   - Select model from discovered models dropdown (or type manually if discovery failed)
   - Set display name and capabilities
   - Assign to router tasks

**UI Components:**
- `ProvidersSection.tsx` - New component for provider CRUD
- `ModelsTab.tsx` - Updated to show provider selector + model selector
- Refresh button next to each provider in ProvidersSection

**Rationale:**
- Clear separation matches mental model (configure providers first, then select models)
- Dropdown selection prevents typos
- Manual fallback maintains flexibility
- Refresh per-provider gives granular control

## Risks / Trade-offs

**[Risk]** Provider API format changes break discovery
**→ Mitigation:** Strict API response validation with fallback to manual entry, version detection where possible

**[Risk]** Migration produces duplicate providers
**→ Mitigation:** Group by credentials during extraction, allow users to merge/delete duplicates in UI

**[Risk]** In-memory cache lost on server restart
**→ Mitigation:** Acceptable - discovery is fast enough to re-fetch, users can manually refresh

**[Risk]** Different providers return different model metadata
**→ Mitigation:** Normalize to common `DiscoveredModel` interface, map provider-specific fields

**[Trade-off]** Manual refresh instead of auto-sync
**→ Benefit:** Simpler implementation, no background job needed, users control when to check for new models

**[Trade-off]** No encrypted credential storage
**→ Benefit:** Avoids encryption infrastructure complexity, settings file is local workspace-only

**[Trade-off]** Provider deletion cascades to models
**→ Benefit:** Prevents orphaned models with invalid credentials, users get clear error requiring reassignment
