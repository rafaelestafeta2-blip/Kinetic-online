import * as THREE from 'three';
import {
  CamoPatternType,
  getSkinDefinition,
  WeaponSkinDefinition,
} from '../progression/weaponSkins';
import { WeaponId } from '../types/game';

interface OriginalMaterialSkinState {
  map: THREE.Texture | null;
  colorHex: number;
  roughness: number;
  metalness: number;
  bumpMap: THREE.Texture | null;
  bumpScale: number;
}

const loadedUrlTextures = new Map<string, THREE.Texture>();
const pendingUrlLoads = new Map<string, Promise<THREE.Texture | null>>();
const patternCanvasCache = new Map<CamoPatternType, HTMLCanvasElement>();
const textureLoader = new THREE.TextureLoader();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCamoPatternCanvas(pattern: CamoPatternType): HTMLCanvasElement {
  const existing = patternCanvasCache.get(pattern);
  if (existing) return existing;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const drawWrappedBlob = (
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rot: number,
    color: string
  ) => {
    ctx.fillStyle = color;
    for (let ox = -size; ox <= size; ox += size) {
      for (let oy = -size; oy <= size; oy += size) {
        ctx.save();
        ctx.translate(cx + ox, cy + oy);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  };

  if (pattern === 'desert') {
    const rand = mulberry32(10421);
    ctx.fillStyle = '#b89f72';
    ctx.fillRect(0, 0, size, size);
    const tones = ['#967c52', '#cbb589', '#735d3b', '#52422b'];
    for (let i = 0; i < 65; i++) {
      drawWrappedBlob(
        rand() * size,
        rand() * size,
        24 + rand() * 56,
        14 + rand() * 34,
        rand() * Math.PI,
        tones[i % tones.length]
      );
    }
  } else if (pattern === 'woodland') {
    const rand = mulberry32(20873);
    ctx.fillStyle = '#3f5734';
    ctx.fillRect(0, 0, size, size);
    const tones = ['#5a7346', '#5c4830', '#2b3823', '#1c2119'];
    for (let i = 0; i < 72; i++) {
      drawWrappedBlob(
        rand() * size,
        rand() * size,
        22 + rand() * 52,
        14 + rand() * 32,
        rand() * Math.PI,
        tones[i % tones.length]
      );
    }
  } else if (pattern === 'urban_digital') {
    const rand = mulberry32(33917);
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, size, size);
    const cell = 16;
    const tones = ['#64748b', '#94a3b8', '#1e293b', '#0f172a', '#475569'];
    for (let gx = 0; gx < size; gx += cell) {
      for (let gy = 0; gy < size; gy += cell) {
        if (rand() < 0.72) {
          ctx.fillStyle = tones[Math.floor(rand() * tones.length)];
          const w = cell * (1 + Math.floor(rand() * 3));
          const h = cell * (1 + Math.floor(rand() * 2));
          ctx.fillRect(gx, gy, w, h);
          if (gx + w > size) ctx.fillRect(gx - size, gy, w, h);
          if (gy + h > size) ctx.fillRect(gx, gy - size, w, h);
        }
      }
    }
  } else if (pattern === 'crimson') {
    const rand = mulberry32(48109);
    ctx.fillStyle = '#1b1d24';
    ctx.fillRect(0, 0, size, size);
    // Diagonal stealth hex/shard camo
    for (let i = 0; i < 55; i++) {
      const color =
        i % 4 === 0
          ? '#991b1b'
          : i % 4 === 1
            ? '#dc2626'
            : i % 4 === 2
              ? '#27272a'
              : '#3f3f46';
      ctx.fillStyle = color;
      const x = rand() * size;
      const y = rand() * size;
      const w = 36 + rand() * 90;
      const h = 10 + rand() * 26;
      for (let ox = -size; ox <= size; ox += size) {
        for (let oy = -size; oy <= size; oy += size) {
          ctx.save();
          ctx.translate(x + ox, y + oy);
          ctx.rotate(-Math.PI / 5);
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
    }
  } else if (pattern === 'anubis_gold') {
    // Royal Anubis 24K Gold & Lapis Lazuli Obsidian
    ctx.fillStyle = '#0e1424';
    ctx.fillRect(0, 0, size, size);
    const step = 24;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const alt = ((x / step + y / step) | 0) % 2 === 0;
        ctx.fillStyle = alt ? '#172554' : '#0b101e';
        ctx.fillRect(x, y, step - 1, step - 1);
      }
    }
    for (let s = -size; s < size * 2; s += 96) {
      ctx.save();
      ctx.translate(s, 0);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(0, -size, 18, size * 3);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(20, -size, 4, size * 3);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(26, -size, 8, size * 3);
      ctx.restore();
    }
  } else if (pattern === 'cyber_cobalt') {
    const rand = mulberry32(61423);
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 64; i++) {
      const color =
        i % 4 === 0
          ? '#0284c7'
          : i % 4 === 1
            ? '#38bdf8'
            : i % 4 === 2
              ? '#1e3a8a'
              : '#1e293b';
      ctx.fillStyle = color;
      const x = rand() * size;
      const y = rand() * size;
      const w = 40 + rand() * 95;
      const h = 8 + rand() * 22;
      for (let ox = -size; ox <= size; ox += size) {
        for (let oy = -size; oy <= size; oy += size) {
          ctx.save();
          ctx.translate(x + ox, y + oy);
          ctx.rotate(-Math.PI / 6);
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.restore();
        }
      }
    }
  } else if (pattern === 'emerald_viper') {
    const rand = mulberry32(77319);
    ctx.fillStyle = '#091410';
    ctx.fillRect(0, 0, size, size);
    const tones = ['#059669', '#10b981', '#064e3b', '#18181b', '#27272a'];
    for (let i = 0; i < 74; i++) {
      drawWrappedBlob(
        rand() * size,
        rand() * size,
        24 + rand() * 48,
        10 + rand() * 24,
        -Math.PI / 4 + (rand() - 0.5) * 0.4,
        tones[i % tones.length]
      );
    }
  } else if (pattern === 'arctic_frost') {
    const rand = mulberry32(88241);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, size, size);
    const tones = ['#f8fafc', '#cbd5e1', '#93c5fd', '#475569', '#1e293b'];
    for (let i = 0; i < 68; i++) {
      drawWrappedBlob(
        rand() * size,
        rand() * size,
        26 + rand() * 56,
        14 + rand() * 30,
        rand() * Math.PI,
        tones[i % tones.length]
      );
    }
  } else if (pattern === 'aemondir_legion') {
    // Aemondir Bucky Legion: Obsidian Dragon Scales + Imperial Bronze Gold + Molten Crimson Filigree
    ctx.fillStyle = '#18141c';
    ctx.fillRect(0, 0, size, size);
    const step = 20;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const alt = ((x / step + y / step) | 0) % 2 === 0;
        ctx.fillStyle = alt ? '#5c1118' : '#231c26';
        ctx.fillRect(x, y, step - 1, step - 1);
      }
    }
    for (let s = -size; s < size * 2; s += 80) {
      ctx.save();
      ctx.translate(s, 0);
      ctx.rotate(Math.PI / 5);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(0, -size, 14, size * 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(16, -size, 8, size * 3);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(26, -size, 3, size * 3);
      ctx.restore();
    }
  } else {
    // carbon_gold
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, size, size);
    const step = 16;
    for (let y = 0; y < size; y += step) {
      for (let x = 0; x < size; x += step) {
        const alt = ((x / step + y / step) | 0) % 2 === 0;
        ctx.fillStyle = alt ? '#232730' : '#111318';
        ctx.fillRect(x, y, step - 1, step - 1);
      }
    }
    // Gold anodized racing/tactical stripes
    ctx.fillStyle = '#d4af37';
    for (let s = -size; s < size * 2; s += 128) {
      ctx.save();
      ctx.translate(s, 0);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(0, -size, 10, size * 3);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(14, -size, 3, size * 3);
      ctx.fillStyle = '#d4af37';
      ctx.restore();
    }
  }

  // Subtle weapon grain / micro-wear overlay
  const grainRand = mulberry32(9911);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(grainRand() * size, grainRand() * size, 2, 2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 900; i++) {
    ctx.fillRect(grainRand() * size, grainRand() * size, 2, 2);
  }

  patternCanvasCache.set(pattern, canvas);
  return canvas;
}

function createCamoPatternTexture(pattern: CamoPatternType): THREE.CanvasTexture {
  const canvas = createCamoPatternCanvas(pattern);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 3.2);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function loadSkinImageTexture(url: string): Promise<THREE.Texture | null> {
  const cached = loadedUrlTextures.get(url);
  if (cached) return Promise.resolve(cached);
  const inflight = pendingUrlLoads.get(url);
  if (inflight) return inflight;

  const p = new Promise<THREE.Texture | null>((resolve) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        loadedUrlTextures.set(url, tex);
        pendingUrlLoads.delete(url);
        resolve(tex);
      },
      undefined,
      () => {
        pendingUrlLoads.delete(url);
        resolve(null);
      }
    );
  });
  pendingUrlLoads.set(url, p);
  return p;
}

function isProtectedNonWeaponPart(
  meshName: string,
  nodeName: string,
  matName: string
): boolean {
  const m = meshName.toLowerCase();
  const n = nodeName.toLowerCase();
  const mat = matName.toLowerCase();
  const tokens = [
    'hand',
    'arm',
    'glove',
    'shirt',
    'watch',
    'ch22',
    'sleeve',
    'manny',
    'holoshort_opacity',
    'm_transparent',
    'lense',
    'lens',
    'glass',
    'reticle',
    'scoperender',
    'laser',
    'muzzle',
    'legion_emissive',
    'scope_glass',
    'scope_reticle_emi',
  ];
  for (const tok of tokens) {
    if (m.includes(tok) || n.includes(tok) || mat.includes(tok)) {
      return true;
    }
  }
  return (
    mat === 'mat' ||
    mat === 'textura' ||
    mat === 'arms' ||
    mat === 'arms_0' ||
    mat === 'hands_04' ||
    mat === 'glasses'
  );
}

function ensureClonedOwnMaterial(
  mesh: THREE.Mesh,
  matIndex: number,
  origMat: THREE.Material
): THREE.MeshStandardMaterial | null {
  const std = origMat as THREE.MeshStandardMaterial;
  if (!std || !('color' in std)) return null;
  if (std.userData?.__skinInstanceCloned) {
    return std;
  }
  const cloned = std.clone();
  cloned.userData = {
    ...(std.userData || {}),
    __skinInstanceCloned: true,
    __origSkinState: {
      map: std.map ?? null,
      colorHex: std.color ? std.color.getHex() : 0xffffff,
      roughness: typeof std.roughness === 'number' ? std.roughness : 0.45,
      metalness: typeof std.metalness === 'number' ? std.metalness : 0.5,
      bumpMap: std.bumpMap ?? null,
      bumpScale: typeof std.bumpScale === 'number' ? std.bumpScale : 0,
    } satisfies OriginalMaterialSkinState,
  };
  if (Array.isArray(mesh.material)) {
    const next = [...mesh.material];
    next[matIndex] = cloned;
    mesh.material = next;
  } else {
    mesh.material = cloned;
  }
  return cloned;
}

function applySkinDefToMaterial(
  mat: THREE.MeshStandardMaterial,
  skin: WeaponSkinDefinition,
  urlTex: THREE.Texture | null,
  hasVertexColors = false
): void {
  const orig = mat.userData.__origSkinState as OriginalMaterialSkinState | undefined;
  if (!orig) return;

  if (
    skin.id === 'default' ||
    (skin.id === 'shotgun_aemondir_legion' && hasVertexColors)
  ) {
    mat.map = orig.map;
    if (mat.map) {
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.needsUpdate = true;
    }
    if (mat.color) mat.color.setHex(orig.colorHex);
    mat.vertexColors = hasVertexColors;
    mat.roughness = orig.roughness;
    mat.metalness = orig.metalness;
    mat.bumpMap = orig.bumpMap;
    mat.bumpScale = orig.bumpScale;
    mat.needsUpdate = true;
    return;
  }

  if (skin.textureUrl) {
    if (!urlTex) return;
    // Clone lightweight Texture wrapper so disposing one WebGL scene never poisons another context.
    const instanceTex = urlTex.clone();
    instanceTex.flipY = orig.map ? orig.map.flipY : false;
    instanceTex.colorSpace = THREE.SRGBColorSpace;
    instanceTex.anisotropy = 8;
    instanceTex.needsUpdate = true;
    mat.map = instanceTex;
    if (mat.color) mat.color.setHex(0xffffff);
    mat.roughness = skin.roughness ?? orig.roughness;
    mat.metalness = skin.metalness ?? orig.metalness;
    mat.needsUpdate = true;
    return;
  }

  if (skin.pattern) {
    const camoTex = createCamoPatternTexture(skin.pattern);
    camoTex.flipY = orig.map ? orig.map.flipY : false;
    camoTex.needsUpdate = true;
    mat.map = camoTex;
    if (mat.color) mat.color.setHex(0xffffff);
    if (typeof skin.roughness === 'number') mat.roughness = skin.roughness;
    if (typeof skin.metalness === 'number') mat.metalness = skin.metalness;
    mat.needsUpdate = true;
  }
}

export function applyWeaponSkinToObject3D(
  root: THREE.Object3D | null | undefined,
  weaponId: WeaponId,
  skinId: string | null | undefined,
  onApplied?: () => void
): void {
  if (!root) return;
  const skin = getSkinDefinition(skinId);
  if (skin.weaponIds && !skin.weaponIds.includes(weaponId)) {
    // Incompatible exclusive skin requested for another weapon: revert to factory default.
    applyWeaponSkinToObject3D(root, weaponId, 'default', onApplied);
    return;
  }

  root.userData = root.userData || {};
  root.userData.appliedWeaponSkinId = skin.id;
  root.userData.appliedSkinWeaponId = weaponId;

  const applyWithTex = (urlTex: THREE.Texture | null) => {
    const seenMats = new Set<THREE.MeshStandardMaterial>();
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mName = mesh.name || '';
      const nName = mesh.parent?.name || '';
      const rawMats = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];

      for (let i = 0; i < rawMats.length; i++) {
        const raw = rawMats[i];
        if (!raw) continue;
        const matName = raw.name || '';
        if (isProtectedNonWeaponPart(mName, nName, matName)) continue;
        if (raw.transparent && (raw.opacity ?? 1) < 0.85) continue;

        const ownMat = ensureClonedOwnMaterial(mesh, i, raw);
        if (!ownMat || seenMats.has(ownMat)) continue;
        seenMats.add(ownMat);
        const hasVertexColors = Boolean(mesh.geometry?.getAttribute('color'));
        applySkinDefToMaterial(ownMat, skin, urlTex, hasVertexColors);
      }
    });
    onApplied?.();
  };

  if (skin.textureUrl) {
    const cached = loadedUrlTextures.get(skin.textureUrl);
    if (cached) {
      applyWithTex(cached);
    } else {
      const targetSkinId = skin.id;
      void loadSkinImageTexture(skin.textureUrl).then((tex) => {
        if (!tex) return;
        if (root.userData?.appliedWeaponSkinId !== targetSkinId) return;
        applyWithTex(tex);
      });
    }
    return;
  }

  applyWithTex(null);
}
