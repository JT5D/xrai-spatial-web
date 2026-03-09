/**
 * Lightweight event emitter — the inter-module communication bus.
 * All HUD subsystems communicate through hooks rather than direct imports.
 */
export function createHooks() {
  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => off(event, fn);
  }

  function off(event, fn) {
    listeners.get(event)?.delete(fn);
  }

  function emit(event, data) {
    const fns = listeners.get(event);
    if (!fns) return;
    for (const fn of fns) {
      try {
        fn(data);
      } catch (err) {
        console.warn(`[hooks] Error in ${event} listener:`, err);
      }
    }
  }

  function once(event, fn) {
    const wrapped = (data) => {
      off(event, wrapped);
      fn(data);
    };
    on(event, wrapped);
    return () => off(event, wrapped);
  }

  function clear() {
    listeners.clear();
  }

  return { on, off, emit, once, clear };
}
