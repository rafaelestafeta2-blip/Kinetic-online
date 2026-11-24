import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DrillMode } from '../types/game';
import { PostFxBiome } from '../graphics/tacticalPostFx';
import { isMobileGpuTarget } from './gpuBudget';

type SkyBiomeKind = 'desert' | 'outdoor' | 'hangar' | 'indoor';

const ENV_DOME_VERT = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vWorldDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ENV_DOME_FRAG = /* glsl */ `
precision mediump float;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
varying vec3 vWorldDir;

void main() {
  vec3 dir = normalize(vWorldDir);
  float h = dir.y;

  // Physically calibrated atmospheric sky + horizon haze + ground bounce
  vec3 col;
  if (h >= 0.0) {
    float skyT = pow(clamp(h, 0.0, 1.0), 0.55);
    col = mix(uHorizonColor, uZenithColor, skyT);
  } else {
    float gndT = pow(clamp(-h, 0.0, 1.0), 0.45);
    col = mix(uHorizonColor * 0.72, uGroundColor, gndT);
  }

  // Soft Mie atmospheric scatter + crisp solar specular lobe for metallic firearms
  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sunDot, 7.0) * 0.22;
  col += uSunColor * pow(sunDot, 64.0) * 1.45;

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Sistema Físico de Céu 3D (Preetham Atmospheric Rayleigh/Mie Scattering + Shader de Nuvens FBM)
 * com renderOrder=9999 + depthTest=true (Early-Z rejeita 75-85% dos pixels cobertos por paredes/armas)
 * e baking lazy de mapas de ambiente IBL (PMREM) calibrados por bioma.
 */
export class TacticalSkySystem {
  private scene: THREE.Scene;
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight | null;
  private rimLight: THREE.DirectionalLight | null;
  private renderer: THREE.WebGLRenderer | null;
  private indoorEnvTexture: THREE.Texture | null;
  private keyLightTarget: THREE.Object3D;

  private sky: Sky;
  private sunDirection = new THREE.Vector3(0.45, 0.78, 0.35).normalize();
  private indoorBgColor = new THREE.Color(0x0d121a);
  private outdoorFallbackBg = new THREE.Color(0xdccbb1);
  private isOutdoor = false;
  private activeBiome: SkyBiomeKind = 'indoor';
  private biomeEnvCache = new Map<Exclude<SkyBiomeKind, 'indoor'>, THREE.WebGLRenderTarget>();

  constructor(
    scene: THREE.Scene,
    keyLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight | null = null,
    rimLight: THREE.DirectionalLight | null = null,
    renderer: THREE.WebGLRenderer | null = null,
    indoorEnvTexture: THREE.Texture | null = null
  ) {
    this.scene = scene;
    this.keyLight = keyLight;
    this.hemiLight = hemiLight;
    this.rimLight = rimLight;
    this.renderer = renderer;
    this.indoorEnvTexture = indoorEnvTexture;

    this.keyLightTarget = new THREE.Object3D();
    this.keyLightTarget.position.set(0, 0, 0);
    this.scene.add(this.keyLightTarget);
    this.keyLight.target = this.keyLightTarget;

    // Instancia o Skybox físico Preetham + Nuvens FBM do Three.js
    // CRITICAL MOBILE WIN: renderOrder=9999 + depthTest=true + depthWrite=false ensures
    // walls, terrain, bots, and 1P weapons fill the Z-buffer FIRST so hardware Early-Z skips
    // 75-85% of the screen from running the 4-octave volumetric cloud fragment shader!
    this.sky = new Sky();
    this.sky.name = 'PhysicalAtmosphericSky';
    this.sky.scale.setScalar(10000);
    this.sky.visible = false;
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 9999;
    this.sky.material.depthTest = true;
    this.sky.material.depthWrite = false;
    this.sky.material.depthFunc = THREE.LessEqualDepth;
    this.scene.add(this.sky);
  }

  public getSunDirection(): THREE.Vector3 {
    return this.sunDirection;
  }

  public getPostFxBiome(): PostFxBiome {
    if (this.activeBiome === 'desert') return 'desert';
    if (this.activeBiome === 'indoor') return 'indoor';
    return 'outdoor';
  }

  /**
   * Lazily bakes a physically-calibrated atmospheric PMREM IBL cubemap using controlled linear
   * sky/horizon/ground/sun radiance. Gives weapons rich sky-blue & warm-ground reflections.
   */
  private getOrBakeBiomeEnv(kind: Exclude<SkyBiomeKind, 'indoor'>): THREE.Texture | null {
    const cached = this.biomeEnvCache.get(kind);
    if (cached) return cached.texture;
    if (!this.renderer) return this.indoorEnvTexture;

    try {
      const envScene = new THREE.Scene();

      const zenith =
        kind === 'desert'
          ? new THREE.Color(0.2, 0.45, 0.88)
          : kind === 'hangar'
            ? new THREE.Color(0.32, 0.46, 0.68)
            : new THREE.Color(0.24, 0.48, 0.85);
      const horizon =
        kind === 'desert'
          ? new THREE.Color(0.76, 0.68, 0.56)
          : kind === 'hangar'
            ? new THREE.Color(0.58, 0.64, 0.72)
            : new THREE.Color(0.66, 0.74, 0.84);
      const ground =
        kind === 'desert'
          ? new THREE.Color(0.36, 0.26, 0.16)
          : kind === 'hangar'
            ? new THREE.Color(0.18, 0.2, 0.24)
            : new THREE.Color(0.2, 0.21, 0.23);
      const sunCol =
        kind === 'desert'
          ? new THREE.Color(1.0, 0.9, 0.72)
          : new THREE.Color(1.0, 0.95, 0.86);

      const domeGeo = new THREE.SphereGeometry(60, 24, 16);
      const domeMat = new THREE.ShaderMaterial({
        vertexShader: ENV_DOME_VERT,
        fragmentShader: ENV_DOME_FRAG,
        uniforms: {
          uZenithColor: { value: zenith },
          uHorizonColor: { value: horizon },
          uGroundColor: { value: ground },
          uSunColor: { value: sunCol },
          uSunDir: { value: this.sunDirection.clone() },
        },
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      });

      const dome = new THREE.Mesh(domeGeo, domeMat);
      envScene.add(dome);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const rt = pmrem.fromScene(envScene, 0.035);
      pmrem.dispose();

      domeGeo.dispose();
      domeMat.dispose();

      this.biomeEnvCache.set(kind, rt);
      return rt.texture;
    } catch {
      return this.indoorEnvTexture;
    }
  }

  private applyBiomeEnvironment(kind: SkyBiomeKind): void {
    const targetEnv =
      kind === 'indoor' ? this.indoorEnvTexture : this.getOrBakeBiomeEnv(kind);
    if (!targetEnv) return;
    this.scene.userData.preferredEnvironmentTex = targetEnv;
    if (this.scene.userData.pbrReflectionsEnabled !== false) {
      this.scene.environment = targetEnv;
    }
  }

  public configureForMode(mode: DrillMode, fogEnabled = true): void {
    const isDust2 = mode === 'DUST2_BOMB_5V5';
    const isAssault = mode === 'ASSAULT_BOMB_5V5';
    const isIndustria =
      mode === 'INDUSTRIA_BOMB_5V5' || mode === 'MAP_TEST_INDUSTRIA';
    const isHangar = mode === 'HANGAR_BOMB_5V5' || mode === 'MAP_TEST_HANGAR';
    const isEasternCity =
      mode === 'EASTERN_CITY_BOMB_5V5' || mode === 'MAP_TEST_EASTERN';
    const isMirageAnubis =
      mode === 'MIRAGE_ANUBIS_BOMB_5V5' || mode === 'MAP_TEST_MIRAGE';
    const isCsgoAssault = mode === 'CSGO_ASSAULT_BOMB_5V5';
    const isDeDst = mode === 'DE_DST_BOMB_5V5';
    const isMpNuked = mode === 'MP_NUKED_BOMB_5V5';
    const isDeSupply = mode === 'DE_SUPPLY_BOMB_5V5';
    const isYardV2 = mode === 'YARD_V2_BOMB_5V5';
    const isStationArena = mode === 'STATION_CAPTURE_5V5' || mode === 'STATION_TDM_5V5';
    const isYard = mode === 'YARD_BOMB_5V5';
    this.isOutdoor =
      isDust2 ||
      isAssault ||
      isIndustria ||
      isHangar ||
      isEasternCity ||
      isMirageAnubis ||
      isCsgoAssault ||
      isDeDst ||
      isMpNuked ||
      isDeSupply ||
      isYardV2 ||
      isStationArena ||
      isYard;

    this.sky.visible = this.isOutdoor;
    const uniforms = this.sky.material.uniforms;
    const isMobile = isMobileGpuTarget();

    if (isDust2 || isMirageAnubis || isDeDst || isMpNuked || isYardV2) {
      this.activeBiome = 'desert';
      // Vivid azure sky + warm golden sandstone contrast with unified single-sun shadows
      const phi = THREE.MathUtils.degToRad(90 - 44);
      const theta = THREE.MathUtils.degToRad(isMirageAnubis ? 42 : 35);
      this.sunDirection.setFromSphericalCoords(1, phi, theta).normalize();

      uniforms.turbidity.value = 1.75;
      uniforms.rayleigh.value = 2.45;
      uniforms.mieCoefficient.value = 0.0028;
      uniforms.mieDirectionalG.value = 0.86;
      uniforms.sunPosition.value.copy(this.sunDirection);
      uniforms.showSunDisc.value = 1.0;

      if (uniforms.cloudScale) uniforms.cloudScale.value = 0.00024;
      if (uniforms.cloudSpeed) uniforms.cloudSpeed.value = 0.000028;
      if (uniforms.cloudCoverage) uniforms.cloudCoverage.value = 0.42;
      if (uniforms.cloudDensity) uniforms.cloudDensity.value = 0.52;
      if (uniforms.cloudElevation) uniforms.cloudElevation.value = 0.48;

      this.outdoorFallbackBg.setHex(0x3b82f6);
      this.scene.background = this.outdoorFallbackBg;
      this.scene.fog = fogEnabled
        ? new THREE.FogExp2(0xd6c9b4, isMirageAnubis ? 0.0013 : 0.0015)
        : null;

      this.keyLightTarget.position.set(
        isMirageAnubis ? -33 : -6,
        isMirageAnubis ? 8 : 4.8,
        isMirageAnubis ? -30 : -24
      );
      this.keyLight.position
        .copy(this.keyLightTarget.position)
        .addScaledVector(this.sunDirection, isMirageAnubis ? 90 : 85);
      this.keyLight.color.setHex(0xffebd0);
      // Unified single desert sun (duplicate per-map lights removed to cut mobile PBR ALU ~45%)
      this.keyLight.intensity = isMirageAnubis ? 2.25 : 2.35;
      this.updateShadowFrustum(isMirageAnubis ? 100 : 68, 175);
      this.applyFillRig('desert', isMobile, true);
      this.applyBiomeEnvironment('desert');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
          isMirageAnubis ? 0.58 : 0.64;
      }
    } else if (isAssault || isIndustria || isHangar || isEasternCity || isStationArena || isYard) {
      const biomeKind: Exclude<SkyBiomeKind, 'indoor'> = isHangar ? 'hangar' : 'outdoor';
      this.activeBiome = biomeKind;
      const phi = THREE.MathUtils.degToRad(90 - 44);
      const theta = THREE.MathUtils.degToRad(52);
      this.sunDirection.setFromSphericalCoords(1, phi, theta).normalize();

      uniforms.turbidity.value = 2.05;
      uniforms.rayleigh.value = 2.15;
      uniforms.mieCoefficient.value = 0.0034;
      uniforms.mieDirectionalG.value = 0.84;
      uniforms.sunPosition.value.copy(this.sunDirection);
      uniforms.showSunDisc.value = 1.0;

      if (uniforms.cloudScale) uniforms.cloudScale.value = 0.00024;
      if (uniforms.cloudSpeed) uniforms.cloudSpeed.value = 0.000032;
      if (uniforms.cloudCoverage) uniforms.cloudCoverage.value = 0.46;
      if (uniforms.cloudDensity) uniforms.cloudDensity.value = 0.5;
      if (uniforms.cloudElevation) uniforms.cloudElevation.value = 0.48;

      const industrialSky = isAssault || isIndustria || isHangar || isEasternCity || isStationArena;
      this.outdoorFallbackBg.setHex(isHangar ? 0x60a5fa : industrialSky ? 0x4f94e8 : 0x60a5fa);
      this.scene.background = this.outdoorFallbackBg;
      this.scene.fog = fogEnabled
        ? new THREE.FogExp2(
            0xc4d7eb,
            isEasternCity ? 0.001 : isHangar ? 0.00105 : isIndustria ? 0.0009 : isAssault ? 0.00105 : 0.0022
          )
        : null;

      this.keyLightTarget.position.set(
        isEasternCity ? -8 : isHangar ? 0 : isIndustria ? 20 : isAssault ? -18 : 0,
        isEasternCity ? 6 : isHangar ? 4 : isIndustria ? 2 : 0,
        isEasternCity ? 0 : isHangar ? 0 : isIndustria ? 0 : isAssault ? 18 : 0
      );
      this.keyLight.position
        .copy(this.keyLightTarget.position)
        .addScaledVector(this.sunDirection, 80);
      this.keyLight.color.setHex(0xfff1d8);
      // Eastern City & Industria now use this single unified sun (duplicate map lights removed)
      const unifiedSingleSun = isEasternCity || isIndustria;
      this.keyLight.intensity = unifiedSingleSun
        ? 2.25
        : isHangar
          ? 1.85
          : industrialSky
            ? 1.8
            : 1.9;
      this.updateShadowFrustum(isEasternCity ? 95 : isHangar ? 55 : isIndustria ? 90 : isAssault ? 65 : 52, 165);
      this.applyFillRig(biomeKind, isMobile, unifiedSingleSun);
      this.applyBiomeEnvironment(biomeKind);
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.72;
      }
    } else {
      this.activeBiome = 'indoor';
      this.sunDirection.set(0.38, 0.85, 0.36).normalize();
      this.indoorBgColor.setHex(0x070a10);
      this.scene.background = this.indoorBgColor;
      this.scene.fog = fogEnabled ? new THREE.FogExp2(0x070a10, 0.011) : null;

      this.keyLightTarget.position.set(4, 0, -2);
      this.keyLight.position.set(16, 28, 12);
      this.keyLight.color.setHex(0xe2e8f0);
      this.keyLight.intensity = 1.1;
      this.keyLight.castShadow = false;
      this.applyFillRig('indoor', isMobile, false);
      this.applyBiomeEnvironment('indoor');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.95;
      }
    }

    this.keyLightTarget.updateMatrixWorld();
  }

  private applyFillRig(
    kind: SkyBiomeKind,
    isMobile: boolean,
    unifiedSingleSun: boolean
  ): void {
    if (this.hemiLight) {
      if (kind === 'desert') {
        this.hemiLight.color.setHex(0x9bd6ff);
        this.hemiLight.groundColor.setHex(0x7c5d3d);
        this.hemiLight.intensity = unifiedSingleSun ? 0.92 : 0.42;
      } else if (kind === 'hangar') {
        this.hemiLight.color.setHex(0x8fd2ff);
        this.hemiLight.groundColor.setHex(0x555b64);
        this.hemiLight.intensity = 0.58;
      } else if (kind === 'outdoor') {
        this.hemiLight.color.setHex(0xa8d8ff);
        this.hemiLight.groundColor.setHex(0x525252);
        this.hemiLight.intensity = unifiedSingleSun ? 1.05 : 0.55;
      } else {
        this.hemiLight.color.setHex(0x93c5fd);
        this.hemiLight.groundColor.setHex(0x1e293b);
        this.hemiLight.intensity = 0.75;
      }
    }
    if (this.rimLight) {
      // On mobile outdoor arenas, disabling the 2nd directional rimLight cuts an entire
      // per-fragment directional PBR evaluation on every visible pixel (IBL already supplies rim!).
      const keepRim = kind === 'indoor' || !isMobile;
      this.rimLight.visible = keepRim;
      if (kind === 'desert') {
        this.rimLight.color.setHex(0x9bd0ff);
        this.rimLight.intensity = 0.24;
      } else if (kind === 'hangar') {
        this.rimLight.color.setHex(0xb8dcff);
        this.rimLight.intensity = 0.3;
      } else if (kind === 'outdoor') {
        this.rimLight.color.setHex(0xa8d5ff);
        this.rimLight.intensity = 0.28;
      } else {
        this.rimLight.color.setHex(0x38bdf8);
        this.rimLight.intensity = 0.55;
      }
    }
  }

  private updateShadowFrustum(halfExtent: number, far: number): void {
    const cam = this.keyLight.shadow.camera;
    cam.left = -halfExtent;
    cam.right = halfExtent;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    cam.near = 2;
    cam.far = far;
    cam.updateProjectionMatrix();
    this.keyLight.shadow.needsUpdate = true;
  }

  public update(playerPos: THREE.Vector3, dt: number): void {
    if (!this.isOutdoor) return;

    // Mantém o Skybox centrado na câmera e avança a evolução temporal das nuvens FBM
    this.sky.position.copy(playerPos);
    const uniforms = this.sky.material.uniforms;
    if (uniforms.time) {
      uniforms.time.value = (uniforms.time.value + dt) % 10000;
    }
  }

  public dispose(): void {
    this.biomeEnvCache.forEach((rt) => {
      if (this.scene.environment === rt.texture) {
        this.scene.environment = null;
      }
      rt.dispose();
    });
    this.biomeEnvCache.clear();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
