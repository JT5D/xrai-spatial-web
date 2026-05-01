/**
 * URL Bar — top-center input for extracting new pages.
 *
 * Shows current URL, accepts new URLs for extraction via POST /extract.
 */

export function createUrlBar(container, hooks) {
  let bar = null;
  let input = null;
  let statusEl = null;
  let loading = false;

  function build() {
    bar = document.createElement("div");
    bar.className = "xrai-url-bar";
    bar.innerHTML = `<style>
      .xrai-url-bar {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: rgba(10, 10, 20, 0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(79, 195, 247, 0.2);
        border-radius: 10px;
        z-index: 1000;
        font-family: system-ui, -apple-system, sans-serif;
        width: min(560px, 80vw);
      }
      .xrai-url-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        padding: 8px 12px;
        color: #e0e0e0;
        font-size: 13px;
        outline: none;
        font-family: monospace;
      }
      .xrai-url-input:focus {
        border-color: rgba(79, 195, 247, 0.5);
      }
      .xrai-url-input::placeholder { color: rgba(255,255,255,0.3); }
      .xrai-extract-btn {
        padding: 8px 16px;
        background: rgba(79, 195, 247, 0.2);
        border: 1px solid rgba(79, 195, 247, 0.3);
        border-radius: 6px;
        color: #4fc3f7;
        font-size: 13px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
      }
      .xrai-extract-btn:hover { background: rgba(79, 195, 247, 0.3); }
      .xrai-extract-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .xrai-url-status {
        position: absolute;
        bottom: -22px;
        left: 12px;
        font-size: 11px;
        color: rgba(255,255,255,0.4);
      }
      .xrai-url-status.error { color: #ef5350; }
      .xrai-url-status.success { color: #66bb6a; }
    </style>
    <input class="xrai-url-input" type="url" placeholder="Enter URL to explore..." />
    <button class="xrai-extract-btn">Extract</button>
    <div class="xrai-url-status"></div>`;

    container.appendChild(bar);
    input = bar.querySelector(".xrai-url-input");
    statusEl = bar.querySelector(".xrai-url-status");
    const btn = bar.querySelector(".xrai-extract-btn");

    btn.addEventListener("click", doExtract);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doExtract();
    });

    // Show current URL when graph loads
    hooks.on("graph:loaded", () => {
      const url = hooks._lastExtractedUrl;
      if (url && input) input.value = url;
    });
  }

  async function doExtract() {
    const url = input.value.trim();
    if (!url || loading) return;

    // Basic URL validation
    try { new URL(url); } catch {
      setStatus("Invalid URL", "error");
      return;
    }

    loading = true;
    const btn = bar.querySelector(".xrai-extract-btn");
    btn.disabled = true;
    btn.textContent = "Extracting...";
    setStatus("Fetching page...", "");

    try {
      const res = await fetch("/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      hooks._lastExtractedUrl = url;
      hooks.emit("graph:loaded", data.graph);
      setStatus(`Loaded: ${data.graph.nodes.length} nodes`, "success");
    } catch (err) {
      setStatus(err.message.slice(0, 60), "error");
    } finally {
      loading = false;
      btn.disabled = false;
      btn.textContent = "Extract";
    }
  }

  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = `xrai-url-status ${cls || ""}`;
    if (msg) setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 5000);
  }

  function dispose() {
    if (bar) bar.remove();
    bar = null;
    input = null;
    statusEl = null;
  }

  build();
  return { dispose };
}
