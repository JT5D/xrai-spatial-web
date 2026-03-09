/**
 * Activity Log — structured append-only log for all agent actions.
 * Tracks: agent, action, timing, success/failure, and which agent is best for what.
 *
 * Storage: JSONL file at /tmp/jarvis-daemon/activity-log.jsonl
 * Readable by both Jarvis daemon and Claude Code.
 */
import fs from "node:fs";
import path from "node:path";

const LOG_DIR = "/tmp/jarvis-daemon";
const LOG_FILE = path.join(LOG_DIR, "activity-log.jsonl");
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB max, then rotate

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log an activity entry.
 * @param {Object} entry
 * @param {string} entry.agent - "jarvis-daemon" | "claude-code" | "groq-llm"
 * @param {string} entry.action - What was done
 * @param {string} [entry.tool] - Tool/skill used
 * @param {number} [entry.durationMs] - How long it took
 * @param {boolean} [entry.success] - Did it work?
 * @param {string} [entry.error] - Error message if failed
 * @param {Object} [entry.meta] - Additional metadata
 */
export function logActivity(entry) {
  ensureDir();
  const record = {
    ts: new Date().toISOString(),
    ...entry,
  };

  // Rotate if too large
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      const rotated = LOG_FILE.replace(".jsonl", `-${Date.now()}.jsonl`);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch {}

  fs.appendFileSync(LOG_FILE, JSON.stringify(record) + "\n");
  return record;
}

/**
 * Read recent log entries.
 * @param {number} [count=20] - Number of recent entries to return
 * @param {string} [agentFilter] - Filter by agent name
 */
export function readLog(count = 20, agentFilter = null) {
  ensureDir();
  if (!fs.existsSync(LOG_FILE)) return [];

  const lines = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n");
  let entries = [];
  for (const line of lines) {
    try { entries.push(JSON.parse(line)); } catch {}
  }

  if (agentFilter) {
    entries = entries.filter(e => e.agent === agentFilter);
  }

  return entries.slice(-count);
}

/**
 * Get performance summary — which agents are fastest at which tasks.
 */
export function getPerformanceSummary() {
  const entries = readLog(500);
  const stats = {};

  for (const e of entries) {
    if (!e.agent || !e.action || !e.durationMs) continue;
    const key = `${e.agent}:${e.action}`;
    if (!stats[key]) stats[key] = { count: 0, totalMs: 0, successes: 0, failures: 0 };
    stats[key].count++;
    stats[key].totalMs += e.durationMs;
    if (e.success) stats[key].successes++;
    else stats[key].failures++;
  }

  // Calculate averages
  for (const key of Object.keys(stats)) {
    stats[key].avgMs = Math.round(stats[key].totalMs / stats[key].count);
    stats[key].successRate = Math.round((stats[key].successes / stats[key].count) * 100);
  }

  return stats;
}
