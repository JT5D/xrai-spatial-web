/**
 * Filter Engine — composable faceted filtering for graph data.
 *
 * Pipeline: rawData -> [facet1] -> [facet2] -> ... -> filteredSubset
 *
 * Facet types:
 *   "discrete"  — exact match on enumerated values (type, section, author, ...)
 *   "range"     — numeric range with from/to bounds (ring, importance, ...)
 *   "date"      — date range with from/to ISO strings or timestamps
 *   "text"      — substring / regex search across one or more text fields
 *   "boolean"   — simple true/false toggle (hasMedia, isExternal, ...)
 *
 * Works across all view modes — same filter, different spatial arrangement.
 * Users can add custom facets and save/load filter presets.
 *
 * API:
 *   addFacet(name, config)        — register a facet
 *   removeFacet(name)             — unregister a facet
 *   setData(graphData)            — set unfiltered source data
 *   setFilter(facetName, value)   — set active filter for a facet
 *   toggleFilter(facetName, val)  — toggle a discrete value in/out
 *   clearFilter(facetName)        — clear one facet
 *   clearFilters()                — clear all active filters
 *   apply(data?)                  — apply filters, return { nodes, links }
 *   getMatchCount()               — nodes that pass all filters (without materializing)
 *   savePreset / loadPreset / deletePreset / getPresets
 *   getFacets / getActiveFilters
 */

export function createFilterEngine(hooks) {
  const facets = new Map();
  const activeFilters = new Map();   // facetName -> filter value
  const presets = new Map();         // presetName -> Map(facetName -> value)
  let rawData = null;                // unfiltered source data

  // ── Facet registration ────────────────────────────────────────────

  /**
   * Register a facet (built-in or user-created).
   * @param {string} name      Unique facet ID
   * @param {object} config    { type?, label?, extract?, fields? }
   *   type:    "discrete" | "range" | "date" | "text" | "boolean"
   *   extract: (node) => value   — custom extractor
   *   fields:  string[]          — for "text" type: which node properties to search
   */
  function addFacet(name, config = {}) {
    const type = config.type || "discrete";
    const facet = {
      name,
      type,
      label: config.label || name,
      extract: config.extract || defaultExtractor(name),
    };

    // Text facets: list of fields to search across
    if (type === "text") {
      facet.fields = config.fields || ["label", "text", "id"];
    }

    // Date facets: store discovered min/max as ISO strings
    if (type === "date") {
      facet.min = null;
      facet.max = null;
    }

    facets.set(name, facet);

    // Re-discover values if data already loaded
    if (rawData) updateFacetValues();
  }

  /** Remove a registered facet */
  function removeFacet(name) {
    facets.delete(name);
    activeFilters.delete(name);
  }

  /** Default extractor: look for property on node, then node.data */
  function defaultExtractor(prop) {
    return (node) => node[prop] ?? node.data?.[prop] ?? null;
  }

  // ── Data ──────────────────────────────────────────────────────────

  /** Set the source data (unfiltered) */
  function setData(graphData) {
    rawData = graphData;
    updateFacetValues();
    hooks.emit("filter:data-loaded", { nodeCount: graphData.nodes.length });
  }

  /** Auto-discover available values / ranges for all registered facets */
  function updateFacetValues() {
    if (!rawData) return;

    for (const [, facet] of facets) {
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
        facet.counts = {};
        for (const val of facet.values) facet.counts[val] = 0;
        for (const node of rawData.nodes) {
          const v = facet.extract(node);
          if (v != null) {
            const vals = Array.isArray(v) ? v : [v];
            for (const val of vals) {
              if (facet.counts[val] !== undefined) facet.counts[val]++;
            }
          }
        }
      } else if (facet.type === "range") {
        let min = Infinity, max = -Infinity;
        for (const node of rawData.nodes) {
          const v = facet.extract(node);
          if (v != null && typeof v === "number") {
            min = Math.min(min, v);
            max = Math.max(max, v);
          }
        }
        facet.min = min === Infinity ? 0 : min;
        facet.max = max === -Infinity ? 0 : max;
      } else if (facet.type === "date") {
        let min = null, max = null;
        for (const node of rawData.nodes) {
          const v = facet.extract(node);
          if (v == null) continue;
          const ts = toTimestamp(v);
          if (ts === null) continue;
          if (min === null || ts < min) min = ts;
          if (max === null || ts > max) max = ts;
        }
        facet.min = min !== null ? new Date(min).toISOString() : null;
        facet.max = max !== null ? new Date(max).toISOString() : null;
      }
      // "text" and "boolean" facets do not need pre-computed values
    }
  }

  // ── Filter setters ────────────────────────────────────────────────

  /** Set active filter for a facet. Pass null/undefined to clear. */
  function setFilter(facetName, value) {
    if (value === null || value === undefined ||
        (Array.isArray(value) && value.length === 0) ||
        (typeof value === "string" && value.trim() === "")) {
      activeFilters.delete(facetName);
    } else {
      activeFilters.set(facetName, value);
    }
    hooks.emit("filter:changed", { facet: facetName, value, active: getActiveFilters() });
  }

  /**
   * Toggle a discrete value in/out of the active filter for a facet.
   * Useful for checkbox-style UIs.
   */
  function toggleFilter(facetName, val) {
    const current = activeFilters.get(facetName);
    let arr = Array.isArray(current) ? [...current] : current != null ? [current] : [];

    const idx = arr.indexOf(val);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(val);

    setFilter(facetName, arr.length > 0 ? arr : null);
  }

  /** Clear a single facet's filter */
  function clearFilter(facetName) {
    activeFilters.delete(facetName);
    hooks.emit("filter:changed", { facet: facetName, value: null, active: getActiveFilters() });
  }

  /** Clear all active filters */
  function clearFilters() {
    activeFilters.clear();
    hooks.emit("filter:cleared");
  }

  // ── Apply pipeline ────────────────────────────────────────────────

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

        if (!matchesFacet(facet, node, filterValue)) return false;
      }
      filteredNodeIds.add(node.id);
      return true;
    });

    // Keep links where both endpoints survive the filter
    const filteredLinks = source.links.filter((link) => {
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      return filteredNodeIds.has(srcId) && filteredNodeIds.has(tgtId);
    });

    return { nodes: filteredNodes, links: filteredLinks };
  }

  /** Quick count of matching nodes without building the full result */
  function getMatchCount(data) {
    const source = data || rawData;
    if (!source) return 0;
    if (activeFilters.size === 0) return source.nodes.length;

    let count = 0;
    for (const node of source.nodes) {
      let pass = true;
      for (const [facetName, filterValue] of activeFilters) {
        const facet = facets.get(facetName);
        if (!facet) continue;
        if (!matchesFacet(facet, node, filterValue)) { pass = false; break; }
      }
      if (pass) count++;
    }
    return count;
  }

  // ── Facet matching logic ──────────────────────────────────────────

  /** Test whether a single node passes a single facet's filter */
  function matchesFacet(facet, node, filterValue) {
    const nodeValue = facet.extract(node);

    switch (facet.type) {
      case "discrete": {
        const allowed = Array.isArray(filterValue) ? filterValue : [filterValue];
        if (Array.isArray(nodeValue)) {
          return nodeValue.some((v) => allowed.includes(v));
        }
        return allowed.includes(nodeValue);
      }

      case "range": {
        const { from, to } = filterValue;
        if (nodeValue == null || typeof nodeValue !== "number") return false;
        if (from != null && nodeValue < from) return false;
        if (to != null && nodeValue > to) return false;
        return true;
      }

      case "date": {
        const nodeTs = toTimestamp(nodeValue);
        if (nodeTs === null) return false;
        const fromTs = filterValue.from ? toTimestamp(filterValue.from) : null;
        const toTs = filterValue.to ? toTimestamp(filterValue.to) : null;
        if (fromTs !== null && nodeTs < fromTs) return false;
        if (toTs !== null && nodeTs > toTs) return false;
        return true;
      }

      case "text": {
        // filterValue is a string (plain) or { pattern, flags } for regex
        const query = typeof filterValue === "string" ? filterValue : filterValue?.pattern;
        if (!query) return true;

        const flags = typeof filterValue === "object" ? filterValue.flags : "i";
        let regex;
        try {
          regex = new RegExp(query, flags);
        } catch {
          // If invalid regex, fall back to case-insensitive substring
          const lower = query.toLowerCase();
          return getTextFields(facet, node).some((t) => t.toLowerCase().includes(lower));
        }

        return getTextFields(facet, node).some((t) => regex.test(t));
      }

      case "boolean": {
        return Boolean(nodeValue) === Boolean(filterValue);
      }

      default:
        return true;
    }
  }

  /** Collect all searchable text strings from a node for a text facet */
  function getTextFields(facet, node) {
    const fields = facet.fields || ["label", "text", "id"];
    const values = [];
    for (const field of fields) {
      const v = node[field] ?? node.data?.[field];
      if (typeof v === "string" && v) values.push(v);
    }
    return values;
  }

  /** Convert various date representations to ms-since-epoch (or null) */
  function toTimestamp(val) {
    if (val == null) return null;
    if (typeof val === "number") return val;
    if (val instanceof Date) return val.getTime();
    if (typeof val === "string") {
      const ms = Date.parse(val);
      return Number.isNaN(ms) ? null : ms;
    }
    return null;
  }

  // ── Presets ───────────────────────────────────────────────────────

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

  // ── Queries ───────────────────────────────────────────────────────

  /** Get all facets with their current values, ranges, and active selections */
  function getFacets() {
    return Array.from(facets.values()).map((f) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      values: f.values || [],
      counts: f.counts || {},
      min: f.min,
      max: f.max,
      fields: f.fields,
      active: activeFilters.get(f.name) || null,
    }));
  }

  /** Get active filter state as a plain object */
  function getActiveFilters() {
    return Object.fromEntries(activeFilters);
  }

  /** Get preset names */
  function getPresets() {
    return Array.from(presets.keys());
  }

  // ── Built-in facets ───────────────────────────────────────────────

  addFacet("type", {
    label: "Node Type",
    extract: (n) => n.type,
  });

  addFacet("ring", {
    label: "Ring",
    type: "range",
    extract: (n) => n.ring ?? 0,
  });

  addFacet("section", {
    label: "Section",
    extract: (n) => n.section || n.data?.section,
  });

  addFacet("author", {
    label: "Author",
    extract: (n) => n.author || n.data?.author,
  });

  addFacet("mediaKind", {
    label: "Media",
    extract: (n) => n.mediaKind || n.data?.mediaKind,
  });

  addFacet("date", {
    label: "Date",
    type: "date",
    extract: (n) => n.date || n.data?.date || n.timestamp || n.data?.timestamp,
  });

  addFacet("search", {
    label: "Text Search",
    type: "text",
    fields: ["label", "text", "id", "url", "title"],
    extract: (n) => n.label || n.text || n.id,
  });

  // ── Hook-driven filtering ─────────────────────────────────────────
  // Allow other modules (agent, UI) to set filters via hooks
  hooks.on("filter:set-request", ({ facet, value }) => setFilter(facet, value));
  hooks.on("filter:toggle-request", ({ facet, value }) => toggleFilter(facet, value));
  hooks.on("filter:clear-request", ({ facet }) => facet ? clearFilter(facet) : clearFilters());

  return {
    addFacet,
    removeFacet,
    setData,
    setFilter,
    toggleFilter,
    clearFilter,
    clearFilters,
    apply,
    getMatchCount,
    savePreset,
    loadPreset,
    deletePreset,
    getFacets,
    getActiveFilters,
    getPresets,
  };
}
