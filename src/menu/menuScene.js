import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Data for the scenarios available in the menu. Each scenario has an id, label, description, associated body part, color for UI elements, and an icon.
export const SCENARIOS = [
  {
    id: "infection",
    label: "Bacterial Infection",
    description:
      "Watch leukocytes hunt and destroy pathogens inside a blood vessel.",
    bodyPart: "leg",
    color: 0x22cc44,
    icon: "🦠",
  },
  {
    id: "oxygen",
    label: "Oxygen Exchange",
    description:
      "Follow red blood cells as they pick up oxygen in the lung capillaries.",
    bodyPart: "chest",
    color: 0x44aaff,
    icon: "🫁",
  },
  {
    id: "coagulation",
    label: "Wound Coagulation",
    description:
      "See how platelets seal a breach in the vessel wall to stop bleeding.",
    bodyPart: "arm",
    color: 0xff8822,
    icon: "🩸",
  },
];

// Local positions of the scenario hotspots on the body model.
// These are used for zooming in on each scenario, they are the objectives where the camera will focus.
const HOTSPOT_LOCAL = {
  arm: new THREE.Vector3(0.8, 3.95, 0.0),
  chest: new THREE.Vector3(0.0, 3.8, 0.25),
  leg: new THREE.Vector3(0.32, 2.1, 0.17),
};

// Path to the GLTF model used for the body in the menu scene. This model is a humanoid character downloaded from a free asset site.
const MODEL_PATH =
  "/Universal%20Base%20Characters%5BStandard%5D/Base%20Characters/Godot%20-%20UE/Superhero_Male_FullBody.gltf";

// The MenuScene class manages the 3D scene for the main menu, including the body model,
// hotspots for each scenario, background particles, and the animation loop.
// It also handles user interactions for selecting scenarios and zooming in on hotspots.
export class MenuScene {
  camera = null;
  renderer = null;

  #scene = null;
  #body = null;
  #hotspots = [];
  #particles = null;
  #clock = new THREE.Clock();
  #rotY = 0;
  #rotating = true;
  #animId = null;
  #overlay = null;

  #_bodyQuatInv = new THREE.Quaternion();
  #_camQuat = new THREE.Quaternion();
  #zooming = false;

  onScenarioSelected = null;

  // Constructor initializes the menu scene with a Three.js renderer, sets up the camera, and builds the environment,
  // body model, particles, and overlay UI. It also sets up the animation loop and window resize handling.
  constructor(renderer) {
    this.renderer = renderer;
    this.#scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );
    this.camera.position.set(0, 2.5, 10);
    this.camera.lookAt(0, 2, 0);

    window.addEventListener("resize", this.#onResize);

    this.#buildEnvironment();
    this.#buildBody();
    this.#buildParticles();
    this.#buildOverlay();
  }

  start() {
    this.#overlay.style.display = "flex";
    this.#clock.start();
    this.#loop();
  }

  stop() {
    cancelAnimationFrame(this.#animId);
    this.#overlay.style.display = "none";
    window.removeEventListener("resize", this.#onResize);
  }

  // When a scenario is selected, this function is called to get the world position of the corresponding hotspot on the body model.
  // It stops the animation loop to ensure accurate world matrix calculations, retrieves the hotspot position, and then restarts the loop for the zoom transition.
  getHotspotPosition(bodyPart) {
    cancelAnimationFrame(this.#animId);
    this.#rotating = false;
    this.#body.rotation.y = this.#rotY;

    this.#scene.updateMatrixWorld(true);

    const hs = this.#hotspots.find((h) => h.bodyPart === bodyPart);
    this.#zooming = true;
    if (hs) {
      const worldPos = new THREE.Vector3();
      hs.mesh.getWorldPosition(worldPos);
      this.#loop();

      return worldPos;
    }

    this.#loop();
    return new THREE.Vector3(0, 2, 0);
  }

  // Builds the environment of the scene, including the background color, fog, ambient light, directional lights for key, fill, rim, and top lighting,
  // and a point light for ground illumination. This sets the overall mood and visibility of the scene.
  #buildEnvironment() {
    this.#scene.background = new THREE.Color(0x06090f);
    this.#scene.fog = new THREE.FogExp2(0x06090f, 0.018);
    this.#scene.add(new THREE.AmbientLight(0x3355aa, 0.5));

    const key = new THREE.DirectionalLight(0xfff0dd, 4.0);
    key.position.set(5, 9, 7);
    this.#scene.add(key);

    const fill = new THREE.DirectionalLight(0xaaccff, 1.4);
    fill.position.set(-6, 5, 4);
    this.#scene.add(fill);

    const rim = new THREE.DirectionalLight(0xff6622, 2.2);
    rim.position.set(-3, 2, -8);
    this.#scene.add(rim);

    const top = new THREE.DirectionalLight(0x99bbff, 0.8);
    top.position.set(0, 15, 1);
    this.#scene.add(top);

    const ground = new THREE.PointLight(0xff8844, 1.2, 14);
    ground.position.set(0, -0.5, 3);
    this.#scene.add(ground);
  }

  // Builds the body model for the menu scene. It attempts to load a GLTF model.
  #buildBody() {
    this.#body = new THREE.Group();
    this.#scene.add(this.#body);

    const loader = new GLTFLoader();
    loader.load(
      MODEL_PATH,

      (gltf) => {
        const model = gltf.scene;

        const box = new THREE.Box3();
        model.updateMatrixWorld(true);
        model.traverse((child) => {
          if (!child.isMesh || !child.geometry) return;
          child.geometry.computeBoundingBox();
          const geoBB = child.geometry.boundingBox;
          if (!geoBB) return;
          box.union(geoBB.clone().applyMatrix4(child.matrixWorld));
        });
        if (box.isEmpty()) {
          box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 5, 1));
        }

        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 5 / size.y;

        model.scale.setScalar(scale);
        model.position.x = -center.x * scale;
        model.position.y = -box.min.y * scale;
        model.position.z = -center.z * scale;

        const solidMat = new THREE.MeshStandardMaterial({
          color: 0x2c4a6e,
          emissive: 0x0d1f35,
          emissiveIntensity: 0.35,
          roughness: 0.6,
          metalness: 0.22,
          transparent: true,
          opacity: 0.93,
        });
        const wireMat = new THREE.MeshBasicMaterial({
          color: 0x6699cc,
          wireframe: true,
          transparent: true,
          opacity: 0.06,
        });

        const meshes = [];
        model.traverse((child) => {
          if (child.isMesh) meshes.push(child);
        });
        for (const child of meshes) {
          child.material = solidMat;
          child.add(new THREE.Mesh(child.geometry, wireMat));
        }

        this.#body.add(model);
        this.#buildHotspots();
      },

      (xhr) => {
        if (xhr.total)
          console.log(`Model: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`);
      },

      (err) => {
        console.warn(
          "GLTF load failed, procedural fallback:",
          err.message ?? err,
        );
      },
    );
  }

  // Builds the hotspots for each scenario on the body model.
  // Each hotspot consists of a ring and a glow mesh, which are used for visual indication and as targets for camera zooming when a scenario is selected.
  // At the beginning they were going to be visible that is why they glow but in the end I decided to keep them hidden.
  #buildHotspots() {
    for (const scenario of SCENARIOS) {
      const localPos = HOTSPOT_LOCAL[scenario.bodyPart];
      if (!localPos) continue;

      const ringGeo = new THREE.RingGeometry(0.07, 0.14, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: scenario.color,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(localPos);
      this.#body.add(ring);

      const glowGeo = new THREE.SphereGeometry(0.12, 12, 8);
      const glowMat = new THREE.MeshBasicMaterial({
        color: scenario.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(localPos);
      this.#body.add(glow);

      this.#hotspots.push({
        mesh: ring,
        glow,
        mat: ringMat,
        glowMat,
        bodyPart: scenario.bodyPart,
        t: Math.random() * Math.PI * 2,
      });
    }
  }

  // Builds a particle system for the background of the menu scene, creating a set of points with random positions and a simple material.
  // These particles slowly rotate to add visual interest to the scene.
  #buildParticles() {
    const COUNT = 600;
    const pos = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.#particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x4488cc,
        size: 0.06,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    this.#scene.add(this.#particles);
  }

  // Builds the overlay UI for the menu, creating HTML elements for the title and scenario cards.
  // It also sets up event listeners for the scenario selection buttons, which call the onScenarioSelected callback when clicked.
  #buildOverlay() {
    this.#overlay = document.createElement("div");
    this.#overlay.id = "menu-overlay";
    this.#overlay.innerHTML = `
      <div id="menu-title">
        <div id="menu-title-main">HematoSim</div>
        <div id="menu-title-sub">An Immersive Journey Through the Human Bloodstream</div>
      </div>
      <div id="menu-cards">
        ${SCENARIOS.map(
          (s) => `
          <div class="scenario-card" data-id="${s.id}">
            <div class="card-icon">${s.icon}</div>
            <div class="card-label">${s.label}</div>
            <div class="card-desc">${s.description}</div>
            <button class="card-btn">Enter</button>
          </div>
        `,
        ).join("")}
      </div>
    `;
    document.body.appendChild(this.#overlay);

    this.#overlay.querySelectorAll(".card-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest(".scenario-card").dataset.id;
        this.onScenarioSelected?.(id);
      });
    });
  }

  // The main animation loop for the menu scene. It handles the rotation of the body model,
  // the billboard effect for the hotspots to always face the camera, and the slow rotation of the background particles.
  // It also applies a subtle bobbing effect to the camera when not zooming in on a hotspot. Finally, it renders the scene from the camera's perspective.
  #loop = () => {
    this.#animId = requestAnimationFrame(this.#loop);
    const delta = this.#clock.getDelta();
    const t = this.#clock.getElapsedTime();

    if (this.#rotating) {
      this.#rotY += delta * 0.18;
      this.#body.rotation.y = this.#rotY;
    }

    this.#body.getWorldQuaternion(this.#_bodyQuatInv).invert();
    this.#_camQuat.copy(this.camera.quaternion);

    for (const hs of this.#hotspots) {
      hs.t += delta * 2.2;
      hs.mat.opacity = 0;
      hs.glowMat.opacity = 0;
      hs.mesh.quaternion.multiplyQuaternions(
        this.#_bodyQuatInv,
        this.#_camQuat,
      );
    }

    this.#particles.rotation.y += delta * 0.01;
    if (!this.#zooming) {
      this.camera.position.y = 2.5 + 0.08 * Math.sin(t * 0.4);
    }

    this.renderer.render(this.#scene, this.camera);
  };

  #onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  };
}
