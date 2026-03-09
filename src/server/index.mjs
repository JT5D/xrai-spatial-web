import "dotenv/config";
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
import { createGeminiClient } from "./agent/gemini-client.mjs";
import { createGroqClient } from "./agent/groq-client.mjs";
import { createJarvis } from "./agent/jarvis.mjs";
import { createAgentWS } from "./agent/agent-ws.mjs";
import { speak as edgeTTSSpeak, listVoices as edgeTTSVoices } from "./agent/edge-tts-proxy.mjs";
import { speak as elevenSpeak, listVoices as elevenVoices, isConfigured as elevenConfigured } from "./agent/elevenlabs-proxy.mjs";
import { createRoomManager } from "./multiplayer/room-manager.mjs";
import { createPresenceWS } from "./multiplayer/presence-ws.mjs";
import { createAgentRegistry } from "./agent/agent-registry.mjs";
import { getDashboardHtml } from "./dashboard-ui.mjs";

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

    // Agent Dashboard
    if (req.method === "GET" && url.pathname === "/dashboard") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getDashboardHtml());
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
      const claude = createClaudeClient();
      const gemini = createGeminiClient();
      const groq = createGroqClient();
      const ready = groq.isReady() || gemini.isReady() || claude.isReady();
      const provider = groq.isReady() ? "groq" : gemini.isReady() ? "gemini" : claude.isReady() ? "claude" : "none";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready, provider }));
      return;
    }

    // Live system state for System HUD visualization
    if (req.method === "GET" && url.pathname === "/agent/system-state") {
      try {
        const MEM_FILE = "/tmp/jarvis-daemon/shared-memory.json";
        const LOG_FILE = "/tmp/jarvis-daemon/activity-log.jsonl";

        // Read shared memory
        let mem = {};
        try { mem = JSON.parse(fs.readFileSync(MEM_FILE, "utf-8")); } catch {}

        // Read last 50 activity log entries
        let recentFlows = [];
        try {
          const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n");
          recentFlows = lines.slice(-50).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        } catch {}

        // Build provider status
        const groq = createGroqClient();
        const gemini = createGeminiClient();
        const claude = createClaudeClient();

        const providerInfo = mem["jarvis-provider"] || {};
        const jarvisStatus = mem["jarvis-status"] || "unknown";

        const state = {
          agents: [
            { id: "jarvis", name: "Jarvis Daemon", status: jarvisStatus, provider: providerInfo.active || "groq", tools: 11, pid: mem["jarvis-supervisor"]?.pid },
            { id: "claude-code", name: "Claude Code", status: "active", provider: "claude", tools: 0 },
          ],
          providers: [
            { id: "groq", name: "Groq (Llama 3.3 70B)", status: groq.isReady() ? (providerInfo.active === "gemini" ? "rate-limited" : "ok") : "unavailable", model: "llama-3.3-70b-versatile" },
            { id: "gemini", name: "Gemini 2.5 Flash", status: gemini.isReady() ? (providerInfo.active === "gemini" ? "active" : "standby") : "unavailable", model: "gemini-2.5-flash" },
            { id: "claude", name: "Claude Opus", status: claude.isReady() ? "active" : "unavailable", model: "claude-opus-4-6" },
            { id: "whisper", name: "Groq Whisper (STT)", status: groq.isReady() ? "ok" : "unavailable", model: "whisper-large-v3" },
            { id: "edge-tts", name: "Edge TTS", status: "ok", model: "en-US-GuyNeural" },
          ],
          tools: [
            { id: "run_shell", name: "Shell", agent: "jarvis" },
            { id: "open_browser", name: "Browser", agent: "jarvis" },
            { id: "read_file", name: "Read File", agent: "jarvis" },
            { id: "write_file", name: "Write File", agent: "jarvis" },
            { id: "search_project", name: "Search", agent: "jarvis" },
            { id: "read_memory", name: "Read Mem", agent: "jarvis" },
            { id: "write_memory", name: "Write Mem", agent: "jarvis" },
            { id: "record_lesson", name: "Learn", agent: "jarvis" },
            { id: "write_kb", name: "KB Write", agent: "jarvis" },
            { id: "read_activity_log", name: "Activity Log", agent: "jarvis" },
            { id: "list_directory", name: "List Dir", agent: "jarvis" },
          ],
          memory: { id: "shared-memory", name: "Shared Memory", path: MEM_FILE, size: JSON.stringify(mem).length },
          flows: recentFlows.slice(-20).map(f => ({
            ts: f.ts, agent: f.agent, action: f.action, success: f.success,
          })),
          supervisor: mem["jarvis-supervisor"] || {},
          heartbeat: mem["jarvis-heartbeat"],
          _ts: new Date().toISOString(),
        };

        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify(state));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Edge TTS endpoint — synthesize text to MP3 audio
    if (req.method === "POST" && url.pathname === "/agent/tts") {
      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { text, voice } = JSON.parse(body);

        if (!text?.trim()) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "text is required" }));
          return;
        }

        const audioBuffer = await edgeTTSSpeak(text, { voice });
        res.writeHead(200, {
          "Content-Type": "audio/mpeg",
          "Content-Length": audioBuffer.length,
          "Cache-Control": "no-cache",
        });
        res.end(audioBuffer);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // TTS voices list
    if (req.method === "GET" && url.pathname === "/agent/tts/voices") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(edgeTTSVoices()));
      return;
    }

    // ElevenLabs TTS synthesis (premium)
    if (req.method === "POST" && url.pathname === "/agent/tts/elevenlabs") {
      if (!elevenConfigured()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "ELEVENLABS_API_KEY not set" }));
        return;
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { text, voice } = JSON.parse(body);
          const audio = await elevenSpeak(text, { voice });
          res.writeHead(200, { "Content-Type": "audio/mpeg", "Content-Length": audio.length });
          res.end(audio);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // ElevenLabs voices list
    if (req.method === "GET" && url.pathname === "/agent/tts/elevenlabs/voices") {
      if (!elevenConfigured()) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not configured" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(elevenVoices()));
      return;
    }

    // Agent dashboard — list all agents
    if (req.method === "GET" && url.pathname === "/agent/dashboard") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ agents: agentRegistry.getAll(), ts: Date.now() }));
      return;
    }

    // Agent dashboard — register a new agent
    if (req.method === "POST" && url.pathname === "/agent/dashboard/register") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const opts = JSON.parse(body);
          const id = agentRegistry.register(opts);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ id, agent: agentRegistry.get(id) }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Agent dashboard — update an agent
    if (req.method === "POST" && url.pathname === "/agent/dashboard/update") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { id, ...updates } = JSON.parse(body);
          agentRegistry.update(id, updates);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Agent dashboard — SSE stream for real-time updates
    if (req.method === "GET" && url.pathname === "/agent/dashboard/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      // Send current state
      res.write(`data: ${JSON.stringify({ type: "snapshot", agents: agentRegistry.getAll() })}\n\n`);

      // Subscribe to updates
      const unsub = agentRegistry.subscribe((json) => {
        res.write(`data: ${json}\n\n`);
      });

      req.on("close", unsub);
      return;
    }

    // Multiplayer rooms list
    if (req.method === "GET" && url.pathname === "/rooms") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(roomManager.listRooms()));
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

  // Initialize AI client — free-first, never blocked by billing.
  // Priority: Groq (free, fastest) → Gemini Flash (free) → Claude (premium)
  // Set PREFER_CLAUDE=1 to override and use Claude when credits exist.
  const claudeClient = createClaudeClient();
  const geminiClient = createGeminiClient();
  const groqClient = createGroqClient();
  const preferClaude = process.env.PREFER_CLAUDE === "1" && claudeClient.isReady();

  let aiClient, aiProvider;
  if (preferClaude) {
    aiClient = claudeClient;
    aiProvider = "claude-sonnet-4 (premium)";
  } else if (groqClient.isReady()) {
    aiClient = groqClient;
    aiProvider = "llama-3.3-70b via Groq (free)";
  } else if (geminiClient.isReady()) {
    aiClient = geminiClient;
    aiProvider = "gemini-2.0-flash (free)";
  } else if (claudeClient.isReady()) {
    aiClient = claudeClient;
    aiProvider = "claude-sonnet-4 (premium)";
  } else {
    aiClient = claudeClient; // will show "not ready"
    aiProvider = "none";
  }

  const jarvis = createJarvis(aiClient);
  createAgentWS(server, jarvis);

  // Initialize multiplayer rooms
  const roomManager = createRoomManager();
  const agentRegistry = createAgentRegistry();

  // Register Jarvis as the first agent
  const jarvisAgentId = agentRegistry.register({
    name: "Jarvis",
    type: "voice",
    meta: { model: aiProvider },
  });
  agentRegistry.update(jarvisAgentId, {
    status: aiClient.isReady() ? "idle" : "blocked",
    currentTask: aiClient.isReady() ? "Awaiting commands" : "Needs ANTHROPIC_API_KEY or GEMINI_API_KEY",
  });
  createPresenceWS(server, roomManager);

  server.listen(port, "0.0.0.0", () => {
    const ips = getLocalIPs();
    console.log("\nWeb Scraper running:");
    console.log(`  Scraper: http://localhost:${port}`);
    console.log(`  Spatial: http://localhost:${port}/spatial`);
    console.log(`  Jarvis:  ${aiClient.isReady() ? `ready (${aiProvider})` : "set ANTHROPIC_API_KEY or GEMINI_API_KEY"}`);
    const ttsInfo = elevenConfigured()
      ? "ElevenLabs (premium) + Edge TTS (fallback)"
      : "Edge TTS (neural voice, no API key)";
    console.log(`  TTS:     ${ttsInfo}`);
    console.log(`  Dash:    http://localhost:${port}/dashboard (agent monitor)`);
    console.log(`  Rooms:   ws://localhost:${port}/rooms (multiplayer)`);
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
