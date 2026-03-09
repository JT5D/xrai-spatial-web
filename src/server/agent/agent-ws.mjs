/**
 * WebSocket upgrade handler for /agent/ws.
 * Uses the `ws` library for robust frame handling.
 * Bridges browser ↔ Jarvis agent with tool call round-trips.
 */
import { WebSocketServer } from "ws";

export function createAgentWS(server, jarvis) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/agent/ws") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    let pendingToolCalls = new Map(); // tool_use_id → { name, input }
    let activeGenerator = null;

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      // Update graph context
      if (msg.type === "graph_snapshot") {
        jarvis.setGraphContext(msg);
        return;
      }

      // Tool result from client
      if (msg.type === "tool_result") {
        const pending = pendingToolCalls.get(msg.tool_use_id);
        if (!pending) return;

        pendingToolCalls.delete(msg.tool_use_id);

        // If all pending tool calls are resolved, continue
        if (pendingToolCalls.size === 0) {
          const results = [
            {
              tool_use_id: msg.tool_use_id,
              result: msg.result,
            },
          ];
          try {
            activeGenerator = jarvis.continueWithToolResults(results);
            await drainGenerator(ws, activeGenerator, pendingToolCalls);
          } catch (err) {
            ws.send(
              JSON.stringify({ type: "error", message: err.message })
            );
          }
        }
        return;
      }

      // Speech input
      if (msg.type === "speech") {
        if (!msg.text?.trim()) return;

        pendingToolCalls.clear();

        try {
          activeGenerator = jarvis.handleMessage(msg.text.trim());
          await drainGenerator(ws, activeGenerator, pendingToolCalls);
        } catch (err) {
          ws.send(
            JSON.stringify({ type: "error", message: err.message })
          );
        }
        return;
      }
    });

    ws.on("close", () => {
      pendingToolCalls.clear();
      activeGenerator = null;
    });
  });

  return wss;
}

async function drainGenerator(ws, generator, pendingToolCalls) {
  let fullText = "";

  for await (const event of generator) {
    if (ws.readyState !== 1) return; // OPEN

    if (event.type === "text_delta") {
      fullText += event.text;
      ws.send(JSON.stringify(event));
    } else if (event.type === "needs_tool_result") {
      pendingToolCalls.set(event.tool_use_id, {
        name: event.name,
        input: event.input,
      });
      ws.send(
        JSON.stringify({
          type: "tool_call",
          tool_use_id: event.tool_use_id,
          name: event.name,
          input: event.input,
        })
      );
      // Pause — we need tool results before continuing
      return;
    } else if (event.type === "done") {
      ws.send(
        JSON.stringify({
          type: "done",
          full_text: event.full_text || fullText,
        })
      );
    } else if (event.type === "error") {
      ws.send(JSON.stringify(event));
    }
  }

  // If generator ended without explicit done
  if (fullText && pendingToolCalls.size === 0) {
    ws.send(JSON.stringify({ type: "done", full_text: fullText }));
  }
}
