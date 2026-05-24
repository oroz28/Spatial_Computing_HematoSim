import * as THREE from "three";
// Function to create the scene object where all 3D elements will be added.
// It simply returns a new instance of THREE.Scene, which serves as the container for all objects, lights, and cameras in the 3D environment.
export function createScene() {
  return new THREE.Scene();
}
