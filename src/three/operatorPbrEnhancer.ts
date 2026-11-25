import * as THREE from 'three';

export type OperatorSurfaceProfile = 'fabric' | 'armor' | 'leather' | 'skin';

export interface DerivedPbrDetailMaps {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
}

export interface OperatorRimLightOptions {
  colorHex: number;
  intensity: number;
  power?: number;
}

export interface ShowcaseUpgradeOptions {
  isCustomFemale: boolean;
  avatarKind: string;
  isBlackthorn: boolean;
  isSoftwareGl: boolean;
  maxAnisotropy?: number;
}

let reusableScratchCanvas: HTMLCanvasElement | null = null;
let reusableScratchCtx: CanvasRenderingContext2D | null = null;

function getScratchContext(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!reusableScratchCanvas) {
    reusableScratchCanvas = document.createElement('canvas');
    reusableScratchCtx = reusableScratchCanvas.getContext('2d', {
      willReadFrequently: true,
    });
  }
  if (!reusableScratchCtx) return null;
  if (reusableScratchCanvas.width !== w) reusableScratchCanvas.width = w;
  if (reusableScratchCanvas.height !== h) reusableScratchCanvas.height = h;
  return reusableScratchCtx;
}

function nearestPow2Capped(dim: number, maxDim: number): number {
  const clamped = Math.max(64, Math.min(maxDim, dim));
  let p = 64;
  while (p * 2 <= clamped) p *= 2;
  return p;
}

/**
 * Generates a UV-aligned tangent-space Normal Map and micro-Roughness/Cavity Map
 * directly from a loaded albedo texture (HTMLImageElement / ImageBitmap / Canvas).
 * Runs once per cached texture (~3ms at 512x512) with zero extra network assets.
 */
export function deriveDetailMapsFromAlbedo(
  albedoTex: THREE.Texture | null | undefined,
  profile: OperatorSurfaceProfile,
  maxDim = 512
): DerivedPbrDetailMaps | null {
  const img = albedoTex?.image as
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | undefined;
  if (!img) return null;
  const srcW = (img as HTMLImageElement).naturalWidth || img.width || 0;
  const srcH = (img as HTMLImageElement).naturalHeight || img.height || 0;
  if (srcW < 16 || srcH < 16) return null;

  const w = nearestPow2Capped(srcW, maxDim);
  const h = nearestPow2Capped(srcH, maxDim);
  const ctx = getScratchContext(w, h);
  if (!ctx) return null;

  try {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  } catch {
    return null;
  }

  let rgba: Uint8ClampedArray;
  try {
    rgba = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }

  const pixelCount = w * h;
  const heightField = new Float32Array(pixelCount);

  // Profile-tuned micro-grain & relief settings
  let normalStrength = 2.1;
  let grainAmp = 0.025;
  let roughMin = 0.72;
  let roughMax = 0.94;
  if (profile === 'armor') {
    normalStrength = 2.65;
    grainAmp = 0.018;
    roughMin = 0.40;
    roughMax = 0.78;
  } else if (profile === 'leather') {
    normalStrength = 2.35;
    grainAmp = 0.024;
    roughMin = 0.46;
    roughMax = 0.80;
  } else if (profile === 'skin') {
    normalStrength = 0.95;
    grainAmp = 0.012;
    roughMin = 0.48;
    roughMax = 0.68;
  }

  // Pass 1: Luminance height field + subtle deterministic micro-grain per surface type
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const idx = rowOff + x;
      const p4 = idx * 4;
      // Rec.709 perceptual luminance normalized to [0..1]
      const lum =
        (0.2126 * rgba[p4] + 0.7152 * rgba[p4 + 1] + 0.0722 * rgba[p4 + 2]) / 255;

      let micro = 0;
      if (profile === 'fabric') {
        // Fine ripstop crosshatch weave
        const u = x & 3;
        const v = y & 3;
        const weave = (u === 0 || v === 0 ? 0.5 : -0.3) + (((x + y) & 1) ? 0.25 : -0.25);
        micro = weave * grainAmp;
      } else if (profile === 'leather') {
        // Subtle tactical pebble grain
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        micro = (hash - Math.floor(hash) - 0.5) * 2.0 * grainAmp;
      } else if (profile === 'armor') {
        // Ballistic nylon / polymer stipple
        const hash = Math.sin((x >> 1) * 19.19 + (y >> 1) * 47.37) * 23421.631;
        micro = (hash - Math.floor(hash) - 0.5) * 2.0 * grainAmp;
      } else {
        // Ultra-subtle skin micro-pores
        const hash = Math.sin(x * 31.7 + y * 57.1) * 15731.743;
        micro = (hash - Math.floor(hash) - 0.5) * 1.6 * grainAmp;
      }

      heightField[idx] = lum + micro;
    }
  }

  const normalBytes = new Uint8Array(pixelCount * 4);
  const roughBytes = new Uint8Array(pixelCount * 4);
  const wm1 = w - 1;
  const hm1 = h - 1;

  // Pass 2: 3x3 Sobel normal map + local cavity-driven roughness/AO map
  for (let y = 0; y < h; y++) {
    const ym = y === 0 ? hm1 : y - 1;
    const yp = y === hm1 ? 0 : y + 1;
    const rM = ym * w;
    const r0 = y * w;
    const rP = yp * w;

    for (let x = 0; x < w; x++) {
      const xm = x === 0 ? wm1 : x - 1;
      const xp = x === wm1 ? 0 : x + 1;

      const tl = heightField[rM + xm];
      const t = heightField[rM + x];
      const tr = heightField[rM + xp];
      const l = heightField[r0 + xm];
      const c = heightField[r0 + x];
      const r = heightField[r0 + xp];
      const bl = heightField[rP + xm];
      const b = heightField[rP + x];
      const br = heightField[rP + xp];

      // Sobel gradients (X right, Y down in glTF flipY=false UV space)
      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * normalStrength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * normalStrength;

      const nx = -dx;
      const ny = -dy;
      const nz = 1.0;
      const invLen = 1.0 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      const p4 = (r0 + x) * 4;
      normalBytes[p4] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalBytes[p4 + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalBytes[p4 + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      normalBytes[p4 + 3] = 255;

      // Local neighborhood average -> cavity/seam detection
      const avg = (tl + t + tr + l + r + bl + b + br) * 0.125;
      const relief = c - avg; // <0 inside seams/creases, >0 on raised edges/buckles
      // Normalized gloss factor: raised/bright details are slightly smoother, dark creases rougher
      const detailLift = Math.max(0, Math.min(1, 0.5 + relief * 3.8 + (c - 0.5) * 0.35));
      const roughVal = roughMax - detailLift * (roughMax - roughMin);
      const roughByte = Math.max(24, Math.min(248, Math.round(roughVal * 255)));

      // Soft ambient occlusion in R channel (darkened slightly in deep seams)
      const aoVal = Math.max(0.62, Math.min(1.0, 0.92 + relief * 1.65));
      const aoByte = Math.round(aoVal * 255);

      roughBytes[p4] = aoByte; // R = AO
      roughBytes[p4 + 1] = roughByte; // G = Roughness (Three.js roughnessMap channel)
      roughBytes[p4 + 2] = 0; // B = Metalness (unused unless metalnessMap bound)
      roughBytes[p4 + 3] = 255;
    }
  }

  const flipY = Boolean(albedoTex?.flipY);

  const normalMap = new THREE.DataTexture(normalBytes, w, h, THREE.RGBAFormat);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.flipY = flipY;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.anisotropy = 8;
  normalMap.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughBytes, w, h, THREE.RGBAFormat);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.flipY = flipY;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.generateMipmaps = true;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.anisotropy = 4;
  roughnessMap.needsUpdate = true;

  return { normalMap, roughnessMap };
}

/**
 * Injects a zero-extra-light Fresnel rim highlight into MeshStandardMaterial or
 * MeshPhysicalMaterial (Three.js 0.187+ meshphysical fragment shader).
 * Uses a deterministic customProgramCacheKey so shader programs stay shared across bots.
 */
export function applyOperatorRimLight(
  mat: THREE.MeshStandardMaterial,
  opts: OperatorRimLightOptions
): void {
  if (!mat || !mat.isMeshStandardMaterial) return;
  const power = opts.power ?? 3.1;
  const intensity = Math.max(0, opts.intensity);
  if (intensity <= 0.001) return;

  const c = new THREE.Color(opts.colorHex);
  const r = c.r;
  const g = c.g;
  const b = c.b;
  const key = `kinetic_op_rim_v1_${opts.colorHex.toString(16)}_${Math.round(
    intensity * 100
  )}_${Math.round(power * 10)}`;

  mat.userData = mat.userData || {};
  if (mat.userData.__kineticRimKey === key) return;
  mat.userData.__kineticRimKey = key;

  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float kRimDot = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
        float kRimUp = smoothstep( -0.35, 0.70, geometryNormal.y );
        float kRimGloss = mix( 0.62, 1.18, 1.0 - roughnessFactor );
        float kRimAmt = pow( kRimDot, ${power.toFixed(2)} ) * kRimUp * kRimGloss * ${intensity.toFixed(3)};
        outgoingLight += vec3( ${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)} ) * kRimAmt;
      }
      #include <opaque_fragment>`
    );
  };
  mat.needsUpdate = true;
}

/**
 * Injects a lightweight Unreal/Marmoset-style warm dermal wrap-SSS + soft rim
 * into MeshStandardMaterial / MeshPhysicalMaterial for realistic skin shading
 * at virtually zero GPU cost (4 ALU ops, zero extra lights).
 */
export function applyOperatorSkinSss(
  mat: THREE.MeshStandardMaterial,
  opts: { sssStrength?: number; rimIntensity?: number } = {}
): void {
  if (!mat || !mat.isMeshStandardMaterial) return;
  const sss = Math.max(0, Math.min(0.45, opts.sssStrength ?? 0.16));
  const rim = Math.max(0, Math.min(0.35, opts.rimIntensity ?? 0.12));
  const key = `kinetic_skin_sss_v1_${Math.round(sss * 100)}_${Math.round(rim * 100)}`;

  mat.userData = mat.userData || {};
  if (mat.userData.__kineticRimKey === key) return;
  mat.userData.__kineticRimKey = key;

  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{
        float kNdotV = saturate( dot( geometryNormal, geometryViewDir ) );
        float kSkinRim = pow( 1.0 - kNdotV, 3.2 ) * smoothstep( -0.35, 0.72, geometryNormal.y );
        // Soft dermal wrap-scatter warms mid-shadow transitions (nose, cheeks, jawline, arms)
        float kLum = dot( outgoingLight, vec3( 0.299, 0.587, 0.114 ) );
        float kMidBand = smoothstep( 0.02, 0.28, kLum ) * ( 1.0 - smoothstep( 0.35, 0.82, kLum ) );
        vec3 kScatter = diffuseColor.rgb * vec3( 1.0, 0.42, 0.26 ) * ( kMidBand * ${sss.toFixed(3)} + kSkinRim * ${(sss * 0.45).toFixed(3)} );
        outgoingLight += kScatter + vec3( 1.0, 0.89, 0.82 ) * ( kSkinRim * ${rim.toFixed(3)} );
      }
      #include <opaque_fragment>`
    );
  };
  mat.needsUpdate = true;
}

/**
 * Copies standard PBR properties into a fresh MeshPhysicalMaterial so we can
 * unlock cloth sheen, eye/visor clearcoat, and showcase Fresnel without mutating
 * shared in-match template materials.
 */
function cloneToPhysicalMaterial(
  src: THREE.MeshStandardMaterial
): THREE.MeshPhysicalMaterial {
  const phys = new THREE.MeshPhysicalMaterial({
    name: src.name,
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src.map || null,
    normalMap: src.normalMap || null,
    normalScale: src.normalScale ? src.normalScale.clone() : new THREE.Vector2(1, 1),
    roughnessMap: src.roughnessMap || null,
    metalnessMap: src.metalnessMap || null,
    aoMap: src.aoMap || null,
    aoMapIntensity: src.aoMapIntensity,
    emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: src.emissiveMap || null,
    emissiveIntensity: src.emissiveIntensity,
    roughness: src.roughness,
    metalness: src.metalness,
    envMapIntensity: src.envMapIntensity,
    alphaMap: src.alphaMap || null,
    alphaTest: src.alphaTest,
    transparent: src.transparent,
    opacity: src.opacity,
    depthWrite: src.depthWrite,
    depthTest: src.depthTest,
    side: src.side,
    vertexColors: src.vertexColors,
  });
  phys.userData = {
    ...(src.userData || {}),
    __showcaseClonedMat: true,
    __kineticRimKey: undefined,
  };
  return phys;
}

/**
 * Upgrades an operator's materials and shadow flags specifically for the
 * Lobby / Store / Inventory / Squad showcase (single hero or small squad).
 * Returns the list of newly allocated MeshPhysicalMaterials so the caller can
 * dispose them cleanly on operator swap or unmount.
 */
export function upgradeOperatorForShowcase(
  modelRoot: THREE.Object3D,
  opts: ShowcaseUpgradeOptions
): THREE.Material[] {
  const createdMats: THREE.Material[] = [];
  const aniso = Math.min(16, Math.max(4, opts.maxAnisotropy ?? 16));
  const rimColor = opts.isBlackthorn ? 0xffb3be : 0xb8e6ff;

  modelRoot.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (mesh.userData?.isWeaponProp || mesh.parent?.userData?.isWeaponProp) return;

    mesh.castShadow = !opts.isSoftwareGl;
    // Enable crisp self-shadowing in showcase (helmet over face, rifle/arms over chest)
    mesh.receiveShadow = !opts.isSoftwareGl;
    mesh.frustumCulled = false;

    const rawList = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const nextList = rawList.map((raw) => {
      const std = raw as THREE.MeshStandardMaterial;
      if (!std || !std.isMeshStandardMaterial) return raw;

      const matName = (std.name || '').toUpperCase();
      const phys = cloneToPhysicalMaterial(std);
      createdMats.push(phys);

      if (phys.map) {
        phys.map.anisotropy = aniso;
        phys.map.colorSpace = THREE.SRGBColorSpace;
        phys.map.needsUpdate = true;
      }
      if (phys.normalMap) {
        phys.normalMap.anisotropy = aniso;
        phys.normalMap.needsUpdate = true;
      }
      if (phys.roughnessMap) {
        phys.roughnessMap.anisotropy = Math.min(8, aniso);
        phys.roughnessMap.needsUpdate = true;
      }

      if (opts.isCustomFemale) {
        if (matName === 'MFS_EYE') {
          phys.roughness = 0.05;
          phys.metalness = 0.02;
          phys.clearcoat = 1.0;
          phys.clearcoatRoughness = 0.02;
          phys.ior = 1.48;
          phys.envMapIntensity = 1.85;
          if (phys.normalMap) phys.normalScale.set(0.45, 0.45);
        } else if (matName === 'MFS_GLASS') {
          phys.roughness = 0.05;
          phys.metalness = 0.80;
          phys.clearcoat = 1.0;
          phys.clearcoatRoughness = 0.03;
          phys.ior = 1.54;
          phys.envMapIntensity = 1.95;
          phys.opacity = 0.46;
        } else if (matName === 'MFS_HEAD' || matName === 'MFS_ARMS') {
          phys.roughness = phys.roughnessMap ? 0.94 : 0.56;
          phys.metalness = phys.metalnessMap ? 1.0 : 0.01;
          phys.aoMapIntensity = 0.58;
          phys.sheen = 0.26;
          phys.sheenRoughness = 0.72;
          phys.sheenColor = new THREE.Color(0xffd6c2);
          phys.envMapIntensity = 0.68;
          if (phys.normalMap) phys.normalScale.set(0.92, 0.92);
          applyOperatorSkinSss(phys, { sssStrength: 0.17, rimIntensity: 0.13 });
        } else if (matName === 'MFS_HAIR' || matName === 'MFS_HAIRSCALP') {
          phys.roughness = 0.44;
          phys.metalness = 0.04;
          phys.alphaTest = 0.28;
          phys.alphaToCoverage = !opts.isSoftwareGl;
          phys.sheen = 0.55;
          phys.sheenRoughness = 0.44;
          phys.sheenColor = new THREE.Color(0xfff1e0);
          phys.envMapIntensity = 0.78;
          if (phys.normalMap) phys.normalScale.set(0.84, 0.84);
          applyOperatorRimLight(phys, { colorHex: rimColor, intensity: 0.17, power: 2.7 });
        } else if (matName === 'MFS_EYELASHES') {
          phys.roughness = 0.62;
          phys.metalness = 0.02;
          phys.alphaTest = 0.26;
          phys.alphaToCoverage = !opts.isSoftwareGl;
          phys.envMapIntensity = 0.38;
        } else if (
          matName === 'MFS_SHIRT' ||
          matName === 'MFS_PANTS' ||
          matName === 'MFS_POUCHES' ||
          matName === 'MFS_PATCHES'
        ) {
          phys.roughness = phys.roughnessMap ? 0.92 : 0.82;
          phys.metalness = phys.metalnessMap ? 1.0 : 0.03;
          phys.sheen = 0.46;
          phys.sheenRoughness = 0.76;
          phys.sheenColor = new THREE.Color(0xdbe7f5);
          phys.envMapIntensity = 0.74;
          if (phys.normalMap) phys.normalScale.set(1.10, 1.10);
          applyOperatorRimLight(phys, { colorHex: rimColor, intensity: 0.20, power: 3.1 });
        } else {
          // MFS_UNLOADING, MFS_HEADGEAR, MFS_LEGGINGS, MFS_GLOVE -> tactical rig/helmet/leather
          phys.roughness = phys.roughnessMap ? 0.90 : 0.58;
          phys.metalness = phys.metalnessMap
            ? 1.0
            : matName === 'MFS_HEADGEAR'
            ? 0.16
            : 0.11;
          phys.clearcoat = 0.16;
          phys.clearcoatRoughness = 0.40;
          phys.sheen = 0.22;
          phys.sheenRoughness = 0.70;
          phys.sheenColor = new THREE.Color(0xcbd5e1);
          phys.envMapIntensity = 0.96;
          if (phys.normalMap) phys.normalScale.set(1.14, 1.14);
          applyOperatorRimLight(phys, { colorHex: rimColor, intensity: 0.24, power: 2.9 });
        }
      } else {
        // Male tactical operators (Sniper, Vanguard Rifleman/Engineer/Medic, Default)
        if (opts.avatarKind === 'DEFAULT') {
          phys.color.setHex(opts.isBlackthorn ? 0xf3e8e8 : 0xe8eef6);
          phys.roughness = Math.min(0.72, Math.max(0.32, phys.roughness ?? 0.55));
          phys.metalness = Math.min(0.28, Math.max(0.06, phys.metalness ?? 0.16));
          phys.envMapIntensity = 1.2;
        } else if (opts.avatarKind === 'VANGUARD_MEDICO') {
          // Fix exported flat metalness=0.404 / roughness=0.996 on Tripo medic mesh
          phys.color.setHex(0xffffff);
          phys.roughness = 0.66;
          phys.metalness = 0.08;
          phys.envMapIntensity = 1.18;
          if (phys.normalMap) phys.normalScale.set(1.32, 1.32);
        } else if (opts.avatarKind === 'VANGUARD_ENGENHEIRO') {
          phys.color.setHex(0xffffff);
          phys.roughness = 0.60;
          phys.metalness = 0.12;
          phys.envMapIntensity = 1.24;
          if (phys.normalMap) phys.normalScale.set(1.26, 1.26);
        } else {
          // Sniper & Vanguard Rifleman have real metallicRoughnessMap + 2K albedo + 1K normal
          phys.color.setHex(0xffffff);
          phys.envMapIntensity = 1.32;
          if (!phys.roughnessMap) {
            phys.roughness = Math.min(0.74, Math.max(0.34, phys.roughness ?? 0.54));
          } else {
            phys.roughness = 1.0;
          }
          if (!phys.metalnessMap) {
            phys.metalness = Math.min(0.26, Math.max(0.06, phys.metalness ?? 0.12));
          }
          if (phys.normalMap) phys.normalScale.set(1.24, 1.24);
        }

        phys.side = THREE.FrontSide;
        phys.sheen = 0.28;
        phys.sheenRoughness = 0.74;
        phys.sheenColor = new THREE.Color(0xdbeafe);
        phys.clearcoat = 0.10;
        phys.clearcoatRoughness = 0.48;
        applyOperatorRimLight(phys, { colorHex: rimColor, intensity: 0.24, power: 3.0 });
      }

      // Three.js r152+ uses uv1 for channel 1; fall back to primary UV (channel 0) if absent
      if (phys.aoMap && mesh.geometry && !mesh.geometry.attributes.uv1) {
        phys.aoMap.channel = 0;
      }

      phys.needsUpdate = true;
      return phys;
    });

    mesh.material = Array.isArray(mesh.material) ? nextList : nextList[0];
  });

  return createdMats;
}

/**
 * Builds a high-contrast tactical hangar studio PMREM environment map for
 * operator showcases. Compared to flat white RoomEnvironment, dark walls with
 * bright HDR softboxes produce crisp specular catchlights in eyes, goggles,
 * helmet rails, armor bevels, and metallic weapons.
 */
export function buildTacticalStudioEnvTexture(
  renderer: THREE.WebGLRenderer,
  isBlackthorn: boolean
): THREE.Texture {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color(isBlackthorn ? 0x090608 : 0x050a12);

  const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];
  const addPanel = (
    w: number,
    h: number,
    colorHex: number,
    intensity: number,
    pos: [number, number, number],
    lookAt: [number, number, number]
  ) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const col = new THREE.Color(colorHex).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    studio.add(mesh);
    disposables.push(geo, mat);
  };

  // Overhead hangar softbox strip
  addPanel(6.0, 2.2, 0xf8fbff, 3.6, [0, 4.4, 0.8], [0, 1.0, 0]);
  // Main warm-white key softbox (upper front-right -> eye & armor catchlight)
  addPanel(3.4, 3.2, 0xfff5e8, 4.4, [3.6, 2.7, 3.2], [0, 1.1, 0]);
  // Soft cool fill card (front-left -> lifts shadow detail cleanly)
  addPanel(3.2, 2.8, isBlackthorn ? 0xffd5db : 0xc7e8ff, 1.85, [-3.6, 1.8, 2.6], [0, 1.0, 0]);
  // Strong rear-left tactical rim strip (carves out helmet/shoulder silhouette)
  addPanel(2.4, 3.8, isBlackthorn ? 0xff5a6e : 0x38bdf8, 4.2, [-2.8, 2.0, -3.2], [0, 1.0, 0]);
  // Secondary rear-right rim accent
  addPanel(2.0, 3.2, isBlackthorn ? 0xff9b70 : 0x818cf8, 2.9, [2.9, 1.7, -3.1], [0, 1.0, 0]);
  // Subtle floor bounce card (keeps under-chin and chest pouches readable)
  addPanel(5.5, 5.5, isBlackthorn ? 0x261518 : 0x162436, 1.1, [0, -1.8, 0.4], [0, 1.0, 0]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rt = pmrem.fromScene(studio, 0.022);
  const envTex = rt.texture;
  pmrem.dispose();

  for (let i = 0; i < disposables.length; i++) {
    disposables[i].dispose();
  }
  return envTex;
}

let cachedContactShadowTex: THREE.CanvasTexture | null = null;

/**
 * Shared procedural radial contact shadow texture placed directly under boots
 * in showcases so operators look physically grounded on the pedestal.
 */
export function getContactShadowTexture(): THREE.CanvasTexture | null {
  if (cachedContactShadowTex) return cachedContactShadowTex;
  if (typeof document === 'undefined') return null;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const half = size * 0.5;
  const grad = ctx.createRadialGradient(half, half, 4, half, half, half);
  grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.38, 'rgba(0, 0, 0, 0.44)');
  grad.addColorStop(0.72, 'rgba(0, 0, 0, 0.14)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cachedContactShadowTex = tex;
  return tex;
}
