/**
 * Gaze interaction — raycaster with 230ms hover delay (visionOS convention).
 * Emits gaze:enter, gaze:hover, gaze:leave via hooks.
 */
import { getTheme } from "../theme/tokens.mjs";

export function createGaze(camera, renderer, nodesModule, hooks) {
  const theme = getTheme();
  const gazeDelayMs = theme.label.gazeDelayMs;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let currentTarget = null; // nodeId currently under pointer
  let enterTime = 0;       // when pointer entered current target
  let hasHovered = false;   // whether 230ms delay has elapsed

  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onClick(event) {
    if (currentTarget && hasHovered) {
      hooks.emit("focus:select", { nodeId: currentTarget });
    }
  }

  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("click", onClick);

  function update() {
    raycaster.setFromCamera(pointer, camera);
    const meshes = nodesModule.getMeshes();
    const intersects = raycaster.intersectObjects(meshes, false);

    const hit = intersects.length > 0 ? intersects[0].object.userData.nodeId : null;

    if (hit !== currentTarget) {
      // Left previous target
      if (currentTarget) {
        hooks.emit("gaze:leave", { nodeId: currentTarget });
      }

      currentTarget = hit;
      hasHovered = false;

      if (hit) {
        enterTime = performance.now();
        hooks.emit("gaze:enter", { nodeId: hit });
      }
    }

    // Check if 230ms delay has elapsed
    if (currentTarget && !hasHovered) {
      if (performance.now() - enterTime >= gazeDelayMs) {
        hasHovered = true;
        hooks.emit("gaze:hover", { nodeId: currentTarget });
      }
    }
  }

  function dispose() {
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("click", onClick);
  }

  return { update, dispose };
}
