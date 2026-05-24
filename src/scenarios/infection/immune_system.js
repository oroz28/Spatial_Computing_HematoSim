import { WBC } from "../../entities/wbc.js";
import { Bacterium } from "../../entities/bacteria.js";
import { Spawner } from "./spawner.js";
import {
  WBC_COUNT,
  BACTERIA_MAX,
  BACTERIA_SPAWN_INTERVAL,
  INFECTION_DECAY,
} from "../../utils/constants.js";
import { clamp, wrapT } from "../../utils/math.js";

export const SIM_PHASE = {
  IDLE: "IDLE",
  OBSERVING: "OBSERVING",
  RESPONSE: "RESPONSE",
  RESOLVED: "RESOLVED",
};

export const OBS_STEP = {
  BACTERIA_SPAWNING: "BACTERIA_SPAWNING",
  WBC_SPAWNING: "WBC_SPAWNING",
  WBC_DETECTING: "WBC_DETECTING",
  WBC_CHASING: "WBC_CHASING",
  WBC_ATTACKING: "WBC_ATTACKING",
  KILL_CONFIRMED: "KILL_CONFIRMED",
  OBSERVATION_DONE: "OBSERVATION_DONE",
};

const OBS_STEP_ORDER = [
  OBS_STEP.BACTERIA_SPAWNING,
  OBS_STEP.WBC_SPAWNING,
  OBS_STEP.WBC_DETECTING,
  OBS_STEP.WBC_CHASING,
  OBS_STEP.WBC_ATTACKING,
  OBS_STEP.KILL_CONFIRMED,
  OBS_STEP.OBSERVATION_DONE,
];

const MIN_NARRATION_TIME = {
  [OBS_STEP.BACTERIA_SPAWNING]: 2.0,
  [OBS_STEP.WBC_SPAWNING]: 2.0,
  [OBS_STEP.WBC_DETECTING]: 1.5,
  [OBS_STEP.WBC_CHASING]: 2.0,
  [OBS_STEP.WBC_ATTACKING]: 1.5,
  [OBS_STEP.KILL_CONFIRMED]: 1.0,
  [OBS_STEP.OBSERVATION_DONE]: Infinity,
};

const BACTERIA_SPAWN_AHEAD_MIN = 0.04;
const BACTERIA_SPAWN_AHEAD_MAX = 0.14;

const BACTERIA_MIN_ACTIVE = 2;
const BACTERIA_MAX_ACTIVE = 5;

const RESPONSE_DURATION_SECONDS = 30;

const WBC_NEAR_CAMERA_COUNT = 3;
const BACTERIA_STAGGER_INTERVAL = 1.5;
const BACTERIA_INTRO_COUNT = 3;
const WBC_SPAWN_DELAY = 0.5;
const WBC_STAGGER_INTERVAL = 0.7;

const RELAY_BEHIND_MIN = 0.015;
const RELAY_BEHIND_MAX = 0.035;

// Class representing the immune system simulation for the infection scenario.
// It manages the state of bacteria and white blood cells (WBCs), handles the progression of the simulation through different phases,
// and provides methods to start, pause, and reset the simulation.
export class ImmuneSystem {
  bacteria = [];
  wbcs = [];
  infectionLevel = 0;
  phase = SIM_PHASE.IDLE;
  paused = false;

  onPhaseChange = null;
  onObsStepChange = null;
  onKillEvent = null;
  onAutoResume = null;
  onResolved = null;

  #scene = null;
  #curve = null;
  #spawner = null;

  #killCount = 0;
  #resolvedTimer = 0;
  #anchorT = 0;

  #obsStep = OBS_STEP.BACTERIA_SPAWNING;
  #obsStepTimer = 0;
  #obsKillDone = false;

  #bacteriaSpawned = 0;
  #bacteriaTimer = 0;
  #wbcSpawnStarted = false;
  #wbcNearSpawned = 0;
  #wbcTimer = 0;
  #wbcDelayTimer = 0;

  #responseTimer = 0;
  #responseSpawnActive = true;
  #resolvedFired = false;

  constructor(scene, curve) {
    this.#scene = scene;
    this.#curve = curve;
    this.#spawner = new Spawner(scene, curve);

    for (let i = 0; i < WBC_COUNT; i++) {
      const wbc = new WBC(scene, curve);
      wbc.onKill = () => this.#handleKill();
      wbc.mesh.visible = false;
      this.wbcs.push(wbc);
    }
  }

  // Public method to start the observation phase of the simulation.
  // It initializes the state for observing an infection, spawns the first bacterium, and sets up timers for subsequent spawns and WBC appearances.
  startObservation(cameraT = 0) {
    if (this.phase !== SIM_PHASE.IDLE) return;
    this.#anchorT = cameraT;
    this.phase = SIM_PHASE.OBSERVING;
    this.#resetObsState();
    this.onPhaseChange?.(SIM_PHASE.OBSERVING);
    this.onObsStepChange?.(OBS_STEP.BACTERIA_SPAWNING);
  }

  resumeJourney() {
    if (this.phase !== SIM_PHASE.OBSERVING) return;
    this.#transitionToResponse(this.#anchorT);
  }

  restartObservation(cameraT = 0) {
    for (const b of this.bacteria) {
      if (b.alive) b.destroy(this.#scene);
    }
    this.bacteria = [];
    this.#killCount = 0;
    this.#anchorT = cameraT;
    for (const wbc of this.wbcs) {
      wbc.mesh.visible = false;
      wbc.teleportTo(this.#curve, Math.random());
    }
    if (this.phase !== SIM_PHASE.OBSERVING) {
      this.phase = SIM_PHASE.OBSERVING;
      this.onPhaseChange?.(SIM_PHASE.OBSERVING);
    }
    this.#resetObsState();
    this.onObsStepChange?.(OBS_STEP.BACTERIA_SPAWNING);
  }

  fullReset() {
    for (const b of this.bacteria) {
      if (b.alive) b.destroy(this.#scene);
    }
    this.bacteria = [];
    this.#killCount = 0;
    this.infectionLevel = 0;
    for (const wbc of this.wbcs) {
      wbc.mesh.visible = false;
      wbc.teleportTo(this.#curve, Math.random());
    }
    this.phase = SIM_PHASE.IDLE;
    this.#resetObsState();
    this.#responseSpawnActive = true;
    this.#responseTimer = 0;
    this.#resolvedFired = false;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  // Public method to update the simulation state. It advances the simulation based on the current phase, updates bacteria and WBCs, and manages infection level.
  update(delta, { flowSpeed, spawnRate, cameraT = null }) {
    if (this.paused) return;
    const anchor = cameraT ?? this.#anchorT;

    switch (this.phase) {
      case SIM_PHASE.IDLE:
        break;
      case SIM_PHASE.OBSERVING:
        this.#updateObserving(delta, flowSpeed, anchor);
        break;
      case SIM_PHASE.RESPONSE:
        this.#updateResponse(delta, flowSpeed, spawnRate, anchor);
        break;
      case SIM_PHASE.RESOLVED:
        this.#updateResolved(delta, flowSpeed);
        break;
    }

    for (const b of this.bacteria) b.update(delta, flowSpeed);
    this.bacteria = this.bacteria.filter((b) => b.alive);

    const raw = this.bacteria.length / BACTERIA_MAX;
    this.infectionLevel = clamp(
      this.infectionLevel +
        (raw - this.infectionLevel) * 0.05 -
        INFECTION_DECAY * delta,
      0,
      1,
    );
  }

  // Private method to update the OBSERVING phase. It manages the timers for spawning bacteria and WBCs,
  // advances through the observation steps based on conditions, and updates WBC visibility and behavior according to the current step.
  #updateObserving(delta, flowSpeed, anchorT) {
    this.#obsStepTimer += delta;

    if (this.#bacteriaSpawned < BACTERIA_INTRO_COUNT) {
      this.#bacteriaTimer -= delta;
      if (this.#bacteriaTimer <= 0) {
        this.#spawnOneBacterium(anchorT);
        this.#bacteriaSpawned++;
        this.#bacteriaTimer = BACTERIA_STAGGER_INTERVAL;
      }
    }

    if (this.#bacteriaSpawned >= 1 && !this.#wbcSpawnStarted) {
      this.#wbcDelayTimer += delta;
      if (this.#wbcDelayTimer >= WBC_SPAWN_DELAY) {
        this.#wbcSpawnStarted = true;
        this.#wbcTimer = 0;
      }
    }

    if (this.#wbcSpawnStarted && this.#wbcNearSpawned < WBC_NEAR_CAMERA_COUNT) {
      this.#wbcTimer -= delta;
      if (this.#wbcTimer <= 0) {
        this.#materialiseWBC(this.#wbcNearSpawned, anchorT, true);
        this.#wbcNearSpawned++;
        this.#wbcTimer = WBC_STAGGER_INTERVAL;
      }
    }

    switch (this.#obsStep) {
      case OBS_STEP.BACTERIA_SPAWNING:
        this.#updateWBCsVisible(delta, flowSpeed, false);
        if (
          this.#bacteriaSpawned >= 1 &&
          this.#obsStepTimer >= MIN_NARRATION_TIME[OBS_STEP.BACTERIA_SPAWNING]
        )
          this.#advanceStep();
        break;
      case OBS_STEP.WBC_SPAWNING:
        this.#updateWBCsVisible(delta, flowSpeed, false);
        if (
          this.#wbcNearSpawned >= 1 &&
          this.#obsStepTimer >= MIN_NARRATION_TIME[OBS_STEP.WBC_SPAWNING]
        )
          this.#advanceStep();
        break;
      case OBS_STEP.WBC_DETECTING:
        this.#updateWBCsVisible(delta, flowSpeed, true);
        if (
          this.wbcs.some(
            (w) =>
              w.mesh.visible &&
              (w.stateLabel === "CHASE" || w.stateLabel === "ATTACK"),
          ) &&
          this.#obsStepTimer >= MIN_NARRATION_TIME[OBS_STEP.WBC_DETECTING]
        )
          this.#advanceStep();
        break;
      case OBS_STEP.WBC_CHASING:
        this.#updateWBCsVisible(delta, flowSpeed, true);
        if (
          this.wbcs.some((w) => w.mesh.visible && w.stateLabel === "ATTACK") &&
          this.#obsStepTimer >= MIN_NARRATION_TIME[OBS_STEP.WBC_CHASING]
        )
          this.#advanceStep();
        break;
      case OBS_STEP.WBC_ATTACKING:
        this.#updateWBCsVisible(delta, flowSpeed, true);
        if (
          this.#obsKillDone &&
          this.#obsStepTimer >= MIN_NARRATION_TIME[OBS_STEP.WBC_ATTACKING]
        )
          this.#advanceStep();
        break;
      case OBS_STEP.KILL_CONFIRMED:
        this.#updateWBCsVisible(delta, flowSpeed, true);
        if (this.#obsStepTimer >= MIN_NARRATION_TIME[OBS_STEP.KILL_CONFIRMED]) {
          this.#advanceStep();
          this.#transitionToResponse(anchorT);
        }
        break;
      case OBS_STEP.OBSERVATION_DONE:
        this.#updateWBCsVisible(delta, flowSpeed, false);
        break;
    }
  }

  // Private method to update the RESPONSE phase. It manages the spawning of new bacteria, updates WBC behavior to hunt bacteria,
  // and checks for the end condition of the response phase (no more bacteria and low infection level) to transition to RESOLVED.
  #updateResponse(delta, flowSpeed, spawnRate, cameraT) {
    if (this.#responseSpawnActive) {
      this.#responseTimer += delta;

      const liveBacteria = this.bacteria.filter((b) => b.alive).length;

      const needsTopUp = liveBacteria < BACTERIA_MIN_ACTIVE;
      const underCap = liveBacteria < BACTERIA_MAX_ACTIVE;

      if (underCap || needsTopUp) {
        const interval = needsTopUp
          ? BACTERIA_SPAWN_INTERVAL * 0.4
          : BACTERIA_SPAWN_INTERVAL;

        const prevCount = this.bacteria.length;
        this.#spawner.update(
          delta,
          spawnRate,
          this.bacteria,
          interval,
          cameraT,
          BACTERIA_SPAWN_AHEAD_MIN,
          BACTERIA_SPAWN_AHEAD_MAX,
        );

        if (this.bacteria.length > prevCount) {
          this.#relayWBCToCamera(cameraT);
        }
      }

      if (this.#responseTimer >= RESPONSE_DURATION_SECONDS) {
        this.#responseSpawnActive = false;
        this.onPhaseChange?.("DRAINING");
      }
    }

    this.#updateWBCsVisible(delta, flowSpeed, true);

    if (
      !this.#responseSpawnActive &&
      this.bacteria.length === 0 &&
      this.infectionLevel < 0.02
    ) {
      this.phase = SIM_PHASE.RESOLVED;
      this.onPhaseChange?.(SIM_PHASE.RESOLVED);
    }
  }

  // Private method to update the RESOLVED phase. It increments a timer and fires the onResolved callback after a delay, while keeping WBCs visible but not hunting.
  #updateResolved(delta, flowSpeed) {
    this.#resolvedTimer += delta;
    this.#updateWBCsVisible(delta, flowSpeed, false);
    if (this.#resolvedTimer > 2 && !this.#resolvedFired) {
      this.#resolvedFired = true;
      this.onResolved?.();
    }
  }

  // Private method to teleport a patrolling WBC to a position behind the camera,
  // used to ensure the user always has some WBC presence during the RESPONSE phase.
  // It checks for nearby active WBCs to avoid overcrowding, and selects a candidate from the patrolling WBCs that is furthest from the camera to teleport.
  #relayWBCToCamera(cameraT) {
    const nearbyActive = this.wbcs.some((w) => {
      if (!w.mesh.visible) return false;
      const wt = this.#estimateWBCt(w);
      const dt = Math.abs(wt - cameraT);
      return Math.min(dt, 1 - dt) < 0.1;
    });
    if (nearbyActive) return;

    let candidate = null,
      maxDist = -1;
    for (const wbc of this.wbcs) {
      if (wbc.stateLabel !== "PATROL") continue;
      const wt = this.#estimateWBCt(wbc);
      const dt = Math.abs(wt - cameraT);
      const d = Math.min(dt, 1 - dt);
      if (d > maxDist) {
        maxDist = d;
        candidate = wbc;
      }
    }
    if (!candidate) return;

    const behindT = wrapT(
      cameraT -
        RELAY_BEHIND_MIN -
        Math.random() * (RELAY_BEHIND_MAX - RELAY_BEHIND_MIN),
    );
    candidate.teleportTo(this.#curve, behindT);
    candidate.mesh.visible = true;
    this.#scaleIn(candidate);
  }

  #estimateWBCt(wbc) {
    let best = 0,
      bestDist = Infinity;
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      const pt = this.#curve.getPointAt(t);
      const d = pt.distanceToSquared(wbc.position);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  // Private method to transition from the OBSERVING phase to the RESPONSE phase.
  // It spawns any remaining WBCs that haven't been materialized yet, sets timers and flags for the response phase, and updates the phase state.
  #transitionToResponse(cameraT) {
    const remaining = WBC_COUNT - this.#wbcNearSpawned;
    for (let i = 0; i < remaining; i++) {
      const idx = this.#wbcNearSpawned + i;
      if (idx >= this.wbcs.length) break;
      const t = (i + 1) / (remaining + 1);
      this.#materialiseWBC(idx, t, false, true);
    }

    this.#responseTimer = 0;
    this.#responseSpawnActive = true;
    this.#resolvedFired = false;
    this.#resolvedTimer = 0;

    this.phase = SIM_PHASE.RESPONSE;
    this.onAutoResume?.();
    this.onPhaseChange?.(SIM_PHASE.RESPONSE);
  }

  // Private method to spawn a single bacterium at a position ahead of the camera.
  // It calculates the spawn position based on the anchorT and random offsets, and adds the new bacterium to the simulation.
  #spawnOneBacterium(anchorT) {
    const types = ["COCCUS", "BACILLUS", "SPIRILLA"];
    const offset =
      BACTERIA_SPAWN_AHEAD_MIN +
      (this.#bacteriaSpawned / BACTERIA_INTRO_COUNT) *
        (BACTERIA_SPAWN_AHEAD_MAX - BACTERIA_SPAWN_AHEAD_MIN);
    this.bacteria.push(
      new Bacterium(
        this.#scene,
        this.#curve,
        types[this.#bacteriaSpawned % 3],
        wrapT(anchorT + offset),
      ),
    );
  }

  // Private method to materialize a WBC at a specific position along the curve.
  // It can place the WBC either behind or ahead of the camera, and can use an absolute T value if needed.

  #materialiseWBC(wbcIndex, anchorT, behind = true, absoluteT = false) {
    const wbc = this.wbcs[wbcIndex];
    if (!wbc) return;
    let t;
    if (absoluteT) t = anchorT;
    else if (behind) t = wrapT(anchorT - 0.03 - wbcIndex * 0.025);
    else t = wrapT(anchorT + 0.05 + Math.random() * 0.15);
    wbc.teleportTo(this.#curve, t);
    wbc.mesh.visible = true;
    this.#scaleIn(wbc);
  }

  // Private method to scale in a WBC with a simple animation. It starts the WBC at a small scale and grows it to full size over 400 milliseconds.
  #scaleIn(wbc) {
    wbc.mesh.scale.setScalar(0.01);
    const start = performance.now();
    const grow = () => {
      const s = Math.min((performance.now() - start) / 400, 1);
      wbc.mesh.scale.setScalar(s);
      if (s < 1) requestAnimationFrame(grow);
      else wbc.mesh.scale.setScalar(1);
    };
    requestAnimationFrame(grow);
  }

  // Private method to update the visibility and behavior of WBCs based on the current observation step. It can enable hunting behavior for the WBCs if needed.
  #updateWBCsVisible(delta, flowSpeed, huntEnabled) {
    const targets = huntEnabled ? this.bacteria.filter((b) => b.alive) : [];
    for (const wbc of this.wbcs) {
      if (!wbc.mesh.visible) continue;
      wbc.update(delta, flowSpeed, targets, this.#scene);
    }
  }

  // Private method to advance to the next observation step. It checks the current step against the defined order and moves to the next one, resetting timers and flags as needed.
  #advanceStep() {
    const idx = OBS_STEP_ORDER.indexOf(this.#obsStep);
    const next = OBS_STEP_ORDER[idx + 1];
    if (!next) return;
    this.#obsStep = next;
    this.#obsStepTimer = 0;
    this.onObsStepChange?.(next);
  }

  #resetObsState() {
    this.#obsStep = OBS_STEP.BACTERIA_SPAWNING;
    this.#obsStepTimer = 0;
    this.#obsKillDone = false;
    this.#bacteriaSpawned = 0;
    this.#bacteriaTimer = 0;
    this.#wbcSpawnStarted = false;
    this.#wbcNearSpawned = 0;
    this.#wbcTimer = 0;
    this.#wbcDelayTimer = 0;
  }

  #handleKill() {
    this.#killCount++;
    this.#obsKillDone = true;
    this.onKillEvent?.(this.#killCount);
  }

  get activeWBCs() {
    return this.wbcs.filter((w) => w.mesh.visible && w.stateLabel !== "PATROL")
      .length;
  }
  get killCount() {
    return this.#killCount;
  }
  get currentObsStep() {
    return this.#obsStep;
  }
}
