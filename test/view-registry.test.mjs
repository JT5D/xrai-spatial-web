import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createViewRegistry } from "../src/server/hud/views/view-registry.mjs";
import { createHooks } from "../src/server/hud/hooks.mjs";

describe("view-registry", () => {
  let registry, hooks;

  beforeEach(() => {
    hooks = createHooks();
    registry = createViewRegistry(hooks);
  });

  it("starts with no views", () => {
    assert.deepEqual(registry.list(), []);
    assert.equal(registry.current(), null);
  });

  it("registers view modules", () => {
    registry.register({ name: "test-view", label: "Test", init() {}, generate() {}, update() {}, clear() {}, dispose() {} });
    assert.deepEqual(registry.list(), ["test-view"]);
  });

  it("switches between views", async () => {
    let cleared = false, generated = false;
    registry.register({
      name: "a", label: "A",
      init() {}, clear() { cleared = true; }, dispose() {},
      async generate() { generated = true; }, update() {},
    });
    registry.register({
      name: "b", label: "B",
      init() {}, clear() {}, dispose() {},
      async generate() {}, update() {},
    });

    await registry.switchTo("a", { nodes: [], links: [] });
    assert.equal(registry.current(), "a");
    assert.ok(generated);

    await registry.switchTo("b");
    assert.equal(registry.current(), "b");
    assert.ok(cleared); // "a" was cleared
  });

  it("emits view:switched event", async () => {
    let event = null;
    hooks.on("view:switched", (e) => { event = e; });
    registry.register({ name: "x", label: "X View", init() {}, generate() {}, update() {}, clear() {}, dispose() {} });
    await registry.switchTo("x");
    assert.deepEqual(event, { name: "x", label: "X View" });
  });

  it("getAll returns metadata with active flag", async () => {
    registry.register({ name: "a", label: "A", init() {}, generate() {}, update() {}, clear() {}, dispose() {} });
    registry.register({ name: "b", label: "B", init() {}, generate() {}, update() {}, clear() {}, dispose() {} });
    await registry.switchTo("a");
    const all = registry.getAll();
    assert.equal(all.find(v => v.name === "a").active, true);
    assert.equal(all.find(v => v.name === "b").active, false);
  });

  it("throws on unknown view", async () => {
    await assert.rejects(() => registry.switchTo("nonexistent"), /Unknown view/);
  });
});
