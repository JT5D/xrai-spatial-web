/**
 * System Mini-Map — compact, always-visible overlay showing agent swarm health.
 *
 * Adapted from Portals V4 patterns:
 *   - UnifiedDebugOverlay: multi-source health dashboard, color-coded stats
 *   - jARvis Heartbeat: ok/warn/dead health signals
 *   - VoicePipelineDebugView: state→color mapping
 *   - NavigationHUD: glass morphism, compact dual-panel
 *
 * Shows: agent status, provider health, recent activity, data flow.
 * Toggle: hooks.emit("minimap:toggle") or triple-click top-right corner.
 * Polls /agent/system-state every 3s.
 *
 * Lifecycle: build() → update(delta, elapsed) → clear() / dispose()
 */

const HEALTH_COLORS = {
  ok:       "#44cc44",
  active:   "#44cc44",
  online:   "#44cc44",
  standby:  "#ffaa00",
  warn:     "#ffaa00",
  "rate-limited": "#ff6600",
  unavailable: "#ff4444",
  dead:     "#ff4444",
  "all-providers-exhausted": "#ff4444",
  unknown:  "#888888",
};

const POLL_INTERVAL = 3000;

export function createSystemMinimap(container, hooks) {
  let overlay = null;
  let pollTimer = null;
  let visible = false;
  let lastData = null;

  function build() {
    // Create overlay container
    overlay = document.createElement("div");
    overlay.id = "system-minimap";
    overlay.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      width: 260px;
      background: rgba(10, 12, 20, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(79, 195, 247, 0.2);
      border-radius: 8px;
      color: #e0e0e0;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      z-index: 10000;
      display: none;
      overflow: hidden;
      user-select: none;
      transition: opacity 0.2s;
    `;

    overlay.innerHTML = `
      <div id="mm-header" style="
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.08);
        cursor: pointer;
      ">
        <span style="color: #4fc3f7; font-weight: 600; font-size: 10px; letter-spacing: 1px;">SYSTEM</span>
        <span id="mm-status-dot" style="width: 6px; height: 6px; border-radius: 50%; background: #44cc44;"></span>
      </div>
      <div id="mm-agents" style="padding: 6px 10px;"></div>
      <div id="mm-providers" style="padding: 4px 10px; border-top: 1px solid rgba(255,255,255,0.05);"></div>
      <div id="mm-activity" style="padding: 4px 10px; border-top: 1px solid rgba(255,255,255,0.05); max-height: 60px; overflow-y: auto;"></div>
      <div id="mm-footer" style="
        padding: 3px 10px; border-top: 1px solid rgba(255,255,255,0.05);
        color: #666; font-size: 9px; text-align: center;
      ">click to expand · polls /3s</div>
    `;

    container.appendChild(overlay);

    // Toggle on header click
    overlay.querySelector("#mm-header").addEventListener("click", () => {
      const expanded = overlay.style.width === "260px";
      overlay.style.width = expanded ? "120px" : "260px";
      const sections = ["mm-providers", "mm-activity", "mm-footer"];
      sections.forEach(id => {
        overlay.querySelector(`#${id}`).style.display = expanded ? "none" : "block";
      });
    });

    // Hook listener
    hooks.on("minimap:toggle", toggle);
    hooks.on("minimap:show", show);
    hooks.on("minimap:hide", hide);

    // Start polling
    pollTimer = setInterval(poll, POLL_INTERVAL);
    poll(); // immediate first poll
  }

  async function poll() {
    if (!visible) return;
    try {
      const res = await fetch("/agent/system-state");
      if (!res.ok) return;
      lastData = await res.json();
      render(lastData);
    } catch {}
  }

  function render(data) {
    if (!overlay || !data) return;

    // Status dot
    const overallHealth = data.agents?.every(a => a.status === "online" || a.status === "active")
      ? "ok" : "warn";
    const dot = overlay.querySelector("#mm-status-dot");
    if (dot) dot.style.background = HEALTH_COLORS[overallHealth] || "#888";

    // Agents
    const agentsEl = overlay.querySelector("#mm-agents");
    if (agentsEl) {
      agentsEl.innerHTML = (data.agents || []).map(a => `
        <div style="display:flex; align-items:center; gap:6px; margin:2px 0;">
          <span style="width:5px;height:5px;border-radius:50%;background:${HEALTH_COLORS[a.status]||'#888'};flex-shrink:0;"></span>
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.name}</span>
          <span style="color:${HEALTH_COLORS[a.status]||'#888'};font-size:9px;">${a.status}</span>
        </div>
      `).join("");
    }

    // Providers
    const provEl = overlay.querySelector("#mm-providers");
    if (provEl) {
      provEl.innerHTML = `<div style="color:#666;font-size:9px;margin-bottom:2px;">PROVIDERS</div>` +
        (data.providers || []).map(p => `
        <div style="display:flex; align-items:center; gap:4px; margin:1px 0; font-size:10px;">
          <span style="width:4px;height:4px;border-radius:50%;background:${HEALTH_COLORS[p.status]||'#888'};flex-shrink:0;"></span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aaa;">${p.name}</span>
          <span style="color:${HEALTH_COLORS[p.status]||'#888'};font-size:9px;">${p.status}</span>
        </div>
      `).join("");
    }

    // Recent activity (last 5 events)
    const actEl = overlay.querySelector("#mm-activity");
    if (actEl) {
      const flows = (data.flows || []).slice(-5).reverse();
      actEl.innerHTML = `<div style="color:#666;font-size:9px;margin-bottom:2px;">ACTIVITY</div>` +
        flows.map(f => {
          const time = f.ts ? new Date(f.ts).toLocaleTimeString().slice(0, 8) : "";
          const color = f.success ? "#44cc44" : "#ff4444";
          return `<div style="display:flex;gap:4px;font-size:9px;color:#888;margin:1px 0;">
            <span style="color:#555;">${time}</span>
            <span style="color:${color};">${f.success ? "+" : "!"}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.action}</span>
          </div>`;
        }).join("");
    }
  }

  function show() {
    if (!overlay) return;
    visible = true;
    overlay.style.display = "block";
    poll(); // immediate refresh
  }

  function hide() {
    if (!overlay) return;
    visible = false;
    overlay.style.display = "none";
  }

  function toggle() {
    visible ? hide() : show();
  }

  function update(delta, elapsed) {
    // Pulse the status dot
    if (overlay && visible) {
      const dot = overlay.querySelector("#mm-status-dot");
      if (dot) {
        const pulse = 0.6 + Math.sin(elapsed * 2) * 0.4;
        dot.style.opacity = String(pulse);
      }
    }
  }

  function clear() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function dispose() {
    clear();
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    hooks.off?.("minimap:toggle", toggle);
    hooks.off?.("minimap:show", show);
    hooks.off?.("minimap:hide", hide);
  }

  return { build, update, clear, dispose, show, hide, toggle, isVisible: () => visible };
}
