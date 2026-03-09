# Jarvis Skills & Tools Reference

> Skills are high-level capabilities. Tools are the primitive operations skills are built from.

## Skills (High-Level)

### Voice Composer Mode
**Trigger**: Always-on microphone or WebSocket `speech` message
**Flow**: `mic → STT → intent → LLM → tool calls → response → TTS → speaker`
**Enforcement**: Strict — this is the primary user interface

### Spatial Navigation
**Trigger**: User asks about web page structure or graph
**Tools used**: `search_graph`, `highlight_nodes`, `navigate_to_node`, `list_nodes`, `explain_node`
**Example**: "Show me all the headings" → search_graph(type="heading") → highlight_nodes(ids)

### Deep Extraction
**Trigger**: User wants to explore a linked page
**Tools used**: `extract_deeper` (fetches + parses linked URL)
**Example**: "Tell me more about that link" → extract_deeper(nodeId) → explain results

### Memory & Learning
**Trigger**: Automatic after significant events, or user asks "remember this"
**Tools used**: `read_memory`, `write_memory`, `record_lesson`, `write_kb`
**Example**: After fixing a bug, auto-records lesson categorized as "bug-fix"

### File Operations
**Trigger**: User asks to read/write/search files
**Tools used**: `read_file`, `write_file`, `search_project`, `list_directory`
**Enforcement**: Moderate — won't overwrite without confirmation

### System Control
**Trigger**: User asks to open something or run a command
**Tools used**: `run_shell`, `open_browser`
**Enforcement**: Moderate — destructive commands require confirmation

## Tools (Primitive Operations)

### Daemon Tools

```javascript
// Shell execution
{ name: "run_shell", input: { command: "ls -la" } }
// → { stdout, stderr, exitCode }

// Browser
{ name: "open_browser", input: { url: "https://example.com" } }
// → { success: true }

// File I/O
{ name: "read_file", input: { path: "/path/to/file", maxChars: 500 } }
// → { content: "..." }

{ name: "write_file", input: { path: "/path/to/file", content: "..." } }
// → { success: true, bytes: 123 }

// Search
{ name: "search_project", input: { query: "createJarvis", path: "src/" } }
// → { matches: [{ file, line, text }] }

// Memory
{ name: "read_memory", input: { key: "jarvis-status" } }
// → { value: "online" }

{ name: "write_memory", input: { key: "my-key", value: { ... } } }
// → { success: true }

// Learning
{ name: "record_lesson", input: { category: "bug-fix", lesson: "...", confidence: 0.9 } }
// → { recorded: true }

// Knowledge Base
{ name: "write_kb", input: { filename: "_MY_DOC.md", content: "...", topic: "..." } }
// → { written: true, path: "/Users/.../KnowledgeBase/_MY_DOC.md" }

// Directory
{ name: "list_directory", input: { path: "src/server" } }
// → { entries: ["index.mjs", "agent/", "hud/"] }

// Activity log
{ name: "read_activity_log", input: { limit: 20 } }
// → { entries: [{ ts, agent, action, success }] }
```

### HUD Tools (WebSocket Agent)

```javascript
// Graph queries
{ name: "search_graph", input: { type: "heading" } }
// → { nodes: [{ id, label, type, ring }] }

{ name: "list_nodes", input: {} }
// → { nodes: [...], summary: "4 nodes: 1 page, 1 meta, 1 heading, 1 link-group" }

// Navigation
{ name: "navigate_to_node", input: { query: "Introduction" } }
// → { navigated: true, node: { id, label } }

{ name: "reset_view", input: {} }
// → { reset: true }

// Visual
{ name: "highlight_nodes", input: { ids: ["node-1", "node-2"] } }
// → { highlighted: 2 }

// Analysis
{ name: "explain_node", input: { nodeId: "node-1" } }
// → { label, type, ring, connections: [...], metadata: {...} }

{ name: "extract_deeper", input: { nodeId: "link-1" } }
// → { title, graph: { nodes, links }, summary: "..." }
```

## Adding New Skills

1. Define the tool schema in `src/server/agent/tools-schema.mjs`
2. Implement the handler in the appropriate agent (daemon or HUD)
3. Add tests in `test/tools-schema.test.mjs`
4. Document here
5. The LLM will automatically discover and use tools based on their descriptions

## Adding New Providers

1. Create `src/server/agent/<provider>-client.mjs`
2. Implement: `stream(systemPrompt, messages, tools)` → AsyncGenerator + `isReady()` → boolean
3. Add to `failover-client.mjs` provider list in `index.mjs`
4. Add to daemon's `getActiveClient()` / `switchProvider()` in `jarvis-listen.mjs`
5. Add to system-state providers in `index.mjs`
6. Test failover: rate-limit primary → verify auto-switch
