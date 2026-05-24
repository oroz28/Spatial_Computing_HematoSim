import * as THREE from "three";

// Tube geometry parameters
export const TUBE_RADIUS = 4;
export const TUBE_SEGMENTS = 200;
export const TUBE_RADIAL_SEG = 16;
export const PATH_POINTS = 12;
export const PATH_SCALE = 18;

// Camera parameters
export const CAM_SPEED_DEFAULT = 0.008;
export const CAM_LOOK_AHEAD = 0.015;
export const CAM_FOV = 75;
export const CAM_NEAR = 0.1;
export const CAM_FAR = 200;
export const CAM_MOUSE_STRENGTH = 0.05;

// RBC parameters
export const RBC_COUNT = 120;
export const RBC_SPEED_BASE = 0.01;
export const RBC_RADIUS = 0.38;
export const RBC_COLOR = 0xd62828;
export const RBC_SPREAD = 0.72;

// Bacteria parameters
export const BACTERIA_MAX = 40;
export const BACTERIA_SPAWN_INTERVAL = 3.5;
export const BACTERIA_SPEED = 0.006;
export const BACTERIA_WANDER = 0.6;
export const BACTERIA_TYPES = {
  COCCUS: { color: 0x38b000, scale: 0.38, geometry: "sphere" },
  BACILLUS: { color: 0xffb703, scale: 0.45, geometry: "cylinder" },
  SPIRILLA: { color: 0x8338ec, scale: 0.4, geometry: "icosahedron" },
};

// WBC parameters
export const WBC_COUNT = 8;
export const WBC_SPEED = 0.01;
export const WBC_CHASE_SPEED = 1.4;
export const WBC_DETECT_RADIUS = 5.5;
export const WBC_KILL_RADIUS = 1.0;
export const WBC_COLOR = 0xddeeff;
export const WBC_RADIUS = 0.55;

// Infection parameters
export const INFECTION_DECAY = 0.001;

// Plasma parameters
export const PLASMA_COUNT = 800;
export const PLASMA_COLOR = 0xffe8a0;
export const PLASMA_OPACITY = 0.28;

// General scene parameters
export const FOG_COLOR = 0x8b0000;
export const FOG_NEAR = 6;
export const FOG_FAR = 28;
export const AMBIENT_INTENSITY = 0.4;
export const POINT_INTENSITY = 2.2;

// Alveoli zone parameters
export const O2_ZONE_START = 0.3;
export const O2_ZONE_END = 0.72;
export const ALVEOLI_MAX_OPACITY = 0.3;
export const ALVEOLI_EMISSIVE_MAX = 0.65;

// RBC colours and transition for oxygenation state
export const RBC_COLOR_DEOXY = 0x493273;
export const RBC_COLOR_OXY = 0xff1111;
export const RBC_COLOR_LERP = 0.05;
export const O2_ZONE_PRE_WARN = 0.08;

// O2 particles
export const O2_PARTICLE_COUNT = 120;
export const O2_PARTICLE_SPEED = 1.3;
export const O2_PARTICLE_SIZE = 0.125;
export const O2_COLOR = 0x44eeff;
export const O2_ABSORB_RADIUS = 1.2;

// Wound base parameters (these are multiplied by woundSize at runtime)
export const MAX_STRANDS = 120;
export const FIBRIN_RADIUS = 1.6;
export const FIBRIN_COLOR = new THREE.Color(0xe8c060);
export const CROSS_RATIO = 0.35;
export const WOUND_JET_SPAWN_RATE = 50;
export const WOUND_JET_SPEED_MIN = 1.5;
export const WOUND_JET_SPEED_MAX = 3.5;
export const WOUND_JET_SPREAD = 0.3;
export const WOUND_RBC_ESCAPE_MAX = 14;
export const WOUND_RBC_ATTRACT_WINDOW = 0.06;
export const WOUND_RBC_REACH_DIST = 1.2;
