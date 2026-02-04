import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { db, articles, sources } from "@dispatch/db";
import { eq } from "drizzle-orm";
import {
  getRelatedArticles,
  resetVectorStore,
  upsertArticleVector
} from "../src/services/vector";

let vectorPath = "";
let testCounter = 0;

async function resetVectorDir() {
  if (vectorPath) {
    fs.rmSync(vectorPath, { recursive: true, force: true });
    fs.mkdirSync(vectorPath, { recursive: true });
  }
  await resetVectorStore();
}

function insertSource(name: string) {
  testCounter += 1;
  const uid = `${Date.now()}-${testCounter}`;
  const result = db
    .insert(sources)
    .values({
      name,
      url: `https://vector-test-${uid}.example.com/feed.xml`,
      type: "rss"
    })
    .run();
  return Number(result.lastInsertRowid);
}

function insertArticle(sourceId: number, title: string, content: string) {
  testCounter += 1;
  const uid = `${Date.now()}-${testCounter}`;
  const result = db
    .insert(articles)
    .values({
      sourceId,
      title,
      url: `https://vector-test.example.com/${uid}`,
      cleanContent: content,
      fetchedAt: new Date(),
      isRead: false
    })
    .run();
  return Number(result.lastInsertRowid);
}

function loadArticle(articleId: number) {
  const row = db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .get();
  if (!row) {
    throw new Error("Article not found in test fixture");
  }
  return row;
}

beforeAll(async () => {
  vectorPath = fs.mkdtempSync(path.join(os.tmpdir(), "dispatch-vectors-"));
  process.env.DISPATCH_VECTOR_PATH = vectorPath;
  process.env.DISPATCH_VECTOR_EMBEDDING_MODE = "mock";
  await resetVectorStore();
});

beforeEach(async () => {
  await resetVectorDir();
});

afterAll(async () => {
  if (vectorPath) {
    fs.rmSync(vectorPath, { recursive: true, force: true });
  }
  await resetVectorStore();
});

describe("Vectorization (mock embeddings)", () => {
  it("returns related article ids based on embedded similarity", async () => {
    const sourceId = insertSource("Vector Source");
    const articleAId = insertArticle(
      sourceId,
      "AI in Finance",
      "AI models are transforming finance with better risk analysis and automation."
    );
    const articleBId = insertArticle(
      sourceId,
      "AI in Healthcare",
      "AI models are improving diagnostics and patient outcomes in healthcare."
    );
    const articleCId = insertArticle(
      sourceId,
      "Sports Recap",
      "The local team won a close game in overtime with a last-second shot."
    );

    await upsertArticleVector(loadArticle(articleAId));
    await upsertArticleVector(loadArticle(articleBId));
    await upsertArticleVector(loadArticle(articleCId));

    const related = await getRelatedArticles(articleAId, 2);

    expect(related).toContain(articleBId);
    expect(related).not.toContain(articleAId);
  });

  it("returns empty when only one article is indexed", async () => {
    const sourceId = insertSource("Solo Source");
    const articleId = insertArticle(
      sourceId,
      "Solo Article",
      "A single piece of content with no peers in the vector store."
    );

    await upsertArticleVector(loadArticle(articleId));

    const related = await getRelatedArticles(articleId, 5);
    expect(related).toEqual([]);
  });
});
