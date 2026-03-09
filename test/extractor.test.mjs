import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { _buildGraph } from "../src/extractor.mjs";

describe("extractor buildGraph", () => {
  const BASE_DATA = {
    url: "https://example.com",
    title: "Test Page",
    description: "A test page",
    siteName: "example.com",
    pageType: "article",
    author: "Test Author",
    authorAvatar: "https://example.com/avatar.jpg",
    section: "Tech",
    tags: ["javascript", "ai"],
    headings: [
      { level: 1, text: "Main Title", children: [
        { level: 2, text: "Subtitle", children: [] },
      ]},
    ],
    breadcrumbs: [{ text: "Home", href: "/" }, { text: "Tech", href: "/tech" }],
    media: {
      heroImage: { src: "https://example.com/hero.jpg", alt: "Hero" },
      images: [
        { src: "https://example.com/photo.jpg", alt: "Photo", isHero: false },
      ],
      videos: [
        { src: "https://youtube.com/embed/abc123", type: "youtube", thumbnail: "https://img.youtube.com/vi/abc123/hqdefault.jpg" },
      ],
    },
    links: {
      internal: [],
      external: { "github.com": [{ text: "Repo", href: "https://github.com/test" }] },
    },
    codeBlocks: [{ code: "console.log('hello')", language: "javascript" }],
    blockquotes: [{ text: "To be or not to be", cite: "Shakespeare" }],
    tables: [{ headers: ["Name", "Value"], rows: [["A", "1"]], rowCount: 1 }],
    audio: [{ src: "https://example.com/podcast.mp3", type: "audio" }],
    lede: "This is the first paragraph of the article.",
    readingTimeMin: 5,
  };

  it("creates page node with enriched data", () => {
    const { nodes } = _buildGraph(BASE_DATA);
    const page = nodes.find((n) => n.id === "page");
    assert.ok(page);
    assert.equal(page.data.lede, "This is the first paragraph of the article.");
    assert.equal(page.data.readingTimeMin, 5);
    assert.equal(page.data.authorAvatar, "https://example.com/avatar.jpg");
  });

  it("creates blockquote nodes", () => {
    const { nodes } = _buildGraph(BASE_DATA);
    const quote = nodes.find((n) => n.mediaKind === "quote");
    assert.ok(quote, "Should have a quote node");
    assert.ok(quote.text.includes("To be or not to be"));
  });

  it("creates table nodes", () => {
    const { nodes } = _buildGraph(BASE_DATA);
    const table = nodes.find((n) => n.mediaKind === "table");
    assert.ok(table, "Should have a table node");
    assert.ok(table.label.includes("Table"));
  });

  it("creates audio nodes", () => {
    const { nodes } = _buildGraph(BASE_DATA);
    const audio = nodes.find((n) => n.mediaKind === "audio");
    assert.ok(audio, "Should have an audio node");
    assert.ok(audio.audioUrl);
  });

  it("creates code nodes", () => {
    const { nodes } = _buildGraph(BASE_DATA);
    const code = nodes.find((n) => n.mediaKind === "code");
    assert.ok(code, "Should have a code node");
    assert.equal(code.code, "console.log('hello')");
  });

  it("creates video nodes with thumbnails", () => {
    const { nodes } = _buildGraph(BASE_DATA);
    const vid = nodes.find((n) => n.mediaKind === "video");
    assert.ok(vid, "Should have a video node");
    assert.ok(vid.data.thumbnail);
  });

  it("respects 100 node cap", () => {
    const bigData = {
      ...BASE_DATA,
      headings: Array.from({ length: 50 }, (_, i) => ({
        level: 2, text: `Heading ${i}`, children: [],
      })),
      media: {
        ...BASE_DATA.media,
        images: Array.from({ length: 30 }, (_, i) => ({
          src: `https://example.com/img${i}.jpg`, alt: `Image ${i}`, isHero: false,
        })),
      },
    };
    const { nodes } = _buildGraph(bigData);
    assert.ok(nodes.length <= 100);
  });

  it("links all nodes back to page or parent", () => {
    const { nodes, links } = _buildGraph(BASE_DATA);
    for (const link of links) {
      assert.ok(nodes.find((n) => n.id === link.source), `Missing source: ${link.source}`);
      assert.ok(nodes.find((n) => n.id === link.target), `Missing target: ${link.target}`);
    }
  });
});
