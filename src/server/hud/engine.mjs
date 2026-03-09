/**
 * Three.js scene bootstrap — scene, camera, renderer, controls, XR, lights, fog, render loop.
 */
import { getTheme, parseColor } from "./theme/tokens.mjs";

export function createEngine(container, hooks) {
  const theme = getTheme();
  const cam = theme.camera;

  // Scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(parseColor(cam.fogColor), cam.fogDensity);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    cam.fov,
    window.innerWidth / window.innerHeight,
    cam.near,
    cam.far
  );
  camera.position.set(...cam.initialPosition);

  // Renderer
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(parseColor(cam.fogColor), 1);
  renderer.xr.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Orbit controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = cam.orbitDamping;
  controls.minDistance = 10;
  controls.maxDistance = 600;

  // Ambient light (soft fill)
  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  // Point light (subtle key light)
  const keyLight = new THREE.PointLight(0xffffff, 0.5, 500);
  keyLight.position.set(50, 100, 80);
  scene.add(keyLight);

  // Star field (distant particles for depth)
  const starGeo = new THREE.BufferGeometry();
  const starCount = 2000;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount * 3; i++) {
    starPos[i] = (Math.random() - 0.5) * 1600;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.4,
    transparent: true,
    opacity: 0.3,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  // Resize handler
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    hooks.emit("engine:resize", {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }
  window.addEventListener("resize", onResize);

  // Render loop callbacks
  const updateCallbacks = [];

  function addUpdate(fn) {
    updateCallbacks.push(fn);
  }

  // XR setup
  if (navigator.xr) {
    navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
      if (supported) {
        const vrBtn = THREE.VRButton.createButton(renderer);
        container.appendChild(vrBtn);
      }
    });
  }

  // Animation loop
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    controls.update();
    for (const cb of updateCallbacks) cb(delta, elapsed);
    hooks.emit("engine:beforeRender", { delta, elapsed });
    // Composer render is handled by bloom module; fallback to direct render
    if (!renderer.userData.useComposer) {
      renderer.render(scene, camera);
    }
  });

  function dispose() {
    window.removeEventListener("resize", onResize);
    renderer.setAnimationLoop(null);
    renderer.dispose();
    controls.dispose();
  }

  return {
    scene,
    camera,
    renderer,
    controls,
    clock,
    addUpdate,
    dispose,
  };
}
