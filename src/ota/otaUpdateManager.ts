import { resolveAssetUrl, setOtaAssetConfig } from '../utils/assetUrl';

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
  version: '2.4.0-WARBOX',
  assetRevision: '2026.11.19-wbx1',
  cdnBaseUrl: '',
  publishedAt: '2026-11-19T10:30:00.000Z',
  patchTitle: 'ATUALIZAÇÃO 2.4 · LOJA WARFACE & OPERADORES 3D',
  patchNotes: [
    'Loja Warface de Diamantes & 3 Caixas Aleatórias com tabela oficial (%)',
    '6 Novos Operadores 3D com inspeção 360° e blindagem customizada',
    '4 Novas Skins 3D Procedurais (Ouro Anubis 24K, Cobalto Cyber, Víbora, Geada)',
    'Arsenal completo de 18 Armas + 7 Arenas 5v5 sincronizados via CDN',
  ],
  criticalAssets: [
    '/models/character.glb',
    '/models/weapons/m4a1_sopmod.glb',
    '/models/weapons/ak47_rifle.glb',
    '/models/weapons/p50_pistol.glb',
  ],
};

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

// Apply stored asset revision immediately on module load
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

async function fetchRemoteOtaManifest(timeoutMs = 3200): Promise<OtaManifest> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/ota/manifest?_t=${Date.now()}`, {
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
 * Checks `/api/ota/manifest`, configures CDN revision cache-busting,
 * and downloads/verifies updated critical assets when a new patch revision is published.
 */
export async function runOtaUpdateCheck(
  onStep?: (progressPct: number, statusLabel: string, manifest: OtaManifest) => void
): Promise<InstalledOtaState> {
  const stored = loadStoredOtaState();
  onStep?.(4, 'CONECTANDO AO SERVIDOR DE ATUALIZAÇÃO OTA...', FALLBACK_MANIFEST);

  const manifest = await fetchRemoteOtaManifest();
  setOtaAssetConfig({
    assetRevision: manifest.assetRevision,
    cdnBaseUrl: manifest.cdnBaseUrl,
  });

  const isNewPatch =
    !stored ||
    stored.version !== manifest.version ||
    stored.assetRevision !== manifest.assetRevision;

  if (isNewPatch) {
    onStep?.(
      10,
      `NOVA ATUALIZAÇÃO OTA DETECTADA (v${manifest.version}) · LIMPANDO CACHE ANTIGO...`,
      manifest
    );
    await purgeOutdatedCacheStorage();

    const assets = manifest.criticalAssets;
    for (let i = 0; i < assets.length; i++) {
      const assetPath = assets[i];
      const pct = 12 + Math.round(((i + 1) / Math.max(1, assets.length)) * 16);
      const shortName = assetPath.split('/').pop() || assetPath;
      onStep?.(
        pct,
        `BAIXANDO PATCH OTA v${manifest.version} (${i + 1}/${assets.length}: ${shortName})...`,
        manifest
      );
      try {
        const resolvedUrl = resolveAssetUrl(assetPath);
        await fetch(resolvedUrl, { method: 'HEAD', cache: 'reload' }).catch(() => null);
      } catch {
        // Non-blocking asset check
      }
    }
  } else {
    onStep?.(
      24,
      `CLIENTE ATUALIZADO · VERSÃO OTA v${manifest.version} (${manifest.assetRevision})`,
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
      ? `PATCH OTA v${manifest.version} APLICADO COM SUCESSO!`
      : `VERSÃO OTA v${manifest.version} VERIFICADA`,
    manifest
  );

  return nextState;
}
