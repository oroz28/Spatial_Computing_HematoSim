import { Bacterium } from "../../entities/bacteria.js";
import { BACTERIA_MAX } from "../../utils/constants.js";
import { wrapT } from "../../utils/math.js";

// Class responsible for spawning bacteria in the bloodstream at a certain rate. It manages a timer to determine when to spawn new bacteria,
// and ensures that the number of bacteria does not exceed a specified maximum. It can also spawn bacteria ahead of the camera's current position.
export class Spawner {
  #timer = 0;
  #scene = null;
  #curve = null;

  constructor(scene, curve) {
    this.#scene = scene;
    this.#curve = curve;
  }

  // Public method to update the spawner each frame. It takes in the delta time, the current spawn rate, the array of existing bacteria, the interval for spawning,
  // and optional parameters for spawning bacteria ahead of the camera's position.
  // If the timer exceeds the effective interval, it spawns a new bacterium if the maximum has not been reached.
  update(
    delta,
    spawnRate,
    bacteria,
    interval,
    anchorT = null,
    aheadMin = 0.03,
    aheadMax = 0.12,
  ) {
    this.#timer += delta;
    const effective = interval / Math.max(spawnRate, 0.01);

    if (this.#timer >= effective) {
      this.#timer = 0;
      if (bacteria.length < BACTERIA_MAX) {
        const types = ["COCCUS", "BACILLUS", "SPIRILLA"];
        const type = types[Math.floor(Math.random() * types.length)];
        const spawnT =
          anchorT !== null
            ? wrapT(anchorT + aheadMin + Math.random() * (aheadMax - aheadMin))
            : Math.random();
        bacteria.push(new Bacterium(this.#scene, this.#curve, type, spawnT));
      }
    }
  }
}
