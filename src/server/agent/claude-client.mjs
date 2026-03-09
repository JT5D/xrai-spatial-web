/**
 * Claude Messages API wrapper — streaming via native fetch + SSE parsing.
 * Zero dependencies. Reads ANTHROPIC_API_KEY from env.
 */

export function createClaudeClient(options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = options.model || "claude-sonnet-4-20250514";

  function isReady() {
    return !!apiKey;
  }

  /**
   * Stream a conversation. Yields structured events:
   *   { type: 'text_delta', text }
   *   { type: 'tool_use_start', id, name, input_json_so_far }
   *   { type: 'tool_use_done', id, name, input }
   *   { type: 'message_stop' }
   *   { type: 'error', message }
   */
  async function* stream(systemPrompt, messages, tools = []) {
    if (!apiKey) {
      yield { type: "error", message: "ANTHROPIC_API_KEY not set" };
      return;
    }

    const body = {
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      stream: true,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      yield { type: "error", message: `Network error: ${err.message}` };
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield {
        type: "error",
        message: `Claude API ${res.status}: ${text.slice(0, 200)}`,
      };
      return;
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentToolId = null;
    let currentToolName = null;
    let currentToolInput = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }

        // Content block text delta
        if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (event.delta?.type === "input_json_delta") {
            currentToolInput += event.delta.partial_json || "";
          }
        }

        // Content block start (tool use)
        if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            currentToolId = event.content_block.id;
            currentToolName = event.content_block.name;
            currentToolInput = "";
          }
        }

        // Content block stop (tool use complete)
        if (event.type === "content_block_stop") {
          if (currentToolId) {
            let input = {};
            try {
              input = JSON.parse(currentToolInput);
            } catch {
              // partial JSON, use empty
            }
            yield {
              type: "tool_use_done",
              id: currentToolId,
              name: currentToolName,
              input,
            };
            currentToolId = null;
            currentToolName = null;
            currentToolInput = "";
          }
        }

        // Message stop
        if (event.type === "message_stop") {
          yield { type: "message_stop" };
        }

        // Message delta (stop_reason)
        if (event.type === "message_delta") {
          if (event.delta?.stop_reason === "tool_use") {
            // Tool use pending — handled by content_block_stop above
          }
        }
      }
    }
  }

  return { stream, isReady };
}
