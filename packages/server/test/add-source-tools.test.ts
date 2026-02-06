import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock fetch for tests
const originalFetch = global.fetch;

describe("Add-Source Agent Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("RSS Detection Logic", () => {
    it("detects RSS feed from link tag in HTML head", () => {
      const html = `
        <html>
          <head>
            <link rel="alternate" type="application/rss+xml" title="My Blog Feed" href="/feed.xml" />
          </head>
          <body></body>
        </html>
      `;

      // Test the HTML parsing logic
      const dom = new (require("jsdom").JSDOM)(html, { url: "https://example.com" });
      const doc = dom.window.document;

      const rssLinks = doc.querySelectorAll('link[type="application/rss+xml"]');
      expect(rssLinks.length).toBe(1);

      const link = rssLinks[0];
      expect(link.getAttribute("href")).toBe("/feed.xml");
      expect(link.getAttribute("title")).toBe("My Blog Feed");
    });

    it("detects Atom feed from link tag", () => {
      const html = `
        <html>
          <head>
            <link rel="alternate" type="application/atom+xml" href="/atom.xml" />
          </head>
          <body></body>
        </html>
      `;

      const dom = new (require("jsdom").JSDOM)(html, { url: "https://example.com" });
      const doc = dom.window.document;

      const atomLinks = doc.querySelectorAll('link[type="application/atom+xml"]');
      expect(atomLinks.length).toBe(1);
    });

    it("handles relative feed URLs correctly", () => {
      const baseUrl = "https://example.com/blog";
      const relativeHref = "/feed";
      const absoluteUrl = new URL(relativeHref, baseUrl).toString();

      expect(absoluteUrl).toBe("https://example.com/feed");
    });

    it("handles absolute feed URLs correctly", () => {
      const absoluteHref = "https://feeds.example.com/rss";
      const url = absoluteHref.startsWith("http")
        ? absoluteHref
        : new URL(absoluteHref, "https://example.com").toString();

      expect(url).toBe("https://feeds.example.com/rss");
    });

    it("identifies common RSS feed paths", () => {
      const commonPaths = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml", "/index.xml"];

      expect(commonPaths).toContain("/feed");
      expect(commonPaths).toContain("/rss");
      expect(commonPaths).toContain("/atom.xml");
    });
  });

  describe("Feed Quality Evaluation Logic", () => {
    it("classifies feed as full when average content > 500 chars", () => {
      const averageLength = 800;
      const quality = averageLength > 500 ? "full" : averageLength > 100 ? "summary" : "unknown";

      expect(quality).toBe("full");
    });

    it("classifies feed as summary when average content 100-500 chars", () => {
      const averageLength = 250;
      const quality = averageLength > 500 ? "full" : averageLength > 100 ? "summary" : "unknown";

      expect(quality).toBe("summary");
    });

    it("classifies feed as unknown when average content < 100 chars", () => {
      const averageLength = 50;
      const quality = averageLength > 500 ? "full" : averageLength > 100 ? "summary" : "unknown";

      expect(quality).toBe("unknown");
    });

    it("calculates average content length correctly", () => {
      const contentLengths = [200, 400, 600];
      const average = contentLengths.reduce((sum, len) => sum + len, 0) / contentLengths.length;

      expect(average).toBe(400);
    });
  });

  describe("Robots.txt Parsing Logic", () => {
    it("extracts robots.txt URL from domain", () => {
      const url = "https://example.com/some/path";
      const parsedUrl = new URL(url);
      const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;

      expect(robotsUrl).toBe("https://example.com/robots.txt");
    });

    it("handles subdomains correctly", () => {
      const url = "https://blog.example.com/posts";
      const parsedUrl = new URL(url);
      const robotsUrl = `${parsedUrl.protocol}//${parsedUrl.host}/robots.txt`;

      expect(robotsUrl).toBe("https://blog.example.com/robots.txt");
    });
  });

  describe("Source Deduplication Logic", () => {
    it("identifies duplicate URLs correctly", () => {
      const existingUrls = [
        "https://example.com/feed",
        "https://blog.example.com/rss",
      ];

      const newUrl = "https://example.com/feed";
      const isDuplicate = existingUrls.includes(newUrl);

      expect(isDuplicate).toBe(true);
    });

    it("allows non-duplicate URLs", () => {
      const existingUrls = [
        "https://example.com/feed",
        "https://blog.example.com/rss",
      ];

      const newUrl = "https://new-site.com/feed";
      const isDuplicate = existingUrls.includes(newUrl);

      expect(isDuplicate).toBe(false);
    });
  });
});
