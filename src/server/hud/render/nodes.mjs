/**
 * Node renderer — TorusGeometry ring outlines (radar blips).
 * Supports breathing animation, focus/recession states, entry animation.
 */
import { getTheme, parseColor } from "../theme/tokens.mjs";

export function createNodes(scene, hooks) {
  const theme = getTheme();
  const group = new THREE.Group();
  scene.add(group);

  const meshMap = new Map(); // nodeId → { mesh, config }

  function build(nodes) {
    clear();
    const startTime = performance.now();

    for (const node of nodes) {
      const typeConfig = theme.node.types[node.type] || theme.node.types["meta"];
      const { color, radius, ringWidth, emissive } = typeConfig;

      // TorusGeometry: ring outline instead of solid sphere
      const geometry = new THREE.TorusGeometry(radius, ringWidth, 16, 48);
      const material = new THREE.MeshStandardMaterial({
        color: parseColor(color),
        emissive: parseColor(color),
        emissiveIntensity: emissive,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        metalness: 0.3,
        roughness: 0.6,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData.nodeId = node.id;
      mesh.userData.nodeData = node;
      mesh.userData.ring = node.ring || 0;

      // Random initial rotation for visual variety
      mesh.rotation.x = Math.random() * Math.PI;
      mesh.rotation.y = Math.random() * Math.PI;

      group.add(mesh);
      meshMap.set(node.id, {
        mesh,
        baseColor: parseColor(color),
        emissiveBase: emissive,
        targetOpacity: theme.node.idleOpacity,
        entryDelay: (node.ring || 0) * theme.entryAnimation.ringDelayMs,
        entryStart: startTime,
      });
    }
  }

  // Entry animation + breathing + position sync
  function update(delta, elapsed) {
    const now = performance.now();
    const breathAmp = theme.node.breathingAmplitude;
    const breathFreq = theme.node.breathingFrequency;

    for (const [id, entry] of meshMap) {
      const { mesh, targetOpacity, entryDelay, entryStart } = entry;
      const node = mesh.userData.nodeData;

      // Entry fade-in
      const entryElapsed = now - entryStart - entryDelay;
      const entryProgress = Math.min(
        1,
        Math.max(0, entryElapsed / theme.entryAnimation.fadeDurationMs)
      );
      const easedEntry = 1 - Math.pow(1 - entryProgress, 3); // ease-out cubic

      // Breathing oscillation
      const breathScale = 1 + Math.sin(elapsed * breathFreq * Math.PI * 2 + mesh.id * 0.5) * breathAmp;

      mesh.material.opacity = targetOpacity * easedEntry;
      mesh.scale.setScalar(breathScale);

      // Slow rotation for liveliness
      mesh.rotation.z += delta * 0.15;

      // Sync position from force simulation
      if (node.x !== undefined) {
        mesh.position.set(node.x, node.y || 0, node.z || 0);
      }
    }
  }

  function setFocusState(focusedId) {
    for (const [id, entry] of meshMap) {
      if (focusedId === null) {
        // Idle: all at idle opacity
        entry.targetOpacity = theme.node.idleOpacity;
        entry.mesh.material.emissiveIntensity = entry.emissiveBase;
      } else if (id === focusedId) {
        // Focused: bright
        entry.targetOpacity = theme.node.focusOpacity;
        entry.mesh.material.emissiveIntensity = entry.emissiveBase * 2.5;
      } else {
        // Recession: nearly invisible
        entry.targetOpacity = theme.node.recessionOpacity;
        entry.mesh.material.emissiveIntensity = entry.emissiveBase * 0.2;
      }
    }
  }

  function getMeshes() {
    return Array.from(meshMap.values()).map((e) => e.mesh);
  }

  function getMeshById(id) {
    return meshMap.get(id)?.mesh || null;
  }

  function clear() {
    for (const [, entry] of meshMap) {
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
      group.remove(entry.mesh);
    }
    meshMap.clear();
  }

  // Agent highlight — pulsing glow on specific nodes
  let highlightedIds = new Set();

  function setHighlight(nodeIds) {
    highlightedIds = new Set(nodeIds);
    for (const [id, entry] of meshMap) {
      if (highlightedIds.has(id)) {
        entry.targetOpacity = theme.node.focusOpacity;
        entry.mesh.material.emissiveIntensity = entry.emissiveBase * 3.0;
        entry.mesh.material.color.setHex(0xffeb3b); // highlight yellow
      }
    }
  }

  function clearHighlight() {
    for (const id of highlightedIds) {
      const entry = meshMap.get(id);
      if (entry) {
        entry.targetOpacity = theme.node.idleOpacity;
        entry.mesh.material.emissiveIntensity = entry.emissiveBase;
        entry.mesh.material.color.setHex(entry.baseColor);
      }
    }
    highlightedIds.clear();
  }

  // Listen for focus events
  hooks.on("focus:set", ({ nodeId }) => setFocusState(nodeId));
  hooks.on("focus:clear", () => setFocusState(null));

  // Listen for agent highlight events
  hooks.on("agent:highlight", ({ nodeIds }) => setHighlight(nodeIds));
  hooks.on("agent:highlight-clear", () => clearHighlight());

  return { build, update, getMeshes, getMeshById, clear };
}
