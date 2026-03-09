/**
 * Label renderer — troika-three-text, hidden by default.
 * Appears with 230ms gaze delay, fades in smoothly, billboard-oriented.
 */
import { getTheme, parseColor } from "../theme/tokens.mjs";

export function createLabels(scene, camera, hooks) {
  const theme = getTheme();
  const l = theme.label;
  const group = new THREE.Group();
  scene.add(group);

  const labelMap = new Map(); // nodeId → { text, targetOpacity, visible }

  function build(nodes) {
    clear();

    for (const node of nodes) {
      const label = node.label || node.id;
      const truncated = label.length > l.maxChars
        ? label.slice(0, l.maxChars - 1) + "…"
        : label;

      const text = new troika.Text();
      text.text = truncated;
      text.fontSize = l.fontSize;
      text.color = l.color;
      text.outlineWidth = l.outlineWidth;
      text.outlineColor = l.outlineColor;
      text.anchorX = "center";
      text.anchorY = "bottom";
      text.material.transparent = true;
      text.material.opacity = l.idleOpacity;
      text.material.depthWrite = false;
      text.userData.nodeId = node.id;

      group.add(text);
      labelMap.set(node.id, {
        text,
        node,
        targetOpacity: l.idleOpacity,
      });

      text.sync();
    }
  }

  function update(delta, elapsed) {
    for (const [id, entry] of labelMap) {
      const { text, node, targetOpacity } = entry;

      // Position above the node ring
      const typeConfig = theme.node.types[node.type] || theme.node.types["meta"];
      if (node.x !== undefined) {
        text.position.set(node.x, (node.y || 0) + typeConfig.radius + 0.8, node.z || 0);
      }

      // Billboard: face camera
      text.quaternion.copy(camera.quaternion);

      // Smooth opacity transition
      const current = text.material.opacity;
      const speed = targetOpacity > current
        ? delta / (l.fadeInMs / 1000)
        : delta / (l.fadeOutMs / 1000);
      text.material.opacity = Math.min(1, Math.max(0, current + Math.sign(targetOpacity - current) * speed));
    }
  }

  function showLabel(nodeId) {
    const entry = labelMap.get(nodeId);
    if (entry) entry.targetOpacity = l.focusOpacity;
  }

  function hideLabel(nodeId) {
    const entry = labelMap.get(nodeId);
    if (entry) entry.targetOpacity = l.idleOpacity;
  }

  function hideAll() {
    for (const [, entry] of labelMap) {
      entry.targetOpacity = l.idleOpacity;
    }
  }

  function clear() {
    for (const [, entry] of labelMap) {
      entry.text.dispose();
      group.remove(entry.text);
    }
    labelMap.clear();
  }

  // Hook into gaze events
  hooks.on("gaze:hover", ({ nodeId }) => showLabel(nodeId));
  hooks.on("gaze:leave", () => hideAll());

  return { build, update, showLabel, hideLabel, hideAll, clear };
}
