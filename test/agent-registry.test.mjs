import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAgentRegistry } from "../src/server/agent/agent-registry.mjs";

describe("agent-registry", () => {
  it("registers and lists agents", () => {
    const reg = createAgentRegistry();
    const id = reg.register({ name: "Test Agent", type: "research" });
    const all = reg.getAll();
    assert.equal(all.length, 1);
    assert.equal(all[0].name, "Test Agent");
    assert.equal(all[0].type, "research");
    assert.equal(all[0].status, "idle");
    assert.ok(id.startsWith("agent-"));
  });

  it("updates agent status and task", () => {
    const reg = createAgentRegistry();
    const id = reg.register({ name: "Builder" });
    reg.update(id, { status: "working", currentTask: "Building filters", progress: 50 });
    const agent = reg.get(id);
    assert.equal(agent.status, "working");
    assert.equal(agent.currentTask, "Building filters");
    assert.equal(agent.progress, 50);
  });

  it("tracks activity log", () => {
    const reg = createAgentRegistry();
    const id = reg.register({ name: "Logger" });
    reg.update(id, { log: "Started research" });
    reg.update(id, { log: "Found 5 results" });
    const agent = reg.get(id);
    assert.equal(agent.log.length, 2);
    assert.equal(agent.log[1].msg, "Found 5 results");
  });

  it("removes agents", () => {
    const reg = createAgentRegistry();
    const id = reg.register({ name: "Temp" });
    reg.remove(id);
    assert.equal(reg.getAll().length, 0);
    assert.equal(reg.get(id), null);
  });

  it("broadcasts events to subscribers", () => {
    const reg = createAgentRegistry();
    const events = [];
    reg.subscribe((json) => events.push(JSON.parse(json)));

    const id = reg.register({ name: "Observed" });
    reg.update(id, { status: "working" });

    assert.equal(events.length, 2); // registered + updated
    assert.equal(events[0].type, "agent:registered");
    assert.equal(events[1].type, "agent:updated");
    assert.equal(events[1].agent.status, "working");
  });

  it("manages multiple agents", () => {
    const reg = createAgentRegistry();
    reg.register({ name: "Agent A", type: "research" });
    reg.register({ name: "Agent B", type: "build" });
    reg.register({ name: "Agent C", type: "test" });
    assert.equal(reg.getAll().length, 3);
  });

  it("stores todos on agents", () => {
    const reg = createAgentRegistry();
    const id = reg.register({ name: "Worker" });
    reg.update(id, {
      todos: [
        { content: "Build feature", status: "completed", activeForm: "Building feature" },
        { content: "Run tests", status: "in_progress", activeForm: "Running tests" },
      ],
    });
    const agent = reg.get(id);
    assert.equal(agent.todos.length, 2);
    assert.equal(agent.todos[1].status, "in_progress");
  });
});
