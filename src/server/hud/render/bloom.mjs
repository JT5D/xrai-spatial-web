/**
 * UnrealBloomPass wrapper — post-processing glow for emissive nodes/connectors.
 * Composes main scene + vignette + reticle overlays.
 */
import { getTheme } from "../theme/tokens.mjs";

export function createBloom(engine, vignette, reticle, hooks) {
  const theme = getTheme();
  const b = theme.bloom;
  const { renderer, scene, camera } = engine;

  // EffectComposer
  const composer = new THREE.EffectComposer(renderer);

  // Main scene pass
  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom pass
  const bloomPass = new THREE.UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    b.strength,
    b.radius,
    b.threshold
  );
  composer.addPass(bloomPass);

  // Mark renderer to use composer instead of direct render
  renderer.userData.useComposer = true;

  // Render overlays after composer
  function renderOverlays() {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(vignette.scene, vignette.camera);
    renderer.render(reticle.scene, reticle.camera);
    renderer.autoClear = true;
  }

  // Hook into the render loop
  engine.addUpdate(() => {
    composer.render();
    renderOverlays();
  });

  // Handle resize
  hooks.on("engine:resize", ({ width, height }) => {
    composer.setSize(width, height);
    bloomPass.resolution.set(width, height);
  });

  function updateTheme(theme) {
    bloomPass.strength = theme.bloom.strength;
    bloomPass.radius = theme.bloom.radius;
    bloomPass.threshold = theme.bloom.threshold;
  }

  return { composer, bloomPass, updateTheme };
}
