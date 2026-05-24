import * as THREE from "three";

// Class responsible for raycasting against registered meshes each time the mouse moves,
// and notifying the tooltip with the label of the closest intersected object.
// Supports static meshes, instanced meshes with a fixed label, instanced meshes with per-instance label functions,
// and dynamic entries whose mesh list is resolved every frame via a callback.
export class HoverPicker {
  #raycaster = new THREE.Raycaster();
  #mouse = new THREE.Vector2(-9999, -9999);
  #camera = null;
  #tooltip = null;
  #entries = [];
  #onMove = null;
  #lastX = 0;
  #lastY = 0;

  // Constructor initializes the picker with a camera and tooltip, and starts listening for mouse movement.
  constructor(camera, tooltip) {
    this.#camera = camera;
    this.#tooltip = tooltip;
    this.#onMove = (e) => {
      this.#lastX = e.clientX;
      this.#lastY = e.clientY;
      this.#handleMove(e.clientX, e.clientY);
    };
    window.addEventListener("mousemove", this.#onMove);
  }

  // Registers a regular Mesh with a fixed label string.
  add(mesh, label) {
    this.#entries.push({ mesh, label, instanced: false, dynamic: false });
  }

  // Registers an InstancedMesh with a fixed label for all instances.
  addInstanced(mesh, label) {
    if (!mesh) return;
    this.#entries.push({ mesh, label, instanced: true, dynamic: false });
  }

  // Registers an InstancedMesh with a per-instance label resolved by calling getLabel(instanceId).
  addInstancedFn(mesh, getLabel) {
    if (!mesh) return;
    this.#entries.push({ mesh, getLabel, instanced: true, dynamic: false });
  }

  // Registers a dynamic entry whose mesh+label pairs are resolved each frame by calling getFn().
  // Useful for objects that are spawned and destroyed at runtime, such as bacteria and WBCs.
  addDynamic(getFn) {
    this.#entries.push({ dynamic: true, getFn });
  }

  // Removes all registered entries. Call this before re-registering when the scenario changes.
  clear() {
    this.#entries = [];
    this.#tooltip.hide();
  }

  // Updates the camera reference, needed if the camera is recreated between scenarios.
  setCamera(camera) {
    this.#camera = camera;
  }

  // Internal handler called on every mousemove event. Resolves dynamic entries, runs the raycaster,
  // and shows or hides the tooltip based on what was hit.
  #handleMove(clientX, clientY) {
    this.#mouse.x = (clientX / window.innerWidth) * 2 - 1;
    this.#mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    this.#raycaster.setFromCamera(this.#mouse, this.#camera);

    const resolved = [];
    for (const entry of this.#entries) {
      if (entry.dynamic) {
        for (const item of entry.getFn()) {
          if (item.mesh)
            resolved.push({
              mesh: item.mesh,
              label: item.label,
              instanced: item.mesh.isInstancedMesh ?? false,
            });
        }
      } else {
        resolved.push(entry);
      }
    }

    const meshes = resolved.map((e) => e.mesh).filter(Boolean);
    if (meshes.length === 0) {
      this.#tooltip.hide();
      return;
    }

    const hits = this.#raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) {
      this.#tooltip.hide();
      return;
    }

    const hit = hits[0];
    const entry = resolved.find((e) => e.mesh === hit.object);
    if (!entry) {
      this.#tooltip.hide();
      return;
    }

    let label;
    if (entry.instanced && entry.getLabel) {
      label = entry.getLabel(hit.instanceId);
    } else {
      label = entry.label;
    }

    if (label) this.#tooltip.show(clientX, clientY, label);
    else this.#tooltip.hide();
  }

  destroy() {
    window.removeEventListener("mousemove", this.#onMove);
    this.#entries = [];
  }
}
