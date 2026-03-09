import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDocument, validate, XRAI_VERSION } from "../src/server/xrai-format/schema.mjs";
import { serialize, deserialize, toShareURL, fromShareURL } from "../src/server/xrai-format/serialize.mjs";

describe("xrai-format", () => {
  const source = { url: "https://example.com", title: "Example" };
  const graphData = {
    nodes: [
      { id: "n1", label: "Page", type: "page", ring: 0 },
      { id: "n2", label: "Photo", type: "media", ring: 1, imageUrl: "https://example.com/photo.jpg" },
    ],
    links: [{ source: "n1", target: "n2", type: "contains" }],
  };

  it("creates valid documents", () => {
    const doc = createDocument(source, graphData);
    assert.equal(doc.version, XRAI_VERSION);
    assert.equal(doc.source.url, "https://example.com");
    assert.equal(doc.graph.nodes.length, 2);
    assert.equal(doc.graph.links.length, 1);
    assert.ok(doc.createdAt);
    assert.ok(doc.userLayer);
    assert.ok(doc.provenance);
  });

  it("validates documents", () => {
    const doc = createDocument(source, graphData);
    const { valid, errors } = validate(doc);
    assert.ok(valid, `Errors: ${errors.join(", ")}`);
  });

  it("catches invalid documents", () => {
    const bad = { version: "1.0", source: {}, graph: { nodes: "not array", links: [] } };
    const { valid, errors } = validate(bad);
    assert.ok(!valid);
    assert.ok(errors.length > 0);
  });

  it("detects duplicate node IDs", () => {
    const doc = createDocument(source, {
      nodes: [{ id: "n1", type: "a" }, { id: "n1", type: "b" }],
      links: [],
    });
    const { valid, errors } = validate(doc);
    assert.ok(!valid);
    assert.ok(errors.some((e) => e.includes("Duplicate")));
  });

  it("round-trips through serialize/deserialize", () => {
    const doc = createDocument(source, graphData);
    const json = serialize(doc);
    const restored = deserialize(json);
    assert.equal(restored.source.url, doc.source.url);
    assert.equal(restored.graph.nodes.length, doc.graph.nodes.length);
    assert.equal(restored.graph.links.length, doc.graph.links.length);
  });

  it("migrates legacy extract() output", () => {
    const legacy = {
      url: "https://example.com",
      title: "Legacy",
      graph: {
        nodes: [{ id: "x1", type: "page" }],
        links: [],
      },
    };
    const doc = deserialize(legacy);
    assert.equal(doc.version, XRAI_VERSION);
    assert.equal(doc.source.url, "https://example.com");
  });

  it("generates and decodes share URLs", () => {
    const doc = createDocument(source, graphData, { mode: "media-city" });
    const url = toShareURL(doc, "https://example.com");
    assert.ok(url.includes("xrai="));

    const decoded = fromShareURL(url);
    assert.equal(decoded.s, "https://example.com");
    assert.equal(decoded.m, "media-city");
  });

  it("normalizes node fields", () => {
    const doc = createDocument(source, {
      nodes: [{ id: "n1", type: "page", imageUrl: "http://img.jpg", code: "console.log()" }],
      links: [],
    });
    const node = doc.graph.nodes[0];
    assert.equal(node.imageUrl, "http://img.jpg");
    assert.equal(node.code, "console.log()");
  });
});
