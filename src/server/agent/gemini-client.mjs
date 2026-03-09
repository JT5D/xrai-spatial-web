/**
 * Gemini Flash client — free AI backend for Jarvis.
 * Uses Google's Gemini 2.0 Flash via the REST API.
 * Free tier: 15 RPM, 1M TPM, 1500 RPD — more than enough.
 *
 * Implements the same interface as claude-client.mjs:
 *   stream(systemPrompt, messages, tools) → AsyncGenerator<event>
 *   isReady() → boolean
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function createGeminiClient(options = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const model = options.model || "gemini-2.5-flash";

  function isReady() {
    return !!apiKey;
  }

  /**
   * Convert Anthropic-style messages to Gemini format.
   * Anthropic: [{ role: "user"|"assistant", content: string|array }]
   * Gemini:    [{ role: "user"|"model", parts: [{ text }] }]
   */
  function convertMessages(messages) {
    return messages.map((msg) => {
      const role = msg.role === "assistant" ? "model" : "user";
      let parts;
      if (typeof msg.content === "string") {
        parts = [{ text: msg.content }];
      } else if (Array.isArray(msg.content)) {
        parts = msg.content
          .filter((b) => b.type === "text")
          .map((b) => ({ text: b.text }));
        if (parts.length === 0) parts = [{ text: "" }];
      } else {
        parts = [{ text: String(msg.content) }];
      }
      return { role, parts };
    });
  }

  /**
   * Convert Anthropic tool definitions to Gemini function declarations.
   */
  function convertTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: "object", properties: {} },
      })),
    }];
  }

  /**
   * Stream a conversation. Yields events matching claude-client interface:
   *   { type: 'text_delta', text }
   *   { type: 'tool_use_done', id, name, input }
   *   { type: 'error', message }
   */
  async function* stream(systemPrompt, messages, tools = []) {
    if (!apiKey) {
      yield { type: "error", message: "GEMINI_API_KEY not set" };
      return;
    }

    const contents = convertMessages(messages);
    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.7,
      },
    };

    const geminiTools = convertTools(tools);
    if (geminiTools) body.tools = geminiTools;

    let res;
    try {
      res = await fetch(
        `${API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
    } catch (err) {
      yield { type: "error", message: `Network error: ${err.message}` };
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Gemini API ${res.status}: ${text.slice(0, 200)}` };
      return;
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let toolCallCounter = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }

        const candidates = chunk.candidates || [];
        for (const candidate of candidates) {
          const parts = candidate.content?.parts || [];
          for (const part of parts) {
            if (part.text) {
              yield { type: "text_delta", text: part.text };
            }
            if (part.functionCall) {
              yield {
                type: "tool_use_done",
                id: `gemini-tc-${++toolCallCounter}`,
                name: part.functionCall.name,
                input: part.functionCall.args || {},
              };
            }
          }
        }
      }
    }

    yield { type: "message_stop" };
  }

  return { stream, isReady, provider: "gemini" };
}
