/**
 * HUD Orchestrator — top-level coordinator.
 * Initializes all subsystems, wires hooks, exposes public API.
 */
import { createHooks } from "./hooks.mjs";
import { loadTheme, mergeTheme, getTheme, injectCSSTokens } from "./theme/tokens.mjs";
import { createEngine } from "./engine.mjs";
import { createGraph } from "./graph.mjs";
import { createNodes } from "./render/nodes.mjs";
import { createConnectors } from "./render/connectors.mjs";
import { createLabels } from "./render/labels.mjs";
import { createReticle } from "./render/reticle.mjs";
import { createVignette } from "./render/vignette.mjs";
import { createBloom } from "./render/bloom.mjs";
import { createInfoCard } from "./render/info-card.mjs";
import { createGaze } from "./interaction/gaze.mjs";
import { createFocus } from "./interaction/focus.mjs";
import { createCameraAnimator } from "./interaction/camera-animator.mjs";
import { createVoiceInput } from "./agent/voice-input.mjs";
import { createVoiceOutput } from "./agent/voice-output.mjs";
import { createAgentOverlay } from "./agent/agent-overlay.mjs";
import { createAgentTools } from "./agent/agent-tools.mjs";
import { createAgentBridge } from "./agent/agent-bridge.mjs";
import { createQRSharing } from "./sharing/qr-code.mjs";
import { createWebcamGesture } from "./interaction/webcam-gesture.mjs";

export async function initHUD(container, options = {}) {
  const hooks = createHooks();

  // 1. Load theme
  const baseUrl = options.baseUrl || "";
  const theme = await loadTheme(baseUrl);
  if (options.theme) mergeTheme(options.theme);
  injectCSSTokens(getTheme());

  // 2. Core engine
  const engine = createEngine(container, hooks);

  // 3. Render overlays
  const vignette = createVignette(engine.scene, engine.camera);
  const reticle = createReticle(hooks);
  const bloom = createBloom(engine, vignette, reticle, hooks);

  // 4. Graph + visual elements
  const graph = createGraph(hooks);
  const nodes = createNodes(engine.scene, hooks);
  const connectors = createConnectors(engine.scene, hooks);
  const labels = createLabels(engine.scene, engine.camera, hooks);

  // 5. Interaction
  const focus = createFocus(hooks);
  const gaze = createGaze(engine.camera, engine.renderer, nodes, hooks);
  const cameraAnimator = createCameraAnimator(
    engine.camera,
    engine.controls,
    nodes,
    hooks
  );
  const infoCard = createInfoCard(
    container,
    engine.camera,
    engine.renderer,
    nodes,
    hooks
  );

  // 6. Agent subsystem
  const voiceInput = createVoiceInput(hooks);
  const voiceOutput = createVoiceOutput(hooks);
  const agentOverlay = createAgentOverlay(container, hooks);
  const agentTools = createAgentTools(null, hooks, graph, nodes); // hud ref set below
  const agentBridge = createAgentBridge(null, hooks, agentTools, voiceInput, voiceOutput);

  // 6b. QR sharing + webcam gesture (optional)
  const qrSharing = createQRSharing(container, hooks);
  const webcamGesture = createWebcamGesture(hooks);

  // Wire webcam gestures to navigation
  hooks.on("webcam:gesture", ({ action }) => {
    if (action === "zoom-in") hooks.emit("camera:zoom-in");
    else if (action === "zoom-out") hooks.emit("focus:clear");
    else if (action === "select") hooks.emit("focus:select", { nodeId: null });
  });

  // 7. Wire graph → visuals
  hooks.on("graph:loaded", ({ nodes: graphNodes, links }) => {
    nodes.build(graphNodes);
    connectors.build(links);
    labels.build(graphNodes);
    cameraAnimator.saveHome();
  });

  // 8. Per-frame updates
  engine.addUpdate((delta, elapsed) => {
    nodes.update(delta, elapsed);
    connectors.update();
    labels.update(delta, elapsed);
    reticle.update(delta, elapsed);
    gaze.update();
    cameraAnimator.update();
    infoCard.updatePosition();
  });

  // Public API
  const hud = {
    load(graphData) {
      graph.load(graphData);
    },
    setTheme(overrides) {
      const updated = mergeTheme(overrides);
      injectCSSTokens(updated);
      hooks.emit("theme:changed", updated);
    },
    getHooks() {
      return hooks;
    },
    getEngine() {
      return engine;
    },
    agent: {
      send(text) { agentBridge.send(text); },
      toggle() { voiceInput.toggle(); },
      isListening() { return voiceInput.isListening(); },
    },
    webcam: {
      toggle() { webcamGesture.toggle(); },
      isActive() { return webcamGesture.isActive(); },
      isSupported() { return webcamGesture.isSupported(); },
    },
    share: {
      generateQR() { qrSharing.generateQR(); },
    },
    dispose() {
      agentBridge.dispose();
      voiceInput.dispose();
      voiceOutput.dispose();
      agentOverlay.dispose();
      qrSharing.dispose();
      webcamGesture.dispose();
      graph.dispose();
      nodes.clear();
      connectors.clear();
      labels.clear();
      gaze.dispose();
      engine.dispose();
      hooks.clear();
    },
  };

  hooks.emit("hud:ready", hud);
  return hud;
}
