import * as THREE from "three";
import {
  CAM_FOV,
  CAM_NEAR,
  CAM_FAR,
  CAM_SPEED_DEFAULT,
  CAM_MOUSE_STRENGTH,
} from "../utils/constants.js";
import { wrapT } from "../utils/math.js";

// Class responsible for controlling the camera's position and orientation along a predefined curve. It allows for smooth movement, stopping/resuming,
// and mouse-based look direction adjustments to create an immersive experience as the camera follows the flow of the scene.
export class CameraController {
  camera = null;
  t = 0;
  stopped = false;

  #curve = null;
  #mouseX = 0;
  #mouseY = 0;
  #camLight = null;
  #pos = new THREE.Vector3();
  #target = new THREE.Vector3();
  #qBase = new THREE.Quaternion();

  #speedFactor = 1;
  #easeTarget = 1;
  #EASE_SPEED = 2.5;

  #LOOK_AHEAD = 0.03;
  #CAM_Y_OFFSET = 0.3;

  // Smooth look-at state
  #lookAtTarget = null;
  #lookAtAlpha = 0;
  #lookAtDuration = 0.8;
  #lookAtElapsed = 0;
  #qLookAt = new THREE.Quaternion();

  // Resume look state
  #resuming = false;
  #resumeElapsed = 0;
  #resumeDuration = 0.9;
  #qResumeFrom = new THREE.Quaternion();

  // When a CellTracker is active it writes the camera itself; this flag
  // prevents CameraController from overwriting that work.
  #cellTrackerActive = false;

  constructor(scene, curve) {
    this.#curve = curve;

    this.camera = new THREE.PerspectiveCamera(
      CAM_FOV,
      window.innerWidth / window.innerHeight,
      CAM_NEAR,
      CAM_FAR,
    );

    this.#camLight = new THREE.PointLight(0xff6644, 1.8, 14);
    scene.add(this.#camLight);

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    window.addEventListener("mousemove", (e) => {
      this.#mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      this.#mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    window.addEventListener(
      "touchmove",
      (e) => {
        this.#mouseX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        this.#mouseY = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }

  // Enables or disables the CellTracker mode, which allows an external CellTracker to take control of the camera. 
  // When enabled, the CellTracker will manage the camera's position and orientation to follow a specific cell in the scene, 
  // while still allowing the main CameraController to advance along the curve for smooth transitions back to normal mode when tracking is stopped.
  setCellTracking(active) {
    this.#cellTrackerActive = active;
    if (!active) {
      this.#snapTtoCameraPos();
      this.#qResumeFrom.copy(this.camera.quaternion);
      this.#resuming = true;
      this.#resumeElapsed = 0;
      this.#easeTarget = 1;
      this.stopped = false;
    }
  }

  // When exiting CellTracker mode, this method snaps the camera's position along the curve to the closest point to avoid jarring jumps.
  #snapTtoCameraPos() {
    const pos = this.camera.position;
    let best = 0,
      bestDist = Infinity;
    for (let i = 0; i < 200; i++) {
      const t = i / 200;
      const d = this.#curve.getPointAt(t).distanceToSquared(pos);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    this.t = best;
  }

  // Standard controls to stop and resume the camera movement along the curve. 
  // Stopping freezes the camera in place, while resuming smoothly transitions it back to following the curve.
  stop() {
    this.stopped = true;
    this.#easeTarget = 0;
  }

  resume() {
    this.stopped = false;
    this.#easeTarget = 1;
    this.#lookAtTarget = null;
    this.#qResumeFrom.copy(this.camera.quaternion);
    this.#resuming = true;
    this.#resumeElapsed = 0;
  }

  smoothLookAt(worldPos, duration = 0.8) {
    this.#lookAtTarget = worldPos.clone();
    this.#lookAtDuration = duration;
    this.#lookAtElapsed = 0;
    this.#lookAtAlpha = 0;
    this.#resuming = false;
    this.#qLookAt.copy(this.camera.quaternion);
  }

  update(delta, flowSpeed) {
    if (this.#cellTrackerActive) {
      const effective = CAM_SPEED_DEFAULT * Math.sqrt(flowSpeed) * 1.2;
      this.t = wrapT(this.t + effective * delta);
      this.#camLight.position.copy(this.camera.position);
      return;
    }

    this.#speedFactor +=
      (this.#easeTarget - this.#speedFactor) * this.#EASE_SPEED * delta;

    const effective =
      CAM_SPEED_DEFAULT * Math.sqrt(flowSpeed) * 1.2 * this.#speedFactor;
    this.t = wrapT(this.t + effective * delta);

    const tAhead = wrapT(this.t + this.#LOOK_AHEAD);

    this.#curve.getPointAt(this.t, this.#pos);
    this.#pos.y += this.#CAM_Y_OFFSET;
    this.camera.position.copy(this.#pos);

    this.#curve.getPointAt(tAhead, this.#target);
    this.#target.y += this.#CAM_Y_OFFSET;

    const lookDir = new THREE.Vector3()
      .subVectors(this.#target, this.#pos)
      .normalize();

    this.#qBase.setFromUnitVectors(new THREE.Vector3(0, 0, -1), lookDir);

    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(this.#qBase);
    const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(this.#qBase);

    const qRight = new THREE.Quaternion().setFromAxisAngle(
      upAxis,
      -this.#mouseX * CAM_MOUSE_STRENGTH,
    );
    const qUp = new THREE.Quaternion().setFromAxisAngle(
      rightAxis,
      this.#mouseY * CAM_MOUSE_STRENGTH,
    );

    const qCurve = new THREE.Quaternion()
      .copy(this.#qBase)
      .premultiply(qRight)
      .premultiply(qUp);

    if (this.#lookAtTarget) {
      this.#lookAtElapsed += delta;
      const t = Math.min(this.#lookAtElapsed / this.#lookAtDuration, 1);
      const ease = t * t * (3 - 2 * t);

      const toWound = new THREE.Vector3()
        .subVectors(this.#lookAtTarget, this.#pos)
        .normalize();
      const qWound = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1),
        toWound,
      );

      this.camera.quaternion.slerpQuaternions(this.#qLookAt, qWound, ease);

      if (t >= 1) this.#lookAtTarget = null;
    } else if (this.stopped) {
      // frozen
    } else if (this.#resuming) {
      this.#resumeElapsed += delta;
      const t = Math.min(this.#resumeElapsed / this.#resumeDuration, 1);
      const ease = t * t * (3 - 2 * t);
      this.camera.quaternion.slerpQuaternions(this.#qResumeFrom, qCurve, ease);
      if (t >= 1) this.#resuming = false;
    } else {
      this.camera.quaternion.copy(qCurve);
    }

    this.#camLight.position.copy(this.#pos);
  }
}
