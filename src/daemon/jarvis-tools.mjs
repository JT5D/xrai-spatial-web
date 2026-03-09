/**
 * Jarvis Tool Definitions + Executors — gives the daemon hands.
 *
 * Tools Jarvis can use:
 *   open_browser     — Open a URL in default browser
 *   run_shell        — Execute a shell command (non-destructive)
 *   read_file        — Read a file from disk
 *   write_file       — Write/create a file
 *   list_directory   — List files in a directory
 *   read_memory      — Read from shared agent memory
 *   write_memory     — Write to shared agent memory
 *   read_activity    — Read recent activity log
 *   search_project   — Search for text across a project
 *   record_lesson    — Record a learning/pattern/bug-fix to agent memory
 *   write_kb         — Write research findings to the Knowledge Base
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { memoryRead, memoryWrite, memoryKeys } from "./shared-memory.mjs";
import { logActivity, readLog, getPerformanceSummary } from "./activity-log.mjs";
import { recordLesson, getLessons, getAgentStats } from "./agent-learning.mjs";
import { writeToKB, appendToKB, listKBFiles } from "./kb-writer.mjs";

// ─── Tool Schemas (OpenAI function-calling format for Groq) ───

export const TOOL_SCHEMAS = [
  {
    name: "open_browser",
    description: "Open a URL in the user's default browser on macOS. Use this to show the user something — a webpage, a GitHub repo, documentation, local server pages, etc.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to open" },
      },
      required: ["url"],
    },
  },
  {
    name: "run_shell",
    description: "Execute a shell command on macOS and return the output. Use for: git operations, npm commands, listing files, checking processes, opening apps. Do NOT use for destructive operations (rm -rf, drop tables, etc).",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to run" },
      },
      required: ["command"],
    },
  },
  {
    name: "read_file",
    description: "Read the contents of a file from disk. Use to inspect code, configs, docs.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        max_lines: { type: "number", description: "Max lines to read (default: 100)" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates parent directories if needed. Use to create specs, configs, code files.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files and directories at a path. Use to explore project structure.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the directory" },
      },
      required: ["path"],
    },
  },
  {
    name: "read_memory",
    description: "Read from shared agent memory. Use key='all' to see everything. Memory is shared between you (Jarvis daemon) and Claude Code — use it to coordinate.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key to read, or 'all' for everything" },
      },
      required: ["key"],
    },
  },
  {
    name: "write_memory",
    description: "Write to shared agent memory. Anything you write here is readable by Claude Code and vice versa. Use to share findings, status, coordination notes.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Memory key" },
        value: { type: "string", description: "Value to store (string or JSON string)" },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "read_activity_log",
    description: "Read recent activity log entries. Shows what all agents have been doing, timing, success rates.",
    input_schema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of recent entries (default: 20)" },
        agent: { type: "string", description: "Filter by agent name (optional)" },
      },
    },
  },
  {
    name: "search_project",
    description: "Search for text/code across a project directory. Returns matching file paths and lines.",
    input_schema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name ('xrai-spatial-web' or 'portals-v4') or absolute path" },
        query: { type: "string", description: "Text or regex to search for" },
        file_pattern: { type: "string", description: "Glob pattern to filter files (e.g. '*.mjs', '*.ts')" },
      },
      required: ["project", "query"],
    },
  },
  {
    name: "record_lesson",
    description: "Record a learning, pattern, bug-fix, or optimization to the agent's persistent memory. Use this when you discover something worth remembering — a pattern that works, a bug fix, an optimization trick, or an architectural insight. Categories: bug-fix, pattern, optimization, tool-usage, architecture.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Lesson category: 'bug-fix', 'pattern', 'optimization', 'tool-usage', or 'architecture'" },
        lesson: { type: "string", description: "The lesson or finding to record" },
        confidence: { type: "number", description: "Confidence level 0.0-1.0 (default: 0.8)" },
        source: { type: "string", description: "Where this lesson came from (default: 'jarvis')" },
        related_files: { type: "string", description: "Comma-separated list of related file paths (optional)" },
      },
      required: ["category", "lesson"],
    },
  },
  {
    name: "write_kb",
    description: "Write research findings, documentation, or knowledge to the Knowledge Base at ~/Documents/GitHub/Unity-XR-AI/KnowledgeBase/. Can create new files or append to existing ones. Files follow _TOPIC_NAME.md naming convention. Auto-commits to git.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic name for new files (e.g. 'Agent Learning Patterns'). Used to generate filename." },
        content: { type: "string", description: "Markdown content to write" },
        mode: { type: "string", description: "'write' for new file, 'append' to add to existing file, 'list' to list KB files (default: 'write')" },
        filename: { type: "string", description: "For append mode: existing filename to append to (e.g. '_AGENT_PATTERNS.md')" },
        section: { type: "string", description: "For append mode: section heading (e.g. '## New Findings')" },
        overwrite: { type: "boolean", description: "For write mode: overwrite existing file (default: false)" },
        filter: { type: "string", description: "For list mode: filter filenames containing this string" },
      },
      required: [],
    },
  },
];

// ─── Blocked commands (safety) ───

const BLOCKED_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /rmdir/i,
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\//i,
  /chmod\s+777/i,
  /curl.*\|\s*(bash|sh|zsh)/i,
  /wget.*\|\s*(bash|sh|zsh)/i,
  /git\s+push\s+.*--force/i,
  /git\s+reset\s+--hard/i,
  /drop\s+(table|database)/i,
  /truncate\s+table/i,
  /sudo/i,
];

function isCommandSafe(cmd) {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(cmd)) return false;
  }
  return true;
}

// ─── Known project paths ───

const PROJECT_PATHS = {
  "xrai-spatial-web": "/Users/jamestunick/Applications/web-scraper",
  "xrai": "/Users/jamestunick/Applications/web-scraper",
  "portals-v4": "/Users/jamestunick/dev/portals_v4_fresh",
  "portals": "/Users/jamestunick/dev/portals_v4_fresh",
};

function resolveProjectPath(project) {
  return PROJECT_PATHS[project.toLowerCase()] || project;
}

// ─── Tool Executors ───

export function executeTool(name, input) {
  const start = Date.now();
  let result;
  let success = true;
  let error = null;

  try {
    switch (name) {
      case "open_browser": {
        const url = input.url;
        execSync(`open "${url.replace(/"/g, '\\"')}"`, { stdio: "pipe" });
        result = `Opened ${url} in browser.`;
        break;
      }

      case "run_shell": {
        const cmd = input.command;
        if (!isCommandSafe(cmd)) {
          result = `BLOCKED: "${cmd}" is not allowed for safety. Destructive commands (rm -rf, sudo, force push, etc) are blocked.`;
          success = false;
          break;
        }
        try {
          const output = execSync(cmd, {
            stdio: "pipe",
            timeout: 15000,
            maxBuffer: 1024 * 1024,
            cwd: PROJECT_PATHS["xrai-spatial-web"],
          }).toString();
          result = output.slice(0, 3000) || "(no output)";
        } catch (err) {
          result = `Command failed: ${err.stderr?.toString().slice(0, 500) || err.message}`;
          success = false;
        }
        break;
      }

      case "read_file": {
        const filePath = input.path;
        if (!fs.existsSync(filePath)) {
          result = `File not found: ${filePath}`;
          success = false;
          break;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const maxLines = input.max_lines || 40;
        const lines = content.split("\n").slice(0, maxLines);
        result = lines.join("\n");
        if (content.split("\n").length > maxLines) {
          result += `\n... (truncated, ${content.split("\n").length} total lines)`;
        }
        break;
      }

      case "write_file": {
        const dir = path.dirname(input.path);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(input.path, input.content);
        result = `Wrote ${input.content.length} bytes to ${input.path}`;
        break;
      }

      case "list_directory": {
        const dirPath = input.path;
        if (!fs.existsSync(dirPath)) {
          result = `Directory not found: ${dirPath}`;
          success = false;
          break;
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        result = entries
          .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
          .join("\n");
        break;
      }

      case "read_memory": {
        const val = memoryRead(input.key);
        result = val !== null ? JSON.stringify(val, null, 2) : `No memory found for key: ${input.key}`;
        break;
      }

      case "write_memory": {
        let value = input.value;
        // Try to parse JSON strings
        try { value = JSON.parse(value); } catch {}
        memoryWrite(input.key, value);
        result = `Saved to memory: ${input.key}`;
        break;
      }

      case "read_activity_log": {
        const count = input.count || 20;
        const entries = readLog(count, input.agent || null);
        if (entries.length === 0) {
          result = "No activity logged yet.";
        } else {
          result = entries.map((e) =>
            `[${e.ts}] ${e.agent}: ${e.action}${e.durationMs ? ` (${e.durationMs}ms)` : ""}${e.success === false ? " FAILED" : ""}`
          ).join("\n");
        }
        break;
      }

      case "search_project": {
        const projectPath = resolveProjectPath(input.project);
        if (!fs.existsSync(projectPath)) {
          result = `Project path not found: ${projectPath}`;
          success = false;
          break;
        }
        const fileGlob = input.file_pattern || "";
        const grepCmd = fileGlob
          ? `grep -rn --include="${fileGlob}" "${input.query.replace(/"/g, '\\"')}" "${projectPath}" 2>/dev/null | head -30`
          : `grep -rn "${input.query.replace(/"/g, '\\"')}" "${projectPath}" --include="*.mjs" --include="*.ts" --include="*.js" --include="*.json" --include="*.md" --include="*.cs" 2>/dev/null | head -30`;
        try {
          const output = execSync(grepCmd, { stdio: "pipe", timeout: 10000, maxBuffer: 1024 * 1024 }).toString();
          result = output.slice(0, 3000) || "No matches found.";
        } catch {
          result = "No matches found.";
        }
        break;
      }

      case "record_lesson": {
        const relatedFiles = input.related_files
          ? input.related_files.split(",").map((f) => f.trim()).filter(Boolean)
          : [];
        const lessonResult = recordLesson({
          category: input.category,
          lesson: input.lesson,
          confidence: input.confidence,
          source: input.source || "jarvis",
          relatedFiles,
        });
        if (lessonResult.error) {
          result = `Failed to record lesson: ${lessonResult.error}`;
          success = false;
        } else if (lessonResult.status === "duplicate") {
          result = `Lesson already recorded (duplicate). Category: ${input.category}`;
        } else {
          result = `Lesson recorded! Category: ${input.category}, total lessons: ${lessonResult.totalLessons}. "${input.lesson.slice(0, 80)}"`;
        }
        break;
      }

      case "write_kb": {
        const kbMode = input.mode || "write";

        if (kbMode === "list") {
          const listResult = listKBFiles({ filter: input.filter });
          if (listResult.error) {
            result = `KB list error: ${listResult.error}`;
            success = false;
          } else {
            const fileList = listResult.files
              .slice(0, 30)
              .map((f) => `  ${f.filename} (${Math.round(f.sizeBytes / 1024)}KB)`)
              .join("\n");
            result = `KB has ${listResult.count} files:\n${fileList}`;
          }
        } else if (kbMode === "append") {
          if (!input.filename || !input.content) {
            result = "Append mode requires 'filename' and 'content'.";
            success = false;
          } else {
            const appendResult = appendToKB(input.filename, input.section || "", input.content, {
              createIfMissing: true,
            });
            if (appendResult.error) {
              result = `KB append error: ${appendResult.error}`;
              success = false;
            } else {
              result = `Appended ${appendResult.appendedBytes} bytes to ${appendResult.filename}. Git committed: ${appendResult.committed}`;
            }
          }
        } else {
          // write mode
          if (!input.topic || !input.content) {
            result = "Write mode requires 'topic' and 'content'.";
            success = false;
          } else {
            const writeResult = writeToKB(input.topic, input.content, {
              overwrite: input.overwrite === true,
              filename: input.filename,
            });
            if (writeResult.error) {
              result = `KB write error: ${writeResult.error}`;
              success = false;
            } else {
              result = `Wrote ${writeResult.bytes} bytes to ${writeResult.filename}. Git committed: ${writeResult.committed}`;
            }
          }
        }
        break;
      }

      default:
        result = `Unknown tool: ${name}`;
        success = false;
    }
  } catch (err) {
    result = `Tool error: ${err.message}`;
    success = false;
    error = err.message;
  }

  const durationMs = Date.now() - start;

  // Log the activity
  logActivity({
    agent: "jarvis-daemon",
    action: name,
    tool: name,
    durationMs,
    success,
    error,
    meta: { input: JSON.stringify(input).slice(0, 200) },
  });

  return result;
}
