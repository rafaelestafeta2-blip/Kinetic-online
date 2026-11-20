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

/** Call once the match renderer exists, before any cooked GLB is parsed. */
export function attachCompressedTextureSupport(renderer: THREE.WebGLRenderer): void {
  if (!ktx2Loader) {
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(KTX2_TRANSCODER_PATH);
  }
  ktx2Loader.detectSupport(renderer);
}

export function createGameGltfLoader(loadingManager?: THREE.LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(loadingManager) as LoaderWithDraco;
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (ktx2Loader) loader.setKTX2Loader(ktx2Loader);
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

  // Track real byte-level download progress for every GLB fetched from CDN/local
  const rawLoad = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
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

  return loader;
}

export function disposeGameGltfLoader(loader: GLTFLoader): void {
  const withDraco = loader as LoaderWithDraco;
  if (withDraco.__ownsDraco) {
    withDraco.__draco?.dispose();
  }
}
