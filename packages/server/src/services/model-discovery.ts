import type { Provider, DiscoveredModel } from "@dispatch/lib";

// In-memory cache for discovered models
type CacheEntry = {
  models: DiscoveredModel[];
  timestamp: number;
};

const modelCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Discover models from a provider's API
 */
export async function discoverModels(
  provider: Provider,
  forceRefresh = false
): Promise<DiscoveredModel[]> {
  // Check cache if not forcing refresh
  if (!forceRefresh) {
    const cached = modelCache.get(provider.id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.models;
    }
  }

  try {
    let models: DiscoveredModel[];

    if (provider.type === "anthropic") {
      models = await fetchAnthropicModels(provider);
    } else {
      models = await fetchOpenAIModels(provider);
    }

    // Update cache
    modelCache.set(provider.id, {
      models,
      timestamp: Date.now()
    });

    return models;
  } catch (error) {
    // On error, return cached results if available
    const cached = modelCache.get(provider.id);
    if (cached) {
      console.warn(
        `Model discovery failed for provider ${provider.name}, returning cached results`,
        error
      );
      return cached.models;
    }
    throw error;
  }
}

/**
 * Fetch models from Anthropic API
 */
async function fetchAnthropicModels(provider: Provider): Promise<DiscoveredModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": provider.credentials.apiKey,
        "anthropic-version": "2023-06-01"
      },
      signal: controller.signal
    });

    if (response.status === 401) {
      throw new Error("Invalid Anthropic API key");
    }

    if (response.status === 429) {
      throw new Error("Rate limit exceeded");
    }

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate and normalize response
    if (!data.data || !Array.isArray(data.data)) {
      console.error("Unexpected Anthropic API response format:", data);
      return [];
    }

    return data.data.map((model: any): DiscoveredModel => ({
      id: model.id || model.model || "unknown",
      name: model.display_name || model.id || model.model || "Unknown Model",
      capabilities: ["chat"] // Anthropic models are chat models
    }));
  } catch (error) {
    if ((error as any).name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch models from OpenAI-compatible API
 */
async function fetchOpenAIModels(provider: Provider): Promise<DiscoveredModel[]> {
  if (!provider.credentials.baseUrl) {
    throw new Error("OpenAI-compatible provider requires baseUrl");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${provider.credentials.baseUrl.replace(/\/$/, "")}/models`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${provider.credentials.apiKey}`
      },
      signal: controller.signal
    });

    if (response.status === 401) {
      throw new Error("Invalid API key");
    }

    if (response.status === 429) {
      throw new Error("Rate limit exceeded");
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Validate and normalize response
    if (!data.data || !Array.isArray(data.data)) {
      console.error("Unexpected OpenAI API response format:", data);
      return [];
    }

    return data.data.map((model: any): DiscoveredModel => {
      // Infer capabilities from model id/name
      const modelId = model.id || model.model || "unknown";
      const capabilities: Array<"chat" | "embedding"> = [];

      // Common patterns for embedding models
      if (
        modelId.includes("embed") ||
        modelId.includes("embedding") ||
        modelId.includes("ada")
      ) {
        capabilities.push("embedding");
      } else {
        // Default to chat if not clearly an embedding model
        capabilities.push("chat");
      }

      return {
        id: modelId,
        name: model.name || modelId,
        capabilities,
        ownedBy: model.owned_by
      };
    });
  } catch (error) {
    if ((error as any).name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Clear the model cache (for testing)
 */
export function clearModelCache(): void {
  modelCache.clear();
}
