import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We test tokens.mjs functions that don't depend on DOM/fetch
describe("theme tokens", () => {
  it("default-theme.json is valid JSON with required sections", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const themePath = path.join(
      __dirname,
      "../src/server/hud/theme/default-theme.json"
    );
    const raw = fs.readFileSync(themePath, "utf-8");
    const theme = JSON.parse(raw);

    assert.ok(theme.name, "has name");
    assert.ok(theme.palette, "has palette");
    assert.ok(theme.node, "has node");
    assert.ok(theme.connector, "has connector");
    assert.ok(theme.label, "has label");
    assert.ok(theme.reticle, "has reticle");
    assert.ok(theme.bloom, "has bloom");
    assert.ok(theme.vignette, "has vignette");
    assert.ok(theme.camera, "has camera");
    assert.ok(theme.force, "has force");
    assert.ok(theme.agent, "has agent section");
    assert.ok(theme.entryAnimation, "has entryAnimation");
    assert.ok(theme.infoCard, "has infoCard");
  });

  it("node types all have required fields", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const themePath = path.join(
      __dirname,
      "../src/server/hud/theme/default-theme.json"
    );
    const theme = JSON.parse(fs.readFileSync(themePath, "utf-8"));
    const required = ["color", "radius", "ringWidth", "emissive"];

    for (const [type, config] of Object.entries(theme.node.types)) {
      for (const field of required) {
        assert.ok(
          config[field] !== undefined,
          `node type "${type}" missing "${field}"`
        );
      }
    }
  });

  it("agent theme tokens are present", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const themePath = path.join(
      __dirname,
      "../src/server/hud/theme/default-theme.json"
    );
    const theme = JSON.parse(fs.readFileSync(themePath, "utf-8"));
    assert.ok(theme.agent.micSize);
    assert.ok(theme.agent.micActiveColor);
    assert.ok(theme.agent.highlightColor);
  });
});
