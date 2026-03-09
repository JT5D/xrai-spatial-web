/**
 * Force-Graph View — self-contained force-directed graph visualization.
 *
 * Standalone view-registry plugin. No d3 dependency — uses a built-in
 * spring-embedded (Fruchterman-Reingold inspired) force simulation.
 *
 * Features:
 *   - InstancedMesh for nodes (sphere for 'page', rounded-box for others)
 *   - LineSegments for edges (single draw call)
 *   - Built-in 3D force layout: spring, repulsion, radial, centering, damping
 *   - Color by node type using theme tokens
 *   - Camera fly-to on node click / gaze select
 *   - Entry animation (staggered fade-in by ring)
 *   - Breathing pulse + slow orbit on idle
 *
 * Lifecycle: init(ctx) -> generate(data) -> update(d,e) -> clear() -> dispose()
 */
import { getTheme, parseColor } from "../../theme/tokens.mjs";

// ── Force simulation constants (overridden by theme.force if present) ──

const DEFAULT_FORCE = {
  springStrength: 0.005,
  springLength: 30,
  springLengthPerRing: 8,
  repulsion: 800,
  repulsionDistMax: 150,
  radialStrength: 0.7,
  radialRadiusPerRing: 55,
  centerStrength: 0.002,
  damping: 0.92,
  maxVelocity: 4,
  warmupTicks: 120,
  cooldownRate: 0.0015,
};

// ── Shape identifiers for instanced mesh pools ─────────────────────────

const SHAPE_SPHERE = "sphere";
const SHAPE_BOX = "box";

/** Map node.type -> shape used for instanced rendering */
const TYPE_SHAPE = {
  page: SHAPE_SPHERE,
  meta: SHAPE_BOX,
  tag: SHAPE_BOX,
  breadcrumb: SHAPE_BOX,
  heading: SHAPE_SPHERE,
  media: SHAPE_BOX,
  "link-group": SHAPE_BOX,
};

export function createForceGraphView() {
  let ctx = null;
  const group = new THREE.Group();
  group.name = "ForceGraph";

  // ── State ──────────────────────────────────────────────────────────

  let simNodes = [];       // cloned node objects with vx/vy/vz fields
  let simLinks = [];       // { source: idx, target: idx, type, ringMax }
  let nodeIndexById = {};  // id -> index in simNodes

  // Rendering
  let sphereInstanced = null;  // THREE.InstancedMesh
  let boxInstanced = null;     // THREE.InstancedMesh
  let edgeSegments = null;     // THREE.LineSegments
  let sphereIndices = [];      // which simNode indices map into sphere InstancedMesh
  let boxIndices = [];

  // Simulation
  let alpha = 1;           // simulation heat (1 = hot, 0 = settled)
  let tickCount = 0;
  let warmupDone = false;
  let forceConfig = { ...DEFAULT_FORCE };

  // Interaction
  let focusedNodeId = null;

  // Temp objects (avoid GC churn)
  const _mat4 = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _col = new THREE.Color();
  const _scale = new THREE.Vector3();

  // ── Helpers ────────────────────────────────────────────────────────

  function getNodeColor(node) {
    const theme = getTheme();
    const typeCfg = theme?.node?.types?.[node.type] || theme?.node?.types?.meta;
    if (typeCfg?.color) return parseColor(typeCfg.color);
    return 0xffffff;
  }

  function getNodeRadius(node) {
    const theme = getTheme();
    const typeCfg = theme?.node?.types?.[node.type] || theme?.node?.types?.meta;
    return typeCfg?.radius ?? 1.4;
  }

  function getEdgeColor(link) {
    const theme = getTheme();
    const typeCfg = theme?.connector?.types?.[link.type];
    if (typeCfg?.color) return parseColor(typeCfg.color);
    return 0x444488;
  }

  // ── Force Simulation (Fruchterman-Reingold inspired, 3D) ──────────

  function initSimulation(nodes, links) {
    const theme = getTheme();
    const tf = theme?.force || {};
    forceConfig = { ...DEFAULT_FORCE };
    // Map theme tokens where they exist
    if (tf.linkDistance) forceConfig.springLength = tf.linkDistance;
    if (tf.linkDistancePerRing) forceConfig.springLengthPerRing = tf.linkDistancePerRing;
    if (tf.chargeStrength) forceConfig.repulsion = Math.abs(tf.chargeStrength) * 14;
    if (tf.radialStrength) forceConfig.radialStrength = tf.radialStrength;
    if (tf.radialRadiusPerRing) forceConfig.radialRadiusPerRing = tf.radialRadiusPerRing;
    if (tf.centerStrength) forceConfig.centerStrength = tf.centerStrength;

    // Clone nodes with simulation fields
    simNodes = nodes.map((n, i) => ({
      ...n,
      _idx: i,
      x: n.x ?? (Math.random() - 0.5) * 80,
      y: n.y ?? (Math.random() - 0.5) * 80,
      z: n.z ?? (Math.random() - 0.5) * 80,
      vx: 0, vy: 0, vz: 0,
    }));

    nodeIndexById = {};
    for (let i = 0; i < simNodes.length; i++) {
      nodeIndexById[simNodes[i].id] = i;
    }

    // Resolve links to indices
    simLinks = links
      .map((l) => {
        const si = nodeIndexById[typeof l.source === "object" ? l.source.id : l.source];
        const ti = nodeIndexById[typeof l.target === "object" ? l.target.id : l.target];
        if (si === undefined || ti === undefined) return null;
        const srcRing = simNodes[si].ring ?? 0;
        const tgtRing = simNodes[ti].ring ?? 0;
        return {
          source: si,
          target: ti,
          type: l.type || "links-to",
          ringMax: Math.max(srcRing, tgtRing),
        };
      })
      .filter(Boolean);

    alpha = 1;
    tickCount = 0;
    warmupDone = false;
  }

  function tickSimulation() {
    if (alpha <= 0.001) return; // settled

    const N = simNodes.length;
    const fc = forceConfig;

    // ── Repulsion (all-pairs, capped distance) ──
    for (let i = 0; i < N; i++) {
      const a = simNodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = simNodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dz = a.z - b.z;
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
        if (dist > fc.repulsionDistMax) continue;

        const force = (fc.repulsion * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = (dz / dist) * force;

        a.vx += fx; a.vy += fy; a.vz += fz;
        b.vx -= fx; b.vy -= fy; b.vz -= fz;
      }
    }

    // ── Spring attraction (edges) ──
    for (const link of simLinks) {
      const a = simNodes[link.source];
      const b = simNodes[link.target];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;

      const idealLen = fc.springLength + link.ringMax * fc.springLengthPerRing;
      const displacement = dist - idealLen;
      const force = fc.springStrength * displacement * alpha;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      const fz = (dz / dist) * force;

      a.vx += fx; a.vy += fy; a.vz += fz;
      b.vx -= fx; b.vy -= fy; b.vz -= fz;
    }

    // ── Radial force (push nodes to ring-based shells) ──
    for (const node of simNodes) {
      const ring = node.ring ?? 0;
      const idealRadius = ring * fc.radialRadiusPerRing;
      if (idealRadius < 0.5) continue;

      const dist = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z) || 0.01;
      const displacement = dist - idealRadius;
      const force = fc.radialStrength * displacement * alpha * 0.01;

      node.vx -= (node.x / dist) * force;
      node.vy -= (node.y / dist) * force;
      node.vz -= (node.z / dist) * force;
    }

    // ── Center gravity ──
    for (const node of simNodes) {
      node.vx -= node.x * fc.centerStrength * alpha;
      node.vy -= node.y * fc.centerStrength * alpha;
      node.vz -= node.z * fc.centerStrength * alpha;
    }

    // ── Integrate velocity, apply damping ──
    for (const node of simNodes) {
      node.vx *= fc.damping;
      node.vy *= fc.damping;
      node.vz *= fc.damping;

      // Clamp velocity
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy + node.vz * node.vz);
      if (speed > fc.maxVelocity) {
        const scale = fc.maxVelocity / speed;
        node.vx *= scale;
        node.vy *= scale;
        node.vz *= scale;
      }

      node.x += node.vx;
      node.y += node.vy;
      node.z += node.vz;
    }

    // ── Cool down ──
    alpha = Math.max(0, alpha - fc.cooldownRate);
    tickCount++;

    if (!warmupDone && tickCount >= fc.warmupTicks) {
      warmupDone = true;
      ctx?.hooks?.emit("force:warmup-done", { ticks: tickCount });
    }
  }

  // ── Build instanced meshes ─────────────────────────────────────────

  function buildInstances() {
    const theme = getTheme();

    // Sort nodes into shape pools
    sphereIndices = [];
    boxIndices = [];

    for (let i = 0; i < simNodes.length; i++) {
      const shape = TYPE_SHAPE[simNodes[i].type] || SHAPE_BOX;
      if (shape === SHAPE_SPHERE) sphereIndices.push(i);
      else boxIndices.push(i);
    }

    // ── Sphere pool ──
    if (sphereIndices.length > 0) {
      const sphereGeo = new THREE.SphereGeometry(1, 20, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        metalness: 0.3,
        roughness: 0.6,
        transparent: true,
        opacity: 0,
      });
      sphereInstanced = new THREE.InstancedMesh(sphereGeo, sphereMat, sphereIndices.length);
      sphereInstanced.name = "ForceGraph_Spheres";
      sphereInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      // Per-instance color
      const colors = new Float32Array(sphereIndices.length * 3);
      for (let i = 0; i < sphereIndices.length; i++) {
        const node = simNodes[sphereIndices[i]];
        _col.setHex(getNodeColor(node));
        colors[i * 3] = _col.r;
        colors[i * 3 + 1] = _col.g;
        colors[i * 3 + 2] = _col.b;
      }
      sphereInstanced.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

      group.add(sphereInstanced);
    }

    // ── Box pool ──
    if (boxIndices.length > 0) {
      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      // Slight bevel via scale in update
      const boxMat = new THREE.MeshStandardMaterial({
        metalness: 0.2,
        roughness: 0.7,
        transparent: true,
        opacity: 0,
      });
      boxInstanced = new THREE.InstancedMesh(boxGeo, boxMat, boxIndices.length);
      boxInstanced.name = "ForceGraph_Boxes";
      boxInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

      const colors = new Float32Array(boxIndices.length * 3);
      for (let i = 0; i < boxIndices.length; i++) {
        const node = simNodes[boxIndices[i]];
        _col.setHex(getNodeColor(node));
        colors[i * 3] = _col.r;
        colors[i * 3 + 1] = _col.g;
        colors[i * 3 + 2] = _col.b;
      }
      boxInstanced.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

      group.add(boxInstanced);
    }
  }

  // ── Build edge geometry (LineSegments — single draw call) ──────────

  function buildEdges() {
    const theme = getTheme();
    const idleOpacity = theme?.connector?.idleOpacity ?? 0.06;

    const posArr = new Float32Array(simLinks.length * 6); // 2 verts * 3 components per edge
    const colArr = new Float32Array(simLinks.length * 6);

    for (let i = 0; i < simLinks.length; i++) {
      const link = simLinks[i];
      _col.setHex(getEdgeColor(link));
      colArr[i * 6]     = _col.r;
      colArr[i * 6 + 1] = _col.g;
      colArr[i * 6 + 2] = _col.b;
      colArr[i * 6 + 3] = _col.r;
      colArr[i * 6 + 4] = _col.g;
      colArr[i * 6 + 5] = _col.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colArr, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: idleOpacity,
      depthWrite: false,
    });

    edgeSegments = new THREE.LineSegments(geometry, material);
    edgeSegments.name = "ForceGraph_Edges";
    edgeSegments.frustumCulled = false;
    group.add(edgeSegments);
  }

  // ── Sync GPU buffers with simulation positions ─────────────────────

  function syncPositions(elapsed) {
    const theme = getTheme();
    const breathAmp = theme?.node?.breathingAmplitude ?? 0.03;
    const breathFreq = theme?.node?.breathingFrequency ?? 0.8;

    // ── Spheres ──
    if (sphereInstanced) {
      for (let i = 0; i < sphereIndices.length; i++) {
        const node = simNodes[sphereIndices[i]];
        const r = getNodeRadius(node);
        const breathScale = 1 + Math.sin(elapsed * breathFreq * Math.PI * 2 + i * 0.5) * breathAmp;
        const s = r * breathScale;

        _pos.set(node.x, node.y, node.z);
        _scale.set(s, s, s);
        _mat4.compose(_pos, sphereInstanced.quaternion, _scale);
        sphereInstanced.setMatrixAt(i, _mat4);
      }
      sphereInstanced.instanceMatrix.needsUpdate = true;
    }

    // ── Boxes ──
    if (boxInstanced) {
      for (let i = 0; i < boxIndices.length; i++) {
        const node = simNodes[boxIndices[i]];
        const r = getNodeRadius(node);
        const breathScale = 1 + Math.sin(elapsed * breathFreq * Math.PI * 2 + i * 0.7) * breathAmp;
        const s = r * breathScale * 1.4; // box slightly larger to match visual weight

        _pos.set(node.x, node.y, node.z);
        _scale.set(s, s, s);
        _mat4.compose(_pos, boxInstanced?.quaternion || new THREE.Quaternion(), _scale);
        boxInstanced.setMatrixAt(i, _mat4);
      }
      boxInstanced.instanceMatrix.needsUpdate = true;
    }

    // ── Edges ──
    if (edgeSegments) {
      const posAttr = edgeSegments.geometry.attributes.position;
      const arr = posAttr.array;

      for (let i = 0; i < simLinks.length; i++) {
        const a = simNodes[simLinks[i].source];
        const b = simNodes[simLinks[i].target];
        arr[i * 6]     = a.x;
        arr[i * 6 + 1] = a.y;
        arr[i * 6 + 2] = a.z;
        arr[i * 6 + 3] = b.x;
        arr[i * 6 + 4] = b.y;
        arr[i * 6 + 5] = b.z;
      }
      posAttr.needsUpdate = true;
      edgeSegments.geometry.computeBoundingSphere();
    }
  }

  // ── Entry animation (fade-in by ring delay) ────────────────────────

  let entryStartTime = 0;

  function updateEntryAnimation() {
    const theme = getTheme();
    const ringDelay = theme?.entryAnimation?.ringDelayMs ?? 300;
    const fadeDuration = theme?.entryAnimation?.fadeDurationMs ?? 800;
    const idleOpacity = theme?.node?.idleOpacity ?? 0.35;

    const now = performance.now();

    let allDone = true;

    // Node opacity via material (instanced meshes share material opacity;
    // we animate the shared material and rely on the worst-case ring delay)
    const maxRing = simNodes.reduce((m, n) => Math.max(m, n.ring ?? 0), 0);
    const totalDuration = maxRing * ringDelay + fadeDuration;
    const elapsed = now - entryStartTime;
    const progress = Math.min(1, elapsed / totalDuration);
    const easedOpacity = idleOpacity * (1 - Math.pow(1 - progress, 3));

    if (sphereInstanced) sphereInstanced.material.opacity = easedOpacity;
    if (boxInstanced) boxInstanced.material.opacity = easedOpacity;

    if (progress < 1) allDone = false;

    return allDone;
  }

  // ── Camera fly-to on click ─────────────────────────────────────────

  function flyToNode(nodeId) {
    const idx = nodeIndexById[nodeId];
    if (idx === undefined || !ctx) return;

    const node = simNodes[idx];
    const theme = getTheme();
    const duration = theme?.camera?.transitionDurationMs ?? 800;
    const r = getNodeRadius(node) * 8;

    const targetPos = new THREE.Vector3(node.x, node.y, node.z);
    const cameraTarget = targetPos.clone().add(new THREE.Vector3(r, r * 0.6, r));

    const startPos = ctx.camera.position.clone();
    const startTarget = ctx.engine.controls.target.clone();
    const startTime = performance.now();

    focusedNodeId = nodeId;
    updateFocusState();

    function animate() {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      ctx.camera.position.lerpVectors(startPos, cameraTarget, ease);
      ctx.engine.controls.target.lerpVectors(startTarget, targetPos, ease);
      ctx.engine.controls.update();

      if (t < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  function updateFocusState() {
    const theme = getTheme();
    const focusOp = theme?.node?.focusOpacity ?? 0.9;
    const idleOp = theme?.node?.idleOpacity ?? 0.35;
    const recessOp = theme?.node?.recessionOpacity ?? 0.08;

    // For instanced meshes we modulate per-instance color brightness
    // to simulate focus/recession without per-instance opacity
    if (!focusedNodeId) {
      // Reset all to idle
      if (sphereInstanced) sphereInstanced.material.opacity = idleOp;
      if (boxInstanced) boxInstanced.material.opacity = idleOp;
      return;
    }

    // Highlight focused, dim others via instance color modulation
    // (full per-instance opacity requires custom shader — use color brightness instead)
    _resetInstanceColors();

    const focusIdx = nodeIndexById[focusedNodeId];
    if (focusIdx === undefined) return;

    // Find which pool the focused node is in and brighten it
    const spherePoolIdx = sphereIndices.indexOf(focusIdx);
    if (spherePoolIdx >= 0 && sphereInstanced?.instanceColor) {
      const ca = sphereInstanced.instanceColor.array;
      // Brighten focused node
      ca[spherePoolIdx * 3]     = Math.min(1, ca[spherePoolIdx * 3] * 2);
      ca[spherePoolIdx * 3 + 1] = Math.min(1, ca[spherePoolIdx * 3 + 1] * 2);
      ca[spherePoolIdx * 3 + 2] = Math.min(1, ca[spherePoolIdx * 3 + 2] * 2);
      sphereInstanced.instanceColor.needsUpdate = true;
    }

    const boxPoolIdx = boxIndices.indexOf(focusIdx);
    if (boxPoolIdx >= 0 && boxInstanced?.instanceColor) {
      const ca = boxInstanced.instanceColor.array;
      ca[boxPoolIdx * 3]     = Math.min(1, ca[boxPoolIdx * 3] * 2);
      ca[boxPoolIdx * 3 + 1] = Math.min(1, ca[boxPoolIdx * 3 + 1] * 2);
      ca[boxPoolIdx * 3 + 2] = Math.min(1, ca[boxPoolIdx * 3 + 2] * 2);
      boxInstanced.instanceColor.needsUpdate = true;
    }

    // Boost edge opacity for connected edges
    if (edgeSegments) {
      const connOp = theme?.connector?.hoverOpacity ?? 0.55;
      const colAttr = edgeSegments.geometry.attributes.color;
      const arr = colAttr.array;

      for (let i = 0; i < simLinks.length; i++) {
        const link = simLinks[i];
        const connected = simNodes[link.source]?.id === focusedNodeId ||
                          simNodes[link.target]?.id === focusedNodeId;
        if (connected) {
          // Brighten connected edges to white
          arr[i * 6] = 1; arr[i * 6 + 1] = 1; arr[i * 6 + 2] = 1;
          arr[i * 6 + 3] = 1; arr[i * 6 + 4] = 1; arr[i * 6 + 5] = 1;
        }
      }
      colAttr.needsUpdate = true;
      edgeSegments.material.opacity = connOp;
    }
  }

  function _resetInstanceColors() {
    // Restore original per-instance colors from node types
    if (sphereInstanced?.instanceColor) {
      const ca = sphereInstanced.instanceColor.array;
      for (let i = 0; i < sphereIndices.length; i++) {
        _col.setHex(getNodeColor(simNodes[sphereIndices[i]]));
        ca[i * 3] = _col.r;
        ca[i * 3 + 1] = _col.g;
        ca[i * 3 + 2] = _col.b;
      }
      sphereInstanced.instanceColor.needsUpdate = true;
    }
    if (boxInstanced?.instanceColor) {
      const ca = boxInstanced.instanceColor.array;
      for (let i = 0; i < boxIndices.length; i++) {
        _col.setHex(getNodeColor(simNodes[boxIndices[i]]));
        ca[i * 3] = _col.r;
        ca[i * 3 + 1] = _col.g;
        ca[i * 3 + 2] = _col.b;
      }
      boxInstanced.instanceColor.needsUpdate = true;
    }
    // Restore edge colors
    if (edgeSegments) {
      const theme = getTheme();
      const colAttr = edgeSegments.geometry.attributes.color;
      const arr = colAttr.array;
      for (let i = 0; i < simLinks.length; i++) {
        _col.setHex(getEdgeColor(simLinks[i]));
        arr[i * 6]     = _col.r; arr[i * 6 + 1] = _col.g; arr[i * 6 + 2] = _col.b;
        arr[i * 6 + 3] = _col.r; arr[i * 6 + 4] = _col.g; arr[i * 6 + 5] = _col.b;
      }
      colAttr.needsUpdate = true;
      edgeSegments.material.opacity = theme?.connector?.idleOpacity ?? 0.06;
    }
  }

  // ── Raycasting helper: map InstancedMesh hit to node ID ────────────

  function instanceIdToNodeId(mesh, instanceId) {
    if (mesh === sphereInstanced && instanceId < sphereIndices.length) {
      return simNodes[sphereIndices[instanceId]]?.id;
    }
    if (mesh === boxInstanced && instanceId < boxIndices.length) {
      return simNodes[boxIndices[instanceId]]?.id;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  //  View Plugin Interface
  // ══════════════════════════════════════════════════════════════════

  return {
    name: "force-graph",
    label: "Force Graph",

    // ── Init (called once when registered, or when context becomes available) ──
    init(engineCtx) {
      ctx = engineCtx;
      ctx.scene.add(group);

      // Listen for gaze/click events to trigger fly-to
      ctx.hooks.on("focus:set", ({ nodeId }) => {
        if (nodeId) flyToNode(nodeId);
      });
      ctx.hooks.on("focus:clear", () => {
        focusedNodeId = null;
        updateFocusState();
      });

      // Handle raycaster hits on instanced meshes
      ctx.hooks.on("gaze:intersect", ({ object, instanceId }) => {
        if (object === sphereInstanced || object === boxInstanced) {
          const id = instanceIdToNodeId(object, instanceId);
          if (id) ctx.hooks.emit("gaze:node", { nodeId: id });
        }
      });
    },

    // ── Generate visuals from graph data ──
    async generate(graphData) {
      this.clear();

      if (!graphData?.nodes?.length) return;

      // Run force simulation
      initSimulation(graphData.nodes, graphData.links || []);

      // Warmup: run simulation synchronously for initial layout
      for (let i = 0; i < forceConfig.warmupTicks; i++) {
        tickSimulation();
      }
      warmupDone = true;

      // Build GPU objects
      buildInstances();
      buildEdges();
      syncPositions(0);

      // Start entry animation
      entryStartTime = performance.now();

      ctx?.hooks?.emit("view:generated", {
        name: "force-graph",
        nodeCount: simNodes.length,
        edgeCount: simLinks.length,
      });

      ctx?.hooks?.emit("graph:tick", {
        nodes: simNodes,
        links: simLinks,
      });
    },

    // ── Per-frame update ──
    update(delta, elapsed) {
      // Continue simulation until settled
      tickSimulation();

      // Sync positions to GPU
      syncPositions(elapsed);

      // Entry fade-in
      updateEntryAnimation();

      // Emit tick for other modules that need position data (labels, info-card)
      if (alpha > 0.001) {
        ctx?.hooks?.emit("graph:tick", {
          nodes: simNodes,
          links: simLinks,
        });
      }
    },

    // ── Return meshes for raycasting (gaze system) ──
    getMeshes() {
      const meshes = [];
      if (sphereInstanced) meshes.push(sphereInstanced);
      if (boxInstanced) meshes.push(boxInstanced);
      return meshes;
    },

    // ── Clear visuals (keep module alive for re-generate) ──
    clear() {
      // Dispose instanced meshes
      if (sphereInstanced) {
        sphereInstanced.geometry.dispose();
        sphereInstanced.material.dispose();
        group.remove(sphereInstanced);
        sphereInstanced = null;
      }
      if (boxInstanced) {
        boxInstanced.geometry.dispose();
        boxInstanced.material.dispose();
        group.remove(boxInstanced);
        boxInstanced = null;
      }

      // Dispose edge segments
      if (edgeSegments) {
        edgeSegments.geometry.dispose();
        edgeSegments.material.dispose();
        group.remove(edgeSegments);
        edgeSegments = null;
      }

      simNodes = [];
      simLinks = [];
      nodeIndexById = {};
      sphereIndices = [];
      boxIndices = [];
      alpha = 0;
      focusedNodeId = null;
    },

    // ── Full teardown ──
    dispose() {
      this.clear();
      if (ctx?.scene) ctx.scene.remove(group);
      ctx = null;
    },
  };
}
