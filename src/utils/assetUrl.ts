/**
 * Resolves heavy 3D/map/audio asset paths to an external CDN base URL
 * when VITE_ASSET_CDN_URL is configured (e.g. Cloudflare R2 / Firebase Storage / S3),
 * keeping local `/models/...` and `/maps/...` as zero-config fallbacks.
 */

const rawCdnBase =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_ASSET_CDN_URL;

const ASSET_CDN_BASE = rawCdnBase ? rawCdnBase.trim().replace(/\/+$/, '') : '';

export function hasExternalAssetCdn(): boolean {
  return ASSET_CDN_BASE.length > 0;
}

export function resolveAssetUrl(localOrAbsolutePath: string): string {
  if (!localOrAbsolutePath) return localOrAbsolutePath;
  if (/^https?:\/\//i.test(localOrAbsolutePath)) return localOrAbsolutePath;
  if (!ASSET_CDN_BASE) return localOrAbsolutePath;
  const normalized = localOrAbsolutePath.startsWith('/')
    ? localOrAbsolutePath
    : `/${localOrAbsolutePath}`;
  if (
    normalized.startsWith('/models/') ||
    normalized.startsWith('/maps/') ||
    normalized.startsWith('/sounds/')
  ) {
    return `${ASSET_CDN_BASE}${normalized}`;
  }
  return localOrAbsolutePath;
}
