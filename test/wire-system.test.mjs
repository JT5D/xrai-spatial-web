import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createWireEngine,
  WireEngine,
  applyMod,
  resolvePath,
  setPath,
} from "../src/lib/wire-system.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSources(overrides = {}) {
  return {
    audio: { bass: 0.8, mid: 0.5, high: 0.3 },
    time: { t: 1.0 },
    hand: { dist: 0.4 },
    ...overrides,
  };
}

function makeTargets() {
  return {
    cube: { scale: { x: 1, y: 1, z: 1 }, emission: 0 },
    sphere: { scale: { x: 1, y: 1, z: 1 }, emission: 0 },
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

describe("createWireEngine", () => {
  it("returns a WireEngine instance", () => {
    const engine = createWireEngine();
    assert.ok(engine instanceof WireEngine);
  });

  it("accepts initial wires", () => {
    const engine = createWireEngine([
      { src: "audio.bass", tgt: "cube.scale.y" },
    ]);
    assert.equal(engine.count, 1);
  });

  it("creates with zero wires by default", () => {
    const engine = createWireEngine();
    assert.equal(engine.count, 0);
  });
});

// ---------------------------------------------------------------------------
// resolvePath
// ---------------------------------------------------------------------------

describe("resolvePath", () => {
  it("resolves two-segment path", () => {
    assert.equal(resolvePath("audio.bass", { audio: { bass: 0.8 } }), 0.8);
  });

  it("resolves deep path", () => {
    const obj = { a: { b: { c: 42 } } };
    assert.equal(resolvePath("a.b.c", obj), 42);
  });

  it("returns 0 for missing path", () => {
    assert.equal(resolvePath("audio.treble", { audio: { bass: 0.5 } }), 0);
  });

  it("returns 0 for null root", () => {
    assert.equal(resolvePath("a.b", null), 0);
  });

  it("returns 0 for non-numeric leaf", () => {
    assert.equal(resolvePath("a.b", { a: { b: "hello" } }), 0);
  });
});

// ---------------------------------------------------------------------------
// setPath
// ---------------------------------------------------------------------------

describe("setPath", () => {
  it("sets a two-segment path", () => {
    const targets = { cube: {} };
    setPath("cube.emission", 0.7, targets);
    assert.equal(targets.cube.emission, 0.7);
  });

  it("sets a deep path, creating intermediates", () => {
    const targets = { cube: {} };
    setPath("cube.scale.y", 2.5, targets);
    assert.equal(targets.cube.scale.y, 2.5);
  });

  it("applies wildcard to all targets", () => {
    const targets = { cube: {}, sphere: {} };
    setPath("*.emission", 0.9, targets);
    assert.equal(targets.cube.emission, 0.9);
    assert.equal(targets.sphere.emission, 0.9);
  });

  it("does nothing for unknown target", () => {
    const targets = { cube: { emission: 0 } };
    setPath("unknown.emission", 1.0, targets);
    assert.equal(targets.cube.emission, 0);
    assert.ok(!("unknown" in targets) || targets.unknown == null);
  });
});

// ---------------------------------------------------------------------------
// applyMod
// ---------------------------------------------------------------------------

describe("applyMod", () => {
  it("returns value unchanged when mod is undefined", () => {
    assert.equal(applyMod(0.5, undefined), 0.5);
  });

  it("returns value unchanged when mod is empty string", () => {
    assert.equal(applyMod(0.5, ""), 0.5);
  });

  it("scale modifier", () => {
    assert.equal(applyMod(0.8, "scale:0.5"), 0.4);
  });

  it("scale defaults to 1", () => {
    assert.equal(applyMod(0.8, "scale"), 0.8);
  });

  it("offset modifier", () => {
    assert.equal(applyMod(0.5, "offset:0.3"), 0.8);
  });

  it("offset defaults to 1", () => {
    assert.equal(applyMod(0.5, "offset"), 1.5);
  });

  it("invert modifier", () => {
    assert.equal(applyMod(0.3, "invert"), 0.7);
  });

  it("sin modifier at 0", () => {
    // sin(0 * PI * 2 * 1) * 0.5 + 0.5 = sin(0)*0.5+0.5 = 0.5
    assert.equal(applyMod(0, "sin:1"), 0.5);
  });

  it("sin modifier at 0.25", () => {
    // sin(0.25 * PI * 2 * 1) * 0.5 + 0.5 = sin(PI/2)*0.5+0.5 = 1.0
    const result = applyMod(0.25, "sin:1");
    assert.ok(Math.abs(result - 1.0) < 1e-10);
  });

  it("clamp within range", () => {
    assert.equal(applyMod(0.5, "clamp"), 0.5);
  });

  it("clamp below 0", () => {
    assert.equal(applyMod(-0.5, "clamp"), 0);
  });

  it("clamp above 1", () => {
    assert.equal(applyMod(1.5, "clamp"), 1);
  });

  it("step above threshold", () => {
    assert.equal(applyMod(0.8, "step:0.5"), 1);
  });

  it("step below threshold", () => {
    assert.equal(applyMod(0.3, "step:0.5"), 0);
  });

  it("step at exact threshold", () => {
    assert.equal(applyMod(0.5, "step:0.5"), 0);
  });

  it("smooth modifier with state", () => {
    const state = {};
    // First call: smoothed starts at value
    const v1 = applyMod(1.0, "smooth:0.1", state, 1 / 60);
    assert.equal(v1, 1.0); // prev defaults to value on first call

    // Second call with different value: should move toward 0
    const v2 = applyMod(0.0, "smooth:0.1", state, 1 / 60);
    assert.ok(v2 < 1.0, "should move toward target");
    assert.ok(v2 > 0.0, "should not reach target instantly");
  });

  it("smooth modifier without state returns value as-is", () => {
    assert.equal(applyMod(0.5, "smooth:0.1"), 0.5);
  });

  it("unknown modifier returns value unchanged", () => {
    assert.equal(applyMod(0.5, "wobble:3"), 0.5);
  });
});

// ---------------------------------------------------------------------------
// WireEngine.tick
// ---------------------------------------------------------------------------

describe("WireEngine.tick", () => {
  let engine;

  beforeEach(() => {
    engine = createWireEngine();
  });

  it("reads source and writes to target", () => {
    engine.add({ src: "audio.bass", tgt: "cube.emission" });
    const sources = makeSources();
    const targets = makeTargets();
    engine.tick(sources, targets);
    assert.equal(targets.cube.emission, 0.8);
  });

  it("applies modifier during tick", () => {
    engine.add({ src: "audio.bass", mod: "scale:0.5", tgt: "cube.emission" });
    const sources = makeSources();
    const targets = makeTargets();
    engine.tick(sources, targets);
    assert.ok(Math.abs(targets.cube.emission - 0.4) < 1e-10);
  });

  it("supports deep target path", () => {
    engine.add({ src: "audio.bass", mod: "scale:2", tgt: "cube.scale.y" });
    const sources = makeSources();
    const targets = makeTargets();
    engine.tick(sources, targets);
    assert.equal(targets.cube.scale.y, 1.6);
  });

  it("supports wildcard targets", () => {
    engine.add({ src: "audio.bass", tgt: "*.emission" });
    const sources = makeSources();
    const targets = makeTargets();
    engine.tick(sources, targets);
    assert.equal(targets.cube.emission, 0.8);
    assert.equal(targets.sphere.emission, 0.8);
  });

  it("evaluates multiple wires in order", () => {
    engine.add({ src: "audio.bass", mod: "scale:1", tgt: "cube.emission" });
    engine.add({ src: "audio.mid", mod: "scale:1", tgt: "sphere.emission" });
    const sources = makeSources();
    const targets = makeTargets();
    engine.tick(sources, targets);
    assert.equal(targets.cube.emission, 0.8);
    assert.equal(targets.sphere.emission, 0.5);
  });

  it("handles missing source gracefully (defaults to 0)", () => {
    engine.add({ src: "audio.treble", tgt: "cube.emission" });
    const targets = makeTargets();
    engine.tick(makeSources(), targets);
    assert.equal(targets.cube.emission, 0);
  });

  it("handles missing target gracefully", () => {
    engine.add({ src: "audio.bass", tgt: "nonexistent.emission" });
    const targets = makeTargets();
    // Should not throw
    engine.tick(makeSources(), targets);
    assert.ok(!("nonexistent" in targets));
  });

  it("passes dt to smooth modifier", () => {
    engine.add({ src: "audio.bass", mod: "smooth:0.5", tgt: "cube.emission" });
    const sources = makeSources();
    const targets = makeTargets();

    // First tick
    engine.tick(sources, targets, 1 / 60);
    const v1 = targets.cube.emission;
    assert.equal(v1, 0.8); // First tick: prev defaults to value

    // Change source, tick again
    sources.audio.bass = 0.0;
    engine.tick(sources, targets, 1 / 60);
    const v2 = targets.cube.emission;
    assert.ok(v2 < 0.8, `expected < 0.8, got ${v2}`);
    assert.ok(v2 > 0.0, `expected > 0, got ${v2}`);
  });
});

// ---------------------------------------------------------------------------
// WireEngine management methods
// ---------------------------------------------------------------------------

describe("WireEngine management", () => {
  let engine;

  beforeEach(() => {
    engine = createWireEngine([
      { src: "audio.bass", tgt: "cube.emission" },
      { src: "audio.mid", tgt: "sphere.emission" },
    ]);
  });

  it("add returns the new index", () => {
    const idx = engine.add({ src: "time.t", tgt: "cube.scale.y" });
    assert.equal(idx, 2);
    assert.equal(engine.count, 3);
  });

  it("remove returns true for valid index", () => {
    assert.equal(engine.remove(0), true);
    assert.equal(engine.count, 1);
  });

  it("remove returns false for out-of-range index", () => {
    assert.equal(engine.remove(99), false);
    assert.equal(engine.count, 2);
  });

  it("remove returns false for negative index", () => {
    assert.equal(engine.remove(-1), false);
  });

  it("clear removes all wires", () => {
    engine.clear();
    assert.equal(engine.count, 0);
  });

  it("toJSON returns copies", () => {
    const json = engine.toJSON();
    assert.equal(json.length, 2);
    assert.deepEqual(json[0], { src: "audio.bass", tgt: "cube.emission" });
    // Mutating the copy should not affect the engine
    json[0].src = "modified";
    assert.equal(engine.wires[0].src, "audio.bass");
  });

  it("loadPreset replaces all wires", () => {
    engine.loadPreset([{ src: "time.t", mod: "sin:0.5", tgt: "*.scale" }]);
    assert.equal(engine.count, 1);
    assert.equal(engine.wires[0].src, "time.t");
  });
});

// ---------------------------------------------------------------------------
// Preset integration (Portals V4 presets)
// ---------------------------------------------------------------------------

describe("Portals V4 presets", () => {
  it("audio-pulse preset", () => {
    const engine = createWireEngine([
      { src: "audio.bass", mod: "scale:0.5", tgt: "*.scale" },
    ]);
    const sources = { audio: { bass: 0.8 } };
    const targets = { cube: {}, sphere: {} };
    engine.tick(sources, targets);
    assert.ok(Math.abs(targets.cube.scale - 0.4) < 1e-10);
    assert.ok(Math.abs(targets.sphere.scale - 0.4) < 1e-10);
  });

  it("breathe preset", () => {
    const engine = createWireEngine([
      { src: "time.t", mod: "sin:0.5", tgt: "*.scale" },
    ]);
    const sources = { time: { t: 0 } };
    const targets = { obj: {} };
    engine.tick(sources, targets);
    // sin(0 * PI * 2 * 0.5) * 0.5 + 0.5 = sin(0) * 0.5 + 0.5 = 0.5
    assert.equal(targets.obj.scale, 0.5);
  });

  it("hand-glow preset", () => {
    const engine = createWireEngine([
      { src: "hand.dist", mod: "invert", tgt: "*.emission" },
    ]);
    const sources = { hand: { dist: 0.3 } };
    const targets = { light: {} };
    engine.tick(sources, targets);
    assert.ok(Math.abs(targets.light.emission - 0.7) < 1e-10);
  });

  it("audio-color preset (multi-wire)", () => {
    const engine = createWireEngine([
      { src: "audio.bass", mod: "scale:1", tgt: "*.colorR" },
      { src: "audio.mid", mod: "scale:1", tgt: "*.colorG" },
      { src: "audio.high", mod: "scale:1", tgt: "*.colorB" },
    ]);
    const sources = { audio: { bass: 0.9, mid: 0.6, high: 0.2 } };
    const targets = { mesh: {} };
    engine.tick(sources, targets);
    assert.equal(targets.mesh.colorR, 0.9);
    assert.equal(targets.mesh.colorG, 0.6);
    assert.equal(targets.mesh.colorB, 0.2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("tick with empty wires does nothing", () => {
    const engine = createWireEngine();
    const targets = makeTargets();
    engine.tick(makeSources(), targets);
    assert.equal(targets.cube.emission, 0);
  });

  it("tick with empty sources and targets does not throw", () => {
    const engine = createWireEngine([
      { src: "audio.bass", tgt: "cube.emission" },
    ]);
    assert.doesNotThrow(() => engine.tick({}, {}));
  });

  it("constructor copies wires (no shared references)", () => {
    const original = [{ src: "a.b", tgt: "c.d" }];
    const engine = createWireEngine(original);
    original[0].src = "modified";
    assert.equal(engine.wires[0].src, "a.b");
  });

  it("remove shifts state correctly", () => {
    const engine = createWireEngine([
      { src: "audio.bass", mod: "smooth:0.1", tgt: "cube.emission" },
      { src: "audio.mid", mod: "smooth:0.1", tgt: "sphere.emission" },
    ]);
    const sources = makeSources();
    const targets = makeTargets();

    // Tick once to initialize state for both wires
    engine.tick(sources, targets, 1 / 60);

    // Now remove the first wire; second wire's state should transfer
    engine.remove(0);
    assert.equal(engine.count, 1);
    assert.equal(engine.wires[0].src, "audio.mid");

    // Should not throw and should still work
    assert.doesNotThrow(() => engine.tick(sources, targets, 1 / 60));
  });
});
