import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHooks } from "../src/server/hud/hooks.mjs";

describe("hooks", () => {
  it("emits and receives events", () => {
    const hooks = createHooks();
    let received = null;
    hooks.on("test", (data) => { received = data; });
    hooks.emit("test", { value: 42 });
    assert.deepEqual(received, { value: 42 });
  });

  it("supports multiple listeners", () => {
    const hooks = createHooks();
    const calls = [];
    hooks.on("x", () => calls.push("a"));
    hooks.on("x", () => calls.push("b"));
    hooks.emit("x");
    assert.deepEqual(calls, ["a", "b"]);
  });

  it("removes listeners with off", () => {
    const hooks = createHooks();
    const calls = [];
    const fn = () => calls.push("hit");
    hooks.on("x", fn);
    hooks.emit("x");
    hooks.off("x", fn);
    hooks.emit("x");
    assert.equal(calls.length, 1);
  });

  it("on returns unsubscribe function", () => {
    const hooks = createHooks();
    const calls = [];
    const unsub = hooks.on("x", () => calls.push(1));
    hooks.emit("x");
    unsub();
    hooks.emit("x");
    assert.equal(calls.length, 1);
  });

  it("once fires only once", () => {
    const hooks = createHooks();
    const calls = [];
    hooks.once("x", () => calls.push(1));
    hooks.emit("x");
    hooks.emit("x");
    assert.equal(calls.length, 1);
  });

  it("clear removes all listeners", () => {
    const hooks = createHooks();
    const calls = [];
    hooks.on("a", () => calls.push(1));
    hooks.on("b", () => calls.push(2));
    hooks.clear();
    hooks.emit("a");
    hooks.emit("b");
    assert.equal(calls.length, 0);
  });

  it("catches errors in listeners", () => {
    const hooks = createHooks();
    const calls = [];
    hooks.on("x", () => { throw new Error("fail"); });
    hooks.on("x", () => calls.push("ok"));
    hooks.emit("x");
    assert.equal(calls.length, 1);
  });
});
