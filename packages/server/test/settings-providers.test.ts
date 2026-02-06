import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadSettings, saveSettings, getProviders } from "../src/services/settings";
import type { Settings, Provider } from "@dispatch/lib";

describe("Settings with Providers", () => {
  let tempDir: string;
  let originalSettingsPath: string | undefined;

  beforeEach(async () => {
    // Create temp directory for test settings
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dispatch-test-"));
    originalSettingsPath = process.env.DISPATCH_SETTINGS_PATH;
    process.env.DISPATCH_SETTINGS_PATH = path.join(tempDir, "dispatch.settings.json");
  });

  afterEach(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
    if (originalSettingsPath) {
      process.env.DISPATCH_SETTINGS_PATH = originalSettingsPath;
    } else {
      delete process.env.DISPATCH_SETTINGS_PATH;
    }
  });

  describe("Provider Persistence", () => {
    it("should save and load providers correctly", () => {
      const providers: Provider[] = [
        {
          id: "anthropic-1",
          name: "Anthropic",
          type: "anthropic",
          credentials: {
            apiKey: "sk-ant-test-123"
          }
        },
        {
          id: "openai-1",
          name: "OpenAI",
          type: "openai-compatible",
          credentials: {
            apiKey: "sk-test-456",
            baseUrl: "https://api.openai.com/v1"
          }
        }
      ];

      const settings: Settings = {
        providers,
        models: {
          assignment: [],
          catalog: []
        },
        grading: {
          weights: {
            importancy: 1.0,
            quality: 0.8,
            interest: 0.6,
            source: 0.4
          }
        }
      };

      // Save settings
      saveSettings(settings);

      // Load and verify
      const loaded = loadSettings();
      expect(loaded.providers).toEqual(providers);
      expect(loaded.providers).toHaveLength(2);
      expect(loaded.providers[0].credentials?.apiKey).toBe("sk-ant-test-123");
      expect(loaded.providers[1].credentials?.baseUrl).toBe("https://api.openai.com/v1");
    });

    it("should handle empty providers array", () => {
      const settings: Settings = {
        providers: [],
        models: {
          assignment: [],
          catalog: []
        }
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.providers).toEqual([]);
    });

    it("should default to empty providers array when not present", () => {
      // Save settings without providers field
      const settingsWithoutProviders = {
        models: {
          assignment: [],
          catalog: []
        }
      };

      const settingsPath = process.env.DISPATCH_SETTINGS_PATH!;
      require("fs").writeFileSync(
        settingsPath,
        JSON.stringify(settingsWithoutProviders, null, 2)
      );

      const loaded = loadSettings();
      expect(loaded.providers).toEqual([]);
    });
  });

  describe("Provider-Model Relationship", () => {
    it("should link catalog entries to providers via providerId", () => {
      const providers: Provider[] = [
        {
          id: "provider-123",
          name: "Test Provider",
          type: "anthropic",
          credentials: { apiKey: "test-key" }
        }
      ];

      const settings: Settings = {
        providers,
        models: {
          assignment: [
            { task: "summarize", modelId: "model-1" }
          ],
          catalog: [
            {
              id: "model-1",
              providerId: "provider-123",
              model: "claude-3-sonnet",
              label: "Claude 3 Sonnet",
              capabilities: ["chat"]
            }
          ]
        }
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.models.catalog[0].providerId).toBe("provider-123");
      expect(loaded.providers[0].id).toBe("provider-123");
    });

    it("should handle orphaned models (providerId with no matching provider)", () => {
      const settings: Settings = {
        providers: [
          {
            id: "existing-provider",
            name: "Existing",
            type: "anthropic",
            credentials: { apiKey: "key" }
          }
        ],
        models: {
          assignment: [],
          catalog: [
            {
              id: "orphan-model",
              providerId: "non-existent-provider",
              model: "test-model",
              label: "Orphan Model",
              capabilities: ["chat"]
            }
          ]
        }
      };

      saveSettings(settings);
      const loaded = loadSettings();

      // Orphan model should still be saved
      expect(loaded.models.catalog[0].providerId).toBe("non-existent-provider");

      // But the provider won't exist
      const provider = loaded.providers.find(p => p.id === "non-existent-provider");
      expect(provider).toBeUndefined();
    });
  });

  describe("Migration Compatibility", () => {
    it("should load old settings format without providers", () => {
      const oldSettings = {
        models: {
          assignment: [
            { task: "summarize", modelId: "model-1" }
          ],
          catalog: [
            {
              id: "model-1",
              model: "claude-3-sonnet",
              label: "Claude 3 Sonnet",
              capabilities: ["chat"]
            }
          ]
        },
        grading: {
          weights: {
            importancy: 1.0,
            quality: 1.0,
            interest: 1.0,
            source: 1.0
          }
        }
      };

      const settingsPath = process.env.DISPATCH_SETTINGS_PATH!;
      require("fs").writeFileSync(
        settingsPath,
        JSON.stringify(oldSettings, null, 2)
      );

      const loaded = loadSettings();

      // Should have empty providers array
      expect(loaded.providers).toEqual([]);

      // Models should still load
      expect(loaded.models.catalog).toHaveLength(1);
      expect(loaded.models.catalog[0].id).toBe("model-1");
    });

    it("should preserve backward compatibility with models without providerId", () => {
      const settings: Settings = {
        providers: [],
        models: {
          assignment: [],
          catalog: [
            {
              id: "legacy-model",
              model: "gpt-4",
              label: "Legacy GPT-4",
              capabilities: ["chat"]
              // No providerId
            }
          ]
        }
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.models.catalog[0]).toBeDefined();
      expect(loaded.models.catalog[0].providerId).toBeUndefined();
    });
  });

  describe("Provider Credentials Security", () => {
    it("should persist API keys as plain text (user manages security)", () => {
      const provider: Provider = {
        id: "secure-test",
        name: "Secure Test",
        type: "anthropic",
        credentials: {
          apiKey: "sensitive-api-key-12345"
        }
      };

      saveSettings({
        providers: [provider],
        models: { assignment: [], catalog: [] }
      });

      // Read raw file to verify storage
      const settingsPath = process.env.DISPATCH_SETTINGS_PATH!;
      const rawContent = require("fs").readFileSync(settingsPath, "utf-8");
      const parsed = JSON.parse(rawContent);

      expect(parsed.providers[0].credentials.apiKey).toBe("sensitive-api-key-12345");
    });
  });

  describe("getProviders Helper", () => {
    it("should return providers from settings", () => {
      const providers: Provider[] = [
        {
          id: "test-1",
          name: "Test Provider 1",
          type: "anthropic",
          credentials: { apiKey: "key1" }
        },
        {
          id: "test-2",
          name: "Test Provider 2",
          type: "openai-compatible",
          credentials: { apiKey: "key2", baseUrl: "https://api.test.com" }
        }
      ];

      saveSettings({
        providers,
        models: { assignment: [], catalog: [] }
      });

      const loaded = getProviders();
      expect(loaded).toHaveLength(2);
      expect(loaded[0].id).toBe("test-1");
      expect(loaded[1].id).toBe("test-2");
    });

    it("should return empty array when no providers", () => {
      saveSettings({
        providers: [],
        models: { assignment: [], catalog: [] }
      });

      const providers = getProviders();
      expect(providers).toEqual([]);
    });
  });
});
