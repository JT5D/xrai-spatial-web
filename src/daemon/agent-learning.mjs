/**
 * Agent Learning System — auto-extracts patterns from activity logs
 * and builds a persistent "lessons learned" memory for the XRAI agent ecosystem.
 *
 * Tracks: tool success/failure rates, avg duration, common errors,
 * recurring failures, and distilled lessons.
 *
 * Storage: persists to shared memory under "agent-lessons" key.
 * Also reads from /tmp/jarvis-daemon/activity-log.jsonl.
 *
 * Exports:
 *   initLearning()              — Start periodic learning from activity log
 *   recordLesson(lesson)        — Manually record a lesson
 *   getLessons(category)         — Retrieve lessons by category
 *   getAgentStats()              — Get tool/agent performance statistics
 */
import fs from "node:fs";
import path from "node:path";
import { memoryRead, memoryWrite } from "./shared-memory.mjs";
import { readLog, getPerformanceSummary } from "./activity-log.mjs";

// ─── Constants ───

const LESSONS_MEMORY_KEY = "agent-lessons";
const STATS_MEMORY_KEY = "agent-stats";
const LEARN_INTERVAL_MS = 5 * 60 * 1000; // scan every 5 minutes
const LOG_DIR = "/tmp/jarvis-daemon";
const LEARN_CURSOR_FILE = path.join(LOG_DIR, ".learn-cursor");

const VALID_CATEGORIES = [
  "bug-fix",
  "pattern",
  "optimization",
  "tool-usage",
  "architecture",
];

// ─── Internal State ───

let learningTimer = null;
let lastProcessedTimestamp = null;

// ─── Helpers ───

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** Load the cursor — last timestamp we processed up to. */
function loadCursor() {
  try {
    if (fs.existsSync(LEARN_CURSOR_FILE)) {
      return fs.readFileSync(LEARN_CURSOR_FILE, "utf-8").trim();
    }
  } catch {}
  return null;
}

/** Save the cursor. */
function saveCursor(ts) {
  ensureDir();
  fs.writeFileSync(LEARN_CURSOR_FILE, ts);
}

/** Load lessons from shared memory. */
function loadLessons() {
  const stored = memoryRead(LESSONS_MEMORY_KEY);
  if (stored && Array.isArray(stored)) return stored;
  return [];
}

/** Save lessons to shared memory. */
function saveLessons(lessons) {
  memoryWrite(LESSONS_MEMORY_KEY, lessons);
}

/** Generate a simple ID for deduplication. */
function lessonId(lesson) {
  return `${lesson.category}:${lesson.lesson.slice(0, 60)}`;
}

// ─── Core: Pattern Extraction from Activity Log ───

/**
 * Scan recent activity log entries and extract auto-lessons.
 * Looks for:
 *   1. Tools with high failure rates
 *   2. Recurring errors (same error message 3+ times)
 *   3. Unusually slow tools (> 2x average)
 *   4. Successful patterns worth remembering
 */
function extractPatterns() {
  const cursor = loadCursor();
  const allEntries = readLog(500);

  // Filter to entries after our cursor
  let newEntries = allEntries;
  if (cursor) {
    newEntries = allEntries.filter((e) => e.ts > cursor);
  }

  if (newEntries.length === 0) return [];

  // Update cursor to latest entry
  const latestTs = newEntries[newEntries.length - 1].ts;
  saveCursor(latestTs);

  const extracted = [];

  // --- 1. Aggregate tool stats ---
  const toolStats = {};
  for (const entry of newEntries) {
    if (!entry.tool) continue;
    if (!toolStats[entry.tool]) {
      toolStats[entry.tool] = {
        count: 0,
        failures: 0,
        totalMs: 0,
        errors: [],
      };
    }
    const s = toolStats[entry.tool];
    s.count++;
    if (entry.success === false) {
      s.failures++;
      if (entry.error) s.errors.push(entry.error);
    }
    if (entry.durationMs) s.totalMs += entry.durationMs;
  }

  // --- 2. Flag tools with high failure rates (>30% failures, min 3 uses) ---
  for (const [tool, stats] of Object.entries(toolStats)) {
    if (stats.count >= 3) {
      const failRate = stats.failures / stats.count;
      if (failRate > 0.3) {
        extracted.push({
          category: "tool-usage",
          lesson: `Tool "${tool}" has ${Math.round(failRate * 100)}% failure rate over ${stats.count} recent calls. Common errors: ${[...new Set(stats.errors)].slice(0, 3).join("; ") || "unknown"}`,
          confidence: Math.min(0.9, 0.5 + stats.count * 0.05),
          source: "auto-learning:failure-rate",
          timestamp: new Date().toISOString(),
          relatedFiles: [],
        });
      }
    }
  }

  // --- 3. Recurring errors (same message 3+ times) ---
  const errorCounts = {};
  for (const entry of newEntries) {
    if (entry.error) {
      const normalized = entry.error.slice(0, 120);
      if (!errorCounts[normalized]) errorCounts[normalized] = { count: 0, tools: new Set() };
      errorCounts[normalized].count++;
      if (entry.tool) errorCounts[normalized].tools.add(entry.tool);
    }
  }

  for (const [errMsg, info] of Object.entries(errorCounts)) {
    if (info.count >= 3) {
      extracted.push({
        category: "bug-fix",
        lesson: `Recurring error (${info.count}x): "${errMsg}" — affects tools: ${[...info.tools].join(", ") || "unknown"}. Investigate root cause.`,
        confidence: Math.min(0.95, 0.6 + info.count * 0.05),
        source: "auto-learning:recurring-error",
        timestamp: new Date().toISOString(),
        relatedFiles: [],
      });
    }
  }

  // --- 4. Slow tools (avg > 5s) ---
  for (const [tool, stats] of Object.entries(toolStats)) {
    if (stats.count >= 2 && stats.totalMs > 0) {
      const avgMs = stats.totalMs / stats.count;
      if (avgMs > 5000) {
        extracted.push({
          category: "optimization",
          lesson: `Tool "${tool}" averages ${Math.round(avgMs)}ms (${(avgMs / 1000).toFixed(1)}s) over ${stats.count} calls. Consider optimization or caching.`,
          confidence: 0.7,
          source: "auto-learning:slow-tool",
          timestamp: new Date().toISOString(),
          relatedFiles: [],
        });
      }
    }
  }

  // --- 5. Successful patterns (tools used > 5 times with > 90% success) ---
  for (const [tool, stats] of Object.entries(toolStats)) {
    if (stats.count >= 5) {
      const successRate = (stats.count - stats.failures) / stats.count;
      if (successRate > 0.9) {
        const avgMs = stats.totalMs > 0 ? Math.round(stats.totalMs / stats.count) : 0;
        extracted.push({
          category: "pattern",
          lesson: `Tool "${tool}" is highly reliable: ${Math.round(successRate * 100)}% success rate over ${stats.count} calls${avgMs ? `, avg ${avgMs}ms` : ""}.`,
          confidence: 0.8,
          source: "auto-learning:success-pattern",
          timestamp: new Date().toISOString(),
          relatedFiles: [],
        });
      }
    }
  }

  return extracted;
}

/**
 * Run one learning cycle: extract patterns, deduplicate, persist.
 */
function runLearningCycle() {
  try {
    const newLessons = extractPatterns();
    if (newLessons.length === 0) return;

    const existing = loadLessons();
    const existingIds = new Set(existing.map(lessonId));

    let added = 0;
    for (const lesson of newLessons) {
      const id = lessonId(lesson);
      if (!existingIds.has(id)) {
        existing.push(lesson);
        existingIds.add(id);
        added++;
      }
    }

    // Cap total lessons to prevent unbounded growth (keep most recent 200)
    const capped = existing.length > 200 ? existing.slice(-200) : existing;

    if (added > 0) {
      saveLessons(capped);
    }

    // Also update aggregate stats in shared memory
    const perfSummary = getPerformanceSummary();
    memoryWrite(STATS_MEMORY_KEY, {
      lastUpdated: new Date().toISOString(),
      toolPerformance: perfSummary,
      totalLessons: capped.length,
      lessonsByCategory: countByCategory(capped),
    });
  } catch (err) {
    // Silently fail — learning is best-effort
    const errLog = `[agent-learning] Error in learning cycle: ${err.message}`;
    try { fs.appendFileSync(path.join(LOG_DIR, "learning-errors.log"), errLog + "\n"); } catch {}
  }
}

/** Count lessons by category. */
function countByCategory(lessons) {
  const counts = {};
  for (const l of lessons) {
    counts[l.category] = (counts[l.category] || 0) + 1;
  }
  return counts;
}

// ─── Exports ───

/**
 * Initialize the learning system. Starts periodic scanning of the activity log.
 * Safe to call multiple times (idempotent).
 */
export function initLearning() {
  if (learningTimer) return; // already running

  // Run once immediately
  runLearningCycle();

  // Then run every LEARN_INTERVAL_MS
  learningTimer = setInterval(runLearningCycle, LEARN_INTERVAL_MS);

  // Don't block process exit
  if (learningTimer.unref) learningTimer.unref();

  return { status: "learning-active", intervalMs: LEARN_INTERVAL_MS };
}

/**
 * Manually record a lesson / finding / pattern.
 * @param {Object} lesson
 * @param {string} lesson.category — One of: bug-fix, pattern, optimization, tool-usage, architecture
 * @param {string} lesson.lesson — The lesson description
 * @param {number} [lesson.confidence] — Confidence 0.0-1.0 (default: 0.8)
 * @param {string} [lesson.source] — Where this came from (default: "manual")
 * @param {string[]} [lesson.relatedFiles] — Related file paths
 * @returns {Object} The stored lesson record
 */
export function recordLesson(lesson) {
  if (!lesson || !lesson.category || !lesson.lesson) {
    return { error: "lesson must have 'category' and 'lesson' fields" };
  }

  if (!VALID_CATEGORIES.includes(lesson.category)) {
    return {
      error: `Invalid category "${lesson.category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`,
    };
  }

  const record = {
    category: lesson.category,
    lesson: lesson.lesson,
    confidence: typeof lesson.confidence === "number" ? Math.max(0, Math.min(1, lesson.confidence)) : 0.8,
    source: lesson.source || "manual",
    timestamp: new Date().toISOString(),
    relatedFiles: Array.isArray(lesson.relatedFiles) ? lesson.relatedFiles : [],
  };

  const existing = loadLessons();

  // Check for duplicates
  const id = lessonId(record);
  const isDuplicate = existing.some((l) => lessonId(l) === id);
  if (isDuplicate) {
    return { status: "duplicate", lesson: record };
  }

  existing.push(record);

  // Cap at 200
  const capped = existing.length > 200 ? existing.slice(-200) : existing;
  saveLessons(capped);

  return { status: "recorded", lesson: record, totalLessons: capped.length };
}

/**
 * Retrieve lessons, optionally filtered by category.
 * @param {string} [category] — Filter by category, or null/undefined for all
 * @returns {Object[]} Array of lesson records
 */
export function getLessons(category) {
  const all = loadLessons();
  if (!category || category === "all") return all;

  if (!VALID_CATEGORIES.includes(category)) {
    return { error: `Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(", ")}` };
  }

  return all.filter((l) => l.category === category);
}

/**
 * Get aggregated agent/tool performance statistics.
 * @returns {Object} Stats including tool performance, lesson counts, and health indicators
 */
export function getAgentStats() {
  const perfSummary = getPerformanceSummary();
  const lessons = loadLessons();

  // Identify top issues (high-confidence bug-fix and optimization lessons)
  const topIssues = lessons
    .filter((l) => (l.category === "bug-fix" || l.category === "optimization") && l.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  // Identify reliable patterns
  const reliablePatterns = lessons
    .filter((l) => l.category === "pattern" && l.confidence >= 0.7)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return {
    lastUpdated: new Date().toISOString(),
    toolPerformance: perfSummary,
    totalLessons: lessons.length,
    lessonsByCategory: countByCategory(lessons),
    topIssues,
    reliablePatterns,
    validCategories: VALID_CATEGORIES,
  };
}
