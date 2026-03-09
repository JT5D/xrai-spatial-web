/**
 * Connector renderer — thin lines between nodes.
 * Nearly invisible at idle (opacity 0.06), bloom on gaze hover.
 */
import { getTheme, parseColor } from "../theme/tokens.mjs";

export function createConnectors(scene, hooks) {
  const theme = getTheme();
  const group = new THREE.Group();
  scene.add(group);

  const lineMap = new Map(); // index → { line, source, target }
  let linksData = [];

  function build(links) {
    clear();
    linksData = links;

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const typeConfig = theme.connector.types[link.type] || { color: "#ffffff" };

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(6); // 2 vertices × 3
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const material = new THREE.LineBasicMaterial({
        color: parseColor(typeConfig.color),
        transparent: true,
        opacity: theme.connector.idleOpacity,
        depthWrite: false,
      });

      const line = new THREE.Line(geometry, material);
      line.userData.linkIndex = i;
      line.userData.linkData = link;
      group.add(line);

      lineMap.set(i, {
        line,
        source: link.source,
        target: link.target,
        targetOpacity: theme.connector.idleOpacity,
      });
    }
  }

  function update() {
    for (const [i, entry] of lineMap) {
      const { line, source, target, targetOpacity } = entry;
      const s = typeof source === "object" ? source : null;
      const t = typeof target === "object" ? target : null;

      if (s && t && s.x !== undefined && t.x !== undefined) {
        const pos = line.geometry.attributes.position.array;
        pos[0] = s.x; pos[1] = s.y || 0; pos[2] = s.z || 0;
        pos[3] = t.x; pos[4] = t.y || 0; pos[5] = t.z || 0;
        line.geometry.attributes.position.needsUpdate = true;
      }

      // Smooth opacity transition
      const current = line.material.opacity;
      line.material.opacity += (targetOpacity - current) * 0.1;
    }
  }

  function highlightConnected(nodeId) {
    for (const [i, entry] of lineMap) {
      const sId = typeof entry.source === "object" ? entry.source.id : entry.source;
      const tId = typeof entry.target === "object" ? entry.target.id : entry.target;
      const connected = sId === nodeId || tId === nodeId;
      entry.targetOpacity = connected
        ? theme.connector.hoverOpacity
        : theme.connector.idleOpacity * 0.5;
      if (connected) {
        entry.line.material.color.setHex(0xffffff);
      }
    }
  }

  function resetHighlight() {
    for (const [i, entry] of lineMap) {
      const link = entry.line.userData.linkData;
      const typeConfig = theme.connector.types[link.type] || { color: "#ffffff" };
      entry.targetOpacity = theme.connector.idleOpacity;
      entry.line.material.color.setHex(parseColor(typeConfig.color));
    }
  }

  function clear() {
    for (const [, entry] of lineMap) {
      entry.line.geometry.dispose();
      entry.line.material.dispose();
      group.remove(entry.line);
    }
    lineMap.clear();
    linksData = [];
  }

  // Listen for focus events
  hooks.on("focus:set", ({ nodeId }) => highlightConnected(nodeId));
  hooks.on("focus:clear", () => resetHighlight());

  return { build, update, clear };
}
