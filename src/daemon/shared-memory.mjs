/**
 * Shared Memory — persistent key-value store accessible by all agents.
 * Both Jarvis (daemon) and Claude Code can read/write here.
 *
 * Storage: JSON file at /tmp/jarvis-daemon/shared-memory.json
 * Thread-safe: read-modify-write with atomic rename.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const MEM_DIR = "/tmp/jarvis-daemon";
const MEM_FILE = path.join(MEM_DIR, "shared-memory.json");

function ensureDir() {
  if (!fs.existsSync(MEM_DIR)) fs.mkdirSync(MEM_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(MEM_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MEM_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(data) {
  ensureDir();
  const tmp = MEM_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, MEM_FILE);
}

/** Read a key from shared memory. Returns null if not found. */
export function memoryRead(key) {
  const data = load();
  if (key === "*" || key === "all") return data;
  return data[key] ?? null;
}

/** Write a key-value pair to shared memory. */
export function memoryWrite(key, value) {
  const data = load();
  data[key] = value;
  data._lastUpdated = new Date().toISOString();
  data._lastUpdatedBy = "jarvis-daemon";
  save(data);
  return true;
}

/** Delete a key from shared memory. */
export function memoryDelete(key) {
  const data = load();
  delete data[key];
  save(data);
  return true;
}

/** List all keys in shared memory. */
export function memoryKeys() {
  return Object.keys(load()).filter(k => !k.startsWith("_"));
}

/** Initialize shared memory with agent awareness metadata. */
export function memoryInit() {
  const data = load();
  if (!data._agents) {
    data._agents = {};
  }
  data._agents["jarvis-daemon"] = {
    type: "voice-agent",
    status: "online",
    startedAt: new Date().toISOString(),
    capabilities: ["voice", "shell", "browser", "files", "memory"],
    pid: process.pid,
  };
  data._systemInfo = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    homeDir: os.homedir(),
    nodeVersion: process.version,
  };
  // Known project paths
  if (!data.projects) {
    data.projects = {
      "xrai-spatial-web": "/Users/jamestunick/Applications/web-scraper",
      "portals-v4": "/Users/jamestunick/dev/portals_v4_fresh",
    };
  }
  save(data);
}
