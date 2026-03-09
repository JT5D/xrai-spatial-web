/**
 * Groq client — blazing fast free AI backend for Jarvis.
 * Uses Groq's OpenAI-compatible API with Llama 3.3 70B.
 * Free tier: 30 RPM, 14.4K tokens/min — fastest inference available.
 *
 * Same interface as claude-client.mjs:
 *   stream(systemPrompt, messages, tools) → AsyncGenerator<event>
 *   isReady() → boolean
 */

const API_BASE = "https://api.groq.com/openai/v1";

export function createGroqClient(options = {}) {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  const model = options.model || "llama-3.3-70b-versatile";

  function isReady() {
    return !!apiKey;
  }

  /**
   * Convert Anthropic-style messages to OpenAI format (Groq uses OpenAI compat).
   */
  function convertMessages(systemPrompt, messages) {
    const out = [{ role: "system", content: systemPrompt }];
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        out.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // Extract text from content blocks
        const text = msg.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        if (text) out.push({ role: msg.role, content: text });
      }
    }
    return out;
  }

  /**
   * Convert Anthropic tool definitions to OpenAI function calling format.
   */
  function convertTools(tools) {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema || { type: "object", properties: {} },
      },
    }));
  }

  async function* stream(systemPrompt, messages, tools = []) {
    if (!apiKey) {
      yield { type: "error", message: "GROQ_API_KEY not set" };
      return;
    }

    const body = {
      model,
      messages: convertMessages(systemPrompt, messages),
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    };

    const groqTools = convertTools(tools);
    if (groqTools) body.tools = groqTools;

    let res;
    try {
      res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      yield { type: "error", message: `Network error: ${err.message}` };
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Groq API ${res.status}: ${text.slice(0, 200)}` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let toolCalls = new Map(); // index → { id, name, args }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }

        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: "text_delta", text: delta.content };
        }

        // Tool call streaming
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: tc.id || `groq-tc-${idx}`, name: "", args: "" });
            }
            const entry = toolCalls.get(idx);
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
          }
        }

        // Check for finish
        if (chunk.choices?.[0]?.finish_reason === "tool_calls") {
          for (const [, tc] of toolCalls) {
            let input = {};
            try { input = JSON.parse(tc.args); } catch {}
            yield { type: "tool_use_done", id: tc.id, name: tc.name, input };
          }
          toolCalls.clear();
        }
      }
    }

    yield { type: "message_stop" };
  }

  return { stream, isReady, provider: "groq" };
}
