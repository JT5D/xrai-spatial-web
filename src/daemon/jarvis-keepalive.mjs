#!/usr/bin/env node
/**
 * Jarvis Keep-Alive — ensures Jarvis + web server survive sleep/wake cycles.
 *
 * Responsibilities:
 * 1. Detect macOS sleep/wake via IOKit power assertions
 * 2. On wake: verify Jarvis supervisor + web server are running, restart if not
 * 3. Keep caffeinate alive to prevent sleep
 * 4. Write heartbeat to shared memory for cross-device monitoring
 * 5. Expose /health on the web server for phone-side checks
 *
 * Run: node src/daemon/jarvis-keepalive.mjs
 * Or install as launchd service: see scripts/install-launchd.sh
 */

import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MEM_FILE = "/tmp/jarvis-daemon/shared-memory.json";
const LOG_FILE = "/tmp/jarvis-daemon/keepalive.log";

const HEALTH_CHECK_INTERVAL = 15_000; // 15s
const HEARTBEAT_INTERVAL = 10_000;    // 10s

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] [keepalive] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

function isProcessRunning(name) {
  try {
    const out = execSync(`pgrep -f "${name}"`, { encoding: "utf-8", timeout: 3000 });
    return out.trim().split("\n").filter(Boolean).length > 0;
  } catch {
    return false;
  }
}

function ensureSupervisor() {
  if (isProcessRunning("jarvis-supervisor.mjs")) {
    return true;
  }
  log("Jarvis supervisor not running — starting...");
  try {
    const child = spawn("node", ["src/daemon/jarvis-supervisor.mjs"], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, HOME: process.env.HOME },
    });
    child.unref();
    log(`Jarvis supervisor started (PID ${child.pid})`);
    return true;
  } catch (err) {
    log(`Failed to start supervisor: ${err.message}`);
    return false;
  }
}

function ensureServer() {
  if (isProcessRunning("scrape.mjs --serve")) {
    return true;
  }
  log("Web server not running — starting...");
  try {
    const child = spawn("node", ["scrape.mjs", "--serve"], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: ["ignore", "ignore", "ignore"],
      env: { ...process.env, HOME: process.env.HOME },
    });
    child.unref();
    log(`Web server started (PID ${child.pid})`);
    return true;
  } catch (err) {
    log(`Failed to start server: ${err.message}`);
    return false;
  }
}

function ensureCaffeinate() {
  if (isProcessRunning("caffeinate")) {
    return true;
  }
  log("caffeinate not running — starting...");
  try {
    const child = spawn("caffeinate", ["-dims"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    log("caffeinate started");
    return true;
  } catch (err) {
    log(`Failed to start caffeinate: ${err.message}`);
    return false;
  }
}

function writeHeartbeat() {
  try {
    const raw = fs.readFileSync(MEM_FILE, "utf-8");
    const mem = JSON.parse(raw);
    mem["keepalive-heartbeat"] = Date.now();
    mem["keepalive-status"] = {
      supervisor: isProcessRunning("jarvis-supervisor.mjs"),
      server: isProcessRunning("scrape.mjs --serve"),
      caffeinate: isProcessRunning("caffeinate"),
      pid: process.pid,
      uptimeMin: Math.floor(process.uptime() / 60),
    };
    const tmp = MEM_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(mem, null, 2));
    fs.renameSync(tmp, MEM_FILE);
  } catch {}
}

/**
 * Detect macOS sleep/wake by watching pmset log.
 * On wake, force health check immediately.
 */
let lastSleepCheck = 0;
function checkForWakeEvent() {
  const now = Date.now();
  if (now - lastSleepCheck < 5000) return false;
  lastSleepCheck = now;

  try {
    // If the system just woke, there will be a gap in our heartbeat timing
    // We detect this by checking if more than 2x our interval passed since last heartbeat
    const raw = fs.readFileSync(MEM_FILE, "utf-8");
    const mem = JSON.parse(raw);
    const lastHB = mem["keepalive-heartbeat"] || 0;
    const gap = now - lastHB;
    if (gap > HEARTBEAT_INTERVAL * 3) {
      log(`Wake detected! Heartbeat gap: ${Math.floor(gap / 1000)}s — forcing health check`);
      return true;
    }
  } catch {}
  return false;
}

function healthCheck() {
  const woke = checkForWakeEvent();

  const supervisorOk = ensureSupervisor();
  const serverOk = ensureServer();
  ensureCaffeinate();
  writeHeartbeat();

  if (woke) {
    log(`Post-wake status: supervisor=${supervisorOk}, server=${serverOk}`);
    // Give processes time to start, then verify
    setTimeout(() => {
      const s = isProcessRunning("jarvis-supervisor.mjs");
      const w = isProcessRunning("scrape.mjs --serve");
      log(`Post-wake verify (5s later): supervisor=${s}, server=${w}`);
      if (!s || !w) {
        log("Post-wake recovery failed — forcing restart...");
        if (!s) ensureSupervisor();
        if (!w) ensureServer();
      }
    }, 5000);
  }
}

// --- Main ---
log("Jarvis Keep-Alive starting...");
log(`  Project: ${PROJECT_ROOT}`);
log(`  Health check: every ${HEALTH_CHECK_INTERVAL / 1000}s`);
log(`  Heartbeat: every ${HEARTBEAT_INTERVAL / 1000}s`);

// Ensure /tmp/jarvis-daemon exists
try { fs.mkdirSync("/tmp/jarvis-daemon", { recursive: true }); } catch {}

// Initial health check
healthCheck();

// Periodic health checks
const hcTimer = setInterval(healthCheck, HEALTH_CHECK_INTERVAL);
const hbTimer = setInterval(writeHeartbeat, HEARTBEAT_INTERVAL);

// Graceful shutdown
function shutdown() {
  log("Keep-alive shutting down...");
  clearInterval(hcTimer);
  clearInterval(hbTimer);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
