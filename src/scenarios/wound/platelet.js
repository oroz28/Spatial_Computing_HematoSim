import * as THREE from "three";
import { TUBE_RADIUS, RBC_SPEED_BASE } from "../../utils/constants.js";
import { randomInTube, wrapT, randFloat } from "../../utils/math.js";

const PLATELET_COUNT = 80;
const DISC_RADIUS = 0.32;
const DISC_HEIGHT = 0.08;
const CHASE_SPEED = 2.0;
const BASE_DETECT_RADIUS = 7.0;
const BASE_ADHERE_RADIUS = 0.9;

const STATE = { FLOWING: 0, ACTIVATED: 1, ADHERED: 2 };

const COLOR_FLOWING = new THREE.Color(0xffe8b0);
const COLOR_ACTIVATED = new THREE.Color(0xffdd00);
const COLOR_ADHERED = new THREE.Color(0xff7700);

// Class representing the system of platelets in the wound scenario.
// Platelets flow with the blood, can be activated when near the wound, and then chase and adhere to the wound site.
// woundSize scales the detection and adhesion radii proportionally so larger wounds attract platelets from further away.
export class PlateletSystem {
  adherCount = 0;

  #scene = null;
  #curve = null;
  #mesh = null;
  #dummy = new THREE.Object3D();

  #detectRadius = BASE_DETECT_RADIUS;
  #adhereRadius = BASE_ADHERE_RADIUS;

  #state = new Uint8Array(PLATELET_COUNT);
  #t = new Float32Array(PLATELET_COUNT);
  #speeds = new Float32Array(PLATELET_COUNT);
  #radOff = [];
  #worldPos = [];
  #target = null;

  #adheredPositions = [];

  // Constructor initializes the platelet system with a curve to follow, creates an instanced mesh for the platelets,
  // and sets up the initial positions and speeds of the platelets.
  // woundSize is applied to the detection and adhesion radii so the platelet response scales with wound severity.
  constructor(scene, curve, woundSize = 1) {
    this.#scene = scene;
    this.#curve = curve;
    this.#detectRadius = BASE_DETECT_RADIUS * woundSize;
    this.#adhereRadius = BASE_ADHERE_RADIUS * woundSize;

    const geo = new THREE.CylinderGeometry(
      DISC_RADIUS,
      DISC_RADIUS,
      DISC_HEIGHT,
      12,
    );

    const mat = new THREE.MeshStandardMaterial({
      color: COLOR_FLOWING,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
      roughness: 0.4,
      metalness: 0.1,
    });

    this.#mesh = new THREE.InstancedMesh(geo, mat, PLATELET_COUNT);
    this.#mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#mesh.frustumCulled = false;
    scene.add(this.#mesh);

    for (let i = 0; i < PLATELET_COUNT; i++) {
      this.#mesh.setColorAt(i, COLOR_FLOWING);
    }
    this.#mesh.instanceColor.needsUpdate = true;

    for (let i = 0; i < PLATELET_COUNT; i++) {
      this.#state[i] = STATE.FLOWING;
      this.#t[i] = Math.random();
      this.#speeds[i] = randFloat(0.7, 1.3);
      const tan = curve.getTangentAt(this.#t[i]);
      this.#radOff.push(randomInTube(tan, TUBE_RADIUS * 0.75));
      this.#worldPos.push(new THREE.Vector3());
    }

    this.#dummy.scale.setScalar(0.01);
    this.#dummy.updateMatrix();
    for (let i = 0; i < PLATELET_COUNT; i++) {
      this.#mesh.setMatrixAt(i, this.#dummy.matrix);
    }
    this.#mesh.instanceMatrix.needsUpdate = true;
  }

  // Functions to set the wound target position, activate platelets near the wound, and update the state of the platelets each frame.
  setWoundTarget(pos) {
    this.#target = pos.clone();
  }

  get mesh() {
    return this.#mesh;
  }

  // Activates platelets that are within the (woundSize-scaled) detection radius of the wound.
  activateNearWound(woundPos, active) {
    if (!active) return;
    let colourDirty = false;
    for (let i = 0; i < PLATELET_COUNT; i++) {
      if (this.#state[i] !== STATE.FLOWING) continue;
      if (this.#worldPos[i].distanceTo(woundPos) < this.#detectRadius) {
        this.#state[i] = STATE.ACTIVATED;
        this.#mesh.setColorAt(i, COLOR_ACTIVATED);
        colourDirty = true;
      }
    }
    if (colourDirty) this.#mesh.instanceColor.needsUpdate = true;
  }

  get adheredPositions() {
    return this.#adheredPositions;
  }

  // Update function to be called each frame. It updates the position and state of each platelet based on whether they are flowing, activated, or adhered.
  update(delta, flowSpeed) {
    for (let i = 0; i < PLATELET_COUNT; i++) {
      switch (this.#state[i]) {
        case STATE.FLOWING: {
          this.#t[i] = wrapT(
            this.#t[i] + RBC_SPEED_BASE * this.#speeds[i] * flowSpeed * delta,
          );
          const pt = this.#curve.getPointAt(this.#t[i]);
          const tan = this.#curve.getTangentAt(this.#t[i]);
          this.#worldPos[i].copy(pt).add(this.#radOff[i]);
          this.#dummy.position.copy(this.#worldPos[i]);
          this.#dummy.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            tan,
          );
          this.#dummy.scale.set(1, 1, 1);
          this.#dummy.updateMatrix();
          this.#mesh.setMatrixAt(i, this.#dummy.matrix);
          break;
        }

        case STATE.ACTIVATED: {
          if (!this.#target) break;
          const dir = new THREE.Vector3()
            .subVectors(this.#target, this.#worldPos[i])
            .normalize();
          this.#worldPos[i].addScaledVector(dir, CHASE_SPEED * delta);
          this.#dummy.position.copy(this.#worldPos[i]);
          this.#dummy.rotation.y += delta * 6;
          this.#dummy.scale.setScalar(
            1.1 + 0.12 * Math.sin(Date.now() * 0.008 + i),
          );
          this.#dummy.updateMatrix();
          this.#mesh.setMatrixAt(i, this.#dummy.matrix);
          if (this.#worldPos[i].distanceTo(this.#target) < this.#adhereRadius) {
            this.#adhere(i);
          }
          break;
        }

        case STATE.ADHERED: {
          const s = 1.0 + 0.06 * Math.sin(Date.now() * 0.004 + i * 0.9);
          this.#dummy.position.copy(this.#worldPos[i]);
          this.#dummy.scale.setScalar(s);
          this.#dummy.updateMatrix();
          this.#mesh.setMatrixAt(i, this.#dummy.matrix);
          break;
        }
      }
    }
    this.#mesh.instanceMatrix.needsUpdate = true;
  }

  #adhere(i) {
    this.#state[i] = STATE.ADHERED;
    this.adherCount++;

    if (this.#target) {
      this.#worldPos[i]
        .copy(this.#target)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * this.#adhereRadius,
            (Math.random() - 0.5) * this.#adhereRadius,
            (Math.random() - 0.5) * this.#adhereRadius,
          ),
        );
    }
    this.#adheredPositions.push(this.#worldPos[i].clone());
    this.#mesh.setColorAt(i, COLOR_ADHERED);
    this.#mesh.instanceColor.needsUpdate = true;
  }

  destroy() {
    this.#scene.remove(this.#mesh);
    this.#mesh.geometry.dispose();
    this.#mesh.material.dispose();
  }
}
