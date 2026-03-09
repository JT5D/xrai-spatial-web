/**
 * Agent stub — future interface for focus prediction and intelligent navigation.
 * Agents observe user gaze patterns and predict next focus targets.
 */
export function createAgent(hooks) {
  // Future: subscribe to gaze:hover, focus:select events
  // Analyze patterns and emit agent:suggest events

  return {
    predict(/* context */) {
      return null; // Future: return predicted node ID
    },
    dispose() {},
  };
}
