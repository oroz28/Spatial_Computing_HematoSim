import * as THREE from "three";
import {
  RBC_COUNT,
  O2_ZONE_START,
  O2_ZONE_END,
  RBC_COLOR_DEOXY,
  RBC_COLOR_OXY,
  RBC_COLOR_LERP,
} from "../../utils/constants.js";

const _DEOXY = new THREE.Color(RBC_COLOR_DEOXY);
const _OXY = new THREE.Color(RBC_COLOR_OXY);

const _oxyFactor = new Float32Array(RBC_COUNT);
const _prevT = new Float32Array(RBC_COUNT).fill(-1);

// Class that manages the colors of the RBCs based on their position relative to the oxygen exchange zone.
// It lerps the color of each RBC from deoxy to oxy as it enters the zone, and back to deoxy as it leaves.
export class RBCColorSystem {
  #rbcSystem = null;
  #zoneActive = false;
  #scratch = new THREE.Color();

  // Constructor initializes the RBCColorSystem with a reference to the RBCSystem, and sets all RBCs to their initial deoxygenated color.
  constructor(rbcSystem) {
    this.#rbcSystem = rbcSystem;

    const deoxy = new THREE.Color(RBC_COLOR_DEOXY);
    for (let i = 0; i < RBC_COUNT; i++) {
      this.#rbcSystem.setInstanceColor(i, deoxy);
    }
    this.#rbcSystem.flushColors();
  }

  // Sets whether the oxygen exchange zone is active, which affects how the RBC colors are updated in the update() method.
  setZoneActive(active) {
    this.#zoneActive = active;
  }

  // Returns the oxygenation factor (0–1) for a single RBC instance, used by the hover picker to build a contextual label.
  getOxyFactor(instanceId) {
    return _oxyFactor[instanceId] ?? 0;
  }

  // Update method to be called each frame. It updates the color of each RBC based on its position relative to the oxygen exchange zone,
  // lerping between deoxy and oxy colors as appropriate. It also handles a slow decay of the oxygenation factor after leaving the zone to create a more natural transition.
  update(delta) {
    const lerpRate = RBC_COLOR_LERP * delta;

    for (let i = 0; i < RBC_COUNT; i++) {
      const t = this.#rbcSystem.getT(i);
      const prevT = _prevT[i];
      _prevT[i] = t;

      if (t >= O2_ZONE_START && t <= O2_ZONE_END && this.#zoneActive) {
        _oxyFactor[i] = Math.min(_oxyFactor[i] + lerpRate * 1.5, 1);
      } else if (t > O2_ZONE_END && t <= O2_ZONE_END + 0.1) {
        const distPast = t - O2_ZONE_END;
        const decayMul = distPast / 0.1;
        _oxyFactor[i] = Math.max(
          _oxyFactor[i] - lerpRate * 0.1 * decayMul,
          _oxyFactor[i] * 0.9995,
        );
      } else if (t > O2_ZONE_END + 0.1) {
        _oxyFactor[i] = Math.max(_oxyFactor[i] - lerpRate * 0.4, 0);
      } else if (t < O2_ZONE_START - 0.02) {
        _oxyFactor[i] = Math.max(_oxyFactor[i] - lerpRate * 0.4, 0);
      } else if (t >= O2_ZONE_START - 0.08 && t < O2_ZONE_START) {
        const fraction = (t - (O2_ZONE_START - 0.08)) / 0.08;
        const target = fraction * 0.15;
        _oxyFactor[i] += (target - _oxyFactor[i]) * lerpRate * 2;
      }

      this.#scratch.lerpColors(_DEOXY, _OXY, _oxyFactor[i]);
      this.#rbcSystem.setInstanceColor(i, this.#scratch);
    }

    this.#rbcSystem.flushColors();
  }

  // Oxygenation fraction is calculated as the proportion of RBCs that are mostly oxygenated (oxy factor >= 0.95).
  get oxygenatedFraction() {
    let count = 0;
    for (let i = 0; i < RBC_COUNT; i++) {
      if (_oxyFactor[i] >= 0.95) count++;
    }
    return count / RBC_COUNT;
  }

  destroy() {
    this.#rbcSystem.resetColors();
  }
}
