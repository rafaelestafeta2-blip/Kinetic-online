/**
 * applyGraphicsToEngine.ts
 * Aplica opções gráficas e de vibração no motor sem alterar a API pública de fpsEngine.ts.
 * Acessa membros internos via cast seguro e armazena estado por instância (WeakMap).
 */

import * as THREE from 'three';
import { mobileHardware } from '../mobile/nativeHardware';
import { isMobileGpuTarget } from '../three/gpuBudget';
import { QualityPreset as EngineQualityPreset } from '../types/game';
import { GameSettings, ShadowQuality } from './graphicsSettings';

interface InternalEngineAccess {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  keyLight: THREE.DirectionalLight;
  weaponRig: {
    muzzleLight: THREE.PointLight;
  };
  currentRenderScale: number;
  configurePostFx?: (opts: {
    enabled: boolean;
    sharpen?: number;
  }) => void;
  state: {
    fpsLimit: number;
    dynamicResolutionEnabled: boolean;
    renderScalePercent: number;
    qualityPreset: EngineQualityPreset;
    hapticsEnabled: boolean;
  };
}

interface EngineGraphicsCache {
  lastShadowQuality: ShadowQuality | null;
  lastAcesToneMapping: boolean | null;
  lastTextureQuality: GameSettings['textures'] | null;
  lastAnisotropy: number | null;
  lastResolutionMode: GameSettings['resolution'] | null;
  cachedEnvironmentTex: THREE.Texture | null;
}

const engineCacheMap = new WeakMap<object, EngineGraphicsCache>();

// Armazena referências originais de normal/bump maps para restauração
const originalMaps = new WeakMap<
  THREE.Material,
  {
    normalMap: THREE.Texture | null;
    bumpMap: THREE.Texture | null;
  }
>();

const PBR_TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
] as const;

export function applyGraphicsToEngine(
  rawEngine: unknown,
  settings: GameSettings
): void {
  if (!rawEngine || typeof rawEngine !== 'object') return;
  const engine = rawEngine as InternalEngineAccess;
  const renderer = engine.renderer;
  const scene = engine.scene;
  const camera = engine.camera;
  const keyLight = engine.keyLight;
  const weaponRig = engine.weaponRig;

  if (!renderer || !scene || !camera) return;

  let cache = engineCacheMap.get(rawEngine);
  if (!cache) {
    cache = {
      lastShadowQuality: null,
      lastAcesToneMapping: null,
      lastTextureQuality: null,
      lastAnisotropy: null,
      lastResolutionMode: null,
      cachedEnvironmentTex: scene.environment || null,
    };
    engineCacheMap.set(rawEngine, cache);
  }

  // 0. Vibração (Haptics) — Fonte única de verdade
  engine.state.hapticsEnabled = settings.vibration;
  mobileHardware.hapticsEnabled = settings.vibration;

  // Post-FX only on HIGH/ULTRA-ish paths; never with battery saver or 30fps LOW.
  const postEnabled =
    settings.tacticalPostFx &&
    !settings.batterySaver &&
    settings.fpsLimit !== 30 &&
    settings.resolution !== 'SCALE_50';
  if (typeof engine.configurePostFx === 'function') {
    engine.configurePostFx({
      enabled: postEnabled,
      sharpen: settings.preset === 'ULTRA' || settings.textures === 'ULTRA' ? 0.7 : 0.55,
    });
  }

  // Economia de bateria força fpsLimit 30, sombras no máximo LOW e muzzleLight desligada
  const effectiveFpsLimit = settings.batterySaver ? 30 : settings.fpsLimit;
  const effectiveShadows: ShadowQuality = settings.batterySaver
    ? settings.shadows === 'OFF'
      ? 'OFF'
      : 'LOW'
    : settings.shadows;
  const effectiveMuzzleLight = settings.batterySaver
    ? false
    : settings.muzzleLight;

  // 1. Limite de FPS e Resolução Dinâmica (DRS)
  engine.state.fpsLimit = effectiveFpsLimit;

  const isMobile = isMobileGpuTarget();
  const maxDpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2.0);
  let autoCeiling = maxDpr;

  if (settings.resolution === 'AUTO_ECO') {
    engine.state.qualityPreset = 'COMPETITIVE_120';
    autoCeiling = Math.min(maxDpr, isMobile ? 1.1 : 1.35);
  } else if (settings.resolution === 'AUTO_BALANCED') {
    engine.state.qualityPreset = 'BALANCED_60';
    // 1.32 DPR + CAS sharpen on 6.5" mobile displays matches 1.65 visual sharpness at ~36% fewer pixels
    autoCeiling = Math.min(maxDpr, isMobile ? 1.32 : 1.65);
  } else if (settings.resolution === 'AUTO_MAX') {
    engine.state.qualityPreset = 'ULTRA_PBR';
    autoCeiling = Math.min(maxDpr, isMobile ? 1.55 : 2.0);
  }

  const resModeChanged = cache.lastResolutionMode !== settings.resolution;
  cache.lastResolutionMode = settings.resolution;

  let resolvedScale = engine.currentRenderScale > 0 ? engine.currentRenderScale : autoCeiling;
  let enableDrs = true;

  if (effectiveFpsLimit === 30 || settings.batterySaver) {
    enableDrs = false;
    if (settings.resolution.startsWith('SCALE_')) {
      const pct =
        parseInt(settings.resolution.replace('SCALE_', ''), 10) || 100;
      resolvedScale = maxDpr * (pct / 100);
    } else {
      resolvedScale = resModeChanged ? autoCeiling : Math.min(resolvedScale, autoCeiling);
    }
  } else if (settings.resolution.startsWith('SCALE_')) {
    enableDrs = false;
    const pct = parseInt(settings.resolution.replace('SCALE_', ''), 10) || 100;
    resolvedScale = maxDpr * (pct / 100);
  } else {
    enableDrs = true;
    resolvedScale = resModeChanged ? autoCeiling : Math.min(resolvedScale, autoCeiling);
  }

  engine.state.dynamicResolutionEnabled = enableDrs;
  engine.currentRenderScale = resolvedScale;
  if (Math.abs(renderer.getPixelRatio() - resolvedScale) > 0.001) {
    renderer.setPixelRatio(resolvedScale);
  }
  engine.state.renderScalePercent = Math.round((resolvedScale / maxDpr) * 100);

  let forceAllMaterialsNeedsUpdate = false;

  const currentDrillMode = (engine.state as { drillMode?: string }).drillMode;
  const isYardV2Mode = currentDrillMode === 'YARD_V2_BOMB_5V5';

  // 2. Tonalidade ACES Filmic vs Linear
  const targetToneMapping = settings.acesToneMapping
    ? THREE.ACESFilmicToneMapping
    : THREE.LinearToneMapping;
  const targetExposure = isYardV2Mode
    ? settings.acesToneMapping
      ? 1.12
      : 0.96
    : settings.acesToneMapping
      ? 0.92
      : 0.78;
  if (
    cache.lastAcesToneMapping !== settings.acesToneMapping ||
    renderer.toneMapping !== targetToneMapping
  ) {
    cache.lastAcesToneMapping = settings.acesToneMapping;
    renderer.toneMapping = targetToneMapping;
    forceAllMaterialsNeedsUpdate = true;
  }
  if (Math.abs(renderer.toneMappingExposure - targetExposure) > 0.005) {
    renderer.toneMappingExposure = targetExposure;
  }

  // 3. Sombras (PCFShadowMap, mapSize e reconstrução de shadow map ao alterar)
  const shadowsActive =
    effectiveShadows !== 'OFF' && currentDrillMode !== 'FREE_RANGE';
  if (renderer.shadowMap.enabled !== shadowsActive) {
    renderer.shadowMap.enabled = shadowsActive;
    forceAllMaterialsNeedsUpdate = true;
  }

  if (shadowsActive && keyLight) {
    keyLight.castShadow = true;
    if (renderer.shadowMap.type !== THREE.PCFShadowMap) {
      renderer.shadowMap.type = THREE.PCFShadowMap;
      forceAllMaterialsNeedsUpdate = true;
    }
    // Intermittent updates — full soft refresh every frame kills mid-range Android GPUs.
    renderer.shadowMap.autoUpdate = false;

    let targetMapSize = 1024;
    switch (effectiveShadows) {
      case 'LOW':
        targetMapSize = 512;
        break;
      case 'MEDIUM':
        targetMapSize = isMobile ? 768 : 1024;
        break;
      case 'HIGH':
        // With our tightened 30m texel-snapped frustum, 1024 on mobile matches 2048@60m sharpness at 1/4 GPU cost
        targetMapSize = isMobile ? 1024 : 2048;
        break;
      case 'ULTRA':
        targetMapSize = isMobile ? 1536 : 2048;
        break;
    }

    if (
      cache.lastShadowQuality !== effectiveShadows ||
      keyLight.shadow.mapSize.width !== targetMapSize
    ) {
      keyLight.shadow.mapSize.width = targetMapSize;
      keyLight.shadow.mapSize.height = targetMapSize;
      if (keyLight.shadow.map) {
        keyLight.shadow.map.dispose();
        keyLight.shadow.map = null;
      }
      cache.lastShadowQuality = effectiveShadows;
      renderer.shadowMap.needsUpdate = true;
    }
  } else if (keyLight) {
    keyLight.castShadow = false;
    cache.lastShadowQuality = 'OFF';
  }

  // 4. Distância de visão (camera.far)
  let targetFar = 135;
  switch (settings.viewDistance) {
    case 'NEAR':
      targetFar = 115;
      break;
    case 'MEDIUM':
      targetFar = 145;
      break;
    case 'FAR':
      targetFar = 190;
      break;
    case 'ULTRA':
      targetFar = 260;
      break;
  }
  const mode = (engine.state as { drillMode?: string }).drillMode;
  if (
    mode === 'DE_DST_BOMB_5V5' ||
    mode === 'YARD_V2_BOMB_5V5' ||
    mode === 'CSGO_ASSAULT_BOMB_5V5' ||
    mode === 'MP_NUKED_BOMB_5V5' ||
    mode === 'DE_SUPPLY_BOMB_5V5'
  ) {
    // Large CS/Source2 yards (de_dst spans ~360m, yard_v2 ~260m+): prevent far wall clipping into sky.
    targetFar = Math.max(targetFar, 360);
  } else if (
    mode === 'INDUSTRIA_BOMB_5V5' ||
    mode === 'EASTERN_CITY_BOMB_5V5' ||
    mode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
    mode === 'STATION_CAPTURE_5V5' ||
    mode === 'STATION_TDM_5V5' ||
    mode === 'MAP_TEST_INDUSTRIA' ||
    mode === 'MAP_TEST_EASTERN' ||
    mode === 'MAP_TEST_MIRAGE'
  ) {
    // These yards are ~200m. NEAR (115) clipped the far blocks into empty sky.
    targetFar = Math.max(targetFar, 280);
  }
  if (Math.abs(camera.far - targetFar) > 0.5) {
    camera.far = targetFar;
    camera.updateProjectionMatrix();
  }

  // 5. Neblina (Fog)
  if (!settings.fog) {
    scene.fog = null;
  } else if (!scene.fog) {
    const mode = (engine.state as { drillMode?: string }).drillMode;
    if (mode === 'YARD_V2_BOMB_5V5') {
      scene.fog = new THREE.FogExp2(0xd2cdc3, 0.00175);
    } else if (
      mode === 'DUST2_BOMB_5V5' ||
      mode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      mode === 'DE_DST_BOMB_5V5'
    ) {
      scene.fog = new THREE.FogExp2(0xdccbb1, 0.0032);
    } else if (
      mode === 'ASSAULT_BOMB_5V5' ||
      mode === 'INDUSTRIA_BOMB_5V5' ||
      mode === 'HANGAR_BOMB_5V5' ||
      mode === 'EASTERN_CITY_BOMB_5V5' ||
      mode === 'CSGO_ASSAULT_BOMB_5V5' ||
      mode === 'MP_NUKED_BOMB_5V5' ||
      mode === 'DE_SUPPLY_BOMB_5V5' ||
      mode === 'STATION_CAPTURE_5V5' ||
      mode === 'STATION_TDM_5V5'
    ) {
      scene.fog = new THREE.FogExp2(0xcbd5e1, 0.0036);
    } else if (mode === 'YARD_BOMB_5V5') {
      scene.fog = new THREE.FogExp2(0xcbd5e1, 0.0052);
    } else {
      scene.fog = new THREE.FogExp2(0x0d121a, 0.014);
    }
  }

  // 6. Reflexos PBR (Environment map — sincronizado com IBL por bioma do TacticalSkySystem)
  scene.userData.pbrReflectionsEnabled = settings.pbrReflections;
  const preferredEnv =
    (scene.userData.preferredEnvironmentTex as THREE.Texture | undefined) ||
    scene.environment ||
    cache.cachedEnvironmentTex;
  if (preferredEnv) {
    cache.cachedEnvironmentTex = preferredEnv;
  }
  if (settings.pbrReflections) {
    if (preferredEnv && scene.environment !== preferredEnv) {
      scene.environment = preferredEnv;
    }
  } else {
    scene.environment = null;
  }

  // 7. Luz de clarão do cano (Muzzle Light)
  if (weaponRig && weaponRig.muzzleLight) {
    weaponRig.muzzleLight.visible = effectiveMuzzleLight;
  }

  // 8. Texturas, Anisotropia e Normal/Bump Maps (sem trava para cobrir assets carregados depois)
  const hwMaxAnisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy());
  let desiredAniso = 2;
  switch (settings.textures) {
    case 'LOW':
      desiredAniso = 2;
      break;
    case 'MEDIUM':
      desiredAniso = 4;
      break;
    case 'HIGH':
      desiredAniso = 8;
      break;
    case 'ULTRA':
      desiredAniso = 16;
      break;
  }
  const targetAnisotropy = Math.min(desiredAniso, hwMaxAnisotropy);
  const isLowTextures = settings.textures === 'LOW';
  const texturesChanged =
    cache.lastTextureQuality !== settings.textures ||
    cache.lastAnisotropy !== targetAnisotropy;

  // Skip full scene material walk unless tone/shadow/texture settings actually changed.
  if (!forceAllMaterialsNeedsUpdate && !texturesChanged) {
    return;
  }

  cache.lastTextureQuality = settings.textures;
  cache.lastAnisotropy = targetAnisotropy;

  scene.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((mat) => {
      if (!mat) return;
      const stdMat = mat as THREE.MeshStandardMaterial;
      let matChanged = forceAllMaterialsNeedsUpdate;

      if (!originalMaps.has(mat)) {
        originalMaps.set(mat, {
          normalMap: stdMat.normalMap || null,
          bumpMap: stdMat.bumpMap || null,
        });
      }

      if (isLowTextures) {
        if (stdMat.normalMap || stdMat.bumpMap) {
          stdMat.normalMap = null;
          stdMat.bumpMap = null;
          matChanged = true;
        }
      } else {
        const saved = originalMaps.get(mat);
        if (saved) {
          if (saved.normalMap && stdMat.normalMap !== saved.normalMap) {
            stdMat.normalMap = saved.normalMap;
            matChanged = true;
          }
          if (saved.bumpMap && stdMat.bumpMap !== saved.bumpMap) {
            stdMat.bumpMap = saved.bumpMap;
            matChanged = true;
          }
        }
      }

      // Aplica anisotropia apenas quando a textura não possui lockAnisotropy (evita listras em atlas de lightmap)
      for (let i = 0; i < PBR_TEXTURE_SLOTS.length; i++) {
        const slot = PBR_TEXTURE_SLOTS[i];
        const tex = stdMat[slot] as THREE.Texture | null | undefined;
        if (
          tex &&
          !tex.userData?.lockAnisotropy &&
          tex.anisotropy !== targetAnisotropy
        ) {
          tex.anisotropy = targetAnisotropy;
          tex.needsUpdate = true;
        }
      }

      if (matChanged) {
        stdMat.needsUpdate = true;
      }
    });
  });
}
