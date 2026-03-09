# XRAI Spatial Web

## What This Is
Voice-first spatial web browser. Jarvis (AI agent) + 3D graph visualization + multiplayer.
Server at port 3210. Daemon listens via mic. Both share memory at `/tmp/jarvis-daemon/`.

## Stack
- Server: `src/server/index.mjs` (HTTP + WebSocket)
- Daemon: `src/daemon/jarvis-listen.mjs` (voice + tools)
- HUD: `src/server/hud/` (Three.js 3D)
- Tests: `node --test test/*.test.mjs` | `npx playwright test --project=chromium`
- Provider chain: Groq (free) → Gemini → Ollama → Claude (auto-failover)

## Code Style
- ES modules (.mjs), factory functions: `export function create*(config)`
- Simple, modular, zero-dep. Works standalone for both XRAI web + Portals V4.
- Commit + push after significant work. Co-author Claude + Happy.

## Key Gotcha
- `node --test test/` fails — use `node --test test/*.test.mjs`
- Groq 12K TPM limit: truncate tool results to 500 chars for free-tier APIs
- Server port is 3210, not 3999

## Docs
See `docs/` for AGENT.md (full spec), SKILLS.md (tools), ENVIRONMENT.md (setup).
