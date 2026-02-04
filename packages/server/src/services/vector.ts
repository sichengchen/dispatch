import fs from "node:fs";
import path from "node:path";
import * as lancedb from "@lancedb/lancedb";
import type { Connection, Table } from "@lancedb/lancedb";
import { db, articles } from "@dispatch/db";
import { eq } from "drizzle-orm";
import { getModelConfig, type LlmConfig, type ProviderId } from "@dispatch/lib";
import { getLlmConfig, getProviderKeys } from "./settings";

const TABLE_NAME = "articles_vectors";
const DEFAULT_MAX_CHARS = 6000;
const MOCK_VECTOR_DIMENSIONS = 96;

let connectionPromise: Promise<Connection> | null = null;
let tablePromise: Promise<Table> | null = null;

function findWorkspaceRoot(startDir: string) {
  let current = startDir;
  for (let i = 0; i < 6; i += 1) {
    if (
      fs.existsSync(path.join(current, "pnpm-workspace.yaml")) ||
      fs.existsSync(path.join(current, "turbo.json"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function ensureDir(targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
}

function getVectorDbPath(): string {
  if (process.env.DISPATCH_VECTOR_PATH) {
    return path.resolve(process.env.DISPATCH_VECTOR_PATH);
  }
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  if (workspaceRoot) {
    return path.join(workspaceRoot, "dispatch.vectors");
  }
  return path.resolve(process.cwd(), "dispatch.vectors");
}

function shouldUseMockEmbedding(configOverride?: LlmConfig): boolean {
  if (process.env.DISPATCH_VECTOR_EMBEDDING_MODE === "mock") return true;
  if (process.env.DISPATCH_DISABLE_LLM === "1") return true;
  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, "embed");
  if (modelConfig.provider === "mock") return true;
  if (configOverride?.models?.length) {
    return configOverride.models.every((model) => model.provider === "mock");
  }
  return false;
}

function hashToken(token: string): number {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildMockEmbedding(text: string, dims = MOCK_VECTOR_DIMENSIONS): number[] {
  const vector = new Array<number>(dims).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const hash = hashToken(token);
    const idx = hash % dims;
    vector[idx] += 1;
  }

  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vector.length; i += 1) {
    vector[i] /= norm;
  }
  return vector;
}

function truncateForEmbedding(text: string): string {
  const maxChars = process.env.DISPATCH_EMBEDDING_MAX_CHARS
    ? Number(process.env.DISPATCH_EMBEDDING_MAX_CHARS)
    : DEFAULT_MAX_CHARS;
  if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function getCatalogEntry(config: LlmConfig, provider: ProviderId, model: string) {
  return config.catalog?.find(
    (entry) => entry.provider === provider && entry.model === model
  );
}

function resolveEmbeddingConfig(configOverride?: LlmConfig) {
  const config = configOverride ?? getLlmConfig();
  const modelConfig = getModelConfig(config, "embed");

  if (modelConfig.provider === "mock") {
    return { mode: "mock" as const };
  }

  if (modelConfig.provider !== "openaiCompatible") {
    throw new Error("Embedding provider must be openaiCompatible or mock.");
  }

  const entry = getCatalogEntry(config, modelConfig.provider, modelConfig.model);
  if (entry?.capabilities && !entry.capabilities.includes("embedding")) {
    throw new Error(
      "Selected embeddings model is not marked for embeddings. Update the model capabilities in Settings."
    );
  }
  const providerKeys = getProviderKeys();
  const apiKey =
    entry?.providerConfig?.apiKey?.trim() || providerKeys.openaiCompatible?.apiKey;
  const baseUrl =
    entry?.providerConfig?.baseUrl?.trim() || providerKeys.openaiCompatible?.baseUrl;
  const normalizedBaseUrl = baseUrl?.replace(/\/$/, "");
  const inferredEndpoint = normalizedBaseUrl ? `${normalizedBaseUrl}/embeddings` : undefined;
  const endpoint =
    process.env.DISPATCH_LLM_EMBEDDING_ENDPOINT?.trim() || inferredEndpoint;

  return {
    mode: "remote" as const,
    model: modelConfig.model,
    endpoint,
    apiKey
  };
}

function extractEmbedding(payload: unknown): number[] | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const data = record.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown> | undefined;
    const embedding = first?.embedding;
    if (Array.isArray(embedding)) return embedding as number[];
  }

  const embedding = record.embedding ?? (record as { output?: unknown }).output;
  if (Array.isArray(embedding)) return embedding as number[];

  return null;
}

async function embedText(text: string, configOverride?: LlmConfig): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (shouldUseMockEmbedding(configOverride)) {
    return buildMockEmbedding(trimmed);
  }

  const resolved = resolveEmbeddingConfig(configOverride);
  if (resolved.mode === "mock") {
    return buildMockEmbedding(trimmed);
  }
  const { endpoint, apiKey, model } = resolved;
  if (!endpoint || !model) {
    throw new Error(
      "Embedding endpoint/model not configured. Set an Embeddings model + base URL in Settings, or set DISPATCH_LLM_EMBEDDING_ENDPOINT and DISPATCH_LLM_EMBEDDING_MODEL."
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      input: truncateForEmbedding(trimmed)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding endpoint error (${response.status}): ${errorText}`);
  }

  const payload = (await response.json()) as unknown;
  const embedding = extractEmbedding(payload);
  if (!embedding) {
    throw new Error("Embedding endpoint returned no embedding data");
  }

  return embedding;
}

async function getConnection(): Promise<Connection> {
  if (!connectionPromise) {
    const vectorPath = getVectorDbPath();
    ensureDir(vectorPath);
    connectionPromise = lancedb.connect(vectorPath);
  }
  return connectionPromise;
}

async function getTable(initialRow?: Record<string, unknown>): Promise<Table | null> {
  if (tablePromise) return tablePromise;
  const connection = await getConnection();
  const tables = await connection.tableNames();
  if (tables.includes(TABLE_NAME)) {
    tablePromise = connection.openTable(TABLE_NAME);
    return tablePromise;
  }
  if (!initialRow) return null;
  tablePromise = connection.createTable(TABLE_NAME, [initialRow]);
  return tablePromise;
}

function buildEmbeddingText(article: {
  title: string;
  cleanContent?: string | null;
  summary?: string | null;
}): string {
  const parts = [article.title, article.summary, article.cleanContent].filter(
    (part) => typeof part === "string" && part.trim().length > 0
  ) as string[];
  return parts.join("\n\n").trim();
}

export async function upsertArticleVector(
  article: {
    id: number;
    sourceId: number;
    title: string;
    url: string;
    cleanContent?: string | null;
    summary?: string | null;
  },
  configOverride?: LlmConfig
): Promise<void> {
  const content = buildEmbeddingText(article);
  if (!content) return;

  const vector = await embedText(content, configOverride);
  if (!vector) return;

  const record = {
    article_id: article.id,
    source_id: article.sourceId,
    title: article.title,
    url: article.url,
    vector,
    updated_at: Date.now()
  };

  const table = await getTable(record);
  if (!table) return;

  await table
    .mergeInsert("article_id")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute([record]);
}

export async function getRelatedArticles(
  articleId: number,
  topK = 5,
  configOverride?: LlmConfig
): Promise<number[]> {
  if (topK <= 0) return [];

  const article = db
    .select({
      id: articles.id,
      title: articles.title,
      summary: articles.summary,
      cleanContent: articles.cleanContent
    })
    .from(articles)
    .where(eq(articles.id, articleId))
    .get();

  if (!article) return [];
  const content = buildEmbeddingText(article);
  if (!content) return [];

  const vector = await embedText(content, configOverride);
  if (!vector) return [];

  const table = await getTable();
  if (!table) return [];

  const rows = await table
    .search(vector)
    .select(["article_id", "_distance"])
    .limit(topK + 1)
    .toArray();

  const ids = rows
    .map((row) => Number((row as { article_id?: number }).article_id))
    .filter((id) => Number.isFinite(id) && id !== articleId);

  return ids.slice(0, topK);
}

export async function resetVectorStore(): Promise<void> {
  if (tablePromise) {
    const table = await tablePromise;
    table.close();
  }
  if (connectionPromise) {
    const connection = await connectionPromise;
    connection.close();
  }
  connectionPromise = null;
  tablePromise = null;
}
