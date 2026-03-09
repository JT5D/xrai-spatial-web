/**
 * Agent overlay — minimal voice UI: mic button + waveform + transcript.
 * Glass-morphism style, bottom-center positioned.
 */
import { getTheme } from "../theme/tokens.mjs";

export function createAgentOverlay(container, hooks) {
  const theme = getTheme();
  const a = theme.agent || {};

  // Create DOM structure
  const overlay = document.createElement("div");
  overlay.className = "hud-agent-overlay";
  overlay.innerHTML = `
    <div class="hud-agent-transcript" id="agentTranscript"></div>
    <div class="hud-agent-controls">
      <button class="hud-agent-mic" id="agentMic" title="Talk to Jarvis (or type below)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <input type="text" class="hud-agent-text-input" id="agentTextInput"
        placeholder="Type to Jarvis…" />
    </div>
    <div class="hud-agent-status" id="agentStatus"></div>
  `;

  // Styles
  const style = document.createElement("style");
  style.textContent = `
    .hud-agent-overlay {
      position: fixed;
      bottom: ${a.overlayBottom || "24px"};
      left: 50%;
      transform: translateX(-50%);
      z-index: 1001;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }
    .hud-agent-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;
    }
    .hud-agent-mic {
      width: ${a.micSize || "44px"};
      height: ${a.micSize || "44px"};
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      color: ${a.micIdleColor || "rgba(255,255,255,0.3)"};
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      outline: none;
    }
    .hud-agent-mic:hover {
      background: rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.6);
    }
    .hud-agent-mic.listening {
      color: ${a.micActiveColor || "#4dd0e1"};
      border-color: ${a.micActiveColor || "#4dd0e1"};
      animation: mic-pulse 1.5s ease-in-out infinite;
    }
    .hud-agent-mic.disabled {
      opacity: 0.3;
      cursor: default;
    }
    @keyframes mic-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(77,208,225,0.3); }
      50% { box-shadow: 0 0 0 8px rgba(77,208,225,0); }
    }
    .hud-agent-text-input {
      width: 260px;
      padding: 10px 14px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 22px;
      color: #e0e0e0;
      font-size: 13px;
      outline: none;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    }
    .hud-agent-text-input::placeholder {
      color: rgba(255,255,255,0.25);
    }
    .hud-agent-text-input:focus {
      border-color: rgba(255,255,255,0.3);
    }
    .hud-agent-transcript {
      max-width: 500px;
      padding: 8px 16px;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 12px;
      color: rgba(255,255,255,0.7);
      font-size: ${a.transcriptFontSize || "13px"};
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      line-height: 1.5;
      text-align: center;
      opacity: 0;
      transition: opacity 0.3s ease;
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .hud-agent-transcript.visible {
      opacity: 1;
    }
    .hud-agent-status {
      font-size: 11px;
      color: rgba(255,255,255,0.3);
      letter-spacing: 0.05em;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .hud-agent-status.visible {
      opacity: 1;
    }
  `;

  container.appendChild(style);
  container.appendChild(overlay);

  const micBtn = overlay.querySelector("#agentMic");
  const textInput = overlay.querySelector("#agentTextInput");
  const transcriptEl = overlay.querySelector("#agentTranscript");
  const statusEl = overlay.querySelector("#agentStatus");

  let transcriptTimeout = null;

  // Mic button click
  micBtn.addEventListener("click", () => {
    hooks.emit("agent:mic-toggle");
  });

  // Text input submit
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && textInput.value.trim()) {
      hooks.emit("agent:final", textInput.value.trim());
      textInput.value = "";
    }
  });

  // Update mic button state
  hooks.on("agent:listening", (active) => {
    micBtn.classList.toggle("listening", active);
  });

  // Show interim transcript
  hooks.on("agent:interim", (text) => {
    showTranscript(text, "rgba(255,255,255,0.4)");
  });

  // Show Jarvis response streaming
  hooks.on("agent:response-delta", (text) => {
    showTranscript(text, "rgba(255,255,255,0.7)");
  });

  // Show final response
  hooks.on("agent:response-done", (text) => {
    if (text) {
      showTranscript(text, "rgba(255,255,255,0.7)");
      clearTimeout(transcriptTimeout);
      transcriptTimeout = setTimeout(() => {
        transcriptEl.classList.remove("visible");
      }, 8000);
    }
  });

  // Status messages
  hooks.on("agent:connected", () => setStatus(""));
  hooks.on("agent:disconnected", () => setStatus("reconnecting…"));
  hooks.on("agent:error", (msg) => setStatus(msg));

  // Disable mic if speech not supported
  hooks.on("agent:speech-error", () => {
    micBtn.classList.add("disabled");
    micBtn.title = "Speech recognition not supported — use text input";
  });

  function showTranscript(text, color) {
    transcriptEl.textContent = text;
    transcriptEl.style.color = color || "rgba(255,255,255,0.7)";
    transcriptEl.classList.add("visible");
    clearTimeout(transcriptTimeout);
    transcriptTimeout = setTimeout(() => {
      transcriptEl.classList.remove("visible");
    }, 5000);
  }

  function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("visible", !!msg);
  }

  function dispose() {
    clearTimeout(transcriptTimeout);
    overlay.remove();
    style.remove();
  }

  return { dispose };
}
