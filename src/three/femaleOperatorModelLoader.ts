import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  FemaleOperatorModelConfig,
  OperatorDefinition,
} from '../progression/operatorSkinsSystem';
import { resolveAssetUrl } from '../utils/assetUrl';
import {
  BotAnimState,
  BotClipMap,
  retargetClipsRotationOnly,
  retargetFbxClipToTargetRig,
} from './botCharacterClips';
import {
  CharacterAvatarKind,
  getProRifleAnimationRigSource,
  preloadProRifleBotCharacter,
} from './botCharacterSystem';
import {
  createGameGltfLoader,
  disposeGameGltfLoader,
  ensureMeshoptDecoder,
} from './gltfLoaderFactory';
import { applyAnimPackOverlayToBotClips } from './mixamoAnimPackLoader';
import {
  applyOperatorRimLight,
  DerivedPbrDetailMaps,
  deriveDetailMapsFromAlbedo,
  OperatorSurfaceProfile,
} from './operatorPbrEnhancer';

const FEMALE_TEX_BASE = '/models/characters/female_ops/tex';
const MAX_CACHED_SILHOUETTES = 4;
const MAX_CACHED_CAMOS = 6;

interface CachedSilhouetteEntry {
  glbPath: string;
  templateRoot: THREE.Group;
  clips: BotClipMap;
  lastUsedMs: number;
}

interface CachedCamoPack {
  camoCode: string;
  textures: {
    shirt: THREE.Texture | null;
    pants: THREE.Texture | null;
    leggings: THREE.Texture | null;
    unloading: THREE.Texture | null;
    headgear: THREE.Texture | null;
    pouches: THREE.Texture | null;
  };
  details: {
    shirt: DerivedPbrDetailMaps | null;
    pants: DerivedPbrDetailMaps | null;
    leggings: DerivedPbrDetailMaps | null;
    unloading: DerivedPbrDetailMaps | null;
    headgear: DerivedPbrDetailMaps | null;
    pouches: DerivedPbrDetailMaps | null;
  };
  lastUsedMs: number;
}

const silhouetteCache = new Map<string, CachedSilhouetteEntry>();
const silhouetteInFlight = new Map<string, Promise<CachedSilhouetteEntry | null>>();

const camoCache = new Map<string, CachedCamoPack>();
const camoInFlight = new Map<string, Promise<CachedCamoPack>>();

const sharedBaseTexCache = new Map<string, THREE.Texture>();
const sharedBaseDetailCache = new Map<string, DerivedPbrDetailMaps>();
const sharedBaseTexInFlight = new Map<string, Promise<THREE.Texture | null>>();

const texLoader = new THREE.TextureLoader();

const BASE_TEX_DETAIL_PROFILE: Record<string, OperatorSurfaceProfile> = {
  'head_b.webp': 'skin',
  'arms_b.webp': 'skin',
  'patches_b.webp': 'fabric',
  'glove_a.webp': 'leather',
  'glove_b.webp': 'leather',
  'glove_c.webp': 'leather',
  'glove_d.webp': 'leather',
};

function loadSingleWebpTexture(relativePath: string): Promise<THREE.Texture | null> {
  const url = resolveAssetUrl(relativePath);
  return new Promise((resolve) => {
    texLoader.load(
      url,
      (tex) => {
        // glTF 2.0 / UE5 UVs use top-left origin (flipY = false)
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function getSharedBaseTexture(fileName: string): Promise<THREE.Texture | null> {
  const cached = sharedBaseTexCache.get(fileName);
  if (cached) return Promise.resolve(cached);
  const inflight = sharedBaseTexInFlight.get(fileName);
  if (inflight) return inflight;

  const p = loadSingleWebpTexture(`${FEMALE_TEX_BASE}/${fileName}`).then((tex) => {
    sharedBaseTexInFlight.delete(fileName);
    if (tex) {
      sharedBaseTexCache.set(fileName, tex);
      const profile = BASE_TEX_DETAIL_PROFILE[fileName];
      if (profile && !sharedBaseDetailCache.has(fileName)) {
        const derived = deriveDetailMapsFromAlbedo(tex, profile, 512);
        if (derived) sharedBaseDetailCache.set(fileName, derived);
      }
    }
    return tex;
  });
  sharedBaseTexInFlight.set(fileName, p);
  return p;
}

async function ensureSharedBaseTextures(gloveVariant: 'a' | 'b' | 'c' | 'd'): Promise<void> {
  await Promise.all([
    getSharedBaseTexture('head_b.webp'),
    getSharedBaseTexture('arms_b.webp'),
    getSharedBaseTexture('eye_b.webp'),
    getSharedBaseTexture('eyelashes_rgba.webp'),
    getSharedBaseTexture('hair_rgba.webp'),
    getSharedBaseTexture('hairscalp_rgba.webp'),
    getSharedBaseTexture('patches_b.webp'),
    getSharedBaseTexture(`glove_${gloveVariant}.webp`),
  ]);
}

function evictCamoCacheIfNeeded(keepCode: string): void {
  if (camoCache.size <= MAX_CACHED_CAMOS) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [k, entry] of camoCache.entries()) {
    if (k === keepCode) continue;
    if (entry.lastUsedMs < oldestTime) {
      oldestTime = entry.lastUsedMs;
      oldestKey = k;
    }
  }
  if (oldestKey) {
    const victim = camoCache.get(oldestKey);
    camoCache.delete(oldestKey);
    if (victim) {
      victim.textures.shirt?.dispose();
      victim.textures.pants?.dispose();
      victim.textures.leggings?.dispose();
      victim.textures.unloading?.dispose();
      victim.textures.headgear?.dispose();
      victim.textures.pouches?.dispose();
      const detailSlots = Object.values(victim.details);
      for (let i = 0; i < detailSlots.length; i++) {
        const d = detailSlots[i];
        d?.normalMap.dispose();
        d?.roughnessMap.dispose();
      }
    }
  }
}

async function ensureCamoPack(camoCode: string): Promise<CachedCamoPack> {
  const cached = camoCache.get(camoCode);
  if (cached) {
    cached.lastUsedMs = performance.now();
    return cached;
  }
  const inflight = camoInFlight.get(camoCode);
  if (inflight) return inflight;

  const p = (async () => {
    const [shirt, pants, leggings, unloading, headgear, pouches] = await Promise.all([
      loadSingleWebpTexture(`${FEMALE_TEX_BASE}/camo_${camoCode}_shirt.webp`),
      loadSingleWebpTexture(`${FEMALE_TEX_BASE}/camo_${camoCode}_pants.webp`),
      loadSingleWebpTexture(`${FEMALE_TEX_BASE}/camo_${camoCode}_leggings.webp`),
      loadSingleWebpTexture(`${FEMALE_TEX_BASE}/camo_${camoCode}_unloading.webp`),
      loadSingleWebpTexture(`${FEMALE_TEX_BASE}/camo_${camoCode}_headgear.webp`),
      loadSingleWebpTexture(`${FEMALE_TEX_BASE}/camo_${camoCode}_pouches.webp`),
    ]);

    const pack: CachedCamoPack = {
      camoCode,
      textures: { shirt, pants, leggings, unloading, headgear, pouches },
      details: {
        shirt: deriveDetailMapsFromAlbedo(shirt, 'fabric', 512),
        pants: deriveDetailMapsFromAlbedo(pants, 'fabric', 512),
        leggings: deriveDetailMapsFromAlbedo(leggings, 'leather', 512),
        unloading: deriveDetailMapsFromAlbedo(unloading, 'armor', 512),
        headgear: deriveDetailMapsFromAlbedo(headgear, 'armor', 512),
        pouches: deriveDetailMapsFromAlbedo(pouches, 'fabric', 512),
      },
      lastUsedMs: performance.now(),
    };
    camoCache.set(camoCode, pack);
    camoInFlight.delete(camoCode);
    evictCamoCacheIfNeeded(camoCode);
    return pack;
  })();

  camoInFlight.set(camoCode, p);
  return p;
}

function disposeObjectSubtreeGeometries(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      mats[i]?.dispose();
    }
  });
}

function evictSilhouetteCacheIfNeeded(keepPath: string): void {
  if (silhouetteCache.size <= MAX_CACHED_SILHOUETTES) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [k, entry] of silhouetteCache.entries()) {
    if (k === keepPath) continue;
    if (entry.lastUsedMs < oldestTime) {
      oldestTime = entry.lastUsedMs;
      oldestKey = k;
    }
  }
  if (oldestKey) {
    const victim = silhouetteCache.get(oldestKey);
    silhouetteCache.delete(oldestKey);
    if (victim) {
      disposeObjectSubtreeGeometries(victim.templateRoot);
    }
  }
}

function buildRetargetedFemaleClips(
  femaleRoot: THREE.Group,
  sourceRoot: THREE.Group,
  sourceClips: BotClipMap
): BotClipMap {
  const retargeted = {} as BotClipMap;
  const states = Object.keys(sourceClips) as BotAnimState[];
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const clip = sourceClips[state];
    retargeted[state] = retargetFbxClipToTargetRig(
      clip,
      femaleRoot,
      sourceRoot,
      state
    );
  }
  const withOverlay = applyAnimPackOverlayToBotClips(retargeted, {
    preserveNativeLocomotion: true,
    adaptClip: (c, name) =>
      retargetFbxClipToTargetRig(c, femaleRoot, sourceRoot, name),
  });
  return retargetClipsRotationOnly(withOverlay);
}

async function ensureSilhouetteLoaded(
  glbPath: string
): Promise<CachedSilhouetteEntry | null> {
  const cached = silhouetteCache.get(glbPath);
  if (cached) {
    cached.lastUsedMs = performance.now();
    return cached;
  }
  const inflight = silhouetteInFlight.get(glbPath);
  if (inflight) return inflight;

  const p = (async () => {
    try {
      await Promise.all([ensureMeshoptDecoder(), preloadProRifleBotCharacter()]);
      const rigSrc = getProRifleAnimationRigSource();
      if (!rigSrc) return null;

      const loader = createGameGltfLoader();
      const url = resolveAssetUrl(`${glbPath}?v=2`);
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      }).finally(() => {
        disposeGameGltfLoader(loader);
      });

      const root = gltf.scene;
      root.updateMatrixWorld(true);
      root.traverse((child) => {
        if (child.name && child.name.startsWith('mixamorig')) {
          child.name = child.name.replace(':', '');
        }
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          m.frustumCulled = false;
        }
      });

      const clips = buildRetargetedFemaleClips(
        root,
        rigSrc.templateScene,
        rigSrc.sharedClips
      );

      const entry: CachedSilhouetteEntry = {
        glbPath,
        templateRoot: root,
        clips,
        lastUsedMs: performance.now(),
      };
      silhouetteCache.set(glbPath, entry);
      evictSilhouetteCacheIfNeeded(glbPath);
      return entry;
    } catch (err) {
      console.warn('[FemaleOperatorLoader] Failed to load silhouette:', glbPath, err);
      return null;
    } finally {
      silhouetteInFlight.delete(glbPath);
    }
  })();

  silhouetteInFlight.set(glbPath, p);
  return p;
}

function buildFemaleMaterialForSlot(
  slotName: string,
  cfg: FemaleOperatorModelConfig,
  camoPack: CachedCamoPack
): THREE.MeshStandardMaterial {
  const name = slotName.toUpperCase();
  const baseParams: THREE.MeshStandardMaterialParameters = {
    name: slotName,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.04,
    envMapIntensity: 0.45,
    side: THREE.FrontSide,
  };

  if (name === 'MFS_HEAD') {
    const det = sharedBaseDetailCache.get('head_b.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('head_b.webp') || null,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughnessMap: det?.roughnessMap || null,
      roughness: det ? 1.0 : 0.60,
      metalness: 0.01,
      envMapIntensity: 0.44,
    });
    applyOperatorRimLight(mat, { colorHex: 0xffe4d4, intensity: 0.10, power: 3.4 });
    return mat;
  }

  if (name === 'MFS_ARMS') {
    const det = sharedBaseDetailCache.get('arms_b.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('arms_b.webp') || null,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughnessMap: det?.roughnessMap || null,
      roughness: det ? 1.0 : 0.60,
      metalness: 0.01,
      envMapIntensity: 0.44,
    });
    applyOperatorRimLight(mat, { colorHex: 0xffe4d4, intensity: 0.10, power: 3.4 });
    return mat;
  }

  if (name === 'MFS_EYE') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('eye_b.webp') || null,
      roughness: 0.10,
      metalness: 0.04,
      envMapIntensity: 1.25,
    });
  }

  if (name === 'MFS_EYELASHES') {
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('eyelashes_rgba.webp') || null,
      color: 0x3b2c26,
      alphaTest: 0.35,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.72,
      metalness: 0.02,
      envMapIntensity: 0.32,
    });
    mat.userData.preserveFemaleMat = true;
    return mat;
  }

  if (name === 'MFS_HAIR' || name === 'MFS_HAIRSCALP') {
    const texKey = name === 'MFS_HAIR' ? 'hair_rgba.webp' : 'hairscalp_rgba.webp';
    // Hair albedo is already dark strands; lift tint toward white so strands remain rich and detailed
    const tint = new THREE.Color(cfg.hairColorHex ?? 0x4a3525).lerp(
      new THREE.Color(0xffffff),
      0.58
    );
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get(texKey) || null,
      color: tint,
      alphaTest: 0.34,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.50,
      metalness: 0.04,
      envMapIntensity: 0.52,
    });
    applyOperatorRimLight(mat, { colorHex: 0xfff0dd, intensity: 0.14, power: 2.9 });
    mat.userData.preserveFemaleMat = true;
    return mat;
  }

  if (name === 'MFS_GLASS') {
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      color: 0x0b1626,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      roughness: 0.06,
      metalness: 0.88,
      envMapIntensity: 1.55,
      side: THREE.DoubleSide,
    });
    mat.userData.preserveFemaleMat = true;
    return mat;
  }

  if (name === 'MFS_SHIRT') {
    const det = camoPack.details.shirt;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.shirt,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.78, 0.78),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.48,
      roughness: det ? 1.0 : 0.84,
      metalness: 0.03,
      envMapIntensity: 0.48,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.14, power: 3.2 });
    return mat;
  }

  if (name === 'MFS_PANTS') {
    const det = camoPack.details.pants;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.pants,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.78, 0.78),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.48,
      roughness: det ? 1.0 : 0.84,
      metalness: 0.03,
      envMapIntensity: 0.48,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.14, power: 3.2 });
    return mat;
  }

  if (name === 'MFS_LEGGINGS') {
    const det = camoPack.details.leggings;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.leggings,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.84, 0.84),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.52,
      roughness: det ? 1.0 : 0.66,
      metalness: 0.09,
      envMapIntensity: 0.62,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.16, power: 3.0 });
    return mat;
  }

  if (name === 'MFS_UNLOADING') {
    const det = camoPack.details.unloading;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.unloading,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.92, 0.92),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.58,
      roughness: det ? 1.0 : 0.62,
      metalness: 0.12,
      envMapIntensity: 0.68,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.18, power: 3.0 });
    return mat;
  }

  if (name === 'MFS_HEADGEAR') {
    const det = camoPack.details.headgear;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.headgear,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.90, 0.90),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.56,
      roughness: det ? 1.0 : 0.58,
      metalness: 0.16,
      envMapIntensity: 0.74,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.19, power: 2.9 });
    return mat;
  }

  if (name === 'MFS_POUCHES') {
    const det = camoPack.details.pouches;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.pouches,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.84, 0.84),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.55,
      roughness: det ? 1.0 : 0.68,
      metalness: 0.08,
      envMapIntensity: 0.58,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.16, power: 3.1 });
    return mat;
  }

  if (name === 'MFS_GLOVE') {
    const gloveKey = `glove_${cfg.gloveVariant}.webp`;
    const det = sharedBaseDetailCache.get(gloveKey) || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get(gloveKey) || null,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.86, 0.86),
      roughnessMap: det?.roughnessMap || null,
      aoMap: det?.roughnessMap || null,
      aoMapIntensity: 0.52,
      roughness: det ? 1.0 : 0.62,
      metalness: 0.08,
      envMapIntensity: 0.62,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.15, power: 3.1 });
    return mat;
  }

  if (name === 'MFS_PATCHES') {
    const det = sharedBaseDetailCache.get('patches_b.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('patches_b.webp') || null,
      normalMap: det?.normalMap || null,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: det?.roughnessMap || null,
      roughness: det ? 1.0 : 0.70,
      metalness: 0.06,
      envMapIntensity: 0.52,
    });
    return mat;
  }

  const fallbackDet = camoPack.details.unloading || camoPack.details.shirt;
  const fallbackMat = new THREE.MeshStandardMaterial({
    ...baseParams,
    map: camoPack.textures.unloading || camoPack.textures.shirt,
    normalMap: fallbackDet?.normalMap || null,
    normalScale: new THREE.Vector2(0.82, 0.82),
    roughnessMap: fallbackDet?.roughnessMap || null,
    roughness: fallbackDet ? 1.0 : 0.70,
    metalness: 0.08,
    envMapIntensity: 0.58,
  });
  applyOperatorRimLight(fallbackMat, { colorHex: 0xd8ebff, intensity: 0.15, power: 3.1 });
  return fallbackMat;
}

function avatarKindForClass(opDef: OperatorDefinition): CharacterAvatarKind {
  switch (opDef.preferredClass) {
    case 'FRANCO_ATIRADOR':
      return 'SNIPER';
    case 'ENGENHEIRO':
      return 'VANGUARD_ENGENHEIRO';
    case 'MEDICO':
      return 'VANGUARD_MEDICO';
    default:
      return 'VANGUARD_FUZILEIRO';
  }
}

function instantiateFemaleClone(
  entry: CachedSilhouetteEntry,
  camoPack: CachedCamoPack,
  opDef: OperatorDefinition,
  isSoftwareGl: boolean
): {
  modelRoot: THREE.Object3D;
  clips: BotClipMap;
  isSniper: boolean;
  avatarKind: CharacterAvatarKind;
} {
  const cfg = opDef.customModelConfig!;
  entry.lastUsedMs = performance.now();
  camoPack.lastUsedMs = performance.now();

  const cloned = SkeletonUtils.clone(entry.templateRoot);
  cloned.scale.setScalar(1.0);
  cloned.position.set(0, 0, 0);
  cloned.rotation.set(0, 0, 0);
  cloned.userData = {
    ...(cloned.userData || {}),
    femaleOperatorId: opDef.id,
    preserveCustomPbrMaterials: true,
  };

  const slotMatMap = new Map<string, THREE.MeshStandardMaterial>();
  const getMat = (slotName: string): THREE.MeshStandardMaterial => {
    const key = slotName || 'MFS_UNLOADING';
    let mat = slotMatMap.get(key);
    if (!mat) {
      mat = buildFemaleMaterialForSlot(key, cfg, camoPack);
      slotMatMap.set(key, mat);
    }
    return mat;
  };

  cloned.traverse((child) => {
    if (child.name && child.name.startsWith('mixamorig')) {
      child.name = child.name.replace(':', '');
    }
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      const sk = child as THREE.SkinnedMesh;
      sk.frustumCulled = false;
      sk.skeleton?.bones.forEach((b) => {
        b.matrixAutoUpdate = true;
      });
    }
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      m.castShadow = !isSoftwareGl;
      m.receiveShadow = false;
      m.frustumCulled = false;
      if (Array.isArray(m.material)) {
        m.material = m.material.map((raw) => getMat(raw?.name || 'MFS_UNLOADING'));
      } else {
        m.material = getMat((m.material as THREE.Material | null)?.name || 'MFS_UNLOADING');
      }
    }
  });

  return {
    modelRoot: cloned,
    clips: entry.clips,
    isSniper: opDef.preferredClass === 'FRANCO_ATIRADOR',
    avatarKind: avatarKindForClass(opDef),
  };
}

export async function preloadFemaleOperatorAvatar(
  opDef: OperatorDefinition
): Promise<boolean> {
  const cfg = opDef.customModelConfig;
  if (!cfg) return false;
  const [silhouette] = await Promise.all([
    ensureSilhouetteLoaded(cfg.glbPath),
    ensureCamoPack(cfg.camoCode),
    ensureSharedBaseTextures(cfg.gloveVariant),
  ]);
  return Boolean(silhouette);
}

export function cloneFemaleOperatorAvatarSync(
  opDef: OperatorDefinition,
  isSoftwareGl: boolean
): {
  modelRoot: THREE.Object3D;
  clips: BotClipMap;
  isSniper: boolean;
  avatarKind: CharacterAvatarKind;
} | null {
  const cfg = opDef.customModelConfig;
  if (!cfg) return null;
  const entry = silhouetteCache.get(cfg.glbPath);
  const camoPack = camoCache.get(cfg.camoCode);
  const baseReady =
    sharedBaseTexCache.has('head_b.webp') &&
    sharedBaseTexCache.has(`glove_${cfg.gloveVariant}.webp`);
  if (!entry || !camoPack || !baseReady) {
    return null;
  }
  return instantiateFemaleClone(entry, camoPack, opDef, isSoftwareGl);
}

export async function loadAndCloneFemaleOperatorAvatar(
  opDef: OperatorDefinition,
  isSoftwareGl: boolean
): Promise<{
  modelRoot: THREE.Object3D;
  clips: BotClipMap;
  isSniper: boolean;
  avatarKind: CharacterAvatarKind;
} | null> {
  const cfg = opDef.customModelConfig;
  if (!cfg) return null;
  const [entry, camoPack] = await Promise.all([
    ensureSilhouetteLoaded(cfg.glbPath),
    ensureCamoPack(cfg.camoCode),
    ensureSharedBaseTextures(cfg.gloveVariant),
  ]);
  if (!entry) return null;
  return instantiateFemaleClone(entry, camoPack, opDef, isSoftwareGl);
}
