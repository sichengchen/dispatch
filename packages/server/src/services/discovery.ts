import { z } from "zod";
import { generateText, tool, zodSchema } from "ai";
import {
  createProviderMap,
  getModelConfig,
  type LlmConfig,
  type ModelConfig,
  type ProviderType,
  type ProviderKeyMap
} from "@dispatch/lib";
import { getLlmConfig, getSearchConfig } from "./settings";

const suggestionSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  description: z.string().min(1),
  type: z.enum(["rss", "web"]).optional()
});

const suggestionsPayloadSchema = z.object({
  sources: z.array(suggestionSchema).min(1)
});

const searchInputSchema = z.object({
  query: z.string().min(3),
  count: z.number().int().min(1).max(10).default(8)
});

type SearchResult = {
  title: string;
  url: string;
  description?: string;
};

type SearchResponse = {
  results: SearchResult[];
};

function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    const blocked = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);
    for (const key of Array.from(url.searchParams.keys())) {
      if (blocked.has(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeSearchResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const normalized: SearchResult[] = [];

  for (const result of results) {
    const sanitized = sanitizeUrl(result.url);
    if (!sanitized) continue;
    const host = new URL(sanitized).host;
    if (seen.has(host)) continue;
    seen.add(host);
    normalized.push({
      title: result.title.trim(),
      url: sanitized,
      description: result.description?.trim() || ""
    });
  }

  return normalized;
}

function inferType(url: string): "rss" | "web" {
  const lower = url.toLowerCase();
  if (lower.includes("/feed") || lower.endsWith(".xml") || lower.includes("rss")) {
    return "rss";
  }
  return "web";
}

function normalizeSuggestions(suggestions: Array<z.infer<typeof suggestionSchema>>): Array<z.infer<typeof suggestionSchema>> {
  const seen = new Set<string>();
  const output: Array<z.infer<typeof suggestionSchema>> = [];

  for (const suggestion of suggestions) {
    const sanitized = sanitizeUrl(suggestion.url);
    if (!sanitized) continue;
    const host = new URL(sanitized).host;
    if (seen.has(host)) continue;
    seen.add(host);

    output.push({
      name: suggestion.name.trim(),
      url: sanitized,
      description: suggestion.description.trim(),
      type: suggestion.type ?? inferType(sanitized)
    });
  }

  return output.slice(0, 8);
}

function parseJsonFromLlm(raw: string): unknown {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .replace(/```(?:thought|analysis)[\s\S]*?```/gi, "")
    .trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/) ?? cleaned.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch?.[1]?.trim() ?? cleaned;
  return JSON.parse(jsonStr);
}

function getSearchProvider(config?: { provider?: string }) {
  return (config?.provider ?? process.env.DISPATCH_SEARCH_PROVIDER ?? "brave").toLowerCase();
}

async function searchBrave(
  query: string,
  count: number,
  config?: { apiKey?: string; endpoint?: string }
): Promise<SearchResponse> {
  const endpoint = config?.endpoint ?? process.env.DISPATCH_SEARCH_ENDPOINT ?? "https://api.search.brave.com/res/v1/web/search";
  const apiKey = config?.apiKey ?? process.env.DISPATCH_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DISPATCH_SEARCH_API_KEY for Brave search provider.");
  }

  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Brave search error (${res.status}): ${errorText}`);
  }

  const payload = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const results = payload.web?.results ?? [];
  return {
    results: results
      .filter((item) => item.title && item.url)
      .map((item) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        description: item.description ?? ""
      }))
  };
}

async function searchSerper(
  query: string,
  count: number,
  config?: { apiKey?: string; endpoint?: string }
): Promise<SearchResponse> {
  const endpoint = config?.endpoint ?? process.env.DISPATCH_SEARCH_ENDPOINT ?? "https://google.serper.dev/search";
  const apiKey = config?.apiKey ?? process.env.DISPATCH_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DISPATCH_SEARCH_API_KEY for Serper search provider.");
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey
    },
    body: JSON.stringify({ q: query, num: count })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Serper search error (${res.status}): ${errorText}`);
  }

  const payload = (await res.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
  const results = payload.organic ?? [];
  return {
    results: results
      .filter((item) => item.title && item.link)
      .map((item) => ({
        title: item.title ?? "",
        url: item.link ?? "",
        description: item.snippet ?? ""
      }))
  };
}

function extractDuckDuckGoResults(items: Array<Record<string, unknown>>): SearchResult[] {
  const results: SearchResult[] = [];
  for (const item of items) {
    if (Array.isArray(item.Topics)) {
      results.push(...extractDuckDuckGoResults(item.Topics as Array<Record<string, unknown>>));
      continue;
    }
    if (typeof item.FirstURL === "string" && typeof item.Text === "string") {
      results.push({
        title: item.Text.split("-")[0]?.trim() ?? item.Text,
        url: item.FirstURL,
        description: item.Text
      });
    }
  }
  return results;
}

async function searchDuckDuckGo(
  query: string,
  count: number,
  config?: { endpoint?: string }
): Promise<SearchResponse> {
  const url = new URL(config?.endpoint ?? process.env.DISPATCH_SEARCH_ENDPOINT ?? "https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("no_redirect", "1");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`DuckDuckGo search error (${res.status}): ${errorText}`);
  }

  const payload = (await res.json()) as {
    Results?: Array<{ FirstURL?: string; Text?: string }>;
    RelatedTopics?: Array<Record<string, unknown>>;
  };

  const results: SearchResult[] = [];
  for (const item of payload.Results ?? []) {
    if (item.FirstURL && item.Text) {
      results.push({
        title: item.Text.split("-")[0]?.trim() ?? item.Text,
        url: item.FirstURL,
        description: item.Text
      });
    }
  }

  if (payload.RelatedTopics) {
    results.push(...extractDuckDuckGoResults(payload.RelatedTopics));
  }

  return { results: results.slice(0, count) };
}

async function searchWeb(
  query: string,
  count: number,
  config?: { provider?: string; apiKey?: string; endpoint?: string }
): Promise<SearchResponse> {
  if (process.env.DISPATCH_TEST_SEARCH_RESULTS) {
    const parsed = JSON.parse(process.env.DISPATCH_TEST_SEARCH_RESULTS) as SearchResponse | SearchResult[];
    if (Array.isArray(parsed)) {
      return { results: parsed };
    }
    return { results: parsed.results ?? [] };
  }

  const provider = getSearchProvider(config);
  if (provider === "serper") {
    return searchSerper(query, count, config);
  }
  if (provider === "duckduckgo") {
    return searchDuckDuckGo(query, count, config);
  }
  return searchBrave(query, count, config);
}

const webSearchTool = tool({
  description: "Search the web for relevant sources and return the top results.",
  inputSchema: zodSchema(searchInputSchema),
  execute: async (input) => {
    const response = await searchWeb(input.query, input.count, getSearchConfig());
    const normalized = normalizeSearchResults(response.results);
    return { results: normalized };
  }
});

function shouldSkipLlm(configOverride?: LlmConfig) {
  if (process.env.DISPATCH_DISABLE_LLM === "1") return true;
  if (process.env.DISPATCH_DISCOVERY_MODE === "mock") return true;
  if (!configOverride) return false;
  if (!configOverride.assignment?.length) return false;
  return configOverride.assignment.every((assignment) => {
    const entry = configOverride.catalog?.find((item) => item.id === assignment.modelId);
    return entry?.providerType === "mock";
  });
}

function getCatalogEntry(config: LlmConfig, modelId: string) {
  return config.catalog?.find((entry) => entry.id === modelId);
}

function resolveProviderOverrides(
  config: LlmConfig,
  modelConfig: ModelConfig
): ProviderKeyMap | undefined {
  const entry = getCatalogEntry(config, modelConfig.modelId);
  if (!entry?.providerConfig) return undefined;

  if (modelConfig.providerType === "anthropic") {
    const apiKey = entry.providerConfig.apiKey?.trim();
    return apiKey ? { anthropic: apiKey } : undefined;
  }

  if (modelConfig.providerType === "openai") {
    const apiKey =
      entry.providerConfig.apiKey?.trim() || config.providers.openai?.apiKey;
    const baseUrl =
      entry.providerConfig.baseUrl?.trim() || config.providers.openai?.baseUrl;
    if (!apiKey || !baseUrl) return undefined;
    return { openai: { apiKey, baseUrl } };
  }

  return undefined;
}

function getDiscoveryModel(config: LlmConfig) {
  const modelConfig = getModelConfig(config, "summarize");
  if (modelConfig.providerType === "mock") {
    return null;
  }
  const providerMap = createProviderMap(
    config.providers,
    resolveProviderOverrides(config, modelConfig)
  );
  const provider = providerMap[modelConfig.providerType];
  if (!provider) {
    throw new Error(`Unsupported provider: ${modelConfig.providerType}`);
  }
  return provider(modelConfig.model);
}

export async function discoverSources(query: string, configOverride?: LlmConfig) {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const config = configOverride ?? getLlmConfig();

  if (shouldSkipLlm(configOverride)) {
    const response = await searchWeb(trimmed, 8, getSearchConfig());
    return normalizeSuggestions(
      response.results.map((result) => ({
        name: result.title,
        url: result.url,
        description: result.description || ""
      }))
    );
  }

  const model = getDiscoveryModel(config);
  if (!model) {
    const response = await searchWeb(trimmed, 8, getSearchConfig());
    return normalizeSuggestions(
      response.results.map((result) => ({
        name: result.title,
        url: result.url,
        description: result.description || ""
      }))
    );
  }

  const system =
    "You are a source discovery assistant. Use the webSearch tool to find reputable news or blog sources for the query. Return JSON only.";

  const prompt = `Find sources that match this request: "${trimmed}".

Return a JSON object with a "sources" array. Each source must include:
- name: human-friendly name
- url: canonical homepage or RSS/feed URL
- description: short sentence (max 160 chars)
- type: "rss" if it is a feed URL, otherwise "web"

Avoid duplicates and do not invent URLs.`;

  try {
    const { text } = await generateText({
      model,
      system,
      prompt,
      tools: {
        webSearch: webSearchTool
      },
      toolChoice: "required",
      maxRetries: 1
    });

    const parsed = parseJsonFromLlm(text);
    const result = suggestionsPayloadSchema.parse(parsed);
    return normalizeSuggestions(result.sources);
  } catch (err) {
    console.warn("[discoverSources] LLM tool call failed, falling back to search results", err);
    const response = await searchWeb(trimmed, 8, getSearchConfig());
    return normalizeSuggestions(
      response.results.map((result) => ({
        name: result.title,
        url: result.url,
        description: result.description || ""
      }))
    );
  }
}
