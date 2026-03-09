/**
 * Fullscreen vignette — peripheral darkening shader overlay.
 * Creates a screen-space quad that fades edges to black.
 */
import { getTheme } from "../theme/tokens.mjs";

export function createVignette(scene, camera) {
  const theme = getTheme();
  const { intensity, smoothness } = theme.vignette;

  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float uIntensity;
    uniform float uSmoothness;
    varying vec2 vUv;
    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center) * 2.0;
      float vign = smoothstep(1.0 - uSmoothness, 1.0, dist) * uIntensity;
      gl_FragColor = vec4(0.0, 0.0, 0.0, vign);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uIntensity: { value: intensity },
      uSmoothness: { value: smoothness },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quad.renderOrder = 9999;

  // Add to a separate scene rendered on top
  const vignetteScene = new THREE.Scene();
  const orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  vignetteScene.add(quad);

  function update(theme) {
    material.uniforms.uIntensity.value = theme.vignette.intensity;
    material.uniforms.uSmoothness.value = theme.vignette.smoothness;
  }

  return { scene: vignetteScene, camera: orthoCamera, material, update };
}
