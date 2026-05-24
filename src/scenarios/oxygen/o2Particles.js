import * as THREE from "three";
import {
  O2_PARTICLE_COUNT,
  O2_PARTICLE_SPEED,
  O2_COLOR,
  O2_ZONE_START,
  O2_ZONE_END,
  O2_ABSORB_RADIUS,
  TUBE_RADIUS,
} from "../../utils/constants.js";
import { randomInTube, randFloat } from "../../utils/math.js";

const SPHERE_RADIUS = 0.22;
const FADE_IN_DURATION = 0.8;

// Class representing the oxygen particles in the alveoli zone of the bloodstream. These particles are emitted within a specific zone along the curve of the bloodstream
// and move along the flow of the bloodstream while also drifting radially. They can be absorbed by red blood cells (RBCs) when they come within a certain radius, simulating the oxygenation process.
// The class manages the state of the particles, including their positions, movement, and absorption by RBCs. It also controls the visual representation of the particles using an InstancedMesh for efficient rendering.
export class O2Particles {
  active = false;

  #scene = null;
  #curve = null;
  #mesh = null;
  #dummy = new THREE.Object3D();
  #zoneLight = null;

  #t = new Float32Array(O2_PARTICLE_COUNT);
  #radius = new Float32Array(O2_PARTICLE_COUNT);
  #radDir = [];

  #fadeScale = 0;
  #wasActive = false;

  #absorbedTotal = 0;

  // Constructor initializes the oxygen particles system with a scene and a curve to follow. It creates an InstancedMesh to represent the particles, sets up a point light for the alveoli zone,
  // and initializes the positions and movement directions of the particles within the defined zone along the curve.
  constructor(scene, curve) {
    this.#scene = scene;
    this.#curve = curve;

    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 6, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(O2_COLOR),
      emissive: new THREE.Color(O2_COLOR),
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.95,
    });

    this.#mesh = new THREE.InstancedMesh(geo, mat, O2_PARTICLE_COUNT);
    this.#mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#mesh.frustumCulled = false;
    this.#mesh.visible = false;
    scene.add(this.#mesh);

    const midT = (O2_ZONE_START + O2_ZONE_END) / 2;
    this.#zoneLight = new THREE.PointLight(O2_COLOR, 0, 40);
    this.#zoneLight.position.copy(curve.getPointAt(midT));
    scene.add(this.#zoneLight);

    for (let i = 0; i < O2_PARTICLE_COUNT; i++) {
      this.#radDir.push(new THREE.Vector3());
      this.#spawnAt(i, randFloat(0, 1));
    }
  }

  get absorbedTotal() {
    return this.#absorbedTotal;
  }

  get mesh() {
    return this.#mesh;
  }

  // Update method to be called on each frame. It manages the movement of the oxygen particles along the curve, their radial drift, and checks for absorption by RBCs.
  // It also handles the fade-in effect when the particles become active.
  update(delta, flowSpeed, rbcPositions) {
    if (this.active && !this.#wasActive) {
      for (let i = 0; i < O2_PARTICLE_COUNT; i++) this.#spawnAt(i, 0);
      this.#fadeScale = 0;
      this.#mesh.visible = true;
    }
    if (!this.active && this.#wasActive) {
      this.#mesh.visible = false;
      this.#fadeScale = 0;
    }
    this.#wasActive = this.active;

    const targetLight = this.active ? 3.0 : 0;
    this.#zoneLight.intensity +=
      (targetLight - this.#zoneLight.intensity) * Math.min(delta * 2.5, 1);

    if (!this.active) return;

    this.#fadeScale = Math.min(this.#fadeScale + delta / FADE_IN_DURATION, 1);

    const tAdvance = 0.004 * flowSpeed * delta;

    for (let i = 0; i < O2_PARTICLE_COUNT; i++) {
      this.#t[i] += tAdvance;
      if (this.#t[i] > O2_ZONE_END) {
        this.#t[i] = O2_ZONE_START + (this.#t[i] - O2_ZONE_END);
      }

      this.#radius[i] -= O2_PARTICLE_SPEED * delta;

      const clampedT = Math.min(this.#t[i], 0.9999);
      const centre = this.#curve.getPointAt(clampedT);
      const wp = centre
        .clone()
        .addScaledVector(this.#radDir[i], this.#radius[i]);

      let absorbed = false;
      for (const rbcPos of rbcPositions) {
        if (wp.distanceTo(rbcPos) < O2_ABSORB_RADIUS) {
          absorbed = true;
          break;
        }
      }

      if (absorbed || this.#radius[i] < 0.3) {
        if (absorbed) this.#absorbedTotal++;
        this.#spawnAt(i, 0);
        const nc = this.#curve.getPointAt(Math.min(this.#t[i], 0.9999));
        wp.copy(nc).addScaledVector(this.#radDir[i], this.#radius[i]);
      }

      this.#dummy.position.copy(wp);
      this.#dummy.scale.setScalar(this.#fadeScale);
      this.#dummy.updateMatrix();
      this.#mesh.setMatrixAt(i, this.#dummy.matrix);
    }

    this.#mesh.instanceMatrix.needsUpdate = true;
    this.#mesh.computeBoundingSphere();
  }

  destroy() {
    this.#scene.remove(this.#mesh);
    this.#scene.remove(this.#zoneLight);
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }

  // Internal method to spawn a particle at a specific index with a given radial fraction.
  // It calculates a random position along the curve within the defined zone and assigns a random radial direction and radius for the particle's movement.
  #spawnAt(i, radialFrac) {
    const t = O2_ZONE_START + Math.random() * (O2_ZONE_END - O2_ZONE_START);
    this.#t[i] = t;
    const tan = this.#curve.getTangentAt(t);
    const radVec = randomInTube(tan, 1.0);
    radVec.normalize();
    this.#radDir[i].copy(radVec);
    this.#radius[i] =
      TUBE_RADIUS * 0.92 * (radialFrac === 0 ? 1 : randFloat(0.15, 1.0));
  }
}
