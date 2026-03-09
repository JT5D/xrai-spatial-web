/**
 * d3-force-3d simulation wrapper — manages force layout and position updates.
 */
import { getTheme } from "./theme/tokens.mjs";

export function createGraph(hooks) {
  const theme = getTheme();
  const f = theme.force;
  let simulation = null;
  let graphData = null;

  function load(data) {
    graphData = data;
    const { nodes, links } = data;

    simulation = d3.forceSimulation(nodes, 3)
      .force(
        "link",
        d3.forceLink(links)
          .id((d) => d.id)
          .distance((d) => {
            const srcRing = d.source.ring ?? d.source;
            const tgtRing = d.target.ring ?? d.target;
            const maxRing = Math.max(
              typeof srcRing === "number" ? srcRing : 0,
              typeof tgtRing === "number" ? tgtRing : 0
            );
            return f.linkDistance + maxRing * f.linkDistancePerRing;
          })
      )
      .force(
        "charge",
        d3.forceManyBody().strength(f.chargeStrength)
      )
      .force(
        "radial",
        d3.forceRadial()
          .radius((d) => (d.ring || 0) * f.radialRadiusPerRing)
          .strength(f.radialStrength)
      )
      .force("center", d3.forceCenter().strength(f.centerStrength))
      .alphaDecay(f.alphaDecay)
      .on("tick", () => {
        hooks.emit("graph:tick", { nodes, links });
      });

    hooks.emit("graph:loaded", { nodes, links });
  }

  function getNodes() {
    return graphData?.nodes || [];
  }

  function getLinks() {
    return graphData?.links || [];
  }

  function dispose() {
    if (simulation) {
      simulation.stop();
      simulation = null;
    }
    graphData = null;
  }

  return { load, getNodes, getLinks, dispose };
}
