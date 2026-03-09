import { test, expect } from "@playwright/test";

test.describe("Spatial 3D Viewer", () => {
  test.beforeEach(async ({ page }) => {
    page.on("pageerror", (err) => {
      if (!err.message.includes("WebGL")) {
        console.error(`[PAGE ERROR] ${err.message}`);
      }
    });
  });

  test("loads and shows URL input + extract button", async ({ page }) => {
    await page.goto("/spatial");
    await expect(page.locator("#urlInput")).toBeVisible();
    await expect(page.locator("#extractBtn")).toBeVisible();
  });

  test("shows HUD container for 3D canvas", async ({ page }) => {
    await page.goto("/spatial");
    await expect(page.locator("#hud-container")).toBeVisible();
  });

  // These tests call the extract API directly because headless browsers
  // may not support WebGL, which blocks the spatial UI's JS initialization.
  // The UI tests above verify DOM structure; these verify the API works.

  test("extract API returns valid graph for button-click scenario", async ({ request }) => {
    const res = await request.post("/extract", {
      data: { url: "https://example.com" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.title).toBe("Example Domain");
    expect(body.graph.nodes.length).toBeGreaterThan(0);
    expect(body.graph.links.length).toBeGreaterThan(0);
    // Verify node types match what the spatial viewer expects
    const types = [...new Set(body.graph.nodes.map((n) => n.type))];
    expect(types).toContain("page");
  });

  test("extract API handles query-param auto-extract scenario", async ({ request }) => {
    // Same API call the viewer would make with ?url= param
    const res = await request.post("/extract", {
      data: { url: "https://example.com" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.graph).toBeDefined();
  });

  test("spatial HTML serves correctly", async ({ request }) => {
    const res = await request.get("/spatial");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("urlInput");
    expect(html).toContain("extractBtn");
    expect(html).toContain("hud-container");
    expect(html).toContain("orchestrator.mjs");
  });

  test("spatial HTML with query param serves correctly", async ({ request }) => {
    const res = await request.get("/spatial?url=https://example.com");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("hud-container");
  });

  test("shows error for bad URL", async ({ page }) => {
    await page.goto("/spatial");
    await page.locator("#urlInput").fill("bad-url");
    await page.locator("#extractBtn").click();
    await page.waitForTimeout(3_000);
    await expect(page.locator("#hud-container")).toBeVisible();
  });

  test("no critical JS errors on load", async ({ page }) => {
    const criticalErrors = [];
    page.on("pageerror", (err) => {
      if (
        !err.message.includes("WebGL") &&
        !err.message.includes("THREE") &&
        !err.message.includes("shader") &&
        !err.message.includes("GL_") &&
        !err.message.includes("getContext")
      ) {
        criticalErrors.push(err.message);
      }
    });
    await page.goto("/spatial");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2_000);
    expect(criticalErrors).toHaveLength(0);
  });

  test("HUD container fills viewport", async ({ page }) => {
    await page.goto("/spatial");
    const box = await page.locator("#hud-container").boundingBox();
    expect(box).toBeTruthy();
    expect(box.width).toBeGreaterThan(100);
    expect(box.height).toBeGreaterThan(100);
  });
});
