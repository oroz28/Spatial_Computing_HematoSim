import * as THREE from "three";
import { createPath } from "./path.js";
import {
  TUBE_RADIUS,
  TUBE_SEGMENTS,
  TUBE_RADIAL_SEG,
  PLASMA_COUNT,
  PLASMA_COLOR,
  PLASMA_OPACITY,
  FOG_COLOR,
  FOG_NEAR,
  FOG_FAR,
  AMBIENT_INTENSITY,
  POINT_INTENSITY,
} from "../utils/constants.js";
import { randomInTube, randFloat } from "../utils/math.js";

// Class representing the bloodstream environment in the scene. It creates a tubular structure based on a curve, adds plasma particles,
// sets up lighting and fog to create an immersive atmosphere.
// tubeMaterial is exposed publicly so scenarios can adjust wall opacity (e.g. making it transparent near a wound).
export class Bloodstream {
  curve = null;
  tube = null;
  tubeMaterial = null;
  plasma = null;

  #scene = null;
  #plasmaT = [];
  #plasmaOff = [];
  #plasmaSpd = [];

  // Constructor initializes the bloodstream with a scene and an optional external curve. If no curve is provided, it creates a default path.
  // It then builds the tube geometry, adds details to the vein, creates plasma particles, sets up lighting, and configures fog for the scene.
  constructor(scene, externalCurve = null) {
    this.#scene = scene;
    this.curve = externalCurve ?? createPath();
    this.#buildTube();
    this.#buildVeinDetail();
    this.#buildPlasma();
    this.#buildLighting();
    this.#setupFog();
  }

  // Internal method to build the main tube geometry of the bloodstream. It creates a tube along the defined curve with specified segments and radius,
  // and applies a material with color, emissive properties, and transparency to create the visual effect of the bloodstream.
  // The material reference is stored in tubeMaterial so external systems can adjust opacity at runtime.
  #buildTube() {
    const geometry = new THREE.TubeGeometry(
      this.curve,
      TUBE_SEGMENTS,
      TUBE_RADIUS,
      TUBE_RADIAL_SEG,
      true,
    );
    const material = new THREE.MeshStandardMaterial({
      color: 0x7a0000,
      emissive: 0x2a0000,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.98,
    });
    this.tube = new THREE.Mesh(geometry, material);
    this.tubeMaterial = material;
    this.#scene.add(this.tube);

    const outerGeo = new THREE.TubeGeometry(
      this.curve,
      TUBE_SEGMENTS,
      TUBE_RADIUS * 1.08,
      TUBE_RADIAL_SEG,
      true,
    );
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x3d0000,
      emissive: 0x1a0000,
      roughness: 0.9,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.#scene.add(new THREE.Mesh(outerGeo, outerMat));
  }

  // Internal method to build additional details on the vein, such as rings along the tube to enhance the visual complexity and realism of the bloodstream environment.
  #buildVeinDetail() {
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x5a0000,
      emissive: 0x200000,
      roughness: 0.95,
      transparent: true,
      opacity: 0.7,
    });
    const RING_COUNT = 28;
    for (let i = 0; i < RING_COUNT; i++) {
      const t = i / RING_COUNT;
      const pt = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const geo = new THREE.TorusGeometry(
        TUBE_RADIUS * 1.01,
        0.18,
        8,
        TUBE_RADIAL_SEG,
      );
      const ring = new THREE.Mesh(geo, ringMat);
      ring.position.copy(pt);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      this.#scene.add(ring);
    }
  }

  // Internal method to build plasma particles that flow through the bloodstream. It initializes their positions randomly along the tube, assigns them random speeds,
  // and creates a Points object to render them efficiently.
  #buildPlasma() {
    const positions = new Float32Array(PLASMA_COUNT * 3);
    const dummy = new THREE.Vector3();
    for (let i = 0; i < PLASMA_COUNT; i++) {
      const t = Math.random();
      const spd = randFloat(0.003, 0.009);
      this.#plasmaT.push(t);
      this.#plasmaSpd.push(spd);
      const pt = this.curve.getPointAt(t);
      const tan = this.curve.getTangentAt(t);
      const off = randomInTube(tan, TUBE_RADIUS * 0.82);
      this.#plasmaOff.push(off.clone());
      dummy.copy(pt).add(off);
      positions[i * 3] = dummy.x;
      positions[i * 3 + 1] = dummy.y;
      positions[i * 3 + 2] = dummy.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: PLASMA_COLOR,
      size: 0.1,
      transparent: true,
      opacity: PLASMA_OPACITY,
    });
    this.plasma = new THREE.Points(geo, mat);
    this.#scene.add(this.plasma);
  }

  // Internal method to set up lighting in the scene. It adds an ambient light for general illumination and several point lights along the curve.
  #buildLighting() {
    this.#scene.add(new THREE.AmbientLight(0xff6633, AMBIENT_INTENSITY * 1.4));
    [0, 0.16, 0.33, 0.5, 0.66, 0.83].forEach((t) => {
      const light = new THREE.PointLight(0xff3300, POINT_INTENSITY * 1.3, 22);
      light.position.copy(this.curve.getPointAt(t));
      this.#scene.add(light);
    });
  }

  // Internal method to set up fog in the scene, which adds atmospheric depth and enhances the immersive feeling of being inside a bloodstream.
  #setupFog() {
    this.#scene.fog = new THREE.Fog(FOG_COLOR, FOG_NEAR, FOG_FAR);
    this.#scene.background = new THREE.Color(FOG_COLOR);
  }

  // Update method to animate the plasma particles as they flow through the bloodstream.
  update(delta, flowSpeed) {
    const positions = this.plasma.geometry.attributes.position;
    for (let i = 0; i < PLASMA_COUNT; i++) {
      this.#plasmaT[i] =
        (this.#plasmaT[i] + this.#plasmaSpd[i] * flowSpeed * delta) % 1;
      const pt = this.curve.getPointAt(this.#plasmaT[i]);
      const tan = this.curve.getTangentAt(this.#plasmaT[i]);
      this.#plasmaOff[i].applyAxisAngle(tan, delta * 0.3);
      positions.setXYZ(
        i,
        pt.x + this.#plasmaOff[i].x,
        pt.y + this.#plasmaOff[i].y,
        pt.z + this.#plasmaOff[i].z,
      );
    }
    positions.needsUpdate = true;
  }
}
