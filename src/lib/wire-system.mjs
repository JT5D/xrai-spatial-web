/**
 * Wire System - Zero-dependency reactive binding engine
 * Ported from Portals V4 wire-interpreter.js
 *
 * Connects data sources to targets through declarative wire definitions.
 * Works in both browser and Node.js environments.
 *
 * Wire format: { src: "audio.bass", mod: "scale:0.5", tgt: "cube.scale.y" }
 *
 * @module wire-system
 */

/**
 * @typedef {Object} Wire
 * @property {string} src - Source path in dot notation (e.g., "audio.bass")
 * @property {string} [mod] - Modifier string as "operation:amount" (e.g., "scale:0.5")
 * @property {string} tgt - Target path in dot notation. Use "*" as first segment for wildcard (e.g., "*.scale")
 */

/**
 * @typedef {Object.<string, Object.<string, number>>} SourceMap
 * Nested object keyed by source type, then property name. Values are numbers.
 * Example: { audio: { bass: 0.8, mid: 0.5 }, time: { t: 1.23 } }
 */

/**
 * @typedef {Object.<string, Object>} TargetMap
 * Nested object keyed by target name, then property name.
 * Example: { cube: { scale: { y: 1 } }, sphere: { emission: 0 } }
 */

/**
 * Resolves a dot-notation path to a value from a nested source object.
 * Supports paths of any depth (e.g., "audio.bass" or "hand.left.grip").
 *
 * @param {string} path - Dot-notation path (e.g., "audio.bass")
 * @param {SourceMap} sources - Source data object
 * @returns {number} The resolved value, or 0 if not found
 */
function resolvePath(path, obj) {
  const segments = path.split(".");
  let current = obj;
  for (const seg of segments) {
    if (current == null || typeof current !== "object") return 0;
    current = current[seg];
  }
  return typeof current === "number" ? current : 0;
}

/**
 * Sets a value at a dot-notation path on a target object, creating
 * intermediate objects as needed. Wildcard ("*") as the first segment
 * applies the value to all targets.
 *
 * @param {string} path - Dot-notation target path (e.g., "cube.scale.y" or "*.scale")
 * @param {number} value - Value to set
 * @param {TargetMap} targets - Target objects
 */
function setPath(path, value, targets) {
  const segments = path.split(".");
  const first = segments[0];
  const rest = segments.slice(1);

  if (first === "*") {
    // Wildcard: apply to every target
    for (const key of Object.keys(targets)) {
      if (targets[key] != null) {
        assignNested(targets[key], rest, value);
      }
    }
  } else if (targets[first] != null) {
    assignNested(targets[first], rest, value);
  }
}

/**
 * Assigns a value at a nested path within an object, creating intermediate
 * objects if they don't exist.
 *
 * @param {Object} obj - Object to mutate
 * @param {string[]} segments - Remaining path segments
 * @param {number} value - Value to assign
 */
function assignNested(obj, segments, value) {
  if (segments.length === 0) return;
  if (segments.length === 1) {
    obj[segments[0]] = value;
    return;
  }
  const [head, ...tail] = segments;
  if (obj[head] == null || typeof obj[head] !== "object") {
    obj[head] = {};
  }
  assignNested(obj[head], tail, value);
}

/**
 * Applies a modifier to a value.
 *
 * Supported modifiers:
 * - `scale:n`  - Multiply value by n (default n=1)
 * - `offset:n` - Add n to value (default n=1)
 * - `invert`   - Returns 1 - value
 * - `sin:n`    - Sinusoidal oscillation: sin(v * PI * 2 * n) * 0.5 + 0.5
 * - `clamp`    - Clamp value to [0, 1]
 * - `step:n`   - Step function: 1 if value > n, else 0
 * - `smooth`   - Smoothing (exponential moving average, requires engine state)
 *
 * @param {number} value - Input value
 * @param {string|undefined} mod - Modifier string (e.g., "scale:0.5")
 * @param {Object} [state] - Per-wire state object for stateful modifiers
 * @param {number} [dt=1/60] - Delta time in seconds for time-dependent modifiers
 * @returns {number} Modified value
 */
function applyMod(value, mod, state, dt) {
  if (!mod) return value;

  const colonIdx = mod.indexOf(":");
  const op = colonIdx === -1 ? mod : mod.slice(0, colonIdx);
  const amt =
    colonIdx === -1 ? undefined : parseFloat(mod.slice(colonIdx + 1));
  const a = Number.isFinite(amt) ? amt : 1;

  switch (op) {
    case "scale":
      return value * a;

    case "offset":
      return value + a;

    case "invert":
      return 1 - value;

    case "sin":
      return Math.sin(value * Math.PI * 2 * a) * 0.5 + 0.5;

    case "clamp": {
      // clamp supports optional range: "clamp:min,max" or defaults to [0, 1]
      if (amt !== undefined && mod.includes(",")) {
        const parts = mod.slice(colonIdx + 1).split(",").map(Number);
        const lo = Number.isFinite(parts[0]) ? parts[0] : 0;
        const hi = Number.isFinite(parts[1]) ? parts[1] : 1;
        return Math.max(lo, Math.min(hi, value));
      }
      return Math.max(0, Math.min(1, value));
    }

    case "step":
      return value > a ? 1 : 0;

    case "smooth": {
      // Exponential moving average: smoothed += (value - smoothed) * factor
      // "smooth:0.1" means factor = 0.1 (lower = smoother)
      if (!state) return value;
      const factor = Number.isFinite(amt) ? amt : 0.1;
      const effectiveDt = Number.isFinite(dt) ? dt : 1 / 60;
      const prev =
        state._smoothed !== undefined ? state._smoothed : value;
      const smoothed = prev + (value - prev) * Math.min(1, factor * effectiveDt * 60);
      state._smoothed = smoothed;
      return smoothed;
    }

    default:
      return value;
  }
}

/**
 * Core Wire Engine class. Manages a set of wires and evaluates them
 * each tick by reading from sources, applying modifiers, and writing
 * to targets.
 */
class WireEngine {
  /**
   * @param {Wire[]} wires - Initial array of wire definitions
   */
  constructor(wires = []) {
    /** @type {Wire[]} */
    this.wires = wires.map((w) => ({ ...w }));

    /**
     * Per-wire state for stateful modifiers (e.g., smooth).
     * Keyed by wire index; lazily created.
     * @type {Map<number, Object>}
     */
    this._state = new Map();
  }

  /**
   * Evaluates all wires: reads source values, applies modifiers,
   * and writes results to targets.
   *
   * @param {SourceMap} sources - Data sources (e.g., { audio: { bass: 0.8 } })
   * @param {TargetMap} targets - Mutable target objects (e.g., { cube: { scale: {} } })
   * @param {number} [dt] - Delta time in seconds (for smooth modifier). Defaults to 1/60.
   */
  tick(sources, targets, dt) {
    for (let i = 0; i < this.wires.length; i++) {
      const wire = this.wires[i];
      let v = resolvePath(wire.src, sources);
      if (wire.mod) {
        let state = this._state.get(i);
        if (!state) {
          state = {};
          this._state.set(i, state);
        }
        v = applyMod(v, wire.mod, state, dt);
      }
      setPath(wire.tgt, v, targets);
    }
  }

  /**
   * Adds a wire to the engine.
   *
   * @param {Wire} wire - Wire definition to add
   * @returns {number} Index of the newly added wire
   */
  add(wire) {
    this.wires.push({ ...wire });
    return this.wires.length - 1;
  }

  /**
   * Removes a wire by index.
   *
   * @param {number} index - Index of the wire to remove
   * @returns {boolean} True if the wire was removed, false if index was out of range
   */
  remove(index) {
    if (index < 0 || index >= this.wires.length) return false;
    this.wires.splice(index, 1);
    // Shift state entries for indices above the removed one
    const newState = new Map();
    for (const [k, v] of this._state) {
      if (k < index) newState.set(k, v);
      else if (k > index) newState.set(k - 1, v);
      // k === index is dropped
    }
    this._state = newState;
    return true;
  }

  /**
   * Removes all wires and resets internal state.
   */
  clear() {
    this.wires = [];
    this._state.clear();
  }

  /**
   * Loads a preset (array of wires), replacing all current wires.
   *
   * @param {Wire[]} wires - Array of wire definitions
   */
  loadPreset(wires) {
    this.clear();
    for (const w of wires) {
      this.add(w);
    }
  }

  /**
   * Returns the current wire count.
   *
   * @returns {number}
   */
  get count() {
    return this.wires.length;
  }

  /**
   * Returns a deep copy of all current wire definitions.
   *
   * @returns {Wire[]}
   */
  toJSON() {
    return this.wires.map((w) => ({ ...w }));
  }
}

/**
 * Factory function to create a new WireEngine instance.
 *
 * @param {Wire[]} [wires=[]] - Initial wire definitions
 * @returns {WireEngine} A new WireEngine instance
 *
 * @example
 * const engine = createWireEngine([
 *   { src: "audio.bass", mod: "scale:0.5", tgt: "cube.scale.y" },
 *   { src: "time.t", mod: "sin:0.5", tgt: "*.opacity" },
 * ]);
 *
 * // Each frame:
 * engine.tick(
 *   { audio: { bass: 0.8 }, time: { t: performance.now() / 1000 } },
 *   { cube: { scale: { y: 1 } }, sphere: { opacity: 1 } }
 * );
 */
export function createWireEngine(wires = []) {
  return new WireEngine(wires);
}

// Also export the class and helpers for advanced usage
export { WireEngine, applyMod, resolvePath, setPath };
