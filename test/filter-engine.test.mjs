import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFilterEngine } from "../src/server/hud/filters/filter-engine.mjs";
import { createHooks } from "../src/server/hud/hooks.mjs";

const SAMPLE_DATA = {
  nodes: [
    { id: "n1", type: "heading", label: "Title", ring: 0 },
    { id: "n2", type: "media", label: "Photo", ring: 1, mediaKind: "image" },
    { id: "n3", type: "media", label: "Video", ring: 1, mediaKind: "video" },
    { id: "n4", type: "link-group", label: "Links", ring: 2 },
    { id: "n5", type: "heading", label: "Subtitle", ring: 0, author: "John" },
  ],
  links: [
    { source: "n1", target: "n2", type: "contains" },
    { source: "n1", target: "n5", type: "child-of" },
    { source: "n4", target: "n3", type: "links-to" },
  ],
};

describe("filter-engine", () => {
  let engine, hooks;

  beforeEach(() => {
    hooks = createHooks();
    engine = createFilterEngine(hooks);
    engine.setData(SAMPLE_DATA);
  });

  it("returns all data when no filters active", () => {
    const result = engine.apply();
    assert.equal(result.nodes.length, 5);
    assert.equal(result.links.length, 3);
  });

  it("filters by type (discrete)", () => {
    engine.setFilter("type", ["heading"]);
    const result = engine.apply();
    assert.equal(result.nodes.length, 2);
    assert.ok(result.nodes.every((n) => n.type === "heading"));
    // Links: only n1→n5 survives (both are headings)
    assert.equal(result.links.length, 1);
  });

  it("filters by multiple types", () => {
    engine.setFilter("type", ["heading", "media"]);
    const result = engine.apply();
    assert.equal(result.nodes.length, 4);
  });

  it("composes multiple filters", () => {
    engine.setFilter("type", ["media"]);
    engine.setFilter("mediaKind", ["video"]);
    const result = engine.apply();
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, "n3");
  });

  it("clears filters", () => {
    engine.setFilter("type", ["heading"]);
    engine.clearFilters();
    const result = engine.apply();
    assert.equal(result.nodes.length, 5);
  });

  it("discovers facet values automatically", () => {
    const facets = engine.getFacets();
    const typeFacet = facets.find((f) => f.name === "type");
    assert.ok(typeFacet);
    assert.ok(typeFacet.values.includes("heading"));
    assert.ok(typeFacet.values.includes("media"));
    assert.ok(typeFacet.values.includes("link-group"));
  });

  it("saves and loads presets", () => {
    engine.setFilter("type", ["media"]);
    engine.savePreset("only-media");
    engine.clearFilters();
    assert.equal(engine.apply().nodes.length, 5);

    engine.loadPreset("only-media");
    assert.equal(engine.apply().nodes.length, 2);
  });

  it("emits filter:changed events", () => {
    let event = null;
    hooks.on("filter:changed", (e) => { event = e; });
    engine.setFilter("type", ["heading"]);
    assert.ok(event);
    assert.equal(event.facet, "type");
  });

  it("supports custom facets", () => {
    engine.addFacet("hasAuthor", {
      label: "Has Author",
      type: "boolean",
      extract: (n) => !!n.author,
    });
    engine.setFilter("hasAuthor", true);
    const result = engine.apply();
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, "n5");
  });
});
