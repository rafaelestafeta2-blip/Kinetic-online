/**
 * Lightweight pub-sub tracker for 3D / CDN asset downloads (Cloudflare R2 / OTA).
 * Zero allocations during 60 FPS gameplay loops — only fires when a network asset
 * starts, streams bytes, or completes.
 */

export interface ActiveAssetDownloadEntry {
  url: string;
  label: string;
  loadedBytes: number;
  totalBytes: number;
  startedAt: number;
}

export interface AssetDownloadSnapshot {
  activeCount: number;
  currentLabel: string;
  loadedBytes: number;
  totalBytes: number;
  progressPct: number; // 0..100
  indeterminate: boolean;
}

type DownloadListener = (snapshot: AssetDownloadSnapshot) => void;

const activeDownloads = new Map<string, ActiveAssetDownloadEntry>();
const listeners = new Set<DownloadListener>();
let emitTimer: ReturnType<typeof setTimeout> | null = null;

function formatFriendlyAssetLabel(url: string): string {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.includes('vanguard_rifleman')) return 'OPERADOR FUZILEIRO 3D';
  if (clean.includes('vanguard_engineer')) return 'OPERADOR ENGENHEIRO 3D';
  if (clean.includes('vanguard_medic')) return 'OPERADOR MÉDICO 3D';
  if (clean.includes('sniper_operator')) return 'OPERADOR SNIPER 3D';
  if (clean.includes('pro_rifle_pack')) return 'PACOTE DE ANIMAÇÕES 3D';
  if (clean.includes('shotgun_aemondir')) return 'SKIN SHOTGUN AEMONDIR';
  if (clean.includes('v18_engineer_smg')) return 'ARMA V18 SPECTRE';
  if (clean.includes('automatic_shotgun')) return 'ESCOPETA SPAS-12 3D';
  if (clean.includes('s_military_ar')) return 'RIFLE SCAR-L 3D';
  if (clean.includes('hangar_2k')) return 'MAPA HANGAR 2K';
  if (clean.includes('eastern_city')) return 'MAPA CIDADE ORIENTAL';
  if (clean.includes('industria')) return 'MAPA INDÚSTRIA';
  if (clean.includes('mirage_anubis')) return 'MAPA MIRAGE ANUBIS';
  if (clean.includes('shooting_range')) return 'ESTANDE DE TIRO 3D';
  if (clean.includes('de_dust2')) return 'MAPA DUST ARENA';
  if (clean.includes('cs_assault')) return 'MAPA ASSAULT';
  if (clean.includes('/scopes/')) return 'MIRA ÓPTICA 3D';
  if (clean.includes('/weapons/')) return 'MODELO DE ARMA 3D';
  if (clean.includes('/maps/')) return 'MAPA TÁTICO 3D';
  if (clean.includes('/characters/')) return 'PERSONAGEM 3D';

  const file = clean.split('/').pop() || 'RECURSO 3D';
  return decodeURIComponent(file).replace(/\.glb$/i, '').toUpperCase();
}

export function getAssetDownloadSnapshot(): AssetDownloadSnapshot {
  if (activeDownloads.size === 0) {
    return {
      activeCount: 0,
      currentLabel: '',
      loadedBytes: 0,
      totalBytes: 0,
      progressPct: 100,
      indeterminate: false,
    };
  }

  let loadedBytes = 0;
  let totalBytes = 0;
  let hasKnownTotal = false;
  let latestEntry: ActiveAssetDownloadEntry | null = null;

  activeDownloads.forEach((entry) => {
    loadedBytes += entry.loadedBytes;
    if (entry.totalBytes > 0) {
      totalBytes += entry.totalBytes;
      hasKnownTotal = true;
    } else if (entry.loadedBytes > 0) {
      // Fallback estimate when server omits Content-Length
      totalBytes += Math.max(entry.loadedBytes * 1.25, 1_500_000);
    }
    if (!latestEntry || entry.startedAt >= latestEntry.startedAt) {
      latestEntry = entry;
    }
  });

  const progressPct =
    totalBytes > 0
      ? Math.min(99, Math.max(1, Math.round((loadedBytes / totalBytes) * 100)))
      : 0;

  return {
    activeCount: activeDownloads.size,
    currentLabel: latestEntry ? (latestEntry as ActiveAssetDownloadEntry).label : 'RECURSOS 3D',
    loadedBytes,
    totalBytes: hasKnownTotal ? totalBytes : 0,
    progressPct,
    indeterminate: !hasKnownTotal && loadedBytes === 0,
  };
}

function scheduleEmit(immediate = false): void {
  if (listeners.size === 0) return;
  if (immediate) {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    const snap = getAssetDownloadSnapshot();
    listeners.forEach((fn) => fn(snap));
    return;
  }
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    const snap = getAssetDownloadSnapshot();
    listeners.forEach((fn) => fn(snap));
  }, 85);
}

export function beginAssetDownload(url: string, customLabel?: string): void {
  if (!url) return;
  activeDownloads.set(url, {
    url,
    label: customLabel || formatFriendlyAssetLabel(url),
    loadedBytes: 0,
    totalBytes: 0,
    startedAt: Date.now(),
  });
  scheduleEmit(true);
}

export function updateAssetDownloadProgress(
  url: string,
  loadedBytes: number,
  totalBytes: number
): void {
  if (!url) return;
  let entry = activeDownloads.get(url);
  if (!entry) {
    entry = {
      url,
      label: formatFriendlyAssetLabel(url),
      loadedBytes: 0,
      totalBytes: 0,
      startedAt: Date.now(),
    };
    activeDownloads.set(url, entry);
  }
  entry.loadedBytes = Math.max(entry.loadedBytes, Math.floor(loadedBytes) || 0);
  if (totalBytes > 0) {
    entry.totalBytes = Math.max(entry.totalBytes, Math.floor(totalBytes));
  }
  scheduleEmit(false);
}

export function endAssetDownload(url: string): void {
  if (!url) return;
  if (activeDownloads.delete(url)) {
    scheduleEmit(true);
  }
}

export function subscribeAssetDownloads(fn: DownloadListener): () => void {
  listeners.add(fn);
  fn(getAssetDownloadSnapshot());
  return () => {
    listeners.delete(fn);
  };
}

export function formatMegabytes(bytes: number): string {
  if (bytes <= 0) return '0.0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
