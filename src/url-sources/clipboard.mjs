import { execSync } from "node:child_process";

export function readClipboardUrl() {
  let text;

  if (process.platform === "darwin") {
    text = execSync("pbpaste").toString().trim();
  } else if (process.platform === "win32") {
    text = execSync('powershell -NoProfile -Command "Get-Clipboard"')
      .toString()
      .trim();
  } else {
    // Linux: try xclip, fall back to xsel
    try {
      text = execSync("xclip -selection clipboard -o").toString().trim();
    } catch {
      text = execSync("xsel --clipboard --output").toString().trim();
    }
  }

  if (!text || !text.match(/^https?:\/\//)) {
    throw new Error(
      `Clipboard does not contain a valid URL. Got: "${text?.slice(0, 80) || "(empty)"}"`
    );
  }

  return text;
}
