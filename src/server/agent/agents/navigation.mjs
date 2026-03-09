/**
 * Navigation sub-agent — spatial command interpretation.
 * Translates natural language into specific graph traversal actions.
 */
export function createNavigationAgent() {
  /**
   * Parse a spatial command into structured intent.
   * Returns: { action, params } or null if not a navigation command.
   */
  function parseIntent(text) {
    const lower = text.toLowerCase().trim();

    // Zoom / view commands
    if (/\b(zoom\s*out|bird.?s?\s*eye|overview|step\s*back)\b/.test(lower)) {
      return { action: "reset_view", params: {} };
    }
    if (/\b(zoom\s*in|closer|focus)\b/.test(lower)) {
      return { action: "zoom_in", params: {} };
    }

    // Ring navigation
    const ringMatch = lower.match(/\bring\s*(\d)\b/);
    if (ringMatch) {
      return {
        action: "zoom_to_ring",
        params: { ring: parseInt(ringMatch[1]) },
      };
    }

    // Type-based navigation
    if (/\b(headings?|outline|structure|toc)\b/.test(lower)) {
      return { action: "filter_type", params: { type: "heading" } };
    }
    if (/\b(links?|external|domains?)\b/.test(lower)) {
      return { action: "filter_type", params: { type: "link-group" } };
    }
    if (/\b(media|images?|videos?)\b/.test(lower)) {
      return { action: "filter_type", params: { type: "media" } };
    }
    if (/\b(tags?|keywords?|topics?)\b/.test(lower)) {
      return { action: "filter_type", params: { type: "tag" } };
    }
    if (/\b(meta|metadata|info)\b/.test(lower)) {
      return { action: "filter_type", params: { type: "meta" } };
    }

    return null;
  }

  return { parseIntent };
}
