import * as THREE from "three";
import {
  TUBE_RADIUS,
  TUBE_SEGMENTS,
  TUBE_RADIAL_SEG,
  O2_ZONE_START,
  O2_ZONE_END,
  ALVEOLI_MAX_OPACITY,
  ALVEOLI_EMISSIVE_MAX,
} from "../../utils/constants.js";

// The alveoli zone is a tubular overlay that appears in the oxygen scenario to indicate where RBCs can pick up oxygen.
//  It has a pulsing animation to make it visually distinct, and its intensity can be smoothly controlled.
// The geometry is built from a sub-sampled segment of the main tube curve, so it fits perfectly on the wall.
const ZONE_FRACTION = O2_ZONE_END - O2_ZONE_START;
const ZONE_SEGMENTS = Math.round(TUBE_SEGMENTS * ZONE_FRACTION);
const ZONE_POINTS = ZONE_SEGMENTS + 1;

// Class representing the alveoli zone overlay in the oxygen scenario. I
// t creates a tubular mesh that follows the main curve between O2_ZONE_START and O2_ZONE_END,
// and allows controlling its visibility and emissiveness with a pulsing effect.
// The zone serves both as a visual indicator of where oxygen diffusion occurs,
// and as a subtle light source that illuminates the RBCs and wall before the camera enters.
export class AlveoliZone {
  #mesh = null;
  #mat = null;
  #scene = null;

  #pulseT = 0;

  // Constructor creates the tubular mesh for the alveoli zone and adds it to the scene.
  // The geometry is created from a curve that follows the main tube's path between O2_ZONE_START and O2_ZONE_END.
  // The material is initially invisible and non-emissive, but can be controlled via setIntensity().
  constructor(scene, curve) {
    this.#scene = scene;

    const pts = [];
    for (let i = 0; i < ZONE_POINTS; i++) {
      const t =
        O2_ZONE_START + (i / (ZONE_POINTS - 1)) * (O2_ZONE_END - O2_ZONE_START);
      pts.push(curve.getPointAt(t));
    }
    const zoneCurve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);

    const geo = new THREE.TubeGeometry(
      zoneCurve,
      ZONE_SEGMENTS,
      TUBE_RADIUS * 1.03,
      TUBE_RADIAL_SEG,
      false,
    );

    this.#mat = new THREE.MeshStandardMaterial({
      color: 0xff88aa,
      emissive: 0xff2255,
      emissiveIntensity: 0,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.#mesh = new THREE.Mesh(geo, this.#mat);
    scene.add(this.#mesh);
  }

  // controls the intensity of the zone's visibility and emissiveness.
  // The input intensity is expected to be in the range [0, 1], and it applies a soft pulsing effect on top of that for visual interest.
  setIntensity(intensity, delta = 0) {
    this.#pulseT += delta * 1.2;
    const pulse = intensity * (1 + 0.08 * Math.sin(this.#pulseT));

    this.#mat.opacity = Math.min(
      pulse * ALVEOLI_MAX_OPACITY,
      ALVEOLI_MAX_OPACITY,
    );
    this.#mat.emissiveIntensity = Math.min(
      pulse * ALVEOLI_EMISSIVE_MAX,
      ALVEOLI_EMISSIVE_MAX,
    );
  }

  destroy() {
    this.#scene.remove(this.#mesh);
    this.#mesh.geometry.dispose();
    this.#mat.dispose();
  }
}
