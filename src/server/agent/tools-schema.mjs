/**
 * Claude tool definitions — maps to HUD actions the client executes.
 */

export const HUD_TOOLS = [
  {
    name: "navigate_to_node",
    description:
      "Focus camera on and select a specific node by searching its label. Returns the matched node.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Partial label text to search for (case-insensitive)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_graph",
    description:
      "Search all nodes by type, label text, or both. Returns list of matching nodes with IDs and labels.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text to match against node labels",
        },
        type: {
          type: "string",
          description:
            "Filter by node type: page, meta, tag, breadcrumb, heading, media, link-group",
        },
      },
    },
  },
  {
    name: "highlight_nodes",
    description:
      "Visually highlight one or more nodes with a pulsing glow to draw attention.",
    input_schema: {
      type: "object",
      properties: {
        node_ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of node IDs to highlight",
        },
      },
      required: ["node_ids"],
    },
  },
  {
    name: "extract_deeper",
    description:
      "Follow a URL and extract its content, adding new nodes to the current graph. Use when user asks 'tell me more' about a link.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL to extract and add to the graph",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "zoom_to_ring",
    description:
      "Move the camera to focus on a specific ring level (distance from center).",
    input_schema: {
      type: "object",
      properties: {
        ring: {
          type: "number",
          description:
            "Ring number: 0 (page center), 1 (meta/tags), 2 (headings/media), 3 (link groups)",
        },
      },
      required: ["ring"],
    },
  },
  {
    name: "explain_node",
    description:
      "Get detailed information about a specific node to explain to the user.",
    input_schema: {
      type: "object",
      properties: {
        node_id: {
          type: "string",
          description: "The node ID to get details for",
        },
      },
      required: ["node_id"],
    },
  },
  {
    name: "reset_view",
    description:
      "Reset the camera to its home position and clear all focus/highlights.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_nodes",
    description:
      "List all nodes in the current graph, grouped by type. Use for overview.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Optional: filter to only this node type",
        },
      },
    },
  },
  {
    name: "switch_view",
    description:
      "Switch to a different visualization mode. Available modes: force-graph (default spatial graph), media-city (exploded media view with photos/videos as landmarks), newspaper (hierarchical section-based layout).",
    input_schema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          description: "View mode name: force-graph, media-city, or newspaper",
        },
      },
      required: ["view"],
    },
  },
  {
    name: "list_views",
    description:
      "List all available visualization modes and which one is currently active.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "filter_nodes",
    description:
      "Apply a faceted filter to narrow down visible nodes. Filters compose — multiple filters show only nodes matching ALL criteria.",
    input_schema: {
      type: "object",
      properties: {
        facet: {
          type: "string",
          description: "Facet to filter on: type, ring, mediaKind, author, section",
        },
        values: {
          type: "array",
          items: { type: "string" },
          description: "Values to include (e.g. [\"heading\", \"media\"] for type facet)",
        },
      },
      required: ["facet", "values"],
    },
  },
  {
    name: "clear_filters",
    description:
      "Remove all active filters, showing all nodes again.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_facets",
    description:
      "Get available filter facets and their possible values for the current graph. Use to discover what filters are available.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];
