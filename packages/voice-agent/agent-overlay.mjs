/**
 * Agent overlay — minimal voice UI: mic button + transcript + text input.
 * Glass-morphism style. Framework-agnostic DOM injection.
 *
 * Config:
 *   container: HTMLElement        — where to mount (default: document.body)
 *   agentName: string             — display name (default: "Jarvis")
 *   position: "bottom" | "top"    — overlay position (default: "bottom")
 *   theme: object                 — color overrides
 */
export function createAgentOverlay(bus, config = {}) {
  if (typeof document === "undefined") return { dispose() {} };

  const container = config.container || document.body;
  const agentName = config.agentName || "Jarvis";
  const pos = config.position === "top" ? "top: 24px" : "bottom: 24px";
  const t = config.theme || {};

  const overlay = document.createElement("div");
  overlay.className = "va-overlay";
  overlay.innerHTML = `
    <div class="va-transcript" id="vaTranscript"></div>
    <div class="va-controls">
      <button class="va-mic" id="vaMic" title="Say &quot;Hey ${agentName}&quot; or click to talk">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </button>
      <input type="text" class="va-text-input" id="vaTextInput" placeholder="Type to ${agentName}..." />
    </div>
    <div class="va-status" id="vaStatus"></div>
  `;

  const style = document.createElement("style");
  style.textContent = `
    .va-overlay {
      position: fixed; ${pos}; left: 50%; transform: translateX(-50%);
      z-index: 10001; display: flex; flex-direction: column;
      align-items: center; gap: 8px; pointer-events: none;
    }
    .va-controls { display: flex; align-items: center; gap: 8px; pointer-events: auto; }
    .va-mic {
      width: 44px; height: 44px; border-radius: 50%;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.06); backdrop-filter: blur(20px);
      color: ${t.micIdle || "rgba(255,255,255,0.3)"}; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.3s ease; outline: none;
    }
    .va-mic:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.6); }
    .va-mic.listening {
      color: ${t.micActive || "#4dd0e1"}; border-color: ${t.micActive || "#4dd0e1"};
      animation: va-pulse 1.5s ease-in-out infinite;
    }
    .va-mic.passive {
      color: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.08);
      animation: va-breathe 3s ease-in-out infinite;
    }
    .va-mic.disabled { opacity: 0.3; cursor: default; }
    @keyframes va-breathe { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.8; } }
    @keyframes va-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(77,208,225,0.3); }
      50% { box-shadow: 0 0 0 8px rgba(77,208,225,0); }
    }
    .va-text-input {
      width: 260px; padding: 10px 14px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 22px; color: #e0e0e0; font-size: 13px; outline: none;
      backdrop-filter: blur(20px);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    }
    .va-text-input::placeholder { color: rgba(255,255,255,0.25); }
    .va-text-input:focus { border-color: rgba(255,255,255,0.3); }
    .va-transcript {
      max-width: 500px; padding: 8px 16px;
      background: rgba(0,0,0,0.5); backdrop-filter: blur(12px);
      border-radius: 12px; color: rgba(255,255,255,0.7);
      font-size: 13px; line-height: 1.5; text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      opacity: 0; transition: opacity 0.3s ease; pointer-events: none;
      white-space: pre-wrap; word-break: break-word;
    }
    .va-transcript.visible { opacity: 1; }
    .va-status {
      font-size: 11px; color: rgba(255,255,255,0.3);
      letter-spacing: 0.05em; opacity: 0; transition: opacity 0.3s ease;
    }
    .va-status.visible { opacity: 1; }
  `;

  container.appendChild(style);
  container.appendChild(overlay);

  const micBtn = overlay.querySelector("#vaMic");
  const textInput = overlay.querySelector("#vaTextInput");
  const transcriptEl = overlay.querySelector("#vaTranscript");
  const statusEl = overlay.querySelector("#vaStatus");
  let transcriptTimeout = null;

  micBtn.addEventListener("click", () => bus.emit("agent:mic-toggle"));

  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && textInput.value.trim()) {
      bus.emit("agent:final", textInput.value.trim());
      textInput.value = "";
    }
  });

  bus.on("agent:listening", (active) => {
    micBtn.classList.toggle("listening", active);
    micBtn.classList.remove("passive");
  });

  bus.on("agent:passive", (active) => {
    micBtn.classList.toggle("passive", active);
    micBtn.classList.remove("listening");
    if (active) micBtn.title = `Say "Hey ${agentName}" or click to talk`;
  });

  bus.on("agent:woke", () => showTranscript("Listening...", "rgba(77,208,225,0.8)"));
  bus.on("agent:interim", (text) => showTranscript(text, "rgba(255,255,255,0.4)"));
  bus.on("agent:response-delta", (text) => showTranscript(text, "rgba(255,255,255,0.7)"));
  bus.on("agent:response-done", (text) => {
    if (text) {
      showTranscript(text, "rgba(255,255,255,0.7)");
      clearTimeout(transcriptTimeout);
      transcriptTimeout = setTimeout(() => transcriptEl.classList.remove("visible"), 8000);
    }
  });

  bus.on("agent:connected", () => setStatus(""));
  bus.on("agent:disconnected", () => setStatus("reconnecting..."));
  bus.on("agent:error", (msg) => setStatus(msg));
  bus.on("agent:speech-error", () => {
    micBtn.classList.add("disabled");
    micBtn.title = "Speech recognition not supported — use text input";
  });

  function showTranscript(text, color) {
    transcriptEl.textContent = text;
    transcriptEl.style.color = color || "rgba(255,255,255,0.7)";
    transcriptEl.classList.add("visible");
    clearTimeout(transcriptTimeout);
    transcriptTimeout = setTimeout(() => transcriptEl.classList.remove("visible"), 5000);
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
