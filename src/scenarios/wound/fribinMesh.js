import * as THREE from "three";
import { randFloat } from "../../utils/math.js";
import {
  MAX_STRANDS,
  FIBRIN_RADIUS,
  FIBRIN_COLOR,
  CROSS_RATIO,
} from "../../utils/constants.js";

// Class representing the fibrin mesh that forms during blood clotting.
// It generates a network of strands within a spherical region around the wound, and reveals them progressively to simulate growth.
export class FibrinMesh {
  #scene = null;
  #lines = null;
  #geo = null;
  #mat = null;
  #origin = null;

  #built = false;

  #woundSize = 1;

  proxyMesh = null;

  constructor(scene, woundSize) {
    this.#scene = scene;
    this.#woundSize = woundSize;
  }

  // Sets the origin point for the fibrin mesh. The mesh will be generated around this point. If the origin moves significantly, the mesh is rebuilt.
  setOrigin(positions) {
    if (!positions?.length) return;
    const c = new THREE.Vector3();
    for (const p of positions) c.add(p);
    c.divideScalar(positions.length);

    if (this.#origin && this.#origin.distanceTo(c) < 0.1 && this.#built) return;
    this.#origin = c.clone();
    this.#rebuild();
  }

  // Updates the growth of the fibrin mesh. The growthFraction (0 to 1) determines how many strands are revealed, and the opacity is also increased with growth.
  update(growthFraction, delta) {
    if (!this.#lines || !this.#built) return;

    const targetCount = Math.floor(growthFraction * MAX_STRANDS) * 2;
    const current = this.#geo.drawRange.count;
    if (current < targetCount) {
      this.#geo.drawRange.count = Math.min(current + 4, targetCount);
    }

    this.#mat.opacity = Math.min(growthFraction * 0.75, 0.65);
  }

  reset() {
    this.#destroyMesh();
    this.#origin = null;
    this.#built = false;
  }

  destroy() {
    this.reset();
  }

  // Rebuilds the fibrin mesh geometry and material based on the current origin. Generates random strands within a sphere, with some cross-links,
  // and sets up the line segments for rendering.
  #rebuild() {
    this.#destroyMesh();

    const positions = new Float32Array(MAX_STRANDS * 2 * 3);
    const o = this.#origin;
    const r = FIBRIN_RADIUS;

    for (let i = 0; i < MAX_STRANDS; i++) {
      const base = i * 6;
      const isCrossLink = Math.random() < CROSS_RATIO;

      if (isCrossLink) {
        const p1 = this.#randomInSphere(o, r * 0.9);
        const p2 = this.#randomInSphere(o, r * 0.9);
        positions[base] = p1.x;
        positions[base + 1] = p1.y;
        positions[base + 2] = p1.z;
        positions[base + 3] = p2.x;
        positions[base + 4] = p2.y;
        positions[base + 5] = p2.z;
      } else {
        const startR = randFloat(0.05, 0.4) * r;
        const endR = randFloat(0.5, 1.0) * r;
        const dir = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize();

        const p1 = o.clone().addScaledVector(dir, startR);
        const p2 = o.clone().addScaledVector(dir, endR);
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
        );
        p2.add(jitter);

        positions[base] = p1.x;
        positions[base + 1] = p1.y;
        positions[base + 2] = p1.z;
        positions[base + 3] = p2.x;
        positions[base + 4] = p2.y;
        positions[base + 5] = p2.z;
      }
    }

    this.#geo = new THREE.BufferGeometry();
    this.#geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.#geo.setDrawRange(0, 0);

    this.#mat = new THREE.LineBasicMaterial({
      color: FIBRIN_COLOR,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      linewidth: 3.5,
    });

    this.#lines = new THREE.LineSegments(this.#geo, this.#mat);
    this.#lines.frustumCulled = false;
    this.#scene.add(this.#lines);
    this.#built = true;

    if (this.proxyMesh) {
      this.proxyMesh.position.copy(this.#origin);
    } else {
      const proxyGeo = new THREE.SphereGeometry(FIBRIN_RADIUS * 0.8, 6, 4);
      const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
      this.proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
      this.proxyMesh.position.copy(this.#origin);
      this.#scene.add(this.proxyMesh);
    }
  }

  // Destroys the current mesh and disposes of its geometry and material to free up resources.
  #destroyMesh() {
    if (!this.#lines) return;
    this.#scene.remove(this.#lines);
    this.#geo.dispose();
    this.#mat.dispose();
    this.#lines = null;
    this.#geo = null;
    this.#mat = null;

    if (this.proxyMesh) {
      this.#scene.remove(this.proxyMesh);
      this.proxyMesh.geometry.dispose();
      this.proxyMesh.material.dispose();
      this.proxyMesh = null;
    }
  }

  // Generates a random point within a sphere of given radius around a center point. Used for creating the random strands of the fibrin mesh.
  #randomInSphere(centre, radius) {
    const u = Math.random();
    const v = Math.random();
    const phi = Math.acos(2 * u - 1);
    const th = 2 * Math.PI * v;
    const r = radius * Math.cbrt(Math.random());
    return new THREE.Vector3(
      centre.x + r * Math.sin(phi) * Math.cos(th),
      centre.y + r * Math.sin(phi) * Math.sin(th),
      centre.z + r * Math.cos(phi),
    );
  }
}
