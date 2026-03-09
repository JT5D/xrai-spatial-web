# XRAI Spatial Web — Agent Directives

## Token Efficiency (PARAMOUNT)
- Offload ALL real-time, voice, and routine tasks to free models (Groq Llama, Gemini)
- Claude Code reserved for: complex code generation, multi-file refactors, architecture decisions
- Never re-read files already in context. Grep before Read. Parallel tool calls always.
- Truncate aggressively when feeding context to free-tier APIs (800 char tool results, 12 msg history)

## Auto-Learning Directive
- After every significant task: record lesson to shared memory + CHANGELOG.md
- Categories: bug-fix, pattern, optimization, tool-usage, architecture
- Flag big unlocks and persistent bugs with HIGH priority
- Track: what worked, what didn't, root causes, reusable patterns
- Write important findings to Knowledge Base at `/Users/jamestunick/Documents/GitHub/Unity-XR-AI/KnowledgeBase/`

## Agent Coordination
- Shared memory: `/tmp/jarvis-daemon/shared-memory.json`
- Activity log: `/tmp/jarvis-daemon/activity-log.jsonl`
- Changelog: `docs/CHANGELOG.md`
- All agents read/write shared memory for coordination
- Spawn parallel sub-agents for independent work streams
- Never duplicate work between agents

## Code Standards
- Simple, modular, zero external deps where possible
- ES modules (.mjs), JSDoc comments, no TypeScript compilation needed
- Every module: factory function pattern `export function create*(config)`
- Lifecycle: `build(data) → update(delta, elapsed) → clear() / dispose()`
- Event communication via hooks bus (`namespace:action`)
- Test everything. Tests at `test/*.test.mjs`

## Module Design (Hot-Swappable)
- Every module must work standalone (no circular deps)
- Designed for both XRAI spatial web AND Portals V4
- Export clean interfaces that any system can consume
- Config-driven behavior (no hardcoded project-specific logic)

## Project Structure
- Server: `src/server/index.mjs` (port 3210)
- HUD modules: `src/server/hud/` (Three.js visualization)
- Daemon: `src/daemon/` (Jarvis voice agent, Groq-powered)
- Lib: `src/lib/` (shared zero-dep utilities)
- Tests: `test/`
- Docs: `docs/`

## Key APIs
- Groq (free): STT (Whisper), LLM (Llama 3.3 70B), tool calling
- Edge TTS (free): Neural voice synthesis
- Gemini (free tier): Fallback LLM
- Claude (paid): Complex reasoning only

## Git Protocol
- Commit + push after every significant piece of work
- Descriptive commit messages with category prefix (feat/fix/docs/refactor)
- Co-author credits for Claude and Happy
