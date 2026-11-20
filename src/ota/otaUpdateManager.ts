import {
  getOtaAssetConfig,
  hasExternalAssetCdn,
  resolveAssetUrl,
  setOtaAssetConfig,
} from '../utils/assetUrl';

export interface OtaManifest {
  version: string;
  assetRevision: string;
  cdnBaseUrl: string;
  publishedAt: string;
  patchTitle: string;
  patchNotes: string[];
  criticalAssets: string[];
}

export interface InstalledOtaState {
  version: string;
  assetRevision: string;
  lastCheckedAt: string;
  wasUpdatedThisSession: boolean;
  patchTitle: string;
  patchNotes: string[];
}

const OTA_STORAGE_KEY = 'kinetic_ota_installed_state_v1';

const FALLBACK_MANIFEST: OtaManifest = {
  version: '2.5.0-R2',
  assetRevision: '2026.11.20-v18',
  cdnBaseUrl: '',
  publishedAt: '2026-11-20T18:30:00.000Z',
  patchTitle: 'ATUALIZAÇÃO 2.5 · LOJA PREMIUM, AEMONDIR & V18 SPECTRE',
  patchNotes: [
    'Nova Loja Premium com Vitrine 3D, Baús Warface e Passe VIP',
    'Primeira Skin 3D de Shotgun: Aemondir Bucky Legion com baioneta',
    'Nova Arma de Engenheiro: V18 Spectre Silenciada + Chat de Voz da Equipe',
    'Assets 3D otimizados via Cloudflare R2 CDN com barra de download',
  ],
  criticalAssets: [
    '/models/characters/vanguard_rifleman.glb',
    '/models/characters/pro_rifle_pack.glb',
    '/models/weapons/v18_engineer_smg.glb',
    '/models/weapons/shotgun_aemondir_lv1.glb',
  ],
};

function resolveOtaManifestEndpoint(): string {
  // On Capacitor native Android (https://localhost), resolve backend HTTP URL from VITE_WS_SERVER_URL
  const isLocalNativeOrigin =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.protocol === 'capacitor:');
  const wsUrl =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> })
          .env?.VITE_WS_SERVER_URL
      : undefined;

  if (isLocalNativeOrigin && wsUrl && /^wss?:\/\//i.test(wsUrl.trim())) {
    try {
      const parsed = new URL(wsUrl.trim().replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'));
      return `${parsed.origin}/api/ota/manifest?_t=${Date.now()}`;
    } catch {
      // fall back to relative path
    }
  }
  return `/api/ota/manifest?_t=${Date.now()}`;
}

function loadStoredOtaState(): InstalledOtaState | null {
  try {
    const raw = localStorage.getItem(OTA_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InstalledOtaState>;
    if (!parsed || typeof parsed.version !== 'string') return null;
    return {
      version: parsed.version,
      assetRevision: parsed.assetRevision || FALLBACK_MANIFEST.assetRevision,
      lastCheckedAt: parsed.lastCheckedAt || new Date().toISOString(),
      wasUpdatedThisSession: false,
      patchTitle: parsed.patchTitle || FALLBACK_MANIFEST.patchTitle,
      patchNotes: Array.isArray(parsed.patchNotes)
        ? parsed.patchNotes
        : FALLBACK_MANIFEST.patchNotes,
    };
  } catch {
    return null;
  }
}

let currentOtaState: InstalledOtaState = loadStoredOtaState() || {
  version: FALLBACK_MANIFEST.version,
  assetRevision: FALLBACK_MANIFEST.assetRevision,
  lastCheckedAt: new Date().toISOString(),
  wasUpdatedThisSession: false,
  patchTitle: FALLBACK_MANIFEST.patchTitle,
  patchNotes: FALLBACK_MANIFEST.patchNotes,
};

setOtaAssetConfig({
  assetRevision: currentOtaState.assetRevision,
});

export function getInstalledOtaState(): InstalledOtaState {
  return {
    ...currentOtaState,
    patchNotes: [...currentOtaState.patchNotes],
  };
}

async function purgeOutdatedCacheStorage(): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  try {
    const keys = await window.caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('kinetic-') || k.includes('workbox') || k.includes('asset'))
        .map((k) => window.caches.delete(k))
    );
  } catch {
    // Ignore CacheStorage permission errors on restricted WebViews
  }
}

async function fetchRemoteOtaManifest(timeoutMs = 3500): Promise<OtaManifest> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resolveOtaManifestEndpoint(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      return FALLBACK_MANIFEST;
    }
    const data = (await res.json()) as Partial<OtaManifest>;
    return {
      version:
        typeof data.version === 'string' && data.version.trim()
          ? data.version.trim()
          : FALLBACK_MANIFEST.version,
      assetRevision:
        typeof data.assetRevision === 'string' && data.assetRevision.trim()
          ? data.assetRevision.trim()
          : FALLBACK_MANIFEST.assetRevision,
      cdnBaseUrl: typeof data.cdnBaseUrl === 'string' ? data.cdnBaseUrl.trim() : '',
      publishedAt:
        typeof data.publishedAt === 'string'
          ? data.publishedAt
          : FALLBACK_MANIFEST.publishedAt,
      patchTitle:
        typeof data.patchTitle === 'string' && data.patchTitle.trim()
          ? data.patchTitle.trim()
          : FALLBACK_MANIFEST.patchTitle,
      patchNotes:
        Array.isArray(data.patchNotes) && data.patchNotes.length > 0
          ? data.patchNotes.filter((n): n is string => typeof n === 'string')
          : FALLBACK_MANIFEST.patchNotes,
      criticalAssets:
        Array.isArray(data.criticalAssets) && data.criticalAssets.length > 0
          ? data.criticalAssets.filter((a): a is string => typeof a === 'string')
          : FALLBACK_MANIFEST.criticalAssets,
    };
  } catch {
    return FALLBACK_MANIFEST;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Downloads a critical asset with real byte progress into HTTP cache so
 * the player sees exact MB downloaded and the Lobby 3D Operator appears immediately.
 */
async function warmAssetWithProgress(
  resolvedUrl: string,
  onByteProgress: (loadedBytes: number, totalBytes: number) => void,
  timeoutMs = 18000
): Promise<void> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resolvedUrl, {
      method: 'GET',
      cache: 'force-cache',
      signal: controller.signal,
    });
    if (!res.ok) return;
    const total = Number(res.headers.get('content-length') || 0);
    if (!res.body) {
      const buf = await res.arrayBuffer();
      onByteProgress(buf.byteLength, total || buf.byteLength);
      return;
    }
    const reader = res.body.getReader();
    let loaded = 0;
    let lastReportAt = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        loaded += value.byteLength;
        const now = performance.now();
        if (now - lastReportAt > 90) {
          lastReportAt = now;
          onByteProgress(loaded, total);
        }
      }
    }
    onByteProgress(loaded, total || loaded);
  } catch {
    // Non-blocking: GLTFLoader will retry when needed
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Checks `/api/ota/manifest`, configures CDN revision cache-busting,
 * and downloads/verifies updated critical assets with live MB progress.
 */
export async function runOtaUpdateCheck(
  onStep?: (progressPct: number, statusLabel: string, manifest: OtaManifest) => void
): Promise<InstalledOtaState> {
  const stored = loadStoredOtaState();
  onStep?.(4, 'CONECTANDO AO SERVIDOR DE ATUALIZAÇÃO OTA...', FALLBACK_MANIFEST);

  const manifest = await fetchRemoteOtaManifest();
  setOtaAssetConfig({
    assetRevision: manifest.assetRevision,
    cdnBaseUrl: manifest.cdnBaseUrl || getOtaAssetConfig().cdnBaseUrl,
  });

  const isNewPatch =
    !stored ||
    stored.version !== manifest.version ||
    stored.assetRevision !== manifest.assetRevision;
  const shouldDownloadCore = isNewPatch || hasExternalAssetCdn();

  if (isNewPatch) {
    onStep?.(
      8,
      `NOVA ATUALIZAÇÃO v${manifest.version} · LIMPANDO CACHE ANTIGO...`,
      manifest
    );
    await purgeOutdatedCacheStorage();
  }

  if (shouldDownloadCore) {
    const assets = manifest.criticalAssets;
    for (let i = 0; i < assets.length; i++) {
      const assetPath = assets[i];
      const basePct = 10 + Math.round((i / Math.max(1, assets.length)) * 18);
      const stepSpan = Math.max(1, Math.round(18 / Math.max(1, assets.length)));
      const shortName = (assetPath.split('/').pop() || assetPath)
        .replace(/\.glb$/i, '')
        .replace(/_/g, ' ')
        .toUpperCase();
      const resolvedUrl = resolveAssetUrl(assetPath);

      onStep?.(
        basePct,
        `BAIXANDO CDN (${i + 1}/${assets.length}): ${shortName}...`,
        manifest
      );

      await warmAssetWithProgress(resolvedUrl, (loaded, total) => {
        const frac = total > 0 ? Math.min(1, loaded / total) : 0.5;
        const pct = Math.min(28, basePct + Math.round(frac * stepSpan));
        const loadedMb = (loaded / (1024 * 1024)).toFixed(1);
        const totalLabel =
          total > 0 ? ` / ${(total / (1024 * 1024)).toFixed(1)} MB` : ' MB';
        onStep?.(
          pct,
          `BAIXANDO ${shortName} (${i + 1}/${assets.length}) · ${loadedMb}${totalLabel}`,
          manifest
        );
      });
    }
  } else {
    onStep?.(
      24,
      `CLIENTE ATUALIZADO · VERSÃO OTA v${manifest.version}`,
      manifest
    );
  }

  const nextState: InstalledOtaState = {
    version: manifest.version,
    assetRevision: manifest.assetRevision,
    lastCheckedAt: new Date().toISOString(),
    wasUpdatedThisSession: isNewPatch,
    patchTitle: manifest.patchTitle,
    patchNotes: manifest.patchNotes,
  };

  currentOtaState = nextState;
  try {
    localStorage.setItem(OTA_STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage quota errors
  }

  onStep?.(
    30,
    isNewPatch
      ? `ATUALIZAÇÃO v${manifest.version} APLICADA COM SUCESSO!`
      : `RECURSOS CDN PRONTOS · v${manifest.version}`,
    manifest
  );

  return nextState;
}
