import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HUD_TOOLS } from "../src/server/agent/tools-schema.mjs";

describe("tools-schema", () => {
  it("exports an array of tool definitions", () => {
    assert.ok(Array.isArray(HUD_TOOLS));
    assert.ok(HUD_TOOLS.length >= 8);
  });

  it("each tool has name, description, input_schema", () => {
    for (const tool of HUD_TOOLS) {
      assert.ok(tool.name, `tool missing name`);
      assert.ok(tool.description, `${tool.name} missing description`);
      assert.ok(tool.input_schema, `${tool.name} missing input_schema`);
      assert.equal(tool.input_schema.type, "object");
    }
  });

  it("includes critical tools", () => {
    const names = HUD_TOOLS.map((t) => t.name);
    assert.ok(names.includes("navigate_to_node"));
    assert.ok(names.includes("search_graph"));
    assert.ok(names.includes("highlight_nodes"));
    assert.ok(names.includes("extract_deeper"));
    assert.ok(names.includes("reset_view"));
    assert.ok(names.includes("list_nodes"));
    assert.ok(names.includes("switch_view"));
    assert.ok(names.includes("list_views"));
    assert.ok(names.includes("filter_nodes"));
    assert.ok(names.includes("clear_filters"));
    assert.ok(names.includes("get_facets"));
  });
});
