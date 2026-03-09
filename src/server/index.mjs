import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getUiHtml } from "./ui.mjs";
import { getSpatialUiHtml } from "./spatial-ui.mjs";
import { scrape } from "../scraper.mjs";
import { extract } from "../extractor.mjs";
import { saveOutput } from "../output.mjs";
import { createClaudeClient } from "./agent/claude-client.mjs";
import { createJarvis } from "./agent/jarvis.mjs";
import { createAgentWS } from "./agent/agent-ws.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  ".mjs": "application/javascript",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".html": "text/html",
};

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

export function startServer(options = {}) {
  const port = parseInt(options.port) || 3210;
  const outputDir = options.outputDir || ".";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // Serve the web UI
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getUiHtml());
      return;
    }

    // Scrape endpoint
    if (req.method === "POST" && url.pathname === "/scrape") {
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { url: targetUrl } = JSON.parse(body);

        if (!targetUrl || !targetUrl.startsWith("http")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid URL" }));
          return;
        }

        const data = await scrape(targetUrl);

        // Save files on the server side too
        const { mdPath, jsonPath } = saveOutput(data, outputDir);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ...data,
            savedFiles: { md: mdPath, json: jsonPath },
          })
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Serve the spatial 3D viewer
    if (req.method === "GET" && url.pathname === "/spatial") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getSpatialUiHtml());
      return;
    }

    // Extract endpoint (enriched metadata + concept graph)
    if (req.method === "POST" && url.pathname === "/extract") {
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { url: targetUrl } = JSON.parse(body);

        if (!targetUrl || !targetUrl.startsWith("http")) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid URL" }));
          return;
        }

        const data = await extract(targetUrl);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Agent status endpoint
    if (req.method === "GET" && url.pathname === "/agent/status") {
      const claudeClient = createClaudeClient();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: claudeClient.isReady() }));
      return;
    }

    // Serve HUD static files from src/server/hud/
    if (req.method === "GET" && url.pathname.startsWith("/hud/")) {
      const rel = url.pathname.slice(5); // strip "/hud/"
      if (rel.includes("..") || !rel) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Bad request");
        return;
      }
      const filePath = path.join(__dirname, "hud", rel);
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { "Content-Type": mime });
        res.end(content);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  // Initialize Jarvis agent + WebSocket
  const claudeClient = createClaudeClient();
  const jarvis = createJarvis(claudeClient);
  createAgentWS(server, jarvis);

  server.listen(port, "0.0.0.0", () => {
    const ips = getLocalIPs();
    console.log("\nWeb Scraper running:");
    console.log(`  Scraper: http://localhost:${port}`);
    console.log(`  Spatial: http://localhost:${port}/spatial`);
    console.log(`  Jarvis:  ${claudeClient.isReady() ? "ready" : "set ANTHROPIC_API_KEY to enable"}`);
    ips.forEach((ip) => {
      console.log(`  Network: http://${ip}:${port}`);
    });
    console.log(
      "\nOpen the network URL on your iPhone, Vision Pro, or any device.\n"
    );
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
