/**
 * Agent bridge — WebSocket client connecting voice ↔ AI backend.
 * Framework-agnostic. Works with any WebSocket endpoint that speaks
 * the Jarvis protocol (speech → text_delta → tool_call → done).
 *
 * Config:
 *   wsUrl: string                  — WebSocket URL (default: auto-detect from location)
 *   onToolCall: (name, input) → result  — custom tool executor (optional)
 */
export function createAgentBridge(bus, voiceInput, voiceOutput, config = {}) {
  let ws = null;
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  let responseText = "";

  const toolExecutor = config.onToolCall || (async () => ({ error: "no tool executor" }));

  function getWsUrl() {
    if (config.wsUrl) return config.wsUrl;
    if (typeof location === "undefined") return "ws://localhost:3210/agent/ws";
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${location.host}/agent/ws`;
  }

  function connect() {
    ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      reconnectDelay = 1000;
      bus.emit("agent:connected");
    };

    ws.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === "text_delta") {
        responseText += msg.text;
        bus.emit("agent:response-delta", responseText);
      } else if (msg.type === "tool_call") {
        bus.emit("agent:tool-call", { name: msg.name, input: msg.input });
        const result = await toolExecutor(msg.name, msg.input);
        bus.emit("agent:tool-result", { name: msg.name, result });
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "tool_result", tool_use_id: msg.tool_use_id, result }));
        }
      } else if (msg.type === "done") {
        const text = msg.full_text || responseText;
        bus.emit("agent:response-done", text);
        if (text) voiceOutput.speak(text);
        responseText = "";
      } else if (msg.type === "error") {
        bus.emit("agent:error", msg.message);
        responseText = "";
      }
    };

    ws.onclose = () => {
      bus.emit("agent:disconnected");
      scheduleReconnect();
    };

    ws.onerror = () => {};
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      connect();
    }, reconnectDelay);
  }

  function send(text) {
    if (!text?.trim()) return;
    if (!ws || ws.readyState !== 1) {
      bus.emit("agent:error", "Not connected to server");
      return;
    }
    voiceOutput.stop();
    responseText = "";
    ws.send(JSON.stringify({ type: "speech", text: text.trim() }));
  }

  function sendContext(ctx) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "graph_snapshot", ...ctx }));
  }

  // Wire voice input → send
  bus.on("agent:final", (text) => send(text));
  bus.on("agent:mic-toggle", () => {
    if (voiceInput.isSupported()) voiceInput.toggle();
  });

  connect();

  function dispose() {
    clearTimeout(reconnectTimer);
    if (ws) { ws.onclose = null; ws.close(); }
  }

  return { send, sendContext, connect, dispose };
}
