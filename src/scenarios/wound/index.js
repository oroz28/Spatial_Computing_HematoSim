import * as THREE from "three";
import { RBCSystem } from "../../entities/rbc.js";
import { WoundZone } from "./woundZone.js";
import { PlateletSystem } from "./platelet.js";
import { FibrinMesh } from "./fribinMesh.js";
import { Narrator } from "../../shared/narrator.js";
import { wrapT } from "../../utils/math.js";
import {
  WOUND_RBC_ESCAPE_MAX,
  WOUND_RBC_ATTRACT_WINDOW,
  WOUND_RBC_REACH_DIST,
} from "../../utils/constants.js";

const PHASE = {
  IDLE: "IDLE",
  APPROACHING: "APPROACHING",
  DAMAGE: "DAMAGE",
  ACTIVATION: "ACTIVATION",
  AGGREGATION: "AGGREGATION",
  FIBRIN: "FIBRIN",
  STABLE: "STABLE",
};

const STOP_T_DISTANCE = 0.04;
const WOUND_AHEAD_T = 0.09;

const RBC_DRIFT_SPEED = 1.0;
const RBC_HIDE_DIST = 5.5;

const PLATELET_ACTIVATION_THRESHOLD = 6;
const PLATELET_AGGREGATION_THRESHOLD = 20;
const FIBRIN_STABLE_THRESHOLD = 0.65;

const MIN_PHASE_TIME = {
  [PHASE.DAMAGE]: 5.0,
  [PHASE.ACTIVATION]: 7.0,
  [PHASE.AGGREGATION]: 12.0,
  [PHASE.FIBRIN]: 12.0,
  [PHASE.STABLE]: Infinity,
};

const PHASE_LABEL = {
  [PHASE.APPROACHING]: "VASCULAR BREACH",
  [PHASE.DAMAGE]: "PHASE I · VASCULAR DAMAGE",
  [PHASE.ACTIVATION]: "PHASE II · PLATELET ACTIVATION",
  [PHASE.AGGREGATION]: "PHASE III · PLATELET PLUG",
  [PHASE.FIBRIN]: "PHASE IV · FIBRIN NETWORK",
  [PHASE.STABLE]: "PHASE V · STABLE CLOT",
};

const PHASE_LIST = [
  PHASE_LABEL[PHASE.APPROACHING],
  PHASE_LABEL[PHASE.DAMAGE],
  PHASE_LABEL[PHASE.ACTIVATION],
  PHASE_LABEL[PHASE.AGGREGATION],
  PHASE_LABEL[PHASE.FIBRIN],
  PHASE_LABEL[PHASE.STABLE],
];

const PHASE_TEXT = {
  [PHASE.APPROACHING]: [
    "A breach is forming in the vessel wall ahead. Beneath the endothelium lies collagen, a powerful activator of the coagulation cascade.",
  ],
  [PHASE.DAMAGE]: [
    "The wall has ruptured. Blood pressure is pushing red cells through the breach, watch them drift toward the opening.",
  ],
  [PHASE.ACTIVATION]: [
    "Platelets have detected the exposed collagen. They are changing shape and releasing chemical signals to recruit more.",
  ],
  [PHASE.AGGREGATION]: [
    "Activated platelets are binding to the collagen and to each other, forming a primary plug. The haemorrhage is slowing.",
    "Each new platelet amplifies the chemical alarm, a positive feedback loop accelerating plug formation.",
  ],
  [PHASE.FIBRIN]: [
    "Thrombin is converting fibrinogen into fibrin strands. Watch the network grow around the platelet plug.",
    "The fibrin strands cross-link, reinforcing the clot into a stable structure.",
  ],
  [PHASE.STABLE]: [
    "The clot is stable. Bleeding has stopped completely.",
    "From breach to stable clot in under a minute, this is haemostasis.",
  ],
};

const FOG_HEALTHY = new THREE.Color(0x8b0000);
const FOG_WOUND = new THREE.Color(0x5a0808);
const FOG_LERP = new THREE.Color();

// Class representing the wound scenario. It manages the simulation of a vascular breach, including the behavior of platelets and fibrin mesh formation,
// as well as the interactions with red blood cells.
export class WoundScenario {
  rbcSystem = null;
  bloodstream = null;

  onCameraStop = null;
  onCameraResume = null;
  onCameraLookAt = null;
  currentCameraT = null;

  onHUDPhasesReady = null;
  onHUDPhaseChange = null;

  #scene = null;
  #narrator = null;
  #ui = null;
  #curve = null;

  #wound = null;
  #platelets = null;
  #fibrin = null;

  #phase = PHASE.IDLE;
  #phaseTimer = 0;
  #woundIntensity = 0;
  #fibrinGrowth = 0;
  #bleedRate = 0;
  #woundT = 0;
  #woundSize = 1;
  #cameraStopped = false;

  #rbcEscape = new Map();
  #rbcEscapeCount = 0;
  #rbcDummy = new THREE.Object3D();

  // Constructor initializes the scenario with references to the scene, narrator elements, and UI elements.
  constructor(scene, narratorEls, uiEls) {
    this.#scene = scene;
    this.#narrator = new Narrator(narratorEls);
    this.#ui = uiEls;
  }

  get narrator() {
    return this.#narrator;
  }

  // Public method to initialize the scenario with a curve for the bloodstream and a reference to the bloodstream system.
  // Notifies the HUD of the full ordered phase list so it can render all phases from the start.
  init(curve, bloodstream) {
    this.#curve = curve;
    this.bloodstream = bloodstream;
    this.rbcSystem = new RBCSystem(this.#scene, curve);
    this.#fibrin = new FibrinMesh(this.#scene);
    this.#wireButtons();
    this.#setupHUD();
    this.onHUDPhasesReady?.(PHASE_LIST);
  }

  // Public method to register hover targets with the picker. Called from main.js after init().
  // Platelets use a per-instance label based on their current activation state.
  // The wound tear mesh and fibrin are registered dynamically since they only exist after a wound is triggered.
  registerHoverTargets(picker) {
    picker.addInstanced(
      this.rbcSystem.mesh,
      "<b>Red blood cell</b> (erythrocyte)<br>Flowing through the vessel",
    );

    picker.addDynamic(() => {
      if (!this.#platelets) return [];
      return [
        {
          mesh: this.#platelets.mesh,
          label:
            "<b>Platelet</b> (thrombocyte)<br>Activated, sealing the vascular breach",
        },
      ];
    });

    picker.addDynamic(() => {
      if (!this.#wound) return [];
      return [
        {
          mesh: this.#wound.tearMesh,
          label:
            "<b>Vascular breach</b><br>Exposed collagen activating the coagulation cascade",
        },
      ];
    });

    picker.addDynamic(() => {
      if (!this.#fibrin?.proxyMesh) return [];
      return [
        {
          mesh: this.#fibrin.proxyMesh,
          label:
            "<b>Fibrin network</b><br>Cross-linked strands reinforcing the platelet plug",
        },
      ];
    });
  }

  // Public method to update the scenario each frame. It updates the bloodstream, RBC system, and manages the state machine for the wound healing process,
  // including the behavior of platelets, fibrin growth, and interactions with RBCs. It also updates the fog and HUD based on the current state.
  update(delta, { flowSpeed, woundSize = 1, cameraT }) {
    this.#woundSize = woundSize;
    this.bloodstream.update(delta, flowSpeed);
    this.rbcSystem.update(delta, flowSpeed);

    if (this.#phase !== PHASE.IDLE) this.#phaseTimer += delta;

    switch (this.#phase) {
      case PHASE.IDLE:
        break;

      case PHASE.APPROACHING: {
        const dt = Math.abs(cameraT - this.#woundT);
        const tDist = Math.min(dt, 1 - dt);
        if (tDist < STOP_T_DISTANCE && !this.#cameraStopped) {
          this.#cameraStopped = true;
          this.onCameraStop?.();
          this.onCameraLookAt?.(this.#wound.woundPos);
          this.#enterPhase(PHASE.DAMAGE);
        }
        break;
      }

      case PHASE.DAMAGE:
        this.#woundIntensity = Math.min(this.#woundIntensity + delta * 1.2, 1);
        if (this.bloodstream?.tubeMaterial) {
          this.bloodstream.tubeMaterial.opacity = Math.max(
            0.98 - this.#woundIntensity * 0.55,
            0.43,
          );
        }
        this.#bleedRate = 1;
        this.#updateRBCEscape(delta);
        if (this.#phaseTimer >= MIN_PHASE_TIME[PHASE.DAMAGE])
          this.#enterPhase(PHASE.ACTIVATION);
        break;

      case PHASE.ACTIVATION:
        this.#platelets?.activateNearWound(this.#wound.woundPos, true);
        this.#bleedRate = 0.85;
        this.#updateRBCEscape(delta);
        if (
          this.#platelets?.adherCount >= PLATELET_ACTIVATION_THRESHOLD &&
          this.#phaseTimer >= MIN_PHASE_TIME[PHASE.ACTIVATION]
        )
          this.#enterPhase(PHASE.AGGREGATION);
        break;

      case PHASE.AGGREGATION:
        this.#platelets?.activateNearWound(this.#wound.woundPos, true);
        this.#bleedRate = Math.max(
          0,
          1 - (this.#platelets?.adherCount ?? 0) / 30,
        );
        if (
          this.#platelets?.adherCount >= PLATELET_AGGREGATION_THRESHOLD &&
          this.#phaseTimer >= MIN_PHASE_TIME[PHASE.AGGREGATION]
        )
          this.#enterPhase(PHASE.FIBRIN);
        break;

      case PHASE.FIBRIN:
        this.#platelets?.activateNearWound(this.#wound.woundPos, false);
        this.#bleedRate = 0;
        this.#fibrinGrowth = Math.min(this.#fibrinGrowth + delta * 0.018, 1);
        if (this.#platelets?.adheredPositions.length > 0)
          this.#fibrin.setOrigin(this.#platelets.adheredPositions);
        if (
          this.#fibrinGrowth >= FIBRIN_STABLE_THRESHOLD &&
          this.#phaseTimer >= MIN_PHASE_TIME[PHASE.FIBRIN]
        )
          this.#enterPhase(PHASE.STABLE);
        break;

      case PHASE.STABLE:
        this.#bleedRate = 0;
        this.#fibrinGrowth = Math.min(this.#fibrinGrowth + delta * 0.008, 1);
        if (this.#platelets?.adheredPositions.length > 0)
          this.#fibrin.setOrigin(this.#platelets.adheredPositions);
        if (this.bloodstream?.tubeMaterial) {
          this.bloodstream.tubeMaterial.opacity = 0.98;
        }
        break;
    }

    this.#wound?.update(this.#woundIntensity, this.#bleedRate, delta);
    this.#platelets?.update(delta, flowSpeed);
    this.#fibrin.update(this.#fibrinGrowth, delta);
    this.#updateFog();
    this.#updateHUD();
    // this.#scene.fog.color.set(FOG_HEALTHY);
    // this.#scene.background.copy(FOG_HEALTHY);
  }

  destroy() {
    this.#narrator.reset();
    this.#wound?.destroy();
    this.#platelets?.destroy();
    this.#fibrin?.destroy();
  }

  // Private method to update the behavior of red blood cells escaping through the wound.
  // Phase 1 (attraction): while the RBC has not yet reached the wound opening, it steers toward woundPos.
  // Phase 2 (escape): once close enough to the wound, it follows woundNormal outward.
  #updateRBCEscape(delta) {
    if (!this.#wound) return;
    const woundPos = this.#wound.woundPos;
    const woundNormal = this.#wound.woundNormal;
    const mat4 = new THREE.Matrix4();

    for (let i = 0; i < this.rbcSystem.count; i++) {
      let entry = this.#rbcEscape.get(i);

      if (!entry) {
        if (this.#rbcEscapeCount >= WOUND_RBC_ESCAPE_MAX) continue;
        const t = this.rbcSystem.getT(i);
        const dt = Math.abs(t - this.#woundT);
        const tDist = Math.min(dt, 1 - dt);
        if (tDist > WOUND_RBC_ATTRACT_WINDOW) continue;

        this.rbcSystem.mesh.getMatrixAt(i, mat4);
        const pos = new THREE.Vector3().setFromMatrixPosition(mat4);
        entry = { pos: pos.clone(), done: false, reachedWound: false };
        this.#rbcEscape.set(i, entry);
        this.#rbcEscapeCount++;
      }

      if (entry.done) continue;

      let driftDir;

      if (!entry.reachedWound) {
        const toWound = new THREE.Vector3()
          .subVectors(woundPos, entry.pos)
          .normalize();
        driftDir = toWound;
        if (entry.pos.distanceTo(woundPos) < WOUND_RBC_REACH_DIST) {
          entry.reachedWound = true;
        }
      } else {
        const spread = ((i % 5) - 2) * 0.18;
        driftDir = new THREE.Vector3(
          woundNormal.x + spread * 0.15,
          woundNormal.y + spread * 0.08,
          woundNormal.z + spread * 0.15,
        ).normalize();
      }

      entry.pos.addScaledVector(driftDir, RBC_DRIFT_SPEED * delta);

      this.#rbcDummy.position.copy(entry.pos);
      this.#rbcDummy.scale.set(1, 0.45, 1);
      this.#rbcDummy.updateMatrix();
      this.rbcSystem.mesh.setMatrixAt(i, this.#rbcDummy.matrix);
      this.rbcSystem.mesh.instanceMatrix.needsUpdate = true;

      if (entry.pos.distanceTo(woundPos) > RBC_HIDE_DIST) {
        entry.done = true;
        this.#rbcEscapeCount = Math.max(0, this.#rbcEscapeCount - 1);
        this.#rbcDummy.scale.setScalar(0.001);
        this.#rbcDummy.updateMatrix();
        this.rbcSystem.mesh.setMatrixAt(i, this.#rbcDummy.matrix);
        this.rbcSystem.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // Private method to enter a new phase, resetting the timer, updating the narrator, HUD stats, and HUD phase tracker.
  #enterPhase(phase) {
    this.#phase = phase;
    this.#phaseTimer = 0;
    const label = PHASE_LABEL[phase];
    const texts = PHASE_TEXT[phase];
    if (texts?.length > 0) {
      this.#narrator.setPhase(label);
      this.#narrator.show();
      this.#narrator.queueText(texts[0]);
      for (let i = 1; i < texts.length; i++) {
        setTimeout(() => this.#narrator.queueText(texts[i]), i * 9000);
      }
    }
    if (this.#ui?.statPhase) this.#ui.statPhase.textContent = label ?? phase;

    const idx = PHASE_LIST.indexOf(label);
    this.onHUDPhaseChange?.(PHASE_LIST, idx);

    if (phase === PHASE.STABLE) {
      setTimeout(() => {
        this.onCameraResume?.();
        if (this.#ui?.btnInfect) {
          this.#ui.btnInfect.disabled = false;
          this.#ui.btnInfect.textContent = "🩸 New Wound";
        }
      }, 4000);
    }
  }

  // Sets up the HUD elements for the scenario, such as the infect button and phase display.
  #setupHUD() {
    if (this.#ui?.btnInfect) {
      this.#ui.btnInfect.textContent = "🩸 Trigger Wound";
      this.#ui.btnInfect.disabled = false;
    }
    this.#ui?.btnResume?.classList.add("hidden");
    this.#ui?.btnRestart?.classList.add("hidden");
    if (this.#ui?.slSpawn) {
      this.#ui.slSpawn.closest(".control-group").style.display = "none";
    }
  }

  // Private method to wire up the event listeners for the buttons in the HUD.
  #wireButtons() {
    const ui = this.#ui;
    if (!ui?.btnInfect) return;
    ui.btnInfect.addEventListener("click", () => {
      if (
        this.#phase === PHASE.APPROACHING ||
        (this.#phase !== PHASE.IDLE && this.#phase !== PHASE.STABLE)
      )
        return;
      if (this.#phase === PHASE.STABLE) {
        this.#fullReset();
        return;
      }

      const camT = this.currentCameraT?.() ?? 0;
      this.#woundT = wrapT(camT + WOUND_AHEAD_T);

      this.#wound = new WoundZone(
        this.#scene,
        this.#curve,
        this.#woundT,
        this.#woundSize,
      );
      this.#platelets = new PlateletSystem(
        this.#scene,
        this.#curve,
        this.#woundSize,
      );
      this.#platelets.setWoundTarget(this.#wound.woundPos);

      this.#cameraStopped = false;
      this.#rbcEscape.clear();
      this.#rbcEscapeCount = 0;

      ui.btnInfect.disabled = true;
      ui.btnInfect.textContent = "🩸 Approaching…";
      this.#enterPhase(PHASE.APPROACHING);
    });

    // ui.btnPause?.addEventListener("click", () => {
    //   if (ui.btnPause.textContent.includes("Pause")) {
    //     this.onCameraStop?.();
    //     ui.btnPause.textContent = "▶ Resume";
    //   } else {
    //     this.onCameraResume?.();
    //     ui.btnPause.textContent = "⏸ Pause";
    //   }
    // });
  }

  // Private method to reset the scenario to its initial state. It destroys the wound, platelets, and fibrin mesh, resets all relevant properties, and updates the UI.
  #fullReset() {
    this.#wound?.destroy();
    this.#platelets?.destroy();
    this.#fibrin?.reset();

    this.#wound = null;
    this.#platelets = null;
    this.#fibrin = new FibrinMesh(this.#scene);
    this.#cameraStopped = false;
    this.#rbcEscape.clear();
    this.#rbcEscapeCount = 0;

    this.#phase = PHASE.IDLE;
    this.#phaseTimer = 0;
    this.#woundIntensity = 0;
    this.#fibrinGrowth = 0;
    this.#bleedRate = 0;

    if (this.bloodstream?.tubeMaterial) {
      this.bloodstream.tubeMaterial.opacity = 0.98;
    }

    this.#scene.fog.color.copy(FOG_HEALTHY);
    this.#scene.background.copy(FOG_HEALTHY);

    this.onHUDPhaseChange?.(PHASE_LIST, -1);

    this.#narrator.reset();
    if (this.#ui?.btnInfect) {
      this.#ui.btnInfect.disabled = false;
      this.#ui.btnInfect.textContent = "🩸 Trigger Wound";
    }
  }

  #updateFog() {
    const t =
      this.#phase === PHASE.IDLE
        ? 0
        : Math.min(this.#woundIntensity * 0.5, 0.5);
    FOG_LERP.lerpColors(FOG_HEALTHY, FOG_WOUND, t);
    this.#scene.fog.color.copy(FOG_LERP);
    this.#scene.background.copy(FOG_LERP);
  }

  #updateHUD() {
    if (this.#ui?.statWBC)
      this.#ui.statWBC.textContent = this.#platelets?.adherCount ?? 0;
    if (this.#ui?.statKills)
      this.#ui.statKills.textContent = `${Math.round(this.#fibrinGrowth * 100)}%`;
  }
}
