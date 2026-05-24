import * as THREE from "three";
import { TUBE_RADIUS } from "../../utils/constants.js";
import { randFloat } from "../../utils/math.js";
import {
  WOUND_JET_SPAWN_RATE,
  WOUND_JET_SPEED_MIN,
  WOUND_JET_SPEED_MAX,
  WOUND_JET_SPREAD,
} from "../../utils/constants.js";

const WOUND_COLOR = 0x6b1010;
const COLLAGEN_COLOR = 0xf0ece0;
const BLEED_COLOR = new THREE.Color(0xcc0011);
const COLLAGEN_COUNT = 22;

const JET_COUNT = 300;
const JET_LIFE_MIN = 0.25;
const JET_LIFE_MAX = 0.65;

// Class representing the wound zone in the scenario. It includes the visual representation of the wound, collagen fibers, a particle system for the bleeding effect,
// and a point light that illuminates the breach area. woundSize (default 1) scales geometry, jet behaviour, and light intensity proportionally.
export class WoundZone {
  woundPos = new THREE.Vector3();
  woundNormal = new THREE.Vector3();

  #scene = null;
  #curve = null;
  #woundT = 0;
  #woundSize = 1;

  #tearMesh = null;
  #collagen = null;
  #jetGeo = null;
  #jetMat = null;
  #jetPoints = null;
  #woundLight = null;

  #pos = null;
  #vel = [];
  #life = new Float32Array(JET_COUNT);
  #maxLife = new Float32Array(JET_COUNT);
  #active = new Uint8Array(JET_COUNT);

  #spawnAccum = 0;
  #intensity = 0;
  #bleedRate = 0;

  // Constructor initializes the wound zone with a scene, a curve to position the wound along, a t parameter that determines where on the curve the wound is located,
  // and an optional woundSize multiplier. It builds the visual components of the wound.
  constructor(scene, curve, woundT, woundSize = 1) {
    this.#scene = scene;
    this.#curve = curve;
    this.#woundT = woundT;
    this.#woundSize = woundSize;

    const pt = curve.getPointAt(woundT);
    const tan = curve.getTangentAt(woundT);

    const up = new THREE.Vector3(0, 1, 0);
    this.woundNormal.crossVectors(tan, up).normalize();

    this.woundPos
      .copy(pt)
      .addScaledVector(this.woundNormal, TUBE_RADIUS * 0.88);

    this.#buildTear(pt, tan);
    this.#buildCollagen(pt, tan);
    this.#buildJet();
    this.#buildLight();
  }

  // Builds the visual representation of the wound tear using a torus geometry, oriented to face outward from the vessel wall.
  // The torus size is scaled by woundSize.
  #buildTear(pt, tan) {
    const s = this.#woundSize;
    const geo = new THREE.TorusGeometry(
      TUBE_RADIUS * 0.22 * s,
      TUBE_RADIUS * 0.06 * s,
      6,
      20,
    );
    const mat = new THREE.MeshStandardMaterial({
      color: WOUND_COLOR,
      emissive: new THREE.Color(0x3a0000),
      emissiveIntensity: 0,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0,
    });
    this.#tearMesh = new THREE.Mesh(geo, mat);
    this.#tearMesh.position.copy(this.woundPos);
    this.#tearMesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      this.woundNormal,
    );
    this.#scene.add(this.#tearMesh);
  }

  // Builds the collagen fibers as line segments radiating from the wound edge into the lumen, with some randomness to create a natural look.
  #buildCollagen(pt, tan) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COLLAGEN_COUNT * 2 * 3);

    const up = new THREE.Vector3(0, 1, 0);
    const perp1 = new THREE.Vector3()
      .crossVectors(this.woundNormal, up)
      .normalize();
    const perp2 = new THREE.Vector3()
      .crossVectors(this.woundNormal, perp1)
      .normalize();

    for (let i = 0; i < COLLAGEN_COUNT; i++) {
      const angle = (i / COLLAGEN_COUNT) * Math.PI * 2;
      const r = TUBE_RADIUS * (0.18 + Math.random() * 0.1) * this.#woundSize;
      const len = randFloat(0.25, 0.55) * this.#woundSize;

      const sx =
        this.woundPos.x +
        Math.cos(angle) * r * perp1.x +
        Math.sin(angle) * r * perp2.x;
      const sy =
        this.woundPos.y +
        Math.cos(angle) * r * perp1.y +
        Math.sin(angle) * r * perp2.y;
      const sz =
        this.woundPos.z +
        Math.cos(angle) * r * perp1.z +
        Math.sin(angle) * r * perp2.z;

      const ex = sx - this.woundNormal.x * len + (Math.random() - 0.5) * 0.25;
      const ey = sy - this.woundNormal.y * len + (Math.random() - 0.5) * 0.25;
      const ez = sz - this.woundNormal.z * len + (Math.random() - 0.5) * 0.25;

      const b = i * 6;
      positions[b] = sx;
      positions[b + 1] = sy;
      positions[b + 2] = sz;
      positions[b + 3] = ex;
      positions[b + 4] = ey;
      positions[b + 5] = ez;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.#collagen = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: COLLAGEN_COLOR,
        transparent: true,
        opacity: 0,
      }),
    );
    this.#scene.add(this.#collagen);
  }

  // Builds the particle system for the bleeding effect, initializing the particle data and creating a Points object to render the particles.
  #buildJet() {
    this.#pos = new Float32Array(JET_COUNT * 3);
    for (let i = 0; i < JET_COUNT; i++) {
      this.#vel.push(new THREE.Vector3());
      this.#life[i] = 0;
      this.#maxLife[i] = 1;
      this.#active[i] = 0;
      this.#pos[i * 3] = this.woundPos.x;
      this.#pos[i * 3 + 1] = this.woundPos.y;
      this.#pos[i * 3 + 2] = this.woundPos.z;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.#pos, 3));

    this.#jetMat = new THREE.PointsMaterial({
      color: BLEED_COLOR,
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.#jetPoints = new THREE.Points(geo, this.#jetMat);
    this.#jetPoints.frustumCulled = false;
    this.#scene.add(this.#jetPoints);
  }

  // Builds a point light positioned at the wound that illuminates the breach area with a reddish glow.
  // Its intensity is driven by woundIntensity in update() so it fades in with the wound opening.
  #buildLight() {
    this.#woundLight = new THREE.PointLight(0xff2200, 0, 10 * this.#woundSize);
    this.#woundLight.position.copy(this.woundPos);
    this.#scene.add(this.#woundLight);
  }

  // Updates the wound zone based on the current intensity and bleed rate, adjusting the visual effects of the tear, collagen, bleeding particles,
  // and wound light accordingly.
  update(intensity, bleedRate, delta) {
    this.#intensity = intensity;
    this.#bleedRate = bleedRate;

    this.#tearMesh.material.opacity = intensity * 0.95;
    this.#tearMesh.material.emissiveIntensity = intensity * 1.5;
    this.#collagen.material.opacity = intensity * 0.8;

    this.#woundLight.intensity = intensity * 3.0 * this.#woundSize;

    this.#updateJet(delta, intensity, bleedRate);
  }

  // Internal method to update the bleeding particle system, spawning new particles based on the bleed rate and woundSize,
  // and updating existing particles' positions and lifetimes. Speed and spread are scaled by woundSize.
  #updateJet(delta, intensity, bleedRate) {
    if (intensity < 0.15) {
      this.#jetMat.opacity = 0;
      return;
    }
    this.#jetMat.opacity = Math.min(intensity * 0.95, 0.92);

    const spawnRate = bleedRate * WOUND_JET_SPAWN_RATE * this.#woundSize;
    this.#spawnAccum += spawnRate * delta;

    const toSpawn = Math.floor(this.#spawnAccum);
    this.#spawnAccum -= toSpawn;

    let spawned = 0;
    for (let i = 0; i < JET_COUNT && spawned < toSpawn; i++) {
      if (this.#active[i]) continue;
      this.#spawnParticle(i);
      spawned++;
    }

    for (let i = 0; i < JET_COUNT; i++) {
      if (!this.#active[i]) {
        this.#pos[i * 3] = this.woundPos.x;
        this.#pos[i * 3 + 1] = this.woundPos.y - 1000;
        this.#pos[i * 3 + 2] = this.woundPos.z;
        continue;
      }

      this.#life[i] += delta;
      if (this.#life[i] >= this.#maxLife[i]) {
        this.#active[i] = 0;
        continue;
      }

      this.#vel[i].y -= delta * 4.5;

      this.#pos[i * 3] += this.#vel[i].x * delta;
      this.#pos[i * 3 + 1] += this.#vel[i].y * delta;
      this.#pos[i * 3 + 2] += this.#vel[i].z * delta;
    }

    this.#jetPoints.geometry.attributes.position.needsUpdate = true;
  }

  // Internal method to spawn a new bleeding particle at the wound position, giving it an initial velocity based on the wound normal and some randomness for a natural effect.
  // Speed and spread are scaled by woundSize so larger wounds bleed more forcefully.
  #spawnParticle(i) {
    this.#active[i] = 1;
    this.#life[i] = 0;
    this.#maxLife[i] = randFloat(JET_LIFE_MIN, JET_LIFE_MAX);

    this.#pos[i * 3] = this.woundPos.x + (Math.random() - 0.5) * 0.15;
    this.#pos[i * 3 + 1] = this.woundPos.y + (Math.random() - 0.5) * 0.15;
    this.#pos[i * 3 + 2] = this.woundPos.z + (Math.random() - 0.5) * 0.15;

    const speed =
      randFloat(WOUND_JET_SPEED_MIN, WOUND_JET_SPEED_MAX) * this.#woundSize;
    const spread = WOUND_JET_SPREAD * this.#woundSize;

    const rx = (Math.random() - 0.5) * spread;
    const ry = (Math.random() - 0.5) * spread;
    const rz = (Math.random() - 0.5) * spread;

    this.#vel[i].set(
      this.woundNormal.x * speed + rx,
      this.woundNormal.y * speed + ry,
      this.woundNormal.z * speed + rz,
    );
  }

  destroy() {
    this.#woundLight.intensity = 0;
    this.#scene.remove(this.#woundLight);
    this.#scene.remove(this.#tearMesh);
    this.#scene.remove(this.#collagen);
    this.#scene.remove(this.#jetPoints);
    this.#scene.remove(this.#woundLight);
    this.#tearMesh.geometry.dispose();
    this.#tearMesh.material.dispose();
    this.#collagen.geometry.dispose();
    this.#collagen.material.dispose();
    this.#jetPoints.geometry.dispose();
    this.#jetMat.dispose();
  }

  get tearMesh() {
    return this.#tearMesh;
  }
}
