/**
 * Intermittent, texel-snapped shadow-map updates for mobile directional lights.
 * Texel snapping eliminates shadow shimmering/crawling while moving, and
 * intermittent cadence cuts GPU shadow-pass cost on mid-range SoCs.
 */

import * as THREE from 'three';
import { isMobileGpuTarget } from './gpuBudget';

export interface ShadowBudgetState {
  accumSec: number;
  lastPlayerX: number;
  lastPlayerZ: number;
  forceNext: boolean;
}

export function createShadowBudgetState(): ShadowBudgetState {
  return {
    accumSec: 0,
    lastPlayerX: Number.NaN,
    lastPlayerZ: Number.NaN,
    forceNext: true,
  };
}

/**
 * Call once after enabling shadows / resizing shadow map.
 */
export function configureIntermittentShadows(renderer: THREE.WebGLRenderer): void {
  if (!renderer.shadowMap.enabled) return;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}

/**
 * Updates shadow maps only when the player moved enough or the interval elapsed.
 * Keeps visuals stable while cutting GPU cost on mobile.
 */
export function tickShadowBudget(
  renderer: THREE.WebGLRenderer,
  state: ShadowBudgetState,
  playerPos: { x: number; z: number },
  dt: number,
  opts?: {
    /** Seconds between forced refreshes while mostly still. */
    intervalSec?: number;
    /** Planar move (meters) that forces an immediate refresh. */
    moveThreshold?: number;
  }
): void {
  if (!renderer.shadowMap.enabled) return;

  const isMobile = isMobileGpuTarget();
  const intervalSec = opts?.intervalSec ?? (isMobile ? 0.26 : 0.14);
  const moveThreshold = opts?.moveThreshold ?? (isMobile ? 1.25 : 0.65);
  const moveThresholdSq = moveThreshold * moveThreshold;

  state.accumSec += dt;

  const moved =
    Number.isFinite(state.lastPlayerX) &&
    (() => {
      const dx = playerPos.x - state.lastPlayerX;
      const dz = playerPos.z - state.lastPlayerZ;
      return dx * dx + dz * dz >= moveThresholdSq;
    })();

  if (state.forceNext || moved || state.accumSec >= intervalSec) {
    renderer.shadowMap.needsUpdate = true;
    state.accumSec = 0;
    state.forceNext = false;
    state.lastPlayerX = playerPos.x;
    state.lastPlayerZ = playerPos.z;
  }
}

export function requestShadowRefresh(state: ShadowBudgetState): void {
  state.forceNext = true;
}

// Pre-allocated zero-GC scratch math for texel-snapped directional shadows
const _sunDir = new THREE.Vector3(0.45, 0.78, 0.35).normalize();
const _upVec = new THREE.Vector3(0, 1, 0);
const _lightRight = new THREE.Vector3();
const _lightUp = new THREE.Vector3();
const _snappedTarget = new THREE.Vector3();
const _lightPos = new THREE.Vector3();

/**
 * Tightens the directional shadow camera around the player with light-space
 * texel snapping so shadow edges stay rock-solid (zero shimmering while walking)
 * and align accurately with the active sky sun direction.
 */
export function followKeyLightShadowFrustum(
  keyLight: THREE.DirectionalLight,
  playerPos: THREE.Vector3,
  opts?: {
    distance?: number;
    radius?: number;
    sunDirection?: THREE.Vector3 | null;
  }
): void {
  if (!keyLight.castShadow) return;

  const isMobile = isMobileGpuTarget();
  const distance = opts?.distance ?? 52;
  const radius = opts?.radius ?? (isMobile ? 30 : 36);
  const cam = keyLight.shadow.camera;

  if (opts?.sunDirection && opts.sunDirection.lengthSq() > 0.001) {
    _sunDir.copy(opts.sunDirection).normalize();
  } else {
    _sunDir.set(0.42, 0.82, 0.36).normalize();
  }

  // Orthonormal basis perpendicular to the sun ray for light-space texel snapping
  if (Math.abs(_sunDir.y) > 0.98) {
    _upVec.set(0, 0, 1);
  } else {
    _upVec.set(0, 1, 0);
  }
  _lightRight.crossVectors(_upVec, _sunDir).normalize();
  _lightUp.crossVectors(_sunDir, _lightRight).normalize();

  const mapDim = Math.max(256, keyLight.shadow.mapSize.width || 1024);
  const worldUnitsPerTexel = (radius * 2) / mapDim;

  // Project playerPos onto light basis and snap to whole shadow texels
  const u = Math.round(playerPos.dot(_lightRight) / worldUnitsPerTexel) * worldUnitsPerTexel;
  const v = Math.round(playerPos.dot(_lightUp) / worldUnitsPerTexel) * worldUnitsPerTexel;
  const w = playerPos.dot(_sunDir);

  _snappedTarget
    .set(0, 0, 0)
    .addScaledVector(_lightRight, u)
    .addScaledVector(_lightUp, v)
    .addScaledVector(_sunDir, w);

  keyLight.target.position.copy(_snappedTarget);
  keyLight.target.updateMatrixWorld();

  _lightPos.copy(_snappedTarget).addScaledVector(_sunDir, distance);
  keyLight.position.copy(_lightPos);

  if (
    cam.left !== -radius ||
    cam.right !== radius ||
    cam.top !== radius ||
    cam.bottom !== -radius ||
    cam.far !== distance + radius + 48
  ) {
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = distance + radius + 48;
    cam.updateProjectionMatrix();
  }
}
