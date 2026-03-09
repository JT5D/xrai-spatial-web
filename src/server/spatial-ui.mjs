export function getSpatialUiHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spatial HUD - Web Scraper</title>
  <script type="importmap">
  {
    "imports": {
      "three": "https://esm.sh/three@0.171.0",
      "three/addons/": "https://esm.sh/three@0.171.0/examples/jsm/",
      "d3-force-3d": "https://esm.sh/d3-force-3d@4?bundle-deps",
      "troika-three-text": "https://esm.sh/troika-three-text@0.52.3"
    }
  }
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #000; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif; overflow: hidden; }
    #hud-container { width: 100vw; height: 100vh; position: relative; }
    canvas { display: block; }
    .hud-url-bar {
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      z-index: 100; display: flex; gap: 8px;
    }
    .hud-url-bar input {
      width: 400px; padding: 10px 16px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; color: #e0e0e0; font-size: 14px; outline: none;
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    }
    .hud-url-bar input::placeholder { color: rgba(255,255,255,0.3); }
    .hud-url-bar input:focus { border-color: rgba(255,255,255,0.3); }
    .hud-url-bar button {
      padding: 10px 20px; background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
      color: #e0e0e0; font-size: 14px; cursor: pointer;
      backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
      transition: background 0.2s;
    }
    .hud-url-bar button:hover { background: rgba(255,255,255,0.18); }
    .hud-loading {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-size: 14px; opacity: 0.4; letter-spacing: 0.1em; text-transform: uppercase;
      display: none;
    }
  </style>
</head>
<body>
  <div class="hud-url-bar">
    <input type="text" id="urlInput" placeholder="Enter URL to visualize…" />
    <button id="extractBtn">Extract</button>
  </div>
  <div class="hud-loading" id="loading">Extracting…</div>
  <div id="hud-container"></div>

  <script type="module">
    // Pre-load globals that HUD modules expect on window
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";
    import { VRButton } from "three/addons/webxr/VRButton.js";
    import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
    import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
    import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
    import * as d3Force from "d3-force-3d";
    import * as troikaText from "troika-three-text";

    // Expose Three.js + addons globally for HUD modules
    window.THREE = THREE;
    THREE.OrbitControls = OrbitControls;
    THREE.VRButton = VRButton;
    THREE.EffectComposer = EffectComposer;
    THREE.RenderPass = RenderPass;
    THREE.UnrealBloomPass = UnrealBloomPass;
    window.d3 = d3Force;
    window.troika = troikaText;

    // Import HUD orchestrator
    const { initHUD } = await import("/hud/orchestrator.mjs");

    const container = document.getElementById("hud-container");
    const urlInput = document.getElementById("urlInput");
    const extractBtn = document.getElementById("extractBtn");
    const loadingEl = document.getElementById("loading");

    // Initialize HUD
    const hud = await initHUD(container, { baseUrl: "" });

    // Expose for console debugging
    window.hud = hud;

    async function extractAndLoad(targetUrl) {
      loadingEl.style.display = "block";
      try {
        const res = await fetch("/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.graph) {
          hud.load(data.graph);
          loadingEl.style.display = "none";
        }
      } catch (err) {
        loadingEl.textContent = err.message;
        setTimeout(() => {
          loadingEl.style.display = "none";
          loadingEl.textContent = "Extracting…";
        }, 3000);
      }
    }

    extractBtn.addEventListener("click", () => {
      const url = urlInput.value.trim();
      if (url && url.startsWith("http")) extractAndLoad(url);
    });

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") extractBtn.click();
    });

    // Auto-extract from URL param
    const params = new URLSearchParams(location.search);
    const autoUrl = params.get("url");
    if (autoUrl) {
      urlInput.value = autoUrl;
      extractAndLoad(autoUrl);
    }
  </script>
</body>
</html>`;
}
