/**
 * Jarvis — main agent personality, conversation manager, sub-agent router.
 * All sub-agents speak through Jarvis's voice.
 */
import { HUD_TOOLS } from "./tools-schema.mjs";

const SYSTEM_PROMPT = `You are Jarvis, an intelligent spatial navigation assistant embedded in a 3D web visualization HUD.

Users see web page structure as a force-directed concept graph floating in 3D space. The graph contains nodes arranged in concentric rings:
- Ring 0 (center): page node — the URL being visualized
- Ring 1: meta, tag, and breadcrumb nodes — metadata about the page
- Ring 2: heading and media nodes — content structure and assets
- Ring 3: link-group nodes — external domains the page links to

You have tools to manipulate the 3D visualization. Use them proactively when the user's request implies a visual action. For example:
- "Show me the headings" → search_graph(type="heading") then highlight_nodes with the results
- "What is this page about?" → list_nodes to get overview, then summarize
- "Take me to the introduction" → navigate_to_node(query="Introduction")
- "Zoom out" → reset_view
- "Tell me more about that link" → explain_node on the focused node, then optionally extract_deeper

Be concise and spatial-aware. Reference nodes by their labels. Describe the graph structure when helpful (rings, connections, clusters). Keep responses under 3 sentences unless the user asks for detail.

You have a warm, intelligent personality — helpful but not servile. You anticipate needs. If the user seems lost, proactively suggest what they might explore next.

IMPORTANT: When you use tools, the results will be sent back to you. Use those results to provide an informed response. Do not just describe what you did — tell the user what you found.`;

const MAX_HISTORY = 20; // conversation turns to keep

export function createJarvis(claudeClient) {
  let history = [];
  let graphContext = null;

  function setGraphContext(snapshot) {
    graphContext = snapshot;
  }

  function buildContextMessage() {
    if (!graphContext) return "";
    const { nodeCount, focusedNode, nodeTypes, url } = graphContext;
    let ctx = `\n[Graph Context] URL: ${url || "none"}, ${nodeCount || 0} nodes`;
    if (nodeTypes) {
      const types = Object.entries(nodeTypes)
        .map(([t, c]) => `${c} ${t}`)
        .join(", ");
      ctx += ` (${types})`;
    }
    if (focusedNode) {
      ctx += `. Currently focused: "${focusedNode}"`;
    }
    return ctx;
  }

  /**
   * Handle a user message. Yields events:
   *   { type: 'text_delta', text }
   *   { type: 'tool_call', tool_use_id, name, input }
   *   { type: 'done', full_text }
   *   { type: 'needs_tool_result', tool_use_id, name, input }
   *   { type: 'error', message }
   */
  async function* handleMessage(text) {
    // Add graph context to system prompt
    const contextualSystem = SYSTEM_PROMPT + buildContextMessage();

    // Add user message to history
    history.push({ role: "user", content: text });

    // Trim history
    if (history.length > MAX_HISTORY * 2) {
      history = history.slice(-MAX_HISTORY * 2);
    }

    let fullText = "";
    let pendingToolCalls = [];

    // Stream from Claude
    for await (const event of claudeClient.stream(
      contextualSystem,
      history,
      HUD_TOOLS
    )) {
      if (event.type === "text_delta") {
        fullText += event.text;
        yield { type: "text_delta", text: event.text };
      } else if (event.type === "tool_use_done") {
        pendingToolCalls.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        yield {
          type: "needs_tool_result",
          tool_use_id: event.id,
          name: event.name,
          input: event.input,
        };
      } else if (event.type === "error") {
        yield event;
        return;
      }
    }

    // If there were tool calls, we need to add the assistant message with them
    // and wait for tool results before continuing
    if (pendingToolCalls.length > 0) {
      // Build assistant message with both text and tool_use blocks
      const assistantContent = [];
      if (fullText) {
        assistantContent.push({ type: "text", text: fullText });
      }
      for (const tc of pendingToolCalls) {
        assistantContent.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      history.push({ role: "assistant", content: assistantContent });
    } else {
      // Simple text response
      if (fullText) {
        history.push({ role: "assistant", content: fullText });
      }
      yield { type: "done", full_text: fullText };
    }
  }

  /**
   * Continue after tool results. Call this after executing tool calls.
   * toolResults: [{ tool_use_id, result }]
   */
  async function* continueWithToolResults(toolResults) {
    // Add tool results to history
    const toolContent = toolResults.map((tr) => ({
      type: "tool_result",
      tool_use_id: tr.tool_use_id,
      content: JSON.stringify(tr.result),
    }));
    history.push({ role: "user", content: toolContent });

    const contextualSystem = SYSTEM_PROMPT + buildContextMessage();
    let fullText = "";
    let morePendingTools = [];

    for await (const event of claudeClient.stream(
      contextualSystem,
      history,
      HUD_TOOLS
    )) {
      if (event.type === "text_delta") {
        fullText += event.text;
        yield { type: "text_delta", text: event.text };
      } else if (event.type === "tool_use_done") {
        morePendingTools.push({
          id: event.id,
          name: event.name,
          input: event.input,
        });
        yield {
          type: "needs_tool_result",
          tool_use_id: event.id,
          name: event.name,
          input: event.input,
        };
      } else if (event.type === "error") {
        yield event;
        return;
      }
    }

    if (morePendingTools.length > 0) {
      const assistantContent = [];
      if (fullText) {
        assistantContent.push({ type: "text", text: fullText });
      }
      for (const tc of morePendingTools) {
        assistantContent.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      history.push({ role: "assistant", content: assistantContent });
    } else {
      if (fullText) {
        history.push({ role: "assistant", content: fullText });
      }
      yield { type: "done", full_text: fullText };
    }
  }

  function clearHistory() {
    history = [];
  }

  return { handleMessage, continueWithToolResults, setGraphContext, clearHistory };
}
