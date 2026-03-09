/**
 * Focus manager — manages focused/peripheral/idle states for all nodes.
 * Bridges gaze events to visual state changes via hooks.
 */
export function createFocus(hooks) {
  let focusedNodeId = null;
  let lockedNodeId = null; // click-locked focus

  hooks.on("gaze:hover", ({ nodeId }) => {
    if (lockedNodeId) return; // don't override click-lock
    focusedNodeId = nodeId;
    hooks.emit("focus:set", { nodeId });
  });

  hooks.on("gaze:leave", () => {
    if (lockedNodeId) return;
    focusedNodeId = null;
    hooks.emit("focus:clear");
  });

  hooks.on("focus:select", ({ nodeId }) => {
    if (lockedNodeId === nodeId) {
      // Toggle off
      lockedNodeId = null;
      focusedNodeId = null;
      hooks.emit("focus:clear");
      hooks.emit("infocard:hide");
    } else {
      lockedNodeId = nodeId;
      focusedNodeId = nodeId;
      hooks.emit("focus:set", { nodeId });
      hooks.emit("infocard:show", { nodeId });
      hooks.emit("camera:focus", { nodeId });
    }
  });

  function getFocused() {
    return focusedNodeId;
  }

  function getLocked() {
    return lockedNodeId;
  }

  function clearLock() {
    lockedNodeId = null;
    focusedNodeId = null;
    hooks.emit("focus:clear");
    hooks.emit("infocard:hide");
  }

  return { getFocused, getLocked, clearLock };
}
