#!/usr/bin/env node
/**
 * Jarvis Always-On Daemon v2 — native macOS background listener WITH TOOLS.
 * No browser needed. Runs in terminal, listens through your Mac's mic.
 * Now with: shell commands, browser control, file access, shared memory.
 *
 * Pipeline: mic → sox → Groq Whisper (free STT) → wake word check →
 *           Groq Llama (free brain + tool calling) → execute tools →
 *           Edge TTS → afplay (speaker)
 *
 * Usage:
 *   node src/daemon/jarvis-listen.mjs
 *
 * Requires: sox (brew install sox)
 */
import "dotenv/config";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGroqClient } from "../server/agent/groq-client.mjs";
import { createGeminiClient } from "../server/agent/gemini-client.mjs";
import { TOOL_SCHEMAS, executeTool } from "./jarvis-tools.mjs";
import { memoryInit, memoryWrite } from "./shared-memory.mjs";
import { logActivity } from "./activity-log.mjs";
import { initLearning } from "./agent-learning.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = "/tmp/jarvis-daemon";
const JARVIS_SYSTEM = `You are Jarvis, an intelligent spatial navigation assistant running as a native macOS daemon.
You are always listening. You have a warm, intelligent personality — helpful but not servile.

YOU HAVE TOOLS. You are NOT just a chatbot. You can:
- Open browser windows (open_browser)
- Run shell commands (run_shell) — git, npm, ls, grep, etc.
- Read and write files (read_file, write_file)
- List directories (list_directory)
- Search codebases (search_project)
- Read/write shared memory (read_memory, write_memory)
- Read activity logs (read_activity_log)
- Record learnings/patterns (record_lesson) — saves to agent memory for auto-improvement
- Write to Knowledge Base (write_kb) — write research findings to the KB repo

When the user asks you to DO something (open a page, check code, create a file, search for something),
USE YOUR TOOLS. Don't just say you'll do it — actually do it.

AUTO-LEARNING:
- After completing significant tasks, use record_lesson to save what worked/failed.
- Categories: bug-fix, pattern, optimization, tool-usage, architecture.
- Use write_kb to save important research findings to the Knowledge Base.
- Check shared memory for lessons from other agents before attempting tasks.

AGENT COORDINATION:
- You work alongside "Claude Code" (another AI agent the user runs in their terminal).
- You share memory via read_memory/write_memory. Check it regularly for updates from Claude Code.
- Log important findings to memory so Claude Code can use them.
- If the user tells you something important, write it to memory.
- Be TOKEN EFFICIENT — keep responses short, truncate tool results mentally.

Known projects:
- xrai-spatial-web: /Users/jamestunick/Applications/web-scraper (this project)
- portals-v4: /Users/jamestunick/dev/portals_v4_fresh (React Native + Unity)

CRITICAL RULES:
- NEVER respond to incomplete thoughts. If the user's message seems cut off, say only: "Go on."
- Keep responses SHORT. 1-2 sentences unless asked for detail.
- When using tools, briefly say what you're doing, then report the result concisely.
- If the user says "don't talk so much", respond in 1 sentence max.`;

// Config
const WAKE_WORDS = ["jarvis", "hey jarvis", "ok jarvis", "yo jarvis"];
const RECORD_SECONDS = 5;
const ACTIVE_RECORD_SECONDS = 15;
const SILENCE_THRESHOLD = "1.5%";
const ACTIVE_SILENCE_SECS = "3.0";
const PASSIVE_SILENCE_SECS = "1.5";
const SILENCE_ROUNDS_BEFORE_PASSIVE = 3;
const MAX_TOOL_ROUNDS = 5; // max sequential tool calls per conversation turn

// State
let mode = "passive";
let silentRounds = 0;
let conversationHistory = [];
let groqClient = null;
let geminiClient = null;
let activeProvider = "groq"; // "groq" or "gemini"
let serverBaseUrl = "http://localhost:3210";

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[90m[${ts}]\x1b[0m ${msg}`);
}

function logJarvis(msg) {
  console.log(`\x1b[36m  Jarvis:\x1b[0m ${msg}`);
}

function logUser(msg) {
  console.log(`\x1b[33m  You:\x1b[0m ${msg}`);
}

function logTool(name, result) {
  const preview = String(result).slice(0, 80).replace(/\n/g, " ");
  console.log(`\x1b[35m  🔧 ${name}:\x1b[0m ${preview}`);
}

// Ensure tmp dir
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/**
 * Record audio from mic using sox, return path to WAV file.
 */
function recordAudio(seconds, silenceDuration) {
  return new Promise((resolve, reject) => {
    const outFile = path.join(TMP_DIR, `chunk-${Date.now()}.wav`);
    const silDur = silenceDuration || PASSIVE_SILENCE_SECS;
    const args = [
      "-d", "-r", "16000", "-c", "1", "-b", "16",
      outFile,
      "trim", "0", String(seconds),
      "silence", "1", "0.1", SILENCE_THRESHOLD,
      "1", silDur, SILENCE_THRESHOLD,
    ];

    const proc = spawn("sox", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => stderr += d.toString());

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
    }, (seconds + 2) * 1000);

    proc.on("close", () => {
      clearTimeout(timeout);
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
        resolve(outFile);
      } else {
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
        resolve(null);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Transcribe audio using Groq Whisper (free).
 */
async function transcribe(audioPath) {
  const formData = new FormData();
  formData.append("file", new Blob([fs.readFileSync(audioPath)]), "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("language", "en");
  formData.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.text?.trim() || "";
}

/**
 * Check if text contains a wake word.
 */
function matchWakeWord(text) {
  const lower = text.toLowerCase().trim();
  for (const ww of WAKE_WORDS) {
    const idx = lower.indexOf(ww);
    if (idx !== -1) return lower.slice(idx + ww.length).trim();
  }
  return null;
}

/**
 * Get the currently active AI client. Supports failover: Groq → Gemini.
 */
function getActiveClient() {
  if (activeProvider === "gemini" && geminiClient?.isReady()) return geminiClient;
  if (groqClient?.isReady()) return groqClient;
  if (geminiClient?.isReady()) return geminiClient;
  return null;
}

/**
 * Switch to fallback provider when primary fails.
 * Tracks failed providers to avoid ping-pong switching.
 */
let failedProviders = new Set(); // providers that are currently rate-limited
let allExhaustedUntil = 0; // timestamp — skip all requests until this time

function switchProvider(reason) {
  failedProviders.add(activeProvider);

  // Check if ALL providers are exhausted
  const availableProviders = ["groq", "gemini"].filter(p => {
    if (failedProviders.has(p)) return false;
    if (p === "groq" && !groqClient?.isReady()) return false;
    if (p === "gemini" && !geminiClient?.isReady()) return false;
    return true;
  });

  if (availableProviders.length === 0) {
    // All providers exhausted — cooldown for 60s
    allExhaustedUntil = Date.now() + 60_000;
    log(`\x1b[31m⚠ All AI providers rate-limited. Cooldown for 60s.\x1b[0m`);
    logActivity({ agent: "jarvis-daemon", action: "all-providers-exhausted", success: false, meta: { reason } });
    memoryWrite("jarvis-status", "all-providers-exhausted");
    // Schedule clearing failed providers after cooldown
    setTimeout(() => {
      failedProviders.clear();
      allExhaustedUntil = 0;
      log(`\x1b[36mCooldown over. Retrying providers.\x1b[0m`);
      memoryWrite("jarvis-status", "online");
    }, 60_000);
    return false;
  }

  const oldProvider = activeProvider;
  activeProvider = availableProviders[0];
  log(`\x1b[33m⚡ Switching ${oldProvider} → ${activeProvider} (${reason.slice(0, 60)})\x1b[0m`);
  logActivity({ agent: "jarvis-daemon", action: "provider-switch", success: true, meta: { from: oldProvider, to: activeProvider, reason: reason.slice(0, 100) } });
  memoryWrite("jarvis-provider", { active: activeProvider, reason: reason.slice(0, 80), switchedAt: new Date().toISOString() });
  return true;
}

// Periodically try to switch back to Groq (check every 10 min after failover)
let groqRetryTimer = null;
function scheduleGroqRetry() {
  if (groqRetryTimer) return;
  groqRetryTimer = setTimeout(() => {
    groqRetryTimer = null;
    failedProviders.delete("groq");
    if (activeProvider === "gemini" && groqClient?.isReady()) {
      log(`\x1b[36mTrying to switch back to Groq...\x1b[0m`);
      activeProvider = "groq";
    }
  }, 10 * 60_000); // 10 minutes
  groqRetryTimer.unref();
}

/**
 * Get Jarvis response with tool-calling loop and multi-provider failover.
 * Provider chain: Groq (free, fastest) → Gemini (free, higher daily limit).
 */
async function getResponse(text) {
  const start = Date.now();
  conversationHistory.push({ role: "user", content: text });

  // Aggressive trim — free tier limits
  if (conversationHistory.length > 10) {
    conversationHistory = conversationHistory.slice(-10);
  }

  // Estimate token count — nuke history if bloated
  const totalChars = conversationHistory.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : 200), 0);
  if (totalChars > 8000) {
    log(`\x1b[33mContext too large (${totalChars} chars), trimming to last 6 messages\x1b[0m`);
    conversationHistory = conversationHistory.slice(-6);
  }

  // If all providers are in cooldown, don't even try
  if (Date.now() < allExhaustedUntil) {
    const waitSec = Math.ceil((allExhaustedUntil - Date.now()) / 1000);
    return `All my AI providers are cooling down. Try again in ${waitSec} seconds.`;
  }

  let finalResponse = "";
  let toolRounds = 0;
  let retries = 0;
  const MAX_RETRIES = 2;
  let consecutiveErrors = 0;

  while (toolRounds < MAX_TOOL_ROUNDS) {
    let response = "";
    let toolCalls = [];
    let shouldRetry = false;

    const client = getActiveClient();
    if (!client) {
      return "I have no available AI providers right now. Please check API keys.";
    }

    try {
      for await (const event of client.stream(JARVIS_SYSTEM, conversationHistory, TOOL_SCHEMAS)) {
        if (event.type === "text_delta") response += event.text;
        if (event.type === "tool_use_done") {
          toolCalls.push({ id: event.id, name: event.name, input: event.input });
        }
        if (event.type === "error") {
          consecutiveErrors++;
          const isRateLimit = event.message.includes("429") || event.message.includes("rate limit") || event.message.includes("Rate limit") || event.message.includes("quota");

          if (isRateLimit) {
            // Try switching provider first
            const switched = switchProvider(`rate-limited: ${event.message.slice(0, 80)}`);
            if (switched) {
              scheduleGroqRetry();
              shouldRetry = true;
              retries = 0; // reset retries for new provider
              break;
            }
            // Same provider, do backoff retry
            if (retries < MAX_RETRIES) {
              const waitSec = 5 * (retries + 1);
              log(`\x1b[33mRate limited on ${activeProvider}, waiting ${waitSec}s... (retry ${retries + 1}/${MAX_RETRIES})\x1b[0m`);
              await new Promise(r => setTimeout(r, waitSec * 1000));
              retries++;
              shouldRetry = true;
              break;
            }
          }

          // On repeated errors, clear history and try fresh
          if (consecutiveErrors >= 2) {
            log(`\x1b[33mMultiple errors, clearing conversation history\x1b[0m`);
            conversationHistory = [{ role: "user", content: text }];
            consecutiveErrors = 0;
            shouldRetry = true;
            break;
          }
          log(`\x1b[31mAI Error (${activeProvider}): ${event.message}\x1b[0m`);
          logActivity({ agent: "jarvis-daemon", action: "ai-error", success: false, error: event.message, meta: { provider: activeProvider } });
          return "I'm having trouble thinking right now. Let me switch gears.";
        }
      }
    } catch (streamErr) {
      log(`\x1b[31mStream error (${activeProvider}): ${streamErr.message}\x1b[0m`);
      logActivity({ agent: "jarvis-daemon", action: "stream-error", success: false, error: streamErr.message, meta: { provider: activeProvider } });
      // Try switching provider on stream errors too
      const switched = switchProvider(`stream-error: ${streamErr.message.slice(0, 80)}`);
      if (switched) {
        shouldRetry = true;
      } else {
        conversationHistory = [{ role: "user", content: text }];
        return "I lost my train of thought. Could you repeat that?";
      }
    }

    if (shouldRetry) continue;
    consecutiveErrors = 0;

    if (toolCalls.length === 0) {
      finalResponse = response;
      break;
    }

    // Build assistant message for conversation history
    conversationHistory.push({
      role: "assistant",
      content: response || `Using tool: ${toolCalls.map(t => t.name).join(", ")}`,
    });

    // Execute each tool and build results
    for (const tc of toolCalls) {
      log(`\x1b[35m🔧 Tool: ${tc.name}(${JSON.stringify(tc.input).slice(0, 60)})\x1b[0m`);
      const result = executeTool(tc.name, tc.input);
      logTool(tc.name, result);

      // Feed tool result back — truncate HARD to stay within TPM limits
      const truncResult = String(result).slice(0, 500);
      conversationHistory.push({
        role: "user",
        content: `[Tool: ${tc.name}]: ${truncResult}`,
      });
    }

    toolRounds++;
    if (response) finalResponse = response;
  }

  const durationMs = Date.now() - start;
  logActivity({
    agent: "jarvis-daemon",
    action: "conversation",
    durationMs,
    success: true,
    meta: { userText: text.slice(0, 100), toolRounds, provider: activeProvider },
  });

  conversationHistory.push({ role: "assistant", content: finalResponse });
  return finalResponse;
}

/**
 * Speak text using Edge TTS via server, then play with afplay.
 */
async function speak(text) {
  if (!text) return;
  try {
    const res = await fetch(`${serverBaseUrl}/agent/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "en-US-GuyNeural" }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);

    const outFile = path.join(TMP_DIR, `speak-${Date.now()}.mp3`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outFile, buffer);
    execSync(`afplay "${outFile}"`, { stdio: "pipe" });
    fs.unlinkSync(outFile);
  } catch (err) {
    log(`Edge TTS failed, using macOS voice: ${err.message}`);
    execSync(`say -v "Samantha" "${text.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
  }
}

/**
 * Main loop — always listening.
 */
async function main() {
  groqClient = createGroqClient();
  geminiClient = createGeminiClient();

  if (!groqClient.isReady() && !geminiClient.isReady()) {
    console.error("No AI API keys set. Add GROQ_API_KEY or GEMINI_API_KEY to .env");
    process.exit(1);
  }

  // Start with Groq if available, otherwise Gemini
  if (groqClient.isReady()) {
    activeProvider = "groq";
  } else {
    activeProvider = "gemini";
    log("Groq unavailable, starting with Gemini");
  }

  // Initialize shared memory
  memoryInit();
  initLearning(); // Start auto-learning from activity log
  memoryWrite("jarvis-status", "online");
  memoryWrite("jarvis-capabilities", [
    "voice-listen", "voice-speak", "open-browser", "run-shell",
    "read-file", "write-file", "search-project", "shared-memory",
  ]);

  logActivity({
    agent: "jarvis-daemon",
    action: "startup",
    success: true,
    meta: { version: "2.0", tools: TOOL_SCHEMAS.length },
  });

  console.log("\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
  console.log("\x1b[36m  Jarvis Always-On Daemon v2\x1b[0m");
  console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
  const providers = [groqClient?.isReady() && "Groq", geminiClient?.isReady() && "Gemini"].filter(Boolean).join(" → ");
  console.log(`  Brain:    ${providers} (auto-failover)`);
  console.log(`  Voice:    Edge TTS → macOS say (fallback)`);
  console.log(`  STT:      Groq Whisper (free)`);
  console.log(`  Wake:     "Hey Jarvis" / "Jarvis"`);
  console.log(`  Tools:    ${TOOL_SCHEMAS.length} (browser, shell, files, memory, search)`);
  console.log(`  Memory:   /tmp/jarvis-daemon/shared-memory.json`);
  console.log(`  Log:      /tmp/jarvis-daemon/activity-log.jsonl`);
  console.log(`  Partner:  Claude Code (shared memory coordination)`);
  console.log(`\x1b[90m  Press Ctrl+C to stop\x1b[0m\n`);

  // Heartbeat — supervisor uses this to detect stalls
  const heartbeatTimer = setInterval(() => {
    memoryWrite("jarvis-heartbeat", Date.now());
  }, 30_000);
  heartbeatTimer.unref();

  await speak(`Jarvis online with ${activeProvider === "groq" ? "Groq" : "Gemini"} and auto-failover.`);

  while (true) {
    try {
      const isActive = mode === "active";
      const seconds = isActive ? ACTIVE_RECORD_SECONDS : RECORD_SECONDS;
      const silDur = isActive ? ACTIVE_SILENCE_SECS : PASSIVE_SILENCE_SECS;
      const audioPath = await recordAudio(seconds, silDur);

      if (!audioPath) {
        if (mode === "active") {
          silentRounds++;
          if (silentRounds >= SILENCE_ROUNDS_BEFORE_PASSIVE) {
            mode = "passive";
            silentRounds = 0;
            log("Returning to passive (extended silence)");
          } else {
            log(`Still listening... (silent round ${silentRounds}/${SILENCE_ROUNDS_BEFORE_PASSIVE})`);
          }
        }
        continue;
      }
      silentRounds = 0;

      const text = await transcribe(audioPath);
      fs.unlinkSync(audioPath);

      if (!text || text.length < 2) continue;

      if (mode === "passive") {
        const afterWake = matchWakeWord(text);
        if (afterWake !== null) {
          log("\x1b[32m★ Wake word detected!\x1b[0m");
          mode = "active";

          if (afterWake.length > 2) {
            logUser(afterWake);
            mode = "processing";
            const response = await getResponse(afterWake);
            logJarvis(response);
            await speak(response);
            mode = "active";
          } else {
            await speak("Yes?");
          }
        }
      } else if (mode === "active") {
        logUser(text);
        mode = "processing";
        const response = await getResponse(text);
        logJarvis(response);
        await speak(response);
        mode = "active";
      }
    } catch (err) {
      log(`\x1b[31mError: ${err.message}\x1b[0m`);
      logActivity({
        agent: "jarvis-daemon",
        action: "error",
        success: false,
        error: err.message,
      });
      mode = "passive";
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\x1b[36mJarvis going offline.\x1b[0m");
  memoryWrite("jarvis-status", "offline");
  logActivity({ agent: "jarvis-daemon", action: "shutdown", success: true });
  if (fs.existsSync(TMP_DIR)) {
    for (const f of fs.readdirSync(TMP_DIR)) {
      if (f.endsWith(".wav") || f.endsWith(".mp3")) {
        fs.unlinkSync(path.join(TMP_DIR, f));
      }
    }
  }
  process.exit(0);
});

main();
