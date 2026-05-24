import * as THREE from "three";
import {
  WBC_RADIUS,
  WBC_SPEED,
  WBC_CHASE_SPEED,
  WBC_DETECT_RADIUS,
  WBC_KILL_RADIUS,
  TUBE_RADIUS,
} from "../utils/constants.js";
import { randomInTube, randFloat } from "../utils/math.js";

const STATE = { PATROL: 0, CHASE: 1, ATTACK: 2 };

// Class representing a white blood cell (WBC) that patrols along the vessel,
// detects nearby bacteria, chases them, and attacks to destroy them. It has a state machine to manage its behavior and visual effects for each state.
export class WBC {
  mesh = null;
  stateLabel = "PATROL";
  onKill = null;

  #state = STATE.PATROL;
  #t = 0;
  #speed = 0;
  #curve = null;
  #target = null;
  #attackTimer = 0;
  #patrolTimer = 0;
  #scene = null;
  #flowSpeed = 1;

  #radOff = new THREE.Vector3();
  #alertLight = null;
  #activeParticles = [];

  #rawT = 0;

  // Constructor initializes the WBC with a curve to follow, creates its mesh and visual effects, and sets up its initial position and state.
  constructor(scene, curve) {
    this.#curve = curve;
    this.#scene = scene;
    this.#rawT = Math.random();
    this.#t = this.#rawT;
    this.#speed = randFloat(0.85, 1.15) * WBC_SPEED;
    this.#refreshRadOff();

    const geo = new THREE.IcosahedronGeometry(WBC_RADIUS, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xddeeff,
      emissive: 0x334466,
      emissiveIntensity: 1.0,
      roughness: 0.3,
      metalness: 0.15,
      transparent: true,
      opacity: 0.95,
    });

    this.mesh = new THREE.Mesh(geo, mat);

    const haloGeo = new THREE.SphereGeometry(WBC_RADIUS * 1.45, 8, 6);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.BackSide,
    });
    this.mesh.add(new THREE.Mesh(haloGeo, haloMat));

    scene.add(this.mesh);

    const ownLight = new THREE.PointLight(0x88bbff, 0.8, 5);
    this.mesh.add(ownLight);

    this.#alertLight = new THREE.PointLight(0xff6600, 0, 7);
    scene.add(this.#alertLight);

    this.#syncPosition();
  }

  // Refreshes the radial offset for the WBC's position around the curve, giving it a wandering effect as it moves along the vessel.
  #refreshRadOff() {
    const tan = this.#curve.getTangentAt(this.#t);
    this.#radOff.copy(randomInTube(tan, TUBE_RADIUS * 0.55));
  }

  // Syncs the WBC's mesh position and orientation based on its current position along the curve and its radial offset.
  // Also updates the alert light's position to match the WBC.
  #syncPosition() {
    const pt = this.#curve.getPointAt(this.#t);
    this.mesh.position.copy(pt).add(this.#radOff);
    this.#alertLight.position.copy(this.mesh.position);
  }

  // Teleports the WBC to a specific position along a given curve. Resets its state to patrol and clears any target or timers.
  // This is mainly used for repositioning the WBC behind the camera so that more inteactions can be observed.
  teleportTo(curve, t) {
    this.#curve = curve;
    this.#rawT = t;
    this.#t = t;
    this.#refreshRadOff();
    this.#syncPosition();
    this.#state = STATE.PATROL;
    this.#target = null;
    this.stateLabel = "PATROL";
  }

  // Patrol behavior where the WBC moves along the curve based on its speed and the flow speed.
  // It also has a subtle pulsing effect and changes color to indicate it's in patrol mode.
  #doPatrol(delta, flowSpeed) {
    const prevFloor = Math.floor(this.#rawT);
    this.#rawT += this.#speed * flowSpeed * delta;
    const newFloor = Math.floor(this.#rawT);

    if (newFloor > prevFloor) this.#refreshRadOff();

    this.#t = this.#rawT - newFloor;
    this.#syncPosition();

    this.#patrolTimer += delta;
    this.mesh.scale.setScalar(1 + 0.06 * Math.sin(this.#patrolTimer * 3));
    this.mesh.material.color.set(0xddeeff);
    this.mesh.material.emissive.set(0x334466);
    this.mesh.material.emissiveIntensity = 1.0;
    this.#alertLight.intensity = 0;
  }

  // Chase behavior where the WBC pursues a target bacterium.
  // It changes its visual appearance to indicate it's in chase mode and moves towards the target. If it gets close enough, it transitions to the attack state.
  #doChase(delta) {
    if (!this.#target?.alive) {
      this.#resetToPatrol();
      return;
    }

    this.mesh.material.color.set(0xffcc66);
    this.mesh.material.emissive.set(0x884400);
    this.mesh.material.emissiveIntensity = 1.2;
    this.#alertLight.color.set(0xff6600);
    this.#alertLight.intensity = 2.0;
    this.#alertLight.position.copy(this.mesh.position);

    const effectiveChaseSpeed = WBC_CHASE_SPEED * this.#flowSpeed;

    const dir = new THREE.Vector3()
      .subVectors(this.#target.position, this.mesh.position)
      .normalize();
    this.mesh.position.addScaledVector(dir, effectiveChaseSpeed * delta);

    this.mesh.scale.setScalar(1.25 + 0.1 * Math.sin(Date.now() * 0.015));
    this.mesh.lookAt(this.#target.position);

    if (
      this.mesh.position.distanceTo(this.#target.position) < WBC_KILL_RADIUS
    ) {
      this.#state = STATE.ATTACK;
      this.#attackTimer = 0;
    }
  }

  // Attack behavior where the WBC performs an attack animation and destroys the target bacterium if it's still alive.
  // It also spawns particles to indicate the kill and resets to patrol after the attack sequence.
  #doAttack(delta, scene) {
    this.#attackTimer += delta;

    if (this.#attackTimer < 0.15) {
      const t = this.#attackTimer / 0.15;
      this.mesh.scale.setScalar(1.25 + t * 1.8);
      this.mesh.material.color.set(0xff2200);
      this.mesh.material.emissive.set(0xff0000);
      this.mesh.material.emissiveIntensity = 2.0;
      this.#alertLight.color.set(0xff0000);
      this.#alertLight.intensity = 4.5;
    } else if (this.#attackTimer < 0.25) {
      if (this.#target?.alive) {
        const killPos = this.#target.position.clone();
        this.#target.destroy(scene);
        this.#spawnDeathParticles(killPos);
        this.onKill?.();
      }
    } else if (this.#attackTimer < 0.6) {
      const t = (this.#attackTimer - 0.25) / 0.35;
      this.mesh.scale.setScalar(3.05 - t * 2.05);
      this.mesh.material.color.set(0xddeeff);
      this.mesh.material.emissive.set(0x334466);
      this.mesh.material.emissiveIntensity = 1.0;
      this.#alertLight.intensity = Math.max(0, 4.5 - t * 4.5);
    } else {
      this.mesh.scale.setScalar(1);
      this.#resetToPatrol();
    }
  }

  #spawnDeathParticles(position) {
    const COUNT = 14;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(COUNT * 3);
    const velArr = [];

    for (let i = 0; i < COUNT; i++) {
      posArr[i * 3] = position.x;
      posArr[i * 3 + 1] = position.y;
      posArr[i * 3 + 2] = position.z;
      velArr.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 3.5,
        ),
      );
    }

    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffdd44,
      size: 0.2,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    });

    const particles = new THREE.Points(geo, mat);
    this.#scene.add(particles);
    this.#activeParticles.push({
      particles,
      geo,
      mat,
      vel: velArr,
      elapsed: 0,
      done: false,
    });
  }

  // Updates the active particles for the death effect, moving them based on their velocities and fading them out over time.
  // Removes them from the scene once they're done.
  #tickParticles(delta) {
    for (const e of this.#activeParticles) {
      if (e.done) continue;
      e.elapsed += delta;
      const t = Math.min(e.elapsed / 0.55, 1);
      e.mat.opacity = 1 - t;
      const pos = e.geo.attributes.position;
      for (let i = 0; i < e.vel.length; i++) {
        pos.setXYZ(
          i,
          pos.getX(i) + e.vel[i].x * delta,
          pos.getY(i) + e.vel[i].y * delta,
          pos.getZ(i) + e.vel[i].z * delta,
        );
        e.vel[i].multiplyScalar(0.92);
      }
      pos.needsUpdate = true;
      if (t >= 1) {
        this.#scene.remove(e.particles);
        e.geo.dispose();
        e.mat.dispose();
        e.done = true;
      }
    }
    this.#activeParticles = this.#activeParticles.filter((e) => !e.done);
  }

  #resetToPatrol() {
    this.#state = STATE.PATROL;
    this.#target = null;
    this.stateLabel = "PATROL";
  }

  // Public method to update the WBC's behavior based on its current state, the flow speed, and the nearby bacteria.
  // It manages the state transitions and calls the appropriate behavior methods for patrol, chase, and attack states.
  // It also updates the particles for visual effects.
  update(delta, flowSpeed, bacteria, scene) {
    this.#flowSpeed = flowSpeed;
    this.#tickParticles(delta);

    switch (this.#state) {
      case STATE.PATROL: {
        this.stateLabel = "PATROL";
        this.#doPatrol(delta, flowSpeed);
        if (bacteria.length === 0) break;
        let nearest = null,
          nearDist = Infinity;
        for (const b of bacteria) {
          const d = this.mesh.position.distanceTo(b.position);
          if (d < WBC_DETECT_RADIUS && d < nearDist) {
            nearDist = d;
            nearest = b;
          }
        }
        if (nearest) {
          this.#state = STATE.CHASE;
          this.#target = nearest;
          this.stateLabel = "CHASE";
        }
        break;
      }
      case STATE.CHASE:
        this.stateLabel = "CHASE";
        this.#doChase(delta);
        break;
      case STATE.ATTACK:
        this.stateLabel = "ATTACK";
        this.#doAttack(delta, scene);
        break;
    }
  }

  get position() {
    return this.mesh.position;
  }

  destroy(scene) {
    for (const e of this.#activeParticles) {
      if (!e.done) {
        scene.remove(e.particles);
        e.geo.dispose();
        e.mat.dispose();
      }
    }
    this.#activeParticles = [];
    this.#alertLight.intensity = 0;
    scene.remove(this.#alertLight);
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
