import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,

  use: {
    baseURL: "http://localhost:3210",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Desktop browsers
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },

    // Mobile viewports
    { name: "iphone-15", use: { ...devices["iPhone 15"] } },
    { name: "iphone-15-pro-max", use: { ...devices["iPhone 15 Pro Max"] } },
    { name: "ipad-pro", use: { ...devices["iPad Pro 11"] } },
    { name: "pixel-7", use: { ...devices["Pixel 7"] } },
  ],

  // Server is expected to be running already (keepalive ensures this)
  // If you want auto-start: uncomment below
  // webServer: {
  //   command: "node scrape.mjs --serve",
  //   url: "http://localhost:3210/health",
  //   reuseExistingServer: true,
  //   timeout: 10_000,
  // },
});
