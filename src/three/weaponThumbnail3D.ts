import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCOPE_PACK_CATALOG, SCOPE_PACK_ORDER } from '../progression/loadoutSystem';
import { OpticType, WeaponId } from '../types/game';
import { buildLevel3DWeaponPreviewGroup } from './botWeaponProps';
import { createGameGltfLoader } from './gltfLoaderFactory';
import {
  createSecondaryWebGLRenderer,
  disposeSecondaryWebGLRenderer,
} from './webglContextGuard';

const THUMB_W = 480;
const THUMB_H = 200;

const thumbnailCache = new Map<WeaponId, string>();
const inFlightCache = new Map<WeaponId, Promise<string | null>>();
const scopeThumbnailCache = new Map<OpticType, string>();
const scopeInFlightCache = new Map<OpticType, Promise<string | null>>();
const sharedScopeGltfLoader = createGameGltfLoader();
let renderQueue: Promise<unknown> = Promise.resolve();

interface SharedStudioRig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  pivot: THREE.Group;
  envTex: THREE.Texture;
}

let sharedRig: SharedStudioRig | null = null;

function getSharedStudioRig(): SharedStudioRig | null {
  if (sharedRig) return sharedRig;
  if (typeof document === 'undefined') return null;

  try {
    const renderer = createSecondaryWebGLRenderer({
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(THUMB_W, THUMB_H, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.38;
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.35);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.8);
    keyLight.position.set(1.4, 2.2, 3.2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.9);
    rimLight.position.set(-2.2, 1.6, -2.5);
    scene.add(rimLight);

    const orangeAccent = new THREE.DirectionalLight(0xfb923c, 1.0);
    orangeAccent.position.set(2.5, -0.8, 1.6);
    scene.add(orangeAccent);

    const pivot = new THREE.Group();
    scene.add(pivot);

    const camera = new THREE.PerspectiveCamera(26, THUMB_W / THUMB_H, 0.02, 20);
    sharedRig = { renderer, scene, camera, pivot, envTex };
    return sharedRig;
  } catch {
    return null;
  }
}

async function renderWeaponThumbnailInternal(
  weaponId: WeaponId
): Promise<string | null> {
  const existing = thumbnailCache.get(weaponId);
  if (existing) return existing;

  const model = await buildLevel3DWeaponPreviewGroup(weaponId);
  if (!model) return null;

  return new Promise<string | null>((resolve) => {
    renderQueue = renderQueue.then(() => {
      const rig = getSharedStudioRig();
      if (!rig) {
        resolve(null);
        return;
      }

      const { renderer, scene, camera, pivot } = rig;
      while (pivot.children.length > 0) {
        pivot.remove(pivot.children[0]);
      }

      // Orienta a arma em perfil 3/4 lateral clássico (cano apontando para a direita)
      const orientGroup = new THREE.Group();
      orientGroup.add(model);
      orientGroup.rotation.order = 'YXZ';
      orientGroup.rotation.y = Math.PI * 0.44;
      orientGroup.rotation.x = 0.04;
      orientGroup.rotation.z = -0.02;
      pivot.add(orientGroup);
      pivot.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(pivot);
      if (box.isEmpty()) {
        pivot.remove(orientGroup);
        resolve(null);
        return;
      }

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      orientGroup.position.sub(center);
      pivot.updateMatrixWorld(true);

      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const halfH = Math.max(size.y * 0.5, 0.05);
      const halfW = Math.max(size.x * 0.5, 0.08);
      const distY = halfH / (Math.tan(vFovRad * 0.5) * 0.78);
      const distX =
        halfW / (Math.tan(vFovRad * 0.5) * camera.aspect * 0.86);
      const camDist = Math.max(distX, distY) + size.z * 0.5;

      camera.position.set(0, 0.015 * size.y, camDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      pivot.remove(orientGroup);

      thumbnailCache.set(weaponId, dataUrl);
      resolve(dataUrl);
    });
  });
}

export function getCachedWeaponThumbnail3D(weaponId: WeaponId): string | null {
  return thumbnailCache.get(weaponId) || null;
}

export function requestWeaponThumbnail3D(
  weaponId: WeaponId
): Promise<string | null> {
  const cached = thumbnailCache.get(weaponId);
  if (cached) return Promise.resolve(cached);

  const inFlight = inFlightCache.get(weaponId);
  if (inFlight) return inFlight;

  const promise = renderWeaponThumbnailInternal(weaponId).finally(() => {
    inFlightCache.delete(weaponId);
  });
  inFlightCache.set(weaponId, promise);
  return promise;
}

export function useWeaponThumbnail3D(weaponId: WeaponId): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    getCachedWeaponThumbnail3D(weaponId)
  );

  useEffect(() => {
    const cached = getCachedWeaponThumbnail3D(weaponId);
    setUrl(cached);
    if (cached) return;

    let cancelled = false;
    void requestWeaponThumbnail3D(weaponId).then((res) => {
      if (!cancelled && res) {
        setUrl(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [weaponId]);

  return url;
}

export function preloadAllWeaponThumbnails3D(ids: WeaponId[]): void {
  for (const id of ids) {
    void requestWeaponThumbnail3D(id);
  }
}

function buildProceduralIronSightPreviewGroup(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x262c36,
    metalness: 0.78,
    roughness: 0.34,
  });
  const screwMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.85,
    roughness: 0.28,
  });
  const fiberMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  });

  // Base Picatinny de montagem
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.014, 0.036), bodyMat);
  base.position.set(0, 0, 0);
  g.add(base);

  const clampBolt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.044, 12),
    screwMat
  );
  clampBolt.rotation.x = Math.PI * 0.5;
  clampBolt.position.set(-0.01, -0.001, 0);
  g.add(clampBolt);

  // Torre e anel Ghost-Ring traseiro
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, 0.032), bodyMat);
  tower.position.set(-0.01, 0.017, 0);
  g.add(tower);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0038, 12, 24), bodyMat);
  ring.rotation.y = Math.PI * 0.5;
  ring.position.set(-0.01, 0.038, 0);
  g.add(ring);

  // Orelhas laterais de proteção + tambor de ajuste
  const earL = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.026, 0.004), bodyMat);
  earL.position.set(-0.01, 0.037, -0.018);
  const earR = earL.clone();
  earR.position.z = 0.018;
  g.add(earL, earR);

  const windageKnob = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0065, 0.0065, 0.012, 12),
    screwMat
  );
  windageKnob.rotation.x = Math.PI * 0.5;
  windageKnob.position.set(-0.01, 0.024, 0.02);
  g.add(windageKnob);

  // Massa de mira frontal com pino de fibra óptica laranja
  const frontTower = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.022, 0.022), bodyMat);
  frontTower.position.set(0.024, 0.016, 0);
  const frontPost = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.014, 10), fiberMat);
  frontPost.position.set(0.024, 0.031, 0);
  g.add(frontTower, frontPost);

  return g;
}

function configureScopeThumbScene(root: THREE.Object3D): void {
  root.traverse((child) => {
    const m = child as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false;
    const fixMat = (mat: THREE.Material) => {
      const std = mat as THREE.MeshStandardMaterial;
      if (!std) return;
      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.needsUpdate = true;
      }
      if (std.emissiveMap) {
        std.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        std.emissiveMap.needsUpdate = true;
      }
      const mName = (std.name || m.name || '').toLowerCase();
      if (mName.includes('glass')) {
        std.transparent = true;
        std.opacity = 0.16;
        std.depthWrite = false;
        std.side = THREE.FrontSide;
        m.renderOrder = 14;
      } else if (mName.includes('reticle')) {
        std.transparent = true;
        std.opacity = 0.98;
        std.depthWrite = false;
        std.side = THREE.DoubleSide;
        m.renderOrder = 15;
      } else {
        std.transparent = false;
        std.depthWrite = true;
        std.side = THREE.FrontSide;
      }
      std.needsUpdate = true;
    };
    if (Array.isArray(m.material)) {
      m.material.forEach(fixMat);
    } else if (m.material) {
      fixMat(m.material);
    }
  });
}

async function renderScopeThumbnailInternal(
  opticId: OpticType
): Promise<string | null> {
  const existing = scopeThumbnailCache.get(opticId);
  if (existing) return existing;

  const spec = SCOPE_PACK_CATALOG[opticId];
  let scopeModel: THREE.Object3D | null = null;

  if (!spec?.modelUrl) {
    scopeModel = buildProceduralIronSightPreviewGroup();
  } else {
    try {
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        sharedScopeGltfLoader.load(
          spec.modelUrl!,
          (res) => resolve(res),
          undefined,
          (err) => reject(err)
        );
      });
      scopeModel = gltf.scene;
      configureScopeThumbScene(scopeModel);
    } catch {
      return null;
    }
  }

  if (!scopeModel) return null;

  return new Promise<string | null>((resolve) => {
    renderQueue = renderQueue.then(() => {
      const rig = getSharedStudioRig();
      if (!rig) {
        resolve(null);
        return;
      }

      const { renderer, scene, camera, pivot } = rig;
      while (pivot.children.length > 0) {
        pivot.remove(pivot.children[0]);
      }

      const orientGroup = new THREE.Group();
      orientGroup.add(scopeModel!);
      orientGroup.rotation.order = 'YXZ';
      orientGroup.rotation.y = Math.PI * 0.34;
      orientGroup.rotation.x = 0.14;
      orientGroup.rotation.z = -0.02;
      pivot.add(orientGroup);
      pivot.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(pivot);
      if (box.isEmpty()) {
        pivot.remove(orientGroup);
        resolve(null);
        return;
      }

      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);
      orientGroup.position.sub(center);
      pivot.updateMatrixWorld(true);

      const vFovRad = THREE.MathUtils.degToRad(camera.fov);
      const halfH = Math.max(size.y * 0.5, 0.01);
      const halfW = Math.max(size.x * 0.5, 0.015);
      const distY = halfH / (Math.tan(vFovRad * 0.5) * 0.78);
      const distX = halfW / (Math.tan(vFovRad * 0.5) * camera.aspect * 0.8);
      const camDist = Math.max(distX, distY) + size.z * 0.55;

      camera.position.set(0, 0.01 * size.y, camDist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      pivot.remove(orientGroup);

      scopeThumbnailCache.set(opticId, dataUrl);
      resolve(dataUrl);
    });
  });
}

export function getCachedScopeThumbnail3D(opticId: OpticType): string | null {
  return scopeThumbnailCache.get(opticId) || null;
}

export function requestScopeThumbnail3D(
  opticId: OpticType
): Promise<string | null> {
  const cached = scopeThumbnailCache.get(opticId);
  if (cached) return Promise.resolve(cached);

  const inFlight = scopeInFlightCache.get(opticId);
  if (inFlight) return inFlight;

  const promise = renderScopeThumbnailInternal(opticId).finally(() => {
    scopeInFlightCache.delete(opticId);
  });
  scopeInFlightCache.set(opticId, promise);
  return promise;
}

export function useScopeThumbnail3D(opticId: OpticType): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    getCachedScopeThumbnail3D(opticId)
  );

  useEffect(() => {
    const cached = getCachedScopeThumbnail3D(opticId);
    setUrl(cached);
    if (cached) return;

    let cancelled = false;
    void requestScopeThumbnail3D(opticId).then((res) => {
      if (!cancelled && res) {
        setUrl(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [opticId]);

  return url;
}

export function preloadAllScopeThumbnails3D(): void {
  for (const opticId of SCOPE_PACK_ORDER) {
    void requestScopeThumbnail3D(opticId);
  }
}
