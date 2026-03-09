/**
 * XRAI Format — the data standard for the spatial web.
 *
 * An XRAI document captures everything needed to reconstruct a spatial view:
 * source data, graph, view state, user annotations, provenance, and theme.
 */

export const XRAI_VERSION = "1.0";

/**
 * Create a new XRAI document from extracted graph data.
 */
export function createDocument(source, graphData, opts = {}) {
  return {
    version: XRAI_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    source: {
      url: source.url || "",
      title: source.title || "",
      extractedAt: source.extractedAt || new Date().toISOString(),
      extractorVersion: source.extractorVersion || "1.0",
    },

    graph: {
      nodes: (graphData.nodes || []).map(normalizeNode),
      links: (graphData.links || []).map(normalizeLink),
    },

    viewState: {
      mode: opts.mode || "force-graph",
      camera: opts.camera || { x: 0, y: 0, z: 80 },
      filters: opts.filters || {},
      highlights: opts.highlights || [],
    },

    userLayer: {
      annotations: [],
      ratings: [],
      customLayouts: [],
    },

    provenance: {
      contributors: [],
      aiModels: [],
      metrics: {
        views: 0,
        shares: 0,
        forks: 0,
      },
    },

    theme: opts.theme || null,
  };
}

/** Normalize a node to the XRAI standard shape */
function normalizeNode(node) {
  return {
    id: node.id,
    label: node.label || node.name || node.id,
    type: node.type || "default",
    ring: node.ring ?? 0,
    val: node.val ?? 1,
    // Optional enriched fields
    ...(node.section && { section: node.section }),
    ...(node.author && { author: node.author }),
    ...(node.mediaKind && { mediaKind: node.mediaKind }),
    ...(node.url && { url: node.url }),
    ...(node.imageUrl && { imageUrl: node.imageUrl }),
    ...(node.videoUrl && { videoUrl: node.videoUrl }),
    ...(node.text && { text: node.text }),
    ...(node.code && { code: node.code }),
    // Preserve original data for views that need it
    ...(node.data && { data: node.data }),
  };
}

/** Normalize a link */
function normalizeLink(link) {
  return {
    source: typeof link.source === "object" ? link.source.id : link.source,
    target: typeof link.target === "object" ? link.target.id : link.target,
    type: link.type || "default",
    value: link.value ?? 1,
  };
}

/** Validate an XRAI document */
export function validate(doc) {
  const errors = [];

  if (!doc.version) errors.push("Missing version");
  if (!doc.source?.url && !doc.source?.title) errors.push("Missing source url or title");
  if (!doc.graph) errors.push("Missing graph");
  if (!Array.isArray(doc.graph?.nodes)) errors.push("graph.nodes must be an array");
  if (!Array.isArray(doc.graph?.links)) errors.push("graph.links must be an array");

  // Validate node IDs are unique
  const ids = new Set();
  for (const node of doc.graph?.nodes || []) {
    if (!node.id) errors.push(`Node missing id: ${JSON.stringify(node)}`);
    if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
    ids.add(node.id);
  }

  // Validate link endpoints exist
  for (const link of doc.graph?.links || []) {
    const srcId = typeof link.source === "object" ? link.source.id : link.source;
    const tgtId = typeof link.target === "object" ? link.target.id : link.target;
    if (!ids.has(srcId)) errors.push(`Link source not found: ${srcId}`);
    if (!ids.has(tgtId)) errors.push(`Link target not found: ${tgtId}`);
  }

  return { valid: errors.length === 0, errors };
}
