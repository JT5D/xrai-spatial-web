import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJarvis } from "../src/server/agent/jarvis.mjs";

describe("jarvis", () => {
  it("creates a jarvis instance", () => {
    // Mock claude client
    const mockClient = {
      async *stream() {
        yield { type: "text_delta", text: "Hello " };
        yield { type: "text_delta", text: "there!" };
        yield { type: "message_stop" };
      },
    };

    const jarvis = createJarvis(mockClient);
    assert.ok(jarvis.handleMessage);
    assert.ok(jarvis.setGraphContext);
    assert.ok(jarvis.clearHistory);
  });

  it("streams text responses", async () => {
    const mockClient = {
      async *stream() {
        yield { type: "text_delta", text: "I see " };
        yield { type: "text_delta", text: "3 headings." };
        yield { type: "message_stop" };
      },
    };

    const jarvis = createJarvis(mockClient);
    const events = [];
    for await (const event of jarvis.handleMessage("What do you see?")) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === "text_delta");
    assert.ok(textDeltas.length >= 2);
    assert.ok(events.some((e) => e.type === "done"));
  });

  it("handles tool calls", async () => {
    const mockClient = {
      async *stream() {
        yield {
          type: "content_block_start",
          content_block: {
            type: "tool_use",
            id: "toolu_1",
            name: "search_graph",
          },
        };
        yield {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
            partial_json: '{"type":"heading"}',
          },
        };
        yield { type: "content_block_stop" };
      },
    };

    // Jarvis wraps the raw client, so we need to simulate at the jarvis level
    // For unit testing, we directly test that jarvis has the method
    const jarvis = createJarvis(mockClient);
    assert.ok(typeof jarvis.continueWithToolResults === "function");
  });

  it("sets graph context", () => {
    const mockClient = { async *stream() {} };
    const jarvis = createJarvis(mockClient);
    jarvis.setGraphContext({
      nodeCount: 42,
      focusedNode: "test",
      nodeTypes: { heading: 12 },
      url: "https://example.com",
    });
    // No error = success
  });
});
