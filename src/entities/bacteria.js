import * as THREE from "three";
import {
  BACTERIA_SPEED,
  BACTERIA_WANDER,
  TUBE_RADIUS,
  BACTERIA_TYPES,
} from "../utils/constants.js";
import { randomInTube, wrapT, randFloat } from "../utils/math.js";

let _nextId = 0;

// Class representing a single bacterium in the flow. It moves along a curve with some wandering, and has a type that determines its appearance.
export class Bacterium {
  id = _nextId++;
  alive = true;
  type = null;
  mesh = null;

  #t = 0;
  #phase = 0;
  #wanderAmp = 0;
  #speed = 0;
  #curve = null;
  #radBase = new THREE.Vector3();

  // Constructor initializes the bacterium with a curve to follow, a type (or random if not provided), and an optional initial position along the curve.
  constructor(scene, curve, type, initialT = null) {
    this.#curve = curve;
    this.type = type ?? this.#randomType();
    this.#t = initialT !== null ? initialT : Math.random();
    this.#phase = Math.random() * Math.PI * 2;
    this.#wanderAmp = randFloat(0.4, BACTERIA_WANDER) * TUBE_RADIUS;
    this.#speed = randFloat(0.6, 1.4) * BACTERIA_SPEED;

    const tan = curve.getTangentAt(this.#t);
    this.#radBase.copy(randomInTube(tan, TUBE_RADIUS * 0.5));

    this.mesh = this.#buildMesh();
    scene.add(this.mesh);
    this.#updateMeshPosition();
  }

  #randomType() {
    const types = Object.keys(BACTERIA_TYPES);
    return types[Math.floor(Math.random() * types.length)];
  }

  #buildMesh() {
    const def = BACTERIA_TYPES[this.type];
    let geo;
    switch (def.geometry) {
      case "cylinder":
        geo = new THREE.CylinderGeometry(
          def.scale * 0.5,
          def.scale * 0.5,
          def.scale * 1.6,
          8,
        );
        break;
      case "icosahedron":
        geo = new THREE.IcosahedronGeometry(def.scale, 0);
        break;
      default:
        geo = new THREE.SphereGeometry(def.scale, 8, 6);
    }
    const mat = new THREE.MeshPhongMaterial({
      color: def.color,
      emissive: new THREE.Color(def.color).multiplyScalar(0.3),
      shininess: 60,
    });
    return new THREE.Mesh(geo, mat);
  }

  // Updates the position and orientation of the mesh based on the current position along the curve, with some wandering effect.
  #updateMeshPosition() {
    const pt = this.#curve.getPointAt(this.#t);
    const tan = this.#curve.getTangentAt(this.#t);
    const wobble = Math.sin(this.#phase) * this.#wanderAmp;
    const up =
      Math.abs(tan.y) < 0.99
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
    const perp = new THREE.Vector3().crossVectors(tan, up).normalize();
    this.mesh.position
      .copy(pt)
      .add(this.#radBase)
      .addScaledVector(perp, wobble);
    this.mesh.rotation.y += 0.01;
  }

  // Public method to update the bacterium's position based on the flow speed and time delta. It also updates the phase for wandering.
  update(delta, flowSpeed) {
    if (!this.alive) return;
    this.#t = wrapT(this.#t + this.#speed * flowSpeed * delta);
    this.#phase += delta * 1.8;
    this.#updateMeshPosition();
  }

  get position() {
    return this.mesh.position;
  }

  destroy(scene) {
    this.alive = false;
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
