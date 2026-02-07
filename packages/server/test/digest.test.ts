import { beforeAll, describe, expect, it } from "vitest";
import { db, digests } from "@dispatch/db";
import { desc } from "drizzle-orm";

function unwrapResult(json: any) {
  return json?.result?.data?.json ?? json?.result?.data;
}

function buildQueryUrl(pathname: string, input: unknown) {
  if (input === undefined || input === null) return `/trpc/${pathname}`;
  const encoded = encodeURIComponent(JSON.stringify(input));
  return `/trpc/${pathname}?input=${encoded}`;
}

let app: typeof import("../src/app").app;

beforeAll(async () => {
  ({ app } = await import("../src/app"));
});

async function trpcQuery(pathname: string, input?: unknown) {
  const res = await app.request(buildQueryUrl(pathname, input), {
    method: "GET",
  });
  const json = await res.json();
  return { res, json, data: unwrapResult(json) };
}

async function trpcMutation(pathname: string, input?: unknown) {
  const res = await app.request(`/trpc/${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input ?? null),
  });
  const json = await res.json();
  return { res, json, data: unwrapResult(json) };
}

describe("Digest tRPC routes", () => {
  it("digests.latest returns null when no digests exist", async () => {
    // Clear all digests for a clean test
    db.delete(digests).run();

    const { res, data } = await trpcQuery("digests.latest");
    expect(res.status).toBe(200);
    expect(data).toBeNull();
  });

  it("digests.latest returns the most recent digest after insert", async () => {
    db.insert(digests)
      .values({
        generatedAt: new Date(Date.now() - 60000),
        content: "Older digest",
        articleIds: "[1,2]",
      })
      .run();
    db.insert(digests)
      .values({
        generatedAt: new Date(),
        content: "Newest digest content",
        articleIds: "[3,4,5]",
      })
      .run();

    const { res, data } = await trpcQuery("digests.latest");
    expect(res.status).toBe(200);
    expect(data).not.toBeNull();
    expect(data.content).toBe("Newest digest content");
    expect(data.articleIds).toEqual([3, 4, 5]);
  });

  it("digests.list returns digests in descending order", async () => {
    const { res, data } = await trpcQuery("digests.list", { limit: 10 });
    expect(res.status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);
    // Verify descending order
    for (let i = 1; i < data.length; i++) {
      expect(new Date(data[i - 1].generatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(data[i].generatedAt).getTime()
      );
    }
  });

  it("digests.list respects limit", async () => {
    const { data } = await trpcQuery("digests.list", { limit: 1 });
    expect(data.length).toBe(1);
  });
});

describe("Digest generation (mock LLM)", () => {
  it("generateDigest handles empty article set gracefully", async () => {
    // With no recent high-grade articles, it should return a "no notable articles" message
    const { generateDigest } = await import("../src/services/digest");
    const result = await generateDigest({ hoursBack: 0 });
    expect(result.content).toContain("No notable articles");
    expect(result.articleIds).toEqual([]);
    expect(result.id).toBeGreaterThan(0);

    // Verify it was persisted
    const row = db
      .select()
      .from(digests)
      .orderBy(desc(digests.generatedAt))
      .limit(1)
      .get();
    expect(row).not.toBeNull();
    expect(row!.content).toContain("No notable articles");
  });
});
