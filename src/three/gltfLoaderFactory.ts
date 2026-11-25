/**
 * Shared GLTFLoader for cooked maps and operators.
 * Meshopt opens geometry without the Draco CDN. KTX2/ETC1S uploads as a GPU
 * block. Draco stays for weapons and any file that was not cooked yet, and
 * the decoder is served from the APK (`/draco`), not from the network.
 */

import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import {
  beginAssetDownload,
  endAssetDownload,
  updateAssetDownloadProgress,
} from '../utils/assetDownloadTracker';
import {
  cacheFetchedAssetBuffer,
  fetchChunkedAssetBuffer,
  readCachedAssetBuffer,
} from '../utils/resourcePackManager';
import { getChunkedAssetDescriptor } from '../utils/chunkedAssetRegistry';
import { resolveLocalOrBackendAssetUrl } from '../utils/assetUrl';

const DRACO_DECODER_PATH = '/draco/';
const KTX2_TRANSCODER_PATH = '/basis/';

let meshoptReady: Promise<void> | null = null;
let ktx2Loader: KTX2Loader | null = null;
let sharedDracoLoader: DRACOLoader | null = null;

type LoaderWithDraco = GLTFLoader & { __draco?: DRACOLoader; __ownsDraco?: boolean };

function getSharedDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    sharedDracoLoader.preload();
  }
  return sharedDracoLoader;
}

/** Ensure Meshopt WASM/JS is ready before parsing meshopt GLBs. */
export function ensureMeshoptDecoder(): Promise<void> {
  if (meshoptReady) return meshoptReady;
  const ready = (MeshoptDecoder as { ready?: Promise<void> }).ready;
  meshoptReady = ready ? ready.then(() => undefined) : Promise.resolve();
  return meshoptReady;
}

function getSharedKtx2Loader(): KTX2Loader {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(KTX2_TRANSCODER_PATH);
  }
  return ktx2Loader;
}

/** Call once the match renderer exists, before any cooked GLB is parsed. */
export function attachCompressedTextureSupport(renderer: THREE.WebGLRenderer): void {
  getSharedKtx2Loader().detectSupport(renderer);
}

export function createGameGltfLoader(loadingManager?: THREE.LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(loadingManager) as LoaderWithDraco;
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(getSharedKtx2Loader());
  if (loadingManager) {
    const draco = new DRACOLoader(loadingManager);
    draco.setDecoderPath(DRACO_DECODER_PATH);
    draco.preload();
    loader.setDRACOLoader(draco);
    loader.__draco = draco;
    loader.__ownsDraco = true;
  } else {
    loader.setDRACOLoader(getSharedDracoLoader());
    loader.__ownsDraco = false;
  }

  // Serve downloaded packs straight from persistent Cache Storage (0ms network)
  // and track + persist on-demand GLB downloads into Cache Storage automatically.
  const rawLoad = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    const resourcePath = THREE.LoaderUtils.extractUrlBase(url);
    const manager = loader.manager;

    const runNetworkFallback = () => {
      beginAssetDownload(url);
      rawLoad(
        url,
        (gltf) => {
          endAssetDownload(url);
          onLoad(gltf);
        },
        (ev) => {
          if (ev && typeof ev.loaded === 'number') {
            updateAssetDownloadProgress(
              url,
              ev.loaded,
              ev.lengthComputable ? ev.total : 0
            );
          }
          onProgress?.(ev);
        },
        (err) => {
          endAssetDownload(url);
          onError?.(err);
        }
      );
    };

    void (async () => {
      // 1. Check local persistent Cache Storage first
      const cachedBuffer = await readCachedAssetBuffer(url);
      if (cachedBuffer) {
        manager?.itemStart(url);
        loader.parse(
          cachedBuffer,
          resourcePath,
          (gltf) => {
            manager?.itemEnd(url);
            onLoad(gltf);
          },
          (parseErr) => {
            manager?.itemError(url);
            manager?.itemEnd(url);
            onError?.(parseErr);
          }
        );
        return;
      }

      // 1b. Chunked multi-part asset (e.g. yard_v2_lod0.glb -> 3x 13MB .bin parts)
      if (getChunkedAssetDescriptor(url)) {
        manager?.itemStart(url);
        try {
          const assembled = await fetchChunkedAssetBuffer(url, {
            onProgress: (loaded, total) => {
              onProgress?.(
                new ProgressEvent('progress', {
                  lengthComputable: total > 0,
                  loaded,
                  total,
                })
              );
            },
          });
          if (!assembled || assembled.byteLength === 0) {
            throw new Error('Chunked asset returned empty buffer');
          }
          loader.parse(
            assembled,
            resourcePath,
            (gltf) => {
              manager?.itemEnd(url);
              onLoad(gltf);
            },
            (parseErr) => {
              manager?.itemError(url);
              manager?.itemEnd(url);
              onError?.(parseErr);
            }
          );
          return;
        } catch (chunkErr) {
          manager?.itemError(url);
          manager?.itemEnd(url);
          onError?.(chunkErr);
          return;
        }
      }

      // 2. Fetch + stream progress + save to persistent Cache Storage
      if (typeof fetch !== 'function' || typeof window === 'undefined' || !('caches' in window)) {
        runNetworkFallback();
        return;
      }

      beginAssetDownload(url);
      manager?.itemStart(url);
      try {
        let res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok && url.includes('/models/')) {
          const idx = url.indexOf('/models/');
          const decodedIdx = decodeURIComponent(url).indexOf('/models/');
          const localPath =
            idx >= 0
              ? url.slice(idx).split('?')[0]
              : decodedIdx >= 0
                ? decodeURIComponent(url).slice(decodedIdx).split('?')[0]
                : '';
          if (localPath) {
            const fallbackUrl = resolveLocalOrBackendAssetUrl(localPath);
            if (fallbackUrl && fallbackUrl !== url) {
              const retryRes = await fetch(fallbackUrl, {
                mode: 'cors',
                credentials: 'omit',
              });
              if (retryRes.ok) {
                res = retryRes;
              }
            }
          }
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const total = Number(res.headers.get('content-length') || '0');
        let buffer: ArrayBuffer;

        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              chunks.push(value);
              loaded += value.byteLength;
              updateAssetDownloadProgress(url, loaded, total);
              onProgress?.(
                new ProgressEvent('progress', {
                  lengthComputable: total > 0,
                  loaded,
                  total,
                })
              );
            }
          }
          const merged = new Uint8Array(loaded);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }
          buffer = merged.buffer;
        } else {
          buffer = await res.arrayBuffer();
          updateAssetDownloadProgress(url, buffer.byteLength, total);
        }

        endAssetDownload(url);
        void cacheFetchedAssetBuffer(
          url,
          buffer,
          res.headers.get('content-type') || 'model/gltf-binary'
        );

        loader.parse(
          buffer,
          resourcePath,
          (gltf) => {
            manager?.itemEnd(url);
            onLoad(gltf);
          },
          (parseErr) => {
            manager?.itemError(url);
            manager?.itemEnd(url);
            onError?.(parseErr);
          }
        );
      } catch {
        endAssetDownload(url);
        manager?.itemEnd(url);
        runNetworkFallback();
      }
    })();
  };

  return loader;
}

export function disposeGameGltfLoader(loader: GLTFLoader): void {
  const withDraco = loader as LoaderWithDraco;
  if (withDraco.__ownsDraco) {
    withDraco.__draco?.dispose();
  }
}
