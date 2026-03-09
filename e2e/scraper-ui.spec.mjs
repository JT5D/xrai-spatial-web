import { test, expect } from "@playwright/test";

test.describe("Scraper UI (main page)", () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on("pageerror", (err) => {
      console.error(`[PAGE ERROR] ${err.message}`);
    });
    await page.goto("/");
  });

  test("loads and shows form", async ({ page }) => {
    await expect(page.locator("#form")).toBeVisible();
    await expect(page.locator('input[name="url"]')).toBeVisible();
    await expect(page.locator("#btn")).toBeVisible();
    await expect(page.locator("#btn")).toHaveText("Scrape");
  });

  test("input is autofocused", async ({ page }) => {
    const input = page.locator('input[name="url"]');
    await expect(input).toBeFocused();
  });

  test("scrapes a valid URL and shows results", async ({ page }) => {
    const input = page.locator('input[name="url"]');
    await input.fill("https://example.com");
    await page.locator("#btn").click();

    // Wait for results to appear
    await expect(page.locator("#result-container")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("#title")).toContainText("Example Domain");

    // Stats should show
    await expect(page.locator("#stats")).toBeVisible();

    // Button should be re-enabled after scrape
    await expect(page.locator("#btn")).toBeEnabled({ timeout: 5_000 });
  });

  test("shows error for invalid URL", async ({ page }) => {
    const input = page.locator('input[name="url"]');
    await input.fill("not-a-valid-url");
    await page.locator("#btn").click();

    // Should show error status
    await expect(page.locator("#status")).toBeVisible({ timeout: 10_000 });
  });

  test("no console errors on load", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toHaveLength(0);
  });
});
