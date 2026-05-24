import "./style.css";
import * as THREE from "three";

import { createRenderer } from "./scene/renderer.js";
import { CameraController } from "./shared/camera.js";
import { MenuScene, SCENARIOS } from "./menu/menuScene.js";
import { ZoomTransition } from "./menu/zoomTransition.js";
import { InfectionScenario } from "./scenarios/infection/index.js";
import { OxygenScenario } from "./scenarios/oxygen/index.js";
import { Bloodstream } from "./world/bloodstream.js";
import { WoundScenario } from "./scenarios/wound/index.js";
import { Tooltip } from "./shared/tooltip.js";
import { HoverPicker } from "./shared/hover_picker.js";

const STATE = { MENU: "MENU", TRANSITION: "TRANSITION", SCENARIO: "SCENARIO" };
let appState = STATE.MENU;

const renderer = createRenderer();
const transition = new ZoomTransition();

const scenarioDOM = buildScenarioDOM();
let globalPaused = false;

const menu = new MenuScene(renderer);

// When a scenario is selected from the menu, this callback is triggered.
// It initiates a zoom transition effect from the menu camera to the starting position of the selected scenario.
// Once the transition is complete, it mounts the scenario and fades in the scene for an immersive experience.
menu.onScenarioSelected = (scenarioId) => {
  if (appState !== STATE.MENU) return;
  appState = STATE.TRANSITION;

  const scenarioDef = SCENARIOS.find((s) => s.id === scenarioId);
  const bodyPart = scenarioDef?.bodyPart ?? "arm";
  const hotspotPos = menu.getHotspotPosition(bodyPart);

  transition.play(menu.camera, hotspotPos, () => {
    menu.stop();
    mountScenario(scenarioId);
    transition.fadeIn(0.7);
    appState = STATE.SCENARIO;
  });
};

menu.start();

let activeScenario = null;
let activeCamCtrl = null;
let activeScene = null;

function setHUDPhases(phases, activeIndex) {
  scenarioDOM.hudPhases.innerHTML = phases
    .map(
      (label, i) => `
      <div class="hud-phase ${i === activeIndex ? "hud-phase--active" : ""}">
        <span class="hud-phase-dot"></span>
        ${label}
      </div>
    `,
    )
    .join("");
}

// Main loop for the application. It uses requestAnimationFrame to continuously update the scene and render it.
function mountScenario(scenarioId) {
  scenarioDOM.hud.style.display = "block";
  scenarioDOM.narrator.style.display = "block";
  scenarioDOM.controls.style.display = "block";
  scenarioDOM.barWrap.style.display = "block";

  activeScene = new THREE.Scene();

  const bloodstream = new Bloodstream(activeScene);
  const curve = bloodstream.curve;
  activeCamCtrl = new CameraController(activeScene, curve);

  const zoomEndPos = menu.camera.position;
  let bestT = 0,
    bestDist = Infinity;
  for (let i = 0; i < 100; i++) {
    const t = i / 100;
    const d = curve.getPointAt(t).distanceTo(zoomEndPos);
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  activeCamCtrl.t = bestT;

  if (scenarioId === "oxygen") {
    scenarioDOM.hudBacteriaRow.style.display = "none";
    scenarioDOM.barWrap.style.display = "none";
    scenarioDOM.hudLabel1.textContent = "O₂ SAT";
    scenarioDOM.hudLabel2.textContent = "ABSORBED";
    scenarioDOM.btnInfect.textContent = "🫁 Begin Observation";
    scenarioDOM.woundSizeRow.style.display = "none";
    scenarioDOM.spawnRow.style.display = "none";

    scenarioDOM.trackWBCRow.style.display = "none";
    scenarioDOM.trackBacteriaRow.style.display = "none";
    scenarioDOM.trackRBCRow.style.display = "";
  } else if (scenarioId === "coagulation") {
    scenarioDOM.hudBacteriaRow.style.display = "none";
    scenarioDOM.barWrap.style.display = "none";
    scenarioDOM.hudLabel1.textContent = "PLATELETS";
    scenarioDOM.hudLabel2.textContent = "FIBRIN";
    scenarioDOM.btnInfect.textContent = "🩸 Wound active";
    scenarioDOM.woundSizeRow.style.display = "";
    scenarioDOM.spawnRow.style.display = "none";

    scenarioDOM.trackWBCRow.style.display = "none";
    scenarioDOM.trackBacteriaRow.style.display = "none";
    scenarioDOM.trackRBCRow.style.display = "none";
  } else {
    scenarioDOM.hudBacteriaRow.style.display = "";
    scenarioDOM.barWrap.style.display = "block";
    scenarioDOM.hudLabel1.textContent = "WBC ACTIVE";
    scenarioDOM.hudLabel2.textContent = "KILLS";
    scenarioDOM.btnInfect.textContent = "⚠ Start Infection";
    scenarioDOM.woundSizeRow.style.display = "none";
    scenarioDOM.spawnRow.style.display = "";

    scenarioDOM.trackWBCRow.style.display = "";
    scenarioDOM.trackBacteriaRow.style.display = "";
    scenarioDOM.trackRBCRow.style.display = "none";
  }

  const narratorEls = {
    panel: scenarioDOM.narrator,
    phase: scenarioDOM.narratorPhase,
    text: scenarioDOM.narratorText,
    kills: scenarioDOM.narratorKills,
  };
  const uiEls = {
    statBacteria: scenarioDOM.statBacteria,
    statWBC: scenarioDOM.statWBC,
    statKills: scenarioDOM.statKills,
    statPhase: scenarioDOM.statPhase,
    infectionFill: scenarioDOM.infectionFill,
    btnInfect: scenarioDOM.btnInfect,
    btnPause: scenarioDOM.btnPause,
    btnResume: scenarioDOM.btnResume,
    btnRestart: scenarioDOM.btnRestart,
    slSpawn: scenarioDOM.slSpawn,

    btnTrackWBC: scenarioDOM.btnTrackWBC,
    btnTrackBacteria: scenarioDOM.btnTrackBacteria,
    btnTrackRBC: scenarioDOM.btnTrackRBC,
  };

  if (scenarioId === "oxygen") {
    activeScenario = new OxygenScenario(activeScene, narratorEls, uiEls);
  } else if (scenarioId === "coagulation") {
    activeScenario = new WoundScenario(activeScene, narratorEls, uiEls);
  } else {
    activeScenario = new InfectionScenario(activeScene, narratorEls, uiEls);
  }

  activeScenario.onCameraStop = () => activeCamCtrl.stop();
  activeScenario.onCameraResume = () => activeCamCtrl.resume();
  activeScenario.currentCameraT = () => activeCamCtrl.t;
  activeScenario.onCameraLookAt = (pos) => activeCamCtrl.smoothLookAt(pos, 0.9);

  activeScenario.getCamera = () => activeCamCtrl.camera;
  activeScenario.onTrackingStart = (active) => {
    activeCamCtrl.setCellTracking(active);
  };

  activeScenario.onHUDPhasesReady = (phases) => setHUDPhases(phases, -1);
  activeScenario.onHUDPhaseChange = (phases, index) =>
    setHUDPhases(phases, index);

  activeScenario.init(curve, bloodstream);

  if (activeScenario.immuneSys) {
    activeScenario.immuneSys.onAutoResume = () => activeCamCtrl.resume();
  }

  if (activeScenario.narrator) {
    activeScenario.narrator.onResume = () => {
      globalPaused = false;
      scenarioDOM.btnPause.textContent = "⏸ Pause";
    };
  }

  const tooltip = new Tooltip();
  const picker = new HoverPicker(activeCamCtrl.camera, tooltip);
  if (activeScenario.registerHoverTargets) {
    activeScenario.registerHoverTargets(picker);
  }

  scenarioDOM.btnPause.addEventListener("click", () => {
    globalPaused = !globalPaused;
    scenarioDOM.btnPause.textContent = globalPaused ? "▶ Resume" : "⏸ Pause";
    if (activeScenario?.onGlobalPause)
      activeScenario.onGlobalPause(globalPaused);
  });

  scenarioDOM.btnNarratorBack.addEventListener("click", () => {
    if (!globalPaused) {
      globalPaused = true;
      scenarioDOM.btnPause.textContent = "▶ Resume";
    }
    activeScenario?.narrator?.goBack?.();
  });

  scenarioDOM.btnNarratorFwd.addEventListener("click", () => {
    activeScenario?.narrator?.goForward?.();
  });

  const clock = new THREE.Clock();
  const tick = () => {
    requestAnimationFrame(tick);

    if (globalPaused) {
      clock.getDelta();
      return;
    }

    const delta = Math.min(clock.getDelta(), 0.05);
    const flowSpeed = parseFloat(scenarioDOM.slFlow.value);
    const spawnRate = parseFloat(scenarioDOM.slSpawn.value);
    const woundSize = parseFloat(scenarioDOM.slWoundSize.value);

    activeCamCtrl.update(delta, flowSpeed);
    activeScenario?.update(delta, {
      flowSpeed,
      spawnRate,
      woundSize,
      cameraT: activeCamCtrl.t,
    });
    renderer.render(activeScene, activeCamCtrl.camera);
  };
  tick();
}

// Helper function to build the DOM elements for the HUD, narrator, and controls. It also sets up event listeners for the control inputs.
function buildScenarioDOM() {
  const hud = document.createElement("div");
  hud.id = "stats";
  hud.style.display = "none";
  hud.innerHTML = `
    <div id="hud-top">
      <span id="hud-bacteria-row">BACTERIA &nbsp;<span id="stat-bacteria">0</span><br></span>
      <span id="hud-label1">WBC ACTIVE</span>  <span id="stat-wbc">0 / 0</span><br>
      <span id="hud-label2">KILLS</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span id="stat-kills">0</span>
    </div>
    <div id="hud-phases"></div>
  `;
  document.body.appendChild(hud);

  const barWrap = document.createElement("div");
  barWrap.id = "infection-bar-wrap";
  barWrap.style.display = "none";
  barWrap.innerHTML = `
    <div id="infection-label">Infection Level</div>
    <div id="infection-bar-bg"><div id="infection-bar-fill"></div></div>
  `;
  document.body.appendChild(barWrap);

  const narrator = document.createElement("div");
  narrator.id = "narrator";
  narrator.style.display = "none";
  narrator.innerHTML = `
    <div id="narrator-phase">—</div>
    <div id="narrator-box">
      <div id="narrator-text"></div>
      <div id="narrator-kills"></div>
    </div>
    <div id="narrator-controls">
      <button class="narrator-btn" id="btn-pause">⏸ Pause</button>
      <button class="narrator-btn" id="btn-narrator-back">◀ Back</button>
      <button class="narrator-btn" id="btn-narrator-fwd">▶ Fwd</button>
    </div>
  `;
  document.body.appendChild(narrator);

  const controls = document.createElement("div");
  controls.id = "controls";
  controls.style.display = "none";
  controls.innerHTML = `
    <div class="control-group" id="spawn-row">
      <span class="control-label">Spawn Rate</span>
      <input type="range" id="sl-spawn" min="0.1" max="3" step="0.05" value="1">
      <span class="control-value" id="val-spawn">1.00×</span>
    </div>
    <div class="divider"></div>
    <div class="control-group">
      <span class="control-label">Flow Speed</span>
      <input type="range" id="sl-flow" min="0.1" max="3" step="0.05" value="1">
      <span class="control-value" id="val-flow">1.00×</span>
    </div>
    <div class="divider"></div>
    <div class="control-group" id="wound-size-row">
      <span class="control-label">Wound Size</span>
      <input type="range" id="sl-wound-size" min="0.5" max="2" step="0.05" value="1">
      <span class="control-value" id="val-wound-size">1.00×</span>
    </div>
    <div class="divider" id="wound-size-divider"></div>
    <button id="btn-infect">⚠ Start Infection</button>

    <div class="divider" id="track-divider-wbc"></div>
    <div id="track-wbc-row">
      <button id="btn-track-wbc" class="track-btn">🔬 Follow WBC</button>
    </div>

    <div class="divider" id="track-divider-bacteria"></div>
    <div id="track-bacteria-row">
      <button id="btn-track-bacteria" class="track-btn">🦠 Follow Bacteria</button>
    </div>

    <div class="divider" id="track-divider-rbc"></div>
    <div id="track-rbc-row">
      <button id="btn-track-rbc" class="track-btn">🩸 Follow RBC</button>
    </div>
  `;
  document.body.appendChild(controls);

  const style = document.createElement("style");
  style.textContent = `
    .track-btn {
      width: 100%;
      margin-top: 2px;
      background: rgba(30, 30, 50, 0.82);
      border: 1px solid rgba(120, 180, 255, 0.35);
      border-radius: 5px;
      color: #acd;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      padding: 5px 10px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .track-btn:hover:not([disabled]) {
      background: rgba(60, 80, 120, 0.82);
      border-color: rgba(120, 180, 255, 0.7);
    }
    .track-btn[disabled] {
      cursor: default;
    }
  `;
  document.head.appendChild(style);

  const slFlow = controls.querySelector("#sl-flow");
  const slSpawn = controls.querySelector("#sl-spawn");
  const slWoundSize = controls.querySelector("#sl-wound-size");

  slFlow.addEventListener("input", () => {
    controls.querySelector("#val-flow").textContent =
      `${parseFloat(slFlow.value).toFixed(2)}×`;
  });
  slSpawn.addEventListener("input", () => {
    controls.querySelector("#val-spawn").textContent =
      `${parseFloat(slSpawn.value).toFixed(2)}×`;
  });
  slWoundSize.addEventListener("input", () => {
    controls.querySelector("#val-wound-size").textContent =
      `${parseFloat(slWoundSize.value).toFixed(2)}×`;
  });

  return {
    hud,
    narrator,
    controls,
    barWrap,
    hudBacteriaRow: hud.querySelector("#hud-bacteria-row"),
    hudLabel1: hud.querySelector("#hud-label1"),
    hudLabel2: hud.querySelector("#hud-label2"),
    hudPhases: hud.querySelector("#hud-phases"),
    statBacteria: hud.querySelector("#stat-bacteria"),
    statWBC: hud.querySelector("#stat-wbc"),
    statKills: hud.querySelector("#stat-kills"),
    statPhase: hud.querySelector("#stat-phase"),
    infectionFill: barWrap.querySelector("#infection-bar-fill"),
    narratorPhase: narrator.querySelector("#narrator-phase"),
    narratorText: narrator.querySelector("#narrator-text"),
    narratorKills: narrator.querySelector("#narrator-kills"),
    btnPause: narrator.querySelector("#btn-pause"),
    btnNarratorBack: narrator.querySelector("#btn-narrator-back"),
    btnNarratorFwd: narrator.querySelector("#btn-narrator-fwd"),
    btnInfect: controls.querySelector("#btn-infect"),
    woundSizeRow: controls.querySelector("#wound-size-row"),
    spawnRow: controls.querySelector("#spawn-row"),
    slFlow,
    slSpawn,
    slWoundSize,
    btnTrackWBC: controls.querySelector("#btn-track-wbc"),
    btnTrackBacteria: controls.querySelector("#btn-track-bacteria"),
    btnTrackRBC: controls.querySelector("#btn-track-rbc"),
    trackWBCRow: controls.querySelector("#track-wbc-row"),
    trackBacteriaRow: controls.querySelector("#track-bacteria-row"),
    trackRBCRow: controls.querySelector("#track-rbc-row"),
  };
}
