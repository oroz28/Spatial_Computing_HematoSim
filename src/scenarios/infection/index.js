import * as THREE from "three";
import { RBCSystem } from "../../entities/rbc.js";
import { ImmuneSystem, SIM_PHASE, OBS_STEP } from "./immune_system.js";
import { Narrator } from "../../shared/narrator.js";
import { CellTracker } from "../../shared/cell_tracker.js";

const OBS_NARRATOR = {
  [OBS_STEP.BACTERIA_SPAWNING]:
    "Pathogens are entering the bloodstream. Watch them appear: green spheres (cocci), yellow cylinders (bacilli), purple polyhedra (spirilla).",
  [OBS_STEP.WBC_SPAWNING]:
    "The immune system is responding. White blood cells are materialising, the large glowing white cells arriving from behind the camera.",
  [OBS_STEP.WBC_DETECTING]:
    "A leukocyte has detected a pathogen's chemical signature. It is turning orange, target locked.",
  [OBS_STEP.WBC_CHASING]:
    "Chemotaxis in progress. The white cell is accelerating toward the bacterium, following the molecular gradient in the plasma.",
  [OBS_STEP.WBC_ATTACKING]:
    "Contact. The leukocyte is expanding around the bacterium, phagocytosis beginning.",
  [OBS_STEP.KILL_CONFIRMED]:
    "Elimination confirmed. The pathogen has been destroyed.",
  [OBS_STEP.OBSERVATION_DONE]:
    "White blood cells are now distributed throughout the bloodstream. New pathogens will appear as you travel.",
};

const PHASE_NARRATOR = {
  [SIM_PHASE.RESPONSE]: [
    "The immune response is active across the entire vessel. Leukocytes will engage bacteria as they spawn near you.",
    "Watch for the orange glow of a hunting leukocyte, a kill is imminent.",
  ],
  DRAINING: [
    "The infection is subsiding. No new pathogens are entering the bloodstream.",
  ],
  [SIM_PHASE.RESOLVED]: [
    "All pathogens eliminated. The bloodstream is clean.",
    "The immune system retains memory of this pathogen.",
  ],
};

const PHASE_LABELS = {
  [SIM_PHASE.OBSERVING]: "PHASE I - INFECTION",
  [SIM_PHASE.RESPONSE]: "PHASE II - IMMUNE RESPONSE",
  DRAINING: "INFECTION SUBSIDING",
  [SIM_PHASE.RESOLVED]: "PHASE III - RESOLVED",
};

const PHASE_LIST = [
  PHASE_LABELS[SIM_PHASE.OBSERVING],
  PHASE_LABELS[SIM_PHASE.RESPONSE],
  PHASE_LABELS.DRAINING,
  PHASE_LABELS[SIM_PHASE.RESOLVED],
];

const BACTERIA_TOOLTIP = {
  COCCUS: "<b>Coccus</b><br>Spherical bacterium<br>Gram-positive pathogen",
  BACILLUS: "<b>Bacillus</b><br>Rod-shaped bacterium<br>Spore-forming pathogen",
  SPIRILLA: "<b>Spirilla</b><br>Spiral bacterium<br>Motile pathogen",
};

const WBC_TOOLTIP = {
  PATROL: "<b>Leukocyte (WBC)</b><br>Patrolling, scanning for pathogens",
  CHASE: "<b>Leukocyte (WBC)</b><br>Chemotaxis active, pursuing target",
  ATTACK: "<b>Leukocyte (WBC)</b><br>Phagocytosis, engulfing pathogen",
};

const FOG_HEALTHY = new THREE.Color(0x8b0000);
const FOG_SICK = new THREE.Color(0x2d4a00);
const FOG_LERPED = new THREE.Color();

const TRACK_TYPE_LABEL = {
  wbc: "🔬 TRACKING · LEUKOCYTE",
  bacteria: "🦠 TRACKING · PATHOGEN",
};

// The InfectionScenario class manages the infection simulation, including the immune system response, pathogen behavior, and camera tracking of specific cells.
// It handles the main update loop, user interactions for starting/stopping tracking,
// and updates the HUD with relevant information about the tracked entities and overall simulation state.
export class InfectionScenario {
  immuneSys = null;
  bloodstream = null;
  rbcSystem = null;

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
  #tracker = null;
  #trackType = null;
  #trackedEntity = null;
  #trackingPanelEl = null;

  // Constructor initializes the InfectionScenario with a reference to the scene, a narrator for displaying text, and UI elements for user interaction.
  // It sets up the necessary systems for simulating the infection and immune response, and prepares the tracking panel for monitoring specific cells during the simulation.
  constructor(scene, narratorEls, uiEls) {
    this.#scene = scene;
    this.#narrator = new Narrator(narratorEls);
    this.#ui = uiEls;
  }

  get narrator() {
    return this.#narrator;
  }

  // Initializes the scenario by creating the bloodstream, immune system, and RBC system. It also wires up the necessary callbacks and buttons for user interaction,
  // and builds the tracking panel for monitoring specific cells.
  init(curve, bloodstream) {
    this.bloodstream = bloodstream;
    this.rbcSystem = new RBCSystem(this.#scene, curve);
    this.immuneSys = new ImmuneSystem(this.#scene, curve);

    this.#wireCallbacks();
    this.#wireButtons();
    this.#buildTrackingPanel();
    this.onHUDPhasesReady?.(PHASE_LIST);
  }

  // Hover targets registration for the scenario, allowing the user to hover over specific entities (RBCs, bacteria, WBCs) and see tooltips with information about them.
  registerHoverTargets(picker) {
    picker.addInstanced(
      this.rbcSystem.mesh,
      "<b>Red blood cell</b> (erythrocyte)<br>Carries haemoglobin through the vessel",
    );

    picker.addDynamic(() =>
      this.immuneSys.bacteria
        .filter((b) => b.alive)
        .map((b) => ({
          mesh: b.mesh,
          label: BACTERIA_TOOLTIP[b.type] ?? "<b>Bacterium</b>",
        })),
    );

    picker.addDynamic(() =>
      this.immuneSys.wbcs
        .filter((w) => w.mesh.visible)
        .map((w) => ({
          mesh: w.mesh,
          label: WBC_TOOLTIP[w.stateLabel] ?? "<b>Leukocyte</b>",
        })),
    );
  }

  // Updates the scenario state on each frame, including the immune system, bloodstream, and RBC system.
  // It also handles the cell tracking updates if a tracker is active, and updates the HUD with the current simulation information.
  update(delta, { flowSpeed, spawnRate, cameraT }) {
    this.bloodstream.update(delta, flowSpeed);
    this.rbcSystem.update(delta, flowSpeed);
    this.immuneSys.update(delta, { flowSpeed, spawnRate, cameraT });

    if (this.#tracker?.active) {
      if (
        this.#trackType === "bacteria" &&
        this.#trackedEntity &&
        !this.#trackedEntity.alive
      ) {
        this.#stopTracking();
      } else if (
        this.#trackType === "wbc" &&
        this.#trackedEntity &&
        !this.#trackedEntity.mesh.visible
      ) {
        this.#stopTracking();
      } else {
        this.#tracker.update(delta);
        this.#updateTrackingHUD();
      }
    }

    this.#updateFog(this.immuneSys.infectionLevel);
    this.#updateHUD();
  }

  destroy() {
    this.#narrator.reset();
    this.immuneSys?.fullReset();
    this.#stopTracking();
    this.#trackingPanelEl?.remove();
  }

  // Builds the tracking panel UI element that appears when the user starts tracking a specific cell (WBC or bacteria).
  #buildTrackingPanel() {
    const panel = document.createElement("div");
    panel.id = "tracking-panel";
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
    badge.id = "tracking-badge";
    badge.style.cssText = `
      background: rgba(0,0,0,0.72);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 6px;
      padding: 6px 14px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      letter-spacing: 0.12em;
      color: #aef;
      text-align: center;
      white-space: pre;
      line-height: 1.6;
    `;
    panel.appendChild(badge);

    const stopBtn = document.createElement("button");
    stopBtn.id = "btn-stop-tracking";
    stopBtn.textContent = "✕ Stop tracking";
    stopBtn.style.cssText = `
      pointer-events: all;
      background: rgba(0,0,0,0.65);
      border: 1px solid rgba(255,80,80,0.55);
      border-radius: 5px;
      color: #f88;
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

  // Starts tracking a random WBC or bacteria by attaching the camera to it using CellTracker.
  // It updates the UI to reflect the tracking state and disables the track button while active.
  #startTracking(type) {
    let entity = null;

    if (type === "wbc") {
      const candidates = this.immuneSys.wbcs.filter((w) => w.mesh.visible);
      if (!candidates.length) return;
      entity = candidates[Math.floor(Math.random() * candidates.length)];
    } else {
      const candidates = this.immuneSys.bacteria.filter((b) => b.alive);
      if (!candidates.length) return;
      entity = candidates[Math.floor(Math.random() * candidates.length)];
    }

    if (!entity) return;

    const cam = this.getCamera?.();
    if (!cam) return;

    if (!this.#tracker) this.#tracker = new CellTracker(cam);

    this.#trackedEntity = entity;
    this.#trackType = type;

    if (type === "wbc") {
      this.#tracker.follow({
        getPosition: () => entity.position.clone(),
        getTarget: () => {
          if (entity.stateLabel === "CHASE" || entity.stateLabel === "ATTACK") {
            const bacteria = this.immuneSys.bacteria.filter((b) => b.alive);
            if (!bacteria.length) return null;
            let nearest = null,
              nearDist = Infinity;
            for (const b of bacteria) {
              const d = entity.position.distanceTo(b.position);
              if (d < nearDist) {
                nearDist = d;
                nearest = b;
              }
            }
            return nearest?.position.clone() ?? null;
          }
          return null;
        },
      });
    } else {
      this.#tracker.follow({
        getPosition: () => (entity.alive ? entity.position.clone() : null),
      });
    }

    this.onTrackingStart?.(true);

    this.#trackingPanelEl.style.display = "flex";
    this.#updateTrackingHUD();

    this.#ui.btnTrackWBC?.setAttribute("disabled", "");
    this.#ui.btnTrackBacteria?.setAttribute("disabled", "");
    this.#ui.btnTrackWBC && (this.#ui.btnTrackWBC.style.opacity = "0.4");
    this.#ui.btnTrackBacteria &&
      (this.#ui.btnTrackBacteria.style.opacity = "0.4");
  }

  // Stops tracking the currently tracked cell, if any, and resets the UI state accordingly.
  #stopTracking() {
    if (!this.#tracker?.active) return;
    this.#tracker.stop();
    this.#trackedEntity = null;
    this.#trackType = null;

    this.onTrackingStart?.(false);

    this.#trackingPanelEl.style.display = "none";

    this.#ui.btnTrackWBC?.removeAttribute("disabled");
    this.#ui.btnTrackBacteria?.removeAttribute("disabled");
    this.#ui.btnTrackWBC && (this.#ui.btnTrackWBC.style.opacity = "");
    this.#ui.btnTrackBacteria && (this.#ui.btnTrackBacteria.style.opacity = "");
  }

  // Highlights the currently tracked cell by changing its color based on its state (for WBCs) or just a pulsing effect (for bacteria).
  // It creates a visual effect to make the tracked cell stand out in the scene, making it easier for the user to follow it during the simulation.
  #updateTrackingHUD() {
    const badge = this.#trackingPanelEl?.querySelector("#tracking-badge");
    if (!badge || !this.#trackedEntity) return;

    let lines = [TRACK_TYPE_LABEL[this.#trackType] ?? "TRACKING"];

    if (this.#trackType === "wbc") {
      const w = this.#trackedEntity;
      const state = w.stateLabel ?? "PATROL";
      const stateColor =
        state === "ATTACK" ? "🔴" : state === "CHASE" ? "🟠" : "🔵";
      lines.push(`STATE  ${stateColor} ${state}`);

      const bacteria = this.immuneSys.bacteria.filter((b) => b.alive);
      if (bacteria.length) {
        let nearest = Infinity;
        for (const b of bacteria)
          nearest = Math.min(nearest, w.position.distanceTo(b.position));
        lines.push(`NEAREST PATHOGEN  ${nearest.toFixed(1)} u`);
      } else {
        lines.push(`NO PATHOGENS DETECTED`);
      }
      lines.push(`TOTAL KILLS  ${this.immuneSys.killCount}`);
    } else {
      const b = this.#trackedEntity;
      const typeLabel = {
        COCCUS: "Coccus (spherical)",
        BACILLUS: "Bacillus (rod)",
        SPIRILLA: "Spirilla (spiral)",
      };
      lines.push(`TYPE  ${typeLabel[b.type] ?? b.type}`);

      const wbcs = this.immuneSys.wbcs.filter((w) => w.mesh.visible);
      if (wbcs.length) {
        let nearest = Infinity;
        for (const w of wbcs)
          nearest = Math.min(nearest, b.position.distanceTo(w.position));
        const threat = nearest < 5.5 ? "⚠ IN RANGE" : "✓ CLEAR";
        lines.push(`NEAREST WBC  ${nearest.toFixed(1)} u  ${threat}`);
      }
    }

    badge.textContent = lines.join("\n");
  }

  // Defines the callbacks for when the immune system changes phase, when observation steps change, when kills are confirmed, and when the infection is resolved.
  #wireCallbacks() {
    const sys = this.immuneSys;
    const n = this.#narrator;
    const ui = this.#ui;

    sys.onPhaseChange = (phase) => {
      const label = PHASE_LABELS[phase] ?? phase;
      const idx = PHASE_LIST.indexOf(label);
      this.onHUDPhaseChange?.(PHASE_LIST, idx);

      if (phase === SIM_PHASE.OBSERVING) {
        ui.btnResume?.classList.remove("hidden");
        ui.btnRestart?.classList.add("hidden");
      }
      if (phase === SIM_PHASE.RESPONSE) {
        ui.btnResume?.classList.add("hidden");
        ui.btnRestart?.classList.remove("hidden");
        n.queueText(
          PHASE_NARRATOR[SIM_PHASE.RESPONSE][0],
          PHASE_LABELS[SIM_PHASE.RESPONSE],
        );
        n.queueText(PHASE_NARRATOR[SIM_PHASE.RESPONSE][1]);
      }
      if (phase === "DRAINING") {
        n.queueText(PHASE_NARRATOR.DRAINING[0], PHASE_LABELS.DRAINING);
      }
      if (phase === SIM_PHASE.RESOLVED) {
        n.queueText(
          PHASE_NARRATOR[SIM_PHASE.RESOLVED][0],
          PHASE_LABELS[SIM_PHASE.RESOLVED],
        );
        n.queueText(PHASE_NARRATOR[SIM_PHASE.RESOLVED][1]);
      }
    };

    sys.onObsStepChange = (step) => {
      if (step === OBS_STEP.BACTERIA_SPAWNING) return;
      const text = OBS_NARRATOR[step];
      if (text) n.queueText(text);
    };

    sys.onKillEvent = (count) => {
      n.setKills(`Confirmed kills: ${count}`);
      if (ui.statKills) ui.statKills.textContent = count;
    };

    sys.onResolved = () => {
      ui.btnInfect.disabled = false;
      ui.btnInfect.textContent = "⚠ Start New Infection";
      ui.btnResume?.classList.add("hidden");
      ui.btnRestart?.classList.add("hidden");
      this.onHUDPhaseChange?.(PHASE_LIST, -1);
    };
  }

  // Buttons wiring for starting the infection simulation and tracking specific cells. It defines the behavior when the user clicks the "Infect" button to start the simulation,
  // and when they click the tracking buttons to follow specific WBCs or bacteria in the scene.
  #wireButtons() {
    const sys = this.immuneSys;
    const n = this.#narrator;
    const ui = this.#ui;

    ui.btnInfect.addEventListener("click", () => {
      if (
        sys.phase === SIM_PHASE.RESOLVED ||
        sys.phase === SIM_PHASE.RESPONSE
      ) {
        sys.fullReset();
        this.onHUDPhaseChange?.(PHASE_LIST, -1);
        this.#stopTracking();
      }
      n.reset();
      n.setPhase(PHASE_LABELS[SIM_PHASE.OBSERVING]);
      n.queueText(OBS_NARRATOR[OBS_STEP.BACTERIA_SPAWNING]);

      this.onCameraStop?.();
      sys.startObservation(this.currentCameraT?.() ?? 0);
      ui.btnInfect.disabled = true;
      ui.btnInfect.textContent = "⚠ Infection active";
      n.setKills("");
    });

    if (ui.btnTrackWBC) {
      ui.btnTrackWBC.addEventListener("click", () => {
        if (this.#tracker?.active) this.#stopTracking();
        else this.#startTracking("wbc");
      });
    }

    if (ui.btnTrackBacteria) {
      ui.btnTrackBacteria.addEventListener("click", () => {
        if (this.#tracker?.active) this.#stopTracking();
        else this.#startTracking("bacteria");
      });
    }
  }

  #updateFog(level) {
    FOG_LERPED.lerpColors(FOG_HEALTHY, FOG_SICK, level);
    this.#scene.fog.color.copy(FOG_LERPED);
    this.#scene.background.copy(FOG_LERPED);
    this.#scene.fog.far = 28 - level * 8;
  }

  #updateHUD() {
    const sys = this.immuneSys;
    const ui = this.#ui;
    if (ui.statBacteria) ui.statBacteria.textContent = sys.bacteria.length;
    if (ui.statWBC)
      ui.statWBC.textContent = `${sys.activeWBCs} / ${sys.wbcs.length}`;
    if (ui.statKills) ui.statKills.textContent = sys.killCount;
    if (ui.infectionFill) {
      ui.infectionFill.style.width = `${(sys.infectionLevel * 100).toFixed(1)}%`;
      ui.infectionFill.style.background =
        sys.infectionLevel > 0.7
          ? "linear-gradient(90deg, #ff0000, #ff6600)"
          : "linear-gradient(90deg, #cc0000, #ff4400)";
    }

    const hasWBC = this.immuneSys.wbcs.some((w) => w.mesh.visible);
    const hasBacteria = this.immuneSys.bacteria.some((b) => b.alive);
    if (ui.btnTrackWBC) ui.btnTrackWBC.style.display = hasWBC ? "" : "none";
    if (ui.btnTrackBacteria)
      ui.btnTrackBacteria.style.display = hasBacteria ? "" : "none";
  }
}
