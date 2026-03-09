import { test, expect } from "@playwright/test";

test.describe("Health & Infrastructure", () => {
  test("GET /health returns ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.jarvis).toBe(true);
    expect(body.uptime).toBeGreaterThan(0);
    expect(body.memMB).toBeGreaterThan(0);
    expect(body.ts).toBeGreaterThan(0);
  });

  test("GET /agent/system-state returns agent data", async ({ request }) => {
    const res = await request.get("/agent/system-state");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.agents).toBeDefined();
    expect(body.providers).toBeDefined();
    expect(body.tools).toBeDefined();
    expect(body.agents.length).toBeGreaterThanOrEqual(1);
  });

  test("POST /extract handles valid URL", async ({ request }) => {
    const res = await request.post("/extract", {
      data: { url: "https://example.com" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.title).toBeTruthy();
    expect(body.graph.nodes.length).toBeGreaterThan(0);
    expect(body.graph.links.length).toBeGreaterThan(0);
  });

  test("POST /extract rejects invalid URL", async ({ request }) => {
    const res = await request.post("/extract", {
      data: { url: "not-a-url" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST /agent/tts synthesizes speech", async ({ request }) => {
    const res = await request.post("/agent/tts", {
      data: { text: "Test", voice: "en-US-GuyNeural" },
    });
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("audio/mpeg");
    const buf = await res.body();
    expect(buf.length).toBeGreaterThan(100);
  });

  test("POST /agent/tts rejects empty text", async ({ request }) => {
    const res = await request.post("/agent/tts", {
      data: { text: "" },
    });
    expect(res.status()).toBe(400);
  });
});
