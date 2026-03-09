/**
 * Camera animator — smooth lerp transitions, tag-along behavior (MRTK3).
 * Zooms camera toward focused node, returns to orbit on clear.
 */
import { getTheme } from "../theme/tokens.mjs";

export function createCameraAnimator(camera, controls, nodesModule, hooks) {
  const theme = getTheme();
  const transitionMs = theme.camera.transitionDurationMs;

  let animating = false;
  let startPos = new THREE.Vector3();
  let targetPos = new THREE.Vector3();
  let startTarget = new THREE.Vector3();
  let endTarget = new THREE.Vector3();
  let animStart = 0;
  let homePos = camera.position.clone();
  let homeTarget = controls.target.clone();

  hooks.on("camera:focus", ({ nodeId }) => {
    const mesh = nodesModule.getMeshById(nodeId);
    if (!mesh) return;

    const nodePos = mesh.position.clone();

    // Camera positions: slightly offset from node, looking at it
    startPos.copy(camera.position);
    startTarget.copy(controls.target);
    endTarget.copy(nodePos);

    // Position camera at distance proportional to node ring
    const ring = mesh.userData.ring || 1;
    const dist = 30 + ring * 15;
    const dir = camera.position.clone().sub(nodePos).normalize();
    targetPos.copy(nodePos).add(dir.multiplyScalar(dist));

    animStart = performance.now();
    animating = true;
  });

  hooks.on("focus:clear", () => {
    // Return to home position
    startPos.copy(camera.position);
    startTarget.copy(controls.target);
    targetPos.copy(homePos);
    endTarget.copy(homeTarget);
    animStart = performance.now();
    animating = true;
  });

  function update() {
    if (!animating) return;

    const elapsed = performance.now() - animStart;
    let t = Math.min(1, elapsed / transitionMs);
    // Ease-out cubic
    t = 1 - Math.pow(1 - t, 3);

    camera.position.lerpVectors(startPos, targetPos, t);
    controls.target.lerpVectors(startTarget, endTarget, t);

    if (t >= 1) {
      animating = false;
    }
  }

  function saveHome() {
    homePos.copy(camera.position);
    homeTarget.copy(controls.target);
  }

  return { update, saveHome };
}
