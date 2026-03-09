/**
 * Force Graph layout — default view mode.
 * Wraps existing graph.mjs + nodes.mjs + connectors.mjs + labels.mjs
 * as a view-registry-compatible plugin.
 */
import { createGraph } from "../../graph.mjs";
import { createNodes } from "../../render/nodes.mjs";
import { createConnectors } from "../../render/connectors.mjs";
import { createLabels } from "../../render/labels.mjs";

export function createForceGraphView() {
  let graph, nodes, connectors, labels;
  let ctx = null;

  return {
    name: "force-graph",
    label: "Force Graph",

    init(engineCtx) {
      ctx = engineCtx;
      const { scene, camera, hooks } = ctx;

      graph = createGraph(hooks);
      nodes = createNodes(scene, hooks);
      connectors = createConnectors(scene, hooks);
      labels = createLabels(scene, camera, hooks);
    },

    async generate(graphData) {
      if (!ctx) return;
      graph.load(graphData);
      // build() is triggered by graph:loaded hook inside nodes/connectors/labels
      // But since they listen for it in the orchestrator, we call build directly
      nodes.build(graphData.nodes);
      connectors.build(graphData.links);
      labels.build(graphData.nodes);
    },

    update(delta, elapsed) {
      if (nodes?.update) nodes.update(delta, elapsed);
      if (connectors?.update) connectors.update(delta, elapsed);
      if (labels?.update) labels.update(delta, elapsed);
    },

    getMeshes() {
      return nodes?.getMeshes?.() || [];
    },

    clear() {
      graph?.dispose();
      nodes?.clear();
      connectors?.clear();
      labels?.clear();
    },

    dispose() {
      this.clear();
      graph = null;
      nodes = null;
      connectors = null;
      labels = null;
      ctx = null;
    },
  };
}
