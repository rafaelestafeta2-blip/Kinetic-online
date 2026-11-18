import * as THREE from 'three';

const budgetedTextures = new WeakSet<THREE.Texture>();

export function isMobileGpuTarget(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return Boolean(coarse || /Android|iPhone|iPad|iPod|Capacitor/i.test(ua));
}

function getTextureSourceSize(img: unknown): { w: number; h: number } | null {
  if (!img || typeof img !== 'object') return null;
  const anyImg = img as {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const w = anyImg.naturalWidth || anyImg.width || 0;
  const h = anyImg.naturalHeight || anyImg.height || 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

function downscaleTextureIfOversized(
  tex: THREE.Texture,
  maxDim: number
): void {
  if (
    (tex as THREE.CompressedTexture).isCompressedTexture ||
    (tex as THREE.DataTexture).isDataTexture ||
    (tex as THREE.CanvasTexture).isCanvasTexture
  ) {
    return;
  }
  const size = getTextureSourceSize(tex.image);
  if (!size || (size.w <= maxDim && size.h <= maxDim)) return;
  if (typeof document === 'undefined') return;

  try {
    const scale = maxDim / Math.max(size.w, size.h);
    const targetW = Math.max(64, Math.round(size.w * scale));
    const targetH = Math.max(64, Math.round(size.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(tex.image as CanvasImageSource, 0, 0, targetW, targetH);
    const prev = tex.image as { close?: () => void } | null;
    if (prev && typeof prev.close === 'function') {
      try {
        prev.close();
      } catch {
        // ignore
      }
    }
    tex.image = canvas;
    tex.needsUpdate = true;
  } catch {
    // Keep original texture if cross-origin/tainted or unsupported
  }
}

function applyBudgetToTexture(
  tex: THREE.Texture | null | undefined,
  maxAnisotropy: number,
  maxMobileDim: number,
  isMobile: boolean
): void {
  if (!tex || budgetedTextures.has(tex)) return;
  budgetedTextures.add(tex);
  tex.anisotropy = Math.min(Math.max(1, tex.anisotropy || 1), maxAnisotropy);
  if (isMobile) {
    downscaleTextureIfOversized(tex, maxMobileDim);
  }
}

/**
 * Enforces mobile-safe anisotropy and texture dimension caps on a 3D subtree
 * without disturbing colorSpace or shared procedural textures.
 */
export function applyMobileTextureBudget(
  root: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  maxMobileDim = 1024
): void {
  const isMobile = isMobileGpuTarget();
  const hwMax = renderer.capabilities?.getMaxAnisotropy?.() || 1;
  const maxAniso = isSoftwareGl
    ? 1
    : isMobile
      ? Math.min(4, hwMax)
      : Math.min(8, hwMax);

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const std = mats[i] as THREE.MeshStandardMaterial;
      if (!std) continue;
      applyBudgetToTexture(std.map, maxAniso, maxMobileDim, isMobile);
      applyBudgetToTexture(std.normalMap, maxAniso, maxMobileDim, isMobile);
      applyBudgetToTexture(std.roughnessMap, maxAniso, maxMobileDim, isMobile);
      applyBudgetToTexture(std.metalnessMap, maxAniso, maxMobileDim, isMobile);
      applyBudgetToTexture(std.aoMap, maxAniso, maxMobileDim, isMobile);
      applyBudgetToTexture(std.emissiveMap, maxAniso, maxMobileDim, isMobile);
      applyBudgetToTexture(std.bumpMap, maxAniso, maxMobileDim, isMobile);
    }
  });
}

/**
 * Pre-uploads textures and compiles shaders for a newly loaded subtree so
 * drawing or firing a weapon never triggers a mid-combat shader hitch.
 */
export function warmSubtreeOnGpu(
  root: THREE.Object3D,
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer | null | undefined,
  isSoftwareGl: boolean
): void {
  if (!renderer || isSoftwareGl) return;
  applyMobileTextureBudget(root, renderer, isSoftwareGl, 1024);

  const seen = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const std = mats[i] as THREE.MeshStandardMaterial;
      if (!std) continue;
      const maps = [
        std.map,
        std.normalMap,
        std.roughnessMap,
        std.metalnessMap,
        std.aoMap,
        std.emissiveMap,
        std.bumpMap,
      ];
      for (let j = 0; j < maps.length; j++) {
        const t = maps[j];
        if (t && !seen.has(t)) {
          seen.add(t);
          try {
            renderer.initTexture(t);
          } catch {
            // ignore non-ready texture
          }
        }
      }
    }
  });

  try {
    if (
      'compileAsync' in renderer &&
      typeof renderer.compileAsync === 'function'
    ) {
      void renderer.compileAsync(scene, camera).catch(() => {});
    } else {
      renderer.compile(scene, camera);
    }
  } catch {
    // non-fatal shader warmup
  }
}

/**
 * Disposes geometries, materials, and unshared textures inside an Object3D subtree.
 */
export function disposeObject3DResources(
  root: THREE.Object3D,
  sharedTextures?: Set<THREE.Texture>
): void {
  const maybeDisposeTex = (tex: THREE.Texture | null | undefined) => {
    if (!tex) return;
    if (sharedTextures?.has(tex)) return;
    tex.dispose();
  };

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose?.();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i] as THREE.MeshStandardMaterial | undefined;
      if (!m) continue;
      maybeDisposeTex(m.map);
      maybeDisposeTex(m.normalMap);
      maybeDisposeTex(m.roughnessMap);
      maybeDisposeTex(m.metalnessMap);
      maybeDisposeTex(m.aoMap);
      maybeDisposeTex(m.emissiveMap);
      maybeDisposeTex(m.bumpMap);
      m.dispose?.();
    }
  });
}
