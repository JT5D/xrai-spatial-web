/**
 * Agent bridge — WebSocket client + full voice interaction orchestration.
 * speech → server → tool execution → continue → TTS
 */
export function createAgentBridge(hud, hooks, agentTools, voiceInput, voiceOutput) {
  let ws = null;
  let reconnectDelay = 1000;
  let reconnectTimer = null;
  let responseText = "";

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/agent/ws`);

    ws.onopen = () => {
      reconnectDelay = 1000;
      hooks.emit("agent:connected");
    };

    ws.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "text_delta") {
        responseText += msg.text;
        hooks.emit("agent:response-delta", responseText);
      } else if (msg.type === "tool_call") {
        // Execute tool locally
        hooks.emit("agent:tool-call", {
          name: msg.name,
          input: msg.input,
        });

        const result = await agentTools.execute(msg.name, msg.input);

        hooks.emit("agent:tool-result", {
          name: msg.name,
          result,
        });

        // Send result back to server
        if (ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "tool_result",
              tool_use_id: msg.tool_use_id,
              result,
            })
          );
        }
      } else if (msg.type === "done") {
        const text = msg.full_text || responseText;
        hooks.emit("agent:response-done", text);
        // Speak the response
        if (text) voiceOutput.speak(text);
        responseText = "";
      } else if (msg.type === "error") {
        hooks.emit("agent:error", msg.message);
        responseText = "";
      }
    };

    ws.onclose = () => {
      hooks.emit("agent:disconnected");
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
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
      hooks.emit("agent:error", "Not connected to server");
      return;
    }

    // Cancel current TTS if speaking
    voiceOutput.stop();
    responseText = "";

    // Send graph snapshot first
    sendGraphSnapshot();

    // Send speech
    ws.send(JSON.stringify({ type: "speech", text: text.trim() }));
  }

  function sendGraphSnapshot() {
    if (!ws || ws.readyState !== 1) return;

    // Build graph context from current HUD state
    const hooks_ = hud.getHooks();
    // We can't easily get graph state from here, so we emit a request
    // and the orchestrator will respond
    // For now, send basic info
    ws.send(
      JSON.stringify({
        type: "graph_snapshot",
        url: new URLSearchParams(location.search).get("url") || "",
        nodeCount: 0, // will be updated by orchestrator
        focusedNode: null,
        nodeTypes: {},
      })
    );
  }

  // Listen for voice input
  hooks.on("agent:final", (text) => send(text));

  // Listen for mic toggle
  hooks.on("agent:mic-toggle", () => {
    if (voiceInput.isSupported()) {
      voiceInput.toggle();
    }
  });

  function dispose() {
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null; // prevent reconnect
      ws.close();
    }
  }

  // Auto-connect
  connect();

  return { send, connect, dispose };
}
