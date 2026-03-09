# Portals V4 Integration Spec — XRAI Voice Agent Swarm

## Status: READY TO INTEGRATE

The spatial web browser's agent infrastructure is fully built and tested.
Portals V4 already has an adapter (`src/services/xrai-voice-agent/portals-adapter.ts`).
This spec documents the integration path.

---

## Architecture Overview

```
Portals V4 (RN + Unity)          XRAI Spatial Web Server (Node.js)
┌─────────────────────┐          ┌──────────────────────────┐
│ React Native Layer  │          │  Server (port 3210)      │
│                     │  WebSocket│                          │
│ portals-adapter.ts ─┼──────────┼→ /agent/ws               │
│   └─ agent-bridge   │  JSON    │   └─ Jarvis agent        │
│   └─ voice-input    │  protocol│      └─ Claude/Groq/     │
│   └─ voice-output   │          │         Gemini/Ollama    │
│                     │          │      └─ HUD tools        │
│ VoiceIntelligence   │          │      └─ Graph context    │
│   └─ localIntent    │          │                          │
│   └─ unityAdapter   │          │  /agent/tts (Edge TTS)   │
│                     │          │  /agent/system-state     │
│ UnityView           │          │  /extract (web content)  │
│   └─ BridgeTarget   │          │  /scrape (raw HTML)      │
└─────────────────────┘          └──────────────────────────┘
```

## What Already Exists

### In XRAI Spatial Web (this project)
| Component | File | Status |
|-----------|------|--------|
| WebSocket handler | `src/server/agent/agent-ws.mjs` | Working |
| Jarvis agent (Claude-backed) | `src/server/agent/jarvis.mjs` | Working |
| HUD tools (graph manipulation) | `src/server/agent/tools-schema.mjs` | Working |
| Edge TTS | `src/server/agent/edge-tts-proxy.mjs` | Working |
| System state API | `GET /agent/system-state` | Working |
| Multi-provider AI | Groq/Gemini/Ollama clients | Working |
| Voice input (browser) | `src/server/hud/agent/voice-input.mjs` | Working |
| Voice output (browser) | `src/server/hud/agent/voice-output.mjs` | Working |
| Agent bridge (WS client) | `src/server/hud/agent/agent-bridge.mjs` | Working |

### In Portals V4
| Component | File | Status |
|-----------|------|--------|
| XRAI adapter | `src/services/xrai-voice-agent/portals-adapter.ts` | Built, not wired in |
| Agent bridge (WS) | `src/services/xrai-voice-agent/agent-bridge.mjs` | Built |
| Voice input | `src/services/xrai-voice-agent/voice-input.mjs` | Built |
| Voice output | `src/services/xrai-voice-agent/voice-output.mjs` | Built |
| Event bus | `src/services/xrai-voice-agent/event-bus.mjs` | Built |
| VoiceIntelligence pipeline | `src/services/voice-intelligence/` | Working (Gemini) |
| Unity bridge | `src/types/bridge.ts` + BridgeTarget.cs | Working |

## Integration Steps

### Phase 1: Wire XRAI Agent into Portals Voice Composer (30 min)

1. **Import adapter in HologramScreen or AdvancedComposerScreen:**
```typescript
import { createPortalsVoiceAgent } from '../services/xrai-voice-agent/portals-adapter';

// In useEffect:
const agent = createPortalsVoiceAgent({
  wsUrl: 'ws://localhost:3210/agent/ws',
  wakeWords: ['jarvis', 'hey jarvis'],
  onCommand: (text) => {
    // Route to existing VoiceIntelligence pipeline
    voiceIntelligence.processCommand(text);
  },
  onToolCall: async (name, input) => {
    // Execute HUD tools (graph manipulation)
    return executeHudTool(name, input);
  },
});
```

2. **Add tool executor that maps HUD tools to Unity bridge actions:**
```typescript
async function executeHudTool(name: string, input: any) {
  switch (name) {
    case 'highlight_nodes':
      unityRef.current?.sendMessage('BridgeTarget', 'OnMessage',
        JSON.stringify({ type: 'highlight_objects', payload: { ids: input.nodeIds } }));
      return { success: true };
    case 'navigate_to_node':
      unityRef.current?.sendMessage('BridgeTarget', 'OnMessage',
        JSON.stringify({ type: 'focus_object', payload: { query: input.query } }));
      return { success: true };
    // ... map other HUD tools to Unity bridge messages
  }
}
```

3. **Send graph context to agent on scene changes:**
```typescript
agent.bus.on('agent:connected', () => {
  agent.send(''); // trigger context sync
});

// On Unity scene update:
function onUnityMessage(msg: string) {
  const data = JSON.parse(msg);
  if (data.type === 'scene_state') {
    // Forward to XRAI agent for spatial awareness
    bus.emit('graph:updated', data);
  }
}
```

### Phase 2: Dual-Mode Voice (Local + Cloud Agent) (30 min)

The existing VoiceIntelligence pipeline (local-first, Gemini fallback) stays.
XRAI agent adds a third tier: **Claude-powered spatial intelligence** via WebSocket.

```
User speaks
    ↓
expo-speech-recognition (device STT, free)
    ↓
localIntentParser (regex, offline, <1ms)
    ├─ confidence ≥ 0.8 → execute locally (move, rotate, add object)
    ├─ confidence < 0.8, no XRAI server → Gemini cloud fallback
    └─ confidence < 0.8, XRAI server available → route to XRAI agent
        ↓
    WebSocket → Jarvis (Claude/Groq/Gemini/Ollama)
        ↓
    Tool calls → execute via Unity bridge
        ↓
    TTS response → Edge TTS or expo-speech
```

### Phase 3: Jarvis Daemon as Background Service (optional, post-MVP)

For always-on voice on macOS during development:
- Jarvis daemon (`src/daemon/jarvis-listen.mjs`) runs in background
- Shares memory with Claude Code and Portals server
- Can be triggered by Portals app or by voice in terminal
- Not required for MVP — the WebSocket agent handles everything

## Protocol Reference

### WebSocket Messages (Client → Server)

```json
{ "type": "speech", "text": "show me the headings" }
{ "type": "graph_snapshot", "nodeCount": 42, "url": "...", "focusedNode": "..." }
{ "type": "tool_result", "tool_use_id": "...", "result": { ... } }
```

### WebSocket Messages (Server → Client)

```json
{ "type": "text_delta", "text": "I can see " }
{ "type": "tool_call", "tool_use_id": "...", "name": "search_graph", "input": {...} }
{ "type": "done", "full_text": "I found 5 heading nodes..." }
{ "type": "error", "message": "..." }
```

### Edge TTS (HTTP)

```
POST /agent/tts
{ "text": "Hello, I found 5 headings", "voice": "en-US-GuyNeural" }
→ 200 audio/mpeg (MP3 binary)
```

## Provider Chain

| Priority | Provider | Model | Cost | Rate Limit |
|----------|----------|-------|------|------------|
| 1 | Groq | Llama 3.3 70B | Free | 100K TPD |
| 2 | Gemini | 2.5 Flash | Free | Quota-based |
| 3 | Ollama | Llama 3.1 8B | Free | None (local) |
| 4 | Claude | Opus 4.6 | Paid | Per-token |

Auto-failover with anti-ping-pong: tracks failed providers, 60s cooldown when all exhausted.

## Testing Checklist

- [ ] Start XRAI server: `node scrape.mjs --serve` (port 3210)
- [ ] Verify WebSocket: `wscat -c ws://localhost:3210/agent/ws` then `{"type":"speech","text":"hello"}`
- [ ] Verify TTS: `curl -X POST localhost:3210/agent/tts -H "Content-Type: application/json" -d '{"text":"hello"}' -o test.mp3`
- [ ] Wire adapter in Portals: import in screen, test voice command
- [ ] Verify Unity bridge: HUD tool → Unity bridge message → scene change
- [ ] Full E2E: voice command → STT → agent → tool call → Unity action → TTS response
