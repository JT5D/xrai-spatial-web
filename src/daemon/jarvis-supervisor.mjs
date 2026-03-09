#!/usr/bin/env node
/**
 * Jarvis Supervisor — fault-tolerant watchdog that auto-restarts the daemon.
 *
 * Features:
 *   - Auto-restart on crash with escalating backoff (1s → 2s → 4s → 8s → 30s max)
 *   - Health monitoring via shared memory heartbeat
 *   - Stall detection (if daemon stops updating heartbeat for 60s, restart)
 *   - Max restart limit per hour (10) to avoid infinite crash loops
 *   - Graceful shutdown propagation (SIGINT/SIGTERM → child)
 *   - Activity logging of all restart events
 *   - State preservation (shared memory survives restarts)
 *
 * Usage:
 *   node src/daemon/jarvis-supervisor.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DAEMON_SCRIPT = path.join(__dirname, "jarvis-listen.mjs");
const MEM_FILE = "/tmp/jarvis-daemon/shared-memory.json";
const LOG_FILE = "/tmp/jarvis-daemon/activity-log.jsonl";
const TMP_DIR = "/tmp/jarvis-daemon";

// ─── Config ───
const MAX_RESTARTS_PER_HOUR = 10;
const STALL_TIMEOUT_MS = 90_000; // 90s without heartbeat = stalled
const HEALTH_CHECK_INTERVAL_MS = 15_000; // check every 15s
const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

// ─── State ───
let child = null;
let restartCount = 0;
let restartTimestamps = [];
let backoffMs = MIN_BACKOFF_MS;
let shuttingDown = false;
let healthCheckTimer = null;

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\x1b[90m[${ts}]\x1b[0m \x1b[34m[supervisor]\x1b[0m ${msg}`);
}

function logToFile(entry) {
  try {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    const record = { ts: new Date().toISOString(), ...entry };
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n");
  } catch {}
}

function updateMemory(key, value) {
  try {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    let data = {};
    if (fs.existsSync(MEM_FILE)) {
      data = JSON.parse(fs.readFileSync(MEM_FILE, "utf-8"));
    }
    data[key] = value;
    data._lastUpdated = new Date().toISOString();
    data._lastUpdatedBy = "jarvis-supervisor";
    const tmp = MEM_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, MEM_FILE);
  } catch {}
}

function readMemory(key) {
  try {
    if (!fs.existsSync(MEM_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(MEM_FILE, "utf-8"));
    return data[key] ?? null;
  } catch {
    return null;
  }
}

// ─── Rate limiting restarts ───

function canRestart() {
  const now = Date.now();
  const oneHourAgo = now - 3600_000;
  restartTimestamps = restartTimestamps.filter(t => t > oneHourAgo);
  return restartTimestamps.length < MAX_RESTARTS_PER_HOUR;
}

// ─── Spawn daemon ───

function spawnDaemon() {
  if (shuttingDown) return;

  if (!canRestart()) {
    log(`\x1b[31mMax restarts (${MAX_RESTARTS_PER_HOUR}/hr) exceeded. Waiting 5 minutes...\x1b[0m`);
    logToFile({ agent: "jarvis-supervisor", action: "restart-limit-hit", success: false });
    updateMemory("jarvis-status", "restart-limit-hit");
    setTimeout(() => {
      restartTimestamps = [];
      spawnDaemon();
    }, 300_000);
    return;
  }

  log(`Starting Jarvis daemon... (restart #${restartCount})`);
  updateMemory("jarvis-status", "starting");
  updateMemory("jarvis-supervisor", {
    pid: process.pid,
    restartCount,
    lastRestart: new Date().toISOString(),
    backoffMs,
  });

  child = spawn("node", [DAEMON_SCRIPT], {
    stdio: ["pipe", "inherit", "inherit"],
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env },
  });

  restartTimestamps.push(Date.now());
  restartCount++;

  child.on("exit", (code, signal) => {
    child = null;

    if (shuttingDown) {
      log("Daemon stopped (shutdown requested).");
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    log(`\x1b[33mDaemon exited (${reason}). Restarting in ${backoffMs}ms...\x1b[0m`);

    logToFile({
      agent: "jarvis-supervisor",
      action: "daemon-crashed",
      success: false,
      error: reason,
      meta: { restartCount, backoffMs },
    });

    updateMemory("jarvis-status", "restarting");

    // Escalating backoff
    setTimeout(spawnDaemon, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  });

  child.on("error", (err) => {
    log(`\x1b[31mFailed to spawn daemon: ${err.message}\x1b[0m`);
    logToFile({
      agent: "jarvis-supervisor",
      action: "spawn-error",
      success: false,
      error: err.message,
    });
  });

  // Reset backoff on successful sustained run (30s without crash)
  setTimeout(() => {
    if (child && !child.killed) {
      backoffMs = MIN_BACKOFF_MS;
    }
  }, 30_000);
}

// ─── Health monitoring ───

function checkHealth() {
  if (shuttingDown || !child) return;

  try {
    if (!fs.existsSync(MEM_FILE)) return;
    const data = JSON.parse(fs.readFileSync(MEM_FILE, "utf-8"));
    const lastUpdate = data._lastUpdated ? new Date(data._lastUpdated).getTime() : 0;
    const staleness = Date.now() - lastUpdate;

    if (staleness > STALL_TIMEOUT_MS && data._lastUpdatedBy !== "jarvis-supervisor") {
      log(`\x1b[33mDaemon appears stalled (${Math.round(staleness / 1000)}s since last update). Restarting...\x1b[0m`);
      logToFile({
        agent: "jarvis-supervisor",
        action: "stall-detected",
        success: false,
        meta: { stalenessMs: staleness },
      });

      // Kill and let the exit handler restart
      if (child) {
        child.kill("SIGTERM");
        // Force kill after 5s if still alive
        setTimeout(() => {
          if (child) child.kill("SIGKILL");
        }, 5000);
      }
    }
  } catch {}
}

// ─── Graceful shutdown ───

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`\x1b[36mReceived ${signal}. Shutting down gracefully...\x1b[0m`);

  if (healthCheckTimer) clearInterval(healthCheckTimer);

  if (child) {
    child.kill("SIGTERM");
    // Force kill after 5s
    setTimeout(() => {
      if (child) {
        child.kill("SIGKILL");
      }
      process.exit(0);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── Main ───

console.log("\n\x1b[34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
console.log("\x1b[34m  Jarvis Supervisor — Fault-Tolerant Watchdog\x1b[0m");
console.log("\x1b[34m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
console.log(`  Max restarts/hr: ${MAX_RESTARTS_PER_HOUR}`);
console.log(`  Stall timeout:   ${STALL_TIMEOUT_MS / 1000}s`);
console.log(`  Health check:    every ${HEALTH_CHECK_INTERVAL_MS / 1000}s`);
console.log(`  Backoff:         ${MIN_BACKOFF_MS}ms → ${MAX_BACKOFF_MS}ms`);
console.log(`\x1b[90m  Press Ctrl+C to stop\x1b[0m\n`);

logToFile({
  agent: "jarvis-supervisor",
  action: "startup",
  success: true,
  meta: { pid: process.pid },
});

// Start health monitoring
healthCheckTimer = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);

// Spawn the daemon
spawnDaemon();
