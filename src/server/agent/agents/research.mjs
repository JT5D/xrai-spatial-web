/**
 * Research sub-agent — deeper extraction and link following.
 * Called by Jarvis when user asks "tell me more" or "dig deeper".
 * Returns structured data that Jarvis incorporates into response.
 */
import { extract } from "../../extractor.mjs";

export function createResearchAgent() {
  async function investigateUrl(url) {
    try {
      const data = await extract(url);
      return {
        success: true,
        title: data.title,
        description: data.description,
        nodeCount: data.graph?.nodes?.length || 0,
        headings: (data.headings || [])
          .slice(0, 10)
          .map((h) => h.text || h.label),
        tags: data.tags || [],
        graph: data.graph,
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async function summarizeNode(nodeData) {
    const parts = [];
    if (nodeData.label) parts.push(`Label: ${nodeData.label}`);
    if (nodeData.data?.description)
      parts.push(`Description: ${nodeData.data.description}`);
    if (nodeData.data?.url) parts.push(`URL: ${nodeData.data.url}`);
    if (nodeData.data?.key && nodeData.data?.value)
      parts.push(`${nodeData.data.key}: ${nodeData.data.value}`);
    if (nodeData.data?.domain)
      parts.push(
        `Domain: ${nodeData.data.domain} (${nodeData.data.count} links)`
      );
    if (nodeData.data?.level) parts.push(`Heading level: H${nodeData.data.level}`);
    return parts.join("\n") || "No additional details available.";
  }

  return { investigateUrl, summarizeNode };
}
