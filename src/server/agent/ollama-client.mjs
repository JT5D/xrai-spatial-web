/**
 * Ollama client — local AI fallback for when all cloud providers are rate-limited.
 * Uses Ollama's OpenAI-compatible API at localhost:11434.
 * Zero cost, zero rate limits, runs entirely on-device.
 *
 * Same interface as groq-client.mjs / gemini-client.mjs:
 *   stream(systemPrompt, messages, tools) → AsyncGenerator<event>
 *   isReady() → boolean
 */

const API_BASE = "http://localhost:11434/v1";

export function createOllamaClient(options = {}) {
  const model = options.model || "llama3.1:latest";
  let available = false;

  // Check if Ollama is running on init
  checkAvailability();

  async function checkAvailability() {
    try {
      const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const data = await res.json();
        available = (data.models || []).some(m => m.name === model || m.name.startsWith(model.split(":")[0]));
      }
    } catch {
      available = false;
    }
  }

  function isReady() {
    return available;
  }

  // Re-check availability periodically (Ollama may start/stop)
  const recheckTimer = setInterval(checkAvailability, 60_000);
  if (recheckTimer.unref) recheckTimer.unref();

  function convertMessages(systemPrompt, messages) {
    const out = [{ role: "system", content: systemPrompt }];
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        out.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const text = msg.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        if (text) out.push({ role: msg.role, content: text });
      }
    }
    return out;
  }

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
    // Re-check availability before each request
    await checkAvailability();
    if (!available) {
      yield { type: "error", message: "Ollama not available (not running or model not found)" };
      return;
    }

    const body = {
      model,
      messages: convertMessages(systemPrompt, messages),
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    };

    const ollamaTools = convertTools(tools);
    if (ollamaTools) body.tools = ollamaTools;

    let res;
    try {
      res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      yield { type: "error", message: `Ollama error: ${err.message}` };
      return;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      yield { type: "error", message: `Ollama ${res.status}: ${text.slice(0, 200)}` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let toolCalls = new Map();

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

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: tc.id || `ollama-tc-${idx}`, name: "", args: "" });
            }
            const entry = toolCalls.get(idx);
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
          }
        }

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

  return { stream, isReady, checkAvailability, provider: "ollama" };
}
