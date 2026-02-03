import { beforeAll, describe, expect, it } from "vitest";

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

async function trpcQuery(pathname: string, input: unknown) {
  const res = await app.request(buildQueryUrl(pathname, input), {
    method: "GET"
  });
  const json = await res.json();
  return { res, json, data: unwrapResult(json) };
}

async function trpcMutation(pathname: string, input: unknown) {
  const res = await app.request(`/trpc/${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input ?? null)
  });
  const json = await res.json();
  return { res, json, data: unwrapResult(json) };
}

const state: { addedSourceId?: number } = {};

describe("Backend — Hono + tRPC", () => {
  it("HealthCheck: GET /health", async () => {
    const res = await app.request("/health");
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("Sources.Add: sources.add with valid payload", async () => {
    const addedSourceUrl = `https://example.com/rss/${Date.now()}`;
    const { res, data } = await trpcMutation("sources.add", {
      url: addedSourceUrl,
      name: "Test Source",
      type: "rss"
    });

    expect(res.ok).toBe(true);
    expect(data?.id).toBeTruthy();
    expect(data.url).toBe(addedSourceUrl);

    state.addedSourceId = data.id;
  });

  it("Sources.Add.Validation: sources.add invalid payload (missing url)", async () => {
    const { res, json } = await trpcMutation("sources.add", {
      name: "Bad Source",
      type: "rss"
    });

    expect(res.ok).toBe(false);
    expect(Boolean(json?.error)).toBe(true);
  });

  it("Sources.List: sources.list after seeding", async () => {
    const { res, data } = await trpcQuery("sources.list", null);
    expect(res.ok).toBe(true);
    expect((data ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("Sources.Delete.NotFound: sources.delete with non-existent ID", async () => {
    const { res, json } = await trpcMutation("sources.delete", { id: 999999 });
    expect(res.ok).toBe(false);
    expect(json?.error?.data?.code).toBe("NOT_FOUND");
  });

  it("Articles.List.Filter: articles.list with sourceId filter", async () => {
    const { res, data } = await trpcQuery("articles.list", {
      sourceId: 1,
      page: 1,
      pageSize: 20
    });

    expect(res.ok).toBe(true);
    expect((data ?? []).length).toBeGreaterThanOrEqual(1);
    expect((data ?? []).every((article: any) => article.sourceId === 1)).toBe(
      true
    );
  });

  it("Articles.List.Pagination: articles.list pagination — page 1 and page 2", async () => {
    const res1 = await trpcQuery("articles.list", { page: 1, pageSize: 2 });
    const res2 = await trpcQuery("articles.list", { page: 2, pageSize: 2 });

    expect(res1.res.ok && res2.res.ok).toBe(true);

    const page1 = res1.data ?? [];
    const page2 = res2.data ?? [];

    expect(page1.length).toBeLessThanOrEqual(2);
    expect(page2.length).toBeLessThanOrEqual(2);

    const ids1 = new Set(page1.map((article: any) => article.id));
    const overlap = page2.some((article: any) => ids1.has(article.id));
    expect(overlap).toBe(false);
  });

  it("Articles.MarkRead: articles.markRead then re-fetch", async () => {
    const allRes = await trpcQuery("articles.list", { page: 1, pageSize: 20 });
    const all = allRes.data ?? [];
    const target = all.find((article: any) => article.isRead === false) ?? all[0];

    expect(target).toBeTruthy();

    const markRes = await trpcMutation("articles.markRead", { id: target.id });
    expect(markRes.res.ok).toBe(true);

    const afterRes = await trpcQuery("articles.list", { page: 1, pageSize: 50 });
    const after = afterRes.data ?? [];
    const updated = after.find((article: any) => article.id === target.id);
    expect(updated?.isRead).toBe(true);
  });

  it("cleanup: delete added source", async () => {
    if (!state.addedSourceId) {
      expect(true).toBe(true);
      return;
    }

    const { res } = await trpcMutation("sources.delete", { id: state.addedSourceId });
    expect(res.ok).toBe(true);
  });
});
