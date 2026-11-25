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
  '/models/maps/object_d17_lod0.glb': {
    virtualPath: '/models/maps/object_d17_lod0.glb',
    contentType: 'model/gltf-binary',
    totalBytes: 48_347_924,
    parts: [
      { path: '/models/maps/object_d17_lod0.p0.bin', sizeBytes: 12_086_981 },
      { path: '/models/maps/object_d17_lod0.p1.bin', sizeBytes: 12_086_981 },
      { path: '/models/maps/object_d17_lod0.p2.bin', sizeBytes: 12_086_981 },
      { path: '/models/maps/object_d17_lod0.p3.bin', sizeBytes: 12_086_981 },
    ],
  },
  '/models/maps/bridges_v2_lod0.glb': {
    virtualPath: '/models/maps/bridges_v2_lod0.glb',
    contentType: 'model/gltf-binary',
    totalBytes: 74_710_688,
    parts: [
      { path: '/models/maps/bridges_v2_lod0.p0.bin', sizeBytes: 12_451_782 },
      { path: '/models/maps/bridges_v2_lod0.p1.bin', sizeBytes: 12_451_782 },
      { path: '/models/maps/bridges_v2_lod0.p2.bin', sizeBytes: 12_451_782 },
      { path: '/models/maps/bridges_v2_lod0.p3.bin', sizeBytes: 12_451_782 },
      { path: '/models/maps/bridges_v2_lod0.p4.bin', sizeBytes: 12_451_782 },
      { path: '/models/maps/bridges_v2_lod0.p5.bin', sizeBytes: 12_451_778 },
    ],
  },
  '/models/maps/hangar_fs_lod0.glb': {
    virtualPath: '/models/maps/hangar_fs_lod0.glb',
    contentType: 'model/gltf-binary',
    totalBytes: 55_017_680,
    parts: [
      { path: '/models/maps/hangar_fs_lod0.p0.bin', sizeBytes: 11_003_536 },
      { path: '/models/maps/hangar_fs_lod0.p1.bin', sizeBytes: 11_003_536 },
      { path: '/models/maps/hangar_fs_lod0.p2.bin', sizeBytes: 11_003_536 },
      { path: '/models/maps/hangar_fs_lod0.p3.bin', sizeBytes: 11_003_536 },
      { path: '/models/maps/hangar_fs_lod0.p4.bin', sizeBytes: 11_003_536 },
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
