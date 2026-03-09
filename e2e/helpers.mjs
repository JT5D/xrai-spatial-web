/**
 * E2E test helpers — screenshot capture, console logging, device info.
 */
import path from "node:path";

const SCREENSHOTS_DIR = path.join(import.meta.dirname, "screenshots");

/**
 * Take a timestamped screenshot for milestone documentation.
 * Format: YYYY-MM-DD_HH-MM-SS_<label>_<browser>.png
 */
export async function milestone(page, label, testInfo) {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const browser = testInfo?.project?.name || "unknown";
  const safeName = label.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
  const filename = `${ts}_${safeName}_${browser}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  testInfo?.attach(label, { path: filepath, contentType: "image/png" });
  return filepath;
}

/**
 * Capture all console messages during a test.
 * Returns { logs, warnings, errors } arrays.
 */
export function captureConsole(page) {
  const logs = [];
  const warnings = [];
  const errors = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") errors.push(text);
    else if (msg.type() === "warning") warnings.push(text);
    else logs.push(text);
  });

  page.on("pageerror", (err) => {
    errors.push(`[PAGE ERROR] ${err.message}`);
  });

  return { logs, warnings, errors };
}
