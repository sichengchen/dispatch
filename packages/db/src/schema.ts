import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["rss", "web"] }).notNull().default("rss"),
    lastFetchedAt: integer("last_fetched_at", { mode: "timestamp_ms" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
  },
  (table) => ({
    urlUnique: uniqueIndex("sources_url_unique").on(table.url)
  })
);

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    rawHtml: text("raw_html"),
    cleanContent: text("clean_content"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false)
  },
  (table) => ({
    urlUnique: uniqueIndex("articles_url_unique").on(table.url)
  })
);
