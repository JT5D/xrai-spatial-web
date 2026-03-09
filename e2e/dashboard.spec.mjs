import { test, expect } from "@playwright/test";

test.describe("Agent Dashboard", () => {
  test("loads and shows dashboard content", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveTitle(/.*/, { timeout: 5_000 });
    // Dashboard should have some content
    const body = await page.locator("body").textContent();
    expect(body.length).toBeGreaterThan(50);
  });

  test("no console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    // Give scripts time to run without waiting for SSE to go idle
    await page.waitForTimeout(2_000);
    expect(errors).toHaveLength(0);
  });

  test("GET /agent/dashboard returns agent list", async ({ request }) => {
    const res = await request.get("/agent/dashboard");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.agents).toBeDefined();
    expect(body.ts).toBeGreaterThan(0);
  });

  test("SSE stream connects and receives snapshot", async ({ page }) => {
    // Test SSE endpoint via page
    await page.setContent(`
      <div id="status">connecting</div>
      <div id="data"></div>
      <script>
        const es = new EventSource('http://localhost:3210/agent/dashboard/stream');
        es.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          document.getElementById('data').textContent = msg.type || 'unknown';
          document.getElementById('status').textContent = 'received';
          es.close();
        };
        es.onerror = () => {
          document.getElementById('status').textContent = 'error';
        };
      </script>
    `);

    await expect(page.locator("#status")).toHaveText("received", { timeout: 5_000 });
    const data = await page.locator("#data").textContent();
    expect(data).toBe("snapshot");
  });
});
