import { db, sources, articles } from "./index.js";

const now = new Date();

const seedSources = [
  {
    id: 1,
    url: "https://example.com/rss",
    name: "Example RSS",
    type: "rss" as const,
    isActive: true,
    createdAt: now
  },
  {
    id: 2,
    url: "https://blog.example.com",
    name: "Example Blog",
    type: "web" as const,
    isActive: true,
    createdAt: now
  }
];

const seedArticles = [
  {
    id: 1,
    sourceId: 1,
    title: "Hello Dispatch",
    url: "https://example.com/articles/hello-dispatch",
    cleanContent: "Welcome to Dispatch. This is a seeded article.",
    summary: "A seeded welcome article for Dispatch.",
    summaryLong: "A seeded welcome article for Dispatch.",
    publishedAt: new Date(now.getTime() - 1000 * 60 * 60),
    fetchedAt: now,
    isRead: false
  },
  {
    id: 2,
    sourceId: 1,
    title: "Second Seed",
    url: "https://example.com/articles/second-seed",
    cleanContent: "Another seeded article for testing.",
    summary: "A short seeded follow-up article for testing.",
    summaryLong: "A short seeded follow-up article for testing.",
    publishedAt: new Date(now.getTime() - 1000 * 60 * 30),
    fetchedAt: now,
    isRead: false
  },
  {
    id: 3,
    sourceId: 2,
    title: "Web Source Seed",
    url: "https://blog.example.com/posts/web-source-seed",
    cleanContent: "Seeded article from a web source.",
    summary: "Seeded article from a web source.",
    summaryLong: "Seeded article from a web source.",
    publishedAt: new Date(now.getTime() - 1000 * 60 * 10),
    fetchedAt: now,
    isRead: true
  }
];

function seed() {
  db.insert(sources).values(seedSources).onConflictDoNothing().run();
  db.insert(articles).values(seedArticles).onConflictDoNothing().run();

  console.log("Seed complete.");
}

seed();
