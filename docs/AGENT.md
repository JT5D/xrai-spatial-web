# Jarvis Agent System — Complete Specification

> Everything needed to replicate, configure, and extend the Jarvis agentic system.

## Identity

**Jarvis** is a voice-first AI agent embedded in the XRAI spatial web browser and Portals V4 holographic telepresence app. It runs as a daemon process on macOS, listens via microphone, thinks via LLM, speaks via TTS, and acts via tool-calling.

### Personality Directives (Strictly Enforced)
- **Warm, intelligent, anticipatory** — helpful but not servile
- **Spatial-aware** — references nodes, rings, clusters in the 3D graph
- **Concise by default** — under 3 sentences unless asked for detail
- **Proactive** — suggests what to explore next when user seems lost
- **Never hallucinates** — uses tools to verify before stating facts
- **Never interrupts** — waits for user to finish speaking (silence detection)

### Capability Directives (Strictly Enforced)
- Voice listen (always-on microphone via sox)
- Voice speak (Edge TTS neural voice or ElevenLabs premium)
- Tool execution (shell, browser, files, memory, search, KB write)
- Graph manipulation (search, highlight, navigate, filter 3D nodes)
- Multi-provider LLM with automatic failover
- Shared memory coordination with other agents (Claude Code, sub-agents)

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  macOS Host                       │
│                                                   │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Jarvis      │  │   Web Server (:3210)      │  │
│  │   Daemon      │  │                            │  │
│  │   (voice)     │  │  /extract → scrape + graph │  │
│  │              │  │  /spatial → 3D HUD viewer  │  │
│  │  sox→Whisper  │  │  /agent/ws → WS Jarvis    │  │
│  │  LLM→TTS     │  │  /agent/tts → Edge TTS    │  │
│  │  tools→exec   │  │  /health → keepalive      │  │
│  └──────┬───────┘  │  /rooms → multiplayer      │  │
│         │           │  /dashboard → agent monitor │  │
│         ▼           └──────────────┬─────────────┘  │
│  ┌──────────────┐                 │                  │
│  │ Shared Memory │◄───────────────┘                  │
│  │ /tmp/jarvis-  │                                   │
│  │ daemon/*.json │◄─── Claude Code (this process)    │
│  └──────────────┘                                    │
│                                                       │
│  ┌──────────────┐                                    │
│  │  Keepalive    │  launchd: com.xrai.jarvis-keepalive│
│  │  (watchdog)   │  Ensures daemon + server survive   │
│  └──────────────┘  sleep/wake/crash/reboot            │
└───────────────────────────────────────────────────────┘
```

## Process Hierarchy

| Process | PID source | Auto-restart | Role |
|---------|-----------|-------------|------|
| `jarvis-keepalive.mjs` | launchd | yes (KeepAlive) | Watchdog: ensures all processes run |
| `jarvis-supervisor.mjs` | keepalive | yes (10 retries/hr) | Supervisor: manages daemon lifecycle |
| `jarvis-listen.mjs` | supervisor | yes (backoff) | Daemon: voice listen + LLM + tools |
| `scrape.mjs --serve` | keepalive | yes | Web server: HTTP + WebSocket |

## Provider Chain (Free-First)

```
Groq (free, fastest)
  ├── STT: Whisper Large V3
  ├── LLM: Llama 3.3 70B Versatile
  └── Limits: 30 RPM, 12K TPM, 100K TPD
       │
       ▼ (on 429)
Gemini 2.5 Flash (free)
  ├── LLM: gemini-2.5-flash
  └── Limits: separate quota
       │
       ▼ (on 429)
Ollama (local, zero limits)
  ├── LLM: llama3.1:latest (or any local model)
  └── Requires: Ollama running at localhost:11434
       │
       ▼ (on error)
Claude (paid, premium)
  ├── LLM: claude-sonnet-4 / claude-opus-4-6
  └── Reserved for complex reasoning only
```

### Failover Rules (Strictly Enforced)
- **60s cooldown** after provider returns 429 (rate limit)
- **10s cooldown** after transient error
- **Anti-ping-pong**: `failedProviders` Set prevents rapid switching
- **All-exhausted**: 60s global cooldown before retrying any provider
- **Provider switching is logged** to shared memory and activity log

### Token Budget Rules (Strictly Enforced)
- Groq: truncate tool results to **500 chars**, conversation history to **10 messages**
- Gemini: same truncation rules as Groq
- Ollama: relaxed (local, no cost), but still 20 msg history max
- Claude: full context allowed, but use sparingly

## Tools (Jarvis Daemon)

| Tool | Description | Enforcement |
|------|-------------|-------------|
| `run_shell` | Execute shell commands | Moderate: no destructive ops without user confirm |
| `open_browser` | Open URLs in default browser | Loose |
| `read_file` | Read file contents (truncated) | Strict: max 500 chars returned to LLM |
| `write_file` | Write/create files | Moderate: no overwrite without confirm |
| `search_project` | Grep project files | Loose |
| `read_memory` | Read shared memory key | Strict: always available |
| `write_memory` | Write to shared memory | Strict: must include timestamp |
| `record_lesson` | Log lesson to activity log | Strict: categorize correctly |
| `write_kb` | Write to Knowledge Base | Moderate: commit to git after write |
| `read_activity_log` | Read recent activity | Loose |
| `list_directory` | List directory contents | Loose |

## Tools (HUD / WebSocket Agent)

| Tool | Description | Used by |
|------|-------------|---------|
| `search_graph` | Find nodes by type/label/query | Spatial viewer |
| `highlight_nodes` | Highlight specific node IDs | Spatial viewer |
| `navigate_to_node` | Focus camera on a node | Spatial viewer |
| `reset_view` | Reset camera to default | Spatial viewer |
| `list_nodes` | List all nodes with types | Spatial viewer |
| `explain_node` | Get details about a node | Spatial viewer |
| `extract_deeper` | Scrape a link node's URL | Spatial viewer |

## Shared Memory Schema

Location: `/tmp/jarvis-daemon/shared-memory.json`

```json
{
  "_agents": { "<id>": { "type", "status", "startedAt", "capabilities", "pid" } },
  "_systemInfo": { "hostname", "platform", "arch", "homeDir", "nodeVersion" },
  "projects": { "<name>": "<path>" },
  "jarvis-status": "online|offline|error",
  "jarvis-provider": { "active": "groq|gemini|ollama|claude", "reason", "switchedAt" },
  "jarvis-heartbeat": <timestamp_ms>,
  "jarvis-capabilities": ["voice-listen", "voice-speak", ...],
  "jarvis-supervisor": { "pid", "restartCount", "lastRestart", "backoffMs" },
  "keepalive-heartbeat": <timestamp_ms>,
  "keepalive-status": { "supervisor", "server", "caffeinate", "pid", "uptimeMin" },
  "claude-code-session": { "startedAt", "currentTask", "completedToday": [] },
  "active-agents": { "<id>": { "status", "task" } },
  "agent-lessons": [{ "category", "lesson", "confidence", "source", "timestamp" }],
  "agent-stats": { "toolPerformance": { "<tool>": { "count", "totalMs", "successes", "avgMs" } } },
  "spatial-web-status": { "endpoints": {}, "testsPass", "lastCommit" }
}
```

## Activity Log Schema

Location: `/tmp/jarvis-daemon/activity-log.jsonl`

Each line: `{ "ts", "agent", "action", "success", "durationMs", "details" }`

Categories: `conversation`, `tool_call`, `provider_switch`, `error`, `lesson`

## Voice Pipeline

```
Microphone → sox (5s chunks, silence-trimmed)
  → Groq Whisper (STT, ~200ms)
  → Silence detection (1.5s passive / 3s active mode)
  → LLM (streaming, tool-calling loop)
  → Edge TTS (neural voice synthesis, ~100ms)
  → Speaker (afplay on macOS)
```

### Voice Rules (Strictly Enforced)
- **Never interrupt** the user while they're speaking
- **Mode-aware silence**: 3s in active mode, 1.5s in passive mode
- **3 silent rounds** → auto-switch to passive mode
- **Active mode**: Jarvis has been directly addressed
- **Passive mode**: background listening, only respond to wake word

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes (for voice) | — | Groq API key for Whisper + Llama |
| `GEMINI_API_KEY` | Recommended | — | Gemini fallback LLM |
| `ANTHROPIC_API_KEY` | Optional | — | Claude premium fallback |
| `ELEVENLABS_API_KEY` | Optional | — | Premium TTS voices |
| `PREFER_CLAUDE` | Optional | `0` | Set `1` to use Claude as primary |
| `JARVIS_MODEL` | Optional | `llama-3.3-70b-versatile` | Override Groq model |
| `OLLAMA_MODEL` | Optional | `llama3.1:latest` | Override Ollama model |

### Settings That Affect Performance

| Setting | Location | Impact |
|---------|----------|--------|
| `MAX_HISTORY` | jarvis.mjs:28 | Conversation turns kept (20) |
| `COOLDOWN_MS` | failover-client.mjs:12 | Provider failover cooldown (60s) |
| `HEALTH_CHECK_INTERVAL` | jarvis-keepalive.mjs:27 | Keepalive check frequency (15s) |
| `HEARTBEAT_INTERVAL` | jarvis-keepalive.mjs:28 | Heartbeat write frequency (10s) |
| `SILENCE_THRESHOLD_ACTIVE` | jarvis-listen.mjs | Silence before responding in active mode (3s) |
| `SILENCE_THRESHOLD_PASSIVE` | jarvis-listen.mjs | Silence before responding in passive mode (1.5s) |

## Replication Checklist

To replicate this system on a new machine:

1. Clone: `git clone https://github.com/JT5D/xrai-spatial-web.git`
2. Install: `npm install`
3. Set env vars: `GROQ_API_KEY`, `GEMINI_API_KEY` (optional: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`)
4. Start server: `node scrape.mjs --serve`
5. Start daemon: `node src/daemon/jarvis-supervisor.mjs`
6. Install keepalive: `bash scripts/install-launchd.sh`
7. Verify: `curl http://localhost:3210/health`
8. Run tests: `node --test test/*.test.mjs && npx playwright test --project=chromium`
9. Open spatial viewer: `http://localhost:3210/spatial`
10. Open dashboard: `http://localhost:3210/dashboard`

### Prerequisites
- Node.js 20+ (tested on v24.10.0)
- sox (`brew install sox`) — for voice recording
- macOS (for launchd, caffeinate, afplay) — Linux: adapt keepalive to systemd
- Optional: Ollama (`brew install ollama`) for local fallback
