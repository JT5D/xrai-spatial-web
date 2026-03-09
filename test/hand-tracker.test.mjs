import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Mock hooks for testing
function createMockHooks() {
  const listeners = {};
  const emitted = [];
  return {
    on(event, fn) {
      (listeners[event] ??= []).push(fn);
    },
    emit(event, data) {
      emitted.push({ event, data });
      (listeners[event] || []).forEach((fn) => fn(data));
    },
    emitted,
    listeners,
  };
}

// We can't test actual MediaPipe in Node, but we can test the module exports and gesture logic
describe("hand-tracker", () => {
  let createHandTracker;

  beforeEach(async () => {
    // Import the module (it won't load MediaPipe in Node, but exports are testable)
    const mod = await import("../src/server/hud/interaction/hand-tracker.mjs");
    createHandTracker = mod.createHandTracker;
  });

  it("exports createHandTracker factory", () => {
    assert.equal(typeof createHandTracker, "function");
  });

  it("creates tracker with expected API", () => {
    const hooks = createMockHooks();
    const tracker = createHandTracker(hooks);
    assert.equal(typeof tracker.start, "function");
    assert.equal(typeof tracker.stop, "function");
    assert.equal(typeof tracker.toggle, "function");
    assert.equal(typeof tracker.isActive, "function");
    assert.equal(typeof tracker.isSupported, "function");
    assert.equal(typeof tracker.dispose, "function");
  });

  it("starts inactive", () => {
    const hooks = createMockHooks();
    const tracker = createHandTracker(hooks);
    assert.equal(tracker.isActive(), false);
  });

  it("isSupported returns false in Node (no navigator)", () => {
    const hooks = createMockHooks();
    const tracker = createHandTracker(hooks);
    // In Node.js, navigator.mediaDevices is not available
    assert.equal(tracker.isSupported(), false);
  });

  it("accepts custom options", () => {
    const hooks = createMockHooks();
    // Should not throw with custom options
    const tracker = createHandTracker(hooks, {
      maxHands: 1,
      pinchThreshold: 0.1,
      gestureCooldownMs: 500,
    });
    assert.equal(typeof tracker.start, "function");
  });

  it("dispose does not throw when not started", () => {
    const hooks = createMockHooks();
    const tracker = createHandTracker(hooks);
    tracker.dispose(); // should not throw
  });

  it("stop does not throw when not started", () => {
    const hooks = createMockHooks();
    const tracker = createHandTracker(hooks);
    tracker.stop(); // should not throw
    // Should emit active:false
    const activeEvent = hooks.emitted.find((e) => e.event === "hand:active");
    assert.ok(activeEvent);
    assert.equal(activeEvent.data, false);
  });
});
