/**
 * Resolves heavy 3D/map/audio asset paths to an external CDN base URL
 * when VITE_ASSET_CDN_URL is configured (Firebase Storage, Cloudflare R2, or S3),
 * keeping local `/models/...`, `/maps/...`, and `/sounds/...` as zero-config fallbacks.
 *
 * Supported VITE_ASSET_CDN_URL formats:
 * - Standard HTTPS CDN: `https://cdn.example.com` or `https://storage.googleapis.com/<bucket>/cdn`
 * - Firebase Storage REST API: `firebase-storage://<bucket>/cdn`
 *   -> resolves to `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/cdn%2Fmodels%2F...?alt=media`
 */

const rawCdnBase =
  typeof import.meta !== 'undefined' &&
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_ASSET_CDN_URL;

let activeCdnBase = rawCdnBase ? rawCdnBase.trim().replace(/\/+$/, '') : '';
let activeAssetRevision = '';

interface FirebaseStorageTarget {
  bucket: string;
  prefix: string;
}

function parseFirebaseStorageTarget(base: string): FirebaseStorageTarget | null {
  if (!base.startsWith('firebase-storage://') && !base.startsWith('gs://')) {
    return null;
  }
  const stripped = base.replace(/^(firebase-storage|gs):\/\//, '');
  const slashIdx = stripped.indexOf('/');
  if (slashIdx === -1) {
    return { bucket: stripped, prefix: '' };
  }
  return {
    bucket: stripped.slice(0, slashIdx),
    prefix: stripped.slice(slashIdx + 1).replace(/^\/+|\/+$/g, ''),
  };
}

let firebaseStorageTarget = parseFirebaseStorageTarget(activeCdnBase);

export function setOtaAssetConfig(config: {
  assetRevision?: string;
  cdnBaseUrl?: string;
}): void {
  if (typeof config.assetRevision === 'string') {
    activeAssetRevision = config.assetRevision.trim();
  }
  if (typeof config.cdnBaseUrl === 'string' && config.cdnBaseUrl.trim().length > 0) {
    activeCdnBase = config.cdnBaseUrl.trim().replace(/\/+$/, '');
    firebaseStorageTarget = parseFirebaseStorageTarget(activeCdnBase);
  }
}

export function getOtaAssetConfig(): {
  assetRevision: string;
  cdnBaseUrl: string;
} {
  return {
    assetRevision: activeAssetRevision,
    cdnBaseUrl: activeCdnBase,
  };
}

export function hasExternalAssetCdn(): boolean {
  return activeCdnBase.length > 0;
}

function appendRevisionParam(url: string): string {
  if (!activeAssetRevision) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(activeAssetRevision)}`;
}

export function resolveAssetUrl(localOrAbsolutePath: string): string {
  if (!localOrAbsolutePath) return localOrAbsolutePath;
  if (/^https?:\/\//i.test(localOrAbsolutePath)) return localOrAbsolutePath;

  const normalized = localOrAbsolutePath.startsWith('/')
    ? localOrAbsolutePath
    : `/${localOrAbsolutePath}`;
  const isHeavyAsset =
    normalized.startsWith('/models/') ||
    normalized.startsWith('/maps/') ||
    normalized.startsWith('/sounds/') ||
    normalized.startsWith('/audio/');

  if (!activeCdnBase) {
    return isHeavyAsset ? appendRevisionParam(localOrAbsolutePath) : localOrAbsolutePath;
  }

  if (isHeavyAsset) {
    if (firebaseStorageTarget) {
      const objectPath = firebaseStorageTarget.prefix
        ? `${firebaseStorageTarget.prefix}${normalized}`
        : normalized.slice(1);
      const baseFirebaseUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
        firebaseStorageTarget.bucket
      )}/o/${encodeURIComponent(objectPath)}?alt=media`;
      return appendRevisionParam(baseFirebaseUrl);
    }
    return appendRevisionParam(`${activeCdnBase}${normalized}`);
  }
  return localOrAbsolutePath;
}
