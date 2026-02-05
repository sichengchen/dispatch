import { beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { db, sources, articles } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { getSkillsDir, skillExists, getSkillPath } from "../src/services/skill-generator";

// Mock skill content with simple selectors
const mockSkillContent = `---
name: mock-blog-extractor
description: Mock skill for testing skill-based scraping.
metadata:
  version: "1"
  generatedAt: "2024-01-01T00:00:00Z"
  sourceId: "0"
  tier: "html"
  homepageUrl: "https://example.com"
---

# Mock Blog Extractor

## List Page

- **Article links**: \`a[href*="post"]\`
- **Max articles**: 5

## Article Page

- **Content selector**: \`.content\`
- **Title selector**: \`h1\`
- **Fallback to Readability**: true
`;

let testSourceId: number | null = null;
let testSkillDir: string | null = null;

beforeAll(() => {
  process.env.DISPATCH_DISABLE_LLM = "1";

  // Create a test source with skill fields
  const result = db
    .insert(sources)
    .values({
      url: `https://example.com/skill-scraper-test-${Date.now()}`,
      name: "Skill Scraper Test",
      type: "web",
      isActive: true,
    })
    .run();
  testSourceId = Number(result.lastInsertRowid);

  // Update hasSkill using raw update
  db.run(`UPDATE sources SET has_skill = 1, skill_version = 1 WHERE id = ${testSourceId}`);

  // Create skill file
  testSkillDir = path.join(getSkillsDir(), String(testSourceId));
  fs.mkdirSync(testSkillDir, { recursive: true });

  // Update skill content with correct source ID
  const skillContent = mockSkillContent.replace(
    'sourceId: "0"',
    `sourceId: "${testSourceId}"`
  );
  fs.writeFileSync(path.join(testSkillDir, "SKILL.md"), skillContent);
});

afterAll(() => {
  // Cleanup test articles and source
  if (testSourceId) {
    db.delete(articles).where(eq(articles.sourceId, testSourceId)).run();
    db.delete(sources).where(eq(sources.id, testSourceId)).run();
  }

  // Cleanup test skill directory
  if (testSkillDir && fs.existsSync(testSkillDir)) {
    fs.rmSync(testSkillDir, { recursive: true, force: true });
  }

  delete process.env.DISPATCH_DISABLE_LLM;
});

describe("Skill-based Scraper", () => {
  describe("skill file integration", () => {
    it("skillExists returns true for source with skill file", () => {
      expect(skillExists(testSourceId as number)).toBe(true);
    });

    it("skillExists returns false for source without skill file", () => {
      expect(skillExists(999999)).toBe(false);
    });

    it("skill file contains expected content", () => {
      const skillPath = getSkillPath(testSourceId as number);
      expect(fs.existsSync(skillPath)).toBe(true);

      const content = fs.readFileSync(skillPath, "utf-8");
      expect(content).toContain("mock-blog-extractor");
      expect(content).toContain(String(testSourceId));
    });

    it("skill file has correct path structure", () => {
      const skillPath = getSkillPath(testSourceId as number);
      expect(skillPath).toContain("sources-skills");
      expect(skillPath).toContain(String(testSourceId));
      expect(skillPath).toMatch(/SKILL\.md$/);
    });
  });
});
