/**
 * Call of Duty-style Resource Pack Download Manager backed by Cache Storage API.
 * Downloads heavy 3D maps, operators, weapons, and accessories from Cloudflare R2 CDN
 * (or local origin fallback) with real byte-level progress, pause/cancel (AbortController),
 * speed tracking, and real storage cleanup.
 */

import { DrillMode } from '../types/game';
import {
  beginAssetDownload,
  endAssetDownload,
  updateAssetDownloadProgress,
} from './assetDownloadTracker';
import { resolveAssetUrl } from './assetUrl';

export const RESOURCE_PACK_CACHE_NAME = 'kinetic-resource-packs-v1';

export type ResourcePackCategory = 'MAPS' | 'OPERATORS' | 'WEAPONS' | 'ACCESSORIES';

export type ResourcePackStatus =
  | 'NOT_DOWNLOADED'
  | 'PARTIAL'
  | 'QUEUED'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'ERROR';

export interface ResourcePackFileEntry {
  path: string;
  sizeBytes: number;
}

export interface ResourcePackDefinition {
  id: string;
  title: string;
  subtitle: string;
  category: ResourcePackCategory;
  recommended?: boolean;
  mapMode?: DrillMode;
  files: ResourcePackFileEntry[];
}

export interface ResourcePackRuntimeState {
  id: string;
  status: ResourcePackStatus;
  cachedBytes: number;
  totalBytes: number;
  cachedFileCount: number;
  totalFileCount: number;
  progressPct: number;
  speedBytesPerSec: number;
  errorMessage: string | null;
}

export interface ResourcePacksSnapshot {
  packs: Array<ResourcePackDefinition & ResourcePackRuntimeState>;
  totalBytesAll: number;
  cachedBytesAll: number;
  downloadedPackCount: number;
  totalPackCount: number;
  activePackId: string | null;
  queuedPackIds: string[];
  activeSpeedBytesPerSec: number;
  activeProgressPct: number;
  isAnyDownloading: boolean;
  cacheSupported: boolean;
  hydrated: boolean;
}

export const RESOURCE_PACK_DEFINITIONS: ResourcePackDefinition[] = [
  {
    id: 'pack_operators',
    title: 'Operadores & Animações 3D',
    subtitle: 'Fuzileiro, Engenheiro, Médico, Sniper e pacote de movimentação',
    category: 'OPERATORS',
    recommended: true,
    files: [
      { path: '/models/characters/vanguard_rifleman.glb', sizeBytes: 3_615_136 },
      { path: '/models/characters/vanguard_engineer.glb', sizeBytes: 3_344_620 },
      { path: '/models/characters/vanguard_medic.glb', sizeBytes: 1_206_932 },
      { path: '/models/characters/sniper_operator.glb', sizeBytes: 3_609_620 },
      { path: '/models/characters/pro_rifle_pack.glb', sizeBytes: 1_912_688 },
    ],
  },
  {
    id: 'pack_weapons_core',
    title: 'Arsenal Principal 1P',
    subtitle: 'Braços 1P, fuzis (M4, AK-47, AK-200, SCAR-L), SMGs, pistolas e faca',
    category: 'WEAPONS',
    recommended: true,
    files: [
      { path: '/models/kinemation/arms_base.glb', sizeBytes: 7_080_584 },
      { path: '/models/fps_ak47.glb', sizeBytes: 7_892_352 },
      { path: '/models/weapons/s_military_ar.glb', sizeBytes: 5_955_480 },
      { path: '/models/kinemation/weapons/mx16a4.glb', sizeBytes: 3_174_572 },
      { path: '/models/kinemation/weapons/ak200.glb', sizeBytes: 2_799_260 },
      { path: '/models/weapons/v18_engineer_smg.glb', sizeBytes: 2_577_488 },
      { path: '/models/fps_animated_carbine.glb', sizeBytes: 2_529_196 },
      { path: '/models/fps_animated_smg.glb', sizeBytes: 2_187_832 },
      { path: '/models/kinemation/weapons/mps5.glb', sizeBytes: 1_545_012 },
      { path: '/models/knife_animated.glb', sizeBytes: 1_372_896 },
      { path: '/models/kinemation/weapons/dgl50.glb', sizeBytes: 1_262_200 },
      { path: '/models/kinemation/weapons/m1911.glb', sizeBytes: 1_198_300 },
    ],
  },
  {
    id: 'pack_weapons_heavy',
    title: 'Snipers, Escopetas, LMG & RPG',
    subtitle: 'AWP, M200, MK14, Kar98k, SPAS-12, Drake-12, Skin Aemondir, LMG e RPG-7',
    category: 'WEAPONS',
    files: [
      { path: '/models/weapons/automatic_shotgun.glb', sizeBytes: 8_243_356 },
      { path: '/models/sniper_fps_animation.glb', sizeBytes: 5_525_496 },
      { path: '/models/kinemation/weapons/mk14.glb', sizeBytes: 4_986_840 },
      { path: '/models/lmg_animated.glb', sizeBytes: 3_791_560 },
      { path: '/models/sniper_animated.glb', sizeBytes: 2_158_384 },
      { path: '/models/kinemation/weapons/rpg7.glb', sizeBytes: 1_307_256 },
      { path: '/models/kinemation/weapons/drake12.glb', sizeBytes: 1_255_676 },
      { path: '/models/kinemation/weapons/kar98k.glb', sizeBytes: 685_452 },
      { path: '/models/weapons/shotgun_aemondir_lv1.glb', sizeBytes: 685_288 },
    ],
  },
  {
    id: 'pack_map_classics',
    title: 'Mapas Clássicos (Dust2, Assault & Station)',
    subtitle: 'Pacote leve para Mata-Mata 5v5, Captura e Bomb clássico',
    category: 'MAPS',
    recommended: true,
    mapMode: 'DUST2_BOMB_5V5',
    files: [
      { path: '/models/maps/cs_assault.glb', sizeBytes: 2_092_836 },
      { path: '/maps/station_arena/Station_Arena.FBX', sizeBytes: 1_284_320 },
      { path: '/models/maps/de_dust2.glb', sizeBytes: 485_108 },
      { path: '/maps/station_arena/Arena_tex01.webp', sizeBytes: 121_610 },
    ],
  },
  {
    id: 'pack_map_hangar',
    title: 'Mapa Hangar 2K',
    subtitle: 'Arena fechada tática Bomb 5v5 com texturas HD',
    category: 'MAPS',
    mapMode: 'HANGAR_BOMB_5V5',
    files: [{ path: '/models/maps/hangar_2k.glb', sizeBytes: 14_887_824 }],
  },
  {
    id: 'pack_map_eastern_city',
    title: 'Mapa Cidade Oriental 2K',
    subtitle: 'Combate urbano em vielas e telhados Bomb 5v5',
    category: 'MAPS',
    mapMode: 'EASTERN_CITY_BOMB_5V5',
    files: [{ path: '/models/maps/eastern_city_2k.glb', sizeBytes: 14_683_332 }],
  },
  {
    id: 'pack_map_shooting_range',
    title: 'Estande de Tiro 2K',
    subtitle: 'Campo de treinamento para testar armas, miras e sensibilidade',
    category: 'MAPS',
    mapMode: 'FREE_RANGE',
    files: [{ path: '/models/maps/shooting_range_2k.glb', sizeBytes: 13_371_608 }],
  },
  {
    id: 'pack_map_industria',
    title: 'Mapa Indústria 2K',
    subtitle: 'Complexo industrial competitivo Bomb 5v5',
    category: 'MAPS',
    mapMode: 'INDUSTRIA_BOMB_5V5',
    files: [{ path: '/models/maps/industria_2k.glb', sizeBytes: 9_762_588 }],
  },
  {
    id: 'pack_map_mirage',
    title: 'Mapa Mirage Anubis 2K',
    subtitle: 'Arena desértica clássica com bombsites A e B',
    category: 'MAPS',
    mapMode: 'MIRAGE_ANUBIS_BOMB_5V5',
    files: [{ path: '/models/maps/mirage_anubis_2k.glb', sizeBytes: 6_502_096 }],
  },
  {
    id: 'pack_accessories',
    title: 'Miras, Silenciadores, Granadas & Kits',
    subtitle: 'Ópticas 3D (Red Dot, Holo, LPVO), supressores, pingentes, C4 e kits de classe',
    category: 'ACCESSORIES',
    files: [
      { path: '/models/accessories/Charm_Honey_Cub.glb', sizeBytes: 2_033_796 },
      { path: '/models/accessories/SC01_Short_Suppressor.glb', sizeBytes: 1_553_860 },
      { path: '/models/accessories/SL01_Slim_Long_Suppressor.glb', sizeBytes: 1_334_460 },
      { path: '/models/accessories/Charm_Micro_Terminal.glb', sizeBytes: 1_329_384 },
      { path: '/models/accessories/MC01_Compact_Compensator.glb', sizeBytes: 1_237_160 },
      { path: '/models/accessories/Charm_Stardrop_Smoke_Teal.glb', sizeBytes: 1_138_340 },
      { path: '/models/accessories/FH01_Petal_Flash_Hider.glb', sizeBytes: 1_125_060 },
      { path: '/models/accessories/MB01_Cut_Muzzle_Brake.glb', sizeBytes: 999_960 },
      { path: '/models/m18_smoke_grenade.glb', sizeBytes: 868_520 },
      { path: '/models/s13_smoke_grenade.glb', sizeBytes: 839_592 },
      { path: '/models/granada_frag.glb', sizeBytes: 761_240 },
      { path: '/models/accessories/scopes/Laser_ANPEQ15.glb', sizeBytes: 756_492 },
      { path: '/models/accessories/scopes/Scope_Tactical_LPVO.glb', sizeBytes: 675_516 },
      { path: '/models/accessories/scopes/Scope_EoTech_Holo.glb', sizeBytes: 599_068 },
      { path: '/models/accessories/scopes/Scope_Kolimator_Reflex.glb', sizeBytes: 463_284 },
      { path: '/models/props/class_kits/armor_plate.glb', sizeBytes: 442_748 },
      { path: '/models/props/class_kits/medkit.glb', sizeBytes: 373_424 },
      { path: '/models/accessories/scopes/Scope_Aimpoint_RedDot.glb', sizeBytes: 372_176 },
      { path: '/models/props/class_kits/ammo_crate.glb', sizeBytes: 314_068 },
      { path: '/models/props/c4_explosive.glb', sizeBytes: 219_952 },
      { path: '/models/accessories/scopes/Silencer_Pack_01.glb', sizeBytes: 162_960 },
    ],
  },
];

type PackListener = (snapshot: ResourcePacksSnapshot) => void;

const listeners = new Set<PackListener>();
const cachedPathSet = new Set<string>();
const packErrors = new Map<string, string>();
const downloadQueue: string[] = [];

let activePackId: string | null = null;
let activeAbortController: AbortController | null = null;
let activePackLoadedBytes = 0;
let activePackTotalBytes = 0;
let activeSpeedBytesPerSec = 0;
let isHydrated = false;
let hydratePromise: Promise<void> | null = null;
let emitTimer: ReturnType<typeof setTimeout> | null = null;

function isCacheApiAvailable(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && Boolean(window.caches);
}

function normalizeAssetKey(urlOrPath: string): string {
  if (!urlOrPath) return '';
  try {
    const parsed = new URL(urlOrPath, window.location.origin);
    // Support Firebase Storage encoded path URLs too
    const decodedPath = decodeURIComponent(parsed.pathname);
    const modelsIdx = decodedPath.indexOf('/models/');
    if (modelsIdx >= 0) return decodedPath.slice(modelsIdx);
    const mapsIdx = decodedPath.indexOf('/maps/');
    if (mapsIdx >= 0) return decodedPath.slice(mapsIdx);
    const soundsIdx = decodedPath.indexOf('/sounds/');
    if (soundsIdx >= 0) return decodedPath.slice(soundsIdx);
    return parsed.pathname;
  } catch {
    return urlOrPath.split('?')[0];
  }
}

function cacheRequestKeyForPath(localPath: string): string {
  // Always use a stable same-origin synthetic key inside Cache Storage so assets
  // stay matched even if CDN domain or query revision shifts slightly, and never
  // fail due to opaque CORS cache keys.
  const clean = normalizeAssetKey(localPath);
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://kinetic.local';
  return `${origin}/__kinetic_pack_cache__${clean}`;
}

export async function readCachedAssetBuffer(
  urlOrPath: string
): Promise<ArrayBuffer | null> {
  if (!isCacheApiAvailable()) return null;
  try {
    const cache = await window.caches.open(RESOURCE_PACK_CACHE_NAME);
    const key = cacheRequestKeyForPath(urlOrPath);
    const match = await cache.match(key);
    if (!match || !match.ok) return null;
    const buffer = await match.arrayBuffer();
    if (buffer.byteLength === 0) return null;
    return buffer;
  } catch {
    return null;
  }
}

export async function isAssetCachedInResourcePacks(
  urlOrPath: string
): Promise<boolean> {
  if (!isHydrated) {
    await hydrateResourcePacksFromCache();
  }
  const normalized = normalizeAssetKey(urlOrPath);
  if (cachedPathSet.has(normalized)) {
    return true;
  }
  const buffer = await readCachedAssetBuffer(urlOrPath);
  if (buffer && buffer.byteLength > 0) {
    cachedPathSet.add(normalized);
    return true;
  }
  return false;
}

export async function cacheFetchedAssetBuffer(
  urlOrPath: string,
  buffer: ArrayBuffer,
  contentType = 'model/gltf-binary'
): Promise<void> {
  if (!isCacheApiAvailable() || !buffer || buffer.byteLength === 0) return;
  try {
    const cache = await window.caches.open(RESOURCE_PACK_CACHE_NAME);
    const key = cacheRequestKeyForPath(urlOrPath);
    const response = new Response(buffer.slice(0), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'X-Kinetic-Cached-At': String(Date.now()),
      },
    });
    await cache.put(key, response);
    const normalized = normalizeAssetKey(urlOrPath);
    if (!cachedPathSet.has(normalized)) {
      cachedPathSet.add(normalized);
      scheduleEmit(true);
    }
  } catch {
    // Storage quota exceeded or restricted private browsing — fail gracefully
  }
}

export async function hydrateResourcePacksFromCache(): Promise<void> {
  if (!isCacheApiAvailable()) {
    isHydrated = true;
    scheduleEmit(true);
    return;
  }
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const cache = await window.caches.open(RESOURCE_PACK_CACHE_NAME);
      const keys = await cache.keys();
      cachedPathSet.clear();
      for (const req of keys) {
        const idx = req.url.indexOf('/__kinetic_pack_cache__');
        if (idx >= 0) {
          const path = req.url.slice(idx + '/__kinetic_pack_cache__'.length);
          cachedPathSet.add(path);
        }
      }
    } catch {
      // Ignore cache access errors
    } finally {
      isHydrated = true;
      hydratePromise = null;
      scheduleEmit(true);
    }
  })();
  return hydratePromise;
}

function buildPackRuntimeState(def: ResourcePackDefinition): ResourcePackRuntimeState {
  const totalFileCount = def.files.length;
  const totalBytes = def.files.reduce((sum, f) => sum + f.sizeBytes, 0);

  let cachedFileCount = 0;
  let cachedBytes = 0;
  for (const file of def.files) {
    if (cachedPathSet.has(file.path)) {
      cachedFileCount += 1;
      cachedBytes += file.sizeBytes;
    }
  }

  const isDownloading = activePackId === def.id;
  const isQueued = downloadQueue.includes(def.id);
  const errorMessage = packErrors.get(def.id) || null;

  if (isDownloading) {
    const effectiveTotal = Math.max(totalBytes, activePackTotalBytes, 1);
    const effectiveLoaded = Math.min(effectiveTotal, Math.max(cachedBytes, activePackLoadedBytes));
    const pct = Math.min(99, Math.max(1, Math.round((effectiveLoaded / effectiveTotal) * 100)));
    return {
      id: def.id,
      status: 'DOWNLOADING',
      cachedBytes: effectiveLoaded,
      totalBytes: effectiveTotal,
      cachedFileCount,
      totalFileCount,
      progressPct: pct,
      speedBytesPerSec: activeSpeedBytesPerSec,
      errorMessage: null,
    };
  }

  if (cachedFileCount >= totalFileCount && totalFileCount > 0) {
    return {
      id: def.id,
      status: 'DOWNLOADED',
      cachedBytes: totalBytes,
      totalBytes,
      cachedFileCount: totalFileCount,
      totalFileCount,
      progressPct: 100,
      speedBytesPerSec: 0,
      errorMessage: null,
    };
  }

  if (isQueued) {
    const pct = totalBytes > 0 ? Math.round((cachedBytes / totalBytes) * 100) : 0;
    return {
      id: def.id,
      status: 'QUEUED',
      cachedBytes,
      totalBytes,
      cachedFileCount,
      totalFileCount,
      progressPct: pct,
      speedBytesPerSec: 0,
      errorMessage: null,
    };
  }

  if (errorMessage) {
    const pct = totalBytes > 0 ? Math.round((cachedBytes / totalBytes) * 100) : 0;
    return {
      id: def.id,
      status: 'ERROR',
      cachedBytes,
      totalBytes,
      cachedFileCount,
      totalFileCount,
      progressPct: pct,
      speedBytesPerSec: 0,
      errorMessage,
    };
  }

  const pct = totalBytes > 0 ? Math.round((cachedBytes / totalBytes) * 100) : 0;
  return {
    id: def.id,
    status: cachedFileCount > 0 ? 'PARTIAL' : 'NOT_DOWNLOADED',
    cachedBytes,
    totalBytes,
    cachedFileCount,
    totalFileCount,
    progressPct: pct,
    speedBytesPerSec: 0,
    errorMessage: null,
  };
}

export function getResourcePacksSnapshot(): ResourcePacksSnapshot {
  const packs = RESOURCE_PACK_DEFINITIONS.map((def) => ({
    ...def,
    ...buildPackRuntimeState(def),
  }));

  let totalBytesAll = 0;
  let cachedBytesAll = 0;
  let downloadedPackCount = 0;
  let activeProgressPct = 0;

  for (const p of packs) {
    totalBytesAll += p.totalBytes;
    cachedBytesAll += p.cachedBytes;
    if (p.status === 'DOWNLOADED') downloadedPackCount += 1;
    if (p.id === activePackId) activeProgressPct = p.progressPct;
  }

  return {
    packs,
    totalBytesAll,
    cachedBytesAll,
    downloadedPackCount,
    totalPackCount: packs.length,
    activePackId,
    queuedPackIds: [...downloadQueue],
    activeSpeedBytesPerSec,
    activeProgressPct,
    isAnyDownloading: activePackId !== null,
    cacheSupported: isCacheApiAvailable(),
    hydrated: isHydrated,
  };
}

function scheduleEmit(immediate = false): void {
  if (listeners.size === 0) return;
  if (immediate) {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    const snap = getResourcePacksSnapshot();
    listeners.forEach((fn) => fn(snap));
    return;
  }
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    const snap = getResourcePacksSnapshot();
    listeners.forEach((fn) => fn(snap));
  }, 90);
}

async function fetchAndStoreSingleFile(
  file: ResourcePackFileEntry,
  signal: AbortSignal,
  onDeltaBytes: (delta: number) => void
): Promise<void> {
  const resolvedUrl = resolveAssetUrl(file.path);
  beginAssetDownload(resolvedUrl);

  try {
    const response = await fetch(resolvedUrl, {
      mode: 'cors',
      credentials: 'omit',
      signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao baixar ${file.path}`);
    }

    const headerLen = Number(response.headers.get('content-length') || '0');
    const expectedTotal = headerLen > 0 ? headerLen : file.sizeBytes;
    const contentType = response.headers.get('content-type') || 'model/gltf-binary';

    let finalBuffer: ArrayBuffer;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          chunks.push(value);
          received += value.byteLength;
          updateAssetDownloadProgress(resolvedUrl, received, expectedTotal);
          onDeltaBytes(value.byteLength);
        }
      }

      const merged = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      finalBuffer = merged.buffer;
    } else {
      finalBuffer = await response.arrayBuffer();
      updateAssetDownloadProgress(resolvedUrl, finalBuffer.byteLength, expectedTotal);
      onDeltaBytes(finalBuffer.byteLength);
    }

    await cacheFetchedAssetBuffer(file.path, finalBuffer, contentType);
  } finally {
    endAssetDownload(resolvedUrl);
  }
}

async function processDownloadQueue(): Promise<void> {
  if (activePackId !== null) return;
  if (downloadQueue.length === 0) return;

  const nextId = downloadQueue.shift()!;
  const def = RESOURCE_PACK_DEFINITIONS.find((p) => p.id === nextId);
  if (!def) {
    void processDownloadQueue();
    return;
  }

  packErrors.delete(def.id);
  activePackId = def.id;
  activePackTotalBytes = def.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  activePackLoadedBytes = def.files.reduce(
    (sum, f) => (cachedPathSet.has(f.path) ? sum + f.sizeBytes : sum),
    0
  );
  activeSpeedBytesPerSec = 0;
  activeAbortController = new AbortController();
  scheduleEmit(true);

  let windowBytes = 0;
  let windowStart = performance.now();

  try {
    for (const file of def.files) {
      if (activeAbortController.signal.aborted) break;
      if (cachedPathSet.has(file.path)) continue;

      await fetchAndStoreSingleFile(file, activeAbortController.signal, (delta) => {
        activePackLoadedBytes += delta;
        windowBytes += delta;
        const now = performance.now();
        const dt = now - windowStart;
        if (dt >= 350) {
          activeSpeedBytesPerSec = Math.round((windowBytes / dt) * 1000);
          windowBytes = 0;
          windowStart = now;
        }
        scheduleEmit(false);
      });
    }
  } catch (err) {
    const isAbort =
      activeAbortController?.signal.aborted ||
      (err instanceof DOMException && err.name === 'AbortError');
    if (!isAbort) {
      const msg =
        err instanceof Error ? err.message : 'Falha de conexão com o servidor CDN.';
      packErrors.set(def.id, msg);
    }
  } finally {
    activePackId = null;
    activeAbortController = null;
    activePackLoadedBytes = 0;
    activePackTotalBytes = 0;
    activeSpeedBytesPerSec = 0;
    scheduleEmit(true);
    if (downloadQueue.length > 0) {
      void processDownloadQueue();
    }
  }
}

export function enqueuePackDownload(packId: string): void {
  const def = RESOURCE_PACK_DEFINITIONS.find((p) => p.id === packId);
  if (!def) return;
  const state = buildPackRuntimeState(def);
  if (state.status === 'DOWNLOADED' || state.status === 'DOWNLOADING' || state.status === 'QUEUED') {
    return;
  }
  packErrors.delete(packId);
  downloadQueue.push(packId);
  scheduleEmit(true);
  void processDownloadQueue();
}

export function enqueueAllPendingPacks(): void {
  for (const def of RESOURCE_PACK_DEFINITIONS) {
    const st = buildPackRuntimeState(def);
    if (st.status !== 'DOWNLOADED' && st.status !== 'DOWNLOADING' && st.status !== 'QUEUED') {
      packErrors.delete(def.id);
      downloadQueue.push(def.id);
    }
  }
  scheduleEmit(true);
  void processDownloadQueue();
}

export function cancelPackDownload(packId: string): void {
  const qIdx = downloadQueue.indexOf(packId);
  if (qIdx >= 0) {
    downloadQueue.splice(qIdx, 1);
  }
  if (activePackId === packId && activeAbortController) {
    activeAbortController.abort();
  }
  scheduleEmit(true);
}

export function cancelAllPackDownloads(): void {
  downloadQueue.length = 0;
  if (activeAbortController) {
    activeAbortController.abort();
  }
  scheduleEmit(true);
}

export async function deletePackFromCache(packId: string): Promise<void> {
  cancelPackDownload(packId);
  const def = RESOURCE_PACK_DEFINITIONS.find((p) => p.id === packId);
  if (!def) return;

  if (isCacheApiAvailable()) {
    try {
      const cache = await window.caches.open(RESOURCE_PACK_CACHE_NAME);
      for (const file of def.files) {
        await cache.delete(cacheRequestKeyForPath(file.path));
        cachedPathSet.delete(file.path);
      }
    } catch {
      // Ignore cache delete failure
    }
  } else {
    for (const file of def.files) {
      cachedPathSet.delete(file.path);
    }
  }
  packErrors.delete(packId);
  scheduleEmit(true);
}

export async function clearAllResourcePackCache(): Promise<void> {
  cancelAllPackDownloads();
  if (isCacheApiAvailable()) {
    try {
      await window.caches.delete(RESOURCE_PACK_CACHE_NAME);
    } catch {
      // Ignore delete error
    }
  }
  cachedPathSet.clear();
  packErrors.clear();
  scheduleEmit(true);
}

export function subscribeResourcePacks(listener: PackListener): () => void {
  listeners.add(listener);
  if (!isHydrated) {
    void hydrateResourcePacksFromCache();
  }
  listener(getResourcePacksSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function formatSpeedLabel(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '';
  if (bytesPerSec >= 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
  return `${Math.max(1, Math.round(bytesPerSec / 1024))} KB/s`;
}
