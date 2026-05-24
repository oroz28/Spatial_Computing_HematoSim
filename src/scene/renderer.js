import * as THREE from "three";

// Function to create and configure the WebGL renderer for the scene. It sets up antialiasing, pixel ratio, size,
// shadow mapping, tone mapping, and appends the renderer's canvas to the document body. It also adds an event listener to handle window resizing.
export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);
  window.addEventListener("resize", () =>
    renderer.setSize(window.innerWidth, window.innerHeight),
  );
  return renderer;
}
