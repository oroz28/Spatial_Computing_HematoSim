import * as THREE from "three";

// Utility functions for mathematical operations used throughout the project, including random point generation within a tube,
// clamping values, linear interpolation, and smoothstep function for easing transitions.
// These functions are essential for various effects and behaviors in the scenarios, such as particle movement, color transitions, and camera control.
export function randomInTube(tangent, maxRadius) {
  const up =
    Math.abs(tangent.y) < 0.99
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
  const perp1 = new THREE.Vector3().crossVectors(tangent, up).normalize();
  const perp2 = new THREE.Vector3().crossVectors(tangent, perp1).normalize();

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * maxRadius;

  return new THREE.Vector3()
    .addScaledVector(perp1, Math.cos(angle) * radius)
    .addScaledVector(perp2, Math.sin(angle) * radius);
}

export function wrapT(t) {
  return t - Math.floor(t);
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
export function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}
export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
