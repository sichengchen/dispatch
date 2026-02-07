import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverModels, clearModelCache } from "../src/services/model-discovery";
import type { Provider } from "@dispatch/lib";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("Model Discovery Service", () => {
  beforeEach(() => {
    clearModelCache();
    mockFetch.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Anthropic Provider", () => {
    const anthropicProvider: Provider = {
      id: "test-anthropic",
      name: "Test Anthropic",
      type: "anthropic",
      credentials: {
        apiKey: "test-key-123"
      }
    };

    it("should fetch models from Anthropic API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "claude-3-5-sonnet-20241022",
              display_name: "Claude 3.5 Sonnet",
              type: "model"
            },
            {
              id: "claude-3-opus-20240229",
              display_name: "Claude 3 Opus",
              type: "model"
            }
          ]
        })
      });

      const models = await discoverModels(anthropicProvider);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/models");
      expect(options.headers).toEqual({
        "x-api-key": "test-key-123",
        "anthropic-version": "2023-06-01"
      });
      expect(options.signal).toBeDefined();

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        capabilities: ["chat"]
      });
    });

    it("should infer chat capability for Anthropic models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "claude-3-haiku-20240307",
              display_name: "Claude 3 Haiku",
              type: "model"
            }
          ]
        })
      });

      const models = await discoverModels(anthropicProvider);

      expect(models[0].capabilities).toContain("chat");
    });

    it("should throw error for invalid API key (401)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized"
      });

      await expect(discoverModels(anthropicProvider)).rejects.toThrow(
        "Invalid Anthropic API key"
      );
    });

    it("should throw error for rate limit (429)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests"
      });

      await expect(discoverModels(anthropicProvider)).rejects.toThrow(
        /Rate limit exceeded/
      );
    });

    it("should handle network timeout", async () => {
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error("Request timeout");
          error.name = "AbortError";
          setTimeout(() => reject(error), 15000);
        });
      });

      const promise = discoverModels(anthropicProvider);
      vi.advanceTimersByTime(15000);
      await expect(promise).rejects.toThrow("Request timeout");
    });
  });

  describe("OpenAI-Compatible Provider", () => {
    const openaiProvider: Provider = {
      id: "test-openai",
      name: "Test OpenAI",
      type: "openai-compatible",
      credentials: {
        apiKey: "sk-test-456",
        baseUrl: "https://api.openai.com/v1"
      }
    };

    it("should fetch models from OpenAI API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "gpt-4-turbo-preview",
              object: "model"
            },
            {
              id: "text-embedding-3-large",
              object: "model"
            }
          ]
        })
      });

      const models = await discoverModels(openaiProvider);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/models");
      expect(options.headers).toEqual({
        Authorization: "Bearer sk-test-456"
      });
      expect(options.signal).toBeDefined();

      expect(models.length).toBeGreaterThan(0);
    });

    it("should infer embedding capability for embedding models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "text-embedding-3-small",
              object: "model"
            },
            {
              id: "text-embedding-ada-002",
              object: "model"
            }
          ]
        })
      });

      const models = await discoverModels(openaiProvider);

      expect(models[0].capabilities).toContain("embedding");
      expect(models[1].capabilities).toContain("embedding");
    });

    it("should infer chat capability for GPT models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "gpt-4",
              object: "model"
            },
            {
              id: "gpt-3.5-turbo",
              object: "model"
            }
          ]
        })
      });

      const models = await discoverModels(openaiProvider);

      expect(models[0].capabilities).toContain("chat");
      expect(models[1].capabilities).toContain("chat");
    });

    it("should use custom baseUrl", async () => {
      const customProvider: Provider = {
        id: "custom-openai",
        name: "Custom OpenAI",
        type: "openai-compatible",
        credentials: {
          apiKey: "custom-key",
          baseUrl: "https://custom.api.com/v1"
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      });

      await discoverModels(customProvider);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://custom.api.com/v1/models",
        expect.any(Object)
      );
    });
  });

  describe("Cache Behavior", () => {
    const provider: Provider = {
      id: "cache-test",
      name: "Cache Test",
      type: "anthropic",
      credentials: {
        apiKey: "test-key"
      }
    };

    it("should cache results for 1 hour", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "model-1", display_name: "Model 1", type: "model" }]
        })
      });

      // First call - should hit API
      await discoverModels(provider);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call within TTL - should use cache
      await discoverModels(provider);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1 call

      // Advance time by 1 hour
      vi.advanceTimersByTime(60 * 60 * 1000);

      // Third call after TTL - should hit API again
      await discoverModels(provider);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should bypass cache when forceRefresh is true", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "model-1", display_name: "Model 1", type: "model" }]
        })
      });

      // First call
      await discoverModels(provider);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call with forceRefresh
      await discoverModels(provider, true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should cache separately per provider", async () => {
      const provider1: Provider = {
        id: "provider-1",
        name: "Provider 1",
        type: "anthropic",
        credentials: { apiKey: "key1" }
      };

      const provider2: Provider = {
        id: "provider-2",
        name: "Provider 2",
        type: "anthropic",
        credentials: { apiKey: "key2" }
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ id: "model-1", display_name: "Model 1", type: "model" }]
        })
      });

      // Call for provider 1
      await discoverModels(provider1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Call for provider 2 - should not use provider 1's cache
      await discoverModels(provider2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should return cached results on network error after initial success", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: "cached-model", display_name: "Cached Model", type: "model" }]
          })
        })
        .mockRejectedValueOnce(new Error("Network error"));

      // First call succeeds
      const first = await discoverModels(provider);
      expect(first).toHaveLength(1);

      // Advance past TTL
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Second call fails but returns cached results
      const second = await discoverModels(provider);
      expect(second).toEqual(first);
    });
  });

  describe("Error Handling", () => {
    const provider: Provider = {
      id: "error-test",
      name: "Error Test",
      type: "anthropic",
      credentials: { apiKey: "test-key" }
    };

    it("should handle malformed JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        }
      });

      await expect(discoverModels(provider)).rejects.toThrow();
    });

    it("should handle missing credentials", async () => {
      const noCredsProvider: Provider = {
        id: "no-creds",
        name: "No Creds",
        type: "anthropic",
        credentials: {}
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized"
      });

      await expect(discoverModels(noCredsProvider)).rejects.toThrow();
    });

    it("should handle unexpected response structure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing 'data' field
          models: []
        })
      });

      const models = await discoverModels(provider);
      expect(models).toEqual([]);
    });
  });
});
