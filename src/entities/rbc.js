import * as THREE from "three";
import {
  RBC_COUNT,
  RBC_SPEED_BASE,
  RBC_RADIUS,
  RBC_COLOR,
  RBC_SPREAD,
  TUBE_RADIUS,
} from "../utils/constants.js";
import { randomInTube, wrapT, randFloat } from "../utils/math.js";

// Class representing the system of red blood cells (RBCs) flowing through the vessel.
// It uses instanced rendering for performance, and manages the positions and colors of the RBCs as they move along a curve.
export class RBCSystem {
  mesh = null;
  #ts = [];
  #speeds = [];
  #radOff = [];
  #dummy = new THREE.Object3D();
  #curve = null;

  #colorInitialised = false;

  // Constructor initializes the RBC system with a curve to follow,
  // creates an instanced mesh for the RBCs, and sets up the initial positions and speeds of the RBCs.
  constructor(scene, curve) {
    this.#curve = curve;
    const geo = new THREE.SphereGeometry(RBC_RADIUS, 10, 6);

    const mat = new THREE.MeshPhongMaterial({
      color: RBC_COLOR,
      emissive: new THREE.Color(0x000000),
      shininess: 40,
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, RBC_COUNT);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.#initInstances();
  }

  #initInstances() {
    for (let i = 0; i < RBC_COUNT; i++) {
      const t = Math.random();
      const spd = randFloat(0.7, 1.3);
      this.#ts.push(t);
      this.#speeds.push(spd);
      const tan = this.#curve.getTangentAt(t);
      const off = randomInTube(tan, TUBE_RADIUS * RBC_SPREAD);
      this.#radOff.push(off);
      this.#writeMatrix(i, t, off);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  #writeMatrix(i, t, radialOff) {
    const pt = this.#curve.getPointAt(t);
    const tan = this.#curve.getTangentAt(t);
    this.#dummy.position.copy(pt).add(radialOff);
    this.#dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    this.#dummy.scale.set(1, 0.45, 1);
    this.#dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.#dummy.matrix);
  }

  getT(i) {
    return this.#ts[i];
  }

  get count() {
    return RBC_COUNT;
  }

  // The following functions are mainly for the oxygenated state change effect, but can be used for other color changes.
  setInstanceColor(i, color) {
    if (!this.#colorInitialised) {
      const defaultColor = new THREE.Color(RBC_COLOR);
      for (let j = 0; j < RBC_COUNT; j++) {
        this.mesh.setColorAt(j, defaultColor);
      }
      this.mesh.instanceColor.needsUpdate = true;
      this.#colorInitialised = true;
    }
    this.mesh.setColorAt(i, color);
  }

  flushColors() {
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  resetColors() {
    if (!this.mesh.instanceColor) return;
    const defaultColor = new THREE.Color(RBC_COLOR);
    for (let i = 0; i < RBC_COUNT; i++) {
      this.mesh.setColorAt(i, defaultColor);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  // Updates the positions of all RBC instances based on their speeds and the flow speed. It also updates the instance matrices for rendering.
  update(delta, flowSpeed) {
    for (let i = 0; i < RBC_COUNT; i++) {
      this.#ts[i] = wrapT(
        this.#ts[i] + RBC_SPEED_BASE * this.#speeds[i] * flowSpeed * delta,
      );
      this.#writeMatrix(i, this.#ts[i], this.#radOff[i]);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
