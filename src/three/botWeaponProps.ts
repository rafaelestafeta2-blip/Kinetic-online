import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WeaponId } from '../types/game';
import { createGameGltfLoader } from './gltfLoaderFactory';
import {
  createSculptedThirdPersonWeaponMesh,
  isSculptedWeaponId,
} from './sculptedFirearms';
import { calibrateKinemationMaterialScene } from './kinemationArmsRig';
import { applyWeaponSkinToObject3D } from './weaponSkinMaterial';
import { resolveAssetUrl } from '../utils/assetUrl';

interface RealGlbWeaponSpec {
  id: WeaponId;
  url: string;
  githubFallbackUrl?: string;
  clipName?: string;
  clipTime?: number;
  rawLocal?: boolean;
  filter: (meshName: string, nodeName: string, matNames: string[]) => boolean;
  offset: [number, number, number];
  scale: number;
  rotX: number;
  rotY: number;
}

const glbWeaponTemplates = new Map<WeaponId, THREE.Group>();
const glbLevelPreviewTemplates = new Map<WeaponId, THREE.Group>();
const glbWeaponPromises = new Map<WeaponId, Promise<THREE.Group | null>>();
const pendingWeaponMounts: Array<{ group: THREE.Group; weaponId: WeaponId }> = [];
let preloadAllPromise: Promise<void> | null = null;

const _rGripWorld = new THREE.Vector3();
const _rThumbWorld = new THREE.Vector3();
const _lIdxWorld = new THREE.Vector3();
const _lMidWorld = new THREE.Vector3();
const _lThumbWorld = new THREE.Vector3();
const _lCradleWorld = new THREE.Vector3();
const _rGripLocal = new THREE.Vector3();
const _lCradleLocal = new THREE.Vector3();
const _handDir = new THREE.Vector3();
const _lookTargetWorld = new THREE.Vector3();

interface HandFingerCache {
  rMiddle1: THREE.Object3D;
  rThumb2: THREE.Object3D;
  lIndex2: THREE.Object3D;
  lMiddle2: THREE.Object3D;
  lThumb2: THREE.Object3D;
}

const HIDDEN_ARM_MATS = new Set([
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
  'scopereticle',
  'hands_04',
  'mi_manny_01',
  'mi_manny_02',
]);

const HIDDEN_EXTRA_NODES = new Set([
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
  'mag001_0',
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
  'scoperender_sniper_0',
  'reticle_scopereticle_0',
  'hands_04_mesh',
]);

function isExcludedMesh(
  meshName: string,
  nodeName: string,
  matNames: string[]
): boolean {
  const mLow = meshName.toLowerCase();
  const nLow = nodeName.toLowerCase();
  if (HIDDEN_EXTRA_NODES.has(mLow) || HIDDEN_EXTRA_NODES.has(nLow)) return true;
  if (
    mLow.includes('arm') ||
    mLow.includes('hand') ||
    mLow.includes('glove') ||
    mLow.includes('watch') ||
    mLow.includes('shirt') ||
    mLow.includes('ch22') ||
    mLow.includes('manny')
  ) {
    return true;
  }
  for (const mn of matNames) {
    const low = mn.toLowerCase();
    if (
      HIDDEN_ARM_MATS.has(low) ||
      low.includes('glove') ||
      low.includes('shirt') ||
      low.includes('hand') ||
      low.includes('manny') ||
      low === 'arms'
    ) {
      return true;
    }
  }
  return false;
}

const WEAPON_GLB_SPECS: RealGlbWeaponSpec[] = [
  {
    id: 'AK47_RIFLE',
    url: '/models/fps_ak47.glb',
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0.129, -1.385, -0.21],
    scale: 1.02,
    rotX: 0.24,
    rotY: 0,
  },
  {
    id: 'AK12_RIFLE',
    url: '/models/kinemation/weapons/ak200.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.05, 0.03],
    scale: 1.0,
    rotX: 0.2,
    rotY: 0,
  },
  {
    id: 'S_MILITARY',
    url: '/models/weapons/s_military_ar.glb',
    clipName: 'Idle',
    clipTime: 0.05,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [11.27, -138.0, -36.0],
    scale: 0.0105,
    rotX: 0.2,
    rotY: 0,
  },
  {
    id: 'M4_CARBINE',
    url: '/models/kinemation/weapons/mx16a4.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.05, 0.03],
    scale: 1.0,
    rotX: 0.2,
    rotY: 0,
  },
  {
    id: 'CARBINE_AR',
    url: '/models/fps_animated_carbine.glb',
    clipName: 'allanims',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0.004, -0.11, -0.02],
    scale: 0.43,
    rotX: 0.2,
    rotY: 0,
  },
  {
    id: 'SMG_45',
    url: '/models/weapons/v18_engineer_smg.glb',
    rawLocal: true,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.03, 0.04],
    scale: 0.95,
    rotX: 0.19,
    rotY: 0,
  },
  {
    id: 'SMG_MP5',
    url: '/models/kinemation/weapons/mps5.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.05, 0.03],
    scale: 1.0,
    rotX: 0.19,
    rotY: 0,
  },
  {
    id: 'SHOTGUN_12',
    url: '/models/kinemation/weapons/drake12.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.05, 0.03],
    scale: 1.0,
    rotX: 0.19,
    rotY: 0,
  },
  {
    id: 'SHOTGUN_SPAS',
    url: '/models/weapons/automatic_shotgun.glb',
    clipName: 'Idle',
    clipTime: 0.05,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [9.37, -147.74, -34.44],
    scale: 0.0105,
    rotX: 0.19,
    rotY: 0,
  },
  {
    id: 'SNIPER_BOLT',
    url: '/models/kinemation/weapons/kar98k.glb',
    clipName: 'Fire',
    clipTime: 0,
    filter: (m, n, mats) =>
      !isExcludedMesh(m, n, mats) &&
      !mats.some((mn) => mn.toLowerCase() === 'm_kar98k_clip'),
    offset: [0, 0.05, 0.03],
    scale: 1.0,
    rotX: 0.18,
    rotY: 0,
  },
  {
    id: 'SNIPER_TACTICAL',
    url: '/models/kinemation/weapons/mk14.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.05, 0.03],
    scale: 1.0,
    rotX: 0.2,
    rotY: 0,
  },
  {
    id: 'SNIPER_AWP',
    url: '/models/sniper_animated.glb',
    clipName: 'allanims',
    clipTime: 0.1,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0.004, -0.025, 0.12],
    scale: 0.008,
    rotX: 0.18,
    rotY: 0,
  },
  {
    id: 'SNIPER_HEAVY',
    url: '/models/sniper_fps_animation.glb',
    clipName: 'Scene',
    clipTime: 0.1,
    filter: (m, n, mats) =>
      !isExcludedMesh(m, n, mats) &&
      !mats.some((mn) => mn.toLowerCase() === 'textura'),
    offset: [0.206, 0.35, 0.03],
    scale: 0.48,
    rotX: 0.18,
    rotY: Math.PI / 2,
  },
  {
    id: 'L49_LMG',
    url: '/models/lmg_animated.glb',
    clipName: 'allanims',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.01, 0.02],
    scale: 0.72,
    rotX: 0.19,
    rotY: 0,
  },
  {
    id: 'RPG7_LAUNCHER',
    url: '/models/kinemation/weapons/rpg7.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.04, 0.04],
    scale: 1.0,
    rotX: 0.12,
    rotY: 0,
  },
  {
    id: 'P50_PISTOL',
    url: '/models/kinemation/weapons/dgl50.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.04, 0.02],
    scale: 1.0,
    rotX: 0.16,
    rotY: 0,
  },
  {
    id: 'M1911_PISTOL',
    url: '/models/kinemation/weapons/m1911.glb',
    clipName: 'Pose',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.04, 0.02],
    scale: 1.0,
    rotX: 0.16,
    rotY: 0,
  },
  {
    id: 'KNIFE_TACTICAL',
    url: '/models/knife_animated.glb',
    clipName: 'anims',
    clipTime: 0,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [8.0, -8.0, -18.5],
    scale: 0.011,
    rotX: 0,
    rotY: Math.PI / 2,
  },
];

/**
 * Inventory/thumbnail-only overrides (empty: all weapons now preview their exact live Kinemation / 1P GLB).
 */
const INVENTORY_PREVIEW_OVERRIDE_SPECS: RealGlbWeaponSpec[] = [];

function buildBakedStaticGroup(
  scene: THREE.Object3D,
  animations: THREE.AnimationClip[] | undefined,
  spec: RealGlbWeaponSpec,
  overrideRotX?: number
): THREE.Group {
  if (spec.clipName && animations && animations.length > 0) {
    const mixer = new THREE.AnimationMixer(scene);
    const clip =
      animations.find((c) => c.name === spec.clipName) || animations[0];
    if (clip) {
      let minT = Infinity;
      for (let i = 0; i < clip.tracks.length; i++) {
        const arr = clip.tracks[i].times;
        if (arr.length > 0 && arr[0] < minT) minT = arr[0];
      }
      const t =
        (spec.clipTime ?? 0) > 0
          ? (spec.clipTime ?? 0)
          : Number.isFinite(minT) && minT > 0.005
            ? minT + 0.01
            : 0.01;
      const action = mixer.clipAction(clip);
      action.weight = 1.0;
      action.play();
      mixer.setTime(t);
    }
  }

  scene.updateMatrixWorld(true);

  const template = new THREE.Group();
  const v = new THREE.Vector3();
  const nVec = new THREE.Vector3();
  const offsetVec = new THREE.Vector3(
    spec.offset[0],
    spec.offset[1],
    spec.offset[2]
  );
  const useRotX = overrideRotX !== undefined ? overrideRotX : spec.rotX;
  const rotMat = new THREE.Matrix4()
    .makeRotationX(useRotX)
    .multiply(new THREE.Matrix4().makeRotationY(spec.rotY));
  const rotQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);
  const worldNormalMat = new THREE.Matrix3();

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const srcMesh = child as THREE.Mesh;
    const mName = srcMesh.name || '';
    const nName = srcMesh.parent?.name || '';
    const matsArr = Array.isArray(srcMesh.material)
      ? srcMesh.material
      : srcMesh.material
        ? [srcMesh.material]
        : [];
    const matNames = matsArr.map((m) => m?.name || '');

    if (!spec.filter(mName, nName, matNames)) return;

    const geom = srcMesh.geometry.clone();
    const posAttr = geom.getAttribute('position');
    if (!posAttr) return;
    const normAttr = geom.getAttribute('normal');
    const skinned = (srcMesh as THREE.SkinnedMesh).isSkinnedMesh
      ? (srcMesh as THREE.SkinnedMesh)
      : null;

    if (!spec.rawLocal) {
      worldNormalMat.getNormalMatrix(srcMesh.matrixWorld);
    }

    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      if (!spec.rawLocal) {
        if (skinned && skinned.skeleton) {
          skinned.applyBoneTransform(i, v);
        }
        v.applyMatrix4(srcMesh.matrixWorld);
      }
      v.add(offsetVec);
      v.multiplyScalar(spec.scale);
      v.applyMatrix4(rotMat);
      posAttr.setXYZ(i, v.x, v.y, v.z);

      if (normAttr) {
        nVec.fromBufferAttribute(normAttr, i);
        if (!spec.rawLocal) {
          nVec.applyMatrix3(worldNormalMat);
        }
        nVec.applyQuaternion(rotQuat).normalize();
        normAttr.setXYZ(i, nVec.x, nVec.y, nVec.z);
      }
    }

    posAttr.needsUpdate = true;
    if (normAttr) normAttr.needsUpdate = true;
    geom.deleteAttribute('skinIndex');
    geom.deleteAttribute('skinWeight');
    geom.deleteAttribute('tangent');
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    const sanitizedMats = matsArr.map((mat) => {
      const cloned = mat.clone() as THREE.MeshStandardMaterial;
      if (cloned.map) {
        cloned.map.colorSpace = THREE.SRGBColorSpace;
        cloned.map.needsUpdate = true;
        if (cloned.color) {
          cloned.color.setHex(0xffffff);
        }
      }
      if (
        (cloned.name || '').toLowerCase().includes('lens') &&
        !cloned.map
      ) {
        cloned.transparent = true;
        cloned.opacity = 0.72;
        cloned.roughness = 0.12;
        cloned.metalness = 0.25;
      }
      cloned.needsUpdate = true;
      return cloned;
    });

    const finalMaterial =
      sanitizedMats.length === 1 ? sanitizedMats[0] : sanitizedMats;

    const staticMesh = new THREE.Mesh(geom, finalMaterial);
    staticMesh.castShadow = false;
    staticMesh.receiveShadow = false;
    staticMesh.frustumCulled = false;
    template.add(staticMesh);
  });

  calibrateKinemationMaterialScene(template, false);
  return template;
}

function populateMountWithRealGlb(
  mount: THREE.Group,
  weaponId: WeaponId
): boolean {
  const tpl = glbWeaponTemplates.get(weaponId);
  if (!tpl || tpl.children.length === 0) return false;

  while (mount.children.length > 0) {
    mount.remove(mount.children[0]);
  }
  const instance = tpl.clone();
  mount.add(instance);
  const desiredSkin = mount.userData?.desiredSkinId as string | undefined;
  if (desiredSkin && desiredSkin !== 'default') {
    applyWeaponSkinToObject3D(mount, weaponId, desiredSkin);
  }
  return true;
}

function createGlbLoader(): GLTFLoader {
  const loader = createGameGltfLoader();
  loader.register((parser) => ({
    name: 'KHR_materials_pbrSpecularGlossiness',
    extendMaterialParams: async (
      materialIndex: number,
      materialParams: Record<string, unknown>
    ) => {
      const matDef = parser.json.materials?.[materialIndex];
      const sg = matDef?.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (!sg) return;
      materialParams.color = new THREE.Color(1, 1, 1);
      materialParams.roughness = 0.42;
      materialParams.metalness = 0.68;
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
  return loader;
}

export function ensureSharedWeaponProps(): void {
  // No legacy blocky geometries needed; all non-GLB weapons use sculpted PBR geometry.
}

export function preloadRealBotWeaponGlbs(): Promise<void> {
  if (preloadAllPromise) return preloadAllPromise;

  const loader = createGlbLoader();
  const perSpecPromises: Array<Promise<void>> = [];

  for (const spec of WEAPON_GLB_SPECS) {
    const p = new Promise<THREE.Group | null>((resolve) => {
      loader.load(
        resolveAssetUrl(spec.url),
        (gltf) => {
          const previewTpl = buildBakedStaticGroup(
            gltf.scene,
            gltf.animations,
            spec,
            0
          );
          if (previewTpl.children.length > 0) {
            const tpl = new THREE.Group();
            if (spec.rotX !== 0) {
              const tilted = previewTpl.clone();
              tilted.rotation.x = spec.rotX;
              tpl.add(tilted);
            } else {
              tpl.add(previewTpl.clone());
            }
            glbLevelPreviewTemplates.set(spec.id, previewTpl);
            glbWeaponTemplates.set(spec.id, tpl);
            for (let i = pendingWeaponMounts.length - 1; i >= 0; i--) {
              const item = pendingWeaponMounts[i];
              if (item.weaponId === spec.id) {
                if (populateMountWithRealGlb(item.group, item.weaponId)) {
                  pendingWeaponMounts.splice(i, 1);
                }
              }
            }
            resolve(tpl);
          } else {
            resolve(null);
          }
        },
        undefined,
        () => resolve(null)
      );
    });
    glbWeaponPromises.set(spec.id, p);
    perSpecPromises.push(p.then(() => undefined));
  }

  // Preload Aemondir Bucky Legion 3D skin override for SHOTGUN_12
  const aemondirSpec: RealGlbWeaponSpec = {
    id: 'SHOTGUN_12',
    url: '/models/weapons/shotgun_aemondir_lv1.glb',
    rawLocal: true,
    filter: (m, n, mats) => !isExcludedMesh(m, n, mats),
    offset: [0, 0.03, 0.02],
    scale: 1.0,
    rotX: 0.19,
    rotY: 0,
  };
  const aemondirPromise = new Promise<void>((resolve) => {
    loader.load(
      resolveAssetUrl(aemondirSpec.url),
      (gltf) => {
        try {
          const previewTpl = buildBakedStaticGroup(
            gltf.scene,
            gltf.animations,
            aemondirSpec,
            0
          );
          if (previewTpl.children.length > 0) {
            previewTpl.traverse((c) => {
              const m = c as THREE.Mesh;
              if (m.isMesh && m.geometry?.getAttribute('color')) {
                const mats = Array.isArray(m.material) ? m.material : [m.material];
                for (const mt of mats) {
                  const std = mt as THREE.MeshStandardMaterial;
                  if (std && (std.name || '') !== 'Legion_Emissive_MI') {
                    std.vertexColors = true;
                    std.needsUpdate = true;
                  }
                }
              }
            });
            const tilted = new THREE.Group();
            const clone = previewTpl.clone();
            clone.rotation.x = aemondirSpec.rotX;
            tilted.add(clone);
            glbSkinPreviewTemplates.set('shotgun_aemondir_legion', previewTpl);
            glbSkinWorldTemplates.set('shotgun_aemondir_legion', tilted);
          }
        } catch {
          // Fallback to base shotgun
        }
        resolve();
      },
      undefined,
      () => resolve()
    );
  });
  perSpecPromises.push(aemondirPromise);

  // Spare GLBs → inventory preview only (never bot mounts / 1P).
  for (const spec of INVENTORY_PREVIEW_OVERRIDE_SPECS) {
    const p = new Promise<void>((resolve) => {
      loader.load(
        resolveAssetUrl(spec.url),
        (gltf) => {
          try {
            const previewTpl = buildBakedStaticGroup(
              gltf.scene,
              gltf.animations,
              spec,
              0
            );
            // Only replace inventory preview when bake produced usable meshes.
            if (previewTpl.children.length >= 2) {
              glbLevelPreviewTemplates.set(spec.id, previewTpl);
            }
          } catch {
            // Keep existing gameplay preview template on failure.
          }
          resolve();
        },
        undefined,
        () => resolve()
      );
    });
    perSpecPromises.push(p);
  }

  preloadAllPromise = Promise.all(perSpecPromises).then(() => undefined);
  return preloadAllPromise;
}

const glbSkinPreviewTemplates = new Map<string, THREE.Group>();
const glbSkinWorldTemplates = new Map<string, THREE.Group>();

/**
 * Returns a fresh horizontally-leveled 3D model instance of ANY WeaponId
 * (real GLB or sculpted PBR firearm) suitable for thumbnail/showcase rendering.
 */
export async function buildLevel3DWeaponPreviewGroup(
  weaponId: WeaponId,
  skinId?: string
): Promise<THREE.Group | null> {
  if (isSculptedWeaponId(weaponId)) {
    return createSculptedThirdPersonWeaponMesh(weaponId, true).group;
  }
  await preloadRealBotWeaponGlbs();
  const p = glbWeaponPromises.get(weaponId);
  if (p) await p;
  if (skinId && glbSkinPreviewTemplates.has(skinId)) {
    return glbSkinPreviewTemplates.get(skinId)!.clone();
  }
  const tpl = glbLevelPreviewTemplates.get(weaponId);
  if (!tpl || tpl.children.length === 0) return null;
  const cloned = tpl.clone();
  if (skinId && skinId !== 'default') {
    applyWeaponSkinToObject3D(cloned, weaponId, skinId);
  }
  return cloned;
}

export function createBotThirdPersonWeaponMesh(
  weaponId: WeaponId | undefined,
  _isAlly: boolean,
  weaponSkinId?: string
): THREE.Group {
  preloadRealBotWeaponGlbs();

  const chosen: WeaponId = weaponId || 'AK47_RIFLE';
  const skinId = weaponSkinId || 'default';
  const group = new THREE.Group();
  group.name = 'BotWorldWeapon';
  group.userData.desiredSkinWeaponId = chosen;
  group.userData.desiredSkinId = skinId;

  if (skinId && glbSkinWorldTemplates.has(skinId)) {
    group.add(glbSkinWorldTemplates.get(skinId)!.clone());
    return group;
  }

  if (isSculptedWeaponId(chosen)) {
    const sculpted = createSculptedThirdPersonWeaponMesh(chosen, false);
    group.add(sculpted.group);
    if (skinId !== 'default') {
      applyWeaponSkinToObject3D(group, chosen, skinId);
    }
    return group;
  }

  if (populateMountWithRealGlb(group, chosen)) {
    return group;
  }

  // Enquanto o .glb termina o carregamento assíncrono (~20-60ms locais), registra para substituição imediata sem exibir cubos provisórios.
  pendingWeaponMounts.push({ group, weaponId: chosen });
  return group;
}

function getOrResolveFingerBones(
  rHandBone: THREE.Object3D,
  lHandBone: THREE.Object3D
): HandFingerCache {
  const existing = rHandBone.userData?.fingerGripCache as
    | HandFingerCache
    | undefined;
  if (existing) return existing;

  const rMiddle1 =
    rHandBone.getObjectByName('mixamorigRightHandMiddle1') || rHandBone;
  const rThumb2 =
    rHandBone.getObjectByName('mixamorigRightHandThumb2') || rMiddle1;
  const lIndex2 =
    lHandBone.getObjectByName('mixamorigLeftHandIndex2') ||
    lHandBone.getObjectByName('mixamorigLeftHandIndex1') ||
    lHandBone;
  const lMiddle2 =
    lHandBone.getObjectByName('mixamorigLeftHandMiddle2') ||
    lHandBone.getObjectByName('mixamorigLeftHandMiddle1') ||
    lHandBone;
  const lThumb2 =
    lHandBone.getObjectByName('mixamorigLeftHandThumb2') || lMiddle2;

  const cache: HandFingerCache = {
    rMiddle1,
    rThumb2,
    lIndex2,
    lMiddle2,
    lThumb2,
  };
  rHandBone.userData = rHandBone.userData || {};
  rHandBone.userData.fingerGripCache = cache;
  return cache;
}

/**
 * Alinha o modelo 3D da arma diretamente entre a cavidade da palma/dedos da mão direita
 * (Pistol Grip) e a cavidade dos dedos/polegar da mão esquerda (Guarda-Mão frontal).
 */
export function alignWeaponPropToMixamoHands(
  weaponProp: THREE.Object3D,
  parentGroup: THREE.Object3D,
  rHandBone: THREE.Object3D | null,
  lHandBone: THREE.Object3D | null,
  kickBack = 0,
  fallbackY = 1.2
): void {
  if (rHandBone && lHandBone) {
    const fingers = getOrResolveFingerBones(rHandBone, lHandBone);

    fingers.rMiddle1.getWorldPosition(_rGripWorld);
    fingers.rThumb2.getWorldPosition(_rThumbWorld);
    _rGripWorld.lerp(_rThumbWorld, 0.35);

    fingers.lIndex2.getWorldPosition(_lIdxWorld);
    fingers.lMiddle2.getWorldPosition(_lMidWorld);
    fingers.lThumb2.getWorldPosition(_lThumbWorld);
    _lCradleWorld
      .copy(_lIdxWorld)
      .add(_lMidWorld)
      .add(_lThumbWorld)
      .multiplyScalar(1 / 3);

    _rGripLocal.copy(_rGripWorld);
    _lCradleLocal.copy(_lCradleWorld);
    parentGroup.worldToLocal(_rGripLocal);
    parentGroup.worldToLocal(_lCradleLocal);

    _handDir.subVectors(_lCradleLocal, _rGripLocal);
    if (_handDir.lengthSq() > 0.001) {
      _handDir.normalize();
      weaponProp.position.copy(_rGripLocal);
      if (kickBack !== 0) {
        weaponProp.position.addScaledVector(_handDir, -kickBack);
      }

      _handDir.subVectors(_lCradleWorld, _rGripWorld);
      _lookTargetWorld
        .copy(_lCradleWorld)
        .addScaledVector(_handDir, 2.0);
      weaponProp.lookAt(_lookTargetWorld);
      return;
    }
  }

  weaponProp.position.set(-0.18, fallbackY, 0.14);
  weaponProp.rotation.set(0.02, 0.04, 0);
}
