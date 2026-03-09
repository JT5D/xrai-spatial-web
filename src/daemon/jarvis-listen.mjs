#!/usr/bin/env node
/**
 * Jarvis Always-On Daemon — native macOS background listener.
 * No browser needed. Runs in terminal, listens through your Mac's mic.
 *
 * Pipeline: mic → sox → Groq Whisper (free STT) → wake word check →
 *           Groq Llama (free brain) → Edge TTS → afplay (speaker)
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = "/tmp/jarvis-daemon";
const JARVIS_SYSTEM = `You are Jarvis, an intelligent spatial navigation assistant. You are running as a native macOS daemon, always listening. Be concise — 1-3 sentences max. You have a warm, intelligent personality — helpful but not servile. You anticipate needs.

CRITICAL RULES:
- NEVER respond to incomplete thoughts. If the user's message seems cut off or ends mid-sentence, say only: "Go on."
- NEVER interrupt or talk over the user. Wait for a complete thought before responding.
- Keep responses SHORT. 1-2 sentences unless asked for detail.
- If the user says "don't talk so much" or similar, respond in 1 sentence max going forward.`;

// Config
const WAKE_WORDS = ["jarvis", "hey jarvis", "ok jarvis", "yo jarvis"];
const RECORD_SECONDS = 5;         // seconds per listening chunk (passive)
const ACTIVE_RECORD_SECONDS = 15; // much longer — let user finish thoughts
const SILENCE_THRESHOLD = "1.5%"; // sox silence detection threshold
const ACTIVE_SILENCE_SECS = "3.0"; // 3s silence to stop in active mode (patience!)
const PASSIVE_SILENCE_SECS = "1.5"; // 1.5s silence in passive mode
const SILENCE_ROUNDS_BEFORE_PASSIVE = 3; // need 3 silent rounds to go passive

// State
let mode = "passive";  // "passive" | "active" | "processing"
let silentRounds = 0;  // track consecutive silent rounds in active mode
let conversationHistory = [];
let groqClient = null;
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
      "-d",                    // default audio device (mic)
      "-r", "16000",           // 16kHz sample rate (optimal for Whisper)
      "-c", "1",               // mono
      "-b", "16",              // 16-bit
      outFile,
      "trim", "0", String(seconds),
      // Stop early on silence (after speech detected)
      "silence", "1", "0.1", SILENCE_THRESHOLD,  // start recording after sound
      "1", silDur, SILENCE_THRESHOLD,             // stop after silence duration
    ];

    const proc = spawn("sox", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => stderr += d.toString());

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
    }, (seconds + 2) * 1000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (fs.existsSync(outFile) && fs.statSync(outFile).size > 1000) {
        resolve(outFile);
      } else {
        // Silence — no meaningful audio
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
 * Check if text contains a wake word. Returns text after wake word, or null.
 */
function matchWakeWord(text) {
  const lower = text.toLowerCase().trim();
  for (const ww of WAKE_WORDS) {
    const idx = lower.indexOf(ww);
    if (idx !== -1) {
      return lower.slice(idx + ww.length).trim();
    }
  }
  return null;
}

/**
 * Get Jarvis response from Groq (free).
 */
async function getResponse(text) {
  conversationHistory.push({ role: "user", content: text });

  // Keep last 10 turns
  if (conversationHistory.length > 20) {
    conversationHistory = conversationHistory.slice(-20);
  }

  let response = "";
  for await (const event of groqClient.stream(JARVIS_SYSTEM, conversationHistory, [])) {
    if (event.type === "text_delta") response += event.text;
    if (event.type === "error") {
      log(`\x1b[31mAI Error: ${event.message}\x1b[0m`);
      return "I'm having trouble thinking right now. Try again.";
    }
  }

  conversationHistory.push({ role: "assistant", content: response });
  return response;
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

    // Play audio (blocking)
    execSync(`afplay "${outFile}"`, { stdio: "pipe" });
    fs.unlinkSync(outFile);
  } catch (err) {
    // Fallback to macOS say
    log(`Edge TTS failed, using macOS voice: ${err.message}`);
    execSync(`say -v "Samantha" "${text.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
  }
}

/**
 * Main loop — always listening.
 */
async function main() {
  groqClient = createGroqClient();
  if (!groqClient.isReady()) {
    console.error("GROQ_API_KEY not set. Add it to .env");
    process.exit(1);
  }

  console.log("\n\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
  console.log("\x1b[36m  Jarvis Always-On Daemon\x1b[0m");
  console.log("\x1b[36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
  console.log(`  Brain:    Llama 3.3 70B via Groq (free)`);
  console.log(`  Voice:    Edge TTS → macOS say (fallback)`);
  console.log(`  STT:      Groq Whisper (free)`);
  console.log(`  Wake:     "Hey Jarvis" / "Jarvis"`);
  console.log(`  Mode:     Always listening`);
  console.log(`\x1b[90m  Press Ctrl+C to stop\x1b[0m\n`);

  // Startup chime
  await speak("Jarvis online. I'm always listening.");

  while (true) {
    try {
      const isActive = mode === "active";
      const seconds = isActive ? ACTIVE_RECORD_SECONDS : RECORD_SECONDS;
      const silDur = isActive ? ACTIVE_SILENCE_SECS : PASSIVE_SILENCE_SECS;
      const audioPath = await recordAudio(seconds, silDur);

      if (!audioPath) {
        // Silence — need multiple silent rounds before going passive
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
      silentRounds = 0; // reset on any audio

      // Transcribe
      const text = await transcribe(audioPath);
      fs.unlinkSync(audioPath); // cleanup

      if (!text || text.length < 2) continue;

      if (mode === "passive") {
        // Check for wake word
        const afterWake = matchWakeWord(text);
        if (afterWake !== null) {
          log("\x1b[32m★ Wake word detected!\x1b[0m");
          mode = "active";

          if (afterWake.length > 2) {
            // User said something after wake word
            logUser(afterWake);
            mode = "processing";
            const response = await getResponse(afterWake);
            logJarvis(response);
            await speak(response);
            mode = "active"; // stay active for follow-up
          } else {
            // Just the wake word — wait for command
            await speak("Yes?");
          }
        }
        // else: not a wake word, keep listening passively
      } else if (mode === "active") {
        // Active mode — send everything to Jarvis
        logUser(text);
        mode = "processing";
        const response = await getResponse(text);
        logJarvis(response);
        await speak(response);
        mode = "active"; // stay active for follow-up
      }
    } catch (err) {
      log(`\x1b[31mError: ${err.message}\x1b[0m`);
      mode = "passive";
      // Brief pause on error
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\x1b[36mJarvis going offline.\x1b[0m");
  // Cleanup tmp files
  if (fs.existsSync(TMP_DIR)) {
    for (const f of fs.readdirSync(TMP_DIR)) {
      fs.unlinkSync(path.join(TMP_DIR, f));
    }
  }
  process.exit(0);
});

main();
