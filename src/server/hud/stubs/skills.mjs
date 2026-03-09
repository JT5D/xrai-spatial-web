/**
 * Skills stub — future interface for navigation and search skills.
 * Skills extend HUD with commands like "find node by type" or "navigate to ring 3".
 */
export function createSkills(hooks) {
  const registry = new Map();

  function register(name, handler) {
    registry.set(name, handler);
  }

  function execute(name, params) {
    const handler = registry.get(name);
    if (!handler) return null;
    return handler(params);
  }

  function list() {
    return Array.from(registry.keys());
  }

  return { register, execute, list };
}
