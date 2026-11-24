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
import { applyOperatorRimLight } from './operatorPbrEnhancer';

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

function isLinearDataTextureName(fileName: string): boolean {
  return (
    fileName.endsWith('_n.webp') ||
    fileName.endsWith('_orm.webp') ||
    fileName.endsWith('_ao.webp')
  );
}

function loadSingleWebpTexture(
  relativePath: string,
  isLinear = false
): Promise<THREE.Texture | null> {
  const url = resolveAssetUrl(relativePath);
  return new Promise((resolve) => {
    texLoader.load(
      url,
      (tex) => {
        // glTF 2.0 / UE4 UVs use top-left origin (flipY = false)
        tex.flipY = false;
        tex.colorSpace = isLinear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        tex.channel = 0;
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

  const isLinear = isLinearDataTextureName(fileName);
  const p = loadSingleWebpTexture(`${FEMALE_TEX_BASE}/${fileName}`, isLinear).then(
    (tex) => {
      sharedBaseTexInFlight.delete(fileName);
      if (tex) {
        sharedBaseTexCache.set(fileName, tex);
      }
      return tex;
    }
  );
  sharedBaseTexInFlight.set(fileName, p);
  return p;
}

const SHARED_STUDIO_PBR_MAPS = [
  'head_b.webp',
  'head_n.webp',
  'head_orm.webp',
  'arms_b.webp',
  'arms_n.webp',
  'arms_orm.webp',
  'eye_b.webp',
  'eye_n.webp',
  'eye_orm.webp',
  'eyelashes_rgba.webp',
  'hair_rgba.webp',
  'hair_n.webp',
  'hair_ao.webp',
  'hairscalp_rgba.webp',
  'hairscalp_n.webp',
  'hairscalp_ao.webp',
  'patches_b.webp',
  'patches_n.webp',
  'patches_orm.webp',
  'glove_n.webp',
  'glove_orm.webp',
  'shirt_n.webp',
  'shirt_orm.webp',
  'pants_n.webp',
  'pants_orm.webp',
  'leggings_n.webp',
  'leggings_orm.webp',
  'unloading_n.webp',
  'unloading_orm.webp',
  'headgear_n.webp',
  'headgear_orm.webp',
  'headgear_e.webp',
  'pouches_n.webp',
  'pouches_orm.webp',
] as const;

async function ensureSharedBaseTextures(gloveVariant: 'a' | 'b' | 'c' | 'd'): Promise<void> {
  await Promise.all([
    ...SHARED_STUDIO_PBR_MAPS.map((file) => getSharedBaseTexture(file)),
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
    const orm = sharedBaseTexCache.get('head_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('head_b.webp') || null,
      normalMap: sharedBaseTexCache.get('head_n.webp') || null,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.55,
      metalnessMap: orm,
      roughness: orm ? 0.92 : 0.60,
      metalness: orm ? 1.0 : 0.01,
      envMapIntensity: 0.46,
    });
    applyOperatorRimLight(mat, { colorHex: 0xffe4d4, intensity: 0.10, power: 3.4 });
    return mat;
  }

  if (name === 'MFS_ARMS') {
    const orm = sharedBaseTexCache.get('arms_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('arms_b.webp') || null,
      normalMap: sharedBaseTexCache.get('arms_n.webp') || null,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.55,
      metalnessMap: orm,
      roughness: orm ? 0.92 : 0.60,
      metalness: orm ? 1.0 : 0.01,
      envMapIntensity: 0.46,
    });
    applyOperatorRimLight(mat, { colorHex: 0xffe4d4, intensity: 0.10, power: 3.4 });
    return mat;
  }

  if (name === 'MFS_EYE') {
    const orm = sharedBaseTexCache.get('eye_orm.webp') || null;
    return new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('eye_b.webp') || null,
      normalMap: sharedBaseTexCache.get('eye_n.webp') || null,
      normalScale: new THREE.Vector2(0.45, 0.45),
      aoMap: orm,
      aoMapIntensity: 0.40,
      roughness: 0.08,
      metalness: 0.04,
      envMapIntensity: 1.30,
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
    const isMainHair = name === 'MFS_HAIR';
    const texKey = isMainHair ? 'hair_rgba.webp' : 'hairscalp_rgba.webp';
    const normKey = isMainHair ? 'hair_n.webp' : 'hairscalp_n.webp';
    const aoKey = isMainHair ? 'hair_ao.webp' : 'hairscalp_ao.webp';
    // Hair albedo is already dark strands; lift tint toward white so strands remain rich and detailed
    const tint = new THREE.Color(cfg.hairColorHex ?? 0x4a3525).lerp(
      new THREE.Color(0xffffff),
      0.58
    );
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get(texKey) || null,
      normalMap: sharedBaseTexCache.get(normKey) || null,
      normalScale: new THREE.Vector2(0.75, 0.75),
      aoMap: sharedBaseTexCache.get(aoKey) || null,
      aoMapIntensity: 0.42,
      color: tint,
      alphaTest: 0.34,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 0.48,
      metalness: 0.04,
      envMapIntensity: 0.56,
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
    const orm = sharedBaseTexCache.get('shirt_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.shirt,
      normalMap: sharedBaseTexCache.get('shirt_n.webp') || null,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.72,
      metalnessMap: orm,
      roughness: orm ? 0.92 : 0.84,
      metalness: orm ? 1.0 : 0.03,
      envMapIntensity: 0.52,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.14, power: 3.2 });
    return mat;
  }

  if (name === 'MFS_PANTS') {
    const orm = sharedBaseTexCache.get('pants_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.pants,
      normalMap: sharedBaseTexCache.get('pants_n.webp') || null,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.72,
      metalnessMap: orm,
      roughness: orm ? 0.92 : 0.84,
      metalness: orm ? 1.0 : 0.03,
      envMapIntensity: 0.52,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.14, power: 3.2 });
    return mat;
  }

  if (name === 'MFS_LEGGINGS') {
    const orm = sharedBaseTexCache.get('leggings_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.leggings,
      normalMap: sharedBaseTexCache.get('leggings_n.webp') || null,
      normalScale: new THREE.Vector2(1.10, 1.10),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.75,
      metalnessMap: orm,
      roughness: orm ? 0.90 : 0.66,
      metalness: orm ? 1.0 : 0.09,
      envMapIntensity: 0.66,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.16, power: 3.0 });
    return mat;
  }

  if (name === 'MFS_UNLOADING') {
    const orm = sharedBaseTexCache.get('unloading_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.unloading,
      normalMap: sharedBaseTexCache.get('unloading_n.webp') || null,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.78,
      metalnessMap: orm,
      roughness: orm ? 0.90 : 0.62,
      metalness: orm ? 1.0 : 0.12,
      envMapIntensity: 0.72,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.18, power: 3.0 });
    return mat;
  }

  if (name === 'MFS_HEADGEAR') {
    const orm = sharedBaseTexCache.get('headgear_orm.webp') || null;
    const emissiveTex = sharedBaseTexCache.get('headgear_e.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.headgear,
      normalMap: sharedBaseTexCache.get('headgear_n.webp') || null,
      normalScale: new THREE.Vector2(1.12, 1.12),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.76,
      metalnessMap: orm,
      emissive: emissiveTex ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
      emissiveMap: emissiveTex,
      emissiveIntensity: emissiveTex ? 0.85 : 0.0,
      roughness: orm ? 0.90 : 0.58,
      metalness: orm ? 1.0 : 0.16,
      envMapIntensity: 0.78,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.19, power: 2.9 });
    return mat;
  }

  if (name === 'MFS_POUCHES') {
    const orm = sharedBaseTexCache.get('pouches_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: camoPack.textures.pouches,
      normalMap: sharedBaseTexCache.get('pouches_n.webp') || null,
      normalScale: new THREE.Vector2(1.10, 1.10),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.75,
      metalnessMap: orm,
      roughness: orm ? 0.90 : 0.68,
      metalness: orm ? 1.0 : 0.08,
      envMapIntensity: 0.62,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.16, power: 3.1 });
    return mat;
  }

  if (name === 'MFS_GLOVE') {
    const gloveKey = `glove_${cfg.gloveVariant}.webp`;
    const orm = sharedBaseTexCache.get('glove_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get(gloveKey) || null,
      normalMap: sharedBaseTexCache.get('glove_n.webp') || null,
      normalScale: new THREE.Vector2(1.08, 1.08),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.72,
      metalnessMap: orm,
      roughness: orm ? 0.90 : 0.62,
      metalness: orm ? 1.0 : 0.08,
      envMapIntensity: 0.65,
    });
    applyOperatorRimLight(mat, { colorHex: 0xd8ebff, intensity: 0.15, power: 3.1 });
    return mat;
  }

  if (name === 'MFS_PATCHES') {
    const orm = sharedBaseTexCache.get('patches_orm.webp') || null;
    const mat = new THREE.MeshStandardMaterial({
      ...baseParams,
      map: sharedBaseTexCache.get('patches_b.webp') || null,
      normalMap: sharedBaseTexCache.get('patches_n.webp') || null,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: orm,
      aoMap: orm,
      aoMapIntensity: 0.70,
      metalnessMap: orm,
      roughness: orm ? 0.92 : 0.70,
      metalness: orm ? 1.0 : 0.06,
      envMapIntensity: 0.56,
    });
    return mat;
  }

  const fallbackOrm = sharedBaseTexCache.get('unloading_orm.webp') || null;
  const fallbackMat = new THREE.MeshStandardMaterial({
    ...baseParams,
    map: camoPack.textures.unloading || camoPack.textures.shirt,
    normalMap: sharedBaseTexCache.get('unloading_n.webp') || null,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughnessMap: fallbackOrm,
    aoMap: fallbackOrm,
    aoMapIntensity: 0.72,
    metalnessMap: fallbackOrm,
    roughness: fallbackOrm ? 0.90 : 0.70,
    metalness: fallbackOrm ? 1.0 : 0.08,
    envMapIntensity: 0.62,
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
