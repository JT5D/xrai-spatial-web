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
  let viewRegistry = null;  // set via setViewRegistry() for view-specific meshes

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

  function setViewRegistry(vr) {
    viewRegistry = vr;
  }

  function update() {
    raycaster.setFromCamera(pointer, camera);
    // Combine legacy node meshes with view registry meshes
    const meshes = [
      ...nodesModule.getMeshes(),
      ...(viewRegistry?.getMeshes() || []),
    ];
    const intersects = raycaster.intersectObjects(meshes, false);

    let hit = null;
    if (intersects.length > 0) {
      const obj = intersects[0].object;
      hit = obj.userData?.nodeId || null;
      // For InstancedMesh, emit gaze:intersect so force-graph can resolve the instance
      if (!hit && intersects[0].instanceId !== undefined) {
        hooks.emit("gaze:intersect", { object: obj, instanceId: intersects[0].instanceId });
      }
    }

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

  return { update, setViewRegistry, dispose };
}
