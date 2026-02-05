import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const sources = sqliteTable(
  "sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    url: text("url").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: ["rss", "web"] }).notNull().default("rss"),
    lastFetchedAt: integer("last_fetched_at", { mode: "timestamp_ms" }),
    lastErrorAt: integer("last_error_at", { mode: "timestamp_ms" }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    healthStatus: text("health_status", { enum: ["healthy", "degraded", "dead"] })
      .notNull()
      .default("healthy"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    scrapingStrategy: text("scraping_strategy", { enum: ["rss", "skill"] }),
    // Extraction skill tracking
    hasSkill: integer("has_skill", { mode: "boolean" }).notNull().default(false),
    skillVersion: integer("skill_version").notNull().default(0),
    skillGeneratedAt: integer("skill_generated_at", { mode: "timestamp_ms" }),
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
    summary: text("summary"),
    summaryLong: text("summary_long"),
    tags: text("tags"),
    grade: integer("grade"),
    importancy: integer("importancy"),
    quality: integer("quality"),
    keyPoints: text("key_points"),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false)
  },
  (table) => ({
    urlUnique: uniqueIndex("articles_url_unique").on(table.url),
    sourceIdIdx: index("articles_source_id_idx").on(table.sourceId),
    publishedAtIdx: index("articles_published_at_idx").on(table.publishedAt),
    isReadIdx: index("articles_is_read_idx").on(table.isRead),
    gradeIdx: index("articles_grade_idx").on(table.grade),
  })
);

export const digests = sqliteTable("digests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  generatedAt: integer("generated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  content: text("content").notNull(),
  articleIds: text("article_ids").notNull(),
});
