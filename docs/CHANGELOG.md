# XRAI Spatial Web — Changelog & Learning Log

> Auto-maintained by agent system. Tracks changes, learnings, unlocks, and bugs.
> Agents: append to this log after significant work. Flag big items with priority markers.

## Format

```
### [DATE] — [CATEGORY] — [TITLE]
**Agent:** [who did it]  **Confidence:** [high/medium/low]
**Impact:** [unlock/optimization/bug-fix/pattern/architecture]
**Files:** [changed files]

[Description]

**Lesson:** [What we learned — reusable by future agents]
**Root Cause:** [If bug-fix, what caused it]
```

---

## Log

### 2026-03-09 — UNLOCK — Jarvis Daemon v2 with Tool Execution
**Agent:** claude-code  **Confidence:** high
**Impact:** unlock
**Files:** `src/daemon/jarvis-listen.mjs`, `jarvis-tools.mjs`, `shared-memory.mjs`, `activity-log.mjs`

Transformed Jarvis from chat-only to a capable agent with 9 tools (shell, browser, files, memory, search). Tool-calling loop feeds results back to LLM for multi-step reasoning.

**Lesson:** Groq's OpenAI-compatible API supports tool calling via streaming `delta.tool_calls`. The finish_reason `"tool_calls"` signals when to execute and feed back results.

### 2026-03-09 — BUG-FIX — Groq 12K TPM Rate Limit
**Agent:** claude-code  **Confidence:** high
**Impact:** bug-fix
**Files:** `src/daemon/jarvis-listen.mjs`

Jarvis hit 429 errors when reading large files via tools. Conversation context exceeded 12K tokens/minute.

**Root Cause:** Tool results were 2000 chars, conversation history was 20 messages. Both too large for Groq free tier.
**Fix:** Truncate tool results to 800 chars, trim history to 12 messages, retry on 429 with 5s backoff (3 attempts), reduce default file read to 40 lines.
**Lesson:** Always budget token usage against API tier limits. Groq free = 12K TPM, 30 RPM. Truncate aggressively.

### 2026-03-09 — BUG-FIX — Jarvis Interrupting User Mid-Sentence
**Agent:** claude-code  **Confidence:** high
**Impact:** bug-fix
**Files:** `src/daemon/jarvis-listen.mjs`

Jarvis cut users off because recording windows were too short (8s) and silence detection too aggressive (1.5s).

**Root Cause:** Sox silence threshold was same for passive and active modes. Active mode needs longer silence tolerance.
**Fix:** 15s active window, 3s silence in active mode, 3 silent rounds before returning to passive, "Go on." system prompt for incomplete thoughts.
**Lesson:** Voice agents need mode-aware silence detection. Active listening = longer patience. Never same threshold for wake-word detection vs conversation.

### 2026-03-09 — PATTERN — Free-First AI Provider Chain
**Agent:** claude-code  **Confidence:** high
**Impact:** pattern
**Files:** `src/server/agent/groq-client.mjs`

Established provider chain: Groq (free, fastest) → Gemini (free tier) → Claude (paid, most capable). Use free models for real-time voice, Claude for complex coding tasks only.

**Lesson:** Groq Llama 3.3 70B is free and fast enough for voice agent brain. Reserve Claude tokens for code generation and complex reasoning. This pattern should be default for all agent systems.

### 2026-03-09 — PATTERN — Shared Memory Agent Coordination
**Agent:** claude-code  **Confidence:** high
**Impact:** architecture
**Files:** `src/daemon/shared-memory.mjs`

JSON file at `/tmp/jarvis-daemon/shared-memory.json` enables cross-agent coordination. Both Jarvis (Groq) and Claude Code read/write. Atomic writes via tmp+rename.

**Lesson:** Simplest coordination = shared JSON file with atomic writes. No need for Redis/SQLite for <10 agents. Key pattern: each agent writes its status + findings, reads others' status.

### 2026-03-09 — ARCHITECTURE — Tech Stack Decision
**Agent:** claude-code (3 research sub-agents)  **Confidence:** high
**Impact:** architecture
**Files:** `docs/XRAI-PLATFORM-RESEARCH.md`

After researching 12+ tools: React Three Fiber + Three.js WebGPU (MIT, production-ready, 2-10x over WebGL). Supplementary: Rerun.io, SuperSplat, 3d-force-graph. Avoid: 8th Wall (sunsetting), Spline (design tool only).

**Lesson:** Three.js WebGPU (r171+) is production-ready with 95% browser support. TSL shaders compile to both WGSL and GLSL from one codebase. Always check browser support dates before committing to WebGPU-only.

### 2026-03-09 — PATTERN — Module Extraction from Portals V4
**Agent:** claude-code (research sub-agent)  **Confidence:** high
**Impact:** pattern
**Files:** `docs/XRAI-PLATFORM-RESEARCH.md`

16 extractable modules identified. Wire System (50 lines, zero deps) is the ideal first extraction. Extraction sequence: zero-dep → firebase-only → complex → AR-dependent.

**Lesson:** When extracting modules from a larger codebase, start with zero-dependency modules. They port cleanly and prove the extraction pattern before tackling modules with complex dependencies.

### 2026-03-09 — BUG-FIX — Groq Daily Token Limit + Multi-Provider Failover
**Agent:** claude-code  **Confidence:** high
**Impact:** bug-fix, architecture
**Files:** `src/daemon/jarvis-listen.mjs`, `src/server/agent/gemini-client.mjs`

Groq's 100K TPD (tokens per day) limit was exhausted, causing Jarvis to repeat "I'm having trouble thinking." Added automatic failover: Groq → Gemini 2.5-flash. Anti-ping-pong logic prevents infinite switching when both providers are down (60s cooldown). Auto-retries Groq every 10 minutes.

**Root Cause:** Groq free tier has 100K TPD. Also, `gemini-2.0-flash` had quota=0; needed `gemini-2.5-flash`.
**Lesson:** Always test model availability before assuming. Multiple free providers with automatic failover is essential. Track per-provider quotas separately. Anti-ping-pong logic prevents crash loops when all providers fail.

### 2026-03-09 — UNLOCK — MediaPipe Hand Tracking (21-Joint Skeleton)
**Agent:** claude-code  **Confidence:** high
**Impact:** unlock
**Files:** `src/server/hud/interaction/hand-tracker.mjs`, `src/server/hud/orchestrator.mjs`

Real hand tracking via MediaPipe Tasks Vision (CDN, GPU-delegated). Detects: pinch (thumb-index), point (index extended), grab (all curled), swipe (palm velocity). Backward compatible — emits same `webcam:gesture` events as basic motion detection fallback.

**Lesson:** MediaPipe Tasks Vision loads from CDN with zero npm deps. GPU delegation is key for 30fps. Lazy-loading the model (~5MB) prevents blocking page load.

### 2026-03-09 — UNLOCK — System HUD (View Mode 5: Live Agent Swarm)
**Agent:** claude-code  **Confidence:** high
**Impact:** unlock, architecture
**Files:** `src/server/hud/views/layouts/system-hud.mjs`, `src/server/index.mjs`

Live visualization of the agent swarm: agents, providers, tools, shared memory, data flows. Polls `/agent/system-state` every 2s. Concentric ring layout with color-coded nodes, pulsing animations for active agents, and labeled edges showing data flow types (uses, reads-writes, invokes).

**Lesson:** Making the agent system observable is as important as making it functional. The system state endpoint aggregates shared memory + activity log into a single JSON response that the 3D visualization consumes.
