/**
 * Failover AI client — wraps multiple AI clients with automatic failover.
 * Same interface as groq-client.mjs / gemini-client.mjs / ollama-client.mjs:
 *   stream(systemPrompt, messages, tools) → AsyncGenerator<event>
 *   isReady() → boolean
 *
 * When the active provider returns a 429 or error, automatically retries
 * with the next provider. Tracks failed providers with cooldown.
 */

export function createFailoverClient(providers) {
  // providers: [{ client, name }] in priority order
  const failedUntil = new Map(); // name → timestamp when it can be retried
  const COOLDOWN_MS = 60_000; // 60s cooldown for failed providers
  const RETRY_COOLDOWN_MS = 10_000; // 10s before retrying a provider after transient error

  function getAvailableProviders() {
    const now = Date.now();
    return providers.filter(p => {
      if (!p.client.isReady()) return false;
      const until = failedUntil.get(p.name);
      if (until && now < until) return false;
      return true;
    });
  }

  function isReady() {
    return getAvailableProviders().length > 0;
  }

  function markFailed(name, durationMs = COOLDOWN_MS) {
    failedUntil.set(name, Date.now() + durationMs);
  }

  function getActiveProvider() {
    const available = getAvailableProviders();
    return available.length > 0 ? available[0] : null;
  }

  async function* stream(systemPrompt, messages, tools) {
    const tried = new Set();

    while (true) {
      const provider = getAvailableProviders().find(p => !tried.has(p.name));
      if (!provider) {
        // All providers exhausted — try any that are ready regardless of cooldown
        const lastResort = providers.find(p => p.client.isReady() && !tried.has(p.name));
        if (lastResort) {
          tried.add(lastResort.name);
          yield* tryProvider(lastResort, systemPrompt, messages, tools, tried);
          return;
        }
        yield { type: "error", message: "All AI providers exhausted. Please wait and try again." };
        return;
      }

      tried.add(provider.name);
      let succeeded = false;
      let gotContent = false;

      for await (const event of tryProvider(provider, systemPrompt, messages, tools, tried)) {
        if (event.type === "_failover") {
          // Internal signal: this provider failed, try next
          break;
        }
        if (event.type === "text_delta" || event.type === "tool_use_done") {
          gotContent = true;
        }
        succeeded = true;
        yield event;
      }

      if (gotContent || succeeded) return;
      // Otherwise loop to try next provider
    }
  }

  async function* tryProvider(provider, systemPrompt, messages, tools, tried) {
    try {
      for await (const event of provider.client.stream(systemPrompt, messages, tools)) {
        if (event.type === "error") {
          const msg = event.message || "";
          const is429 = msg.includes("429") || msg.includes("rate limit") || msg.includes("Rate limit") || msg.includes("quota");
          if (is429) {
            markFailed(provider.name, COOLDOWN_MS);
            yield { type: "_failover" };
            return;
          }
          // Non-rate-limit error — short cooldown, try next
          markFailed(provider.name, RETRY_COOLDOWN_MS);
          yield { type: "_failover" };
          return;
        }
        yield event;
      }
    } catch (err) {
      markFailed(provider.name, RETRY_COOLDOWN_MS);
      yield { type: "_failover" };
    }
  }

  return {
    stream,
    isReady,
    getActiveProvider,
    provider: "failover",
  };
}
