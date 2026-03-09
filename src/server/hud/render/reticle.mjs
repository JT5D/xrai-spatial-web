/**
 * Center reticle — pulsing ring that blinks faster when targeting a node.
 * Screen-space overlay, always centered in view.
 */
import { getTheme, parseColor } from "../theme/tokens.mjs";

export function createReticle(hooks) {
  const theme = getTheme();
  const r = theme.reticle;

  const geometry = new THREE.RingGeometry(r.innerRadius, r.outerRadius, r.segments);
  const material = new THREE.MeshBasicMaterial({
    color: parseColor(r.color),
    transparent: true,
    opacity: r.idleOpacity,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 10000;

  // Place in HUD overlay scene
  const reticleScene = new THREE.Scene();
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  reticleScene.add(mesh);

  let isTargeting = false;

  hooks.on("gaze:enter", () => {
    isTargeting = true;
  });
  hooks.on("gaze:leave", () => {
    isTargeting = false;
  });

  function update(delta, elapsed) {
    if (isTargeting) {
      // Faster blink when targeting
      const blink = Math.sin(elapsed * r.targetingBlinkRate * Math.PI * 2) * 0.5 + 0.5;
      material.opacity = r.idleOpacity + (r.targetingOpacity - r.idleOpacity) * blink;
      mesh.scale.setScalar(1.0 + blink * 0.15);
    } else {
      // Gentle idle pulse
      const pulse = Math.sin(elapsed * r.pulseFrequency * Math.PI * 2) * 0.5 + 0.5;
      material.opacity = r.idleOpacity * (0.6 + pulse * 0.4);
      mesh.scale.setScalar(1.0);
    }
  }

  function updateTheme(theme) {
    const r = theme.reticle;
    material.color.setHex(parseColor(r.color));
  }

  return { scene: reticleScene, camera: orthoCamera, mesh, update, updateTheme };
}
