# HematoSim

**An immersive real-time simulation of the human bloodstream, built with Three.js.**

HematoSim lets you travel through a blood vessel in first person and observe three key biological processes: bacterial infection and the immune response, oxygen exchange in the pulmonary capillaries, and wound coagulation. Everything is rendered in 3D using WebGL, cells flow, hunt, absorb, and clot in real time, guided by a step-by-step narrator.

---

## Table of Contents

- [Demo Overview](#demo-overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Running the Project](#running-the-project)
- [Scenarios](#scenarios)
- [Controls & UI](#controls--ui)
- [Architecture Notes](#architecture-notes)

---

## Demo Overview

The application opens on a menu scene showing a 3D humanoid body. Each scenario is accessed by clicking its card, the camera then zooms into the corresponding body region and transitions into the bloodstream. Inside the vessel you ride the flow, watching biological processes unfold with on-screen narration explaining each step in real time.

---

## Project Structure

```
├── public/                    # Static assets served as-is by Vite (not bundled)
│   ├── favicon.svg
│   ├── icons.svg
│   └── Universal Base Characters[Standard]/
│       └── Base Characters/
│           └── Godot - UE/
│               ├── Superhero_Male_FullBody.gltf   # 3D body model used in the menu scene
│               ├── Superhero_Male_FullBody.bin
│               ├── Superhero_Female_FullBody.gltf
│               ├── Superhero_Female_FullBody.bin
│               └── T_*.png                        # Textures (skin, hair, eyes, normals…)
│
└── src/
├── main.js                    # Entry point: app state machine, mounts/unmounts scenarios
├── style.css                  # Global styles (HUD, narrator, controls, cards)
│
├── menu/
│   ├── menuScene.js           # 3D menu: body model, hotspots, scenario cards
│   └── zoomTransition.js      # Camera zoom-in + fade when selecting a scenario
│
├── scene/
│   ├── renderer.js            # WebGL renderer setup (tone mapping, pixel ratio)
│   └── scene.js               # Thin wrapper returning a THREE.Scene instance
│
├── world/
│   ├── bloodstream.js         # Tube geometry, plasma particles, lighting, fog
│   └── path.js                # Procedural seeded CatmullRom curve for the vessel
│
├── entities/
│   ├── rbc.js                 # Red blood cells. InstancedMesh, flows along curve
│   ├── bacteria.js            # Individual bacterium, wanders along the vessel
│   └── wbc.js                 # White blood cell, state machine (PATROL / CHASE / ATTACK)
│
├── scenarios/
│   ├── infection/
│   │   ├── index.js           # InfectionScenario: orchestrates immune system + UI
│   │   ├── immune_system.js   # ImmuneSystem: phase manager (IDLE→OBSERVING→RESPONSE→RESOLVED)
│   │   └── spawner.js         # Bacteria spawner: rate-limited, camera-aware
│   │
│   ├── oxygen/
│   │   ├── index.js           # OxygenScenario: coordinates RBCs, particles, colour system
│   │   ├── alveoliZone.js     # Pink tubular overlay marking the exchange zone
│   │   ├── o2Particles.js     # Cyan O₂ spheres that diffuse inward and get absorbed by RBCs
│   │   └── rbcColorSystem.js  # Lerps RBC colours from deoxy (blue-purple) to oxy (red)
│   │
│   └── wound/
│       ├── index.js           # WoundScenario: state machine across 5 coagulation phases
│       ├── woundZone.js       # Tear mesh, collagen fibres, bleeding particle jet, wound light
│       ├── platelet.js        # PlateletSystem: flow → activate → chase → adhere
│       └── fribinMesh.js      # Fibrin network: procedural line segments growing over time
│
├── shared/
│   ├── camera.js              # CameraController: follows curve, mouse look, stop/resume
│   ├── cell_tracker.js        # CellTracker: attaches camera to a specific cell (WBC / RBC)
│   ├── narrator.js            # Typewriter narrator: queue, history, back/forward navigation
│   ├── hover_picker.js        # Raycaster-based hover tooltips for meshes and instances
│   └── tooltip.js             # DOM tooltip element shown on hover
│
└── utils/
    ├── constants.js           # All tuneable parameters (speeds, counts, radii, colours…)
    └── math.js                # Helpers: randomInTube, wrapT, lerp, clamp, randFloat, smoothstep
```

---

## Getting Started

### Prerequisites

You only need **Node.js** (v18 or newer recommended). You can download it from [nodejs.org](https://nodejs.org).

The repository includes the `public/` folder with the GLTF body model and its textures, these are static assets served directly by Vite and are required for the menu scene.


### Install dependencies

Clone or download the project, then from the project root run:

```bash
npm install
```

This reads `package.json` and downloads all dependencies (mainly Three.js and Vite) into `node_modules/`.

---

## Running the Project

```bash
npm run dev
```

Vite starts a local dev server, typically at `http://localhost:5173`. Open that URL in any modern browser (Chrome, Firefox, Edge, Safari). The project uses WebGL 2, make sure hardware acceleration is enabled in your browser settings.

---

## Scenarios

### 🦠 Bacterial Infection

The camera enters the vessel and bacteria begin to spawn (green cocci, yellow bacilli, purple spirilla). White blood cells materialise behind the camera, detect the pathogens via their chemical signature, chase them, and destroy them with a phagocytosis animation. The simulation moves through four phases:

1. **Phase I: Infection**: Bacteria enter, WBCs appear
2. **Phase II: Immune Response**: WBCs hunt bacteria across the full vessel
3. **Draining**: No new bacteria spawn, WBCs clear the remainder
4. **Phase III: Resolved**: Bloodstream is clean

You can adjust the bacteria spawn rate and flow speed with the sliders. The infection level bar fills as bacteria accumulate. Use the tracking buttons to follow a specific WBC or bacterium with a cinematic camera.

### 🫁 Oxygen Exchange

The camera travels toward the pulmonary capillary zone (marked by a pulsing pink overlay). Cyan O₂ particles emerge from the vessel wall and drift inward. When they reach a red blood cell they are absorbed, and that cell's colour shifts from deep blue-purple (deoxygenated haemoglobin) to bright red (oxygenated). As you exit the zone, cells gradually darken again on their way to deliver oxygen to tissues. The "Follow RBC" button locks the camera onto a single cell so you can observe its full cycle.

### 🩸 Wound Coagulation

Clicking "Trigger Wound" places a vascular breach ahead of the camera. The camera slows and looks toward it. The scenario progresses through five phases:

1. **Vascular Damage**: The wall ruptures, red cells escape through the breach
2. **Platelet Activation**: Platelets detect exposed collagen and change shape
3. **Platelet Plug**: Activated platelets chase and adhere to the wound site
4. **Fibrin Network**: A procedural fibrin mesh grows around the plug
5. **Stable Clot**: Bleeding stops, camera resumes

Wound size is adjustable with a slider before triggering.

---

## Controls & UI

| Control | Action |
|---|---|
| Flow Speed slider | Speed up or slow down all cellular movement |
| Spawn Rate slider | (Infection only) Control how fast bacteria appear |
| Wound Size slider | (Coagulation only) Scale the wound and platelet response |
| ⏸ Pause | Freeze the simulation |
| ◀ Back / ▶ Fwd | Navigate narrator history |
| 🔬 Follow WBC | Lock camera to a white blood cell |
| 🦠 Follow Bacteria | Lock camera to a bacterium |
| 🩸 Follow RBC | Lock camera to a red blood cell |
| Hover over any cell | Shows a tooltip with biological info |

---

## Architecture Notes

**State lives at the top.** `main.js` owns the app-level state (`MENU / TRANSITION / SCENARIO`) and mounts/unmounts scenarios. Scenarios own their own state internally and communicate back through callback properties (`onCameraStop`, `onHUDPhaseChange`, etc.) rather than importing from each other.

**Constants are centralised.** All tuneable numbers, cell counts, speeds, radii, colours, zone boundaries, live in `src/utils/constants.js`. Changing a value there affects everywhere it is used.

**The curve is the spine.** The bloodstream is a closed `CatmullRomCurve3` generated procedurally on each load. Every entity (RBC, WBC, bacterium, camera, platelet) stores a `t` value between 0 and 1 representing its position along this curve. `wrapT(t)` keeps values in range as they loop.

**InstancedMesh for performance.** RBCs (120 instances) and platelets (80 instances) use `THREE.InstancedMesh` so the GPU renders all of them in a single draw call. Individual bacteria and WBCs are separate meshes because they need independent materials and state.

**The narrator is decoupled.** `Narrator` is a pure display class, it receives text strings via `queueText()` and handles typewriter timing, history, and back/forward navigation internally. Scenarios never manipulate the DOM directly for narration.