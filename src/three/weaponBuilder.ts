import * as THREE from 'three';
import { OpticType, ReloadPhase, WeaponId } from '../types/game';
import { ProceduralTextures } from './textures';
import { WeaponAttachmentSystem } from './attachmentSystem';
import { createSculptedFirstPersonWeaponGroup } from './sculptedFirearms';
import { getEquippedWeaponSkinId } from '../progression/loadoutSystem';
import { applyWeaponSkinToObject3D } from './weaponSkinMaterial';
import { createGameGltfLoader } from './gltfLoaderFactory';
import { resolveAssetUrl } from '../utils/assetUrl';
import { disposeObject3DResources } from './gpuBudget';
import {
  createKinemationArmsRig,
  getKinemationWeaponSpec,
  isKinemationWeapon,
} from './kinemationArmsRig';

// Direct GitHub Raw URLs & bundled local mirrors for all 8 animated 3D FPS weapons and Arms Rig
export const MARK_23_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/9cb9f466f8eebe34fde3e3149b0c0141455e0405/mark_23__animated_free.glb';
export const MARK_23_LOCAL_URL = '/models/mark_23_animated.glb';

export const P50_PISTOL_GITHUB_RAW_URL = MARK_23_GITHUB_RAW_URL;
export const P50_PISTOL_LOCAL_URL = MARK_23_LOCAL_URL;

export const SMG_45_GITHUB_RAW_URL =
  '/models/weapons/v18_engineer_smg.glb';
export const SMG_45_LOCAL_URL = '/models/weapons/v18_engineer_smg.glb';

export const SHOTGUN_12_GITHUB_RAW_URL = '/models/shotgun_animated.glb';
export const SHOTGUN_12_LOCAL_URL = '/models/shotgun_animated.glb';

export const SHOTGUN_SPAS_GITHUB_RAW_URL = '/models/weapons/automatic_shotgun.glb';
export const SHOTGUN_SPAS_LOCAL_URL = '/models/weapons/automatic_shotgun.glb';

export const M4_FPS_PACK_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/764ad262156d6371a9fdf172f30267aa431d5b78/Acessorio/Armas/fps_animated_carbine%20(1).glb';
export const M4_FPS_PACK_LOCAL_URL =
  '/models/weapons/fps_animated_carbine_m4.glb';

/**
 * Normalizes the 10,000x unbaked vertex coordinates on `Object_130` (M4A4 body)
 * and `Object_132` (M4A4 magazine) in `animated_fps_m4a4.glb` into bind-world
 * meters aligned with `Base_078` and `Mag_079`.
 */
export function normalizeAnimatedM4A4Model(modelScene: THREE.Object3D): void {
  const pBaseX = -0.07181;
  const pBaseY = 1.46559;
  const pBaseZ = 0.54038;
  const rawPivotX = 705.24015;
  const rawPivotY = -14655.95;
  const rawPivotZ = -5403.81;
  const yaw = Math.atan2(0.03083, 0.17067);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const seenBuffers = new Set<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
  modelScene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (mesh.name !== 'Object_130' && mesh.name !== 'Object_132') return;
    const pos = mesh.geometry?.attributes?.position;
    if (!pos || seenBuffers.has(pos)) return;
    seenBuffers.add(pos);

    const norm = mesh.geometry.attributes.normal;
    let modified = false;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) < 100) continue;
      const dx = -(pos.getX(i) - rawPivotX) * 0.0001;
      const dy = -(pos.getY(i) - rawPivotY) * 0.0001;
      const dz = -(pos.getZ(i) - rawPivotZ) * 0.0001;
      const rx = dx * cosY + dz * sinY;
      const ry = dy;
      const rz = -dx * sinY + dz * cosY;
      pos.setXYZ(i, pBaseX + rx, pBaseY + ry, pBaseZ + rz);

      if (norm) {
        const ndx = -norm.getX(i);
        const ndy = -norm.getY(i);
        const ndz = -norm.getZ(i);
        const nrx = ndx * cosY + ndz * sinY;
        const nry = ndy;
        const nrz = -ndx * sinY + ndz * cosY;
        const len = Math.hypot(nrx, nry, nrz) || 1;
        norm.setXYZ(i, nrx / len, nry / len, nrz / len);
      }
      modified = true;
    }
    if (modified) {
      pos.needsUpdate = true;
      if (norm) norm.needsUpdate = true;
      // Remove untransformed tangent buffer so Three.js computes accurate derivative tangents for normalMap
      if (mesh.geometry.attributes.tangent) {
        mesh.geometry.deleteAttribute('tangent');
      }
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  });
}

export const CARBINE_AR_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/b0fe43592a9e7ce99b6ea83c9eed5cbb63379323/fps_animated_carbine.glb';
export const CARBINE_AR_LOCAL_URL = '/models/fps_animated_carbine.glb';

export const AK47_RIFLE_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/b0fe43592a9e7ce99b6ea83c9eed5cbb63379323/fps_character_animation_pack_ak-47.glb';
export const AK47_RIFLE_LOCAL_URL = '/models/fps_ak47.glb';

export const AK12_RIFLE_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/25e11484b79c388dbcdb49cfa174cc7504beed05/Acessorio/Armas/ak-12animated.glb';
export const AK12_RIFLE_LOCAL_URL = '/models/weapons/ak-12animated.glb';

export const L49_LMG_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/dd881049230b5ee85f944448a09d25db91f0eb37/lmg_animated.glb';
export const L49_LMG_LOCAL_URL = '/models/lmg_animated.glb';

export const SNIPER_BOLT_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/b0fe43592a9e7ce99b6ea83c9eed5cbb63379323/sniper_animated.glb';
export const SNIPER_BOLT_LOCAL_URL = '/models/sniper_animated.glb';

export const SNIPER_TACTICAL_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/b0fe43592a9e7ce99b6ea83c9eed5cbb63379323/sniper_fps_animation.glb';
export const SNIPER_TACTICAL_LOCAL_URL = '/models/sniper_fps_animation.glb';

export const ARMS_RIG_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/03ecdb098c01e77ffdab4d819cc7f5aa43eafda0/arms_rig.glb';
export const ARMS_RIG_LOCAL_URL = '/models/arms_rig.glb';

export const KNIFE_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/cfac55452b306860453fb3785c4c485a322faa8a/knife_animated%20(1).glb';
export const KNIFE_LOCAL_URL = '/models/knife_animated.glb';

export const S_MILITARY_GITHUB_RAW_URL = '/models/weapons/s_military_ar.glb';
export const S_MILITARY_LOCAL_URL = '/models/weapons/s_military_ar.glb';

export interface TacticalWeaponRig {
  root: THREE.Group;
  gunGroup: THREE.Group;
  boltCarrier: THREE.Mesh;
  chargingHandle: THREE.Group;
  boltCatch: THREE.Mesh;
  fireSelector: THREE.Group;
  triggerMesh: THREE.Mesh;
  magazineGroup: THREE.Group;
  topCartridges: THREE.Mesh[];
  suppressorGroup: THREE.Group;
  flashHiderGroup: THREE.Group;
  holoSightGroup: THREE.Group;
  holoReticleMesh: THREE.Mesh;
  lpvoScopeGroup: THREE.Group;
  lpvoReticleMesh: THREE.Mesh;
  lpvoThrowLever: THREE.Mesh;
  redDotScopeGroup: THREE.Group;
  kolimatorScopeGroup: THREE.Group;
  ironSightsGroup: THREE.Group;
  cantedSightGroup: THREE.Group;
  cantedReticleMesh: THREE.Mesh;
  peqLaserBeam: THREE.Mesh;
  setOpticType: (optic: OpticType) => void;
  leftHandGroup: THREE.Group;
  rightHandGroup: THREE.Group;
  rightTriggerFinger: THREE.Group;
  setActiveWeapon: (weaponId: WeaponId) => void;
  applyWeaponSkin: (weaponId: WeaponId, skinId: string) => void;
  setTriggerPull: (pullAlpha: number) => void;
  triggerFireAnimation: (isAds?: boolean) => void;
  triggerReloadAnimation: (durationSec: number) => void;
  triggerShotgunShellInsertAnimation: (
    durationSec?: number,
    totalReloadDurationSec?: number
  ) => void;
  triggerShotgunPumpAnimation: (durationSec?: number) => void;
  triggerBoltAnimation: () => void;
  triggerInspectAnimation: () => void;
  triggerEquipAnimation: () => void;
  triggerHolsterAnimation: () => void;
  updateGlbAnimations: (
    dt: number,
    isMoving?: boolean,
    isAds?: boolean,
    reloadPhase?: ReloadPhase,
    reloadProgress?: number
  ) => void;
  /** True when active pack has real Walk/Run clips (AK-47 today). */
  activePackHasWalkRunClips: () => boolean;
  muzzleFlashGroup: THREE.Group;
  muzzleLight: THREE.PointLight;
  ejectionPortWorldPos: THREE.Object3D;
  muzzleWorldPos: THREE.Object3D;
  laserOriginWorldPos: THREE.Object3D;
  armsRigContainer: THREE.Group;
  attachmentSystem: WeaponAttachmentSystem;
  prewarmLoadout: (weaponIds: WeaponId[]) => void;
  pruneUnusedWeapons: (keepIds: WeaponId[]) => void;
  dispose: () => void;
}

export const SCOPE_OPTICAL_CENTERS: Record<
  Exclude<OpticType, 'iron'>,
  { opticalHeightY: number; rearLensZ: number; eyeRelief: number }
> = {
  red_dot: {
    opticalHeightY: 0.02331,
    rearLensZ: -0.0087,
    eyeRelief: 0.135,
  },
  kolimator: {
    opticalHeightY: 0.01922,
    rearLensZ: 0.022,
    eyeRelief: 0.135,
  },
  holo: {
    opticalHeightY: 0.03151,
    rearLensZ: -0.0109,
    eyeRelief: 0.145,
  },
  lpvo: {
    opticalHeightY: 0.02361,
    rearLensZ: 0.0828,
    eyeRelief: 0.105,
  },
};

export const WEAPON_RAIL_MOUNTS: Record<
  WeaponId,
  { pos: [number, number, number]; scale: number }
> = {
  P50_PISTOL: { pos: [0, 0.02, -0.01], scale: 0.68 },
  M1911_PISTOL: { pos: [0, 0.015, 0.0], scale: 0.65 },
  SMG_45: { pos: [0, 0.072, -0.02], scale: 0.78 },
  SMG_MP5: { pos: [0, 0.038, -0.03], scale: 0.78 },
  SHOTGUN_12: { pos: [0, 0.025, 0.0], scale: 0.82 },
  SHOTGUN_SPAS: { pos: [0, 0.072, -0.04], scale: 0.84 },
  M4_CARBINE: { pos: [0, 0.016, 0.01], scale: 0.88 },
  CARBINE_AR: { pos: [0, 0.04, -0.01], scale: 0.88 },
  S_MILITARY: { pos: [-0.002, 0.024, -0.02], scale: 0.9 },
  AK47_RIFLE: { pos: [0, 0.042, -0.02], scale: 0.86 },
  AK12_RIFLE: { pos: [-0.0014, 0.047, -0.02], scale: 0.86 },
  L49_LMG: { pos: [0, 0.068, -0.03], scale: 0.88 },
  SNIPER_BOLT: { pos: [0, 0.02, -0.02], scale: 0.88 },
  SNIPER_TACTICAL: { pos: [-0.0016, 0.021, -0.04], scale: 0.88 },
  SNIPER_AWP: { pos: [0, 0.06, -0.04], scale: 0.9 },
  SNIPER_HEAVY: { pos: [0, 0.07, -0.04], scale: 0.9 },
  RPG7_LAUNCHER: { pos: [0.008, 0.095, -0.01], scale: 0.8 },
  KNIFE_TACTICAL: { pos: [0, 0, 0], scale: 1.0 },
};

const _ikShoulderWorld = new THREE.Vector3();
const _ikTargetWorld = new THREE.Vector3();
const _ikDiff = new THREE.Vector3();
const _ikDir = new THREE.Vector3();
const _ikPoleVec = new THREE.Vector3();
const _ikOrthoPole = new THREE.Vector3();
const _ikUpperDir = new THREE.Vector3();
const _ikElbowWorld = new THREE.Vector3();
const _ikParentQuat = new THREE.Quaternion();
const _ikCurEndWorld = new THREE.Vector3();
const _ikCurDir = new THREE.Vector3();
const _ikDesDir = new THREE.Vector3();
const _ikDeltaWorldQuat = new THREE.Quaternion();
const _ikCurWorldQuat = new THREE.Quaternion();
const _ikNewWorldQuat = new THREE.Quaternion();
const _ikTargetHandQuat = new THREE.Quaternion();
const _ikHandParentQuat = new THREE.Quaternion();
const _ikBonePos = new THREE.Vector3();
const _adsTransformOut = { pos: new THREE.Vector3(), rotZ: 0 };

const _gunSpaceMat = new THREE.Matrix4();
const _deltaBoneMat = new THREE.Matrix4();
const _deltaBonePos = new THREE.Vector3();
const _deltaBoneQuat = new THREE.Quaternion();
const _deltaBoneScale = new THREE.Vector3();
const _ancestorChain: THREE.Object3D[] = [];

function computeNodeMatrixInGunSpace(
  node: THREE.Object3D,
  gunRoot: THREE.Object3D,
  out: THREE.Matrix4
): THREE.Matrix4 {
  _ancestorChain.length = 0;
  let cur: THREE.Object3D | null = node;
  while (cur && cur !== gunRoot) {
    _ancestorChain.push(cur);
    cur = cur.parent;
  }
  out.identity();
  for (let i = _ancestorChain.length - 1; i >= 0; i--) {
    const obj = _ancestorChain[i];
    obj.updateMatrix();
    out.multiply(obj.matrix);
  }
  return out;
}

const ARMS_RIG_CANONICAL_JOINTS = [
  'root',
  'shoulder.R',
  'upper_arm.R',
  'forearm.R',
  'hand.R',
  'palm.01.R',
  'f_index.01.R',
  'f_index.02.R',
  'f_index.03.R',
  'thumb.01.R',
  'thumb.02.R',
  'thumb.03.R',
  'palm.02.R',
  'f_middle.01.R',
  'f_middle.02.R',
  'f_middle.03.R',
  'palm.03.R',
  'f_ring.01.R',
  'f_ring.02.R',
  'f_ring.03.R',
  'palm.04.R',
  'f_pinky.01.R',
  'f_pinky.02.R',
  'f_pinky.03.R',
  'shoulder.L',
  'upper_arm.L',
  'forearm.L',
  'hand.L',
  'palm.01.L',
  'f_index.01.L',
  'f_index.02.L',
  'f_index.03.L',
  'thumb.01.L',
  'thumb.02.L',
  'thumb.03.L',
  'palm.02.L',
  'f_middle.01.L',
  'f_middle.02.L',
  'f_middle.03.L',
  'palm.03.L',
  'f_ring.01.L',
  'f_ring.02.L',
  'f_ring.03.L',
  'palm.04.L',
  'f_pinky.01.L',
  'f_pinky.02.L',
  'f_pinky.03.L',
  'hand_ik.R',
  'elbow_ik.R',
  'hand_ik.L',
  'elbow_ik.L',
  'Hold_Point',
] as const;

interface FirstPersonArmsRigController {
  container: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  bones: Record<string, THREE.Object3D>;
  qOpen: Record<string, THREE.Quaternion>;
  qGrip: Record<string, THREE.Quaternion>;
  playClip: (clipName: string, loop?: boolean, timeScale?: number) => void;
  solveAndPose: (
    dt: number,
    rightTargetObj: THREE.Object3D,
    leftTargetObj: THREE.Object3D,
    rightPoleDir: THREE.Vector3,
    leftPoleDir: THREE.Vector3,
    rightGripAlpha: number,
    leftGripAlpha: number,
    triggerPullAlpha: number,
    leftThumbAlpha: number
  ) => void;
}

/**
 * Preserves the embedded 512x512 `arms_01` texture (`origMat.map`) and `TEXCOORD_0` UVs from `arms_rig.glb`
 * while adding subtle micro-grain bump mapping (`textures.gloveBump`) and balanced PBR roughness.
 */
function enhanceArmsRigMaterial(
  mesh: THREE.SkinnedMesh,
  textures: ProceduralTextures
) {
  const applyToMat = (mat: THREE.Material) => {
    const stdMat = mat as THREE.MeshStandardMaterial;
    if (stdMat.map) {
      stdMat.map.colorSpace = THREE.SRGBColorSpace;
      stdMat.map.needsUpdate = true;
    }
    stdMat.color.setHex(0xffffff);
    stdMat.vertexColors = false;
    stdMat.roughness = 0.62;
    stdMat.metalness = 0.05;
    stdMat.bumpMap = textures.gloveBump;
    stdMat.bumpScale = 0.0018;
    stdMat.needsUpdate = true;
  };

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(applyToMat);
  } else if (mesh.material) {
    applyToMat(mesh.material);
  }
}

/**
 * Loads and configures the complete 2-arm skeletal rig (`arms_rig.glb`)
 * with its 18 embedded animations, Two-Bone Analytic IK solver (`upper_arm -> forearm -> hand`),
 * and exact artist-authored finger pose interpolation (`rest` <-> `guard_idle` / `knife_idle`)
 * with dedicated trigger finger (`f_index.01..03.R`) placement and squeeze.
 */
function setupFirstPersonArmsRig(
  gltfScene: THREE.Group,
  animations: THREE.AnimationClip[],
  container: THREE.Group,
  textures: ProceduralTextures
): FirstPersonArmsRigController {
  const bones: Record<string, THREE.Object3D> = {};
  const qOpen: Record<string, THREE.Quaternion> = {};
  const qGrip: Record<string, THREE.Quaternion> = {};
  const actions: Record<string, THREE.AnimationAction> = {};

  const registerBoneAlias = (key: string, obj: THREE.Object3D) => {
    if (!key) return;
    bones[key] = obj;
    const sanitized = key.replace(/\./g, '');
    bones[sanitized] = obj;
  };

  gltfScene.traverse((obj) => {
    obj.frustumCulled = false;
    if (obj.name) {
      registerBoneAlias(obj.name, obj);
    }
    if (obj.userData && typeof obj.userData.name === 'string') {
      registerBoneAlias(obj.userData.name, obj);
    }
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const skMesh = obj as THREE.SkinnedMesh;
      skMesh.frustumCulled = false;
      skMesh.castShadow = false;
      skMesh.receiveShadow = true;
      enhanceArmsRigMaterial(skMesh, textures);
      if (skMesh.skeleton && skMesh.skeleton.bones) {
        skMesh.skeleton.bones.forEach((b, idx) => {
          const canonicalName = ARMS_RIG_CANONICAL_JOINTS[idx];
          if (canonicalName && b) {
            registerBoneAlias(canonicalName, b);
          }
          if (b && b.name) {
            registerBoneAlias(b.name, b);
          }
        });
      }
    } else if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
  });

  container.add(gltfScene);
  container.updateMatrixWorld(true);

  const mixer = new THREE.AnimationMixer(gltfScene);
  animations.forEach((clip) => {
    const act = mixer.clipAction(clip);
    actions[clip.name] = act;
  });

  const stopAllActions = () => {
    Object.values(actions).forEach((act) => {
      act.stop();
      act.weight = 0;
    });
  };

  // Sample exact artist-authored open-hand quaternions from 'rest' clip
  if (actions['rest']) {
    stopAllActions();
    actions['rest'].weight = 1.0;
    actions['rest'].play();
    mixer.setTime(0);
    container.updateMatrixWorld(true);
    Object.keys(bones).forEach((name) => {
      qOpen[name] = bones[name].quaternion.clone();
    });
  } else {
    Object.keys(bones).forEach((name) => {
      qOpen[name] = bones[name].quaternion.clone();
    });
  }

  // Sample exact artist-authored closed-grip quaternions from 'guard_idle' / 'knife_idle'
  const gripClipName = actions['guard_idle']
    ? 'guard_idle'
    : actions['knife_idle']
      ? 'knife_idle'
      : null;
  if (gripClipName && actions[gripClipName]) {
    stopAllActions();
    actions[gripClipName].weight = 1.0;
    actions[gripClipName].play();
    mixer.setTime(0);
    container.updateMatrixWorld(true);
    Object.keys(bones).forEach((name) => {
      qGrip[name] = bones[name].quaternion.clone();
    });
  } else {
    Object.keys(bones).forEach((name) => {
      qGrip[name] = bones[name].quaternion.clone();
    });
  }

  // Start default 'guard_idle' animation on the rig
  stopAllActions();
  if (actions['guard_idle']) {
    actions['guard_idle'].setLoop(THREE.LoopRepeat, Infinity);
    actions['guard_idle'].weight = 1.0;
    actions['guard_idle'].play();
  }

  const playClip = (clipName: string, loop = false, timeScale = 1.0) => {
    const act = actions[clipName];
    if (!act) return;
    Object.entries(actions).forEach(([name, a]) => {
      if (name !== clipName && name !== 'guard_idle') {
        a.stop();
      }
    });
    act.setLoop(
      loop ? THREE.LoopRepeat : THREE.LoopOnce,
      loop ? Infinity : 1
    );
    act.clampWhenFinished = !loop;
    act.timeScale = timeScale;
    act.weight = 1.0;
    act.reset();
    act.play();
  };

  // Analytic Swing-Preserving Two-Bone IK Solver (preserves twist roll of ArmsMesh)
  const alignBoneWorldY = (
    bone: THREE.Object3D,
    endChild: THREE.Object3D,
    desiredTargetWorld: THREE.Vector3
  ) => {
    bone.parent!.updateMatrixWorld(true);
    bone.updateMatrixWorld(true);
    endChild.updateMatrixWorld(true);

    _ikBonePos.setFromMatrixPosition(bone.matrixWorld);
    _ikCurEndWorld.setFromMatrixPosition(endChild.matrixWorld);
    _ikCurDir.subVectors(_ikCurEndWorld, _ikBonePos).normalize();
    _ikDesDir.subVectors(desiredTargetWorld, _ikBonePos).normalize();

    _ikDeltaWorldQuat.setFromUnitVectors(_ikCurDir, _ikDesDir);
    bone.getWorldQuaternion(_ikCurWorldQuat);
    _ikNewWorldQuat.multiplyQuaternions(_ikDeltaWorldQuat, _ikCurWorldQuat);

    bone.parent!.getWorldQuaternion(_ikParentQuat);
    bone.quaternion.copy(_ikParentQuat.invert().multiply(_ikNewWorldQuat));
    bone.updateMatrixWorld(true);
  };

  const solveTwoBoneArmIK = (
    upperArmKey: string,
    forearmKey: string,
    handKey: string,
    targetObj: THREE.Object3D,
    poleDirWorld: THREE.Vector3
  ) => {
    const upperArm = bones[upperArmKey];
    const forearm = bones[forearmKey];
    const hand = bones[handKey];
    if (!upperArm || !forearm || !hand) return;

    // Reset to canonical artist-authored arm roll each frame before solving swing IK so twist never accumulates
    if (qGrip[upperArmKey]) {
      upperArm.quaternion.copy(qGrip[upperArmKey]);
    }
    if (qGrip[forearmKey]) {
      forearm.quaternion.copy(qGrip[forearmKey]);
    }

    const scale = container.scale.x || 0.76;
    const L1 = 0.32224 * scale;
    const L2 = 0.23732 * scale;

    upperArm.parent!.updateMatrixWorld(true);
    upperArm.updateMatrixWorld(true);
    _ikShoulderWorld.setFromMatrixPosition(upperArm.matrixWorld);

    targetObj.updateMatrixWorld(true);
    _ikTargetWorld.setFromMatrixPosition(targetObj.matrixWorld);

    _ikDiff.subVectors(_ikTargetWorld, _ikShoulderWorld);
    const dist = Math.min(
      Math.max(_ikDiff.length(), Math.abs(L1 - L2) + 0.005),
      L1 + L2 - 0.002
    );
    _ikDir.copy(_ikDiff).normalize();

    const cosA = THREE.MathUtils.clamp(
      (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist),
      -1,
      1
    );
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    // Transform downward-outward elbow pole direction using gunGroup/parent world rotation so elbows stay below screen bottom
    if (container.parent) {
      container.parent.getWorldQuaternion(_ikParentQuat);
      _ikPoleVec.copy(poleDirWorld).applyQuaternion(_ikParentQuat);
    } else {
      _ikPoleVec.copy(poleDirWorld);
    }

    _ikOrthoPole
      .copy(_ikPoleVec)
      .addScaledVector(_ikDir, -_ikPoleVec.dot(_ikDir));
    if (_ikOrthoPole.lengthSq() < 1e-6) {
      _ikOrthoPole.set(0, -1, 0);
    } else {
      _ikOrthoPole.normalize();
    }

    _ikUpperDir
      .copy(_ikDir)
      .multiplyScalar(cosA)
      .addScaledVector(_ikOrthoPole, sinA)
      .normalize();
    _ikElbowWorld
      .copy(_ikShoulderWorld)
      .addScaledVector(_ikUpperDir, L1);

    alignBoneWorldY(upperArm, forearm, _ikElbowWorld);
    alignBoneWorldY(forearm, hand, _ikTargetWorld);

    // Match hand world orientation directly to targetObj
    targetObj.getWorldQuaternion(_ikTargetHandQuat);
    hand.parent!.getWorldQuaternion(_ikHandParentQuat);
    hand.quaternion.copy(
      _ikHandParentQuat.invert().multiply(_ikTargetHandQuat)
    );
    hand.updateMatrixWorld(true);
  };

  const setBonePoseSlerp = (name: string, alpha: number) => {
    const b = bones[name];
    const qo = qOpen[name];
    const qg = qGrip[name];
    if (b && qo && qg) {
      b.quaternion.slerpQuaternions(
        qo,
        qg,
        THREE.MathUtils.clamp(alpha, 0, 1.25)
      );
    }
  };

  const setFingerChainSlerp = (
    prefix: string,
    sideSuffix: 'L' | 'R',
    c1: number,
    c2: number,
    c3: number
  ) => {
    setBonePoseSlerp(`${prefix}.01.${sideSuffix}`, c1);
    setBonePoseSlerp(`${prefix}.02.${sideSuffix}`, c2);
    setBonePoseSlerp(`${prefix}.03.${sideSuffix}`, c3);
  };

  const solveAndPose = (
    dt: number,
    rightTargetObj: THREE.Object3D,
    leftTargetObj: THREE.Object3D,
    rightPoleDir: THREE.Vector3,
    leftPoleDir: THREE.Vector3,
    rightGripAlpha: number,
    leftGripAlpha: number,
    triggerPullAlpha: number,
    leftThumbAlpha: number
  ) => {
    mixer.update(dt);

    // Keep root and shoulders anchored cleanly so the IK chain originates from low tactical shoulder sockets below screen
    const rootBone = bones['root'];
    if (rootBone && qGrip['root']) {
      rootBone.quaternion.copy(qGrip['root']);
    }
    const shoulderR = bones['shoulder.R'];
    const shoulderL = bones['shoulder.L'];
    if (shoulderR && qGrip['shoulder.R']) {
      shoulderR.quaternion.copy(qGrip['shoulder.R']);
    }
    if (shoulderL && qGrip['shoulder.L']) {
      shoulderL.quaternion.copy(qGrip['shoulder.L']);
    }

    container.updateMatrixWorld(true);

    solveTwoBoneArmIK(
      'upper_arm.R',
      'forearm.R',
      'hand.R',
      rightTargetObj,
      rightPoleDir
    );

    solveTwoBoneArmIK(
      'upper_arm.L',
      'forearm.L',
      'hand.L',
      leftTargetObj,
      leftPoleDir
    );

    // Pose Right Hand:
    // - palm.01..04.R & middle/ring/pinky wrap tightly around the pistol grip
    // - f_index.01..03.R reaches forward onto the weapon's trigger shoe and squeezes back when firing!
    // - thumb.01..03.R locks under the rear slide beavertail just like CS2 Desert Eagle
    const rg = THREE.MathUtils.clamp(rightGripAlpha, 0, 1.15);
    const trig = THREE.MathUtils.clamp(triggerPullAlpha, 0, 1);

    setBonePoseSlerp('palm.01.R', 0.85 * rg);
    setBonePoseSlerp('palm.02.R', 1.0 * rg);
    setBonePoseSlerp('palm.03.R', 1.0 * rg);
    setBonePoseSlerp('palm.04.R', 1.0 * rg);

    // Trigger Finger (Dedo no Gatilho):
    setFingerChainSlerp(
      'f_index',
      'R',
      0.24 * rg + trig * 0.42,
      0.55 * rg + trig * 0.38,
      0.55 * rg + trig * 0.38
    );
    setFingerChainSlerp('f_middle', 'R', 1.0 * rg, 1.0 * rg, 1.0 * rg);
    setFingerChainSlerp('f_ring', 'R', 1.0 * rg, 1.0 * rg, 1.0 * rg);
    setFingerChainSlerp('f_pinky', 'R', 1.0 * rg, 1.0 * rg, 1.0 * rg);
    setFingerChainSlerp('thumb', 'R', 0.68 * rg, 0.72 * rg, 0.7 * rg);

    // Pose Left Support Hand:
    const lg = THREE.MathUtils.clamp(leftGripAlpha, 0, 1.15);
    const lt = THREE.MathUtils.clamp(leftThumbAlpha, 0, 1.15);

    setBonePoseSlerp('palm.01.L', 0.95 * lg);
    setBonePoseSlerp('palm.02.L', 0.95 * lg);
    setBonePoseSlerp('palm.03.L', 0.95 * lg);
    setBonePoseSlerp('palm.04.L', 0.95 * lg);

    setFingerChainSlerp('f_index', 'L', 0.92 * lg, 0.95 * lg, 0.92 * lg);
    setFingerChainSlerp('f_middle', 'L', 0.96 * lg, 0.98 * lg, 0.95 * lg);
    setFingerChainSlerp('f_ring', 'L', 0.98 * lg, 1.0 * lg, 0.98 * lg);
    setFingerChainSlerp('f_pinky', 'L', 1.0 * lg, 1.0 * lg, 1.0 * lg);
    setFingerChainSlerp(
      'thumb',
      'L',
      0.65 * lg * lt,
      0.72 * lg * lt,
      0.68 * lg * lt
    );

    container.updateMatrixWorld(true);
  };

  return {
    container,
    mixer,
    actions,
    bones,
    qOpen,
    qGrip,
    playClip,
    solveAndPose,
  };
}

export function buildTacticalWeaponRig(
  textures: ProceduralTextures,
  isSoftwareGl: boolean,
  onSubtreeLoaded?: (subtree: THREE.Object3D) => void
): TacticalWeaponRig {
  const root = new THREE.Group();
  const gunGroup = new THREE.Group();
  root.add(gunGroup);

  // Dynamic motion anchor that mirrors the active weapon's ANIM_WeaponMotion position + rotation
  // Parenting hand IK targets & attachments to weaponMotionAnchor guarantees 100% lockstep motion!
  const weaponMotionAnchor = new THREE.Group();
  gunGroup.add(weaponMotionAnchor);

  let activeWeapon: WeaponId = 'P50_PISTOL';
  let animElapsed = 0;
  let disposed = false;
  let lruClock = 0;
  const MAX_LOADED_GLB_WEAPONS = 4;
  let keptWeaponIds = new Set<WeaponId>(['P50_PISTOL']);
  const pendingSkinByWeapon: Partial<Record<WeaponId, string>> = {};
  const sharedProcTexSet = new Set<THREE.Texture>(
    Object.values(textures).filter((v): v is THREE.Texture =>
      Boolean(v && (v as THREE.Texture).isTexture)
    )
  );

  // Shared Materials
  const matAnodizedUpper = new THREE.MeshPhysicalMaterial({
    color: 0x1a1e24,
    metalness: 0.88,
    roughness: 0.28,
    roughnessMap: textures.brushedMetalRoughness,
    anisotropy: isSoftwareGl ? 0 : 0.65,
    clearcoat: 0.15,
  });

  const matParkerizedSteel = new THREE.MeshStandardMaterial({
    color: 0x2c323b,
    metalness: 0.94,
    roughness: 0.22,
    roughnessMap: textures.brushedMetalRoughness,
  });

  const matBoltChrome = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.96,
    roughness: 0.16,
  });

  const matFdePolymer = new THREE.MeshStandardMaterial({
    color: 0x8c7355,
    metalness: 0.08,
    roughness: 0.78,
  });

  const matBlackPolymer = new THREE.MeshStandardMaterial({
    color: 0x14171c,
    metalness: 0.06,
    roughness: 0.82,
  });

  const matBrass = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.95,
    roughness: 0.18,
  });

  const matCopperJacket = new THREE.MeshStandardMaterial({
    color: 0xb87333,
    metalness: 0.92,
    roughness: 0.24,
  });

  const matLensGlass = new THREE.MeshPhysicalMaterial({
    color: 0x99f6e4,
    metalness: 0.1,
    roughness: 0.05,
    transmission: isSoftwareGl ? 0 : 0.88,
    transparent: true,
    opacity: isSoftwareGl ? 0.22 : 1.0,
    ior: 1.52,
    depthWrite: false,
  });

  // -------------------------------------------------------------------------
  // 1. PROCEDURAL M4 SOPMOD CARBINE BODY ('M4_CARBINE')
  // -------------------------------------------------------------------------
  const m4BodyGroup = new THREE.Group();
  m4BodyGroup.visible = false;
  weaponMotionAnchor.add(m4BodyGroup);

  const upperReceiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, 0.052, 0.24),
    matAnodizedUpper
  );
  upperReceiver.position.set(0, 0.01, 0.02);
  m4BodyGroup.add(upperReceiver);

  const lowerReceiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.058, 0.19),
    matAnodizedUpper
  );
  lowerReceiver.position.set(0, -0.035, 0.035);
  m4BodyGroup.add(lowerReceiver);

  const handguard = new THREE.Mesh(
    new THREE.BoxGeometry(0.046, 0.054, 0.32),
    matFdePolymer
  );
  handguard.position.set(0, 0.01, -0.25);
  m4BodyGroup.add(handguard);

  const m4Barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.01, 0.42, 14),
    matParkerizedSteel
  );
  m4Barrel.rotation.x = Math.PI / 2;
  m4Barrel.position.set(0, 0.01, -0.34);
  m4BodyGroup.add(m4Barrel);

  const m4PistolGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.095, 0.048),
    matFdePolymer
  );
  m4PistolGrip.position.set(0, -0.088, 0.092);
  m4PistolGrip.rotation.x = 0.28;
  m4BodyGroup.add(m4PistolGrip);

  const m4Stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.095, 0.18),
    matBlackPolymer
  );
  m4Stock.position.set(0, -0.015, 0.22);
  m4BodyGroup.add(m4Stock);

  const boltCarrier = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.02, 0.082),
    matBoltChrome
  );
  boltCarrier.position.set(0.018, 0.014, 0.005);
  m4BodyGroup.add(boltCarrier);

  const chargingHandle = new THREE.Group();
  chargingHandle.position.set(0, 0.028, 0.14);
  m4BodyGroup.add(chargingHandle);

  const boltCatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.026, 0.016),
    matParkerizedSteel
  );
  boltCatch.position.set(-0.024, -0.012, 0.005);
  m4BodyGroup.add(boltCatch);

  const fireSelector = new THREE.Group();
  fireSelector.position.set(0, -0.032, 0.088);
  m4BodyGroup.add(fireSelector);

  const triggerMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.007, 0.024, 0.008),
    matParkerizedSteel
  );
  triggerMesh.position.set(0, -0.056, 0.052);
  triggerMesh.rotation.x = 0.22;
  m4BodyGroup.add(triggerMesh);

  const magazineGroup = new THREE.Group();
  magazineGroup.position.set(0, -0.125, -0.014);
  const magBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.165, 0.068),
    matFdePolymer
  );
  magazineGroup.add(magBody);

  const topCartridges: THREE.Mesh[] = [];
  for (let c = 0; c < 2; c++) {
    const cartGroup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0046, 0.0048, 0.044, 10),
      matBrass
    );
    cartGroup.rotation.x = Math.PI / 2;
    cartGroup.position.set(
      c === 0 ? 0.004 : -0.004,
      0.085 - c * 0.006,
      -0.004
    );
    const bulletTip = new THREE.Mesh(
      new THREE.ConeGeometry(0.0044, 0.018, 10),
      matCopperJacket
    );
    bulletTip.position.set(0, 0.028, 0);
    cartGroup.add(bulletTip);
    magazineGroup.add(cartGroup);
    topCartridges.push(cartGroup);
  }
  m4BodyGroup.add(magazineGroup);

  const flashHiderGroup = new THREE.Group();
  flashHiderGroup.position.set(0, 0.01, -0.51);
  m4BodyGroup.add(flashHiderGroup);

  // -------------------------------------------------------------------------
  // 1B. SCULPTED PBR WEAPON FOR SMG_MP5
  // -------------------------------------------------------------------------

  const buildSmgMp5Group = (): THREE.Group => {
    return createSculptedFirstPersonWeaponGroup('SMG_MP5').group;
  };

  // -------------------------------------------------------------------------
  // 2. WORLD ORIGIN MARKERS, SUPPRESSOR, LASER & MUZZLE FLASH (INSIDE MOTION ANCHOR)
  // -------------------------------------------------------------------------
  const ejectionPortWorldPos = new THREE.Object3D();
  ejectionPortWorldPos.position.set(0.025, 0.028, -0.04);
  weaponMotionAnchor.add(ejectionPortWorldPos);

  const suppressorGroup = new THREE.Group();
  suppressorGroup.position.set(0, 0.022, -0.28);
  suppressorGroup.visible = false;
  weaponMotionAnchor.add(suppressorGroup);

  const muzzleWorldPos = new THREE.Object3D();
  muzzleWorldPos.position.set(0, 0.022, -0.24);
  weaponMotionAnchor.add(muzzleWorldPos);

  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.set(0, 0.022, -0.23);

  const starFlashMat = new THREE.MeshBasicMaterial({
    map: textures.muzzleFlashStar,
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const outerStarMat = new THREE.MeshBasicMaterial({
    map: textures.muzzleFlashStar,
    color: 0xffaa00,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const jetFlameMat = new THREE.MeshBasicMaterial({
    map: textures.muzzleFlashJet,
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // 1. Primary & Secondary Front Starburst Coronas (No square edges)
  const frontStarPrimary = new THREE.Mesh(
    new THREE.PlaneGeometry(0.19, 0.19),
    starFlashMat
  );
  frontStarPrimary.renderOrder = 18;
  muzzleFlashGroup.add(frontStarPrimary);

  const frontStarSecondary = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    outerStarMat
  );
  frontStarSecondary.rotation.z = Math.PI / 6;
  frontStarSecondary.position.z = -0.012;
  frontStarSecondary.renderOrder = 17;
  muzzleFlashGroup.add(frontStarSecondary);

  // 2. Axial Cross-Intersecting Supersonic Flame Plumes Shooting Forward (-Z)
  const jetPlaneGeo = new THREE.PlaneGeometry(0.24, 0.11);
  jetPlaneGeo.translate(0.11, 0, 0);
  jetPlaneGeo.rotateY(Math.PI / 2);

  for (let i = 0; i < 3; i++) {
    const axialJet = new THREE.Mesh(jetPlaneGeo, jetFlameMat);
    axialJet.rotation.z = (i * Math.PI) / 3;
    axialJet.renderOrder = 18;
    muzzleFlashGroup.add(axialJet);
  }

  // 3. Side Compensator Port Gas Vents (Left/Right/Top angled supersonic jets)
  const portJetGeo = new THREE.PlaneGeometry(0.13, 0.065);
  portJetGeo.translate(0.06, 0, 0);
  const portAngles = [0, Math.PI, Math.PI / 2];
  for (let p = 0; p < portAngles.length; p++) {
    const portJet = new THREE.Mesh(portJetGeo, jetFlameMat);
    portJet.rotation.z = portAngles[p];
    portJet.rotation.y = -0.35;
    portJet.position.z = -0.008;
    portJet.renderOrder = 18;
    muzzleFlashGroup.add(portJet);
  }

  // 4. Incandescent White-Hot Plasma Core Sphere at Barrel Crown
  const plasmaCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 10, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  plasmaCore.scale.set(1, 1, 2.2);
  plasmaCore.position.z = -0.025;
  plasmaCore.renderOrder = 19;
  muzzleFlashGroup.add(plasmaCore);

  muzzleFlashGroup.visible = false;
  weaponMotionAnchor.add(muzzleFlashGroup);

  const muzzleLight = new THREE.PointLight(0xffb733, 0, 12, 1.8);
  muzzleLight.position.set(0, 0.03, -0.26);
  weaponMotionAnchor.add(muzzleLight);

  const laserOriginWorldPos = new THREE.Object3D();
  laserOriginWorldPos.position.set(0.0, -0.015, -0.18);
  weaponMotionAnchor.add(laserOriginWorldPos);

  const peq15ModelGroup = new THREE.Group();
  peq15ModelGroup.visible = false;
  weaponMotionAnchor.add(peq15ModelGroup);

  const beamGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 1.0, 6);
  beamGeo.translate(0, -0.5, 0);
  beamGeo.rotateX(Math.PI / 2);
  const peqLaserBeam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  peqLaserBeam.position.copy(laserOriginWorldPos.position);
  peqLaserBeam.visible = false;
  weaponMotionAnchor.add(peqLaserBeam);

  const attachmentSystem = new WeaponAttachmentSystem(weaponMotionAnchor);

  // -------------------------------------------------------------------------
  // 3. REAL 3D SCOPE PACK OPTICS SUITE (LOCKED FLUSH TO WEAPON PICATINNY RAIL)
  // -------------------------------------------------------------------------
  const opticsContainer = new THREE.Group();
  weaponMotionAnchor.add(opticsContainer);

  const redDotScopeGroup = new THREE.Group();
  redDotScopeGroup.visible = false;
  opticsContainer.add(redDotScopeGroup);

  const kolimatorScopeGroup = new THREE.Group();
  kolimatorScopeGroup.visible = false;
  opticsContainer.add(kolimatorScopeGroup);

  const holoSightGroup = new THREE.Group();
  holoSightGroup.visible = false;
  opticsContainer.add(holoSightGroup);

  const holoReticleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ visible: false })
  );

  const lpvoScopeGroup = new THREE.Group();
  lpvoScopeGroup.visible = false;
  opticsContainer.add(lpvoScopeGroup);

  const lpvoThrowLever = new THREE.Mesh(
    new THREE.BoxGeometry(0.001, 0.001, 0.001),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  const lpvoReticleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.001, 0.001),
    new THREE.MeshBasicMaterial({ visible: false })
  );

  const ironSightsGroup = new THREE.Group();
  ironSightsGroup.visible = true;
  opticsContainer.add(ironSightsGroup);

  let currentOpticType: OpticType = 'iron';
  let ensureOpticLoaded: (optic: OpticType) => void = () => {};
  let notifyKinemationOpticChange: (optic: OpticType) => void = () => {};
  const setOpticType = (optic: OpticType) => {
    currentOpticType = optic;
    ensureOpticLoaded(optic);
    notifyKinemationOpticChange(optic);
    ironSightsGroup.visible = optic === 'iron';
    redDotScopeGroup.visible = optic === 'red_dot';
    kolimatorScopeGroup.visible = optic === 'kolimator';
    holoSightGroup.visible = optic === 'holo';
    lpvoScopeGroup.visible = optic === 'lpvo';
  };

  const cantedSightGroup = new THREE.Group();
  cantedSightGroup.position.set(0.018, 0.036, -0.05);
  cantedSightGroup.rotation.z = -Math.PI / 4;
  cantedSightGroup.visible = false;

  const cantedMount = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.02, 0.034),
    matAnodizedUpper
  );
  cantedMount.position.set(0, 0.01, 0);
  cantedSightGroup.add(cantedMount);

  const cantedReticleMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.018, 0.018),
    new THREE.MeshBasicMaterial({
      map: textures.cantedDotReticle,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  cantedReticleMesh.position.set(0, 0.028, 0);
  cantedReticleMesh.renderOrder = 12;
  cantedSightGroup.add(cantedReticleMesh);
  opticsContainer.add(cantedSightGroup);

  const gltfLoader = createGameGltfLoader();

  const configureLoadedScopeScene = (
    sceneRoot: THREE.Group,
    isLpvo = false
  ) => {
    sceneRoot.traverse((child) => {
      child.frustumCulled = false;
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (!mat) return;
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.needsUpdate = true;
        }
        if (mat.emissiveMap) {
          mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          mat.emissiveMap.needsUpdate = true;
        }
        if (mesh.name.includes('Glass')) {
          mat.transparent = true;
          mat.opacity = 0.05;
          mat.depthWrite = false;
          mat.roughness = 0.05;
          mat.metalness = 0.1;
          mat.side = THREE.FrontSide;
          mesh.renderOrder = 12;
        } else if (mesh.name.includes('Reticle')) {
          mat.transparent = true;
          mat.depthWrite = false;
          mat.blending = isLpvo
            ? THREE.NormalBlending
            : THREE.AdditiveBlending;
          mat.toneMapped = false;
          mat.side = THREE.FrontSide;
          mesh.renderOrder = 15;
        } else {
          mat.side = THREE.FrontSide;
          mat.envMapIntensity = 1.2;
        }
        mat.needsUpdate = true;
      }
    });
  };

  const loadedAccessories = new Set<string>();
  const loadingAccessories = new Set<string>();

  const loadAccessoryOnce = (
    key: string,
    localUrl: string,
    targetGroup: THREE.Group,
    isLpvo = false,
    extraSetup?: (sceneRoot: THREE.Group) => void
  ) => {
    if (disposed || loadedAccessories.has(key) || loadingAccessories.has(key)) {
      return;
    }
    loadingAccessories.add(key);
    gltfLoader.load(
      resolveAssetUrl(localUrl),
      (gltf) => {
        loadingAccessories.delete(key);
        if (disposed) {
          disposeObject3DResources(gltf.scene, sharedProcTexSet);
          return;
        }
        loadedAccessories.add(key);
        configureLoadedScopeScene(gltf.scene, isLpvo);
        extraSetup?.(gltf.scene);
        targetGroup.add(gltf.scene);
        onSubtreeLoaded?.(gltf.scene);
      },
      undefined,
      () => {
        loadingAccessories.delete(key);
      }
    );
  };

  ensureOpticLoaded = (optic: OpticType) => {
    if (optic === 'red_dot') {
      loadAccessoryOnce(
        'optic_red_dot',
        '/models/accessories/scopes/Scope_Aimpoint_RedDot.glb',
        redDotScopeGroup
      );
    } else if (optic === 'kolimator') {
      loadAccessoryOnce(
        'optic_kolimator',
        '/models/accessories/scopes/Scope_Kolimator_Reflex.glb',
        kolimatorScopeGroup
      );
    } else if (optic === 'holo') {
      loadAccessoryOnce(
        'optic_holo',
        '/models/accessories/scopes/Scope_EoTech_Holo.glb',
        holoSightGroup
      );
    } else if (optic === 'lpvo') {
      loadAccessoryOnce(
        'optic_lpvo',
        '/models/accessories/scopes/Scope_Tactical_LPVO.glb',
        lpvoScopeGroup,
        true
      );
    }
  };

  const ensureLaserAccessoryLoaded = () => {
    loadAccessoryOnce(
      'peq15_laser',
      '/models/accessories/scopes/Laser_ANPEQ15.glb',
      peq15ModelGroup
    );
  };
  // Support KHR_materials_pbrSpecularGlossiness if loading directly from GitHub Raw fallback
  gltfLoader.register((parser) => ({
    name: 'KHR_materials_pbrSpecularGlossiness',
    extendMaterialParams: async (
      materialIndex: number,
      materialParams: Record<string, unknown>
    ) => {
      const matDef = parser.json.materials?.[materialIndex];
      const sg = matDef?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!sg) return;
      materialParams.color = new THREE.Color(1, 1, 1);
      materialParams.roughness = matDef.name === 'M4_D' ? 0.36 : 0.58;
      materialParams.metalness = matDef.name === 'M4_D' ? 0.72 : 0.06;
      if (sg.diffuseTexture) {
        await parser.assignTexture(
          materialParams,
          'map',
          sg.diffuseTexture,
          THREE.SRGBColorSpace
        );
      }
    },
  }));

  // =========================================================================
  // 4. UNIFIED 8-WEAPON ANIMATED GLB PACK SYSTEM (BUILT-IN HANDS & ANIMATIONS)
  // =========================================================================
  /**
   * Slices a time window `[startSec, endSec]` from a combined AnimationClip
   * using each track's native Three.js interpolant so start/end poses are exact.
   */
  const sliceAnimationSubclip = (
    sourceClip: THREE.AnimationClip,
    subName: string,
    startSec: number,
    endSec: number
  ): THREE.AnimationClip => {
    const duration = Math.max(0.05, endSec - startSec);
    const subTracks: THREE.KeyframeTrack[] = [];

    for (let i = 0; i < sourceClip.tracks.length; i++) {
      const track = sourceClip.tracks[i];
      const itemSize = track.getValueSize();
      const interp = (
        track as unknown as {
          createInterpolant: () => { evaluate: (t: number) => ArrayLike<number> };
        }
      ).createInterpolant();

      const times: number[] = [0];
      const values: number[] = [];

      const startSample = interp.evaluate(startSec);
      for (let k = 0; k < itemSize; k++) values.push(startSample[k]);

      const srcTimes = track.times;
      const srcValues = track.values;
      for (let j = 0; j < srcTimes.length; j++) {
        const t = srcTimes[j];
        if (t > startSec + 0.002 && t < endSec - 0.002) {
          times.push(t - startSec);
          const baseIdx = j * itemSize;
          for (let k = 0; k < itemSize; k++) {
            values.push(srcValues[baseIdx + k]);
          }
        }
      }

      times.push(duration);
      const endSample = interp.evaluate(endSec);
      for (let k = 0; k < itemSize; k++) values.push(endSample[k]);

      const TrackCtor = track.constructor as new (
        name: string,
        times: number[],
        values: number[]
      ) => THREE.KeyframeTrack;
      subTracks.push(new TrackCtor(track.name, times, values));
    }

    return new THREE.AnimationClip(subName, duration, subTracks);
  };

  interface AnimatedWeaponPackEntry {
    weaponId: WeaponId;
    localUrl: string;
    githubUrl: string;
    mountGroup: THREE.Group;
    loaded: boolean;
    loading: boolean;
    procedural: boolean;
    lastUsedAt: number;
    modelScene: THREE.Group | null;
    mixer: THREE.AnimationMixer | null;
    actions: Record<string, THREE.AnimationAction>;
    mainBoneNode: THREE.Object3D | null;
    mainBoneRestPos: THREE.Vector3 | null;
    mainBoneRestInGunInv: THREE.Matrix4 | null;
    mainBoneScale: number;
    invertZ: boolean;
    builtInOpticNodes: THREE.Object3D[];
    loadNow: () => void;
    unloadNow: () => void;
  }

  let evictOverflowGlbWeapons = () => {};

  const createAnimatedWeaponEntry = (opts: {
    weaponId: WeaponId;
    localUrl: string;
    githubUrl: string;
    scale: number;
    rotY: number;
    pos: [number, number, number];
    mainBoneName?: string;
    mainBoneScale?: number;
    hideNodeNames?: string[];
    subclipWindows?: Record<string, [number, number]>;
    clipAliases?: Record<string, string>;
  }): AnimatedWeaponPackEntry => {
    const mountGroup = new THREE.Group();
    mountGroup.scale.setScalar(opts.scale);
    mountGroup.rotation.y = opts.rotY;
    mountGroup.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
    mountGroup.visible = activeWeapon === opts.weaponId;
    gunGroup.add(mountGroup);

    const entry: AnimatedWeaponPackEntry = {
      weaponId: opts.weaponId,
      localUrl: opts.localUrl,
      githubUrl: opts.githubUrl,
      mountGroup,
      loaded: false,
      loading: false,
      procedural: false,
      lastUsedAt: 0,
      modelScene: null,
      mixer: null,
      actions: {},
      mainBoneNode: null,
      mainBoneRestPos: null,
      mainBoneRestInGunInv: null,
      mainBoneScale: opts.mainBoneScale ?? 0.01,
      invertZ: Math.abs(opts.rotY - Math.PI) < 0.2,
      builtInOpticNodes: [],
      loadNow: () => {
        if (disposed || entry.loaded || entry.loading) return;
        entry.loading = true;
        const primaryUrl = resolveAssetUrl(opts.localUrl);
        gltfLoader.load(
          primaryUrl,
          onLoaded,
          undefined,
          () => {
            if (disposed) {
              entry.loading = false;
              return;
            }
            if (opts.githubUrl && opts.githubUrl !== opts.localUrl) {
              gltfLoader.load(
                opts.githubUrl,
                onLoaded,
                undefined,
                () => {
                  entry.loading = false;
                }
              );
            } else {
              entry.loading = false;
            }
          }
        );
      },
      unloadNow: () => {
        if (entry.procedural) return;
        entry.loading = false;
        entry.loaded = false;
        Object.values(entry.actions).forEach((act) => {
          try {
            act.stop();
          } catch {
            // ignore
          }
        });
        if (entry.mixer && entry.modelScene) {
          try {
            entry.mixer.stopAllAction();
            entry.mixer.uncacheRoot(entry.modelScene);
          } catch {
            // ignore
          }
        }
        entry.mixer = null;
        entry.actions = {};
        entry.mainBoneNode = null;
        entry.mainBoneRestPos = null;
        entry.mainBoneRestInGunInv = null;
        entry.builtInOpticNodes = [];
        if (entry.modelScene) {
          mountGroup.remove(entry.modelScene);
          disposeObject3DResources(entry.modelScene, sharedProcTexSet);
          entry.modelScene = null;
        }
        mountGroup.visible = false;
      },
    };

    const onLoaded = (gltf: {
      scene: THREE.Group;
      animations: THREE.AnimationClip[];
    }) => {
      entry.loading = false;
      if (disposed) {
        disposeObject3DResources(gltf.scene, sharedProcTexSet);
        return;
      }
      const modelScene = gltf.scene;
      entry.modelScene = modelScene;
      modelScene.traverse((child) => {
        child.frustumCulled = false;
        if (opts.mainBoneName && child.name === opts.mainBoneName && !entry.mainBoneNode) {
          entry.mainBoneNode = child;
          entry.mainBoneRestPos = child.position.clone();
        }
        if (opts.hideNodeNames && opts.hideNodeNames.includes(child.name)) {
          child.visible = false;
        }
        if (
          ((opts.weaponId === 'M4_CARBINE' || opts.weaponId === 'CARBINE_AR') &&
            (child.name === 'scope' ||
              child.name === 'scope_carbine_0' ||
              child.name === 'lens' ||
              child.name === 'lens_lens_0')) ||
          (opts.weaponId === 'AK12_RIFLE' &&
            (child.name === 'aim' ||
              child.name === 'aim_0' ||
              child.name === 'lense' ||
              child.name === 'lense_0')) ||
          (opts.weaponId === 'SHOTGUN_SPAS' &&
            (child.name === 'Automatic_Shotgun_Sight_01' ||
              child.name === 'Automatic_Shotgun_Sight_02' ||
              child.name === 'Automatic_Shotgun_Sight_Glasses')) ||
          (opts.weaponId === 'S_MILITARY' &&
            (child.name === 'Holoshort001' ||
              child.name === 'Scr010' ||
              child.name === 'Scr003')) ||
          (opts.weaponId === 'SNIPER_BOLT' &&
            (child.name === 'scope' ||
              child.name === 'scope_sniper_0' ||
              child.name === 'scoperender' ||
              child.name === 'scoperender_sniper_0' ||
              child.name === 'reticle_scopereticle_0' ||
              child.name === 'lens' ||
              child.name === 'lens_lens_0'))
        ) {
          entry.builtInOpticNodes.push(child);
        }
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.frustumCulled = false;
          m.castShadow = false;
          m.receiveShadow = true;
          const fixMat = (mat: THREE.Material) => {
            const std = mat as THREE.MeshStandardMaterial;
            if (std.map) {
              std.map.colorSpace = THREE.SRGBColorSpace;
              std.map.needsUpdate = true;
            }
            if (std.color && std.map) {
              std.color.setHex(0xffffff);
            }
            const matName = (std.name || '').toLowerCase();
            if (opts.weaponId === 'S_MILITARY' && matName === 'mi_manny_02') {
              // Tactical operator gloves & forearm armor plates (seamless TrekDry leather/micro-weave)
              const gloveMap = textures.gloveFabric.clone();
              gloveMap.repeat.set(8, 8);
              gloveMap.needsUpdate = true;
              const gloveBump = textures.gloveBump.clone();
              gloveBump.repeat.set(8, 8);
              gloveBump.needsUpdate = true;
              std.map = gloveMap;
              std.bumpMap = gloveBump;
              std.bumpScale = 0.008;
              std.color.setHex(0x323944);
              std.roughness = 0.62;
              std.metalness = 0.14;
              std.vertexColors = false;
              std.needsUpdate = true;
            } else if (opts.weaponId === 'S_MILITARY' && matName === 'mi_manny_01') {
              // Combat Ripstop MultiCam / Ranger tactical sleeves
              const sleeveMap = textures.combatSleeve.clone();
              sleeveMap.repeat.set(6, 6);
              sleeveMap.needsUpdate = true;
              const sleeveBump = textures.gloveBump.clone();
              sleeveBump.repeat.set(6, 6);
              sleeveBump.needsUpdate = true;
              std.map = sleeveMap;
              std.bumpMap = sleeveBump;
              std.bumpScale = 0.004;
              std.color.setHex(0xd4ddd0);
              std.roughness = 0.84;
              std.metalness = 0.04;
              std.vertexColors = false;
              std.needsUpdate = true;
            } else if (
              opts.weaponId === 'S_MILITARY' &&
              (matName === 'm_holoshort_opacity' ||
                matName.includes('holoshort_opacity'))
            ) {
              std.transparent = true;
              std.depthWrite = false;
              std.blending = THREE.AdditiveBlending;
              std.toneMapped = false;
              std.emissive = new THREE.Color(0xff3b30);
              std.emissiveIntensity = 2.2;
              m.renderOrder = 15;
            } else if (
              opts.weaponId === 'S_MILITARY' &&
              matName === 'm_transparent'
            ) {
              std.transparent = true;
              std.opacity = 0.14;
              std.depthWrite = false;
              std.roughness = 0.05;
              m.renderOrder = 12;
            } else if (
              (opts.weaponId === 'M4_CARBINE' || opts.weaponId === 'CARBINE_AR') &&
              (matName === 'lens' || m.name.toLowerCase().includes('lens_lens'))
            ) {
              std.transparent = true;
              std.opacity = 1.0;
              std.depthWrite = false;
              m.renderOrder = 12;
            } else if (
              opts.weaponId === 'AK12_RIFLE' &&
              (matName.includes('lense') || m.name.toLowerCase().includes('lense'))
            ) {
              std.map = null;
              std.transparent = true;
              std.opacity = 0.06;
              std.roughness = 0.04;
              std.metalness = 0.12;
              if (std.color) std.color.setHex(0xdbeafe);
              std.depthWrite = false;
              m.renderOrder = 10;
            } else if (
              matName.includes('lense') ||
              matName.includes('lens') ||
              matName === 'glasses' ||
              m.name.toLowerCase().includes('lense') ||
              m.name.toLowerCase().includes('glasses')
            ) {
              std.transparent = true;
              std.opacity = matName === 'glasses' ? 0.22 : 0.14;
              std.roughness = 0.05;
              std.metalness = 0.1;
              if (std.color) std.color.setHex(0x88ccff);
              std.depthWrite = false;
            }
            std.needsUpdate = true;
          };
          if (Array.isArray(m.material)) {
            m.material.forEach(fixMat);
          } else if (m.material) {
            fixMat(m.material);
          }

          // Place crisp centered reticle directly inside AK-12's own original scope lens (no extra scope housing)
          if (
            opts.weaponId === 'AK12_RIFLE' &&
            m.name.toLowerCase().includes('rail') &&
            !m.userData.ak12ReticleMounted
          ) {
            m.userData.ak12ReticleMounted = true;
            const skMesh = m as THREE.SkinnedMesh;
            if (skMesh.isSkinnedMesh && skMesh.skeleton) {
              const bone = skMesh.skeleton.bones[66];
              if (bone) {
                mountGroup.add(modelScene);
                gunGroup.updateMatrixWorld(true);
                bone.updateMatrixWorld(true);

                // Exact rear ocular lens plane of AK-12's native aim_0 / lense_0 in gunGroup space
                const desiredGunMat = gunGroup.matrixWorld
                  .clone()
                  .multiply(new THREE.Matrix4().makeTranslation(-0.0004, 0.052, 0.0835));
                const invBone = bone.matrixWorld.clone().invert();
                const localMat = new THREE.Matrix4().multiplyMatrices(invBone, desiredGunMat);
                const akReticle = new THREE.Mesh(
                  new THREE.CircleGeometry(0.0112, 48),
                  new THREE.MeshBasicMaterial({
                    map: textures.lpvoReticle,
                    transparent: true,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                  })
                );
                akReticle.renderOrder = 14;
                localMat.decompose(akReticle.position, akReticle.quaternion, akReticle.scale);
                bone.add(akReticle);
                entry.builtInOpticNodes.push(akReticle);
              }
            }
          }
        }
      });

      mountGroup.add(modelScene);
      entry.loaded = true;
      const initialSkin =
        pendingSkinByWeapon[opts.weaponId] ||
        getEquippedWeaponSkinId(opts.weaponId);
      applyWeaponSkinToObject3D(entry.mountGroup, opts.weaponId, initialSkin);

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(modelScene);
        entry.mixer = mixer;

        if (opts.subclipWindows) {
          const baseClip = gltf.animations[0];
          Object.entries(opts.subclipWindows).forEach(([actionName, [t0, t1]]) => {
            const sub = sliceAnimationSubclip(baseClip, actionName, t0, t1);
            const act = mixer.clipAction(sub);
            act.setLoop(THREE.LoopOnce, 1);
            act.clampWhenFinished = true;
            entry.actions[actionName] = act;
          });
        } else {
          gltf.animations.forEach((clip) => {
            let minT = Infinity;
            for (let i = 0; i < clip.tracks.length; i++) {
              const tArr = clip.tracks[i].times;
              if (tArr.length > 0 && tArr[0] < minT) {
                minT = tArr[0];
              }
            }
            if (minT > 0.005 && Number.isFinite(minT)) {
              for (let i = 0; i < clip.tracks.length; i++) {
                const tArr = clip.tracks[i].times;
                for (let j = 0; j < tArr.length; j++) {
                  tArr[j] = Math.max(0, tArr[j] - minT);
                }
              }
              clip.resetDuration();
            }

            const act = mixer.clipAction(clip);
            act.setLoop(THREE.LoopOnce, 1);
            act.clampWhenFinished = true;
            entry.actions[clip.name] = act;
          });

          if (opts.clipAliases) {
            Object.entries(opts.clipAliases).forEach(([canonical, rawName]) => {
              if (entry.actions[rawName]) {
                entry.actions[canonical] = entry.actions[rawName];
              }
            });
          }

          // For SHOTGUN_SPAS, slice dedicated per-shell insert & pump subclips out of native Reload
          if (opts.weaponId === 'SHOTGUN_SPAS' && entry.actions['Reload']) {
            const reloadClip = entry.actions['Reload'].getClip();
            const dur = Math.max(0.2, reloadClip.duration || 3.33);
            const insertSub = sliceAnimationSubclip(
              reloadClip,
              'ShotgunInsert',
              Math.min(0.95, dur * 0.28),
              Math.min(1.85, dur * 0.65)
            );
            const insertAct = mixer.clipAction(insertSub);
            insertAct.setLoop(THREE.LoopOnce, 1);
            insertAct.clampWhenFinished = true;
            entry.actions['ShotgunInsert'] = insertAct;

            const pumpSub = sliceAnimationSubclip(
              reloadClip,
              'ShotgunPump',
              Math.min(2.4, dur * 0.72),
              dur
            );
            const pumpAct = mixer.clipAction(pumpSub);
            pumpAct.setLoop(THREE.LoopOnce, 1);
            pumpAct.clampWhenFinished = true;
            entry.actions['ShotgunPump'] = pumpAct;
          }

          // When Idle differs from bind pose (e.g. S_MILITARY UE5 A-pose -> FPS ready pose),
          // evaluate Idle at t=0 before capturing mainBoneRestInGunInv
          if (entry.actions['Idle']) {
            const idleAct = entry.actions['Idle'];
            idleAct.weight = 1;
            idleAct.play();
            mixer.setTime(0);
            idleAct.stop();
            idleAct.weight = 0;
          }
        }
      }

      if (entry.mainBoneNode) {
        entry.mainBoneRestPos = entry.mainBoneNode.position.clone();
        entry.mainBoneRestInGunInv = computeNodeMatrixInGunSpace(
          entry.mainBoneNode,
          gunGroup,
          _gunSpaceMat
        )
          .clone()
          .invert();
      }

      entry.lastUsedAt = ++lruClock;
      if (activeWeapon === opts.weaponId) {
        mountGroup.visible = true;
        m4BodyGroup.visible = false;
        armsRigContainer.visible =
          opts.weaponId === 'SNIPER_TACTICAL' || opts.weaponId === 'SMG_MP5';
        playWeaponPackAction(entry, 'Draw', undefined, 1.15);
      }
      onSubtreeLoaded?.(modelScene);
      evictOverflowGlbWeapons();
    };

    return entry;
  };

  const playWeaponPackAction = (
    entry: AnimatedWeaponPackEntry | undefined,
    actionName:
      | 'Draw'
      | 'Fire'
      | 'Reload'
      | 'Reload_Empty'
      | 'Holster'
      | 'Inspect'
      | 'ShotgunInsert'
      | 'ShotgunPump',
    durationOverrideSec?: number,
    timeScaleOverride = 1.0
  ) => {
    if (!entry || !entry.mixer) return;
    const action =
      entry.actions[actionName] ||
      (actionName === 'Reload_Empty' ? entry.actions['Reload'] : undefined) ||
      (actionName === 'ShotgunInsert' ? entry.actions['Reload'] : undefined) ||
      (actionName === 'ShotgunPump' ? entry.actions['Draw'] : undefined) ||
      (actionName === 'Inspect' ? entry.actions['Draw'] : undefined) ||
      (actionName === 'Holster' ? entry.actions['Draw'] : undefined) ||
      entry.actions['Draw'];
    if (!action) return;

    Object.entries(entry.actions).forEach(([, act]) => {
      if (act !== action) {
        act.stop();
        act.weight = 0;
      }
    });

    const clipDur = Math.max(0.08, action.getClip().duration || 0.5);
    if (durationOverrideSec && durationOverrideSec > 0.08) {
      action.timeScale = clipDur / durationOverrideSec;
    } else {
      action.timeScale = timeScaleOverride;
    }

    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.weight = 1.0;
    action.reset();
    action.play();
  };

  const createProceduralWeaponEntry = (
    weaponId: WeaponId,
    buildMeshFn: () => THREE.Group
  ): AnimatedWeaponPackEntry => {
    const mountGroup = new THREE.Group();
    const body = buildMeshFn();
    mountGroup.add(body);
    applyWeaponSkinToObject3D(
      mountGroup,
      weaponId,
      pendingSkinByWeapon[weaponId] || getEquippedWeaponSkinId(weaponId)
    );
    mountGroup.visible = activeWeapon === weaponId;
    weaponMotionAnchor.add(mountGroup);
    return {
      weaponId,
      localUrl: '',
      githubUrl: '',
      mountGroup,
      loaded: true,
      loading: false,
      procedural: true,
      lastUsedAt: 0,
      modelScene: body,
      mixer: null,
      actions: {},
      mainBoneNode: null,
      mainBoneRestPos: null,
      mainBoneRestInGunInv: null,
      mainBoneScale: 1,
      invertZ: false,
      builtInOpticNodes: [],
      loadNow: () => {},
      unloadNow: () => {},
    };
  };

  const weaponPacks: Record<WeaponId, AnimatedWeaponPackEntry> = {
    // [1] Mark 23 (.45 ACP) — Default Starting Pistol
    P50_PISTOL: createAnimatedWeaponEntry({
      weaponId: 'P50_PISTOL',
      localUrl: MARK_23_LOCAL_URL,
      githubUrl: MARK_23_GITHUB_RAW_URL,
      scale: 0.01,
      rotY: Math.PI,
      pos: [-0.10768, -1.472, -0.02],
      mainBoneName: 'main_j_050',
      mainBoneScale: 0.01,
      clipAliases: {
        Draw: 'Draw',
        Fire: 'Shoot',
        Reload: 'Reload',
        Reload_Empty: 'Reload',
        Holster: 'Hide',
      },
    }),

    // [2] SMG .45 ACP (`fps_animated_smg.glb`)
    SMG_45: createAnimatedWeaponEntry({
      weaponId: 'SMG_45',
      localUrl: SMG_45_LOCAL_URL,
      githubUrl: SMG_45_GITHUB_RAW_URL,
      scale: 0.01,
      rotY: Math.PI,
      pos: [-0.012, -0.092, 0.055],
      mainBoneName: 'smg45',
      mainBoneScale: 0.01,
      subclipWindows: {
        Fire: [0.0, 0.24],
        Reload_Empty: [0.3, 2.7],
        Reload: [2.73, 4.3],
        Draw: [4.37, 5.87],
        Holster: [7.2, 7.8],
      },
    }),

    // [2B] MP5A3 Tactical 9mm (Engineer SMG)
    SMG_MP5: createProceduralWeaponEntry('SMG_MP5', buildSmgMp5Group),

    // [2C] M870 Breacher 12-Gauge Pump Shotgun (`shotgun_animated.glb` — Medic Primary)
    SHOTGUN_12: createAnimatedWeaponEntry({
      weaponId: 'SHOTGUN_12',
      localUrl: SHOTGUN_12_LOCAL_URL,
      githubUrl: SHOTGUN_12_GITHUB_RAW_URL,
      scale: 0.0118,
      rotY: Math.PI,
      pos: [-0.026, -0.112, 0.195],
      mainBoneName: 'shotgun',
      mainBoneScale: 0.0118,
      subclipWindows: {
        Fire: [0.0, 1.13],
        Reload: [1.17, 2.93],
        Reload_Empty: [1.17, 4.23],
        ShotgunInsert: [1.55, 2.25],
        ShotgunPump: [2.25, 2.93],
        Draw: [3.37, 4.23],
        Holster: [2.97, 3.37],
        Idle: [4.27, 5.3],
      },
    }),

    // [2D] SPAS-12 / Automatic Tactical Shotgun (`automatic_shotgun.glb` — Medic Primary)
    SHOTGUN_SPAS: createAnimatedWeaponEntry({
      weaponId: 'SHOTGUN_SPAS',
      localUrl: SHOTGUN_SPAS_LOCAL_URL,
      githubUrl: SHOTGUN_SPAS_GITHUB_RAW_URL,
      scale: 0.01,
      rotY: Math.PI,
      pos: [-0.0943, -1.615, 0.18],
      mainBoneName: 'P_Automatic_Shotgun_Basic',
      mainBoneScale: 0.01,
      clipAliases: {
        Draw: 'Draw',
        Fire: 'Fire',
        Reload: 'Reload',
        Reload_Empty: 'Reload',
        Holster: 'Holster',
      },
    }),

    // [3] M4A1 Tactical Carbine (`fps_animated_carbine_m4.glb` — 2K PBR textures & clean rig)
    M4_CARBINE: createAnimatedWeaponEntry({
      weaponId: 'M4_CARBINE',
      localUrl: M4_FPS_PACK_LOCAL_URL,
      githubUrl: M4_FPS_PACK_GITHUB_RAW_URL,
      scale: 0.58,
      rotY: Math.PI,
      pos: [-0.015, -0.228, 0.105],
      mainBoneName: 'carbine',
      mainBoneScale: 0.012,
      subclipWindows: {
        Fire: [0.0, 0.26],
        Reload_Empty: [0.33, 2.27],
        Reload: [2.33, 4.47],
        Draw: [4.53, 5.9],
        Holster: [6.87, 7.4],
      },
    }),

    // [4] Tactical Carbine Scope (`fps_animated_carbine.glb`)
    CARBINE_AR: createAnimatedWeaponEntry({
      weaponId: 'CARBINE_AR',
      localUrl: CARBINE_AR_LOCAL_URL,
      githubUrl: CARBINE_AR_GITHUB_RAW_URL,
      scale: 0.58,
      rotY: Math.PI,
      pos: [-0.015, -0.228, 0.105],
      mainBoneName: 'carbine',
      mainBoneScale: 0.012,
      subclipWindows: {
        Fire: [0.0, 0.26],
        Reload_Empty: [0.33, 2.27],
        Reload: [2.33, 4.47],
        Draw: [4.53, 5.9],
        Holster: [6.87, 7.4],
      },
    }),

    // [4B] SCAR-L S-Military (`s_military_ar.glb` — Rifleman Assault Rifle)
    S_MILITARY: createAnimatedWeaponEntry({
      weaponId: 'S_MILITARY',
      localUrl: S_MILITARY_LOCAL_URL,
      githubUrl: S_MILITARY_GITHUB_RAW_URL,
      scale: 0.01,
      rotY: Math.PI,
      pos: [-0.110, -1.535, 0.25],
      mainBoneName: 'Grip',
      mainBoneScale: 0.01,
      clipAliases: {
        Draw: 'Draw',
        Fire: 'Fire',
        Reload: 'Reload',
        Reload_Empty: 'Reload_Empty',
        Holster: 'Holster',
        Inspect: 'Inspect',
      },
    }),

    // [5] AK-47 Comando (`fps_ak47.glb`) — Camera positioned close (Z = 0.485) and higher above the receiver (Y = -1.525)
    AK47_RIFLE: createAnimatedWeaponEntry({
      weaponId: 'AK47_RIFLE',
      localUrl: AK47_RIFLE_LOCAL_URL,
      githubUrl: AK47_RIFLE_GITHUB_RAW_URL,
      scale: 1.0,
      rotY: Math.PI,
      pos: [-0.142, -1.525, 0.485],
      mainBoneName: 'SKEL_AK_47_Rifle',
      mainBoneScale: 0.01,
      clipAliases: {
        Draw: 'RIG_UE5_Comando_AK_Equip',
        Fire: 'RIG_UE5_Comando_AK_Fire',
        Reload: 'RIG_UE5_Comando_AK_Reload',
        Reload_Empty: 'RIG_UE5_Comando_AK_Reload',
        Holster: 'RIG_UE5_Comando_AK_Equip',
      },
    }),

    // [5B] AK-12 Spetsnaz (`ak-12animated.glb`) — Animated FPS AK-12 with tactical hands, watch & optical sight
    AK12_RIFLE: createAnimatedWeaponEntry({
      weaponId: 'AK12_RIFLE',
      localUrl: AK12_RIFLE_LOCAL_URL,
      githubUrl: AK12_RIFLE_GITHUB_RAW_URL,
      scale: 0.4,
      rotY: Math.PI,
      pos: [-0.1414, -1.6094, 0.326],
      mainBoneName: 'Rifle_metarig',
      mainBoneScale: 0.01,
      hideNodeNames: [
        'mag.001',
        'mag.001_0',
        'bullets',
        'bullets_0',
      ],
      clipAliases: {
        Draw: 'Equip',
        Fire: 'Shoot',
        Reload: 'Reload',
        Reload_Empty: 'Reload',
        Holster: 'Equip',
      },
    }),

    // [6] LMG Animated (`lmg_animated.glb`)
    L49_LMG: createAnimatedWeaponEntry({
      weaponId: 'L49_LMG',
      localUrl: L49_LMG_LOCAL_URL,
      githubUrl: L49_LMG_GITHUB_RAW_URL,
      scale: 1.0,
      rotY: Math.PI,
      pos: [-0.018, -0.095, 0.04],
      mainBoneName: 'LMG',
      mainBoneScale: 0.01,
      subclipWindows: {
        Fire: [0.0, 0.34],
        Reload: [0.4, 5.47],
        Reload_Empty: [5.53, 10.6],
        Draw: [10.67, 12.57],
        Holster: [14.23, 15.0],
      },
    }),

    // [7] Sniper Bolt-Action (`sniper_animated.glb`)
    SNIPER_BOLT: createAnimatedWeaponEntry({
      weaponId: 'SNIPER_BOLT',
      localUrl: SNIPER_BOLT_LOCAL_URL,
      githubUrl: SNIPER_BOLT_GITHUB_RAW_URL,
      scale: 0.01,
      rotY: Math.PI,
      pos: [-0.012, -0.092, 0.065],
      mainBoneName: 'sniper',
      mainBoneScale: 0.01,
      subclipWindows: {
        Fire: [0.0, 1.95],
        Reload: [2.07, 3.85],
        Reload_Empty: [2.07, 3.85],
        Draw: [3.9, 4.75],
        Holster: [5.57, 6.5],
      },
    }),

    // [8] Sniper Tactical (`sniper_fps_animation.glb`)
    SNIPER_TACTICAL: createAnimatedWeaponEntry({
      weaponId: 'SNIPER_TACTICAL',
      localUrl: SNIPER_TACTICAL_LOCAL_URL,
      githubUrl: SNIPER_TACTICAL_GITHUB_RAW_URL,
      scale: 0.35,
      rotY: 0,
      pos: [-0.022, -0.088, 0.07],
      mainBoneName: 'BODY_043',
      mainBoneScale: 0.35,
      hideNodeNames: ['Object_51', 'Ch22_Body', 'Ch22_Body_TEXTURA_0'],
      subclipWindows: {
        Draw: [5.8, 8.2],
        Reload: [10.8, 14.0],
        Fire: [16.0, 18.25],
        Reload_Empty: [20.8, 26.2],
        Holster: [5.8, 6.8],
      },
    }),

    // Kinemation-native weapons (all 18 weapons including KNIFE_TACTICAL rendered via kinemationArmsRig)
    KNIFE_TACTICAL: createProceduralWeaponEntry('KNIFE_TACTICAL', () => new THREE.Group()),
    M1911_PISTOL: createProceduralWeaponEntry('M1911_PISTOL', () => new THREE.Group()),
    RPG7_LAUNCHER: createProceduralWeaponEntry('RPG7_LAUNCHER', () => new THREE.Group()),
    SNIPER_AWP: createProceduralWeaponEntry('SNIPER_AWP', () => new THREE.Group()),
    SNIPER_HEAVY: createProceduralWeaponEntry('SNIPER_HEAVY', () => new THREE.Group()),
  };

  // =========================================================================
  // 5. UNIFIED 2-ARM SKELETAL RIG (`arms_rig.glb`) FALLBACK WITH IK
  // =========================================================================
  const leftHandGroup = new THREE.Group();
  weaponMotionAnchor.add(leftHandGroup);

  const rightHandGroup = new THREE.Group();
  weaponMotionAnchor.add(rightHandGroup);

  const rightTriggerFinger = new THREE.Group();
  rightHandGroup.add(rightTriggerFinger);

  const armsRigContainer = new THREE.Group();
  armsRigContainer.scale.setScalar(0.84);
  armsRigContainer.rotation.y = Math.PI;
  armsRigContainer.position.set(0, -1.68, 0.22);
  armsRigContainer.visible = false;
  gunGroup.add(armsRigContainer);

  let armsRigCtrl: FirstPersonArmsRigController | null = null;
  let currentTriggerPullAlpha = 0;

  const rightPoleDir = new THREE.Vector3(0.28, -1.0, 0.25);
  const leftPoleDir = new THREE.Vector3(-0.28, -1.0, 0.25);

  const leftBasePos = new THREE.Vector3();
  const leftBaseEuler = new THREE.Euler();
  const rightBasePos = new THREE.Vector3();
  const rightBaseEuler = new THREE.Euler();

  const kinemationArmsRig = createKinemationArmsRig({
    gltfLoader,
    sharedProcTexSet,
    onSubtreeLoaded,
  });
  notifyKinemationOpticChange = (optic: OpticType) => {
    kinemationArmsRig.setOpticType(optic);
  };
  kinemationArmsRig.setOpticType(currentOpticType);
  gunGroup.add(kinemationArmsRig.rigRoot);

  const configureWeaponAnchors = (weaponId: WeaponId) => {
    const kSpec = getKinemationWeaponSpec(weaponId);
    if (kSpec) {
      opticsContainer.position.set(
        kSpec.railMountPos[0],
        kSpec.railMountPos[1],
        kSpec.railMountPos[2]
      );
      opticsContainer.scale.setScalar(kSpec.railMountScale);
      suppressorGroup.position.set(
        kSpec.muzzlePos[0],
        kSpec.muzzlePos[1],
        kSpec.muzzlePos[2] - 0.03
      );
      muzzleWorldPos.position.set(
        kSpec.muzzlePos[0],
        kSpec.muzzlePos[1],
        kSpec.muzzlePos[2]
      );
      muzzleFlashGroup.position.set(
        kSpec.muzzlePos[0],
        kSpec.muzzlePos[1],
        kSpec.muzzlePos[2] + 0.008
      );
      laserOriginWorldPos.position.set(
        kSpec.laserPos[0],
        kSpec.laserPos[1],
        kSpec.laserPos[2]
      );
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(
        kSpec.ejectionPos[0],
        kSpec.ejectionPos[1],
        kSpec.ejectionPos[2]
      );
    } else if (weaponId === 'P50_PISTOL') {
      rightBasePos.set(0.02, -0.047, 0.108);
      rightBaseEuler.set(-1.72, -0.1, 0.12);
      leftBasePos.set(-0.024, -0.059, 0.084);
      leftBaseEuler.set(-1.68, 0.16, -0.14);

      opticsContainer.position.set(0, 0.011, 0.0);
      opticsContainer.scale.setScalar(0.75);
      suppressorGroup.position.set(0, 0.021, -0.25);
      muzzleWorldPos.position.set(0, 0.021, -0.22);
      muzzleFlashGroup.position.set(0, 0.021, -0.21);
      laserOriginWorldPos.position.set(0, -0.013, -0.19);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.022, 0.027, -0.02);
    } else if (weaponId === 'SMG_45') {
      opticsContainer.position.set(0, 0.024, -0.04);
      opticsContainer.scale.setScalar(0.82);
      suppressorGroup.position.set(0, 0.01, -0.38);
      muzzleWorldPos.position.set(0, 0.01, -0.35);
      muzzleFlashGroup.position.set(0, 0.01, -0.34);
      laserOriginWorldPos.position.set(0.018, 0.005, -0.26);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.022, 0.018, -0.04);
    } else if (weaponId === 'SMG_MP5') {
      rightBasePos.set(0.022, -0.052, 0.075);
      rightBaseEuler.set(-1.62, -0.08, 0.1);
      leftBasePos.set(-0.024, -0.026, -0.21);
      leftBaseEuler.set(-1.42, 0.22, -0.24);

      opticsContainer.position.set(0, 0.036, -0.01);
      opticsContainer.scale.setScalar(0.78);
      suppressorGroup.position.set(0, 0.014, -0.41);
      muzzleWorldPos.position.set(0, 0.014, -0.385);
      muzzleFlashGroup.position.set(0, 0.014, -0.38);
      laserOriginWorldPos.position.set(0.02, 0.004, -0.23);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.022, 0.014, -0.03);
    } else if (weaponId === 'SHOTGUN_12') {
      opticsContainer.position.set(-0.012, 0.068, -0.05);
      opticsContainer.scale.setScalar(0.84);
      suppressorGroup.position.set(-0.012, 0.055, -0.78);
      muzzleWorldPos.position.set(-0.012, 0.055, -0.76);
      muzzleFlashGroup.position.set(-0.012, 0.055, -0.75);
      laserOriginWorldPos.position.set(0.016, 0.032, -0.52);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.018, 0.02, -0.13);
    } else if (weaponId === 'SHOTGUN_SPAS') {
      opticsContainer.position.set(0, -0.016, -0.232);
      opticsContainer.scale.setScalar(0.88);
      suppressorGroup.position.set(0, -0.056, -0.53);
      muzzleWorldPos.position.set(0, -0.056, -0.50);
      muzzleFlashGroup.position.set(0, -0.056, -0.49);
      laserOriginWorldPos.position.set(0.022, -0.052, -0.34);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.024, -0.054, -0.15);
    } else if (weaponId === 'S_MILITARY') {
      opticsContainer.position.set(0, -0.028, -0.141);
      opticsContainer.scale.setScalar(0.92);
      suppressorGroup.position.set(-0.011, -0.068, -0.786);
      muzzleWorldPos.position.set(-0.011, -0.068, -0.74);
      muzzleFlashGroup.position.set(-0.011, -0.068, -0.73);
      laserOriginWorldPos.position.set(0.025, -0.045, -0.45);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.024, -0.062, -0.08);
    } else if (weaponId === 'AK47_RIFLE') {
      rightBasePos.set(0.022, -0.054, 0.086);
      rightBaseEuler.set(-1.62, -0.08, 0.1);
      leftBasePos.set(-0.025, -0.042, -0.18);
      leftBaseEuler.set(-1.42, 0.22, -0.26);

      opticsContainer.position.set(-0.012, 0.042, 0.15);
      opticsContainer.scale.setScalar(0.92);
      suppressorGroup.position.set(-0.012, 0.038, -0.38);
      muzzleWorldPos.position.set(-0.012, 0.038, -0.36);
      muzzleFlashGroup.position.set(-0.012, 0.038, -0.35);
      laserOriginWorldPos.position.set(0.014, 0.035, -0.18);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.018, 0.04, 0.16);
    } else if (weaponId === 'AK12_RIFLE') {
      opticsContainer.position.set(0, 0.024, 0.04);
      opticsContainer.scale.setScalar(0.88);
      suppressorGroup.position.set(0, 0.01, -0.48);
      muzzleWorldPos.position.set(0, 0.01, -0.464);
      muzzleFlashGroup.position.set(0, 0.01, -0.455);
      laserOriginWorldPos.position.set(0.022, 0.01, -0.24);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.022, 0.012, 0.056);
    } else if (weaponId === 'SNIPER_TACTICAL') {
      rightBasePos.set(0.024, -0.052, 0.084);
      rightBaseEuler.set(-1.62, -0.08, 0.1);
      leftBasePos.set(-0.024, -0.045, -0.22);
      leftBaseEuler.set(-1.42, 0.22, -0.24);

      opticsContainer.position.set(0, 0.025, -0.04);
      opticsContainer.scale.setScalar(0.95);
      suppressorGroup.position.set(0, 0.01, -0.78);
      muzzleWorldPos.position.set(0, 0.01, -0.74);
      muzzleFlashGroup.position.set(0, 0.01, -0.72);
      laserOriginWorldPos.position.set(0.026, 0.008, -0.45);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.026, 0.018, -0.04);
    } else if (weaponId === 'SNIPER_BOLT') {
      opticsContainer.position.set(0, 0.025, -0.04);
      opticsContainer.scale.setScalar(0.95);
      suppressorGroup.position.set(0, 0.01, -0.78);
      muzzleWorldPos.position.set(0, 0.01, -0.74);
      muzzleFlashGroup.position.set(0, 0.01, -0.72);
      laserOriginWorldPos.position.set(0.026, 0.008, -0.45);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.026, 0.018, -0.04);
    } else if (weaponId === 'L49_LMG') {
      opticsContainer.position.set(0, 0.008, -0.04);
      opticsContainer.scale.setScalar(0.88);
      suppressorGroup.position.set(0, 0.009, -0.57);
      muzzleWorldPos.position.set(0, 0.009, -0.62);
      muzzleFlashGroup.position.set(0, 0.009, -0.57);
      laserOriginWorldPos.position.set(0.032, 0.012, -0.36);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.028, 0.005, -0.02);
    } else if (weaponId === 'M4_CARBINE') {
      opticsContainer.position.set(-0.015, -0.001, 0.025);
      opticsContainer.scale.setScalar(0.95);
      suppressorGroup.position.set(-0.015, -0.044, -0.75);
      muzzleWorldPos.position.set(-0.015, -0.044, -0.699);
      muzzleFlashGroup.position.set(-0.015, -0.044, -0.694);
      laserOriginWorldPos.position.set(0.014, -0.042, -0.34);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.025, -0.044, -0.06);
    } else {
      // CARBINE_AR
      opticsContainer.position.set(0, 0.018, -0.02);
      opticsContainer.scale.setScalar(0.9);
      suppressorGroup.position.set(0, -0.002, -0.54);
      muzzleWorldPos.position.set(0, -0.002, -0.52);
      muzzleFlashGroup.position.set(0, -0.002, -0.51);
      laserOriginWorldPos.position.set(0.026, 0.002, -0.32);
      peqLaserBeam.position.copy(laserOriginWorldPos.position);
      ejectionPortWorldPos.position.set(0.024, 0.006, 0.01);
    }

    const railMount = WEAPON_RAIL_MOUNTS[weaponId];
    if (railMount) {
      opticsContainer.position.set(
        railMount.pos[0],
        railMount.pos[1],
        railMount.pos[2]
      );
      opticsContainer.scale.setScalar(railMount.scale);
    }

    peq15ModelGroup.position.copy(laserOriginWorldPos.position);
    opticsContainer.visible =
      weaponId !== 'KNIFE_TACTICAL' &&
      weaponId !== 'SNIPER_AWP' &&
      weaponId !== 'SNIPER_HEAVY';
    leftHandGroup.position.copy(leftBasePos);
    leftHandGroup.rotation.copy(leftBaseEuler);
    rightHandGroup.position.copy(rightBasePos);
    rightHandGroup.rotation.copy(rightBaseEuler);
  };

  configureWeaponAnchors('P50_PISTOL');

  let armsRigLoading = false;
  let armsRigLoaded = false;

  const onArmsRigLoaded = (gltf: {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  }) => {
    armsRigLoading = false;
    if (disposed) {
      disposeObject3DResources(gltf.scene, sharedProcTexSet);
      return;
    }
    armsRigLoaded = true;
    armsRigCtrl = setupFirstPersonArmsRig(
      gltf.scene,
      gltf.animations || [],
      armsRigContainer,
      textures
    );
    onSubtreeLoaded?.(gltf.scene);
  };

  const ensureArmsRigLoaded = () => {
    if (disposed || armsRigLoaded || armsRigLoading) return;
    armsRigLoading = true;
    gltfLoader.load(
      resolveAssetUrl(ARMS_RIG_LOCAL_URL),
      onArmsRigLoaded,
      undefined,
      () => {
        if (disposed) {
          armsRigLoading = false;
          return;
        }
        gltfLoader.load(
          ARMS_RIG_GITHUB_RAW_URL,
          onArmsRigLoaded,
          undefined,
          () => {
            armsRigLoading = false;
          }
        );
      }
    );
  };

  evictOverflowGlbWeapons = () => {
    const loadedEntries = (Object.values(weaponPacks) as AnimatedWeaponPackEntry[]).filter(
      (e) => !e.procedural && e.loaded && e.weaponId !== activeWeapon
    );
    if (loadedEntries.length + 1 <= MAX_LOADED_GLB_WEAPONS) return;
    loadedEntries.sort((a, b) => {
      const aKeep = keptWeaponIds.has(a.weaponId) ? 1 : 0;
      const bKeep = keptWeaponIds.has(b.weaponId) ? 1 : 0;
      if (aKeep !== bKeep) return aKeep - bKeep;
      return a.lastUsedAt - b.lastUsedAt;
    });
    let total = loadedEntries.length + 1;
    for (let i = 0; i < loadedEntries.length && total > MAX_LOADED_GLB_WEAPONS; i++) {
      loadedEntries[i].unloadNow();
      total--;
    }
  };

  const prewarmLoadout = (weaponIds: WeaponId[]) => {
    keptWeaponIds = new Set<WeaponId>(weaponIds);
    kinemationArmsRig.prewarmWeapons(weaponIds);
    weaponIds.forEach((id) => {
      if (isKinemationWeapon(id)) return;
      const entry = weaponPacks[id];
      if (!entry) return;
      entry.lastUsedAt = ++lruClock;
      entry.loadNow();
      if (id === 'SNIPER_TACTICAL' || id === 'SMG_MP5') {
        ensureArmsRigLoaded();
      }
    });
  };

  const pruneUnusedWeapons = (keepIds: WeaponId[]) => {
    keptWeaponIds = new Set<WeaponId>([...keepIds, activeWeapon]);
    kinemationArmsRig.pruneUnusedWeapons(keptWeaponIds);
    (Object.values(weaponPacks) as AnimatedWeaponPackEntry[]).forEach((e) => {
      if (!e.procedural && e.loaded && !keptWeaponIds.has(e.weaponId)) {
        e.unloadNow();
      }
    });
  };

  const dispose = () => {
    disposed = true;
    kinemationArmsRig.dispose();
    (Object.values(weaponPacks) as AnimatedWeaponPackEntry[]).forEach((e) => {
      e.unloadNow();
    });
    disposeObject3DResources(root, sharedProcTexSet);
  };

  // =========================================================================
  // 6. WEAPON SWITCHING & ANIMATION DISPATCHERS FOR ALL WEAPONS
  // =========================================================================
  const applyWeaponSkin = (weaponId: WeaponId, skinId: string) => {
    pendingSkinByWeapon[weaponId] = skinId;
    if (isKinemationWeapon(weaponId)) {
      kinemationArmsRig.applySkin(weaponId, skinId);
      return;
    }
    const entry = weaponPacks[weaponId];
    if (entry) {
      applyWeaponSkinToObject3D(entry.mountGroup, weaponId, skinId);
    }
    if (weaponId === 'M4_CARBINE') {
      applyWeaponSkinToObject3D(m4BodyGroup, weaponId, skinId);
    }
  };

  const setActiveWeapon = (weaponId: WeaponId) => {
    activeWeapon = weaponId;

    const usesKinemation = isKinemationWeapon(weaponId);

    (Object.keys(weaponPacks) as WeaponId[]).forEach((id) => {
      weaponPacks[id].mountGroup.visible = !usesKinemation && id === weaponId;
    });

    kinemationArmsRig.setActiveWeapon(weaponId);
    kinemationArmsRig.setOpticType(currentOpticType);

    if (usesKinemation) {
      m4BodyGroup.visible = false;
      armsRigContainer.visible = false;
      weaponMotionAnchor.position.set(0, 0, 0);
      weaponMotionAnchor.quaternion.identity();
      configureWeaponAnchors(weaponId);
      attachmentSystem.updateWeaponAlignment(weaponId);
      applyWeaponSkin(
        weaponId,
        pendingSkinByWeapon[weaponId] || getEquippedWeaponSkinId(weaponId)
      );
      kinemationArmsRig.triggerEquip(0.24);
      return;
    }

    const activeEntry = weaponPacks[weaponId];
    activeEntry.lastUsedAt = ++lruClock;
    activeEntry.loadNow();
    m4BodyGroup.visible = weaponId === 'M4_CARBINE' && !activeEntry.loaded;

    // Only Sniper Tactical (or unloaded fallback) uses universal rigged FPS arms (arms_rig.glb);
    // AK-47 uses its own native rigged hands & sleeves baked into fps_ak47.glb
    const usesUniversalArms =
      weaponId === 'SNIPER_TACTICAL' || weaponId === 'SMG_MP5';
    if (usesUniversalArms) {
      ensureArmsRigLoaded();
    }
    armsRigContainer.visible = usesUniversalArms;

    weaponMotionAnchor.position.set(0, 0, 0);
    weaponMotionAnchor.quaternion.identity();
    configureWeaponAnchors(weaponId);
    attachmentSystem.updateWeaponAlignment(weaponId);

    applyWeaponSkin(
      weaponId,
      pendingSkinByWeapon[weaponId] || getEquippedWeaponSkinId(weaponId)
    );

    playWeaponPackAction(activeEntry, 'Draw', undefined, 1.15);
  };

  let sniperBoltHandTimer = 0;
  /** Last AK loco donor action name — stop when switching weapons / becoming busy. */
  let akLocoDonorKey: string | null = null;

  /**
   * Weapons that may borrow AK-47 Walk/Run/Idle_Aim as a *motion donor*
   * (sample SKEL_AK_47_Rifle deltas → weaponMotionAnchor). True clip retarget
   * is impossible: AK uses UE5 DEF-* bones; other packs use unrelated hierarchies.
   */
  const AK_LOCO_DONOR_ELIGIBLE: ReadonlySet<WeaponId> = new Set([
    'P50_PISTOL',
    'SMG_45',
    'SHOTGUN_12',
    'M4_CARBINE',
    'CARBINE_AR',
    'AK12_RIFLE',
    'L49_LMG',
    'SNIPER_BOLT',
    'SNIPER_TACTICAL',
  ]);

  const packHasNativeWalkRun = (
    entry: AnimatedWeaponPackEntry | undefined
  ): boolean => {
    if (!entry?.loaded) return false;
    const a = entry.actions;
    return !!(
      a['RIG_UE5_Comando_AK_Walk'] ||
      a['RIG_UE5_Comando_AK__Run'] ||
      a['Walk'] ||
      a['Run'] ||
      a['Walk_Aim'] ||
      a['Sprint']
    );
  };

  const stopAkLocoDonor = (akEntry: AnimatedWeaponPackEntry): void => {
    if (!akLocoDonorKey) return;
    const act = akEntry.actions[akLocoDonorKey];
    if (act?.isRunning()) {
      act.weight = 0;
      act.stop();
    }
    akLocoDonorKey = null;
  };

  const pickAkLocoDonorKey = (isMoving: boolean, isAds: boolean): string | null => {
    const ak = weaponPacks.AK47_RIFLE?.actions;
    if (!ak) return null;
    const walk = ak['RIG_UE5_Comando_AK_Walk'] ? 'RIG_UE5_Comando_AK_Walk' : null;
    const walkAim = ak['RIG_UE5_Comando_AK_Walk_Aim']
      ? 'RIG_UE5_Comando_AK_Walk_Aim'
      : null;
    const run = ak['RIG_UE5_Comando_AK__Run'] ? 'RIG_UE5_Comando_AK__Run' : null;
    const idle = ak['RIG_UE5_Comando_AK_Idle']
      ? 'RIG_UE5_Comando_AK_Idle'
      : ak['RIG_UE5_Comando_AK_Hold']
        ? 'RIG_UE5_Comando_AK_Hold'
        : null;
    const idleAim = ak['RIG_UE5_Comando_AK_Idle_Aim']
      ? 'RIG_UE5_Comando_AK_Idle_Aim'
      : null;
    if (isMoving && isAds) return walkAim || walk || idleAim || idle;
    if (isMoving) return run || walk || idle;
    if (isAds) return idleAim || idle;
    return idle;
  };

  const triggerFireAnimation = (isAds = false) => {
    if (isKinemationWeapon(activeWeapon)) {
      kinemationArmsRig.triggerFire();
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    const speed =
      activeWeapon === 'SNIPER_BOLT' || activeWeapon === 'SHOTGUN_12'
        ? 1.45
        : activeWeapon === 'SNIPER_TACTICAL'
          ? 1.85
          : 1.3;
    if (activeWeapon === 'SNIPER_TACTICAL') {
      sniperBoltHandTimer = 1.08;
    }
    // Prefer Aim_Fire clip on AK-47 when ADS (clip already in pack).
    if (
      activeWeapon === 'AK47_RIFLE' &&
      isAds &&
      activeEntry?.actions['RIG_UE5_Comando_AK_Aim_Fire']
    ) {
      activeEntry.actions['Fire'] = activeEntry.actions['RIG_UE5_Comando_AK_Aim_Fire'];
    } else if (
      activeWeapon === 'AK47_RIFLE' &&
      activeEntry?.actions['RIG_UE5_Comando_AK_Fire']
    ) {
      activeEntry.actions['Fire'] = activeEntry.actions['RIG_UE5_Comando_AK_Fire'];
    }
    playWeaponPackAction(activeEntry, 'Fire', undefined, speed);
  };

  const triggerReloadAnimation = (durationSec: number) => {
    if (isKinemationWeapon(activeWeapon)) {
      kinemationArmsRig.triggerReload(durationSec, durationSec >= 2.08);
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    const clipKey = durationSec >= 2.15 ? 'Reload_Empty' : 'Reload';
    playWeaponPackAction(activeEntry, clipKey, durationSec);
  };

  const triggerShotgunShellInsertAnimation = (
    durationSec = 0.45,
    totalReloadDurationSec?: number
  ) => {
    if (isKinemationWeapon(activeWeapon)) {
      kinemationArmsRig.triggerShotgunReload(
        totalReloadDurationSec ?? Math.max(1.1, durationSec * 2.5),
        false
      );
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    playWeaponPackAction(activeEntry, 'ShotgunInsert', durationSec);
  };

  const triggerShotgunPumpAnimation = (durationSec = 0.44) => {
    if (isKinemationWeapon(activeWeapon)) {
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    playWeaponPackAction(activeEntry, 'ShotgunPump', durationSec);
  };

  const triggerBoltAnimation = () => {
    if (isKinemationWeapon(activeWeapon)) {
      kinemationArmsRig.triggerBoltCycle(0.72);
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    playWeaponPackAction(activeEntry, 'Draw', 0.75);
  };

  const triggerInspectAnimation = () => {
    if (isKinemationWeapon(activeWeapon)) {
      kinemationArmsRig.triggerInspect();
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    if (activeEntry?.actions['Inspect']) {
      playWeaponPackAction(activeEntry, 'Inspect', 2.4);
    } else {
      playWeaponPackAction(activeEntry, 'Draw', 1.35);
    }
  };

  const triggerEquipAnimation = () => {
    if (isKinemationWeapon(activeWeapon)) {
      kinemationArmsRig.triggerEquip(0.24);
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    playWeaponPackAction(activeEntry, 'Draw', 0.9);
  };

  const triggerHolsterAnimation = () => {
    if (isKinemationWeapon(activeWeapon)) {
      return;
    }
    const activeEntry = weaponPacks[activeWeapon];
    playWeaponPackAction(activeEntry, 'Holster', 0.5);
  };

  const setTriggerPull = (pullAlpha: number) => {
    currentTriggerPullAlpha = THREE.MathUtils.clamp(pullAlpha, 0, 1);
  };

  // =========================================================================
  // 7. PER-FRAME WEAPON PACK ANIMATION SYNCHRONIZATION
  // =========================================================================
  const updateGlbAnimations = (
    dt: number,
    isMoving = false,
    isAds = false,
    reloadPhase: ReloadPhase = 'IDLE',
    _reloadProgress = 0
  ) => {
    animElapsed += dt;

    const activeEntry = weaponPacks[activeWeapon];
    const akEntry = weaponPacks.AK47_RIFLE;
    if (activeEntry && activeEntry.builtInOpticNodes.length > 0) {
      const hasCustom3DScope =
        currentOpticType !== 'iron' ||
        redDotScopeGroup.visible ||
        kolimatorScopeGroup.visible ||
        holoSightGroup.visible ||
        lpvoScopeGroup.visible;
      const showBuiltIn = !hasCustom3DScope;
      for (let i = 0; i < activeEntry.builtInOpticNodes.length; i++) {
        activeEntry.builtInOpticNodes[i].visible = showBuiltIn;
      }
    }
    const laserVisible = peqLaserBeam.visible && activeWeapon !== 'KNIFE_TACTICAL';
    if (laserVisible) {
      ensureLaserAccessoryLoaded();
    }
    peq15ModelGroup.visible = laserVisible;

    if (isKinemationWeapon(activeWeapon)) {
      if (akEntry?.loaded) {
        stopAkLocoDonor(akEntry);
      }
      kinemationArmsRig.update(dt, reloadPhase, weaponMotionAnchor);
      root.updateMatrixWorld(true);
      return;
    }

    const busy =
      !!activeEntry?.loaded &&
      !!(
        activeEntry.actions['Fire']?.isRunning() ||
        activeEntry.actions['Reload']?.isRunning() ||
        activeEntry.actions['Reload_Empty']?.isRunning() ||
        activeEntry.actions['ShotgunInsert']?.isRunning() ||
        activeEntry.actions['ShotgunPump']?.isRunning() ||
        activeEntry.actions['Inspect']?.isRunning() ||
        activeEntry.actions['Draw']?.isRunning() ||
        activeEntry.actions['Shoot']?.isRunning()
      );
    const nativeLoco = packHasNativeWalkRun(activeEntry);
    const useAkDonor =
      !nativeLoco &&
      !busy &&
      reloadPhase === 'IDLE' &&
      AK_LOCO_DONOR_ELIGIBLE.has(activeWeapon) &&
      !!akEntry?.loaded &&
      !!akEntry.mixer &&
      !!akEntry.mainBoneNode &&
      !!akEntry.mainBoneRestPos;

    if (activeEntry && activeEntry.loaded && activeEntry.mixer) {
      // Native loco (AK-47 today): play Walk/Run/Idle_Aim on the active mixer.
      if (reloadPhase === 'IDLE' && nativeLoco && !busy) {
        const acts = activeEntry.actions;
        const walk =
          acts['RIG_UE5_Comando_AK_Walk'] || acts['Walk'] || acts['walk'];
        const walkAim =
          acts['RIG_UE5_Comando_AK_Walk_Aim'] ||
          acts['Walk_Aim'] ||
          acts['walk_aim'];
        const run =
          acts['RIG_UE5_Comando_AK__Run'] ||
          acts['Run'] ||
          acts['run'] ||
          acts['Sprint'];
        const idle =
          acts['RIG_UE5_Comando_AK_Idle'] ||
          acts['Idle'] ||
          acts['idle'] ||
          acts['RIG_UE5_Comando_AK_Hold'] ||
          acts['Hold'];
        const idleAim =
          acts['RIG_UE5_Comando_AK_Idle_Aim'] ||
          acts['Idle_Aim'] ||
          acts['idle_aim'];

        let loco: THREE.AnimationAction | undefined;
        if (isMoving && isAds) loco = walkAim || walk || idleAim || idle;
        else if (isMoving) loco = run || walk || idle;
        else if (isAds) loco = idleAim || idle;
        else loco = idle;

        if (
          loco &&
          (loco === idle ||
            loco === idleAim ||
            loco === walk ||
            loco === walkAim ||
            loco === run)
        ) {
          Object.entries(acts).forEach(([, act]) => {
            if (act !== loco && act.loop === THREE.LoopRepeat) {
              act.weight = 0;
              act.stop();
            }
          });
          if (!loco.isRunning() || loco.loop !== THREE.LoopRepeat) {
            loco.setLoop(THREE.LoopRepeat, Infinity);
            loco.clampWhenFinished = false;
            loco.weight = 1;
            loco.reset();
            loco.play();
          } else {
            loco.weight = 1;
          }
          loco.timeScale = isMoving
            ? isAds
              ? 0.95
              : run && loco === run
                ? 1.2
                : 1.1
            : 1.0;
        }
      }

      // AK-12 & SHOTGUN_12 Idle only: keep Idle looping when standing (no Walk/Run in pack).
      if (
        reloadPhase === 'IDLE' &&
        !nativeLoco &&
        !busy &&
        (activeWeapon === 'AK12_RIFLE' ||
          activeWeapon === 'SHOTGUN_12' ||
          activeWeapon === 'SHOTGUN_SPAS') &&
        activeEntry.actions['Idle'] &&
        !useAkDonor
      ) {
        const idle = activeEntry.actions['Idle'];
        if (!idle.isRunning() || idle.loop !== THREE.LoopRepeat) {
          idle.setLoop(THREE.LoopRepeat, Infinity);
          idle.clampWhenFinished = false;
          idle.weight = 1;
          idle.reset().play();
        }
      }

      activeEntry.mixer.update(dt);
    }

    // AK loco motion donor: play Walk/Run/Idle_Aim on the hidden AK mixer and
    // copy SKEL_AK_47_Rifle deltas onto weaponMotionAnchor for other 1P packs.
    if (useAkDonor && akEntry) {
      const key = pickAkLocoDonorKey(isMoving, isAds);
      if (key && akEntry.actions[key]) {
        if (akLocoDonorKey && akLocoDonorKey !== key) {
          const prev = akEntry.actions[akLocoDonorKey];
          if (prev?.isRunning()) {
            prev.weight = 0;
            prev.stop();
          }
        }
        const loco = akEntry.actions[key];
        if (!loco.isRunning() || loco.loop !== THREE.LoopRepeat || akLocoDonorKey !== key) {
          // Stop other AK repeat loops (don't interrupt if somehow firing — AK is hidden).
          Object.entries(akEntry.actions).forEach(([n, act]) => {
            if (n !== key && act.loop === THREE.LoopRepeat && act.isRunning()) {
              act.weight = 0;
              act.stop();
            }
          });
          loco.setLoop(THREE.LoopRepeat, Infinity);
          loco.clampWhenFinished = false;
          loco.weight = 1;
          loco.reset();
          loco.play();
          akLocoDonorKey = key;
        } else {
          loco.weight = 1;
        }
        loco.timeScale = isMoving
          ? isAds
            ? 0.95
            : key.includes('Run')
              ? 1.2
              : 1.1
          : 1.0;
        akEntry.mixer!.update(dt);
      }
    } else if (akEntry?.loaded && activeWeapon !== 'AK47_RIFLE') {
      stopAkLocoDonor(akEntry);
    } else if (activeWeapon === 'AK47_RIFLE') {
      // Native AK loco owns the mixer — clear donor bookkeeping.
      akLocoDonorKey = null;
    }

    if (activeEntry?.loaded && activeEntry.mainBoneNode && activeEntry.mainBoneRestInGunInv) {
      computeNodeMatrixInGunSpace(activeEntry.mainBoneNode, gunGroup, _gunSpaceMat);
      _deltaBoneMat.multiplyMatrices(_gunSpaceMat, activeEntry.mainBoneRestInGunInv);
      _deltaBoneMat.decompose(_deltaBonePos, _deltaBoneQuat, _deltaBoneScale);
      weaponMotionAnchor.position.copy(_deltaBonePos);
      weaponMotionAnchor.quaternion.copy(_deltaBoneQuat);
    } else {
      weaponMotionAnchor.position.set(0, 0, 0);
      weaponMotionAnchor.quaternion.identity();
    }

    root.updateMatrixWorld(true);

    if (armsRigCtrl && armsRigContainer.visible) {
      if (activeWeapon === 'SNIPER_TACTICAL' && sniperBoltHandTimer > 0) {
        sniperBoltHandTimer = Math.max(0, sniperBoltHandTimer - dt);
        const p = 1 - sniperBoltHandTimer / 1.08;
        // Animate Right Hand reaching up to bolt handle, pulling back, pushing forward, and returning to grip
        let dy = 0;
        let dz = 0;
        let dx = 0;
        if (p > 0.12 && p < 0.88) {
          const bp = (p - 0.12) / 0.76;
          if (bp < 0.28) {
            const a = bp / 0.28;
            dy = 0.068 * a;
            dz = -0.055 * a;
            dx = 0.018 * a;
          } else if (bp < 0.58) {
            const a = (bp - 0.28) / 0.3;
            dy = 0.068 + 0.012 * Math.sin(a * Math.PI);
            dz = -0.055 + 0.095 * a;
            dx = 0.018 + 0.012 * a;
          } else if (bp < 0.82) {
            const a = (bp - 0.58) / 0.24;
            dy = 0.068 * (1 - a * 0.25);
            dz = 0.04 - 0.095 * a;
            dx = 0.03 * (1 - a * 0.4);
          } else {
            const a = (bp - 0.82) / 0.18;
            dy = 0.051 * (1 - a);
            dz = -0.055 * (1 - a);
            dx = 0.018 * (1 - a);
          }
        }
        rightHandGroup.position.set(
          rightBasePos.x + dx,
          rightBasePos.y + dy,
          rightBasePos.z + dz
        );
      } else {
        rightHandGroup.position.copy(rightBasePos);
      }

      armsRigCtrl.solveAndPose(
        dt,
        rightHandGroup,
        leftHandGroup,
        rightPoleDir,
        leftPoleDir,
        0.98,
        0.96,
        currentTriggerPullAlpha,
        1.0
      );
    }
  };

  const activePackHasWalkRunClips = (): boolean => {
    if (packHasNativeWalkRun(weaponPacks[activeWeapon])) return true;
    // Donor counts as "has loco" so kinematics softens procedural bob boost.
    if (
      AK_LOCO_DONOR_ELIGIBLE.has(activeWeapon) &&
      packHasNativeWalkRun(weaponPacks.AK47_RIFLE)
    ) {
      return true;
    }
    return false;
  };

  return {
    root,
    gunGroup,
    boltCarrier,
    chargingHandle,
    boltCatch,
    fireSelector,
    triggerMesh,
    magazineGroup,
    topCartridges,
    suppressorGroup,
    flashHiderGroup,
    holoSightGroup,
    holoReticleMesh,
    lpvoScopeGroup,
    lpvoReticleMesh,
    lpvoThrowLever,
    redDotScopeGroup,
    kolimatorScopeGroup,
    ironSightsGroup,
    cantedSightGroup,
    cantedReticleMesh,
    peqLaserBeam,
    setOpticType,
    leftHandGroup,
    rightHandGroup,
    rightTriggerFinger,
    setActiveWeapon,
    applyWeaponSkin,
    setTriggerPull,
    triggerFireAnimation,
    triggerReloadAnimation,
    triggerShotgunShellInsertAnimation,
    triggerShotgunPumpAnimation,
    triggerBoltAnimation,
    triggerInspectAnimation,
    triggerEquipAnimation,
    triggerHolsterAnimation,
    updateGlbAnimations,
    activePackHasWalkRunClips,
    muzzleFlashGroup,
    muzzleLight,
    ejectionPortWorldPos,
    muzzleWorldPos,
    laserOriginWorldPos,
    armsRigContainer,
    attachmentSystem,
    prewarmLoadout,
    pruneUnusedWeapons,
    dispose,
  };
}

export function getOpticAdsTransform(
  optic: OpticType,
  cantedActive: boolean,
  activeWeapon: WeaponId = 'P50_PISTOL'
): { pos: THREE.Vector3; rotZ: number } {
  const out = _adsTransformOut;
  out.rotZ = 0;

  if (cantedActive) {
    out.pos.set(-0.048, -0.051, -0.22);
    out.rotZ = Math.PI / 4;
    return out;
  }
  if (
    optic !== 'iron' &&
    activeWeapon !== 'KNIFE_TACTICAL' &&
    activeWeapon !== 'SNIPER_AWP' &&
    activeWeapon !== 'SNIPER_HEAVY'
  ) {
    const rail = WEAPON_RAIL_MOUNTS[activeWeapon];
    const spec = SCOPE_OPTICAL_CENTERS[optic];
    if (rail && spec) {
      out.pos.set(
        -rail.pos[0],
        -(rail.pos[1] + rail.scale * spec.opticalHeightY),
        -(rail.pos[2] + rail.scale * spec.rearLensZ) - spec.eyeRelief
      );
      return out;
    }
  }
  if (activeWeapon === 'AK12_RIFLE') {
    out.pos.set(0.0014, -0.0528, -0.22);
    return out;
  }
  if (activeWeapon === 'P50_PISTOL') {
    out.pos.set(0, -0.023, -0.23);
    return out;
  }
  if (activeWeapon === 'M1911_PISTOL') {
    out.pos.set(0, -0.0185, -0.22);
    return out;
  }
  if (activeWeapon === 'SMG_45') {
    out.pos.set(0, -0.072, -0.22);
    return out;
  }
  if (activeWeapon === 'SMG_MP5') {
    out.pos.set(0, -0.054, -0.22);
    return out;
  }
  if (activeWeapon === 'SHOTGUN_12') {
    out.pos.set(0, -0.031, -0.22);
    return out;
  }
  if (activeWeapon === 'SHOTGUN_SPAS') {
    out.pos.set(0, -0.088, -0.21);
    return out;
  }
  if (activeWeapon === 'S_MILITARY') {
    out.pos.set(0.002, -0.052, -0.18);
    return out;
  }
  if (activeWeapon === 'CARBINE_AR') {
    out.pos.set(0, -0.078, -0.2);
    return out;
  }
  if (activeWeapon === 'AK47_RIFLE') {
    out.pos.set(0, -0.052, -0.22);
    return out;
  }
  if (activeWeapon === 'M4_CARBINE') {
    out.pos.set(0, -0.05, -0.24);
    return out;
  }
  if (activeWeapon === 'L49_LMG') {
    out.pos.set(0, -0.072, -0.22);
    return out;
  }
  if (activeWeapon === 'SNIPER_BOLT') {
    out.pos.set(0, -0.0249, -0.21);
    return out;
  }
  if (activeWeapon === 'SNIPER_TACTICAL') {
    out.pos.set(0.0016, -0.035, -0.22);
    return out;
  }
  if (activeWeapon === 'SNIPER_AWP') {
    out.pos.set(0, -0.064, -0.18);
    return out;
  }
  if (activeWeapon === 'SNIPER_HEAVY') {
    out.pos.set(0, -0.072, -0.18);
    return out;
  }
  if (activeWeapon === 'RPG7_LAUNCHER') {
    out.pos.set(-0.008, -0.092, -0.22);
    return out;
  }
  if (activeWeapon === 'KNIFE_TACTICAL') {
    out.pos.set(0, -0.02, -0.06);
    return out;
  }
  if (optic === 'lpvo') {
    out.pos.set(0, -0.056, -0.18);
    return out;
  }
  if (optic === 'iron') {
    out.pos.set(0, -0.052, -0.24);
    return out;
  }
  out.pos.set(0, -0.06, -0.22);
  return out;
}
