import * as THREE from "three";
import { PATH_SCALE } from "../utils/constants.js";

// A simple seeded random number generator using a linear congruential generator (LCG) algorithm. It takes a seed value and returns a function that generates pseudo-random numbers between 0 and 1.
function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Function to create a path for the bloodstream. It generates a series of random points in a circular pattern, applies some noise to create a more natural shape,
// and then creates a CatmullRomCurve3 to represent the path of the bloodstream. The points are scaled by PATH_SCALE to fit the desired size of the scene.
export function createPath() {
  const rand = seededRand(Math.floor(Math.random() * 1e9));
  const s = PATH_SCALE * 0.9;
  const n = 16;

  const rawOffsets = Array.from({ length: n }, () => rand() - 0.5);
  const smoothOffsets = rawOffsets.map((v, i) => {
    const prev = rawOffsets[(i - 1 + n) % n];
    const next = rawOffsets[(i + 1) % n];
    return v * 0.5 + prev * 0.25 + next * 0.25;
  });

  const rawOffsets2 = Array.from({ length: n }, () => rand() - 0.5);
  const smoothOffsets2 = rawOffsets2.map((v, i) => {
    const prev = rawOffsets2[(i - 1 + n) % n];
    const next = rawOffsets2[(i + 1) % n];
    return v * 0.5 + prev * 0.25 + next * 0.25;
  });

  const zOffsets = Array.from({ length: n }, () => rand() - 0.5);
  const smoothZ = zOffsets.map((v, i) => {
    const prev = zOffsets[(i - 1 + n) % n];
    const next = zOffsets[(i + 1) % n];
    return v * 0.5 + prev * 0.25 + next * 0.25;
  });

  const rawPoints = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    const rx = 1 + smoothOffsets[i] * 0.45;
    const ry = 1 + smoothOffsets2[i] * 0.45;
    return [
      Math.cos(angle) * rx,
      Math.sin(angle) * ry * 0.88,
      smoothZ[i] * 0.3,
    ];
  });

  const points = rawPoints.map(
    ([x, y, z]) => new THREE.Vector3(x * s, y * s, z * s),
  );

  return new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.5);
}
