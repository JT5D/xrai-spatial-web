/**
 * View Switcher — floating bottom bar for switching view modes.
 *
 * Shows available views as buttons. Active view is highlighted.
 * Auto-hides after idle, reappears on mouse move.
 */

const VIEW_ICONS = {
  "force-graph": "🔗",
  "media-city": "🏙️",
  newspaper: "📰",
  "system-hud": "⚙️",
};

export function createViewSwitcher(container, viewRegistry, hooks) {
  let bar = null;
  let hideTimer = null;
  const HIDE_DELAY = 5000;

  function build() {
    bar = document.createElement("div");
    bar.className = "xrai-view-switcher";
    bar.innerHTML = `<style>
      .xrai-view-switcher {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 4px;
        padding: 6px 10px;
        background: rgba(10, 10, 20, 0.85);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(79, 195, 247, 0.2);
        border-radius: 12px;
        z-index: 1000;
        transition: opacity 0.3s, transform 0.3s;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .xrai-view-switcher.hidden {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        pointer-events: none;
      }
      .xrai-view-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .xrai-view-btn:hover {
        background: rgba(79, 195, 247, 0.1);
        color: #fff;
        border-color: rgba(79, 195, 247, 0.3);
      }
      .xrai-view-btn.active {
        background: rgba(79, 195, 247, 0.15);
        color: #4fc3f7;
        border-color: rgba(79, 195, 247, 0.4);
      }
      .xrai-view-btn .icon { font-size: 16px; }
    </style>`;

    render();
    container.appendChild(bar);

    // Auto-hide logic
    document.addEventListener("mousemove", showAndResetTimer);
    document.addEventListener("touchstart", showAndResetTimer);
    resetHideTimer();

    // Re-render when views change
    hooks.on("view:switched", render);
    hooks.on("view:registered", render);
    hooks.on("view:unregistered", render);
  }

  function render() {
    if (!bar) return;
    // Remove old buttons (keep <style>)
    const style = bar.querySelector("style");
    bar.innerHTML = "";
    if (style) bar.appendChild(style);

    const views = viewRegistry.getAll();
    for (const view of views) {
      const btn = document.createElement("button");
      btn.className = `xrai-view-btn${view.active ? " active" : ""}`;
      const icon = VIEW_ICONS[view.name] || "📊";
      btn.innerHTML = `<span class="icon">${icon}</span>${view.label}`;
      btn.addEventListener("click", () => {
        hooks.emit("view:switch-request", { name: view.name });
      });
      bar.appendChild(btn);
    }
  }

  function showAndResetTimer() {
    if (bar) bar.classList.remove("hidden");
    resetHideTimer();
  }

  function resetHideTimer() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (bar) bar.classList.add("hidden");
    }, HIDE_DELAY);
  }

  function dispose() {
    document.removeEventListener("mousemove", showAndResetTimer);
    document.removeEventListener("touchstart", showAndResetTimer);
    clearTimeout(hideTimer);
    if (bar) bar.remove();
    bar = null;
  }

  build();
  return { render, dispose };
}
