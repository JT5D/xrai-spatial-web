import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHooks } from "../src/server/hud/hooks.mjs";
import { createViewRegistry } from "../src/server/hud/views/view-registry.mjs";
import { createFilterEngine } from "../src/server/hud/filters/filter-engine.mjs";

// UI modules are DOM-dependent, so we test the integration points:
// hooks, view registry API consumed by view-switcher, filter engine API consumed by filter-panel

describe("UI Controls integration", () => {
  let hooks, viewRegistry, filterEngine;

  beforeEach(() => {
    hooks = createHooks();
    viewRegistry = createViewRegistry(hooks);
    filterEngine = createFilterEngine(hooks);
  });

  describe("View Switcher data flow", () => {
    it("viewRegistry.getAll() returns view metadata for rendering", () => {
      const view = {
        name: "test", label: "Test View",
        init() {}, generate() {}, update() {}, clear() {}, dispose() {},
      };
      viewRegistry.register(view);

      const all = viewRegistry.getAll();
      assert.equal(all.length, 1);
      assert.equal(all[0].name, "test");
      assert.equal(all[0].label, "Test View");
      assert.equal(all[0].active, false);
    });

    it("view:switch-request hook triggers view switch", async () => {
      let switched = false;
      const view = {
        name: "test", label: "Test",
        init() {}, async generate() { switched = true; },
        update() {}, clear() {}, dispose() {},
      };
      viewRegistry.register(view);

      // Simulate what the view-switcher button click does
      hooks.on("view:switch-request", async ({ name }) => {
        await viewRegistry.switchTo(name, { nodes: [], links: [] });
      });

      hooks.emit("view:switch-request", { name: "test" });
      // Give async handler time to run
      await new Promise((r) => setTimeout(r, 10));
      assert.ok(switched);
    });

    it("view:switched hook fires after switch for UI re-render", async () => {
      let switchedEvent = null;
      hooks.on("view:switched", (e) => { switchedEvent = e; });

      const view = {
        name: "alpha", label: "Alpha",
        init() {}, async generate() {}, update() {}, clear() {}, dispose() {},
      };
      viewRegistry.register(view);
      await viewRegistry.switchTo("alpha", { nodes: [], links: [] });

      assert.equal(switchedEvent.name, "alpha");
      assert.equal(switchedEvent.label, "Alpha");
    });
  });

  describe("Filter Panel data flow", () => {
    it("getFacets() returns built-in facets for panel rendering", () => {
      const facets = filterEngine.getFacets();
      const names = facets.map((f) => f.name);
      assert.ok(names.includes("type"), "should have type facet");
      assert.ok(names.includes("ring"), "should have ring facet");
      assert.ok(names.includes("search"), "should have search facet");
    });

    it("setData populates discrete facet values and counts", () => {
      filterEngine.setData({
        nodes: [
          { id: "1", type: "heading", ring: 0 },
          { id: "2", type: "media", ring: 1 },
          { id: "3", type: "media", ring: 2 },
        ],
        links: [],
      });

      const typeFacet = filterEngine.getFacets().find((f) => f.name === "type");
      assert.ok(typeFacet.values.includes("heading"));
      assert.ok(typeFacet.values.includes("media"));
      assert.equal(typeFacet.counts.heading, 1);
      assert.equal(typeFacet.counts.media, 2);
    });

    it("toggleFilter simulates checkbox toggle in panel", () => {
      filterEngine.setData({
        nodes: [
          { id: "1", type: "heading" },
          { id: "2", type: "media" },
          { id: "3", type: "tag" },
        ],
        links: [],
      });

      // Toggle "media" on
      filterEngine.toggleFilter("type", "media");
      const filtered = filterEngine.apply();
      assert.equal(filtered.nodes.length, 1);
      assert.equal(filtered.nodes[0].type, "media");

      // Toggle "heading" on too
      filterEngine.toggleFilter("type", "heading");
      const filtered2 = filterEngine.apply();
      assert.equal(filtered2.nodes.length, 2);
    });

    it("filter:changed hook fires for panel re-render", () => {
      let changedEvent = null;
      hooks.on("filter:changed", (e) => { changedEvent = e; });

      filterEngine.setFilter("type", ["media"]);
      assert.ok(changedEvent);
      assert.equal(changedEvent.facet, "type");
    });

    it("clearFilters resets all and fires hook", () => {
      let cleared = false;
      hooks.on("filter:cleared", () => { cleared = true; });

      filterEngine.setFilter("type", ["media"]);
      filterEngine.clearFilters();

      assert.ok(cleared);
      const active = filterEngine.getActiveFilters();
      assert.deepEqual(active, {});
    });

    it("text search facet filters by label substring", () => {
      filterEngine.setData({
        nodes: [
          { id: "1", type: "heading", label: "Introduction" },
          { id: "2", type: "heading", label: "Conclusion" },
          { id: "3", type: "media", label: "Hero Image" },
        ],
        links: [],
      });

      filterEngine.setFilter("search", "intro");
      const result = filterEngine.apply();
      assert.equal(result.nodes.length, 1);
      assert.equal(result.nodes[0].label, "Introduction");
    });
  });

  describe("URL Bar data flow", () => {
    it("graph:loaded hook passes data for URL bar display", () => {
      let loadedData = null;
      hooks.on("graph:loaded", (data) => { loadedData = data; });

      const graphData = {
        nodes: [{ id: "page", type: "page", label: "Test" }],
        links: [],
      };
      hooks.emit("graph:loaded", graphData);

      assert.deepEqual(loadedData, graphData);
    });
  });
});
