/**
 * Registry of large binary 3D assets split into <= 15 MB parts so they stay
 * comfortably below GitHub/CDN per-file upload limits while keeping 100% of
 * original LOD0 polygons and textures intact without simplification.
 */

export interface ChunkedAssetPart {
  path: string;
  sizeBytes: number;
}

export interface ChunkedAssetDescriptor {
  virtualPath: string;
  contentType: string;
  totalBytes: number;
  parts: readonly ChunkedAssetPart[];
}

export const CHUNKED_ASSET_REGISTRY: Record<string, ChunkedAssetDescriptor> = {
  '/models/maps/yard_v2_lod0.glb': {
    virtualPath: '/models/maps/yard_v2_lod0.glb',
    contentType: 'model/gltf-binary',
    totalBytes: 40_512_340,
    parts: [
      { path: '/models/maps/yard_v2_lod0.p0.bin', sizeBytes: 13_504_114 },
      { path: '/models/maps/yard_v2_lod0.p1.bin', sizeBytes: 13_504_114 },
      { path: '/models/maps/yard_v2_lod0.p2.bin', sizeBytes: 13_504_112 },
    ],
  },
};

export function normalizeAssetPathKey(urlOrPath: string): string {
  if (!urlOrPath) return '';
  try {
    const base =
      typeof window !== 'undefined' ? window.location.origin : 'https://kinetic.local';
    const parsed = new URL(urlOrPath, base);
    const decodedPath = decodeURIComponent(parsed.pathname);
    const modelsIdx = decodedPath.indexOf('/models/');
    if (modelsIdx >= 0) return decodedPath.slice(modelsIdx);
    const mapsIdx = decodedPath.indexOf('/maps/');
    if (mapsIdx >= 0) return decodedPath.slice(mapsIdx);
    const soundsIdx = decodedPath.indexOf('/sounds/');
    if (soundsIdx >= 0) return decodedPath.slice(soundsIdx);
    const audioIdx = decodedPath.indexOf('/audio/');
    if (audioIdx >= 0) return decodedPath.slice(audioIdx);
    return decodedPath;
  } catch {
    return urlOrPath.split('?')[0];
  }
}

export function getChunkedAssetDescriptor(
  urlOrPath: string
): ChunkedAssetDescriptor | null {
  const normalized = normalizeAssetPathKey(urlOrPath);
  return CHUNKED_ASSET_REGISTRY[normalized] ?? null;
}
