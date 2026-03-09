/**
 * Tools stub — future interface for external tool integration.
 * Tools bridge the HUD to external services (APIs, AI models, data sources).
 */
export function createTools(hooks) {
  const registry = new Map();

  function register(name, tool) {
    registry.set(name, tool);
  }

  function get(name) {
    return registry.get(name) || null;
  }

  function list() {
    return Array.from(registry.keys());
  }

  return { register, get, list };
}
