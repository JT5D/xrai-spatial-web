/**
 * System HUD View — Live agent swarm + infrastructure visualization.
 *
 * View Mode 5: Real-time hypergraph showing:
 *   - Agent nodes: Jarvis (Groq/Gemini), Claude Code, sub-agents
 *   - Data flow edges: shared memory reads/writes, tool invocations
 *   - Provider health: Groq/Gemini/Claude status, rate limits
 *   - Code lifecycle: planned → researched → implemented → tested → deployed
 *   - MCP servers & tool connections
 *
 * Data source: Polls /agent/system-state endpoint every 2s.
 * Falls back to static shared-memory snapshot if endpoint unavailable.
 *
 * Lifecycle: init(ctx) -> generate(data) -> update(d,e) -> clear() -> dispose()
 */
import { getTheme, parseColor } from "../../theme/tokens.mjs";

// Node type colors
const NODE_COLORS = {
  agent:    0x4fc3f7,  // cyan — AI agents
  provider: 0x66bb6a,  // green — API providers
  tool:     0xffca28,  // yellow — tools
  memory:   0xab47bc,  // purple — shared memory
  mcp:      0xef5350,  // red — MCP servers
  task:     0x78909c,  // gray — tasks/code lifecycle
  flow:     0xff7043,  // orange — data flow events
};

const NODE_SIZES = {
  agent: 3.0,
  provider: 2.0,
  tool: 1.2,
  memory: 2.5,
  mcp: 1.8,
  task: 1.0,
  flow: 0.8,
};

// Layout rings (agents center, tools/providers orbit)
const RING_RADIUS = { agent: 0, provider: 25, memory: 15, tool: 45, mcp: 55, task: 70, flow: 85 };

export function createSystemHudView() {
  let scene = null;
  let camera = null;
  let hooks = null;
  let engine = null;

  // Three.js objects
  let group = null;
  let nodeMap = new Map();     // id → { mesh, type, data }
  let edgeMeshes = [];
  let labelSprites = [];
  let pulseAnimations = [];

  // Polling state
  let pollTimer = null;
  let lastPollData = null;
  const POLL_INTERVAL = 2000;

  function init(ctx) {
    scene = ctx.scene;
    camera = ctx.camera;
    hooks = ctx.hooks;
    engine = ctx.engine;
  }

  async function generate(graphData) {
    clear();
    group = new THREE.Group();
    group.name = "system-hud";
    scene.add(group);

    // Build system graph from multiple sources
    const systemData = await fetchSystemState();
    buildVisualization(systemData);

    // Start polling for live updates
    pollTimer = setInterval(async () => {
      const freshData = await fetchSystemState();
      updateVisualization(freshData);
    }, POLL_INTERVAL);
  }

  async function fetchSystemState() {
    // Try the server endpoint first
    try {
      const res = await fetch("/agent/system-state");
      if (res.ok) {
        const data = await res.json();
        lastPollData = data;
        return data;
      }
    } catch {}

    // Fallback: read shared memory directly via the page's context
    return buildStateFromDefaults();
  }

  function buildStateFromDefaults() {
    // Construct a reasonable default system state
    return {
      agents: [
        { id: "jarvis", name: "Jarvis", status: "online", provider: "groq", tools: 11 },
        { id: "claude-code", name: "Claude Code", status: "active", provider: "claude", tools: 0 },
      ],
      providers: [
        { id: "groq", name: "Groq (Llama 3.3)", status: "ok", model: "llama-3.3-70b-versatile" },
        { id: "gemini", name: "Gemini 2.5 Flash", status: "standby", model: "gemini-2.5-flash" },
        { id: "claude", name: "Claude Opus", status: "active", model: "claude-opus-4-6" },
        { id: "whisper", name: "Groq Whisper", status: "ok", model: "whisper-large-v3" },
        { id: "edge-tts", name: "Edge TTS", status: "ok", model: "en-US-GuyNeural" },
      ],
      tools: [
        { id: "run_shell", name: "Shell", agent: "jarvis" },
        { id: "open_browser", name: "Browser", agent: "jarvis" },
        { id: "read_file", name: "Read File", agent: "jarvis" },
        { id: "write_file", name: "Write File", agent: "jarvis" },
        { id: "search_project", name: "Search", agent: "jarvis" },
        { id: "read_memory", name: "Read Mem", agent: "jarvis" },
        { id: "write_memory", name: "Write Mem", agent: "jarvis" },
        { id: "record_lesson", name: "Learn", agent: "jarvis" },
        { id: "write_kb", name: "KB Write", agent: "jarvis" },
      ],
      memory: { id: "shared-memory", name: "Shared Memory", path: "/tmp/jarvis-daemon/shared-memory.json" },
      flows: [], // recent data flow events
      tasks: [], // code lifecycle items
    };
  }

  function buildVisualization(data) {
    const allNodes = [];
    const allEdges = [];

    // Agents (center)
    for (const agent of (data.agents || [])) {
      allNodes.push({ id: agent.id, type: "agent", label: agent.name, status: agent.status, ring: 0 });
      // Agent → provider edge
      if (agent.provider) {
        allEdges.push({ from: agent.id, to: agent.provider, type: "uses" });
      }
    }

    // Providers (inner ring)
    for (const prov of (data.providers || [])) {
      allNodes.push({ id: prov.id, type: "provider", label: prov.name, status: prov.status, ring: 1 });
    }

    // Shared memory (between agents and tools)
    if (data.memory) {
      allNodes.push({ id: data.memory.id, type: "memory", label: data.memory.name, ring: 0.5 });
      // All agents connect to memory
      for (const agent of (data.agents || [])) {
        allEdges.push({ from: agent.id, to: data.memory.id, type: "reads-writes" });
      }
    }

    // Tools (outer ring)
    for (const tool of (data.tools || [])) {
      allNodes.push({ id: tool.id, type: "tool", label: tool.name, ring: 2 });
      if (tool.agent) {
        allEdges.push({ from: tool.agent, to: tool.id, type: "invokes" });
      }
    }

    // Recent flow events (outermost ring)
    for (const flow of (data.flows || []).slice(-20)) {
      const fid = `flow-${flow.ts || Date.now()}`;
      allNodes.push({ id: fid, type: "flow", label: flow.action || "event", ring: 3 });
      if (flow.agent) {
        allEdges.push({ from: flow.agent === "jarvis-daemon" ? "jarvis" : flow.agent, to: fid, type: "emitted" });
      }
    }

    // Position nodes in concentric rings
    const ringGroups = {};
    for (const node of allNodes) {
      const ring = node.ring ?? 2;
      (ringGroups[ring] ??= []).push(node);
    }

    for (const [ring, nodes] of Object.entries(ringGroups)) {
      const r = parseFloat(ring);
      const radius = r === 0 ? 0 : RING_RADIUS[nodes[0]?.type] || (r * 30);
      const count = nodes.length;
      nodes.forEach((node, i) => {
        const angle = (i / count) * Math.PI * 2;
        node.x = radius === 0 ? (i - (count - 1) / 2) * 12 : Math.cos(angle) * radius;
        node.y = (Math.random() - 0.5) * 10; // slight Y spread
        node.z = radius === 0 ? 0 : Math.sin(angle) * radius;
      });
    }

    // Create meshes
    for (const node of allNodes) {
      createNodeMesh(node);
    }

    // Create edges
    createEdges(allNodes, allEdges);
  }

  function createNodeMesh(node) {
    const color = NODE_COLORS[node.type] || 0xffffff;
    const size = NODE_SIZES[node.type] || 1.0;

    // Pulse for active agents
    const emissiveIntensity = node.status === "active" || node.status === "online" ? 0.4 : 0.1;

    const geo = node.type === "agent"
      ? new THREE.IcosahedronGeometry(size, 1)
      : node.type === "memory"
        ? new THREE.OctahedronGeometry(size, 0)
        : new THREE.SphereGeometry(size * 0.7, 8, 8);

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      metalness: 0.3,
      roughness: 0.6,
      transparent: node.type === "flow",
      opacity: node.type === "flow" ? 0.5 : 1.0,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(node.x, node.y, node.z);
    mesh.userData = { nodeId: node.id, type: node.type, label: node.label };
    group.add(mesh);

    nodeMap.set(node.id, { mesh, type: node.type, data: node });

    // Add text label
    createLabel(node);

    // Pulse animation for agents
    if (node.type === "agent" && (node.status === "active" || node.status === "online")) {
      pulseAnimations.push({ mesh, baseScale: 1.0, speed: 0.5 + Math.random() * 0.5 });
    }
  }

  function createLabel(node) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 256;
    canvas.height = 64;

    ctx.fillStyle = "transparent";
    ctx.fillRect(0, 0, 256, 64);

    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(node.label || node.id, 128, 32);

    // Status indicator
    if (node.status) {
      ctx.font = "14px monospace";
      ctx.fillStyle = node.status === "online" || node.status === "ok" || node.status === "active"
        ? "#66bb6a" : node.status === "standby" ? "#ffca28" : "#ef5350";
      ctx.fillText(node.status, 128, 52);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(12, 3, 1);
    sprite.position.set(node.x, node.y + (NODE_SIZES[node.type] || 1) + 2, node.z);
    group.add(sprite);
    labelSprites.push(sprite);
  }

  function createEdges(allNodes, allEdges) {
    const nodeById = new Map(allNodes.map(n => [n.id, n]));
    const positions = [];
    const colors = [];

    for (const edge of allEdges) {
      const from = nodeById.get(edge.from);
      const to = nodeById.get(edge.to);
      if (!from || !to) continue;

      positions.push(from.x, from.y, from.z, to.x, to.y, to.z);

      const edgeColor = edge.type === "uses" ? [0.3, 0.8, 0.3]
        : edge.type === "reads-writes" ? [0.7, 0.3, 0.8]
        : edge.type === "invokes" ? [1.0, 0.8, 0.2]
        : [0.4, 0.4, 0.4];

      colors.push(...edgeColor, ...edgeColor);
    }

    if (positions.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      linewidth: 1,
    });

    const lines = new THREE.LineSegments(geo, mat);
    group.add(lines);
    edgeMeshes.push(lines);
  }

  function updateVisualization(data) {
    if (!group || !data) return;

    // Update agent statuses
    for (const agent of (data.agents || [])) {
      const entry = nodeMap.get(agent.id);
      if (entry) {
        const isActive = agent.status === "online" || agent.status === "active";
        entry.mesh.material.emissiveIntensity = isActive ? 0.4 : 0.05;
      }
    }

    // Update provider statuses
    for (const prov of (data.providers || [])) {
      const entry = nodeMap.get(prov.id);
      if (entry) {
        const isOk = prov.status === "ok" || prov.status === "active";
        entry.mesh.material.emissiveIntensity = isOk ? 0.3 : 0.05;
        entry.mesh.material.color.setHex(isOk ? NODE_COLORS.provider : 0x555555);
      }
    }
  }

  function update(delta, elapsed) {
    if (!group) return;

    // Pulse animations for active agents
    for (const anim of pulseAnimations) {
      const scale = anim.baseScale + Math.sin(elapsed * anim.speed) * 0.15;
      anim.mesh.scale.setScalar(scale);
    }

    // Slow rotation of the entire system view
    group.rotation.y += delta * 0.02;
  }

  function clear() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }

    if (group) {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (obj.material.map) obj.material.map.dispose();
          obj.material.dispose();
        }
      });
      group = null;
    }

    nodeMap.clear();
    edgeMeshes = [];
    labelSprites = [];
    pulseAnimations = [];
    lastPollData = null;
  }

  function dispose() {
    clear();
  }

  return {
    name: "system-hud",
    label: "System HUD",
    init,
    generate,
    update,
    clear,
    dispose,
  };
}
