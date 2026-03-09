/**
 * Client-side tool executor — maps Claude tool_call messages to HUD actions.
 */
export function createAgentTools(hud, hooks, graphModule, nodesModule) {
  const handlers = new Map();

  // Navigate to a node by label search
  handlers.set("navigate_to_node", async ({ query }) => {
    const q = query.toLowerCase();
    const meshes = nodesModule.getMeshes();
    const match = meshes.find((m) =>
      (m.userData.nodeData?.label || m.userData.nodeId || "")
        .toLowerCase()
        .includes(q)
    );
    if (match) {
      const nodeId = match.userData.nodeId;
      hooks.emit("focus:select", { nodeId });
      return {
        found: true,
        nodeId,
        label: match.userData.nodeData?.label || nodeId,
        type: match.userData.nodeData?.type,
      };
    }
    return { found: false, query };
  });

  // Search graph nodes
  handlers.set("search_graph", async ({ query, type }) => {
    const nodes = graphModule.getNodes();
    let results = nodes;
    if (type) {
      results = results.filter((n) => n.type === type);
    }
    if (query) {
      const q = query.toLowerCase();
      results = results.filter((n) =>
        (n.label || n.id || "").toLowerCase().includes(q)
      );
    }
    return {
      count: results.length,
      nodes: results.slice(0, 20).map((n) => ({
        id: n.id,
        label: n.label || n.id,
        type: n.type,
        ring: n.ring,
      })),
    };
  });

  // Highlight nodes
  handlers.set("highlight_nodes", async ({ node_ids }) => {
    hooks.emit("agent:highlight", { nodeIds: node_ids });
    // Auto-clear after 5 seconds
    setTimeout(() => hooks.emit("agent:highlight-clear"), 5000);
    return { highlighted: node_ids.length };
  });

  // Extract deeper — fetch a URL and merge into graph
  handlers.set("extract_deeper", async ({ url }) => {
    try {
      const res = await fetch("/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.error) return { success: false, error: data.error };
      if (data.graph) {
        hud.load(data.graph);
        return {
          success: true,
          nodeCount: data.graph.nodes?.length || 0,
          title: data.title,
        };
      }
      return { success: false, error: "No graph data" };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Zoom to ring
  handlers.set("zoom_to_ring", async ({ ring }) => {
    // Compute a position looking at the ring radius
    const theme = hud.getEngine
      ? null
      : null; // theme access through hooks
    const radius = (ring || 0) * 55; // radialRadiusPerRing from theme
    hooks.emit("camera:focus-ring", { ring, radius });
    return { zoomed: true, ring };
  });

  // Explain node
  handlers.set("explain_node", async ({ node_id }) => {
    const nodes = graphModule.getNodes();
    const node = nodes.find((n) => n.id === node_id);
    if (!node) return { found: false, node_id };

    hooks.emit("focus:select", { nodeId: node_id });

    return {
      found: true,
      id: node.id,
      label: node.label || node.id,
      type: node.type,
      ring: node.ring,
      data: node.data || {},
    };
  });

  // Reset view
  handlers.set("reset_view", async () => {
    hooks.emit("focus:clear");
    hooks.emit("agent:highlight-clear");
    return { reset: true };
  });

  // List nodes
  handlers.set("list_nodes", async ({ type }) => {
    const nodes = graphModule.getNodes();
    let filtered = type ? nodes.filter((n) => n.type === type) : nodes;

    // Group by type
    const grouped = {};
    for (const n of filtered) {
      const t = n.type || "unknown";
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push({ id: n.id, label: n.label || n.id });
    }

    return {
      total: filtered.length,
      byType: Object.fromEntries(
        Object.entries(grouped).map(([t, nodes]) => [
          t,
          { count: nodes.length, nodes: nodes.slice(0, 10) },
        ])
      ),
    };
  });

  async function execute(toolName, input) {
    const handler = handlers.get(toolName);
    if (!handler) return { error: `Unknown tool: ${toolName}` };
    try {
      return await handler(input);
    } catch (err) {
      return { error: err.message };
    }
  }

  return { execute };
}
