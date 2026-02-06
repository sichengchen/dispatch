## Why

The current model management system requires users to manually type model IDs and duplicates provider credentials across multiple model entries. This is error-prone and makes it difficult to discover what models are actually available from a provider. By separating provider configuration from model selection and auto-discovering available models via provider APIs, we can streamline the workflow and reduce configuration errors.

## What Changes

- Add a separate **Provider Management** layer where users register providers (Anthropic or OpenAI-compatible) with credentials once
- Implement **automatic model discovery** by calling provider `/models` endpoints to fetch available models
- Add a **refresh button** in the UI to re-fetch models from providers on demand
- Change the **Add Model workflow** from manual text entry to selecting from a list of discovered models
- Create a new backend **/models endpoint** to serve discovered models to the frontend
- Migrate existing model catalog entries to use provider references instead of embedded credentials
- Update the Settings UI to support the new provider-first workflow

## Capabilities

### New Capabilities

- `provider-management`: Managing provider configurations separately from models, including CRUD operations for providers with credentials (API keys, base URLs)
- `model-discovery`: Automatically fetching available models from provider endpoints (Anthropic `/v1/models`, OpenAI-compatible `/v1/models`) and caching results
- `provider-models-api`: Backend tRPC endpoint exposing provider models and refresh functionality to the frontend

### Modified Capabilities

<!-- No existing spec-level capabilities are being modified -->

## Impact

**Backend:**
- `packages/server/src/routes/settings.ts` - Add provider management endpoints
- `packages/server/src/services/settings.ts` - Update schema to support providers array and model references
- New service: `packages/server/src/services/model-discovery.ts` - Fetch models from provider APIs
- `packages/lib/src/models.ts` - Update types to support provider references

**Frontend:**
- `apps/desktop/src/components/settings/ModelsTab.tsx` - Redesign UI for provider-first workflow
- Add new component: `apps/desktop/src/components/settings/ProvidersSection.tsx`
- Update types: `apps/desktop/src/components/settings/types.ts`

**Database/Storage:**
- `dispatch.settings.json` schema changes (backward compatible migration needed)
- Settings will store: `providers` array + updated `catalog` with provider references

**Dependencies:**
- May need to handle different API response formats between Anthropic and OpenAI-compatible providers
- Rate limiting considerations when fetching models from provider APIs
