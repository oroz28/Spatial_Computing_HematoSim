import * as THREE from "three";
import { RBCSystem } from "../../entities/rbc.js";
import { AlveoliZone } from "./alveoliZone.js";
import { O2Particles } from "./o2Particles.js";
import { RBCColorSystem } from "./rbcColorSystem.js";
import { Narrator } from "../../shared/narrator.js";
import { CellTracker } from "../../shared/cell_tracker.js";
import {
  O2_ZONE_START,
  O2_ZONE_END,
  RBC_COUNT,
} from "../../utils/constants.js";

export const OXY_PHASE = {
  IDLE: "IDLE",
  OBSERVING: "OBSERVING",
  CIRCULATING: "CIRCULATING",
};

export const OXY_STEP = {
  ENTERING_CAPILLARY: "ENTERING_CAPILLARY",
  WALL_DIFFUSION: "WALL_DIFFUSION",
  RBC_ABSORBING: "RBC_ABSORBING",
  COLOR_CHANGE: "COLOR_CHANGE",
  CIRCULATION: "CIRCULATION",
  DEOXY_RETURN: "DEOXY_RETURN",
};

const OXY_STEP_ORDER = [
  OXY_STEP.ENTERING_CAPILLARY,
  OXY_STEP.WALL_DIFFUSION,
  OXY_STEP.RBC_ABSORBING,
  OXY_STEP.COLOR_CHANGE,
  OXY_STEP.CIRCULATION,
  OXY_STEP.DEOXY_RETURN,
];

const MIN_STEP_TIME = {
  [OXY_STEP.ENTERING_CAPILLARY]: 3.5,
  [OXY_STEP.WALL_DIFFUSION]: 3.0,
  [OXY_STEP.RBC_ABSORBING]: 2.5,
  [OXY_STEP.COLOR_CHANGE]: 3.0,
  [OXY_STEP.CIRCULATION]: 0,
  [OXY_STEP.DEOXY_RETURN]: 0,
};

const STEP_TEXT = {
  [OXY_STEP.ENTERING_CAPILLARY]:
    "You are approaching the pulmonary capillaries, the thinnest blood vessels, where the wall is only one cell thick. Oxygen from the lungs diffuses inward here.",
  [OXY_STEP.WALL_DIFFUSION]:
    "You are inside the alveolar capillary zone. The cyan spheres emerging from the wall are O₂ molecules diffusing inward under concentration gradient.",
  [OXY_STEP.RBC_ABSORBING]:
    "A red blood cell has absorbed an O₂ molecule. Haemoglobin binds it instantly, the cell will carry it to every tissue in the body.",
  [OXY_STEP.COLOR_CHANGE]:
    "Watch the colour shift: deoxygenated cells arrive as deep blue-purple, and turn bright arterial red as haemoglobin reaches full saturation.",
  [OXY_STEP.CIRCULATION]:
    "Oxygenated cells are now leaving the zone bright red. Notice how the cells ahead are still arriving blue, the contrast shows the exchange in real time.",
  [OXY_STEP.DEOXY_RETURN]:
    "As cells travel away from the lungs and deliver oxygen to tissues, they gradually darken back to blue-purple, ready for the next pass through the capillaries.",
};

const PHASE_TEXT = {
  [OXY_PHASE.CIRCULATING]: [
    "The oxygen exchange cycle is now continuous. Blue-purple cells enter, bright red cells leave, every circuit through the lungs refreshes their load.",
    "Each red blood cell makes this round trip roughly once per minute, delivering oxygen to every organ before returning here.",
  ],
};

const PHASE_LABEL = {
  [OXY_PHASE.OBSERVING]: "PHASE I - PULMONARY CAPILLARY",
  [OXY_PHASE.CIRCULATING]: "PHASE II - CIRCULATION",
};

const PHASE_LIST = [
  PHASE_LABEL[OXY_PHASE.OBSERVING],
  PHASE_LABEL[OXY_PHASE.CIRCULATING],
];

const FOG_BASE = new THREE.Color(0x8b0000);
const FOG_LUNG = new THREE.Color(0x3a1a2e);
const FOG_LERP = new THREE.Color();

const _oxyThresholds = { HIGH: 0.7, LOW: 0.2 };

const TRACK_COLOR_HIGHLIGHT = new THREE.Color(0xffffff);

// OxygenScenario manages the entire oxygen exchange experience, including the state of the simulation, the narrative flow,
// and the interactions with the camera and HUD. It coordinates the RBC system, oxygen particles, alveoli zone effects, and the tracking of individual cells.
// The scenario progresses through defined phases and steps, each with specific conditions for advancement and associated narrative text.
export class OxygenScenario {
  rbcSystem = null;
  bloodstream = null;

  onCameraStop = null;
  onCameraResume = null;
  onCameraLookAt = null;
  currentCameraT = null;

  onHUDPhasesReady = null;
  onHUDPhaseChange = null;

  onTrackingStart = null;
  getCamera = null;

  #scene = null;
  #narrator = null;
  #ui = null;
  #curve = null;

  #alveoli = null;
  #o2 = null;
  #colorSys = null;

  #phase = OXY_PHASE.IDLE;
  #step = OXY_STEP.ENTERING_CAPILLARY;
  #stepTimer = 0;

  #wasInZone = false;
  #zoneIntensity = 0;
  #deoxyFired = false;

  #tracker = null;
  #trackedInstanceId = null;
  #trackedOrigColor = new THREE.Color();
  #trackingPanelEl = null;
  #mat4 = new THREE.Matrix4();

  // Constructor initializes the OxygenScenario with references to the scene, narrator elements, and UI elements.
  // It sets up the necessary components for the scenario, including the RBC system, alveoli zone, oxygen particles, and color system.
  constructor(scene, narratorEls, uiEls) {
    this.#scene = scene;
    this.#narrator = new Narrator(narratorEls);
    this.#ui = uiEls;
  }

  get narrator() {
    return this.#narrator;
  }

  // Initializes the scenario with the given curve and bloodstream. It sets up the RBC system, alveoli zone, oxygen particles, and color system.
  init(curve, bloodstream) {
    this.#curve = curve;
    this.bloodstream = bloodstream;
    this.rbcSystem = new RBCSystem(this.#scene, curve);

    this.#alveoli = new AlveoliZone(this.#scene, curve);
    this.#o2 = new O2Particles(this.#scene, curve);
    this.#colorSys = new RBCColorSystem(this.rbcSystem);

    this.#wireButtons();
    this.#setupHUD();
    this.#buildTrackingPanel();
    this.onHUDPhasesReady?.(PHASE_LIST);
  }

  // Hover over this class for usage of CellTracker, which manages the camera's position and orientation to follow a specific cell in the scene.
  registerHoverTargets(picker) {
    picker.addInstancedFn(this.rbcSystem.mesh, (instanceId) => {
      const t = this.rbcSystem.getT(instanceId);
      const inZone = t >= O2_ZONE_START && t <= O2_ZONE_END;
      const oxy = this.#colorSys.getOxyFactor(instanceId);
      if (inZone)
        return "<b>Red blood cell</b> (erythrocyte)<br>Inside exchange zone, absorbing O₂";
      if (oxy >= _oxyThresholds.HIGH)
        return "<b>Red blood cell</b> (erythrocyte)<br>Oxygenated, carrying O₂ to tissues";
      if (oxy >= _oxyThresholds.LOW)
        return "<b>Red blood cell</b> (erythrocyte)<br>Partially oxygenated";
      return "<b>Red blood cell</b> (erythrocyte)<br>Deoxygenated, returning to lungs";
    });

    picker.addDynamic(() => {
      if (!this.#o2?.active || !this.#o2.mesh.visible) return [];
      return [
        {
          mesh: this.#o2.mesh,
          label:
            "<b>Oxygen molecule</b> (O₂)<br>Diffusing inward through the capillary wall",
        },
      ];
    });
  }

  // Public method to update the scenario each frame. It updates the bloodstream, RBC system, alveoli zone intensity, oxygen particles,
  // and color system based on the camera's position and the current phase of the scenario.
  update(delta, { flowSpeed, cameraT }) {
    this.bloodstream.update(delta, flowSpeed);
    this.rbcSystem.update(delta, flowSpeed);

    const inZone = cameraT >= O2_ZONE_START && cameraT <= O2_ZONE_END;

    const intensityTarget = inZone ? 1 : 0;
    this.#zoneIntensity +=
      (intensityTarget - this.#zoneIntensity) * 3.0 * delta;
    this.#alveoli.setIntensity(this.#zoneIntensity, delta);

    this.#o2.active = this.#zoneIntensity > 0.15;
    const rbcPositions = this.#getRBCPositions();
    this.#o2.update(delta, flowSpeed, rbcPositions);

    this.#colorSys.setZoneActive(this.#zoneIntensity > 0.2);
    this.#colorSys.update(delta);

    const justExited = this.#wasInZone && !inZone;
    this.#wasInZone = inZone;

    if (this.#phase === OXY_PHASE.OBSERVING) {
      this.#updateObserving(delta, cameraT, inZone, justExited);
    }

    if (
      this.#phase === OXY_PHASE.CIRCULATING &&
      justExited &&
      !this.#deoxyFired
    ) {
      this.#deoxyFired = true;
      this.#narrator.queueText(STEP_TEXT[OXY_STEP.DEOXY_RETURN]);
      setTimeout(() => {
        this.#deoxyFired = false;
      }, 20000);
    }

    if (this.#tracker?.active && this.#trackedInstanceId !== null) {
      this.#tracker.update(delta);
      this.#highlightTrackedRBC();
      this.#updateTrackingHUD();
    }

    this.#updateFog(this.#zoneIntensity);
    this.#updateHUD();
  }

  destroy() {
    this.#narrator.reset();
    this.#alveoli?.destroy();
    this.#o2?.destroy();
    this.#colorSys?.destroy();
    this.#stopTracking();
    this.#trackingPanelEl?.remove();
  }

  // Builds the tracking panel UI for when the user chooses to track a specific RBC. It creates a panel with a badge to display the RBC's oxygen
  // saturation and status, and a button to stop tracking.
  #buildTrackingPanel() {
    const panel = document.createElement("div");
    panel.id = "tracking-panel-oxy";
    panel.style.cssText = `
      position: fixed;
      bottom: 140px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      z-index: 200;
      pointer-events: none;
    `;

    const badge = document.createElement("div");
    badge.id = "tracking-badge-oxy";
    badge.style.cssText = `
      background: rgba(0,0,0,0.72);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px;
      padding: 6px 14px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #fdb;
      text-align: center;
      white-space: pre;
      line-height: 1.6;
    `;
    panel.appendChild(badge);

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "✕ Stop tracking";
    stopBtn.style.cssText = `
      pointer-events: all;
      background: rgba(0,0,0,0.65);
      border: 1px solid rgba(255,160,80,0.55);
      border-radius: 5px;
      color: #fdb;
      font-size: 11px;
      letter-spacing: 0.08em;
      padding: 4px 12px;
      cursor: pointer;
      font-family: 'Courier New', monospace;
    `;
    stopBtn.addEventListener("click", () => this.#stopTracking());
    panel.appendChild(stopBtn);

    document.body.appendChild(panel);
    this.#trackingPanelEl = panel;
  }

  // Starts tracking a random RBC by attaching the camera to it using CellTracker.
  // It updates the UI to reflect the tracking state and disables the track button while active.
  #startTracking() {
    const cam = this.getCamera?.();
    if (!cam) return;

    const id = Math.floor(Math.random() * RBC_COUNT);
    this.#trackedInstanceId = id;

    if (!this.#tracker) this.#tracker = new CellTracker(cam);

    this.#tracker.follow({
      getPosition: () => {
        this.rbcSystem.mesh.getMatrixAt(this.#trackedInstanceId, this.#mat4);
        return new THREE.Vector3().setFromMatrixPosition(this.#mat4);
      },
    });

    this.onTrackingStart?.(true);
    this.#trackingPanelEl.style.display = "flex";

    if (this.#ui.btnTrackRBC) {
      this.#ui.btnTrackRBC.style.opacity = "0.4";
      this.#ui.btnTrackRBC.setAttribute("disabled", "");
    }
  }

  // Stops tracking the currently tracked RBC, if any, and resets the UI state accordingly.
  #stopTracking() {
    if (this.#trackedInstanceId !== null) {
      this.rbcSystem.setInstanceColor(
        this.#trackedInstanceId,
        this.#trackedOrigColor,
      );
      this.rbcSystem.flushColors();
    }

    this.#tracker?.stop();
    this.#trackedInstanceId = null;

    this.onTrackingStart?.(false);
    if (this.#trackingPanelEl) this.#trackingPanelEl.style.display = "none";

    if (this.#ui.btnTrackRBC) {
      this.#ui.btnTrackRBC.style.opacity = "";
      this.#ui.btnTrackRBC.removeAttribute("disabled");
    }
  }

  // Highlights the currently tracked RBC by changing its color based on its oxygen saturation level.
  // It creates a pulsing highlight effect to make the tracked cell stand out visually.
  #highlightTrackedRBC() {
    const id = this.#trackedInstanceId;
    if (id === null) return;

    const pulse = 0.55 + 0.45 * Math.sin(Date.now() * 0.006);
    const oxy = this.#colorSys.getOxyFactor(id);

    const base = new THREE.Color();
    base.lerpColors(new THREE.Color(0x493273), new THREE.Color(0xff1111), oxy);
    const highlight = base.clone().lerp(TRACK_COLOR_HIGHLIGHT, pulse * 0.6);
    this.rbcSystem.setInstanceColor(id, highlight);
    this.rbcSystem.flushColors();
  }

  // Updates the tracking HUD with the current status of the tracked RBC, including its oxygen saturation level, whether it's in the exchange zone,
  // and its overall status.
  #updateTrackingHUD() {
    const badge = this.#trackingPanelEl?.querySelector("#tracking-badge-oxy");
    if (!badge || this.#trackedInstanceId === null) return;

    const id = this.#trackedInstanceId;
    const t = this.rbcSystem.getT(id);
    const oxy = this.#colorSys.getOxyFactor(id);
    const inZone = t >= O2_ZONE_START && t <= O2_ZONE_END;

    const oxyPct = Math.round(oxy * 100);
    const bar =
      "█".repeat(Math.round(oxy * 10)) + "░".repeat(10 - Math.round(oxy * 10));

    let status;
    if (inZone) status = "⬆ ABSORBING O₂";
    else if (oxy >= 0.7) status = "● OXYGENATED";
    else if (oxy >= 0.2) status = "◐ PARTIAL";
    else status = "○ DEOXYGENATED";

    const lines = [
      "🩸 TRACKING · RED BLOOD CELL",
      `O₂ SAT  [${bar}] ${oxyPct}%`,
      `STATUS  ${status}`,
      `ZONE    ${inZone ? "▶ PULMONARY CAPILLARY" : "SYSTEMIC CIRCULATION"}`,
    ];

    badge.textContent = lines.join("\n");
  }

  // Handles the camera stopping event, which occurs when the user clicks to stop the camera's automatic movement.
  // It sets the appropriate flags and stores the current camera orientation for resuming later.
  #updateObserving(delta, cameraT, inZone, justExited) {
    this.#stepTimer += delta;

    switch (this.#step) {
      case OXY_STEP.ENTERING_CAPILLARY:
        if (
          inZone &&
          this.#stepTimer >= MIN_STEP_TIME[OXY_STEP.ENTERING_CAPILLARY]
        )
          this.#advanceStep();
        break;
      case OXY_STEP.WALL_DIFFUSION:
        if (
          this.#o2.active &&
          this.#stepTimer >= MIN_STEP_TIME[OXY_STEP.WALL_DIFFUSION]
        )
          this.#advanceStep();
        break;
      case OXY_STEP.RBC_ABSORBING:
        if (
          this.#o2.absorbedTotal >= 1 &&
          this.#stepTimer >= MIN_STEP_TIME[OXY_STEP.RBC_ABSORBING]
        )
          this.#advanceStep();
        break;
      case OXY_STEP.COLOR_CHANGE:
        if (
          this.#colorSys.oxygenatedFraction >= 0.08 &&
          this.#stepTimer >= MIN_STEP_TIME[OXY_STEP.COLOR_CHANGE]
        )
          this.#advanceStep();
        break;
      case OXY_STEP.CIRCULATION:
        if (justExited) {
          this.#advanceStep();
          this.#transitionToCirculating();
        }
        break;
      case OXY_STEP.DEOXY_RETURN:
        break;
    }
  }

  // Advances the scenario to the next step in the observing phase, resetting the step timer and queuing the associated narrative text for the new step.
  #advanceStep() {
    const idx = OXY_STEP_ORDER.indexOf(this.#step);
    const next = OXY_STEP_ORDER[idx + 1];
    if (!next) return;
    this.#step = next;
    this.#stepTimer = 0;
    const text = STEP_TEXT[next];
    if (text) this.#narrator.queueText(text);
  }

  // Transitions the scenario to the circulating phase, updating the UI and narrative to reflect the new phase of continuous oxygen exchange in the bloodstream.
  #transitionToCirculating() {
    this.#phase = OXY_PHASE.CIRCULATING;
    this.#deoxyFired = false;
    this.#ui.btnResume?.classList.add("hidden");
    this.#narrator.setPhase(PHASE_LABEL[OXY_PHASE.CIRCULATING]);

    const idx = PHASE_LIST.indexOf(PHASE_LABEL[OXY_PHASE.CIRCULATING]);
    this.onHUDPhaseChange?.(PHASE_LIST, idx);

    const lines = PHASE_TEXT[OXY_PHASE.CIRCULATING];
    this.#narrator.queueText(lines[0]);
    setTimeout(() => this.#narrator.queueText(lines[1]), 7000);
  }

  #setupHUD() {
    if (this.#ui.btnInfect) {
      this.#ui.btnInfect.textContent = "🫁 Begin Observation";
      this.#ui.btnInfect.disabled = false;
    }
    this.#ui.btnRestart?.classList.add("hidden");
  }

  #updateHUD() {
    const pct = Math.round(this.#colorSys.oxygenatedFraction * 100);
    if (this.#ui.statPhase) this.#ui.statPhase.textContent = this.#phase;
    if (this.#ui.statWBC) this.#ui.statWBC.textContent = `${pct}%`;
    if (this.#ui.statKills)
      this.#ui.statKills.textContent = this.#o2.absorbedTotal;
  }

  #updateFog(zoneIntensity) {
    FOG_LERP.lerpColors(FOG_BASE, FOG_LUNG, zoneIntensity * 0.6);
    this.#scene.fog.color.copy(FOG_LERP);
    this.#scene.background.copy(FOG_LERP);
    this.#scene.fog.far = 28 + zoneIntensity * 6;
  }

  // Sets up the event listeners for the UI buttons related to the scenario, such as starting the observation, pausing, and tracking RBCs.
  #wireButtons() {
    const ui = this.#ui;

    ui.btnInfect?.addEventListener("click", () => {
      if (this.#phase !== OXY_PHASE.IDLE) return;
      this.#phase = OXY_PHASE.OBSERVING;
      this.#step = OXY_STEP.ENTERING_CAPILLARY;
      this.#stepTimer = 0;

      ui.btnInfect.disabled = true;
      ui.btnInfect.textContent = "🫁 Observing…";

      this.#narrator.setPhase(PHASE_LABEL[OXY_PHASE.OBSERVING]);
      this.#narrator.show();
      this.#narrator.queueText(STEP_TEXT[OXY_STEP.ENTERING_CAPILLARY]);

      const idx = PHASE_LIST.indexOf(PHASE_LABEL[OXY_PHASE.OBSERVING]);
      this.onHUDPhaseChange?.(PHASE_LIST, idx);
    });

    ui.btnPause?.addEventListener("click", () => {
      if (this.#phase === OXY_PHASE.OBSERVING) this.#transitionToCirculating();
    });

    if (ui.btnTrackRBC) {
      ui.btnTrackRBC.addEventListener("click", () => {
        if (this.#tracker?.active) this.#stopTracking();
        else this.#startTracking();
      });
    }
  }

  #getRBCPositions() {
    const positions = [];
    const sys = this.rbcSystem;
    const mat = new THREE.Matrix4();
    for (let i = 0; i < sys.count; i++) {
      const t = sys.getT(i);
      if (t < O2_ZONE_START - 0.05 || t > O2_ZONE_END + 0.05) continue;
      sys.mesh.getMatrixAt(i, mat);
      positions.push(new THREE.Vector3().setFromMatrixPosition(mat));
    }
    return positions;
  }
}
