import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { soundEngine } from '../audio/soundEngine';
import { createGameGltfLoader } from '../three/gltfLoaderFactory';
import {
  getRankForXp,
  getRequiredXpForOptic,
  getRequiredXpForWeapon,
  isOpticUnlockedAtXp,
  isWeaponUnlockedAtXp,
  loadSavedPlayerCash,
} from '../progression/ranks';
import {
  SCOPE_PACK_CATALOG,
  equipWeaponOptic,
  equipWeaponSkin,
  getCompatibleOpticsForWeapon,
  getEquippedWeaponGunsmith,
  getEquippedWeaponOptic,
  getEquippedWeaponSkinId,
  isWeaponSkinOwned,
  purchaseWeaponSkinWithCash,
  setWeaponGunsmithAttachment,
  subscribePlayerInventory,
} from '../progression/loadoutSystem';
import {
  computeEffectiveMagCapacity,
  computeGunsmithModifiersForLoadout,
  getGunsmithAttachmentSpec,
  GUNSMITH_ATTACHMENTS_BY_SLOT,
  GUNSMITH_SLOT_META,
  WeaponGunsmithLoadout,
  weaponSupportsGunsmith,
} from '../progression/gunsmithSystem';
import {
  getAvailableSkinsForWeapon,
  getSkinDefinition,
  WeaponSkinDefinition,
} from '../progression/weaponSkins';
import { applyWeaponSkinToObject3D } from '../three/weaponSkinMaterial';
import {
  AK47_RIFLE_GITHUB_RAW_URL,
  AK47_RIFLE_LOCAL_URL,
  CARBINE_AR_GITHUB_RAW_URL,
  CARBINE_AR_LOCAL_URL,
  L49_LMG_GITHUB_RAW_URL,
  L49_LMG_LOCAL_URL,
  SMG_45_GITHUB_RAW_URL,
  SMG_45_LOCAL_URL,
  SHOTGUN_SPAS_GITHUB_RAW_URL,
  SHOTGUN_SPAS_LOCAL_URL,
  S_MILITARY_GITHUB_RAW_URL,
  S_MILITARY_LOCAL_URL,
  KNIFE_GITHUB_RAW_URL,
  KNIFE_LOCAL_URL,
  WEAPON_RAIL_MOUNTS,
} from '../three/weaponBuilder';
import {
  calibrateKinemationMaterialScene,
  prepareStandaloneWeaponSceneForInspection,
} from '../three/kinemationArmsRig';
import {
  CharmType,
  MuzzleType,
  WeaponAttachmentSystem,
} from '../three/attachmentSystem';
import { createBotThirdPersonWeaponMesh } from '../three/botWeaponProps';
import {
  preloadAllScopeThumbnails3D,
  useScopeThumbnail3D,
} from '../three/weaponThumbnail3D';
import {
  createSecondaryWebGLRenderer,
  disposeSecondaryWebGLRenderer,
} from '../three/webglContextGuard';
import { OpticType, WeaponId } from '../types/game';
import { WarfaceRankIcon } from './WarfaceRankIcon';

const InspectionScopeOpticCard: React.FC<{
  opticId: OpticType;
  shortLabel: string;
  magnification: string;
  title: string;
  active: boolean;
  unlocked: boolean;
  requiredLevel: number;
  onClick: () => void;
}> = ({
  opticId,
  shortLabel,
  magnification,
  title,
  active,
  unlocked,
  requiredLevel,
  onClick,
}) => {
  const thumbUrl = useScopeThumbnail3D(opticId);
  return (
    <button
      type="button"
      disabled={!unlocked}
      title={title}
      onClick={onClick}
      className={`rounded-lg border px-1 py-1 text-center transition-all flex flex-col items-center justify-between gap-0.5 ${
        active
          ? 'bg-cyan-500/20 border-cyan-400 cursor-pointer shadow-[0_0_10px_rgba(34,211,238,0.28)]'
          : unlocked
            ? 'bg-black/50 border-white/12 hover:border-cyan-400/45 cursor-pointer'
            : 'bg-black/60 border-white/5 opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="w-full h-7 flex items-center justify-center overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={shortLabel}
            draggable={false}
            className={`w-full h-7 object-contain select-none ${
              unlocked
                ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]'
                : 'grayscale opacity-45'
            }`}
          />
        ) : (
          <div className="w-4 h-3 rounded-sm border border-white/15 bg-white/5" />
        )}
      </div>
      <span
        className={`text-[8px] font-mono font-bold truncate w-full ${
          active ? 'text-cyan-300' : 'text-white'
        }`}
      >
        {shortLabel}
      </span>
      <span className="text-[7px] font-mono leading-tight">
        {unlocked ? (
          <span className={active ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
            {active ? 'EQUIP. ✓' : magnification}
          </span>
        ) : (
          <span className="text-amber-300 font-bold">🔒NV.{requiredLevel}</span>
        )}
      </span>
    </button>
  );
};

interface WeaponInspectionModalProps {
  activeWeapon: WeaponId;
  playerXp: number;
  onSelectWeapon: (weaponId: WeaponId) => void;
  onClose: () => void;
  onStartTraining: () => void;
}

type WeaponCategory =
  | 'ALL'
  | 'ASSALTO'
  | 'ESCOPETA'
  | 'SMG'
  | 'SNIPER'
  | 'LMG'
  | 'PESADA'
  | 'PISTOLA';

interface WeaponSpec {
  id: WeaponId;
  name: string;
  caliber: string;
  categoryTag: string;
  category: WeaponCategory;
  description: string;
  firepower: number; // 0..100
  accuracy: number; // 0..100
  mobility: number; // 0..100
  range: string;
  fireRate: string;
  magSize: number;
  reserve: number;
  localUrl: string;
  githubUrl: string;
  readyClipName?: string;
  readyPoseTime: number;
  targetSpan: number;
}

const WEAPON_SPECS: Record<WeaponId, WeaponSpec> = {
  M4_CARBINE: {
    id: 'M4_CARBINE',
    name: 'MX16A4 / M4 TÁTICA',
    caliber: '5.56x45mm NATO',
    categoryTag: 'Fuzil de Assalto',
    category: 'ASSALTO',
    description:
      'Plataforma modular AR-15/MX16A4 com trilho Picatinny completo, recuo linear e ergonomia de combate tático.',
    firepower: 85,
    accuracy: 84,
    mobility: 78,
    range: '75m',
    fireRate: '800 RPM',
    magSize: 30,
    reserve: 120,
    localUrl: '/models/kinemation/weapons/mx16a4.glb',
    githubUrl: '/models/kinemation/weapons/mx16a4.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.78,
  },
  AK47_RIFLE: {
    id: 'AK47_RIFLE',
    name: 'AK-47 COMANDO',
    caliber: '7.62x39mm Soviet',
    categoryTag: 'Fuzil de Assalto',
    category: 'ASSALTO',
    description:
      'Poder de fogo bruto em calibre 7.62mm. Causa dano devastador por impacto com alta penetração.',
    firepower: 96,
    accuracy: 72,
    mobility: 70,
    range: '90m',
    fireRate: '600 RPM',
    magSize: 30,
    reserve: 120,
    localUrl: AK47_RIFLE_LOCAL_URL,
    githubUrl: AK47_RIFLE_GITHUB_RAW_URL,
    readyClipName: 'RIG_UE5_Comando_AK_Idle',
    readyPoseTime: 0,
    targetSpan: 0.8,
  },
  AK12_RIFLE: {
    id: 'AK12_RIFLE',
    name: 'AK-200 TÁTICA',
    caliber: '5.45x39mm Russian',
    categoryTag: 'Fuzil de Assalto',
    category: 'ASSALTO',
    description:
      'Fuzil de assalto moderno AK-200 com trilhos Picatinny integrados, mira de ferro ajustável e controle preciso em rajada.',
    firepower: 93,
    accuracy: 86,
    mobility: 76,
    range: '85m',
    fireRate: '700 RPM',
    magSize: 30,
    reserve: 120,
    localUrl: '/models/kinemation/weapons/ak200.glb',
    githubUrl: '/models/kinemation/weapons/ak200.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.8,
  },
  CARBINE_AR: {
    id: 'CARBINE_AR',
    name: 'CARABINA TÁTICA',
    caliber: '5.56x45mm NATO',
    categoryTag: 'Fuzil de Assalto',
    category: 'ASSALTO',
    description:
      'Variante de cano longo focada em engajamentos de média distância com alta precisão balística.',
    firepower: 88,
    accuracy: 89,
    mobility: 75,
    range: '85m',
    fireRate: '750 RPM',
    magSize: 30,
    reserve: 120,
    localUrl: CARBINE_AR_LOCAL_URL,
    githubUrl: CARBINE_AR_GITHUB_RAW_URL,
    readyClipName: 'allanims',
    readyPoseTime: 0,
    targetSpan: 0.78,
  },
  S_MILITARY: {
    id: 'S_MILITARY',
    name: 'SCAR-L S-MILITARY',
    caliber: '5.56x45mm NATO',
    categoryTag: 'Fuzil de Assalto',
    category: 'ASSALTO',
    description:
      'Rifle modular S-Military em calibre 5.56mm NATO com trilho Picatinny integral, coronha ajustável e visor holográfico tático.',
    firepower: 87,
    accuracy: 87,
    mobility: 79,
    range: '80m',
    fireRate: '750 RPM',
    magSize: 30,
    reserve: 120,
    localUrl: S_MILITARY_LOCAL_URL,
    githubUrl: S_MILITARY_GITHUB_RAW_URL,
    readyClipName: 'Idle',
    readyPoseTime: 0,
    targetSpan: 0.78,
  },
  SMG_45: {
    id: 'SMG_45',
    name: 'V18 SPECTRE SILENCIADA',
    caliber: '9x19mm Subsonic',
    categoryTag: 'SMG Engenheiro Silenciada',
    category: 'SMG',
    description:
      'Submetralhadora tática V18 de Engenheiro com supressor acústico integral, mira holográfica embutida e altíssima cadência em CQB.',
    firepower: 84,
    accuracy: 86,
    mobility: 93,
    range: '42m',
    fireRate: '900 RPM',
    magSize: 32,
    reserve: 128,
    localUrl: '/models/weapons/v18_engineer_smg.glb',
    githubUrl: '/models/weapons/v18_engineer_smg.glb',
    readyPoseTime: 0,
    targetSpan: 0.76,
  },
  SMG_MP5: {
    id: 'SMG_MP5',
    name: 'MPS5 TÁTICA 9MM',
    caliber: '9x19mm Parabellum',
    categoryTag: 'Submetralhadora',
    category: 'SMG',
    description:
      'Submetralhadora clássica de forças especiais com mira dióptrica real, carregador curvo 9mm e recuo ultra controlado.',
    firepower: 72,
    accuracy: 85,
    mobility: 94,
    range: '40m',
    fireRate: '830 RPM',
    magSize: 30,
    reserve: 120,
    localUrl: '/models/kinemation/weapons/mps5.glb',
    githubUrl: '/models/kinemation/weapons/mps5.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.7,
  },
  SHOTGUN_12: {
    id: 'SHOTGUN_12',
    name: 'DRAKE-12 BREACHER',
    caliber: 'Calibre 12 Buckshot',
    categoryTag: 'Escopeta Pump 12GA',
    category: 'ESCOPETA',
    description:
      'Escopeta tática Pump-Action Drake-12 com 8 bagos 00-Buckshot de alto impacto para domínio em curta distância.',
    firepower: 100,
    accuracy: 62,
    mobility: 82,
    range: '14m',
    fireRate: 'Pump 88 RPM',
    magSize: 6,
    reserve: 24,
    localUrl: '/models/kinemation/weapons/drake12.glb',
    githubUrl: '/models/kinemation/weapons/drake12.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.8,
  },
  SHOTGUN_SPAS: {
    id: 'SHOTGUN_SPAS',
    name: 'SPAS-12 / AUTO-12 TÁTICA',
    caliber: 'Calibre 12 Magnum',
    categoryTag: 'Escopeta Automática',
    category: 'ESCOPETA',
    description:
      'Escopeta tática automática com tambor de alta capacidade, mira holográfica integrada e cadência devastadora em CQB.',
    firepower: 96,
    accuracy: 68,
    mobility: 78,
    range: '16m',
    fireRate: 'Auto 210 RPM',
    magSize: 8,
    reserve: 32,
    localUrl: SHOTGUN_SPAS_LOCAL_URL,
    githubUrl: SHOTGUN_SPAS_GITHUB_RAW_URL,
    readyClipName: 'Idle',
    readyPoseTime: 0.05,
    targetSpan: 0.8,
  },
  SNIPER_TACTICAL: {
    id: 'SNIPER_TACTICAL',
    name: 'MK14 EBR TÁTICA',
    caliber: '7.62x51mm (.308 Win)',
    categoryTag: 'Fuzil DMR / Sniper',
    category: 'SNIPER',
    description:
      'Fuzil de precisão semiautomático MK14 EBR em chassi tático. Compatível com mira de ferro real ou luneta LPVO 3D.',
    firepower: 98,
    accuracy: 96,
    mobility: 58,
    range: '130m',
    fireRate: 'Semi-Auto',
    magSize: 10,
    reserve: 40,
    localUrl: '/models/kinemation/weapons/mk14.glb',
    githubUrl: '/models/kinemation/weapons/mk14.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.82,
  },
  SNIPER_BOLT: {
    id: 'SNIPER_BOLT',
    name: 'KAR98K PRECISÃO',
    caliber: '7.92x57mm Mauser',
    categoryTag: 'Fuzil de Ferrolho',
    category: 'SNIPER',
    description:
      'Fuzil clássico de ferrolho manual Kar98K com poder letal a longa distância e suporte a mira de ferro ou LPVO.',
    firepower: 100,
    accuracy: 99,
    mobility: 50,
    range: '150m+',
    fireRate: 'Ferrolho',
    magSize: 5,
    reserve: 25,
    localUrl: '/models/kinemation/weapons/kar98k.glb',
    githubUrl: '/models/kinemation/weapons/kar98k.glb',
    readyClipName: 'Fire',
    readyPoseTime: 0,
    targetSpan: 0.86,
  },
  SNIPER_AWP: {
    id: 'SNIPER_AWP',
    name: 'AWP-M .338 LUNETA',
    caliber: '.338 Lapua Magnum',
    categoryTag: 'Fuzil Sniper Ferrolho',
    category: 'SNIPER',
    description:
      'Fuzil de precisão AWP-M .338 com luneta óptica de alta ampliação embutida para eliminação em disparo único.',
    firepower: 100,
    accuracy: 100,
    mobility: 52,
    range: '180m+',
    fireRate: 'Ferrolho',
    magSize: 5,
    reserve: 20,
    localUrl: '/models/sniper_animated.glb',
    githubUrl: '/models/sniper_animated.glb',
    readyClipName: 'allanims',
    readyPoseTime: 0.1,
    targetSpan: 0.9,
  },
  SNIPER_HEAVY: {
    id: 'SNIPER_HEAVY',
    name: 'M200 INTERVENTION',
    caliber: '.408 CheyTac',
    categoryTag: 'Fuzil Sniper Pesado',
    category: 'SNIPER',
    description:
      'Sniper anti-material de longuíssimo alcance com luneta balística integrada e perfuração extrema de blindagem.',
    firepower: 100,
    accuracy: 100,
    mobility: 46,
    range: '200m+',
    fireRate: 'Ferrolho',
    magSize: 5,
    reserve: 20,
    localUrl: '/models/sniper_fps_animation.glb',
    githubUrl: '/models/sniper_fps_animation.glb',
    readyClipName: 'Scene',
    readyPoseTime: 0.1,
    targetSpan: 0.9,
  },
  L49_LMG: {
    id: 'L49_LMG',
    name: 'LMG PESADA 100R',
    caliber: '5.56x45mm NATO',
    categoryTag: 'Metralhadora Leve',
    category: 'LMG',
    description:
      'Pente tambor de 100 munições para supressão contínua de fogo em ondas inimigas.',
    firepower: 82,
    accuracy: 70,
    mobility: 55,
    range: '95m',
    fireRate: '850 RPM',
    magSize: 100,
    reserve: 300,
    localUrl: L49_LMG_LOCAL_URL,
    githubUrl: L49_LMG_GITHUB_RAW_URL,
    readyClipName: 'allanims',
    readyPoseTime: 0,
    targetSpan: 0.8,
  },
  RPG7_LAUNCHER: {
    id: 'RPG7_LAUNCHER',
    name: 'RPG-7V LANÇA-FOGUETES',
    caliber: '85mm PG-7V HEAT',
    categoryTag: 'Lançador Anticarro',
    category: 'PESADA',
    description:
      'Lança-foguetes portátil de ogiva explosiva de alto impacto. Destrói cobertura e neutraliza múltiplos inimigos em área.',
    firepower: 100,
    accuracy: 74,
    mobility: 48,
    range: '150m',
    fireRate: 'Monotiro',
    magSize: 1,
    reserve: 4,
    localUrl: '/models/kinemation/weapons/rpg7.glb',
    githubUrl: '/models/kinemation/weapons/rpg7.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.88,
  },
  P50_PISTOL: {
    id: 'P50_PISTOL',
    name: 'DESERT EAGLE .50AE',
    caliber: '.50 Action Express',
    categoryTag: 'Pistola Pesada',
    category: 'PISTOLA',
    description:
      'Pistola semiautomática de grosso calibre com acabamento metálico e altíssimo poder de parada.',
    firepower: 82,
    accuracy: 88,
    mobility: 94,
    range: '45m',
    fireRate: 'Semi-Auto',
    magSize: 7,
    reserve: 35,
    localUrl: '/models/kinemation/weapons/dgl50.glb',
    githubUrl: '/models/kinemation/weapons/dgl50.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.5,
  },
  M1911_PISTOL: {
    id: 'M1911_PISTOL',
    name: 'COLT M1911A1 .45',
    caliber: '.45 ACP Tactical',
    categoryTag: 'Pistola Tática',
    category: 'PISTOLA',
    description:
      'Pistola militar clássica .45 ACP com saque ultrarrápido, recuo controlável e excelente precisão de ferro.',
    firepower: 68,
    accuracy: 90,
    mobility: 96,
    range: '42m',
    fireRate: 'Semi-Auto',
    magSize: 8,
    reserve: 32,
    localUrl: '/models/kinemation/weapons/m1911.glb',
    githubUrl: '/models/kinemation/weapons/m1911.glb',
    readyClipName: 'Pose',
    readyPoseTime: 0,
    targetSpan: 0.48,
  },
  KNIFE_TACTICAL: {
    id: 'KNIFE_TACTICAL',
    name: 'FACA TÁTICA COMBATE',
    caliber: 'Aço Carbono Militar 8Cr13MoV',
    categoryTag: 'Lâmina Corpo a Corpo',
    category: 'PISTOLA',
    description:
      'Lâmina tática militar com empunhadura ergonômica e quebra-vidro no pomo. Ataque corpo a corpo silencioso com letalidade extrema a curta distância.',
    firepower: 100,
    accuracy: 100,
    mobility: 100,
    range: '2.4m',
    fireRate: 'Manual',
    magSize: 1,
    reserve: 0,
    localUrl: KNIFE_LOCAL_URL,
    githubUrl: KNIFE_GITHUB_RAW_URL,
    readyClipName: 'anims',
    readyPoseTime: 0,
    targetSpan: 0.42,
  },
};

// Exact material and mesh/node names corresponding to hands, arms, gloves, shirts, and spare reload mags across all 8 GLBs
const HIDDEN_ARM_MATERIAL_NAMES = new Set([
  'arms',
  'arms_0',
  'mat',
  'hand_d',
  'glove_d',
  'm_gloves_black',
  'm_shirt_blackcamo2',
  'textura',
  'v_hands_gloves_sf2.tga',
  'v_hands_sleeves_sf2.tga',
  'v_hands_watch_sf2_d.tga.001',
  'dmc5_soldier_gear_mat',
  'dmc5_soldier_hands_mat',
  'dmc5_soldier_shirt_mat',
  'hands_04',
  'mi_manny_01',
  'mi_manny_02',
]);

const HIDDEN_ARM_NODE_NAMES = new Set([
  'object_8',
  'object_25',
  'object_26',
  'object_51',
  'object_80',
  'object_84',
  'object_102',
  'object_122',
  'object_124',
  'object_126',
  'object_128',
  'mag2_j_051',
  'mag2',
  'mag2_m4_d_0',
  'mag.001',
  'mag.001_0',
  'bullets',
  'bullets_0',
  'requests_studio_hands',
  'requests_studio_hands_0',
  'requests_studio_hands_1',
  'watch',
  'watch_0',
  'ch22_body',
  'ch22_body_textura_0',
  'armmesh_arms_0',
  'armmesh_mat_0',
  'arms_arms_0',
  'hand_mesh_hand_d_0',
  'hand_mesh_glove_d_0',
  'skm_comando_m_gloves_black_0',
  'skm_comando_m_shirt_blackcamo2_0',
  'hands_04_mesh',
]);

function isArmOrExtraMesh(obj: THREE.Object3D): boolean {
  const nodeName = (obj.name || '').toLowerCase();
  if (HIDDEN_ARM_NODE_NAMES.has(nodeName) || nodeName.includes('manny')) {
    return true;
  }

  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh) {
    const geomName = (mesh.geometry?.name || '').toLowerCase();
    if (HIDDEN_ARM_NODE_NAMES.has(geomName)) return true;

    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const mat of mats) {
      if (!mat) continue;
      const matName = (mat.name || '').toLowerCase();
      if (
        HIDDEN_ARM_MATERIAL_NAMES.has(matName) ||
        matName.includes('glove') ||
        matName.includes('shirt') ||
        matName.includes('hand') ||
        matName.includes('manny') ||
        matName === 'arms'
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Computes the exact world-space bounding box of ONLY visible weapon meshes,
 * accounting for SkinnedMesh bone transformations.
 */
function computeVisibleWeaponBounds(rootObj: THREE.Object3D): THREE.Box3 {
  rootObj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();

  rootObj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    if (isArmOrExtraMesh(mesh)) {
      mesh.visible = false;
      return;
    }

    const posAttr = mesh.geometry?.getAttribute('position');
    if (!posAttr) return;

    const count = posAttr.count;
    // Sample vertices (step by max 1..3 for instant calculation on mobile CPUs)
    const step = count > 3000 ? 3 : 1;
    for (let i = 0; i < count; i += step) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      if (
        Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.z)
      ) {
        box.expandByPoint(v);
      }
    }
  });

  return box;
}

const WeaponIconSilhouette: React.FC<{
  weaponId: WeaponId;
  className?: string;
}> = ({ weaponId, className = 'w-16 h-8' }) => {
  if (weaponId === 'P50_PISTOL' || weaponId === 'M1911_PISTOL') {
    return (
      <svg viewBox="0 0 64 28" fill="none" className={className}>
        <path
          d="M14 7H46L48 11H30L26 23H17L20 12H14V7Z"
          fill="currentColor"
        />
        <rect
          x="28"
          y="11"
          width="6"
          height="4"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (
    weaponId === 'SNIPER_BOLT' ||
    weaponId === 'SNIPER_TACTICAL' ||
    weaponId === 'SNIPER_AWP' ||
    weaponId === 'SNIPER_HEAVY'
  ) {
    return (
      <svg viewBox="0 0 88 28" fill="none" className={className}>
        <path
          d="M4 13L18 11V17L4 19V13ZM18 11H58V14H84V12.5H87V15.5H58V17H38L35 23H29L31 17H22L19 22H15L18 11Z"
          fill="currentColor"
        />
        <rect
          x="28"
          y="6"
          width="22"
          height="3.5"
          rx="1"
          fill="currentColor"
        />
        <line
          x1="33"
          y1="9.5"
          x2="33"
          y2="11"
          stroke="currentColor"
          strokeWidth="2"
        />
        <line
          x1="45"
          y1="9.5"
          x2="45"
          y2="11"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 84 28" fill="none" className={className}>
      <path
        d="M6 11L18 10V16L6 18V11ZM18 10H56V12H76V11H80V14.5H56V16H42L39 24H33L35 16H25L22 22H17L20 16H18V10Z"
        fill="currentColor"
      />
      <rect x="30" y="6.5" width="12" height="3" rx="1" fill="currentColor" />
    </svg>
  );
};

export const WeaponInspectionModal: React.FC<WeaponInspectionModalProps> = ({
  activeWeapon,
  playerXp,
  onSelectWeapon,
  onClose,
  onStartTraining,
}) => {
  const [selectedId, setSelectedId] = useState<WeaponId>(activeWeapon);
  const [activeCategory, setActiveCategory] = useState<WeaponCategory>('ALL');
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(true);
  const [equippedSkinId, setEquippedSkinId] = useState<string>(() =>
    getEquippedWeaponSkinId(activeWeapon)
  );
  const [equippedOptic, setEquippedOptic] = useState<OpticType>(() =>
    getEquippedWeaponOptic(activeWeapon, playerXp)
  );
  const [equippedGunsmith, setEquippedGunsmith] = useState<WeaponGunsmithLoadout>(
    () => getEquippedWeaponGunsmith(activeWeapon)
  );
  const [playerCash, setPlayerCash] = useState<number>(() =>
    loadSavedPlayerCash()
  );

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const turntablePivotRef = useRef<THREE.Group | null>(null);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const loadedWeaponModelRef = useRef<THREE.Object3D | null>(null);
  const loadedWeaponIdRef = useRef<WeaponId>(activeWeapon);
  const opticMountGroupRef = useRef<THREE.Group | null>(null);
  const builtInOpticNodesRef = useRef<THREE.Object3D[]>([]);
  const attachmentSystemRef = useRef<WeaponAttachmentSystem | null>(null);

  const isDraggingRef = useRef(false);
  const lastXRef = useRef(0);
  const lastYRef = useRef(0);
  // Start at a side profile angle (Math.PI * 0.5) so the entire weapon profile is framed horizontally
  const targetRotYRef = useRef(Math.PI * 0.42);
  const currentRotYRef = useRef(Math.PI * 0.42);
  const prevRotYRef = useRef(Math.PI * 0.42);
  const targetRotXRef = useRef(0.06);
  const currentRotXRef = useRef(0.06);
  const prevRotXRef = useRef(0.06);
  const zoomScaleRef = useRef(1.0);

  const currentRank = getRankForXp(playerXp);
  const spec = WEAPON_SPECS[selectedId];
  const isUnlocked = isWeaponUnlockedAtXp(selectedId, playerXp);
  const reqRank = getRequiredXpForWeapon(selectedId);
  const isEquipped = activeWeapon === selectedId;
  const availableSkins = getAvailableSkinsForWeapon(selectedId);
  const currentSkinSpec = getSkinDefinition(equippedSkinId);
  const compatibleOptics = getCompatibleOpticsForWeapon(selectedId);
  const currentOpticSpec =
    SCOPE_PACK_CATALOG[equippedOptic] || SCOPE_PACK_CATALOG.iron;
  const supportsGunsmith = weaponSupportsGunsmith(selectedId);
  const gunsmithMods = computeGunsmithModifiersForLoadout(
    selectedId,
    equippedGunsmith
  );
  const effectiveAccuracy = Math.min(
    100,
    Math.max(10, spec.accuracy + gunsmithMods.accuracyDelta)
  );
  const effectiveMobility = Math.min(
    100,
    Math.max(10, spec.mobility + gunsmithMods.mobilityDelta)
  );
  const effectiveMagSize = computeEffectiveMagCapacity(
    selectedId,
    spec.magSize,
    gunsmithMods
  );

  useEffect(() => {
    preloadAllScopeThumbnails3D();
    setEquippedSkinId(getEquippedWeaponSkinId(selectedId));
    setEquippedOptic(getEquippedWeaponOptic(selectedId, playerXp));
    setEquippedGunsmith(getEquippedWeaponGunsmith(selectedId));
    const unsub = subscribePlayerInventory(() => {
      setEquippedSkinId(getEquippedWeaponSkinId(selectedId));
      setEquippedOptic(getEquippedWeaponOptic(selectedId, playerXp));
      setEquippedGunsmith(getEquippedWeaponGunsmith(selectedId));
      setPlayerCash(loadSavedPlayerCash());
    });
    return unsub;
  }, [selectedId, playerXp]);

  useEffect(() => {
    if (
      loadedWeaponModelRef.current &&
      loadedWeaponIdRef.current === selectedId
    ) {
      applyWeaponSkinToObject3D(
        loadedWeaponModelRef.current,
        selectedId,
        equippedSkinId
      );
    }
  }, [selectedId, equippedSkinId]);

  // Synchronize 3D Scope Pack model on the inspected weapon when equippedOptic changes
  useEffect(() => {
    const loader = loaderRef.current;
    const opticMount = opticMountGroupRef.current;
    if (!loader || !opticMount || loadedWeaponIdRef.current !== selectedId) {
      return;
    }

    let cancelled = false;
    while (opticMount.children.length > 0) {
      opticMount.remove(opticMount.children[0]);
    }

    const showBuiltIn =
      equippedOptic === 'iron' ||
      (selectedId === 'SNIPER_HEAVY' && equippedOptic === 'lpvo');
    for (const node of builtInOpticNodesRef.current) {
      node.visible = showBuiltIn;
    }

    if (
      equippedOptic === 'iron' ||
      selectedId === 'KNIFE_TACTICAL' ||
      selectedId === 'SNIPER_AWP' ||
      (selectedId === 'SNIPER_HEAVY' && equippedOptic === 'lpvo')
    ) {
      return;
    }

    const scopeSpec = SCOPE_PACK_CATALOG[equippedOptic];
    if (!scopeSpec?.modelUrl) return;

    loader.load(scopeSpec.modelUrl, (gltf: GLTF) => {
      if (cancelled) return;
      const scopeScene = gltf.scene;
      scopeScene.traverse((child: THREE.Object3D) => {
        const m = child as THREE.Mesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
        const fixMat = (mat: THREE.Material) => {
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
          const mName = (std.name || m.name || '').toLowerCase();
          if (mName.includes('glass')) {
            std.transparent = true;
            std.opacity = 0.08;
            std.depthWrite = false;
            std.side = THREE.FrontSide;
            m.renderOrder = 14;
          } else if (mName.includes('reticle')) {
            std.transparent = true;
            std.opacity = 0.98;
            std.depthWrite = false;
            std.side = THREE.DoubleSide;
            m.renderOrder = 15;
          } else {
            std.transparent = false;
            std.depthWrite = true;
            std.side = THREE.FrontSide;
          }
          std.needsUpdate = true;
        };
        if (Array.isArray(m.material)) {
          m.material.forEach(fixMat);
        } else if (m.material) {
          fixMat(m.material);
        }
      });
      opticMount.add(scopeScene);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, equippedOptic, isLoadingModel]);

  // Synchronize 3D Muzzle attachment on the inspected weapon when Gunsmith barrel changes
  useEffect(() => {
    const attSys = attachmentSystemRef.current;
    if (!attSys || loadedWeaponIdRef.current !== selectedId) return;
    attSys.updateWeaponAlignment(selectedId);
    const muzzleFromBarrel: MuzzleType =
      equippedGunsmith.barrel === 'barrel_heavy'
        ? 'MB01_BRAKE'
        : equippedGunsmith.barrel === 'barrel_cqb'
          ? 'SC01_SHORT'
          : 'NONE';
    attSys.setMuzzle(muzzleFromBarrel);
  }, [selectedId, equippedGunsmith.barrel, isLoadingModel]);

  // Filter weapon list by category
  const weaponList = (Object.keys(WEAPON_SPECS) as WeaponId[]).filter((id) => {
    if (activeCategory === 'ALL') return true;
    return WEAPON_SPECS[id].category === activeCategory;
  });

  // 1. Initialize persistent WebGL studio inside the dedicated right/center showcase stage
  useEffect(() => {
    const container = stageContainerRef.current;
    if (!container) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const renderer = createSecondaryWebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // High-contrast Gunsmith Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 3.2);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xf59e0b, 1.1);
    fillLight.position.set(0, -3, 3);
    scene.add(fillLight);

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.05, 25);
    camera.position.set(0, 0.02, 1.12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const turntablePivot = new THREE.Group();
    turntablePivot.position.set(0, 0.02, 0);
    scene.add(turntablePivot);
    turntablePivotRef.current = turntablePivot;

    // Configure GLTFLoader with Draco/Meshopt/KTX2 + KHR_materials_pbrSpecularGlossiness support
    const gltfLoader = createGameGltfLoader();
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
        materialParams.roughness = matDef.name === 'M4_D' ? 0.34 : 0.55;
        materialParams.metalness = matDef.name === 'M4_D' ? 0.75 : 0.08;
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
    loaderRef.current = gltfLoader;

    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);

      if (!isDraggingRef.current) {
        targetRotYRef.current += dt * 0.38;
      }

      currentRotYRef.current = THREE.MathUtils.damp(
        currentRotYRef.current,
        targetRotYRef.current,
        14,
        dt
      );
      currentRotXRef.current = THREE.MathUtils.damp(
        currentRotXRef.current,
        targetRotXRef.current,
        14,
        dt
      );

      if (turntablePivotRef.current) {
        turntablePivotRef.current.rotation.set(
          currentRotXRef.current,
          currentRotYRef.current,
          0
        );
        turntablePivotRef.current.scale.setScalar(zoomScaleRef.current);
      }

      if (attachmentSystemRef.current && dt > 0.0001) {
        const velY = (currentRotYRef.current - prevRotYRef.current) / dt;
        const velX = (currentRotXRef.current - prevRotXRef.current) / dt;
        attachmentSystemRef.current.updatePhysics(
          dt,
          velY * 0.012,
          velX * 0.012,
          0,
          0,
          0,
          -currentRotXRef.current * 0.32,
          0
        );
      }
      prevRotYRef.current = currentRotYRef.current;
      prevRotXRef.current = currentRotXRef.current;

      renderer.render(scene, camera);
    };

    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!stageContainerRef.current || !rendererRef.current || !cameraRef.current)
        return;
      const w = Math.max(1, stageContainerRef.current.clientWidth);
      const h = Math.max(1, stageContainerRef.current.clientHeight);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      rendererRef.current = null;
      disposeSecondaryWebGLRenderer(renderer);
    };
  }, []);

  // 2. Load, strip hands/arms, evaluate ready pose, and auto-center the selected weapon
  useEffect(() => {
    const loader = loaderRef.current;
    const turntablePivot = turntablePivotRef.current;
    if (!loader || !turntablePivot) return;

    let cancelled = false;
    setIsLoadingModel(true);
    loadedWeaponModelRef.current = null;
    loadedWeaponIdRef.current = selectedId;

    // Clear previous weapon from turntable
    while (turntablePivot.children.length > 0) {
      const prev = turntablePivot.children[0];
      turntablePivot.remove(prev);
    }

    const wSpec = WEAPON_SPECS[selectedId];
    const activeSkinDef = getSkinDefinition(equippedSkinId);
    const effectiveModelUrl =
      activeSkinDef.modelOverrideUrl &&
      (!activeSkinDef.weaponIds || activeSkinDef.weaponIds.includes(selectedId))
        ? activeSkinDef.modelOverrideUrl
        : wSpec.localUrl;

    const onModelLoaded = (gltf: {
      scene: THREE.Group;
      animations: THREE.AnimationClip[];
    }) => {
      if (cancelled) return;

      const modelScene = gltf.scene;

      const { gunAnchorGroup, builtInOpticNodes } =
        prepareStandaloneWeaponSceneForInspection(
          selectedId,
          modelScene,
          gltf.animations || []
        );

      // Ensure any residual embedded hand/arm meshes remain hidden
      modelScene.traverse((child) => {
        if (isArmOrExtraMesh(child)) {
          child.visible = false;
        }
      });

      const currentOptic = getEquippedWeaponOptic(selectedId, playerXp);
      const showBuiltIn =
        currentOptic === 'iron' ||
        (selectedId === 'SNIPER_HEAVY' && currentOptic === 'lpvo');
      for (const node of builtInOpticNodes) {
        node.visible = showBuiltIn;
      }
      builtInOpticNodesRef.current = builtInOpticNodes;

      // Mount 3D Scope container at the exact calibrated WEAPON_RAIL_MOUNTS coordinate in gunAnchorGroup
      const opticMount = new THREE.Group();
      const railMount = WEAPON_RAIL_MOUNTS[selectedId];
      if (railMount) {
        opticMount.position.set(
          railMount.pos[0],
          railMount.pos[1],
          railMount.pos[2]
        );
        opticMount.scale.setScalar(railMount.scale);
      }
      gunAnchorGroup.add(opticMount);
      opticMountGroupRef.current = opticMount;

      // Compute visible weapon bounds BEFORE attaching muzzles/charms so centering frames the firearm consistently
      gunAnchorGroup.updateMatrixWorld(true);
      const box = computeVisibleWeaponBounds(gunAnchorGroup);

      // Mount 3D Muzzle & Physics Charm at the exact calibrated WEAPON_MUZZLE_OFFSETS / WEAPON_CHARM_OFFSETS coordinates
      const attSys = new WeaponAttachmentSystem(gunAnchorGroup);
      attSys.updateWeaponAlignment(selectedId);
      const gs = getEquippedWeaponGunsmith(selectedId);
      const muzzleFromBarrel: MuzzleType =
        gs.barrel === 'barrel_heavy'
          ? 'MB01_BRAKE'
          : gs.barrel === 'barrel_cqb'
            ? 'SC01_SHORT'
            : 'NONE';
      attSys.setMuzzle(muzzleFromBarrel);
      attSys.setCharm('NONE' as CharmType);
      attachmentSystemRef.current = attSys;

      const centeringGroup = new THREE.Group();
      centeringGroup.add(gunAnchorGroup);

      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const normScale = wSpec.targetSpan / maxDim;

        // Translate and scale gunAnchorGroup as a unit so weapon, scope, muzzle, and charm stay 100% locked
        gunAnchorGroup.position.set(
          -center.x * normScale,
          -center.y * normScale,
          -center.z * normScale
        );
        gunAnchorGroup.scale.setScalar(normScale);
      }

      // Set side-profile angle so weapon points cleanly across the viewing stage
      targetRotYRef.current = Math.PI * 0.45;
      currentRotYRef.current = Math.PI * 0.45;
      prevRotYRef.current = Math.PI * 0.45;
      targetRotXRef.current = 0.05;
      currentRotXRef.current = 0.05;
      prevRotXRef.current = 0.05;
      zoomScaleRef.current = 1.0;

      turntablePivot.add(centeringGroup);
      loadedWeaponModelRef.current = modelScene;
      loadedWeaponIdRef.current = selectedId;
      applyWeaponSkinToObject3D(
        modelScene,
        selectedId,
        getEquippedWeaponSkinId(selectedId)
      );
      setIsLoadingModel(false);
    };

    if (!wSpec.localUrl) {
      const initialSkin = getEquippedWeaponSkinId(selectedId);
      const procModel = createBotThirdPersonWeaponMesh(
        selectedId,
        true,
        initialSkin
      );
      procModel.rotation.x = -0.16;
      builtInOpticNodesRef.current = [];
      const centeringGroup = new THREE.Group();
      centeringGroup.add(procModel);
      procModel.updateMatrixWorld(true);
      const opticMount = new THREE.Group();
      const box = computeVisibleWeaponBounds(procModel);
      if (!box.isEmpty()) {
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const normScale = wSpec.targetSpan / maxDim;
        procModel.position.set(
          -center.x * normScale,
          -center.y * normScale,
          -center.z * normScale
        );
        procModel.scale.setScalar(normScale);
        opticMount.position.set(0, (size.y * normScale) * 0.42, 0.02);
        opticMount.scale.setScalar(wSpec.targetSpan * 1.05);
      }
      centeringGroup.add(opticMount);
      opticMountGroupRef.current = opticMount;
      targetRotYRef.current = Math.PI * 0.45;
      currentRotYRef.current = Math.PI * 0.45;
      targetRotXRef.current = 0.05;
      currentRotXRef.current = 0.05;
      zoomScaleRef.current = 1.0;
      turntablePivot.add(centeringGroup);
      loadedWeaponModelRef.current = procModel;
      loadedWeaponIdRef.current = selectedId;
      applyWeaponSkinToObject3D(procModel, selectedId, initialSkin);
      setIsLoadingModel(false);
      return () => {
        cancelled = true;
      };
    }

    loader.load(effectiveModelUrl, onModelLoaded, undefined, () => {
      loader.load(wSpec.githubUrl, onModelLoaded, undefined, () => {
        if (!cancelled) setIsLoadingModel(false);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectedId, equippedSkinId]);

  // Touch and Mouse 360° Drag Inspection Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    const dy = e.clientY - lastYRef.current;
    lastXRef.current = e.clientX;
    lastYRef.current = e.clientY;
    targetRotYRef.current += dx * 0.01;
    targetRotXRef.current = THREE.MathUtils.clamp(
      targetRotXRef.current + dy * 0.006,
      -0.45,
      0.45
    );
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const handleZoomStep = (delta: number) => {
    soundEngine.playMenuSelect();
    zoomScaleRef.current = THREE.MathUtils.clamp(
      zoomScaleRef.current + delta,
      0.75,
      1.65
    );
  };

  const handleSelectOrBuySkin = (skin: WeaponSkinDefinition) => {
    const owned = isWeaponSkinOwned(skin.id);
    if (!owned) {
      const bought = purchaseWeaponSkinWithCash(skin.id);
      if (!bought) {
        soundEngine.playMenuHover();
        return;
      }
      setPlayerCash(loadSavedPlayerCash());
    }
    soundEngine.playMenuSelect();
    equipWeaponSkin(selectedId, skin.id);
    setEquippedSkinId(skin.id);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        soundEngine.playMenuSelect();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-[#07090d] select-none text-white font-sans flex flex-col justify-between overflow-hidden pointer-events-auto"
    >
      {/* =================================================================== */}
      {/* 1. TOP NAV HEADER BAR                                              */}
      {/* =================================================================== */}
      <header className="relative z-40 w-full px-3 sm:px-5 py-2 bg-[#0b0e14]/98 border-b border-amber-500/35 flex items-center justify-between gap-2 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.85)]">
        {/* Left: Prominent Back to Main Menu Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            soundEngine.playMenuSelect();
            onClose();
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#f97316] hover:to-[#fb923c] border border-amber-300/70 rounded-lg text-[11px] sm:text-xs font-display font-black tracking-wider text-slate-950 uppercase transition-all cursor-pointer shrink-0 shadow-[0_0_14px_rgba(249,115,22,0.45)] active:scale-95"
        >
          <span>←</span>
          <span>VOLTAR AO MENU</span>
        </button>

        {/* Center Category Filter Tabs */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'ALL', label: 'TODAS' },
            { id: 'ASSALTO', label: 'ASSALTO' },
            { id: 'ESCOPETA', label: '12GA' },
            { id: 'SMG', label: 'SMG' },
            { id: 'SNIPER', label: 'SNIPER' },
            { id: 'LMG', label: 'LMG' },
            { id: 'PESADA', label: 'PESADA' },
            { id: 'PISTOLA', label: 'PISTOLA' },
          ].map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playMenuSelect();
                  setActiveCategory(cat.id as WeaponCategory);
                }}
                className={`px-2.5 sm:px-3 py-1 rounded-lg text-[10px] sm:text-xs font-mono font-bold tracking-wider transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-black shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                    : 'bg-black/50 text-slate-400 hover:text-slate-200 border border-white/10'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Right: Player Warface Rank Badge + Direct Close X Button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:flex items-center gap-2 bg-black/60 border border-amber-500/40 rounded-xl px-2.5 py-1">
            <WarfaceRankIcon level={currentRank.level} className="w-5 h-5" />
            <span className="text-[10px] font-mono font-bold text-amber-300">
              NÍV. {currentRank.level} · {currentRank.title.toUpperCase()}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playMenuSelect();
              onClose();
            }}
            className="px-3 py-1.5 rounded-lg bg-red-600/25 hover:bg-red-600/45 border border-red-400/60 text-[11px] font-display font-black tracking-wider text-red-100 uppercase cursor-pointer transition-all active:scale-95"
          >
            FECHAR ✕
          </button>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. SPLIT WORKSPACE: LEFT SPECS PANEL + RIGHT 3D VIEWING STAGE       */}
      {/* =================================================================== */}
      <div className="relative flex-1 w-full flex flex-row items-stretch overflow-hidden min-h-0">
        {/* LEFT COLUMN: Dedicated Tactical Info & Specs Panel (Never overlaps 3D weapon!) */}
        <aside className="relative z-20 w-64 sm:w-76 md:w-84 shrink-0 px-4 py-3 bg-[#090c12]/90 border-r border-white/10 flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="text-[10px] font-mono font-bold text-amber-400 tracking-widest uppercase">
              {spec.categoryTag} · {spec.caliber}
            </div>
            <h1 className="font-display font-black text-xl sm:text-2xl text-white tracking-wider mt-0.5 leading-tight">
              {spec.name}
            </h1>
            <p className="font-mono text-[10px] text-slate-300 mt-1 leading-snug opacity-90 line-clamp-2">
              {spec.description}
            </p>
          </div>

          {/* Tactical Stats Box */}
          <div className="bg-black/60 border border-white/15 rounded-xl p-2.5 my-1.5">
            <div className="text-[9px] font-mono font-bold text-amber-400 tracking-wider uppercase mb-1.5">
              ESPECIFICAÇÕES TÁTICAS
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              {[
                { label: 'DANO', val: spec.firepower, delta: 0, color: 'bg-amber-500' },
                {
                  label: 'PRECISÃO',
                  val: effectiveAccuracy,
                  delta: gunsmithMods.accuracyDelta,
                  color: 'bg-emerald-500',
                },
                {
                  label: 'MOBILIDADE',
                  val: effectiveMobility,
                  delta: gunsmithMods.mobilityDelta,
                  color: 'bg-sky-500',
                },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-2">
                  <span className="w-20 text-[9px] text-slate-400 shrink-0">
                    {stat.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-150 ${stat.color}`}
                      style={{ width: `${stat.val}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-[10px] font-bold text-white">
                    {stat.val}
                    {stat.delta !== 0 && (
                      <span
                        className={`ml-0.5 text-[9px] ${
                          stat.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {stat.delta > 0 ? `+${stat.delta}` : stat.delta}
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between text-[10px] text-slate-300 pt-1.5 mt-1 border-t border-white/10">
                <span>
                  ALCANCE:{' '}
                  <b className="text-white">
                    {spec.range}
                    {gunsmithMods.rangeDeltaPct !== 0 && (
                      <span
                        className={`ml-0.5 text-[9px] ${
                          gunsmithMods.rangeDeltaPct > 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {gunsmithMods.rangeDeltaPct > 0
                          ? `+${gunsmithMods.rangeDeltaPct}%`
                          : `${gunsmithMods.rangeDeltaPct}%`}
                      </span>
                    )}
                  </b>
                </span>
                <span>
                  CADÊNCIA: <b className="text-white">{spec.fireRate}</b>
                </span>
                <span>
                  PENTE:{' '}
                  <b
                    className={
                      effectiveMagSize > spec.magSize
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }
                  >
                    {effectiveMagSize}R
                  </b>
                </span>
              </div>
            </div>
          </div>

          {/* 3D Scope Pack Selector Box (Unlocked by Level) */}
          {compatibleOptics.length > 1 && (
            <div className="bg-black/60 border border-white/15 rounded-xl p-2.5 my-1">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[9px] font-mono font-bold text-cyan-400 tracking-wider uppercase">
                  MIRAS & SCOPES 3D (NÍVEL)
                </span>
                <span className="text-[9px] font-mono font-bold text-cyan-200 truncate max-w-[140px]">
                  {currentOpticSpec.shortLabel} ·{' '}
                  {currentOpticSpec.magnification}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {compatibleOptics.map((sSpec) => {
                  const opticId = sSpec.id;
                  const active = equippedOptic === opticId;
                  const unlocked = isOpticUnlockedAtXp(opticId, playerXp);
                  const reqOptic = getRequiredXpForOptic(opticId);
                  return (
                    <InspectionScopeOpticCard
                      key={opticId}
                      opticId={opticId}
                      shortLabel={sSpec.shortLabel}
                      magnification={sSpec.magnification}
                      title={`${sSpec.name} (${sSpec.magnification}) — ${sSpec.description}`}
                      active={active}
                      unlocked={unlocked}
                      requiredLevel={reqOptic.requiredLevel}
                      onClick={() => {
                        if (!unlocked) {
                          soundEngine.playMenuHover();
                          return;
                        }
                        soundEngine.playMenuSelect();
                        equipWeaponOptic(selectedId, opticId, playerXp);
                        setEquippedOptic(opticId);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Gunsmith Tactical Attachments (Real Combat Modifiers) */}
          {supportsGunsmith && (
            <div className="bg-black/60 border border-white/15 rounded-xl p-2.5 my-1">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[9px] font-mono font-bold text-emerald-400 tracking-wider uppercase">
                  ARMEIRO TÁTICO · GUNSMITH
                </span>
                <span className="text-[8px] font-mono text-slate-400">
                  ADS {Math.round(gunsmithMods.adsSpeedMult * 100)}% · RECUO{' '}
                  {Math.round(gunsmithMods.recoilPitchMult * 100)}%
                </span>
              </div>
              <div className="space-y-1.5">
                {GUNSMITH_SLOT_META.map((slotMeta) => {
                  const options = GUNSMITH_ATTACHMENTS_BY_SLOT[slotMeta.id];
                  const activeId = equippedGunsmith[slotMeta.id];
                  const activeSpec = getGunsmithAttachmentSpec(
                    slotMeta.id,
                    activeId
                  );
                  return (
                    <div key={slotMeta.id} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[8px] font-mono">
                        <span className="text-slate-400 font-bold tracking-wider">
                          {slotMeta.label}
                        </span>
                        <span className="text-emerald-300/90 truncate max-w-[160px]">
                          {activeSpec.perkSummary}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {options.map((opt) => {
                          const isSelected = activeId === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              title={`${opt.name} — ${opt.perkSummary}`}
                              onClick={() => {
                                soundEngine.playMechanicalSwitch(1.05);
                                const next = setWeaponGunsmithAttachment(
                                  selectedId,
                                  slotMeta.id,
                                  opt.id
                                );
                                setEquippedGunsmith(next);
                              }}
                              className={`px-1.5 py-1 rounded-md border text-[8px] font-mono font-bold tracking-wide transition-colors cursor-pointer truncate ${
                                isSelected
                                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                                  : 'bg-black/50 border-white/10 text-slate-400 hover:border-white/30 hover:text-slate-200'
                              }`}
                            >
                              {opt.shortLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Skin & Camouflage Selector Box */}
          <div className="bg-black/60 border border-white/15 rounded-xl p-2.5 my-1">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[9px] font-mono font-bold text-amber-400 tracking-wider uppercase">
                SKINS & CAMUFLAGEM
              </span>
              <span className="text-[9px] font-mono font-bold text-white truncate max-w-[140px]">
                {currentSkinSpec.shortName}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {availableSkins.map((skin) => {
                const active = equippedSkinId === skin.id;
                const owned = isWeaponSkinOwned(skin.id);
                const canAfford = playerCash >= skin.cashPrice;
                return (
                  <button
                    key={skin.id}
                    type="button"
                    title={skin.description}
                    disabled={!owned && !canAfford}
                    onClick={() => handleSelectOrBuySkin(skin)}
                    className={`rounded-lg border p-1.5 text-left transition-all flex items-center gap-2 ${
                      active
                        ? 'bg-amber-500/20 border-amber-400 cursor-pointer'
                        : owned || canAfford
                          ? 'bg-black/50 border-white/12 hover:border-white/35 cursor-pointer'
                          : 'bg-black/60 border-white/5 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded border border-white/25 shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${skin.swatchColors[0]} 0% 34%, ${skin.swatchColors[1]} 34% 68%, ${skin.swatchColors[2]} 68% 100%)`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-mono font-bold text-white truncate">
                        {skin.shortName}
                      </div>
                      <div className="text-[8px] font-mono leading-tight">
                        {!owned ? (
                          <span className="text-amber-300 font-bold">
                            $ {skin.cashPrice}
                          </span>
                        ) : active ? (
                          <span className="text-emerald-400 font-bold">
                            EQUIPADA ✓
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {skin.category === 'SKIN_EXCLUSIVA'
                              ? 'EXCLUSIVA'
                              : skin.category === 'PADRAO'
                                ? 'PADRÃO'
                                : 'CAMO'}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Unlock status banner if locked */}
          {!isUnlocked && (
            <div className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1">
              🔒 Requer Nível {reqRank.requiredLevel} ({reqRank.rankTitle})
            </div>
          )}
        </aside>

        {/* RIGHT STAGE: Dedicated, Unobstructed 3D Weapon Showcase Viewport */}
        <div
          className="relative flex-1 h-full overflow-hidden cursor-grab active:cursor-grabbing bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.45)_0%,rgba(7,9,13,0.98)_75%)]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Subtle Studio Showcase Frame & Reticle Backdrop */}
          <div className="absolute inset-4 border border-white/10 rounded-2xl pointer-events-none flex items-center justify-center">
            <div className="w-44 h-44 sm:w-56 sm:h-56 rounded-full border border-amber-500/15 bg-amber-500/[0.02]" />
          </div>

          {/* Dedicated 3D WebGL Canvas */}
          <div ref={stageContainerRef} className="absolute inset-0 w-full h-full z-10" />

          {/* Loading Indicator */}
          {isLoadingModel && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <div className="px-3 py-1.5 rounded-lg bg-black/80 border border-amber-500/40 font-mono text-xs text-amber-300">
                CARREGANDO MODELO 3D...
              </div>
            </div>
          )}

          {/* Top Bar inside Stage: 360° Hint + Zoom Controls */}
          <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
            <div className="bg-black/70 border border-amber-500/30 rounded-lg px-2.5 py-1 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              ESTÚDIO DE INSPEÇÃO 3D · SOMENTE ARMA
            </div>

            <div className="flex items-center gap-1.5 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomStep(-0.15);
                }}
                className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-white/15 border border-white/20 font-mono text-xs font-bold text-white cursor-pointer"
                title="Diminuir Zoom"
              >
                − ZOOM
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleZoomStep(0.15);
                }}
                className="px-2.5 py-1 rounded-lg bg-black/75 hover:bg-white/15 border border-white/20 font-mono text-xs font-bold text-amber-300 cursor-pointer"
                title="Aumentar Zoom"
              >
                + ZOOM
              </button>
              <div className="hidden md:flex bg-black/65 border border-white/15 rounded-lg px-2.5 py-1 items-center gap-1.5 font-mono text-[10px] text-slate-300">
                <span>ARRASTE PARA GIRAR 360°</span>
              </div>
            </div>
          </div>

          {/* Bottom Bar inside Stage: Action Buttons + Direct Return to Menu button */}
          <div className="absolute bottom-3 left-4 right-4 z-20 pointer-events-auto flex items-center justify-between gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                soundEngine.playMenuSelect();
                onClose();
              }}
              className="px-4 py-2 rounded-xl font-display font-black text-xs sm:text-sm uppercase tracking-widest bg-black/85 hover:bg-white/15 border border-amber-400/50 text-amber-300 transition-all cursor-pointer active:scale-95 shadow-lg"
            >
              ← VOLTAR AO MENU
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playMenuSelect();
                  onSelectWeapon(selectedId);
                }}
                className={`px-5 py-2 rounded-xl font-display font-black text-xs sm:text-sm uppercase tracking-widest transition-all cursor-pointer ${
                  isEquipped
                    ? 'bg-emerald-600 text-white shadow-[0_0_16px_rgba(16,185,129,0.45)]'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.45)] active:scale-95'
                }`}
              >
                {isEquipped ? 'EQUIPADA ✓' : 'EQUIPAR ARMA'}
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  soundEngine.playMenuSelect();
                  onSelectWeapon(selectedId);
                  onClose();
                  onStartTraining();
                }}
                className="px-4 py-2 rounded-xl font-display font-black text-xs sm:text-sm uppercase tracking-widest bg-black/80 hover:bg-white/20 border border-white/30 text-white transition-all cursor-pointer active:scale-95 shadow-lg"
              >
                TESTAR NO ESTANDE
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. BOTTOM HORIZONTAL WEAPON SELECTOR CAROUSEL                       */}
      {/* =================================================================== */}
      <footer className="relative z-30 w-full px-3 sm:px-6 py-2 bg-[#0a0d12]/95 border-t border-white/15 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2.5 min-w-max">
          {weaponList.map((wId) => {
            const wSpec = WEAPON_SPECS[wId];
            const isSelected = selectedId === wId;
            const isEq = activeWeapon === wId;
            const unlocked = isWeaponUnlockedAtXp(wId, playerXp);
            const req = getRequiredXpForWeapon(wId);

            return (
              <button
                key={wId}
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setSelectedId(wId);
                }}
                className={`relative w-42 sm:w-46 h-16 rounded-xl border p-2 flex flex-col justify-between transition-all cursor-pointer text-left ${
                  isSelected
                    ? 'bg-gradient-to-t from-amber-500/25 to-black/80 border-2 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                    : unlocked
                      ? 'bg-black/60 border-white/20 hover:border-white/40 hover:bg-white/10'
                      : 'bg-black/80 border-slate-800 opacity-75'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-amber-400 font-bold truncate">
                    {wSpec.caliber}
                  </span>
                  {isEq ? (
                    <span className="text-[8px] font-mono font-black bg-emerald-500 text-slate-950 px-1.5 py-0.2 rounded">
                      EQUIPADA
                    </span>
                  ) : !unlocked ? (
                    <span className="text-[8px] font-mono font-bold text-amber-400">
                      🔒 NÍV {req.requiredLevel}
                    </span>
                  ) : null}
                </div>

                {/* Center SVG Silhouette & Name */}
                <div className="flex items-center gap-2">
                  <WeaponIconSilhouette
                    weaponId={wId}
                    className="w-11 h-5 text-white/90 shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-display font-black text-xs text-white truncate leading-tight">
                      {wSpec.name}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400 truncate">
                      {wSpec.categoryTag}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </footer>
    </div>
  );
};
