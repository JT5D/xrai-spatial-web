/**
 * Minimal event bus — drop-in replacement for hooks system.
 * Zero dependencies. Works in browser + Node.js.
 */
export function createEventBus() {
  const listeners = new Map();

  function on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  }

  function emit(event, data) {
    const fns = listeners.get(event);
    if (!fns) return;
    for (const fn of fns) {
      try { fn(data); } catch (e) { console.error(`[event-bus] ${event}:`, e); }
    }
  }

  function off(event, fn) {
    if (fn) listeners.get(event)?.delete(fn);
    else listeners.delete(event);
  }

  function dispose() {
    listeners.clear();
  }

  return { on, emit, off, dispose };
}
