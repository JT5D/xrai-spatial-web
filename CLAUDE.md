# XRAI Spatial Web — Agent Directives

## Token Efficiency (PARAMOUNT — Strictly Enforced)
- Offload ALL real-time, voice, and routine tasks to free models (Groq Llama, Gemini)
- Claude Code reserved for: complex code generation, multi-file refactors, architecture decisions
- Never re-read files already in context. Grep before Read. Parallel tool calls always.
- Truncate aggressively when feeding context to free-tier APIs (500 char tool results, 10 msg history)
- Monitor token usage. Compact early, never hit limits.
- Provider chain: Groq (free) → Gemini (free) → Ollama (local) → Claude (paid)

## Auto-Learning Directive (Strictly Enforced)
- After every significant task: record lesson to shared memory + CHANGELOG.md
- Categories: bug-fix, pattern, optimization, tool-usage, architecture
- Flag big unlocks and persistent bugs with HIGH priority
- Track: what worked, what didn't, root causes, reusable patterns
- Write important findings to Knowledge Base at `/Users/jamestunick/KnowledgeBase/`
- KB repo: `imclab/xrai` (lowercase, NOT IMC-lab or IMC-Lab)

## Agent Coordination (Strictly Enforced)
- Shared memory: `/tmp/jarvis-daemon/shared-memory.json`
- Activity log: `/tmp/jarvis-daemon/activity-log.jsonl`
- Changelog: `docs/CHANGELOG.md`
- All agents read/write shared memory for coordination
- Spawn parallel sub-agents for independent work streams
- Never duplicate work between agents
- Update shared memory after every significant state change

## Jarvis Personality (Strictly Enforced)
- **Warm, intelligent, anticipatory** — helpful but not servile
- **Spatial-aware** — references nodes, rings, clusters in graph
- **Concise** — under 3 sentences unless asked for detail
- **Proactive** — suggests what to explore next
- **Never hallucinates** — uses tools to verify before stating facts
- **Never interrupts** — waits for silence detection threshold

## Agent Rules (Enforcement Levels)

### Strictly Enforced (Break = Bug)
- Free-first provider chain: Groq → Gemini → Ollama → Claude
- 60s cooldown after 429 rate limit
- Anti-ping-pong: track failed providers in Set
- Never route 30Hz tracking data through RN-Unity bridge
- Truncate tool results for free-tier APIs
- Record lessons after significant tasks
- Commit + push after every significant chunk of work

### Moderately Enforced (Should Follow)
- Destructive shell commands require user confirmation
- File overwrites require confirmation
- New features should include tests
- Screenshots at major visual milestones
- Update docs when adding features

### Loosely Enforced (Best Effort)
- JSDoc comments on public functions
- Keep modules under 300 lines
- Prefer composition over inheritance

## Code Standards
- Simple, modular, zero external deps where possible
- ES modules (.mjs), no TypeScript compilation needed
- Every module: factory function pattern `export function create*(config)`
- Lifecycle: `build(data) → update(delta, elapsed) → clear() / dispose()`
- Event communication via hooks bus (`namespace:action`)
- Wire system: `{ src, mod, tgt }` reactive bindings (from Portals V4)
- View registry: pluggable layouts via `register/switch/current/list`
- Filter engine: composable faceted pipeline

## Module Design (Hot-Swappable)
- Every module must work standalone (no circular deps)
- Designed for both XRAI spatial web AND Portals V4
- Export clean interfaces that any system can consume
- Config-driven behavior (no hardcoded project-specific logic)
- Provider interface for AI modules: `{ init, detect, dispose, meta, getStats }`
- See `docs/SPATIAL-AI-MODULES.md` for provider comparison matrix

## Project Structure
```
src/server/index.mjs         — HTTP + WS server (port 3210)
src/server/agent/             — AI clients, failover, Jarvis, tools, TTS
src/server/hud/               — Three.js 3D visualization modules
src/server/multiplayer/       — Room manager, presence WebSocket
src/daemon/                   — Jarvis voice daemon, supervisor, keepalive
src/lib/                      — Shared zero-dep utilities
packages/voice-agent/         — Standalone voice agent package
test/*.test.mjs               — Unit tests (node --test)
e2e/*.spec.mjs                — E2E browser tests (Playwright)
e2e/screenshots/              — Timestamped visual milestones
docs/                         — AGENT.md, SKILLS.md, SPATIAL-AI-MODULES.md, CHANGELOG.md
specs/                        — Integration specs (Portals V4, etc.)
scripts/                      — Install scripts (launchd, etc.)
```

## Key APIs & Providers
| Provider | Role | Cost | Limits |
|----------|------|------|--------|
| Groq | STT (Whisper) + LLM (Llama 3.3 70B) | Free | 30 RPM, 12K TPM, 100K TPD |
| Gemini 2.5 Flash | Fallback LLM | Free | Separate quota |
| Ollama | Local fallback LLM | Free | Unlimited (local) |
| Edge TTS | Neural voice synthesis | Free | Unlimited |
| ElevenLabs | Premium TTS | Paid | Per-char billing |
| Claude | Complex reasoning + code gen | Paid | Use sparingly |
| MediaPipe | Hand/body/object tracking | Free | Cross-platform |

## Testing
- Unit: `node --test test/*.test.mjs` (145 tests)
- E2E: `npx playwright test --project=chromium` (35 tests)
- Cross-browser: `npx playwright test --project=chromium --project=webkit`
- Mobile viewports: `npm run test:e2e:mobile`
- All: `npm run test:all`
- Screenshots saved to `e2e/screenshots/` with date-time stamps

## Git Protocol
- Commit + push after every significant piece of work
- Descriptive commit messages with category prefix (feat/fix/docs/refactor)
- Co-author credits for Claude and Happy
- Never force-push to master

## Documentation Requirements
- `CLAUDE.md` — This file. Agent directives and rules.
- `docs/AGENT.md` — Complete system spec for replication
- `docs/SKILLS.md` — Skills and tools reference
- `docs/SPATIAL-AI-MODULES.md` — Hot-swappable AI provider architecture
- `docs/CHANGELOG.md` — Auto-learning log with categorized lessons
- `specs/PORTALS_V4_INTEGRATION.md` — Integration plan for RN + Unity app
