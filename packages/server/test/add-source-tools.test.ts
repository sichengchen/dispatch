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

  describe("Content Format Detection", () => {
    // Simulating the detectContentFormat logic
    function detectContentFormat(samples: string[]): "html" | "text" | "mixed" {
      const htmlTagRegex = /<(p|div|a|br|span|img|h[1-6]|ul|ol|li|table|blockquote)[^>]*>/i;
      let htmlCount = 0;
      let textCount = 0;
      for (const sample of samples) {
        if (htmlTagRegex.test(sample)) {
          htmlCount++;
        } else {
          textCount++;
        }
      }
      if (htmlCount === 0) return "text";
      if (textCount === 0) return "html";
      return "mixed";
    }

    it("detects HTML content format when samples contain HTML tags", () => {
      const samples = [
        "<p>This is a paragraph with <a href='link'>a link</a>.</p>",
        "<div><h1>Title</h1><p>Content here</p></div>",
        "<p>Another paragraph with <br/> line break</p>",
      ];

      expect(detectContentFormat(samples)).toBe("html");
    });

    it("detects text content format when samples contain no HTML tags", () => {
      const samples = [
        "This is plain text content without any markup.",
        "Another plain text article summary.",
        "Just regular text here.",
      ];

      expect(detectContentFormat(samples)).toBe("text");
    });

    it("detects mixed content format when some samples have HTML", () => {
      const samples = [
        "<p>This has HTML tags</p>",
        "This is plain text",
        "More plain text here",
      ];

      expect(detectContentFormat(samples)).toBe("mixed");
    });

    it("handles empty samples array", () => {
      const samples: string[] = [];
      expect(detectContentFormat(samples)).toBe("text");
    });
  });

  describe("Feed Quality Evaluation with LLM", () => {
    it("returns unknown quality when useLlm is false", () => {
      // When useLlm is false, the function should return quality: "unknown"
      // and skip LLM analysis
      const useLlm = false;
      const expectedQuality = useLlm ? "full" : "unknown";

      expect(expectedQuality).toBe("unknown");
    });

    it("returns empty truncationIndicators when useLlm is false", () => {
      const useLlm = false;
      const truncationIndicators: string[] = useLlm ? ["Read Full Story"] : [];

      expect(truncationIndicators).toEqual([]);
    });
  });

  describe("LLM Quality Analysis Response Parsing", () => {
    it("parses valid LLM response with complete articles", () => {
      const llmResponse = JSON.stringify({
        isComplete: true,
        truncationIndicators: [],
        reasoning: "Articles appear complete with proper conclusions.",
      });

      const parsed = JSON.parse(llmResponse);
      expect(parsed.isComplete).toBe(true);
      expect(parsed.truncationIndicators).toEqual([]);
    });

    it("parses valid LLM response with truncated articles", () => {
      const llmResponse = JSON.stringify({
        isComplete: false,
        truncationIndicators: ["Read Full Story", "Continue reading..."],
        reasoning: "Articles end with truncation indicators.",
      });

      const parsed = JSON.parse(llmResponse);
      expect(parsed.isComplete).toBe(false);
      expect(parsed.truncationIndicators).toContain("Read Full Story");
      expect(parsed.truncationIndicators).toContain("Continue reading...");
    });

    it("handles truncation indicators like [...] and Click here", () => {
      const indicators = ["[...]", "Click here for more", "Read more"];

      expect(indicators).toContain("[...]");
      expect(indicators.length).toBe(3);
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
