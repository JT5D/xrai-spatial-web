import "dotenv/config";
import { parseArgs } from "node:util";
import { resolveUrl } from "./url-sources/index.mjs";
import { scrape } from "./scraper.mjs";
import { saveOutput } from "./output.mjs";

const HELP = `
web-scraper — Scrape any webpage from any browser, any device.

USAGE
  node scrape.mjs                    Auto-detect active browser tab (macOS/Windows)
  node scrape.mjs --url <url>        Scrape a specific URL
  node scrape.mjs --clipboard        Scrape URL from clipboard (Universal Clipboard / Handoff)
  node scrape.mjs --serve            Start web UI (access from iPhone, Vision Pro, any device)

OPTIONS
  -u, --url <url>       Scrape a specific URL directly
  -c, --clipboard       Read URL from system clipboard
  -s, --serve           Start web UI server for remote access
  -p, --port <port>     Server port (default: 3210)
  -o, --output-dir <d>  Output directory (default: current directory)
  -h, --help            Show this help message

EXAMPLES
  node scrape.mjs                                # Focus browser, then run
  node scrape.mjs --url "https://example.com"    # Direct URL
  node scrape.mjs --clipboard                    # From iPhone/Vision Pro via Handoff
  node scrape.mjs --serve                        # Web UI at http://localhost:3210
  node scrape.mjs --serve --port 8080            # Custom port

SUPPORTED BROWSERS (auto-detect, no plugin needed)
  macOS:   Chrome, Safari, Firefox, Arc, Brave, Edge, Opera, Vivaldi
  Windows: Chrome, Edge, Brave, Firefox (via UI Automation)
`.trim();

export async function run() {
  const { values } = parseArgs({
    options: {
      url: { type: "string", short: "u" },
      clipboard: { type: "boolean", short: "c", default: false },
      serve: { type: "boolean", short: "s", default: false },
      port: { type: "string", short: "p", default: "3210" },
      "output-dir": { type: "string", short: "o", default: "." },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  if (values.serve) {
    const { startServer } = await import("./server/index.mjs");
    startServer({
      port: values.port,
      outputDir: values["output-dir"],
    });
    return;
  }

  // CLI scrape mode
  try {
    const { app, url } = await resolveUrl(values);
    console.log(`Source: ${app}`);
    console.log(`Fetching: ${url}`);

    const data = await scrape(url);
    const { mdPath, jsonPath } = saveOutput(data, values["output-dir"]);

    console.log(`Saved: ${mdPath}`);
    console.log(`Saved: ${jsonPath}`);
    console.log(
      `\nDone! "${data.title}" — ${data.links.length} links, ${data.images.length} images.`
    );
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
