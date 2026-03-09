import { test, expect } from "@playwright/test";
import { milestone, captureConsole } from "./helpers.mjs";

/**
 * Screenshot capture tests — documents the visual state of every page
 * across browsers and viewports. Screenshots are saved with timestamps
 * for historical comparison.
 */
test.describe("Visual Milestones", () => {
  test("scraper UI — empty state", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await milestone(page, "scraper-ui-empty", testInfo);
  });

  test("scraper UI — after scraping example.com", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.locator('input[name="url"]').fill("https://example.com");
    await page.locator("#btn").click();
    await expect(page.locator("#result-container")).toBeVisible({ timeout: 15_000 });
    await milestone(page, "scraper-ui-results", testInfo);
  });

  test("spatial viewer — empty state", async ({ page }, testInfo) => {
    await page.goto("/spatial");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1_000);
    await milestone(page, "spatial-viewer-empty", testInfo);
  });

  test("dashboard — agent monitor", async ({ page }, testInfo) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1_000);
    await milestone(page, "dashboard-agents", testInfo);
  });

  test("health endpoint — JSON response", async ({ page }, testInfo) => {
    await page.goto("/health");
    await page.waitForLoadState("domcontentloaded");
    await milestone(page, "health-endpoint", testInfo);
  });
});
