import { execSync } from "node:child_process";

// All Chromium-based browsers share the same AppleScript idiom
const CHROMIUM_BROWSERS = [
  "Google Chrome",
  "Google Chrome Canary",
  "Brave Browser",
  "Arc",
  "Microsoft Edge",
  "Opera",
  "Vivaldi",
  "Chromium",
  "Orion",
  "SigmaOS",
];

function chromiumScript(appName) {
  return `tell application "${appName}" to get URL of active tab of front window`;
}

const BROWSER_SCRIPTS = {
  Safari: `tell application "Safari" to get URL of front document`,
  // Firefox has no AppleScript URL property — use address bar keystroke hack
  Firefox: `
tell application "Firefox" to activate
delay 0.3
tell application "System Events"
  keystroke "l" using command down
  delay 0.2
  keystroke "c" using command down
  delay 0.2
  key code 53
end tell
delay 0.1
do shell script "pbpaste"`,
};

// Add all Chromium browsers to the script map
for (const browser of CHROMIUM_BROWSERS) {
  BROWSER_SCRIPTS[browser] = chromiumScript(browser);
}

export function getFrontmostApp() {
  return execSync(
    `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`
  )
    .toString()
    .trim();
}

export function isSupportedBrowser(appName) {
  return appName in BROWSER_SCRIPTS;
}

export function getSupportedBrowsers() {
  return Object.keys(BROWSER_SCRIPTS);
}

export function getUrlFromBrowser(appName) {
  const script = BROWSER_SCRIPTS[appName];
  if (!script) {
    throw new Error(
      `Unsupported browser: "${appName}". Supported: ${getSupportedBrowsers().join(", ")}`
    );
  }

  // Write script to a temp approach to avoid shell quoting issues
  const escaped = script.replace(/'/g, "'\\''");
  const url = execSync(`osascript -e '${escaped}'`).toString().trim();

  if (!url || !url.startsWith("http")) {
    throw new Error(`Could not get a valid URL from ${appName}. Got: "${url}"`);
  }

  return url;
}

export function detectMacOS() {
  const app = getFrontmostApp();

  if (!isSupportedBrowser(app)) {
    throw new Error(
      `Active app "${app}" is not a recognized browser.\nSupported: ${getSupportedBrowsers().join(", ")}\nUse --url <url> or --clipboard instead.`
    );
  }

  return { app, url: getUrlFromBrowser(app) };
}
