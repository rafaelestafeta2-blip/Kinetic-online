import * as THREE from 'three';
import { DrillMode } from '../types/game';
import { resolveAssetUrl, resolveLocalOrBackendAssetUrl } from '../utils/assetUrl';
import {
  cacheFetchedAssetBuffer,
  fetchChunkedAssetBuffer,
  readCachedAssetBuffer,
} from '../utils/resourcePackManager';
import { getChunkedAssetDescriptor } from '../utils/chunkedAssetRegistry';

/** Map GLB URLs for bomb arenas — keep in sync with *LevelBuilder LOCAL_URL constants. */
export const MAP_GLB_BY_MODE: Partial<Record<DrillMode, string>> = {
  DUST2_BOMB_5V5: '/models/maps/de_dust2.glb',
  ASSAULT_BOMB_5V5: '/models/maps/cs_assault.glb',
  INDUSTRIA_BOMB_5V5: '/models/maps/industria_2k.glb',
  HANGAR_BOMB_5V5: '/models/maps/hangar_2k.glb',
  EASTERN_CITY_BOMB_5V5: '/models/maps/eastern_city_2k.glb',
  MIRAGE_ANUBIS_BOMB_5V5: '/models/maps/mirage_anubis_2k.glb',
  CSGO_ASSAULT_BOMB_5V5: '/models/maps/mp_csgo_assault_2k.glb',
  DE_DST_BOMB_5V5: '/models/maps/de_dst_2k.glb',
  MP_NUKED_BOMB_5V5: '/models/maps/mp_nuked_2k.glb',
  DE_SUPPLY_BOMB_5V5: '/models/maps/de_supply_2k.glb',
  YARD_V2_BOMB_5V5: '/models/maps/yard_v2_lod0.glb',
  OBJECT_D17_BOMB_5V5: '/models/maps/object_d17_lod0.glb',
  BRIDGES_V2_BOMB_5V5: '/models/maps/bridges_v2_lod0.glb',
  HANGAR_FS_TDM_5V5: '/models/maps/hangar_fs_lod0.glb',
  STATION_CAPTURE_5V5: '/maps/station_arena/Station_Arena.FBX',
  STATION_TDM_5V5: '/maps/station_arena/Station_Arena.FBX',
  FREE_RANGE: '/models/maps/shooting_range_2k.glb',
  MAP_TEST_INDUSTRIA: '/models/maps/industria_2k.glb',
  MAP_TEST_HANGAR: '/models/maps/hangar_2k.glb',
  MAP_TEST_EASTERN: '/models/maps/eastern_city_2k.glb',
  MAP_TEST_MIRAGE: '/models/maps/mirage_anubis_2k.glb',
};

/** Local decoders shipped in the APK. Maps use Meshopt + KTX2; Draco stays for weapons. */
const DECODER_WARM_FILES = [
  '/draco/draco_wasm_wrapper.js',
  '/draco/draco_decoder.wasm',
  '/basis/basis_transcoder.js',
  '/basis/basis_transcoder.wasm',
];

const inflight = new Map<string, Promise<void>>();
let dracoWarm: Promise<void> | null = null;

/** Enable THREE HTTP cache so Loading 2 hits warm GLB bytes (Warface-style). */
export function enableMapAssetCache(): void {
  THREE.Cache.enabled = true;
}

export function getMapGlbUrlForMode(mode: DrillMode): string | null {
  const local = MAP_GLB_BY_MODE[mode];
  return local ? resolveAssetUrl(local) : null;
}

const PREFETCH_FILE_TIMEOUT_MS = 10000;

function loadArrayBuffer(url: string, onProgress?: (ratio0to1: number) => void): Promise<void> {
  if (THREE.Cache.get(url)) {
    onProgress?.(1);
    return Promise.resolve();
  }
  const existing = inflight.get(url);
  if (existing) return existing;

  const isHeavyMapAsset =
    url.includes('/models/') || url.includes('/maps/') || url.includes('models%2F') || url.includes('maps%2F');

  const promise = (async () => {
    if (isHeavyMapAsset) {
      const cachedBuf = await readCachedAssetBuffer(url);
      if (cachedBuf && cachedBuf.byteLength > 0) {
        THREE.Cache.add(url, cachedBuf);
        onProgress?.(1);
        inflight.delete(url);
        return;
      }
      if (getChunkedAssetDescriptor(url)) {
        try {
          const assembled = await fetchChunkedAssetBuffer(url, {
            onProgress: (loaded, total) => {
              if (total > 0) {
                onProgress?.(Math.min(1, loaded / total));
              }
            },
          });
          if (assembled && assembled.byteLength > 0) {
            THREE.Cache.add(url, assembled);
            onProgress?.(1);
          }
        } finally {
          inflight.delete(url);
        }
        return;
      }
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        inflight.delete(url);
        reject(new Error(`Prefetch timeout: ${url}`));
      }, PREFETCH_FILE_TIMEOUT_MS);

      const loader = new THREE.FileLoader();
      loader.setResponseType('arraybuffer');
      loader.load(
        url,
        (data) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          inflight.delete(url);
          if (isHeavyMapAsset && data instanceof ArrayBuffer && data.byteLength > 0) {
            void cacheFetchedAssetBuffer(url, data);
          }
          onProgress?.(1);
          resolve();
        },
        (evt) => {
          if (evt.lengthComputable && evt.total > 0) {
            onProgress?.(Math.min(1, evt.loaded / evt.total));
          }
        },
        (err) => {
          if (settled) return;
          if (url.includes('/models/') || url.includes('models%2F')) {
            const decoded = decodeURIComponent(url);
            const idx = decoded.indexOf('/models/');
            const localPath = idx >= 0 ? decoded.slice(idx).split('?')[0] : '';
            const fallbackUrl = localPath ? resolveLocalOrBackendAssetUrl(localPath) : '';
            if (fallbackUrl && fallbackUrl !== url) {
              loader.load(
                fallbackUrl,
                (data) => {
                  if (settled) return;
                  settled = true;
                  window.clearTimeout(timer);
                  inflight.delete(url);
                  if (isHeavyMapAsset && data instanceof ArrayBuffer && data.byteLength > 0) {
                    void cacheFetchedAssetBuffer(url, data);
                  }
                  onProgress?.(1);
                  resolve();
                },
                undefined,
                (err2) => {
                  if (settled) return;
                  settled = true;
                  window.clearTimeout(timer);
                  inflight.delete(url);
                  reject(err2);
                }
              );
              return;
            }
          }
          settled = true;
          window.clearTimeout(timer);
          inflight.delete(url);
          reject(err);
        }
      );
    });
  })();
  inflight.set(url, promise);
  return promise;
}

/** Warm local Meshopt companions (Draco + Basis) so the first map does not hitch. */
export function prefetchDracoDecoder(): Promise<void> {
  enableMapAssetCache();
  if (dracoWarm) return dracoWarm;
  dracoWarm = Promise.all(
    DECODER_WARM_FILES.map((url) =>
      loadArrayBuffer(url).catch(() => {
        /* prepare retries from the same local path */
      })
    )
  ).then(() => undefined);
  return dracoWarm;
}

/**
 * Prefetch map GLB (+ Draco) for the selected mode.
 * Safe to call from matchmaking / loading screen; prepareMatchArena then hits THREE.Cache.
 */
export async function prefetchMapAssetsForMode(
  mode: DrillMode,
  onProgress?: (ratio0to1: number, label: string) => void
): Promise<void> {
  enableMapAssetCache();
  onProgress?.(0.02, 'AQUECENDO DECODER DO MAPA...');
  await prefetchDracoDecoder();
  const url = getMapGlbUrlForMode(mode);
  if (!url) {
    onProgress?.(1, 'SEM GLB DE ARENA PARA ESTE MODO');
    return;
  }
  const short = url.split('/').pop() || url;
  onProgress?.(0.08, `PRÉ-CARREGANDO ${short.toUpperCase()}...`);
  try {
    await loadArrayBuffer(url, (r) => {
      onProgress?.(0.08 + r * 0.9, `PRÉ-CARREGANDO ${short.toUpperCase()} (${Math.round(r * 100)}%)...`);
    });
    onProgress?.(1, `${short.toUpperCase()} EM CACHE`);
  } catch (err) {
    console.warn('Map GLB prefetch failed (prepare will retry):', url, err);
    onProgress?.(1, 'PREFETCH FALHOU — PREPARE RETRY');
  }
}
