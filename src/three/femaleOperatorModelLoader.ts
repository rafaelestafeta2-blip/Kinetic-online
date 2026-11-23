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
  lastUsedMs: number;
}

const silhouetteCache = new Map<string, CachedSilhouetteEntry>();
const silhouetteInFlight = new Map<string, Promise<CachedSilhouetteEntry | null>>();

const camoCache = new Map<string, CachedCamoPack>();
const camoInFlight = new Map<string, Promise<CachedCamoPack>>();

const sharedBaseTexCache = new Map<string, THREE.Texture>();
const sharedBaseTexInFlight = new Map<string, Promise<THREE.Texture | null>>();

const texLoader = new THREE.TextureLoader();

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
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('head_b.webp') || null,
      roughness: 0.64,
      metalness: 0.02,
      envMapIntensity: 0.36,
    });
  }

  if (name === 'MFS_ARMS') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('arms_b.webp') || null,
      roughness: 0.64,
      metalness: 0.02,
      envMapIntensity: 0.36,
    });
  }

  if (name === 'MFS_EYE') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('eye_b.webp') || null,
      roughness: 0.14,
      metalness: 0.04,
      envMapIntensity: 1.05,
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
      roughness: 0.56,
      metalness: 0.04,
      envMapIntensity: 0.42,
    });
    mat.userData.preserveFemaleMat = true;
    return mat;
  }

  if (name === 'MFS_GLASS') {
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      color: 0x0b1626,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      roughness: 0.08,
      metalness: 0.9,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    });
    mat.userData.preserveFemaleMat = true;
    return mat;
  }

  if (name === 'MFS_SHIRT') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.shirt,
      roughness: 0.84,
      metalness: 0.03,
      envMapIntensity: 0.38,
    });
  }

  if (name === 'MFS_PANTS') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.pants,
      roughness: 0.84,
      metalness: 0.03,
      envMapIntensity: 0.38,
    });
  }

  if (name === 'MFS_LEGGINGS') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.leggings,
      roughness: 0.68,
      metalness: 0.08,
      envMapIntensity: 0.48,
    });
  }

  if (name === 'MFS_UNLOADING') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.unloading,
      roughness: 0.66,
      metalness: 0.1,
      envMapIntensity: 0.52,
    });
  }

  if (name === 'MFS_HEADGEAR') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.headgear,
      roughness: 0.6,
      metalness: 0.14,
      envMapIntensity: 0.55,
    });
  }

  if (name === 'MFS_POUCHES') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.pouches,
      roughness: 0.68,
      metalness: 0.08,
      envMapIntensity: 0.48,
    });
  }

  if (name === 'MFS_GLOVE') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get(`glove_${cfg.gloveVariant}.webp`) || null,
      roughness: 0.66,
      metalness: 0.08,
      envMapIntensity: 0.48,
    });
  }

  if (name === 'MFS_PATCHES') {
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('patches_b.webp') || null,
      roughness: 0.7,
      metalness: 0.06,
      envMapIntensity: 0.45,
    });
  }

  return new THREE.MeshStandardMaterial({
    ...baseParams,
    map: camoPack.textures.unloading || camoPack.textures.shirt,
    roughness: 0.72,
    metalness: 0.08,
    envMapIntensity: 0.45,
  });
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
