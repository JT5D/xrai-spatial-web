/**
 * View Registry — manages pluggable layout modes.
 *
 * Every view mode implements:
 *   name: string            — unique ID ("force-graph", "media-city", etc.)
 *   label: string           — display name
 *   init(ctx): void         — one-time setup (ctx = { scene, camera, hooks, engine })
 *   generate(graphData): Promise<void>  — build visuals from data
 *   update(delta, elapsed): void        — per-frame animation
 *   clear(): void           — remove visuals, keep module alive
 *   dispose(): void         — full teardown
 *   getMeshes?.(): Mesh[]   — optional: return raycaster targets for gaze
 */

export function createViewRegistry(hooks) {
  const views = new Map();
  let activeView = null;
  let ctx = null;

  /** Set shared context (engine, scene, camera, hooks) — call once after engine init */
  function setContext(engineCtx) {
    ctx = engineCtx;
  }

  /** Register a view mode module */
  function register(viewModule) {
    if (!viewModule.name) throw new Error("View module must have a name");
    views.set(viewModule.name, viewModule);
    // Init if context is ready
    if (ctx) viewModule.init(ctx);
  }

  /** Switch to a different view mode by name */
  async function switchTo(name, graphData) {
    const view = views.get(name);
    if (!view) throw new Error(`Unknown view: ${name}. Available: ${list().join(", ")}`);

    // Clear current view
    if (activeView && activeView !== view) {
      activeView.clear();
    }

    activeView = view;

    // Generate if data provided
    if (graphData) {
      await view.generate(graphData);
    }

    hooks.emit("view:switched", { name, label: view.label });
  }

  /** Update active view (called each frame from engine) */
  function update(delta, elapsed) {
    if (activeView?.update) activeView.update(delta, elapsed);
  }

  /** Get meshes from active view for raycasting */
  function getMeshes() {
    return activeView?.getMeshes?.() || [];
  }

  /** Get active view name */
  function current() {
    return activeView?.name || null;
  }

  /** List all registered view names */
  function list() {
    return Array.from(views.keys());
  }

  /** Get view metadata */
  function getAll() {
    return Array.from(views.values()).map((v) => ({
      name: v.name,
      label: v.label,
      active: v === activeView,
    }));
  }

  /** Dispose all views */
  function dispose() {
    for (const view of views.values()) {
      view.dispose();
    }
    views.clear();
    activeView = null;
  }

  return { setContext, register, switchTo, update, getMeshes, current, list, getAll, dispose };
}
