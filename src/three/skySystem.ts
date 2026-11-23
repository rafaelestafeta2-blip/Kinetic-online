import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DrillMode } from '../types/game';
import { PostFxBiome } from '../graphics/tacticalPostFx';

type SkyBiomeKind = 'desert' | 'outdoor' | 'hangar' | 'indoor';

/**
 * Sistema Físico de Céu 3D (Preetham Atmospheric Rayleigh/Mie Scattering + Shader de Nuvens Volumétricas FBM)
 * com baking lazy de mapas de ambiente IBL (PMREM) por bioma para reflexos metálicos e PBR fiéis ao céu real.
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
    this.sky = new Sky();
    this.sky.name = 'PhysicalAtmosphericSky';
    this.sky.scale.setScalar(10000);
    this.sky.visible = false;
    this.sky.frustumCulled = false;
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
   * Lazily bakes a physically-matched atmospheric PMREM IBL cubemap (sky dome + sun hotspot +
   * biome ground-bounce hemisphere) so 1P firearms, optics, and metallic surfaces reflect real
   * sky/sun/ground colors instead of a flat white indoor RoomEnvironment box.
   */
  private getOrBakeBiomeEnv(kind: Exclude<SkyBiomeKind, 'indoor'>): THREE.Texture | null {
    const cached = this.biomeEnvCache.get(kind);
    if (cached) return cached.texture;
    if (!this.renderer) return this.indoorEnvTexture;

    try {
      const envScene = new THREE.Scene();

      // Atmospheric sky dome matching active biome sun & scattering
      const miniSky = new Sky();
      miniSky.scale.setScalar(200);
      const u = miniSky.material.uniforms;
      u.sunPosition.value.copy(this.sunDirection);
      if (kind === 'desert') {
        u.turbidity.value = 1.9;
        u.rayleigh.value = 2.35;
        u.mieCoefficient.value = 0.004;
        u.mieDirectionalG.value = 0.86;
      } else if (kind === 'hangar') {
        u.turbidity.value = 2.4;
        u.rayleigh.value = 1.95;
        u.mieCoefficient.value = 0.0045;
        u.mieDirectionalG.value = 0.82;
      } else {
        u.turbidity.value = 2.1;
        u.rayleigh.value = 2.15;
        u.mieCoefficient.value = 0.0038;
        u.mieDirectionalG.value = 0.84;
      }
      if (u.showSunDisc) u.showSunDisc.value = 1.0;
      if (u.cloudCoverage) u.cloudCoverage.value = 0.0;
      envScene.add(miniSky);

      // Lower ground-bounce hemisphere so underside of weapon barrels/receivers gets warm bounce light
      const groundColor =
        kind === 'desert' ? 0x9b7c56 : kind === 'hangar' ? 0x5f6874 : 0x5c646d;
      const groundGeo = new THREE.SphereGeometry(
        180,
        24,
        12,
        0,
        Math.PI * 2,
        Math.PI * 0.5,
        Math.PI * 0.5
      );
      const groundMat = new THREE.MeshBasicMaterial({
        color: groundColor,
        side: THREE.BackSide,
      });
      const groundDome = new THREE.Mesh(groundGeo, groundMat);
      envScene.add(groundDome);

      // Subtle crisp specular sun highlight disc for realistic metallic sheen on 1P weapons
      const sunHighlightGeo = new THREE.SphereGeometry(14, 12, 8);
      const sunHighlightMat = new THREE.MeshBasicMaterial({
        color: kind === 'desert' ? new THREE.Color(4.5, 3.8, 2.7) : new THREE.Color(4.0, 3.9, 3.6),
      });
      const sunHighlight = new THREE.Mesh(sunHighlightGeo, sunHighlightMat);
      sunHighlight.position.copy(this.sunDirection).multiplyScalar(140);
      envScene.add(sunHighlight);

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const rt = pmrem.fromScene(envScene, 0.035);
      pmrem.dispose();

      miniSky.geometry.dispose();
      miniSky.material.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      sunHighlightGeo.dispose();
      sunHighlightMat.dispose();

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
    const isStationArena = mode === 'STATION_CAPTURE_5V5' || mode === 'STATION_TDM_5V5';
    const isYard = mode === 'YARD_BOMB_5V5';
    this.isOutdoor =
      isDust2 ||
      isAssault ||
      isIndustria ||
      isHangar ||
      isEasternCity ||
      isMirageAnubis ||
      isStationArena ||
      isYard;

    this.sky.visible = this.isOutdoor;
    const uniforms = this.sky.material.uniforms;

    if (isDust2 || isMirageAnubis) {
      this.activeBiome = 'desert';
      // Vivid azure sky + warm golden sandstone contrast with dramatic directional shadows
      const phi = THREE.MathUtils.degToRad(90 - 44);
      const theta = THREE.MathUtils.degToRad(isMirageAnubis ? 42 : 35);
      this.sunDirection.setFromSphericalCoords(1, phi, theta).normalize();

      uniforms.turbidity.value = 1.75;
      uniforms.rayleigh.value = 2.45;
      uniforms.mieCoefficient.value = 0.003;
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
        ? new THREE.FogExp2(0xd6c9b4, isMirageAnubis ? 0.0014 : 0.0016)
        : null;

      this.keyLightTarget.position.set(
        isMirageAnubis ? -33 : -6,
        isMirageAnubis ? 8 : 4.8,
        isMirageAnubis ? -30 : -24
      );
      this.keyLight.position
        .copy(this.keyLightTarget.position)
        .addScaledVector(this.sunDirection, isMirageAnubis ? 90 : 85);
      this.keyLight.color.setHex(0xffe9c4);
      this.keyLight.intensity = isMirageAnubis ? 2.15 : 2.3;
      this.updateShadowFrustum(isMirageAnubis ? 100 : 68, 175);
      this.applyFillRig('desert');
      this.applyBiomeEnvironment('desert');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
          isMirageAnubis ? 0.82 : 0.92;
      }
    } else if (isAssault || isIndustria || isHangar || isEasternCity || isStationArena || isYard) {
      const biomeKind: Exclude<SkyBiomeKind, 'indoor'> = isHangar ? 'hangar' : 'outdoor';
      this.activeBiome = biomeKind;
      // Elevação solar de 44° e azimute de 52° — relevo mais tridimensional em paredes e props
      const phi = THREE.MathUtils.degToRad(90 - 44);
      const theta = THREE.MathUtils.degToRad(52);
      this.sunDirection.setFromSphericalCoords(1, phi, theta).normalize();

      uniforms.turbidity.value = 2.05;
      uniforms.rayleigh.value = 2.15;
      uniforms.mieCoefficient.value = 0.0036;
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
            isEasternCity ? 0.00105 : isHangar ? 0.0011 : isIndustria ? 0.00095 : isAssault ? 0.0011 : 0.0024
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
      this.keyLight.color.setHex(0xfff0d4);
      this.keyLight.intensity = isHangar ? 2.15 : industrialSky ? 2.1 : 2.2;
      this.updateShadowFrustum(isEasternCity ? 95 : isHangar ? 55 : isIndustria ? 90 : isAssault ? 65 : 52, 165);
      this.applyFillRig(biomeKind);
      this.applyBiomeEnvironment(biomeKind);
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.92;
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
      this.keyLight.intensity = 1.15;
      this.keyLight.castShadow = false;
      this.applyFillRig('indoor');
      this.applyBiomeEnvironment('indoor');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 1.05;
      }
    }

    this.keyLightTarget.updateMatrixWorld();
  }

  private applyFillRig(kind: SkyBiomeKind): void {
    if (this.hemiLight) {
      if (kind === 'desert') {
        // Cool azure sky bounce vs rich warm sandstone ground bounce (warm/cool contrast)
        this.hemiLight.color.setHex(0x7cc8ff);
        this.hemiLight.groundColor.setHex(0x7d5d3b);
        this.hemiLight.intensity = 0.56;
      } else if (kind === 'hangar') {
        this.hemiLight.color.setHex(0x8fd2ff);
        this.hemiLight.groundColor.setHex(0x5d626b);
        this.hemiLight.intensity = 0.7;
      } else if (kind === 'outdoor') {
        this.hemiLight.color.setHex(0x88ceff);
        this.hemiLight.groundColor.setHex(0x5b5854);
        this.hemiLight.intensity = 0.64;
      } else {
        this.hemiLight.color.setHex(0x93c5fd);
        this.hemiLight.groundColor.setHex(0x1e293b);
        this.hemiLight.intensity = 0.78;
      }
    }
    if (this.rimLight) {
      if (kind === 'desert') {
        this.rimLight.color.setHex(0x8ecaff);
        this.rimLight.intensity = 0.38;
      } else if (kind === 'hangar') {
        this.rimLight.color.setHex(0xb8dcff);
        this.rimLight.intensity = 0.42;
      } else if (kind === 'outdoor') {
        this.rimLight.color.setHex(0xa8d5ff);
        this.rimLight.intensity = 0.38;
      } else {
        this.rimLight.color.setHex(0x38bdf8);
        this.rimLight.intensity = 0.6;
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
