import * as THREE from "three";

// Class representing the zoom transition effect when the user selects a scenario from the menu.
// It manages an overlay for fading and animates the camera movement toward the selected hotspot.
export class ZoomTransition {
  #overlay = null;
  #running = false;
  #lastNow = null;

  constructor() {
    this.#overlay = document.createElement("div");
    this.#overlay.id = "transition-overlay";
    Object.assign(this.#overlay.style, {
      position: "fixed",
      inset: "0",
      background: "#000",
      opacity: "0",
      pointerEvents: "none",
      zIndex: "9999",
      transition: "none",
    });
    document.body.appendChild(this.#overlay);
  }

  // Public method to start the zoom transition. It animates the camera moving from its current position to a point near the target position (hotspot),
  // and then fades in the overlay. The onComplete callback is called after the fade-in is complete.
  play(camera, targetPos, onComplete) {
    if (this.#running) return;
    this.#running = true;
    this.#lastNow = null;

    const startPos = camera.position.clone();

    const dir = new THREE.Vector3().subVectors(targetPos, startPos).normalize();

    const totalDist = startPos.distanceTo(targetPos) - 0.15;
    const endPos = startPos
      .clone()
      .addScaledVector(dir, Math.max(totalDist, 0));

    const ZOOM_DURATION = 2.2;
    const FADE_DURATION = 0.3;

    let elapsed = 0;
    let phase = "ZOOM";

    const tick = (now) => {
      if (this.#lastNow === null) this.#lastNow = now;
      const delta = Math.min((now - this.#lastNow) / 1000, 0.05);
      this.#lastNow = now;
      elapsed += delta;

      if (phase === "ZOOM") {
        const t = Math.min(elapsed / ZOOM_DURATION, 1);
        const e = t * t * t * t * t;

        camera.position.lerpVectors(startPos, endPos, e);

        if (t >= 1) {
          phase = "FADE";
          elapsed = 0;
        }
        requestAnimationFrame(tick);
      } else {
        const t = Math.min(elapsed / FADE_DURATION, 1);
        this.#overlay.style.opacity = String(t);

        if (t >= 1) {
          this.#running = false;
          this.#lastNow = null;
          onComplete?.();
        } else {
          requestAnimationFrame(tick);
        }
      }
    };

    requestAnimationFrame(tick);
  }

  // Public method to fade in the overlay without moving the camera.
  // This can be used for transitions that don't involve zooming, such as when starting the experience.
  fadeIn(duration = 1.0) {
    this.#overlay.style.transition = `opacity ${duration}s ease`;
    void this.#overlay.offsetHeight;
    this.#overlay.style.opacity = "0";
    setTimeout(
      () => {
        this.#overlay.style.transition = "none";
      },
      duration * 1000 + 50,
    );
  }
}
