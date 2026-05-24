import * as THREE from "three";

const FOLLOW_DIST = 3.2;
const FOLLOW_HEIGHT = 1.1;
const LERP_POS = 6.0;
const LERP_ROT = 7.0;

// CellTracker is a utility class that manages the camera to follow a specific cell (like a WBC or bacteria) in the scene.
// It smoothly interpolates the camera's position and rotation to create a cinematic tracking effect.
export class CellTracker {
  active = false;

  #camera = null;
  #target = null;
  #smoothPos = new THREE.Vector3();
  #smoothQuat = new THREE.Quaternion();
  #initialized = false;

  constructor(camera) {
    this.#camera = camera;
  }

  // Sets the target cell to follow and activates the tracker. It also resets the initialization state to ensure smooth interpolation from the current camera position.
  follow(descriptor) {
    this.#target = descriptor;
    this.active = true;
    this.#initialized = false;
  }

  stop() {
    this.active = false;
    this.#target = null;
    this.#initialized = false;
  }

  // The update method is called on each frame to adjust the camera's position and orientation based on the target cell's current position and movement.
  // It calculates the desired camera position and rotation to keep the target cell in view, and smoothly interpolates towards those values for a cinematic effect.
  update(delta) {
    if (!this.active || !this.#target) return false;

    const cellPos = this.#target.getPosition();
    if (!cellPos) return false;

    let lookDir;
    const chaseTarget = this.#target.getTarget?.();
    const forward = this.#target.getForward?.();

    if (chaseTarget) {
      lookDir = new THREE.Vector3()
        .subVectors(chaseTarget, cellPos)
        .normalize();
    } else if (forward && forward.lengthSq() > 0.001) {
      lookDir = forward.clone().normalize();
    } else {
      lookDir = new THREE.Vector3(0, 0, -1);
    }

    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3()
      .crossVectors(lookDir, worldUp)
      .normalize();
    const up = new THREE.Vector3().crossVectors(right, lookDir).normalize();

    const desiredPos = cellPos
      .clone()
      .addScaledVector(lookDir, -FOLLOW_DIST)
      .addScaledVector(up, FOLLOW_HEIGHT);

    const lookAt = cellPos.clone().addScaledVector(up, 0.3);
    const desiredDir = new THREE.Vector3()
      .subVectors(lookAt, desiredPos)
      .normalize();
    const desiredQuat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      desiredDir,
    );

    if (!this.#initialized) {
      this.#smoothPos.copy(desiredPos);
      this.#smoothQuat.copy(desiredQuat);
      this.#initialized = true;
    }

    const posAlpha = Math.min(LERP_POS * delta, 1);
    const rotAlpha = Math.min(LERP_ROT * delta, 1);
    this.#smoothPos.lerp(desiredPos, posAlpha);
    this.#smoothQuat.slerp(desiredQuat, rotAlpha);

    this.#camera.position.copy(this.#smoothPos);
    this.#camera.quaternion.copy(this.#smoothQuat);

    return true;
  }
}
