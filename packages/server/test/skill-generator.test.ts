import { beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import {
  parseSkillFile,
  getSkillPath,
  getSkillsDir,
  skillExists,
  type SkillGenerationOptions,
  type SkillGenerationResult,
} from "../src/services/skill-generator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sample SKILL.md content for testing
const sampleSkillContent = `---
name: test-site-extractor
description: Extracts articles from Test Site.
metadata:
  version: "1"
  generatedAt: "2024-01-01T00:00:00Z"
  sourceId: "999"
  tier: "html"
  homepageUrl: "https://example.com"
---

# Test Site Extractor

## List Page

To find article links on the homepage:
1. Look for links in the main content area
2. Article links are typically in \`.article-list a\` elements

### Selectors
- **Article links**: \`article a[href]\`
- **Title**: \`.article-title\`
- **Date**: \`time.published\`

## Article Page

### Content Extraction
- **Content selector**: \`.article-body\`
- **Title selector**: \`h1.title\`
- **Fallback**: Use Readability if selectors fail
`;

let testSourceId: number | null = null;
let testSkillDir: string | null = null;

beforeAll(() => {
  // Create a test source
  const result = db
    .insert(sources)
    .values({
      url: `https://example.com/test-skill-${Date.now()}`,
      name: "Test Skill Site",
      type: "web",
      isActive: true,
    })
    .run();
  testSourceId = Number(result.lastInsertRowid);

  // Create a test skill file
  testSkillDir = path.join(getSkillsDir(), String(testSourceId));
  fs.mkdirSync(testSkillDir, { recursive: true });
  fs.writeFileSync(path.join(testSkillDir, "SKILL.md"), sampleSkillContent);
});

afterAll(() => {
  // Cleanup test source
  if (testSourceId) {
    db.delete(sources).where(eq(sources.id, testSourceId)).run();
  }

  // Cleanup test skill directory
  if (testSkillDir && fs.existsSync(testSkillDir)) {
    fs.rmSync(testSkillDir, { recursive: true, force: true });
  }
});

describe("Skill Generator", () => {
  describe("getSkillPath", () => {
    it("returns correct path for source ID", () => {
      const skillPath = getSkillPath(testSourceId as number);
      expect(skillPath).toContain("sources-skills");
      expect(skillPath).toContain(String(testSourceId));
      expect(skillPath).toMatch(/SKILL\.md$/);
    });
  });

  describe("skillExists", () => {
    it("returns true for existing skill", () => {
      expect(skillExists(testSourceId as number)).toBe(true);
    });

    it("returns false for non-existent skill", () => {
      expect(skillExists(999999)).toBe(false);
    });
  });

  describe("parseSkillFile", () => {
    it("parses SKILL.md frontmatter correctly", async () => {
      const skillPath = getSkillPath(testSourceId as number);
      const skill = await parseSkillFile(skillPath);

      expect(skill.name).toBe("test-site-extractor");
      expect(skill.description).toContain("Test Site");
      expect(skill.metadata.tier).toBe("html");
      expect(skill.metadata.sourceId).toBe("999");
      expect(skill.metadata.homepageUrl).toBe("https://example.com");
    });

    it("extracts extraction config from body", async () => {
      const skillPath = getSkillPath(testSourceId as number);
      const skill = await parseSkillFile(skillPath);

      expect(skill.extraction).toBeDefined();
      expect(skill.extraction.tier).toBe("html");
      expect(skill.extraction.listPage).toBeDefined();
    });

    it("throws error for invalid skill file", async () => {
      const invalidPath = path.join(getSkillsDir(), "invalid", "SKILL.md");
      fs.mkdirSync(path.dirname(invalidPath), { recursive: true });
      fs.writeFileSync(invalidPath, "no frontmatter here");

      await expect(parseSkillFile(invalidPath)).rejects.toThrow();

      fs.rmSync(path.dirname(invalidPath), { recursive: true, force: true });
    });
  });

  describe("SkillGenerationOptions", () => {
    it("has correct type structure", () => {
      // Type-level test: verify the options interface structure
      const optionsWithRobotsTxt: SkillGenerationOptions = {
        robotsTxt: "User-agent: *\nDisallow: /private/",
      };
      expect(optionsWithRobotsTxt.robotsTxt).toBeDefined();
      expect(optionsWithRobotsTxt.configOverride).toBeUndefined();

      const optionsEmpty: SkillGenerationOptions = {};
      expect(optionsEmpty.robotsTxt).toBeUndefined();

      const optionsBoth: SkillGenerationOptions = {
        robotsTxt: "User-agent: *\nAllow: /",
        configOverride: {
          routing: {},
        },
      };
      expect(optionsBoth.robotsTxt).toBeDefined();
      expect(optionsBoth.configOverride).toBeDefined();
    });

    it("allows optional robotsTxt parameter", () => {
      // Verify robotsTxt can be undefined
      const options: SkillGenerationOptions = {};
      expect(options.robotsTxt).toBeUndefined();

      // Verify robotsTxt can be a string
      const optionsWithRobots: SkillGenerationOptions = {
        robotsTxt: "User-agent: *\nDisallow: /admin/\nDisallow: /api/",
      };
      expect(optionsWithRobots.robotsTxt).toContain("Disallow: /admin/");
    });
  });
});
