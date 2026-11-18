import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ReloadPhase, WeaponId } from '../types/game';
import { resolveAssetUrl } from '../utils/assetUrl';
import { getEquippedWeaponSkinId } from '../progression/loadoutSystem';
import { applyWeaponSkinToObject3D } from './weaponSkinMaterial';
import { disposeObject3DResources } from './gpuBudget';

export const KINEMATION_ARMS_BASE_URL = '/models/kinemation/arms_base.glb';

export interface KinemationWeaponAttachSpec {
  weaponId: WeaponId;
  modelUrl: string;
  /** Prefixo dos clips no arms_base.glb (ex: 'MX16A4' -> 'MX16A4_Pose', 'MX16A4_Reload_Tac'). */
  clipPrefix: string;
  /** Escala local da arma dentro do socket (padrão 1.0 = metros reais 1:1). */
  scale?: number;
  /** Ajuste fino de posição no socket da mão (metros locais). */
  attachOffset?: [number, number, number];
  /** Ajuste fino de rotação adicional (Euler XYZ rad) sobre o offset base (+PI/2 em X). */
  attachEuler?: [number, number, number];
  /** Âncoras em metros relativas ao centro da arma alinhado em gunGroup (frente = -Z). */
  muzzlePos: [number, number, number];
  ejectionPos: [number, number, number];
  laserPos: [number, number, number];
  railMountPos: [number, number, number];
  railMountScale: number;
  /** Sniper bolt-action com ciclo de ferrolho na animação Fire (Kar98K). */
  hasBoltActionFireClip?: boolean;
  /** Escopeta / arma com reload único em vez de reiniciar por cartucho (Drake-12). */
  reloadUsesFullClipOnce?: boolean;
}

/**
 * Registro modular das armas acopladas ao esqueleto base UE4 (`arms_base.glb`).
 * Qualquer nova arma baixada no mesmo padrão pode ser conectada em 1 entrada
 * via `registerKinemationWeapon()`.
 */
export const KINEMATION_WEAPON_REGISTRY: Partial<
  Record<WeaponId, KinemationWeaponAttachSpec>
> = {
  P50_PISTOL: {
    weaponId: 'P50_PISTOL',
    modelUrl: '/models/kinemation/weapons/dgl50.glb',
    clipPrefix: 'DGL50',
    muzzlePos: [0, 0.003, -0.203],
    ejectionPos: [0.018, 0.015, -0.04],
    laserPos: [0, -0.014, -0.14],
    railMountPos: [0, 0.02, -0.01],
    railMountScale: 0.68,
  },
  SMG_MP5: {
    weaponId: 'SMG_MP5',
    modelUrl: '/models/kinemation/weapons/mps5.glb',
    clipPrefix: 'MPS5',
    muzzlePos: [0, 0.0, -0.341],
    ejectionPos: [0.022, 0.016, -0.06],
    laserPos: [0.024, 0.002, -0.22],
    railMountPos: [0, 0.038, -0.03],
    railMountScale: 0.78,
  },
  M4_CARBINE: {
    weaponId: 'M4_CARBINE',
    modelUrl: '/models/kinemation/weapons/mx16a4.glb',
    clipPrefix: 'MX16A4',
    muzzlePos: [0, -0.011, -0.596],
    ejectionPos: [0.024, -0.004, -0.04],
    laserPos: [0.026, -0.008, -0.26],
    railMountPos: [0, 0.016, 0.01],
    railMountScale: 0.88,
  },
  AK12_RIFLE: {
    weaponId: 'AK12_RIFLE',
    modelUrl: '/models/kinemation/weapons/ak200.glb',
    clipPrefix: 'AKX',
    muzzlePos: [0, 0.0, -0.534],
    ejectionPos: [0.024, 0.01, -0.04],
    laserPos: [0.026, 0.01, -0.24],
    railMountPos: [-0.0014, 0.047, -0.02],
    railMountScale: 0.86,
  },
  SHOTGUN_12: {
    weaponId: 'SHOTGUN_12',
    modelUrl: '/models/kinemation/weapons/drake12.glb',
    clipPrefix: 'Drake12',
    muzzlePos: [0, 0.01, -0.716],
    ejectionPos: [0.018, 0.016, 0.01],
    laserPos: [0.02, -0.012, -0.4],
    railMountPos: [0, 0.025, 0.0],
    railMountScale: 0.82,
    reloadUsesFullClipOnce: true,
  },
  SNIPER_BOLT: {
    weaponId: 'SNIPER_BOLT',
    modelUrl: '/models/kinemation/weapons/kar98k.glb',
    clipPrefix: 'Kar98K',
    muzzlePos: [0, -0.002, -0.713],
    ejectionPos: [0.022, 0.01, -0.04],
    laserPos: [0.022, -0.006, -0.36],
    railMountPos: [0, 0.02, -0.02],
    railMountScale: 0.88,
    hasBoltActionFireClip: true,
  },
  SNIPER_TACTICAL: {
    weaponId: 'SNIPER_TACTICAL',
    modelUrl: '/models/kinemation/weapons/mk14.glb',
    clipPrefix: 'MK14',
    muzzlePos: [0, 0.001, -0.612],
    ejectionPos: [0.024, 0.008, -0.04],
    laserPos: [0.026, -0.002, -0.34],
    railMountPos: [-0.0016, 0.021, -0.04],
    railMountScale: 0.88,
  },
};

/**
 * Templates extras já convertidos e prontos para acoplamento na mesma base `arms_base.glb`
 * caso novos slots de armamento (ex: M1911 ou RPG-7) sejam adicionados ao WeaponId.
 */
export const KINEMATION_EXTRA_WEAPON_TEMPLATES: Record<
  'M1911' | 'RPG7',
  Omit<KinemationWeaponAttachSpec, 'weaponId'>
> = {
  M1911: {
    modelUrl: '/models/kinemation/weapons/m1911.glb',
    clipPrefix: 'M1911',
    muzzlePos: [0, -0.004, -0.132],
    ejectionPos: [0.016, 0.01, -0.02],
    laserPos: [0, -0.014, -0.1],
    railMountPos: [0, 0.015, 0.0],
    railMountScale: 0.65,
  },
  RPG7: {
    modelUrl: '/models/kinemation/weapons/rpg7.glb',
    clipPrefix: 'RPG7',
    muzzlePos: [0, 0.01, -0.849],
    ejectionPos: [0, 0.01, 0.794],
    laserPos: [0.03, 0.04, -0.25],
    railMountPos: [0.008, 0.095, -0.01],
    railMountScale: 0.8,
  },
};

export function registerKinemationWeapon(spec: KinemationWeaponAttachSpec): void {
  KINEMATION_WEAPON_REGISTRY[spec.weaponId] = spec;
}

export function isKinemationWeapon(weaponId: WeaponId): boolean {
  return Boolean(KINEMATION_WEAPON_REGISTRY[weaponId]);
}

export function getKinemationWeaponSpec(
  weaponId: WeaponId
): KinemationWeaponAttachSpec | undefined {
  return KINEMATION_WEAPON_REGISTRY[weaponId];
}

// Scratch math objects pré-alocados (Zero-GC no loop de 60 FPS)
const _relMat = new THREE.Matrix4();
const _attachWorldMat = new THREE.Matrix4();
const _deltaMat = new THREE.Matrix4();
const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3();
const _restIkPos = new THREE.Vector3();
const _ancestorChain: THREE.Object3D[] = [];

function computeMatrixInAncestorSpace(
  node: THREE.Object3D,
  ancestorRoot: THREE.Object3D,
  out: THREE.Matrix4
): THREE.Matrix4 {
  _ancestorChain.length = 0;
  let cur: THREE.Object3D | null = node;
  while (cur && cur !== ancestorRoot) {
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

interface LoadedWeaponInstance {
  spec: KinemationWeaponAttachSpec;
  socketGroup: THREE.Group;
  modelScene: THREE.Group | null;
  mixer: THREE.AnimationMixer | null;
  actions: Record<string, THREE.AnimationAction>;
  restAttachInRigInv: THREE.Matrix4 | null;
  poseArmsCenterOffset: THREE.Vector3;
  karClipMesh: THREE.Object3D | null;
  karCartridgeBone: THREE.Object3D | null;
  loaded: boolean;
  loading: boolean;
  lastUsedAt: number;
}

export interface KinemationArmsRigController {
  rigRoot: THREE.Group;
  setActiveWeapon: (weaponId: WeaponId) => void;
  prewarmWeapons: (weaponIds: WeaponId[]) => void;
  pruneUnusedWeapons: (keepIds: ReadonlySet<WeaponId>) => void;
  applySkin: (weaponId: WeaponId, skinId: string) => void;
  isActiveWeaponReady: () => boolean;
  triggerFire: () => void;
  triggerReload: (durationSec: number, isEmpty: boolean) => void;
  triggerShotgunReload: (totalDurationSec: number, isEmpty: boolean) => void;
  triggerBoltCycle: (durationSec?: number) => void;
  triggerEquip: (durationSec?: number) => void;
  triggerInspect: () => void;
  update: (
    dt: number,
    reloadPhase: ReloadPhase,
    weaponMotionAnchor: THREE.Object3D
  ) => void;
  dispose: () => void;
}

function configureKinemationMaterials(
  sceneRoot: THREE.Object3D,
  isArms: boolean
): void {
  sceneRoot.traverse((child) => {
    child.frustumCulled = false;
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;

      const handleMat = (mat: THREE.Material) => {
        const std = mat as THREE.MeshStandardMaterial;
        if (!std) return;
        if (std.map) {
          std.map.colorSpace = THREE.SRGBColorSpace;
          std.map.needsUpdate = true;
        }
        if (std.emissiveMap) {
          std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          std.emissiveMap.needsUpdate = true;
        }
        const mName = (std.name || '').toLowerCase();
        const isTranslucentMag =
          mName.includes('translucent') ||
          mName.includes('translusent') ||
          (std.transparent && std.opacity < 0.85);

        if (isArms) {
          if (std.color) std.color.setHex(0xffffff);
          std.vertexColors = false;
          std.envMapIntensity = 0.9;
        } else if (isTranslucentMag) {
          std.transparent = true;
          std.opacity = Math.min(std.opacity || 0.38, 0.42);
          std.depthWrite = false;
          std.roughness = 0.12;
          mesh.renderOrder = 8;
        } else {
          std.envMapIntensity = 1.18;
          if (!std.map && std.roughness > 0.85 && mName.includes('finish')) {
            std.roughness = 0.42;
          }
        }
        std.needsUpdate = true;
      };

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(handleMat);
      } else if (mesh.material) {
        handleMat(mesh.material);
      }
    }
  });
}

export function createKinemationArmsRig(params: {
  gltfLoader: GLTFLoader;
  sharedProcTexSet: Set<THREE.Texture>;
  onSubtreeLoaded?: (subtree: THREE.Object3D) => void;
}): KinemationArmsRigController {
  const { gltfLoader, sharedProcTexSet, onSubtreeLoaded } = params;

  const MAX_LOADED_KINEMATION_WEAPONS = 4;

  const rigRoot = new THREE.Group();
  rigRoot.name = 'KinemationRigRoot';
  rigRoot.visible = false;

  // Braços base orientados para -Z (câmera FPS em Three.js). A translação negativa de
  // `ik_hand_gun` coloca a empunhadura / receptor exatamente em (0, 0, 0) do gunGroup.
  const armsCenterGroup = new THREE.Group();
  armsCenterGroup.name = 'KinemationArmsCenter';
  rigRoot.add(armsCenterGroup);

  const armsRotateYGroup = new THREE.Group();
  armsRotateYGroup.rotation.y = Math.PI;
  armsCenterGroup.add(armsRotateYGroup);

  // Irmão de armsCenterGroup para não herdar escala 0.01 interna do FBX dos braços!
  const weaponMount = new THREE.Group();
  weaponMount.name = 'KinemationWeaponMount';
  rigRoot.add(weaponMount);

  let disposed = false;
  let lruClock = 0;
  let activeWeapon: WeaponId | null = null;
  let keptWeapons = new Set<WeaponId>();
  const pendingSkinMap: Partial<Record<WeaponId, string>> = {};

  // Estado dos braços base
  let armsLoaded = false;
  let armsLoading = false;
  let armsScene: THREE.Group | null = null;
  let armsMixer: THREE.AnimationMixer | null = null;
  let ikHandGunBone: THREE.Object3D | null = null;
  const armsActions: Record<string, THREE.AnimationAction> = {};
  let currentArmsBaseAction: THREE.AnimationAction | null = null;
  let currentArmsOneShot: THREE.AnimationAction | null = null;
  let currentWeaponOneShot: THREE.AnimationAction | null = null;
  let equipLiftTimer = 0;
  const EQUIP_LIFT_DUR = 0.24;
  let reloadLockActive = false;

  const weaponInstances = new Map<WeaponId, LoadedWeaponInstance>();

  const getOrCreateWeaponInstance = (
    weaponId: WeaponId
  ): LoadedWeaponInstance | null => {
    const spec = KINEMATION_WEAPON_REGISTRY[weaponId];
    if (!spec) return null;
    const existing = weaponInstances.get(weaponId);
    if (existing) return existing;

    const socketGroup = new THREE.Group();
    socketGroup.name = `KinemationSocket_${spec.clipPrefix}`;
    socketGroup.rotation.x = Math.PI / 2;
    if (spec.attachEuler) {
      socketGroup.rotation.x += spec.attachEuler[0];
      socketGroup.rotation.y += spec.attachEuler[1];
      socketGroup.rotation.z += spec.attachEuler[2];
    }
    if (spec.attachOffset) {
      socketGroup.position.set(
        spec.attachOffset[0],
        spec.attachOffset[1],
        spec.attachOffset[2]
      );
    }
    const sc = spec.scale ?? 1.0;
    socketGroup.scale.setScalar(sc);
    socketGroup.visible = false;
    weaponMount.add(socketGroup);

    const inst: LoadedWeaponInstance = {
      spec,
      socketGroup,
      modelScene: null,
      mixer: null,
      actions: {},
      restAttachInRigInv: null,
      poseArmsCenterOffset: new THREE.Vector3(),
      karClipMesh: null,
      karCartridgeBone: null,
      loaded: false,
      loading: false,
      lastUsedAt: 0,
    };
    weaponInstances.set(weaponId, inst);
    return inst;
  };

  const stopAllArmsActions = () => {
    Object.values(armsActions).forEach((act) => {
      act.stop();
      act.weight = 0;
    });
    currentArmsBaseAction = null;
    currentArmsOneShot = null;
  };

  const stopAllWeaponActions = (inst: LoadedWeaponInstance | undefined) => {
    if (!inst) return;
    Object.values(inst.actions).forEach((act) => {
      act.stop();
      act.weight = 0;
    });
    currentWeaponOneShot = null;
  };

  const syncWeaponMountToIkBone = () => {
    if (!ikHandGunBone || !armsLoaded) return;
    computeMatrixInAncestorSpace(ikHandGunBone, rigRoot, _relMat);
    _relMat.decompose(_tmpPos, _tmpQuat, _tmpScale);
    weaponMount.position.copy(_tmpPos);
    weaponMount.quaternion.copy(_tmpQuat);
    weaponMount.scale.set(1, 1, 1);
  };

  /**
   * Calibra `armsCenterGroup.position` e `restAttachInRigInv` no frame zero da pose da arma
   * para alinhar exatamente o receptor em `(0,0,0)` do gunGroup (compatível com todas as miras 3D e ADS).
   */
  const calibrateActivePose = (weaponId: WeaponId) => {
    const inst = weaponInstances.get(weaponId);
    if (!inst || !inst.loaded || !armsLoaded || !armsMixer || !ikHandGunBone) {
      return;
    }

    const poseName = `${inst.spec.clipPrefix}_Pose`;
    const poseAct = armsActions[poseName];
    stopAllArmsActions();
    armsCenterGroup.position.set(0, 0, 0);

    if (poseAct) {
      poseAct.setLoop(THREE.LoopRepeat, Infinity);
      poseAct.clampWhenFinished = false;
      poseAct.weight = 1;
      poseAct.reset();
      poseAct.play();
      armsMixer.setTime(0);
      currentArmsBaseAction = poseAct;
    }

    // Coloca a arma na pose de repouso (para Kar98K usamos Fire t=0 se existir, evitando clip solto)
    stopAllWeaponActions(inst);
    if (inst.mixer) {
      const restClip =
        inst.spec.clipPrefix === 'Kar98K'
          ? inst.actions['Fire'] || inst.actions['Pose']
          : inst.actions['Pose'];
      if (restClip) {
        restClip.setLoop(THREE.LoopRepeat, Infinity);
        restClip.clampWhenFinished = false;
        restClip.weight = 1;
        restClip.reset();
        restClip.play();
        inst.mixer.setTime(0);
      }
    }

    // Avalia ik_hand_gun relativo a armsCenterGroup(0,0,0) dentro de rigRoot
    computeMatrixInAncestorSpace(ikHandGunBone, rigRoot, _relMat);
    _restIkPos.setFromMatrixPosition(_relMat);

    // Centraliza o receptor/ik_hand_gun da pose inicial em (0, 0, 0) de rigRoot
    inst.poseArmsCenterOffset.copy(_restIkPos).negate();
    armsCenterGroup.position.copy(inst.poseArmsCenterOffset);

    syncWeaponMountToIkBone();

    computeMatrixInAncestorSpace(inst.socketGroup, rigRoot, _attachWorldMat);
    inst.restAttachInRigInv = _attachWorldMat.clone().invert();

    // Oculta o pente stripper flutuante da Kar98K fora do reload
    if (inst.karClipMesh) {
      inst.karClipMesh.visible = false;
    }
    if (inst.karCartridgeBone) {
      inst.karCartridgeBone.scale.setScalar(0);
    }
  };

  const evictOverflowWeapons = () => {
    const candidates = Array.from(weaponInstances.values()).filter(
      (w) => w.loaded && w.spec.weaponId !== activeWeapon
    );
    if (candidates.length + 1 <= MAX_LOADED_KINEMATION_WEAPONS) return;
    candidates.sort((a, b) => {
      const aKeep = keptWeapons.has(a.spec.weaponId) ? 1 : 0;
      const bKeep = keptWeapons.has(b.spec.weaponId) ? 1 : 0;
      if (aKeep !== bKeep) return aKeep - bKeep;
      return a.lastUsedAt - b.lastUsedAt;
    });
    let total = candidates.length + 1;
    for (let i = 0; i < candidates.length && total > MAX_LOADED_KINEMATION_WEAPONS; i++) {
      unloadWeaponInstance(candidates[i]);
      total--;
    }
  };

  const unloadWeaponInstance = (inst: LoadedWeaponInstance) => {
    inst.loading = false;
    inst.loaded = false;
    stopAllWeaponActions(inst);
    if (inst.mixer && inst.modelScene) {
      try {
        inst.mixer.stopAllAction();
        inst.mixer.uncacheRoot(inst.modelScene);
      } catch {
        // ignora erro de cleanup
      }
    }
    inst.mixer = null;
    inst.actions = {};
    inst.restAttachInRigInv = null;
    inst.karClipMesh = null;
    inst.karCartridgeBone = null;
    if (inst.modelScene) {
      inst.socketGroup.remove(inst.modelScene);
      disposeObject3DResources(inst.modelScene, sharedProcTexSet);
      inst.modelScene = null;
    }
    inst.socketGroup.visible = false;
  };

  const ensureArmsLoaded = () => {
    if (disposed || armsLoaded || armsLoading) return;
    armsLoading = true;
    gltfLoader.load(
      resolveAssetUrl(KINEMATION_ARMS_BASE_URL),
      (gltf) => {
        armsLoading = false;
        if (disposed) {
          disposeObject3DResources(gltf.scene, sharedProcTexSet);
          return;
        }
        armsScene = gltf.scene;
        configureKinemationMaterials(armsScene, true);
        ikHandGunBone = armsScene.getObjectByName('ik_hand_gun') || null;
        armsRotateYGroup.add(armsScene);

        armsMixer = new THREE.AnimationMixer(armsScene);
        (gltf.animations || []).forEach((clip) => {
          const act = armsMixer!.clipAction(clip);
          armsActions[clip.name] = act;
        });

        armsLoaded = true;
        onSubtreeLoaded?.(armsScene);

        if (activeWeapon && KINEMATION_WEAPON_REGISTRY[activeWeapon]) {
          const inst = weaponInstances.get(activeWeapon);
          if (inst?.loaded) {
            calibrateActivePose(activeWeapon);
            inst.socketGroup.visible = true;
            rigRoot.visible = true;
            equipLiftTimer = EQUIP_LIFT_DUR;
          }
        }
      },
      undefined,
      () => {
        armsLoading = false;
      }
    );
  };

  const ensureWeaponLoaded = (weaponId: WeaponId) => {
    const inst = getOrCreateWeaponInstance(weaponId);
    if (!inst || disposed || inst.loaded || inst.loading) return;
    inst.loading = true;

    gltfLoader.load(
      resolveAssetUrl(inst.spec.modelUrl),
      (gltf) => {
        inst.loading = false;
        if (disposed) {
          disposeObject3DResources(gltf.scene, sharedProcTexSet);
          return;
        }

        const modelScene = gltf.scene;
        configureKinemationMaterials(modelScene, false);
        inst.modelScene = modelScene;
        inst.socketGroup.add(modelScene);

        if (inst.spec.clipPrefix === 'Kar98K') {
          modelScene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              const mat = Array.isArray(mesh.material)
                ? mesh.material[0]
                : mesh.material;
              if (mat?.name === 'M_Kar98K_Clip') {
                inst.karClipMesh = mesh;
                mesh.visible = false;
              }
            }
          });
          inst.karCartridgeBone = modelScene.getObjectByName('Cartridge') || null;
        }

        const mixer = new THREE.AnimationMixer(modelScene);
        inst.mixer = mixer;
        (gltf.animations || []).forEach((clip) => {
          const act = mixer.clipAction(clip);
          inst.actions[clip.name] = act;
        });

        inst.loaded = true;
        inst.lastUsedAt = ++lruClock;

        const skinId =
          pendingSkinMap[weaponId] || getEquippedWeaponSkinId(weaponId);
        applyWeaponSkinToObject3D(inst.socketGroup, weaponId, skinId);

        onSubtreeLoaded?.(modelScene);

        if (activeWeapon === weaponId) {
          inst.socketGroup.visible = true;
          if (armsLoaded) {
            calibrateActivePose(weaponId);
            rigRoot.visible = true;
            equipLiftTimer = EQUIP_LIFT_DUR;
          }
        }
        evictOverflowWeapons();
      },
      undefined,
      () => {
        inst.loading = false;
      }
    );
  };

  const playSynchronizedPair = (
    armsClipSuffix: string,
    weaponClipName: string,
    durationSec?: number,
    timeScaleOverride = 1.0,
    crossFadeSec = 0.08
  ): boolean => {
    if (!activeWeapon || !armsLoaded || !armsMixer) return false;
    const inst = weaponInstances.get(activeWeapon);
    if (!inst || !inst.loaded) return false;

    const fullArmsClip = `${inst.spec.clipPrefix}_${armsClipSuffix}`;
    const armsAct = armsActions[fullArmsClip];
    const wAct = inst.actions[weaponClipName];

    if (!armsAct && !wAct) return false;

    const refDur = Math.max(
      0.08,
      (armsAct?.getClip().duration || wAct?.getClip().duration || 0.5)
    );
    const scale =
      durationSec && durationSec > 0.08
        ? refDur / durationSec
        : timeScaleOverride;

    if (armsAct) {
      if (currentArmsOneShot && currentArmsOneShot !== armsAct) {
        currentArmsOneShot.stop();
        currentArmsOneShot.weight = 0;
      }
      if (currentArmsBaseAction && currentArmsBaseAction !== armsAct) {
        currentArmsBaseAction.weight = 0;
        currentArmsBaseAction.stop();
      }
      armsAct.setLoop(THREE.LoopOnce, 1);
      armsAct.clampWhenFinished = true;
      armsAct.timeScale = scale;
      armsAct.weight = 1;
      armsAct.reset();
      if (crossFadeSec > 0 && currentArmsBaseAction) {
        armsAct.fadeIn(crossFadeSec);
      }
      armsAct.play();
      currentArmsOneShot = armsAct;
    }

    if (wAct && inst.mixer) {
      Object.values(inst.actions).forEach((a) => {
        if (a !== wAct) {
          a.stop();
          a.weight = 0;
        }
      });
      const wClipDur = Math.max(0.08, wAct.getClip().duration || refDur);
      // Ajusta timeScale da arma exatamente pela própria duração para casar o último frame com o dos braços
      const wScale =
        durationSec && durationSec > 0.08
          ? wClipDur / durationSec
          : armsAct
            ? (wClipDur / refDur) * scale
            : scale;
      wAct.setLoop(THREE.LoopOnce, 1);
      wAct.clampWhenFinished = true;
      wAct.timeScale = wScale;
      wAct.weight = 1;
      wAct.reset();
      wAct.play();
      currentWeaponOneShot = wAct;
    }

    // Controla visibilidade de ossos auxiliares da Kar98K durante ciclo/reload
    if (inst.spec.clipPrefix === 'Kar98K') {
      const showClip = armsClipSuffix.startsWith('Reload');
      const showCartridge =
        armsClipSuffix === 'Fire' || armsClipSuffix.startsWith('Reload');
      if (inst.karClipMesh) {
        inst.karClipMesh.visible = showClip;
      }
      if (inst.karCartridgeBone) {
        inst.karCartridgeBone.scale.setScalar(showCartridge ? 1 : 0);
      }
    }

    return true;
  };

  const restorePoseLoop = (inst: LoadedWeaponInstance) => {
    if (!armsLoaded || !armsMixer) return;
    const poseName = `${inst.spec.clipPrefix}_Pose`;
    const poseAct = armsActions[poseName];
    if (poseAct && (!poseAct.isRunning() || currentArmsBaseAction !== poseAct)) {
      poseAct.setLoop(THREE.LoopRepeat, Infinity);
      poseAct.clampWhenFinished = false;
      poseAct.timeScale = 1.0;
      poseAct.weight = 1.0;
      poseAct.reset();
      poseAct.fadeIn(0.14);
      poseAct.play();
      currentArmsBaseAction = poseAct;
    }

    if (inst.mixer) {
      const restName =
        inst.spec.clipPrefix === 'Kar98K' && inst.actions['Fire']
          ? 'Fire'
          : 'Pose';
      const wPose = inst.actions[restName];
      if (wPose && !wPose.isRunning()) {
        Object.values(inst.actions).forEach((a) => {
          if (a !== wPose) {
            a.stop();
            a.weight = 0;
          }
        });
        wPose.setLoop(
          inst.spec.clipPrefix === 'Kar98K' ? THREE.LoopOnce : THREE.LoopRepeat,
          inst.spec.clipPrefix === 'Kar98K' ? 1 : Infinity
        );
        wPose.clampWhenFinished = inst.spec.clipPrefix === 'Kar98K';
        wPose.timeScale = 1.0;
        wPose.weight = 1.0;
        wPose.reset();
        if (inst.spec.clipPrefix === 'Kar98K') {
          inst.mixer.setTime(0);
        }
        wPose.play();
      }
    }

    if (inst.spec.clipPrefix === 'Kar98K') {
      if (inst.karClipMesh) inst.karClipMesh.visible = false;
      if (inst.karCartridgeBone) inst.karCartridgeBone.scale.setScalar(0);
    }
  };

  const setActiveWeapon = (weaponId: WeaponId) => {
    activeWeapon = weaponId;
    reloadLockActive = false;

    weaponInstances.forEach((inst, id) => {
      inst.socketGroup.visible = id === weaponId && inst.loaded;
      if (id !== weaponId) {
        stopAllWeaponActions(inst);
      }
    });

    const spec = KINEMATION_WEAPON_REGISTRY[weaponId];
    if (!spec) {
      rigRoot.visible = false;
      stopAllArmsActions();
      return;
    }

    ensureArmsLoaded();
    ensureWeaponLoaded(weaponId);

    const inst = weaponInstances.get(weaponId);
    if (inst) {
      inst.lastUsedAt = ++lruClock;
    }
    if (armsLoaded && inst?.loaded) {
      calibrateActivePose(weaponId);
      inst.socketGroup.visible = true;
      rigRoot.visible = true;
      equipLiftTimer = EQUIP_LIFT_DUR;
    } else {
      rigRoot.visible = false;
    }
  };

  const prewarmWeapons = (weaponIds: WeaponId[]) => {
    keptWeapons = new Set<WeaponId>(weaponIds);
    const usesAny = weaponIds.some((id) => Boolean(KINEMATION_WEAPON_REGISTRY[id]));
    if (usesAny) {
      ensureArmsLoaded();
    }
    weaponIds.forEach((id) => {
      if (KINEMATION_WEAPON_REGISTRY[id]) {
        const inst = getOrCreateWeaponInstance(id);
        if (inst) inst.lastUsedAt = ++lruClock;
        ensureWeaponLoaded(id);
      }
    });
  };

  const pruneUnusedWeapons = (keepIds: ReadonlySet<WeaponId>) => {
    keptWeapons = new Set<WeaponId>(keepIds);
    if (activeWeapon) keptWeapons.add(activeWeapon);
    weaponInstances.forEach((inst, id) => {
      if (inst.loaded && !keptWeapons.has(id)) {
        unloadWeaponInstance(inst);
      }
    });
  };

  const applySkin = (weaponId: WeaponId, skinId: string) => {
    pendingSkinMap[weaponId] = skinId;
    const inst = weaponInstances.get(weaponId);
    if (inst && inst.loaded) {
      applyWeaponSkinToObject3D(inst.socketGroup, weaponId, skinId);
    }
  };

  const isActiveWeaponReady = (): boolean => {
    if (!activeWeapon || !armsLoaded) return false;
    const inst = weaponInstances.get(activeWeapon);
    return Boolean(inst?.loaded);
  };

  const triggerFire = () => {
    if (!activeWeapon) return;
    const inst = weaponInstances.get(activeWeapon);
    if (!inst?.loaded) return;

    if (inst.spec.hasBoltActionFireClip) {
      // Kar98K: dispara + opera o ferrolho completo com ambas as mãos + ejeta cartucho
      playSynchronizedPair('Fire', 'Fire', 1.28, 1.0, 0.05);
      return;
    }

    // Armas com animação mecânica de tiro na própria arma (ex: slide blowback da DGL50)
    if (inst.actions['Fire'] && inst.mixer) {
      const fireAct = inst.actions['Fire'];
      Object.values(inst.actions).forEach((a) => {
        if (a !== fireAct) {
          a.stop();
          a.weight = 0;
        }
      });
      fireAct.setLoop(THREE.LoopOnce, 1);
      fireAct.clampWhenFinished = true;
      fireAct.timeScale = 1.15;
      fireAct.weight = 1.0;
      fireAct.reset();
      fireAct.play();
      currentWeaponOneShot = fireAct;
    }
  };

  const triggerReload = (durationSec: number, isEmpty: boolean) => {
    if (!activeWeapon) return;
    const inst = weaponInstances.get(activeWeapon);
    if (!inst?.loaded) return;
    reloadLockActive = true;
    const suffix = isEmpty ? 'Reload_Empty' : 'Reload_Tac';
    if (!playSynchronizedPair(suffix, suffix, durationSec, 1.0, 0.08)) {
      playSynchronizedPair('Reload_Empty', 'Reload_Empty', durationSec, 1.0, 0.08);
    }
  };

  const triggerShotgunReload = (totalDurationSec: number, isEmpty: boolean) => {
    if (!activeWeapon) return;
    const inst = weaponInstances.get(activeWeapon);
    if (!inst?.loaded) return;
    if (inst.spec.reloadUsesFullClipOnce && reloadLockActive) {
      return;
    }
    reloadLockActive = true;
    const dur = Math.max(0.85, totalDurationSec);
    const suffix = isEmpty ? 'Reload_Empty' : 'Reload_Tac';
    if (!playSynchronizedPair(suffix, suffix, dur, 1.0, 0.08)) {
      playSynchronizedPair('Reload_Empty', 'Reload_Empty', dur, 1.0, 0.08);
    }
  };

  const triggerBoltCycle = (durationSec = 0.72) => {
    if (!activeWeapon) return;
    const inst = weaponInstances.get(activeWeapon);
    if (!inst?.loaded) return;
    if (inst.spec.hasBoltActionFireClip) {
      playSynchronizedPair('Fire', 'Fire', durationSec, 1.0, 0.05);
    }
  };

  const triggerEquip = (durationSec = 0.24) => {
    equipLiftTimer = Math.max(0.12, Math.min(0.4, durationSec));
  };

  const triggerInspect = () => {
    if (!activeWeapon) return;
    const inst = weaponInstances.get(activeWeapon);
    if (!inst?.loaded) return;
    // Se for DGL50/Drake12/MX16A4/MPS5, uma leve visualização tática sem remover o carregador
    equipLiftTimer = 0.3;
  };

  const update = (
    dt: number,
    reloadPhase: ReloadPhase,
    weaponMotionAnchor: THREE.Object3D
  ) => {
    if (disposed || !activeWeapon) {
      rigRoot.visible = false;
      return;
    }
    const inst = weaponInstances.get(activeWeapon);
    if (!armsLoaded || !armsMixer || !inst?.loaded) {
      rigRoot.visible = false;
      return;
    }

    rigRoot.visible = true;
    inst.socketGroup.visible = true;

    if (reloadPhase === 'IDLE') {
      reloadLockActive = false;
    }

    const armsOneShotRunning = Boolean(
      currentArmsOneShot && currentArmsOneShot.isRunning()
    );
    const weaponOneShotRunning = Boolean(
      currentWeaponOneShot && currentWeaponOneShot.isRunning()
    );

    if (!armsOneShotRunning) {
      currentArmsOneShot = null;
      if (reloadPhase === 'IDLE' || !reloadLockActive) {
        if (!weaponOneShotRunning) {
          currentWeaponOneShot = null;
        }
        restorePoseLoop(inst);
      }
    }

    armsMixer.update(dt);
    inst.mixer?.update(dt);

    // Restaura posição base + elevação suave de equipamento quando ativa
    if (equipLiftTimer > 0) {
      equipLiftTimer = Math.max(0, equipLiftTimer - dt);
      const t = equipLiftTimer / EQUIP_LIFT_DUR;
      const ease = t * t;
      armsCenterGroup.position.set(
        inst.poseArmsCenterOffset.x,
        inst.poseArmsCenterOffset.y - ease * 0.085,
        inst.poseArmsCenterOffset.z + ease * 0.05
      );
    } else {
      armsCenterGroup.position.copy(inst.poseArmsCenterOffset);
    }

    syncWeaponMountToIkBone();

    // Sincroniza weaponMotionAnchor (mira 3D, PEQ-15, muzzleFlash, ejetor) com o delta exato da arma!
    if (inst.restAttachInRigInv) {
      computeMatrixInAncestorSpace(inst.socketGroup, rigRoot, _attachWorldMat);
      _deltaMat.multiplyMatrices(_attachWorldMat, inst.restAttachInRigInv);
      _deltaMat.decompose(_tmpPos, _tmpQuat, _tmpScale);
      weaponMotionAnchor.position.copy(_tmpPos);
      weaponMotionAnchor.quaternion.copy(_tmpQuat);
    } else {
      weaponMotionAnchor.position.set(0, 0, 0);
      weaponMotionAnchor.quaternion.identity();
    }
  };

  const dispose = () => {
    disposed = true;
    weaponInstances.forEach((inst) => unloadWeaponInstance(inst));
    weaponInstances.clear();
    stopAllArmsActions();
    if (armsMixer && armsScene) {
      try {
        armsMixer.stopAllAction();
        armsMixer.uncacheRoot(armsScene);
      } catch {
        // ignora erro de cleanup
      }
    }
    armsMixer = null;
    if (armsScene) {
      disposeObject3DResources(armsScene, sharedProcTexSet);
      armsScene = null;
    }
    ikHandGunBone = null;
    armsLoaded = false;
  };

  return {
    rigRoot,
    setActiveWeapon,
    prewarmWeapons,
    pruneUnusedWeapons,
    applySkin,
    isActiveWeaponReady,
    triggerFire,
    triggerReload,
    triggerShotgunReload,
    triggerBoltCycle,
    triggerEquip,
    triggerInspect,
    update,
    dispose,
  };
}
