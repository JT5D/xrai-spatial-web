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

    // If there were tool calls, record them as text in history for Groq/Llama compatibility
    if (pendingToolCalls.length > 0) {
      const toolSummary = pendingToolCalls.map(tc =>
        `[Calling tool: ${tc.name}(${JSON.stringify(tc.input)})]`
      ).join("\n");
      history.push({ role: "assistant", content: (fullText ? fullText + "\n" : "") + toolSummary });
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
    // Flatten tool results as plain text to avoid tool-calling loops with Groq/Llama.
    // The model sees results as text and must generate a text response (no tools passed).
    const resultText = toolResults.map((tr) => {
      const data = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result);
      return `[Tool Result] ${data}`;
    }).join("\n");
    history.push({ role: "user", content: resultText });

    const contextualSystem = SYSTEM_PROMPT + buildContextMessage()
      + "\nRespond to the user based on the tool results above. Do not call tools again.";
    let fullText = "";

    for await (const event of claudeClient.stream(contextualSystem, history, [])) {
      if (event.type === "text_delta") {
        fullText += event.text;
        yield { type: "text_delta", text: event.text };
      } else if (event.type === "error") {
        yield event;
        return;
      }
    }

    if (fullText) {
      history.push({ role: "assistant", content: fullText });
    }
    yield { type: "done", full_text: fullText };
  }

  function clearHistory() {
    history = [];
  }

  return { handleMessage, continueWithToolResults, setGraphContext, clearHistory };
}
