import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createClaudeClient } from "../src/server/agent/claude-client.mjs";

describe("claude-client", () => {
  it("creates a client with isReady reflecting env", () => {
    const client = createClaudeClient();
    // isReady depends on ANTHROPIC_API_KEY being set
    assert.equal(typeof client.isReady, "function");
    assert.equal(typeof client.stream, "function");
  });

  it("stream yields error when no API key", async () => {
    // Temporarily clear key
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const client = createClaudeClient();
    const events = [];
    for await (const event of client.stream("test", [
      { role: "user", content: "hi" },
    ])) {
      events.push(event);
    }

    assert.ok(events.length > 0);
    assert.equal(events[0].type, "error");
    assert.ok(events[0].message.includes("ANTHROPIC_API_KEY"));

    // Restore
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  });
});
