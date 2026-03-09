/**
 * View Registry — plugin system for pluggable view modes.
 *
 * Every view module implements:
 *   name: string                         — unique ID ("force-graph", "media-city", etc.)
 *   label: string                        — human-readable display name
 *   init(ctx): void                      — one-time setup (ctx = { scene, camera, hooks, engine })
 *   generate(graphData): Promise<void>   — build visuals from graph data
 *   update(delta, elapsed): void         — per-frame animation tick
 *   clear(): void                        — remove visuals, keep module alive for re-generate
 *   dispose(): void                      — full teardown, release all resources
 *   getMeshes?.(): Mesh[]                — optional: return raycaster targets for gaze/click
 *
 * API: register(viewModule), unregister(name), switch(name, data),
 *      current(), list(), getAll(), back(), dispose()
 */

export function createViewRegistry(hooks) {
  const views = new Map();
  let activeView = null;
  let ctx = null;
  let lastGraphData = null;

  /** Navigation history — supports back() */
  const history = [];
  const MAX_HISTORY = 20;

  // ── Context ──────────────────────────────────────────────────────

  /** Set shared context (engine, scene, camera, hooks) — call once after engine init */
  function setContext(engineCtx) {
    ctx = engineCtx;
    // Late-init any views that were registered before context was ready
    for (const view of views.values()) {
      if (!view._initialized) {
        view.init(ctx);
        view._initialized = true;
      }
    }
  }

  // ── Registration ─────────────────────────────────────────────────

  /** Register a view mode module. Throws if name collides. */
  function register(viewModule) {
    if (!viewModule.name) throw new Error("View module must have a .name property");
    if (!viewModule.label) viewModule.label = viewModule.name;

    // Validate required lifecycle methods
    const required = ["init", "generate", "update", "clear", "dispose"];
    for (const method of required) {
      if (typeof viewModule[method] !== "function") {
        throw new Error(`View "${viewModule.name}" is missing required method: ${method}()`);
      }
    }

    if (views.has(viewModule.name)) {
      console.warn(`[view-registry] Replacing existing view: ${viewModule.name}`);
      const existing = views.get(viewModule.name);
      if (existing === activeView) activeView = null;
      existing.dispose();
    }

    views.set(viewModule.name, viewModule);

    // Init immediately if context is available
    if (ctx) {
      viewModule.init(ctx);
      viewModule._initialized = true;
    }

    hooks.emit("view:registered", { name: viewModule.name, label: viewModule.label });
  }

  /** Remove a registered view by name. Clears/disposes it if active. */
  function unregister(name) {
    const view = views.get(name);
    if (!view) return false;

    if (view === activeView) {
      view.clear();
      activeView = null;
    }
    view.dispose();
    views.delete(name);

    hooks.emit("view:unregistered", { name });
    return true;
  }

  // ── Switching ────────────────────────────────────────────────────

  /** Switch to a different view mode by name */
  async function switchTo(name, graphData) {
    const view = views.get(name);
    if (!view) {
      throw new Error(`Unknown view: "${name}". Available: ${list().join(", ")}`);
    }

    const previousName = activeView?.name || null;

    // Push previous view onto history stack
    if (activeView && activeView !== view) {
      history.push({ name: activeView.name, data: lastGraphData });
      if (history.length > MAX_HISTORY) history.shift();
      activeView.clear();
    }

    activeView = view;

    // Store data for re-generation (filter changes, back() navigation)
    if (graphData) {
      lastGraphData = graphData;
      await view.generate(graphData);
    }

    hooks.emit("view:switched", {
      name,
      label: view.label,
      previous: previousName,
    });
  }

  /** Navigate back to the previous view. Returns false if no history. */
  async function back() {
    if (history.length === 0) return false;

    const prev = history.pop();
    const view = views.get(prev.name);
    if (!view) return false;

    if (activeView) activeView.clear();
    activeView = view;

    if (prev.data) {
      lastGraphData = prev.data;
      await view.generate(prev.data);
    }

    hooks.emit("view:switched", {
      name: prev.name,
      label: view.label,
      previous: null,
      fromHistory: true,
    });
    return true;
  }

  // ── Per-frame ────────────────────────────────────────────────────

  /** Update active view (called each frame from engine render loop) */
  function update(delta, elapsed) {
    if (activeView?.update) activeView.update(delta, elapsed);
  }

  // ── Queries ──────────────────────────────────────────────────────

  /** Get meshes from active view for raycasting / gaze */
  function getMeshes() {
    return activeView?.getMeshes?.() || [];
  }

  /** Get active view name (or null) */
  function current() {
    return activeView?.name || null;
  }

  /** List all registered view names */
  function list() {
    return Array.from(views.keys());
  }

  /** Get view metadata for all registered views */
  function getAll() {
    return Array.from(views.values()).map((v) => ({
      name: v.name,
      label: v.label,
      active: v === activeView,
    }));
  }

  /** Check whether a name is registered */
  function has(name) {
    return views.has(name);
  }

  /** Get the last graph data passed to switchTo */
  function getLastData() {
    return lastGraphData;
  }

  // ── Teardown ─────────────────────────────────────────────────────

  /** Dispose all views and clear state */
  function dispose() {
    for (const view of views.values()) {
      view.dispose();
    }
    views.clear();
    activeView = null;
    lastGraphData = null;
    history.length = 0;
  }

  // ── Hook-driven navigation ──────────────────────────────────────
  // back() requests are handled here; switch requests are handled by
  // the orchestrator (which applies filter-engine before calling switchTo).
  hooks.on("view:back-request", () => back());

  return {
    setContext,
    register,
    unregister,
    switchTo,
    back,
    update,
    getMeshes,
    current,
    list,
    getAll,
    has,
    getLastData,
    dispose,
  };
}
