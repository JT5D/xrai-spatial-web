import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/server/index.mjs";
import { WebSocket } from "ws";

describe("server", () => {
  let server;
  const port = 3299;

  after(() => {
    if (server) server.close();
  });

  it("starts and serves endpoints", async () => {
    server = startServer({ port });
    await new Promise((r) => setTimeout(r, 500));

    // Root
    const root = await fetch(`http://localhost:${port}/`);
    assert.equal(root.status, 200);

    // Spatial
    const spatial = await fetch(`http://localhost:${port}/spatial`);
    assert.equal(spatial.status, 200);
    const html = await spatial.text();
    assert.ok(html.includes("hud-container"));
    assert.ok(html.includes("orchestrator.mjs"));

    // Agent status
    const agentStatus = await fetch(`http://localhost:${port}/agent/status`);
    assert.equal(agentStatus.status, 200);
    const statusJson = await agentStatus.json();
    assert.equal(typeof statusJson.ready, "boolean");

    // HUD static file
    const theme = await fetch(
      `http://localhost:${port}/hud/theme/default-theme.json`
    );
    assert.equal(theme.status, 200);
    const themeJson = await theme.json();
    assert.ok(themeJson.agent);

    // 404
    const notFound = await fetch(`http://localhost:${port}/nonexistent`);
    assert.equal(notFound.status, 404);
  });

  it("serves HUD JS modules with correct MIME type", async () => {
    const res = await fetch(
      `http://localhost:${port}/hud/orchestrator.mjs`
    );
    assert.equal(res.status, 200);
    assert.ok(
      res.headers.get("content-type").includes("application/javascript")
    );
  });

  it("blocks path traversal", async () => {
    // URL parser normalizes ../ but we check the rel path for ".."
    // Use a raw HTTP request to bypass URL normalization
    const http = await import("node:http");
    const res = await new Promise((resolve) => {
      const req = http.request(
        { host: "localhost", port, path: "/hud/..%2F..%2Fpackage.json" },
        resolve
      );
      req.end();
    });
    // Should not serve files outside hud/
    assert.ok([400, 404].includes(res.statusCode));
  });

  it("accepts WebSocket upgrade at /agent/ws", async () => {
    const ws = new WebSocket(`ws://localhost:${port}/agent/ws`);
    await new Promise((resolve, reject) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "graph_snapshot", nodeCount: 0 }));
        resolve();
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("ws timeout")), 3000);
    });
    ws.close();
  });
});
