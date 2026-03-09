/**
 * Filter Engine — composable faceted filtering for graph data.
 *
 * Filters are composable: data → [filter1] → [filter2] → subset.
 * Works across all view modes — same filter, different spatial arrangement.
 *
 * Built-in facets: type, section, author, mediaKind, date, ring
 * Users can add custom facets and save filter presets.
 */

export function createFilterEngine(hooks) {
  const facets = new Map();
  const activeFilters = new Map(); // facetName → selected values
  const presets = new Map();       // presetName → { filters }
  let rawData = null;              // unfiltered source data

  /** Register a facet (built-in or user-created) */
  function addFacet(name, config = {}) {
    facets.set(name, {
      name,
      type: config.type || "discrete", // "discrete" | "range" | "boolean"
      extract: config.extract || defaultExtractor(name),
      label: config.label || name,
    });
  }

  /** Default extractor: look for property on node */
  function defaultExtractor(prop) {
    return (node) => node[prop] ?? node.data?.[prop] ?? null;
  }

  /** Set the source data (unfiltered) */
  function setData(graphData) {
    rawData = graphData;
    // Auto-discover facet values
    updateFacetValues();
    hooks.emit("filter:data-loaded", { nodeCount: graphData.nodes.length });
  }

  /** Get available values for each facet */
  function updateFacetValues() {
    if (!rawData) return;
    for (const [name, facet] of facets) {
      if (facet.type === "discrete") {
        const values = new Set();
        for (const node of rawData.nodes) {
          const v = facet.extract(node);
          if (v != null) {
            if (Array.isArray(v)) v.forEach((x) => values.add(x));
            else values.add(v);
          }
        }
        facet.values = Array.from(values).sort();
      } else if (facet.type === "range") {
        let min = Infinity, max = -Infinity;
        for (const node of rawData.nodes) {
          const v = facet.extract(node);
          if (v != null) { min = Math.min(min, v); max = Math.max(max, v); }
        }
        facet.min = min === Infinity ? 0 : min;
        facet.max = max === -Infinity ? 0 : max;
      }
    }
  }

  /** Set active filter for a facet */
  function setFilter(facetName, value) {
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      activeFilters.delete(facetName);
    } else {
      activeFilters.set(facetName, value);
    }
    hooks.emit("filter:changed", { facet: facetName, value, active: getActiveFilters() });
  }

  /** Clear all active filters */
  function clearFilters() {
    activeFilters.clear();
    hooks.emit("filter:cleared");
  }

  /** Apply all active filters and return filtered graph data */
  function apply(data) {
    const source = data || rawData;
    if (!source) return { nodes: [], links: [] };
    if (activeFilters.size === 0) return source;

    const filteredNodeIds = new Set();
    const filteredNodes = source.nodes.filter((node) => {
      for (const [facetName, filterValue] of activeFilters) {
        const facet = facets.get(facetName);
        if (!facet) continue;

        const nodeValue = facet.extract(node);

        if (facet.type === "discrete") {
          const allowed = Array.isArray(filterValue) ? filterValue : [filterValue];
          if (Array.isArray(nodeValue)) {
            if (!nodeValue.some((v) => allowed.includes(v))) return false;
          } else {
            if (!allowed.includes(nodeValue)) return false;
          }
        } else if (facet.type === "range") {
          const { from, to } = filterValue;
          if (from != null && nodeValue < from) return false;
          if (to != null && nodeValue > to) return false;
        } else if (facet.type === "boolean") {
          if (Boolean(nodeValue) !== Boolean(filterValue)) return false;
        }
      }
      filteredNodeIds.add(node.id);
      return true;
    });

    // Keep links where both endpoints survive
    const filteredLinks = source.links.filter((link) => {
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      return filteredNodeIds.has(srcId) && filteredNodeIds.has(tgtId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }

  /** Save current filters as a named preset */
  function savePreset(name) {
    presets.set(name, new Map(activeFilters));
    hooks.emit("filter:preset-saved", { name });
  }

  /** Load a saved preset */
  function loadPreset(name) {
    const preset = presets.get(name);
    if (!preset) return false;
    activeFilters.clear();
    for (const [k, v] of preset) activeFilters.set(k, v);
    hooks.emit("filter:changed", { preset: name, active: getActiveFilters() });
    return true;
  }

  /** Delete a preset */
  function deletePreset(name) {
    presets.delete(name);
  }

  /** Get all facets with their current values and active selections */
  function getFacets() {
    return Array.from(facets.values()).map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      values: f.values || [],
      min: f.min,
      max: f.max,
      active: activeFilters.get(f.name) || null,
    }));
  }

  /** Get active filter state */
  function getActiveFilters() {
    return Object.fromEntries(activeFilters);
  }

  /** Get preset names */
  function getPresets() {
    return Array.from(presets.keys());
  }

  // Register built-in facets
  addFacet("type", { label: "Node Type", extract: (n) => n.type });
  addFacet("ring", { label: "Ring", type: "range", extract: (n) => n.ring ?? 0 });
  addFacet("section", { label: "Section", extract: (n) => n.section || n.data?.section });
  addFacet("author", { label: "Author", extract: (n) => n.author || n.data?.author });
  addFacet("mediaKind", { label: "Media", extract: (n) => n.mediaKind || n.data?.mediaKind });

  return {
    addFacet, setData, setFilter, clearFilters, apply,
    savePreset, loadPreset, deletePreset,
    getFacets, getActiveFilters, getPresets,
  };
}
