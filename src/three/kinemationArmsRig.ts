import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OpticType, ReloadPhase, WeaponId } from '../types/game';
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
  /** Substrings de nós/meshes para ocultar (ex.: braços antigos embutidos no GLB). */
  hiddenNodeSubstrings?: string[];
  /** Substrings de materiais para ocultar (ex.: MI_Manny_01/02 na SCAR-L). */
  hiddenMatSubstrings?: string[];
  /** Nomes exatos de nós de mira embutida que devem sumir ao equipar mira externa 3D. */
  builtInOpticNodeNames?: string[];
  /** Substrings de materiais de mira embutida que devem sumir ao equipar mira externa 3D. */
  builtInOpticMatSubstrings?: string[];
  /** Clip específico de pose estática da arma quando diferente de 'Pose'. */
  weaponPoseClipName?: string;
  /** Tempo em segundos para avaliar o clip estático da arma. */
  weaponPoseTime?: number;
  /** Congela a pose interna da arma para permanecer acoplada às mãos Kinemation durante animações. */
  weaponFreezeIdlePose?: boolean;
  /** Alinhamento local direto em modelScene no espaço Kinemation (+X dir, +Y cima, +Z cano). */
  modelAlign?: {
    scale: number;
    pos: [number, number, number];
    rot?: [number, number, number];
  };
  /** Acopla a arma diretamente ao osso `hand_r` (ex.: Faca Tática usando Grenade_Pose). */
  attachToHandR?: boolean;
  /** Arma branca com golpe diagonal rápido em triggerFire(). */
  isMeleeKnife?: boolean;
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
    railMountPos: [0, 0.0198, -0.01],
    railMountScale: 0.68,
  },
  M1911_PISTOL: {
    weaponId: 'M1911_PISTOL',
    modelUrl: '/models/kinemation/weapons/m1911.glb',
    clipPrefix: 'M1911',
    muzzlePos: [0, -0.004, -0.132],
    ejectionPos: [0.016, 0.01, -0.02],
    laserPos: [0, -0.014, -0.1],
    railMountPos: [0, 0.0126, 0.0],
    railMountScale: 0.65,
  },
  SMG_45: {
    weaponId: 'SMG_45',
    modelUrl: '/models/weapons/v18_engineer_smg.glb',
    clipPrefix: 'MPS5',
    modelAlign: {
      scale: 0.92,
      pos: [0, -0.065, 0.25],
      rot: [0, Math.PI, 0],
    },
    builtInOpticMatSubstrings: ['v18_scope', 'scope_reticle_emi'],
    weaponFreezeIdlePose: true,
    muzzlePos: [0, 0.015, -0.581],
    ejectionPos: [0.022, 0.022, -0.06],
    laserPos: [0.024, 0.012, -0.22],
    railMountPos: [0, 0.0702, -0.04],
    railMountScale: 0.78,
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
  CARBINE_AR: {
    weaponId: 'CARBINE_AR',
    modelUrl: '/models/fps_animated_carbine.glb',
    clipPrefix: 'MX16A4',
    modelAlign: { scale: 0.46, pos: [0.0095, -0.135, -0.055] },
    weaponPoseClipName: 'allanims',
    weaponPoseTime: 0.1,
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['armmesh'],
    hiddenMatSubstrings: ['arms'],
    builtInOpticNodeNames: ['scope_carbine_0', 'lens_lens_0'],
    muzzlePos: [0, 0.011, -0.568],
    ejectionPos: [0.024, 0.008, -0.04],
    laserPos: [0.028, 0.008, -0.28],
    railMountPos: [0, 0.0472, -0.01],
    railMountScale: 0.88,
  },
  S_MILITARY: {
    weaponId: 'S_MILITARY',
    modelUrl: '/models/weapons/s_military_ar.glb',
    clipPrefix: 'MX16A4',
    scale: 0.01,
    attachOffset: [0.105, 0.455, -1.468],
    weaponPoseClipName: 'Idle',
    weaponPoseTime: 0.05,
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['manny'],
    hiddenMatSubstrings: ['mi_manny_01', 'mi_manny_02'],
    builtInOpticNodeNames: ['Holoshort001', 'Scr010', 'Scr003'],
    muzzlePos: [0, 0.001, -0.613],
    ejectionPos: [0.024, -0.004, -0.05],
    laserPos: [-0.036, -0.005, -0.32],
    railMountPos: [0, 0.0352, -0.04],
    railMountScale: 0.9,
  },
  AK47_RIFLE: {
    weaponId: 'AK47_RIFLE',
    modelUrl: '/models/fps_ak47.glb',
    clipPrefix: 'AKX',
    modelAlign: { scale: 1.03, pos: [0.123, -1.521, -0.35] },
    weaponPoseClipName: 'RIG_UE5_Comando_AK_Idle',
    weaponPoseTime: 0.05,
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['comando'],
    hiddenMatSubstrings: ['m_gloves', 'm_shirt'],
    muzzlePos: [0, -0.009, -0.516],
    ejectionPos: [0.024, 0.01, -0.04],
    laserPos: [0.026, 0.008, -0.24],
    railMountPos: [0, 0.0282, 0.015],
    railMountScale: 0.86,
  },
  AK12_RIFLE: {
    weaponId: 'AK12_RIFLE',
    modelUrl: '/models/kinemation/weapons/ak200.glb',
    clipPrefix: 'AKX',
    muzzlePos: [0, 0.0, -0.534],
    ejectionPos: [0.024, 0.01, -0.04],
    laserPos: [0.026, 0.01, -0.24],
    railMountPos: [0, 0.047, -0.02],
    railMountScale: 0.86,
  },
  SHOTGUN_12: {
    weaponId: 'SHOTGUN_12',
    modelUrl: '/models/kinemation/weapons/drake12.glb',
    clipPrefix: 'Drake12',
    muzzlePos: [0, 0.01, -0.716],
    ejectionPos: [0.018, 0.016, 0.01],
    laserPos: [0.02, -0.012, -0.4],
    railMountPos: [0, 0.0193, 0.0],
    railMountScale: 0.82,
    reloadUsesFullClipOnce: true,
  },
  SHOTGUN_SPAS: {
    weaponId: 'SHOTGUN_SPAS',
    modelUrl: '/models/weapons/automatic_shotgun.glb',
    clipPrefix: 'Drake12',
    modelAlign: { scale: 0.0115, pos: [0.106, -1.764, -0.376] },
    weaponPoseClipName: 'Idle',
    weaponPoseTime: 0.05,
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['hands_04'],
    hiddenMatSubstrings: ['hands_04'],
    builtInOpticNodeNames: [
      'Automatic_Shotgun_Sight_01',
      'Automatic_Shotgun_Sight_02',
      'Automatic_Shotgun_Sight_03',
      'Automatic_Shotgun_Sight_Glasses',
    ],
    muzzlePos: [0, -0.002, -0.512],
    ejectionPos: [0.022, 0.015, -0.02],
    laserPos: [0.026, -0.01, -0.3],
    railMountPos: [0, 0.072, -0.04],
    railMountScale: 0.84,
    reloadUsesFullClipOnce: true,
  },
  L49_LMG: {
    weaponId: 'L49_LMG',
    modelUrl: '/models/lmg_animated.glb',
    clipPrefix: 'MX16A4',
    modelAlign: { scale: 0.86, pos: [0.002, -0.075, -0.026] },
    weaponPoseClipName: 'allanims',
    weaponPoseTime: 0.1,
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['armmesh'],
    hiddenMatSubstrings: ['arms'],
    muzzlePos: [0, 0.021, -0.737],
    ejectionPos: [0.028, 0.012, -0.06],
    laserPos: [0.032, 0.006, -0.32],
    railMountPos: [0, 0.058, -0.045],
    railMountScale: 0.88,
  },
  SNIPER_BOLT: {
    weaponId: 'SNIPER_BOLT',
    modelUrl: '/models/kinemation/weapons/kar98k.glb',
    clipPrefix: 'Kar98K',
    muzzlePos: [0, -0.002, -0.713],
    ejectionPos: [0.022, 0.01, -0.04],
    laserPos: [0.022, -0.006, -0.36],
    railMountPos: [0, 0.0142, -0.02],
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
    railMountPos: [0, 0.021, -0.04],
    railMountScale: 0.88,
  },
  SNIPER_AWP: {
    weaponId: 'SNIPER_AWP',
    modelUrl: '/models/sniper_animated.glb',
    clipPrefix: 'Kar98K',
    modelAlign: { scale: 0.008, pos: [0.0, -0.077, 0.094] },
    weaponPoseClipName: 'allanims',
    weaponPoseTime: 0.1,
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['arms_arms'],
    hiddenMatSubstrings: ['arms'],
    muzzlePos: [0, 0.01, -0.882],
    ejectionPos: [0.024, 0.014, -0.04],
    laserPos: [0.028, -0.006, -0.42],
    railMountPos: [0, 0.06, -0.04],
    railMountScale: 0.9,
    hasBoltActionFireClip: true,
  },
  SNIPER_HEAVY: {
    weaponId: 'SNIPER_HEAVY',
    modelUrl: '/models/sniper_fps_animation.glb',
    clipPrefix: 'MK14',
    modelAlign: {
      scale: 1.15,
      pos: [0.0, -0.025, -0.08],
      rot: [0, Math.PI, 0],
    },
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['ch22_body'],
    hiddenMatSubstrings: ['textura'],
    builtInOpticNodeNames: ['Object_66'],
    muzzlePos: [0, 0.034, -0.788],
    ejectionPos: [0.026, 0.024, -0.04],
    laserPos: [0.026, 0.02, -0.38],
    railMountPos: [0, 0.052, -0.05],
    railMountScale: 0.9,
  },
  RPG7_LAUNCHER: {
    weaponId: 'RPG7_LAUNCHER',
    modelUrl: '/models/kinemation/weapons/rpg7.glb',
    clipPrefix: 'RPG7',
    muzzlePos: [0, -0.015, -0.856],
    ejectionPos: [0, 0.01, 0.788],
    laserPos: [0.03, 0.04, -0.25],
    railMountPos: [0, 0.095, -0.01],
    railMountScale: 0.8,
  },
  KNIFE_TACTICAL: {
    weaponId: 'KNIFE_TACTICAL',
    modelUrl: '/models/knife_animated.glb',
    clipPrefix: 'Grenade',
    attachToHandR: true,
    isMeleeKnife: true,
    modelAlign: {
      scale: 0.0096,
      pos: [-0.1033, -0.0194, 0.0508],
      rot: [-0.4492, 1.105, -2.6114],
    },
    weaponFreezeIdlePose: true,
    hiddenNodeSubstrings: ['armmesh'],
    hiddenMatSubstrings: ['arms'],
    muzzlePos: [0, 0.14, -0.17],
    ejectionPos: [0, 0, -0.1],
    laserPos: [0, 0, -0.15],
    railMountPos: [0, 0, 0],
    railMountScale: 1.0,
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
    railMountPos: [0, 0.0126, 0.0],
    railMountScale: 0.65,
  },
  RPG7: {
    modelUrl: '/models/kinemation/weapons/rpg7.glb',
    clipPrefix: 'RPG7',
    muzzlePos: [0, -0.015, -0.856],
    ejectionPos: [0, 0.01, 0.788],
    laserPos: [0.03, 0.04, -0.25],
    railMountPos: [0, 0.095, -0.01],
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
const _restIkQuat = new THREE.Quaternion();
// Rotação ideal de ik_hand_gun em rigRoot (-PI/2 em X, PI em Z) para que socketGroup (+PI/2 em X) aponte o cano 100% reto em -Z e o trilho em +Y
const _idealIkRestQuat = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.PI / 2, 0, Math.PI, 'XYZ')
);
const _knifePoseQuat = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(0.6, 0.38, 0.04, 'XYZ')
);
const _slashQuat = new THREE.Quaternion();
const _slashEuler = new THREE.Euler();
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
  poseArmsCenterQuat: THREE.Quaternion;
  karClipMesh: THREE.Object3D | null;
  karCartridgeBone: THREE.Object3D | null;
  magNode: THREE.Object3D | null;
  magRestPos: THREE.Vector3;
  magPullAxisLocal: THREE.Vector3;
  builtInOpticNodes: THREE.Object3D[];
  loaded: boolean;
  loading: boolean;
  lastUsedAt: number;
}

export interface KinemationArmsRigController {
  rigRoot: THREE.Group;
  setActiveWeapon: (weaponId: WeaponId) => void;
  setOpticType: (optic: OpticType) => void;
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

/**
 * Calibra materiais PBR dos braços Kinemation (`arms_base.glb`) e das armas
 * (tanto 1P quanto 3P / miniaturas / inspeção 3D), eliminando reflexo branco
 * metálico nos braços e dando acabamento tático real a armas sem textura embutida.
 */
export function calibrateKinemationMaterialScene(
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
        std.vertexColors = false;

        if (std.map) {
          std.map.colorSpace = THREE.SRGBColorSpace;
          std.map.needsUpdate = true;
        }
        if (std.emissiveMap) {
          std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
          std.emissiveMap.needsUpdate = true;
        }

        const mName = (std.name || '').toLowerCase();

        if (isArms) {
          // UE4 arm textures pack non-glTF metalness/roughness channels that turn skin/gloves chrome white under PMREM.
          std.metalnessMap = null;
          std.metalness = 0.04;
          std.roughness = mName.includes('arm')
            ? 0.72
            : mName.includes('glove')
              ? 0.68
              : 0.84;
          std.envMapIntensity = 0.35;
          if (std.color && std.map) {
            std.color.setHex(0xffffff);
          }
          std.needsUpdate = true;
          return;
        }

        // Armas com sub-malhas espelhadas no DCC (ex.: alça/tambor traseiro da MX16A4)
        // precisam de DoubleSide para nunca exibir buracos ou meios-anéis flutuantes no ADS.
        std.side = THREE.DoubleSide;

        // SCAR-L built-in holographic reticle & transparent lens
        if (mName.includes('m_holoshort_opacity')) {
          std.transparent = true;
          std.opacity = 0.92;
          std.depthWrite = false;
          std.blending = THREE.AdditiveBlending;
          if (std.color) std.color.setHex(0xff3b30);
          if (std.emissive) {
            std.emissive.setHex(0xff2a20);
            std.emissiveIntensity = 2.0;
          }
          mesh.renderOrder = 10;
          std.needsUpdate = true;
          return;
        }
        if (
          mName === 'm_transparent' ||
          mName === 'lens' ||
          mName === 'glasses'
        ) {
          std.transparent = true;
          std.opacity = 0.24;
          std.depthWrite = false;
          std.roughness = 0.08;
          std.metalness = 0.1;
          mesh.renderOrder = 8;
          std.needsUpdate = true;
          return;
        }
        if (mName.includes('scopereticle')) {
          std.transparent = true;
          std.opacity = 0.9;
          std.depthWrite = false;
          if (std.emissive) {
            std.emissive.setHex(0xef4444);
            std.emissiveIntensity = 1.4;
          }
          mesh.renderOrder = 10;
          std.needsUpdate = true;
          return;
        }

        const isTranslucentMag =
          mName.includes('translucent') ||
          mName.includes('translusent') ||
          (std.transparent && std.opacity < 0.85 && !std.map);

        if (isTranslucentMag) {
          if (std.color) std.color.setHex(0x242933);
          std.transparent = true;
          std.opacity = 0.38;
          std.depthWrite = false;
          std.roughness = 0.14;
          std.metalness = 0.05;
          std.envMapIntensity = 0.65;
          mesh.renderOrder = 8;
          std.needsUpdate = true;
          return;
        }

        if (std.map) {
          if (std.color) std.color.setHex(0xffffff);
          std.envMapIntensity = 0.75;
          std.needsUpdate = true;
          return;
        }

        // Untextured Kinemation firearms (M1911, MPS5, MX16A4, AK-200, MK14) — tactile dark gunmetal/polymer PBR
        let hex = 0x22262e;
        let met = 0.78;
        let rgh = 0.34;

        if (mName.includes('polymer_grip') || mName.includes('polymer_furniture')) {
          hex = 0x14171c;
          met = 0.06;
          rgh = 0.78;
        } else if (
          mName.includes('polymer_mag') ||
          mName === 'mag' ||
          mName.startsWith('mag_')
        ) {
          hex = 0x2c302b;
          met = 0.12;
          rgh = 0.68;
        } else if (mName.includes('polymer')) {
          hex = 0x181b21;
          met = 0.08;
          rgh = 0.72;
        } else if (mName.includes('finish_bright') || mName.includes('chromed')) {
          hex = 0x6b7480;
          met = 0.88;
          rgh = 0.24;
        } else if (
          mName.includes('finish_secondary') ||
          mName.includes('finish_chassis') ||
          mName.includes('finish_alu')
        ) {
          hex = 0x272c35;
          met = 0.76;
          rgh = 0.34;
        } else if (mName.includes('finish_dark')) {
          hex = 0x16191e;
          met = 0.78;
          rgh = 0.34;
        } else if (
          mName.includes('finish2') ||
          mName.includes('m_finish_milled') ||
          mName.includes('fbx default material')
        ) {
          hex = 0x2a303a;
          met = 0.8;
          rgh = 0.32;
        } else if (
          mName.includes('finish') ||
          mName.includes('m_finish') ||
          mName.includes('bolt')
        ) {
          hex = 0x1d2128;
          met = 0.82;
          rgh = 0.3;
        } else if (mName.includes('wood')) {
          hex = 0x4b2814;
          met = 0.04;
          rgh = 0.62;
        } else if (mName.includes('jacket') || mName.includes('bullet')) {
          hex = 0xb8632e;
          met = 0.88;
          rgh = 0.26;
        } else if (mName.includes('casing') || mName.includes('brass')) {
          hex = 0xc89b3c;
          met = 0.92;
          rgh = 0.22;
        } else if (mName.includes('primer')) {
          hex = 0x767d86;
          met = 0.86;
          rgh = 0.26;
        } else if (mName.includes('spring')) {
          hex = 0x464c56;
          met = 0.85;
          rgh = 0.3;
        } else if (mName.includes('follower_indicator')) {
          hex = 0xc2410c;
          met = 0.1;
          rgh = 0.5;
        }

        if (std.color) std.color.setHex(hex);
        std.metalness = met;
        std.roughness = rgh;
        std.envMapIntensity = 0.72;
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
  let currentOpticType: OpticType = 'iron';
  let keptWeapons = new Set<WeaponId>();
  const pendingSkinMap: Partial<Record<WeaponId, string>> = {};

  // Estado dos braços base
  let armsLoaded = false;
  let armsLoading = false;
  let armsScene: THREE.Group | null = null;
  let armsMixer: THREE.AnimationMixer | null = null;
  let ikHandGunBone: THREE.Object3D | null = null;
  let handRBone: THREE.Object3D | null = null;
  const armsActions: Record<string, THREE.AnimationAction> = {};
  let currentArmsBaseAction: THREE.AnimationAction | null = null;
  let currentArmsOneShot: THREE.AnimationAction | null = null;
  let currentWeaponOneShot: THREE.AnimationAction | null = null;
  let equipLiftTimer = 0;
  const EQUIP_LIFT_DUR = 0.24;
  let meleeSlashTimer = 0;
  const MELEE_SLASH_DUR = 0.42;
  let reloadLockActive = false;

  const weaponInstances = new Map<WeaponId, LoadedWeaponInstance>();

  const applyBuiltInOpticVisibility = (inst: LoadedWeaponInstance) => {
    if (inst.builtInOpticNodes.length === 0) return;
    const showBuiltIn =
      currentOpticType === 'iron' ||
      (inst.spec.weaponId === 'SNIPER_HEAVY' && currentOpticType === 'lpvo');
    for (let i = 0; i < inst.builtInOpticNodes.length; i++) {
      inst.builtInOpticNodes[i].visible = showBuiltIn;
    }
  };

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
      poseArmsCenterQuat: new THREE.Quaternion(),
      karClipMesh: null,
      karCartridgeBone: null,
      magNode: null,
      magRestPos: new THREE.Vector3(),
      magPullAxisLocal: new THREE.Vector3(0, -0.15, 0),
      builtInOpticNodes: [],
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

  const syncWeaponMountToIkBone = (useHandR = false) => {
    const anchorBone = useHandR && handRBone ? handRBone : ikHandGunBone;
    if (!anchorBone || !armsLoaded) return;
    computeMatrixInAncestorSpace(anchorBone, rigRoot, _relMat);
    _relMat.decompose(_tmpPos, _tmpQuat, _tmpScale);
    weaponMount.position.copy(_tmpPos);
    weaponMount.quaternion.copy(_tmpQuat);
    weaponMount.scale.set(1, 1, 1);
  };

  /**
   * Calibra `armsCenterGroup.position`, `armsCenterGroup.quaternion` e `restAttachInRigInv`
   * no frame zero da pose da arma para alinhar exatamente o receptor em `(0,0,0)` do gunGroup
   * e o cano/trilho 100% reto em `-Z`/`+Y` (compatível com todas as miras 3D, silenciadores, chaveiros e ADS).
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
    armsCenterGroup.quaternion.identity();

    if (poseAct) {
      poseAct.setLoop(THREE.LoopRepeat, Infinity);
      poseAct.clampWhenFinished = false;
      poseAct.weight = 1;
      poseAct.reset();
      poseAct.play();
      armsMixer.setTime(0);
      armsMixer.update(0.0001);
      currentArmsBaseAction = poseAct;
    }

    // Coloca a arma na pose de repouso (para Kar98K usamos Fire t=0 se existir; para SCAR usamos Idle congelado)
    stopAllWeaponActions(inst);
    if (inst.mixer) {
      const restClip = inst.spec.weaponPoseClipName
        ? inst.actions[inst.spec.weaponPoseClipName] || inst.actions['Pose']
        : inst.spec.clipPrefix === 'Kar98K'
          ? inst.actions['Fire'] || inst.actions['Pose']
          : inst.actions['Pose'];
      if (restClip) {
        restClip.setLoop(
          inst.spec.weaponFreezeIdlePose ? THREE.LoopOnce : THREE.LoopRepeat,
          inst.spec.weaponFreezeIdlePose ? 1 : Infinity
        );
        restClip.clampWhenFinished = Boolean(inst.spec.weaponFreezeIdlePose);
        restClip.weight = 1;
        restClip.reset();
        restClip.play();
        inst.mixer.setTime(inst.spec.weaponPoseTime ?? 0);
      }
    }

    // Avalia o osso âncora (`hand_r` para faca / `ik_hand_gun` para armas de fogo) relativo a rigRoot
    const anchorBone =
      inst.spec.attachToHandR && handRBone ? handRBone : ikHandGunBone;
    computeMatrixInAncestorSpace(anchorBone, rigRoot, _relMat);
    _relMat.decompose(_restIkPos, _restIkQuat, _tmpScale);

    // Compensa qualquer inclinação residual do osso ik_hand_gun na pose (ex.: AKX, M1911, MK14, RPG7)
    // para que o trilho superior e o cano fiquem 100% retos com as miras 3D, bocais e chaveiros.
    if (!inst.spec.attachToHandR) {
      inst.poseArmsCenterQuat
        .copy(_idealIkRestQuat)
        .multiply(_restIkQuat.invert());
    } else if (inst.spec.isMeleeKnife) {
      inst.poseArmsCenterQuat.copy(_knifePoseQuat);
    } else {
      inst.poseArmsCenterQuat.identity();
    }
    armsCenterGroup.quaternion.copy(inst.poseArmsCenterQuat);

    computeMatrixInAncestorSpace(anchorBone, rigRoot, _relMat);
    _restIkPos.setFromMatrixPosition(_relMat);

    // Centraliza o receptor/mão da pose inicial em (0, 0, 0) de rigRoot
    inst.poseArmsCenterOffset.copy(_restIkPos).negate();
    if (inst.spec.isMeleeKnife) {
      inst.poseArmsCenterOffset.x += 0.11;
      inst.poseArmsCenterOffset.y -= 0.11;
      inst.poseArmsCenterOffset.z -= 0.05;
    }
    armsCenterGroup.position.copy(inst.poseArmsCenterOffset);

    syncWeaponMountToIkBone(Boolean(inst.spec.attachToHandR));

    computeMatrixInAncestorSpace(inst.socketGroup, rigRoot, _attachWorldMat);
    inst.restAttachInRigInv = _attachWorldMat.clone().invert();

    // Restaura posição original do carregador e calcula o vetor local de extração (-0.15m em Y de rigRoot)
    if (inst.magNode && inst.magNode.parent) {
      inst.magNode.position.copy(inst.magRestPos);
      computeMatrixInAncestorSpace(inst.magNode.parent, rigRoot, _relMat);
      const parentRotInv = _tmpQuat.setFromRotationMatrix(_relMat).invert();
      const parentScale = _tmpScale.setFromMatrixScale(_relMat);
      inst.magPullAxisLocal
        .set(-0.015, -0.155, -0.02)
        .applyQuaternion(parentRotInv)
        .divide(
          new THREE.Vector3(
            Math.max(1e-4, Math.abs(parentScale.x)),
            Math.max(1e-4, Math.abs(parentScale.y)),
            Math.max(1e-4, Math.abs(parentScale.z))
          )
        );
    }

    // Oculta o pente stripper flutuante da Kar98K fora do reload
    if (inst.karClipMesh) {
      inst.karClipMesh.visible = false;
    }
    if (inst.karCartridgeBone) {
      inst.karCartridgeBone.scale.setScalar(0);
    }
    applyBuiltInOpticVisibility(inst);
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
    inst.magNode = null;
    inst.builtInOpticNodes = [];
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
        calibrateKinemationMaterialScene(armsScene, true);
        ikHandGunBone = armsScene.getObjectByName('ik_hand_gun') || null;
        handRBone = armsScene.getObjectByName('hand_r') || null;
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

        // 1. Limpeza geométrica específica para SNIPER_HEAVY e KNIFE_TACTICAL antes do alinhamento
        if (weaponId === 'SNIPER_HEAVY') {
          // Object_64 (corpo/cano) e Object_66 (luneta original) estão modelados em metros exatos
          // alinhados ao eixo -Z na geometria local, mas deformados pelo esqueleto ch22_body antigo.
          const unskinnedClones: THREE.Mesh[] = [];
          modelScene.traverse((child) => {
            if (
              (child as THREE.Mesh).isMesh &&
              (child.name === 'Object_64' || child.name === 'Object_66')
            ) {
              const srcMesh = child as THREE.Mesh;
              const cleanMesh = new THREE.Mesh(
                srcMesh.geometry,
                srcMesh.material
              );
              cleanMesh.name = srcMesh.name;
              unskinnedClones.push(cleanMesh);
              srcMesh.visible = false;
              srcMesh.name = `${srcMesh.name}_hidden_skinned`;
            }
          });
          unskinnedClones.forEach((m) => modelScene.add(m));
        } else if (weaponId === 'KNIFE_TACTICAL') {
          // Zera a cadeia de IK residual dos braços antigos (knife / R_wrist_Goal) para alinhar o cabo direto na mão direita
          modelScene.traverse((child) => {
            if (child.name === 'knife' || child.name === 'R_wrist_Goal') {
              child.position.set(0, 0, 0);
              child.rotation.set(0, 0, 0);
              child.scale.set(1, 1, 1);
            }
          });
        }

        calibrateKinemationMaterialScene(modelScene, false);
        if (inst.spec.modelAlign) {
          const align = inst.spec.modelAlign;
          modelScene.scale.setScalar(align.scale);
          modelScene.position.set(align.pos[0], align.pos[1], align.pos[2]);
          if (align.rot) {
            modelScene.rotation.set(align.rot[0], align.rot[1], align.rot[2]);
          }
        }
        inst.modelScene = modelScene;
        inst.socketGroup.add(modelScene);

        const hiddenNodes = inst.spec.hiddenNodeSubstrings || [];
        const hiddenMats = inst.spec.hiddenMatSubstrings || [];
        const builtInOpticSet = new Set(inst.spec.builtInOpticNodeNames || []);
        const builtInOpticMatSubs = (
          inst.spec.builtInOpticMatSubstrings || []
        ).map((s) => s.toLowerCase());
        inst.builtInOpticNodes = [];

        if (
          hiddenNodes.length > 0 ||
          hiddenMats.length > 0 ||
          builtInOpticSet.size > 0 ||
          builtInOpticMatSubs.length > 0
        ) {
          modelScene.traverse((child) => {
            const cNameLow = (child.name || '').toLowerCase();
            if (builtInOpticSet.has(child.name)) {
              inst.builtInOpticNodes.push(child);
            }
            if (hiddenNodes.some((sub) => cNameLow.includes(sub))) {
              child.visible = false;
              return;
            }
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              const mats = Array.isArray(mesh.material)
                ? mesh.material
                : mesh.material
                  ? [mesh.material]
                  : [];
              if (hiddenMats.length > 0) {
                const hasHiddenMat = mats.some((m) => {
                  const mLow = (m?.name || '').toLowerCase();
                  return hiddenMats.some((sub) => mLow.includes(sub));
                });
                if (hasHiddenMat) {
                  mesh.visible = false;
                  return;
                }
              }
              if (builtInOpticMatSubs.length > 0) {
                const hasOpticMat = mats.some((m) => {
                  const mLow = (m?.name || '').toLowerCase();
                  return builtInOpticMatSubs.some((sub) => mLow.includes(sub));
                });
                if (hasOpticMat && !inst.builtInOpticNodes.includes(mesh)) {
                  inst.builtInOpticNodes.push(mesh);
                }
              }
            }
          });
        }

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

        // 2. M4_CARBINE (mx16a4.glb): separa os triângulos da alça de mira traseira A2 removível
        // (Y_gun > 0.0168 e Z_gun > -0.05) em sub-malhas dedicadas dentro de inst.builtInOpticNodes.
        // Quando optic === 'iron', a alça traseira A2 aparece sólida (DoubleSide); quando o jogador equipa
        // Red Dot / Holo / LPVO, a alça traseira A2 some automaticamente liberando o trilho Picatinny!
        if (weaponId === 'M4_CARBINE') {
          const poseAct = inst.actions['Pose'];
          if (poseAct) {
            poseAct.reset().play();
            mixer.setTime(0);
          }
          modelScene.updateMatrixWorld(true);
          const m16Meshes: THREE.Mesh[] = [];
          modelScene.traverse((c) => {
            if ((c as THREE.Mesh).isMesh) m16Meshes.push(c as THREE.Mesh);
          });
          const vTmp = new THREE.Vector3();
          const toModelSceneMat = new THREE.Matrix4();
          for (const mesh of m16Meshes) {
            const geom = mesh.geometry;
            const posAttr = geom.attributes.position;
            if (!posAttr) continue;
            computeMatrixInAncestorSpace(mesh, modelScene, toModelSceneMat);
            const idx = geom.index;
            const triCount = idx ? idx.count / 3 : posAttr.count / 3;
            const baseIndices: number[] = [];
            const sightIndices: number[] = [];
            for (let t = 0; t < triCount; t++) {
              const i0 = idx ? idx.getX(t * 3) : t * 3;
              const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
              const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
              let cy = 0;
              let cz = 0;
              const triVerts = [i0, i1, i2];
              for (let k = 0; k < 3; k++) {
                const ii = triVerts[k];
                vTmp.fromBufferAttribute(posAttr, ii);
                if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
                  (mesh as THREE.SkinnedMesh).applyBoneTransform(ii, vTmp);
                }
                vTmp.applyMatrix4(toModelSceneMat);
                // Em modelScene da mx16a4: Y_gun = +vTmp.y, Z_gun = -vTmp.z
                cy += vTmp.y / 3;
                cz += -vTmp.z / 3;
              }
              if (cy > 0.0165 && cz > -0.052 && cz < 0.145) {
                sightIndices.push(i0, i1, i2);
              } else {
                baseIndices.push(i0, i1, i2);
              }
            }
            if (sightIndices.length === 0) continue;
            if (baseIndices.length === 0) {
              inst.builtInOpticNodes.push(mesh);
              continue;
            }
            const baseGeom = geom.clone();
            baseGeom.setIndex(baseIndices);
            mesh.geometry = baseGeom;

            const sightGeom = geom.clone();
            sightGeom.setIndex(sightIndices);
            let sightMesh: THREE.Mesh;
            if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
              const sk = mesh as THREE.SkinnedMesh;
              const skSight = new THREE.SkinnedMesh(sightGeom, sk.material);
              skSight.bind(sk.skeleton, sk.bindMatrix);
              sightMesh = skSight;
            } else {
              sightMesh = new THREE.Mesh(sightGeom, mesh.material);
            }
            sightMesh.name = `${mesh.name}_A2RearSight`;
            sightMesh.frustumCulled = false;
            sightMesh.castShadow = false;
            sightMesh.receiveShadow = true;
            mesh.parent?.add(sightMesh);
            inst.builtInOpticNodes.push(sightMesh);
          }
        }

        // 3. SMG_45 (v18_engineer_smg.glb): separa o carregador (Z_local > 0.02) do silenciador
        // na malha mesh_3 (v18_mag_silence) para animar o carregador na mão esquerda durante o reload.
        if (weaponId === 'SMG_45') {
          let magSilenceMesh: THREE.Mesh | null = null;
          modelScene.traverse((c) => {
            if ((c as THREE.Mesh).isMesh && c.name === 'mesh_3') {
              magSilenceMesh = c as THREE.Mesh;
            }
          });
          if (magSilenceMesh) {
            const mMesh = magSilenceMesh as THREE.Mesh;
            const geom = mMesh.geometry;
            const posAttr = geom.attributes.position;
            const idx = geom.index;
            if (posAttr) {
              const triCount = idx ? idx.count / 3 : posAttr.count / 3;
              const silencerIdx: number[] = [];
              const magIdx: number[] = [];
              const vTmp = new THREE.Vector3();
              for (let t = 0; t < triCount; t++) {
                const i0 = idx ? idx.getX(t * 3) : t * 3;
                const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
                const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
                let cz = 0;
                for (const ii of [i0, i1, i2]) {
                  vTmp.fromBufferAttribute(posAttr, ii);
                  cz += vTmp.z / 3;
                }
                if (cz > 0.02) {
                  magIdx.push(i0, i1, i2);
                } else {
                  silencerIdx.push(i0, i1, i2);
                }
              }
              if (magIdx.length > 0 && silencerIdx.length > 0) {
                const silGeom = geom.clone();
                silGeom.setIndex(silencerIdx);
                mMesh.geometry = silGeom;

                const magGeom = geom.clone();
                magGeom.setIndex(magIdx);
                const magMesh = new THREE.Mesh(magGeom, mMesh.material);
                magMesh.name = 'SMG45_MagazineMesh';
                magMesh.position.copy(mMesh.position);
                magMesh.quaternion.copy(mMesh.quaternion);
                magMesh.scale.copy(mMesh.scale);
                magMesh.frustumCulled = false;
                mMesh.parent?.add(magMesh);
                inst.magNode = magMesh;
                inst.magRestPos.copy(magMesh.position);
              }
            }
          }
        }

        // 4. Localiza o nó do carregador para armas com weaponFreezeIdlePose para animar extração/inserção no reload
        if (!inst.magNode && inst.spec.weaponFreezeIdlePose) {
          const candidateNames = [
            'clip',
            'clip_carbine_0',
            'Magazine',
            'Magazine001',
            'Magazine_04',
            'mag',
            'mag_LMG_0',
            'mag_sniper_0',
          ];
          for (const cName of candidateNames) {
            const found = modelScene.getObjectByName(cName);
            if (found) {
              inst.magNode = found;
              inst.magRestPos.copy(found.position);
              break;
            }
          }
        }

        inst.loaded = true;
        inst.lastUsedAt = ++lruClock;

        const skinId =
          pendingSkinMap[weaponId] || getEquippedWeaponSkinId(weaponId);
        applyWeaponSkinToObject3D(inst.socketGroup, weaponId, skinId);
        applyBuiltInOpticVisibility(inst);

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

    if (wAct && inst.mixer && !inst.spec.weaponFreezeIdlePose) {
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

    if (inst.mixer && !inst.spec.weaponFreezeIdlePose) {
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
    if (inst.magNode) {
      inst.magNode.position.copy(inst.magRestPos);
    }
  };

  const setOpticType = (optic: OpticType) => {
    currentOpticType = optic;
    weaponInstances.forEach((inst) => {
      if (inst.loaded) {
        applyBuiltInOpticVisibility(inst);
      }
    });
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

    if (inst.spec.isMeleeKnife) {
      meleeSlashTimer = MELEE_SLASH_DUR;
      playSynchronizedPair('Throw_End', '', MELEE_SLASH_DUR, 1.0, 0.04);
      return;
    }

    if (inst.spec.hasBoltActionFireClip) {
      // Kar98K: dispara + opera o ferrolho completo com ambas as mãos + ejeta cartucho
      playSynchronizedPair('Fire', 'Fire', 1.28, 1.0, 0.05);
      return;
    }

    // Armas com animação mecânica de tiro na própria arma (ex: slide blowback da DGL50/M1911)
    if (!inst.spec.weaponFreezeIdlePose && inst.actions['Fire'] && inst.mixer) {
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
    if (!inst.spec.weaponFreezeIdlePose) {
      inst.mixer?.update(dt);
    }

    // Animação procedural Zero-GC de extração/inserção do carregador sincronizada com a mão esquerda
    // para armas com weaponFreezeIdlePose (SMG_45, CARBINE_AR, S_MILITARY, AK47_RIFLE, L49_LMG, SNIPER_AWP).
    if (inst.magNode) {
      if (reloadLockActive && currentArmsOneShot) {
        const clipDur = Math.max(0.1, currentArmsOneShot.getClip().duration);
        const p = THREE.MathUtils.clamp(currentArmsOneShot.time / clipDur, 0, 1);
        // Janela em que a mão esquerda agarra o carregador (p=0.14), leva ao cinto (p=0.40) e reinsere no poço (p=0.68)
        let pull = 0;
        if (p > 0.14 && p < 0.68) {
          pull = Math.sin(((p - 0.14) / 0.54) * Math.PI);
          pull = Math.pow(Math.max(0, pull), 0.78);
        }
        inst.magNode.position
          .copy(inst.magRestPos)
          .addScaledVector(inst.magPullAxisLocal, pull);
      } else {
        inst.magNode.position.copy(inst.magRestPos);
      }
    }

    // Restaura posição/rotação base + elevação suave de equipamento + golpe diagonal da faca
    if (meleeSlashTimer > 0 && inst.spec.isMeleeKnife) {
      meleeSlashTimer = Math.max(0, meleeSlashTimer - dt);
      const p = 1 - meleeSlashTimer / MELEE_SLASH_DUR;
      const thrust = Math.sin(p * Math.PI);
      const slashSweep = Math.sin(Math.min(1, p * 1.45) * Math.PI);
      armsCenterGroup.position.set(
        inst.poseArmsCenterOffset.x - slashSweep * 0.14,
        inst.poseArmsCenterOffset.y + Math.sin(p * Math.PI * 2) * 0.035,
        inst.poseArmsCenterOffset.z - thrust * 0.12
      );
      _slashEuler.set(-thrust * 0.18, slashSweep * 0.28, slashSweep * 0.42);
      _slashQuat.setFromEuler(_slashEuler);
      armsCenterGroup.quaternion
        .copy(inst.poseArmsCenterQuat)
        .multiply(_slashQuat);
    } else if (equipLiftTimer > 0) {
      equipLiftTimer = Math.max(0, equipLiftTimer - dt);
      const t = equipLiftTimer / EQUIP_LIFT_DUR;
      const ease = t * t;
      armsCenterGroup.position.set(
        inst.poseArmsCenterOffset.x,
        inst.poseArmsCenterOffset.y - ease * 0.085,
        inst.poseArmsCenterOffset.z + ease * 0.05
      );
      armsCenterGroup.quaternion.copy(inst.poseArmsCenterQuat);
    } else {
      armsCenterGroup.position.copy(inst.poseArmsCenterOffset);
      armsCenterGroup.quaternion.copy(inst.poseArmsCenterQuat);
    }

    syncWeaponMountToIkBone(Boolean(inst.spec.attachToHandR));

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
    handRBone = null;
    armsLoaded = false;
  };

  return {
    rigRoot,
    setActiveWeapon,
    setOpticType,
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

/**
 * Prepara qualquer modelo GLB de arma para o estúdio 3D do Arsenal (`WeaponInspectionModal`)
 * usando o mesmo sistema de coordenadas canônico de `weaponMotionAnchor` (cano em `-Z`, trilho superior em `+Y`,
 * parede esquerda em `-X`), garantindo alinhamento 1:1 de todas as miras 3D, bocais e chaveiros com física.
 */
export function prepareStandaloneWeaponSceneForInspection(
  weaponId: WeaponId,
  modelScene: THREE.Group,
  animations: THREE.AnimationClip[]
): {
  gunAnchorGroup: THREE.Group;
  builtInOpticNodes: THREE.Object3D[];
} {
  const spec = KINEMATION_WEAPON_REGISTRY[weaponId];

  if (weaponId === 'SNIPER_HEAVY') {
    const unskinnedClones: THREE.Mesh[] = [];
    modelScene.traverse((child) => {
      if (
        (child as THREE.Mesh).isMesh &&
        (child.name === 'Object_64' || child.name === 'Object_66')
      ) {
        const srcMesh = child as THREE.Mesh;
        const cleanMesh = new THREE.Mesh(srcMesh.geometry, srcMesh.material);
        cleanMesh.name = srcMesh.name;
        unskinnedClones.push(cleanMesh);
        srcMesh.visible = false;
        srcMesh.name = `${srcMesh.name}_hidden_skinned`;
      }
    });
    unskinnedClones.forEach((m) => modelScene.add(m));
  } else if (weaponId === 'KNIFE_TACTICAL') {
    modelScene.traverse((child) => {
      if (child.name === 'knife' || child.name === 'R_wrist_Goal') {
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        child.scale.set(1, 1, 1);
      }
    });
  }

  calibrateKinemationMaterialScene(modelScene, false);

  const gunAnchorGroup = new THREE.Group();
  const weaponMount = new THREE.Group();
  const socketGroup = new THREE.Group();

  if (spec && !spec.attachToHandR) {
    weaponMount.quaternion.copy(_idealIkRestQuat);
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
    socketGroup.scale.setScalar(spec.scale ?? 1.0);
    if (spec.modelAlign) {
      const align = spec.modelAlign;
      modelScene.scale.setScalar(align.scale);
      modelScene.position.set(align.pos[0], align.pos[1], align.pos[2]);
      if (align.rot) {
        modelScene.rotation.set(align.rot[0], align.rot[1], align.rot[2]);
      }
    }
  } else if (weaponId === 'KNIFE_TACTICAL') {
    modelScene.scale.setScalar(0.01);
    modelScene.rotation.set(0, Math.PI / 2, 0);
  }

  socketGroup.add(modelScene);
  weaponMount.add(socketGroup);
  gunAnchorGroup.add(weaponMount);

  const hiddenNodes = spec?.hiddenNodeSubstrings || [];
  const hiddenMats = spec?.hiddenMatSubstrings || [];
  const builtInOpticSet = new Set(spec?.builtInOpticNodeNames || []);
  const builtInOpticMatSubs = (spec?.builtInOpticMatSubstrings || []).map((s) =>
    s.toLowerCase()
  );
  const builtInOpticNodes: THREE.Object3D[] = [];

  modelScene.traverse((child) => {
    child.frustumCulled = false;
    const cNameLow = (child.name || '').toLowerCase();
    if (builtInOpticSet.has(child.name)) {
      builtInOpticNodes.push(child);
    }
    if (hiddenNodes.some((sub) => cNameLow.includes(sub))) {
      child.visible = false;
      return;
    }
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      if (hiddenMats.length > 0) {
        const hasHiddenMat = mats.some((m) => {
          const mLow = (m?.name || '').toLowerCase();
          return hiddenMats.some((sub) => mLow.includes(sub));
        });
        if (hasHiddenMat) {
          mesh.visible = false;
          return;
        }
      }
      if (
        spec?.clipPrefix === 'Kar98K' &&
        mats.some((m) => m?.name === 'M_Kar98K_Clip')
      ) {
        mesh.visible = false;
        return;
      }
      if (builtInOpticMatSubs.length > 0) {
        const hasOpticMat = mats.some((m) => {
          const mLow = (m?.name || '').toLowerCase();
          return builtInOpticMatSubs.some((sub) => mLow.includes(sub));
        });
        if (hasOpticMat && !builtInOpticNodes.includes(mesh)) {
          builtInOpticNodes.push(mesh);
        }
      }
    }
  });

  if (spec?.clipPrefix === 'Kar98K') {
    const cartBone = modelScene.getObjectByName('Cartridge');
    if (cartBone) cartBone.scale.setScalar(0);
  }

  if (animations && animations.length > 0 && weaponId !== 'KNIFE_TACTICAL') {
    const mixer = new THREE.AnimationMixer(modelScene);
    const clipName = spec?.weaponPoseClipName
      ? spec.weaponPoseClipName
      : spec?.clipPrefix === 'Kar98K'
        ? 'Fire'
        : 'Pose';
    const targetClip =
      animations.find((c) => c.name === clipName) ||
      animations.find((c) => c.name === 'Pose') ||
      animations[0];
    if (targetClip) {
      const act = mixer.clipAction(targetClip);
      act.weight = 1;
      act.reset().play();
      mixer.setTime(spec?.weaponPoseTime ?? 0);
    }
  }

  // Separa os triângulos da alça de mira traseira A2 removível na M4_CARBINE (mx16a4.glb)
  if (weaponId === 'M4_CARBINE') {
    modelScene.updateMatrixWorld(true);
    const m16Meshes: THREE.Mesh[] = [];
    modelScene.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) m16Meshes.push(c as THREE.Mesh);
    });
    const vTmp = new THREE.Vector3();
    const toModelSceneMat = new THREE.Matrix4();
    for (const mesh of m16Meshes) {
      const geom = mesh.geometry;
      const posAttr = geom.attributes.position;
      if (!posAttr) continue;
      computeMatrixInAncestorSpace(mesh, modelScene, toModelSceneMat);
      const idx = geom.index;
      const triCount = idx ? idx.count / 3 : posAttr.count / 3;
      const baseIndices: number[] = [];
      const sightIndices: number[] = [];
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        let cy = 0;
        let cz = 0;
        const triVerts = [i0, i1, i2];
        for (let k = 0; k < 3; k++) {
          const ii = triVerts[k];
          vTmp.fromBufferAttribute(posAttr, ii);
          if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
            (mesh as THREE.SkinnedMesh).applyBoneTransform(ii, vTmp);
          }
          vTmp.applyMatrix4(toModelSceneMat);
          // Em modelScene da mx16a4: Y_gun = +vTmp.y, Z_gun = -vTmp.z
          cy += vTmp.y / 3;
          cz += -vTmp.z / 3;
        }
        if (cy > 0.0165 && cz > -0.052 && cz < 0.145) {
          sightIndices.push(i0, i1, i2);
        } else {
          baseIndices.push(i0, i1, i2);
        }
      }
      if (sightIndices.length === 0) continue;
      if (baseIndices.length === 0) {
        builtInOpticNodes.push(mesh);
        continue;
      }
      const baseGeom = geom.clone();
      baseGeom.setIndex(baseIndices);
      mesh.geometry = baseGeom;

      const sightGeom = geom.clone();
      sightGeom.setIndex(sightIndices);
      let sightMesh: THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const sk = mesh as THREE.SkinnedMesh;
        const skSight = new THREE.SkinnedMesh(sightGeom, sk.material);
        skSight.bind(sk.skeleton, sk.bindMatrix);
        sightMesh = skSight;
      } else {
        sightMesh = new THREE.Mesh(sightGeom, mesh.material);
      }
      sightMesh.name = `${mesh.name}_A2RearSight`;
      sightMesh.frustumCulled = false;
      sightMesh.castShadow = false;
      sightMesh.receiveShadow = true;
      mesh.parent?.add(sightMesh);
      builtInOpticNodes.push(sightMesh);
    }
  }

  return { gunAnchorGroup, builtInOpticNodes };
}

