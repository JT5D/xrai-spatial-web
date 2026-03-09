import { readClipboardUrl } from "./clipboard.mjs";

export async function resolveUrl(options) {
  // 1. Explicit --url flag always wins
  if (options.url) {
    return { app: "manual", url: options.url };
  }

  // 2. --clipboard: read from system clipboard (supports Universal Clipboard / Handoff)
  if (options.clipboard) {
    const url = readClipboardUrl();
    return { app: "clipboard", url };
  }

  // 3. Auto-detect from active browser (platform-specific)
  if (process.platform === "darwin") {
    const { detectMacOS } = await import("./detect-macos.mjs");
    return detectMacOS();
  }

  if (process.platform === "win32") {
    const { detectWindows } = await import("./detect-windows.mjs");
    return detectWindows();
  }

  // 4. Unsupported platform for auto-detect
  throw new Error(
    `Auto-detect not supported on ${process.platform}. Use --url <url>, --clipboard, or --serve.`
  );
}
