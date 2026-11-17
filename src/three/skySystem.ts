import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { DrillMode } from '../types/game';

/**
 * Sistema Físico de Céu 3D (Preetham Atmospheric Rayleigh/Mie Scattering + Shader de Nuvens Volumétricas FBM).
 * Utiliza o shader analítico oficial `Sky` do Three.js com auto-sombreamento Beer-Powder,
 * espalhamento frontal solar Henyey-Greenstein (silver lining) e sombras direcionais PCF.
 */
export class TacticalSkySystem {
  private scene: THREE.Scene;
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight | null;
  private rimLight: THREE.DirectionalLight | null;
  private keyLightTarget: THREE.Object3D;

  private sky: Sky;
  private sunDirection = new THREE.Vector3();
  private indoorBgColor = new THREE.Color(0x0d121a);
  private outdoorFallbackBg = new THREE.Color(0xdccbb1);
  private isOutdoor = false;

  constructor(
    scene: THREE.Scene,
    keyLight: THREE.DirectionalLight,
    hemiLight: THREE.HemisphereLight | null = null,
    rimLight: THREE.DirectionalLight | null = null
  ) {
    this.scene = scene;
    this.keyLight = keyLight;
    this.hemiLight = hemiLight;
    this.rimLight = rimLight;

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
    const isStationArena = mode === 'STATION_CAPTURE_5V5';
    const isYard = mode === 'YARD_BOMB_5V5';
    this.isOutdoor = isDust2 || isAssault || isIndustria || isHangar || isEasternCity || isMirageAnubis || isStationArena || isYard;

    this.sky.visible = this.isOutdoor;
    const uniforms = this.sky.material.uniforms;

    if (isDust2 || isMirageAnubis) {
      // Vivid azure sky + warm golden sandstone contrast matching reference image
      const phi = THREE.MathUtils.degToRad(90 - 54);
      const theta = THREE.MathUtils.degToRad(isMirageAnubis ? 42 : 35);
      this.sunDirection.setFromSphericalCoords(1, phi, theta);

      uniforms.turbidity.value = 1.65;
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
      // Ultra-clean atmospheric perspective so the deep blue sky and distant mountains stay vivid
      this.scene.fog = fogEnabled
        ? new THREE.FogExp2(0xc8d9eb, isMirageAnubis ? 0.0012 : 0.0014)
        : null;

      this.keyLightTarget.position.set(
        isMirageAnubis ? -33 : -6,
        isMirageAnubis ? 8 : 4.8,
        isMirageAnubis ? -30 : -24
      );
      this.keyLight.position
        .copy(this.keyLightTarget.position)
        .addScaledVector(this.sunDirection, isMirageAnubis ? 90 : 85);
      this.keyLight.color.setHex(0xfff1d6);
      this.keyLight.intensity = isMirageAnubis ? 1.95 : 2.1;
      this.updateShadowFrustum(isMirageAnubis ? 100 : 68, 175);
      this.applyFillRig('desert');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity =
          isMirageAnubis ? 0.52 : 0.68;
      }
    } else if (isAssault || isIndustria || isHangar || isEasternCity || isStationArena || isYard) {
      // Elevação solar de 48° e azimute de 52° com céu azul vívido para mapas urbanos industriais
      const phi = THREE.MathUtils.degToRad(90 - 48);
      const theta = THREE.MathUtils.degToRad(52);
      this.sunDirection.setFromSphericalCoords(1, phi, theta);

      uniforms.turbidity.value = 2.05;
      uniforms.rayleigh.value = 2.15;
      uniforms.mieCoefficient.value = 0.0035;
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
            isEasternCity ? 0.00085 : isHangar ? 0.00095 : isIndustria ? 0.0008 : isAssault ? 0.00095 : 0.0022
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
      this.keyLight.color.setHex(0xfff4de);
      this.keyLight.intensity = isHangar ? 2.0 : industrialSky ? 1.9 : 2.05;
      this.updateShadowFrustum(isEasternCity ? 95 : isHangar ? 55 : isIndustria ? 90 : isAssault ? 65 : 52, 165);
      this.applyFillRig(isHangar ? 'hangar' : 'outdoor');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 0.72;
      }
    } else {
      this.indoorBgColor.setHex(0x070a10);
      this.scene.background = this.indoorBgColor;
      this.scene.fog = fogEnabled ? new THREE.FogExp2(0x070a10, 0.011) : null;

      this.keyLightTarget.position.set(4, 0, -2);
      this.keyLight.position.set(16, 28, 12);
      this.keyLight.color.setHex(0xe2e8f0);
      this.keyLight.intensity = 1.05;
      this.keyLight.castShadow = false;
      this.applyFillRig('indoor');
      if ('environmentIntensity' in this.scene) {
        (this.scene as THREE.Scene & { environmentIntensity: number }).environmentIntensity = 1.0;
      }
    }

    this.keyLightTarget.updateMatrixWorld();
  }

  private applyFillRig(kind: 'desert' | 'outdoor' | 'hangar' | 'indoor'): void {
    if (this.hemiLight) {
      if (kind === 'desert') {
        this.hemiLight.color.setHex(0x8cd3ff);
        this.hemiLight.groundColor.setHex(0x8a6d4b);
        this.hemiLight.intensity = 0.58;
      } else if (kind === 'hangar') {
        this.hemiLight.color.setHex(0x9ad8ff);
        this.hemiLight.groundColor.setHex(0x8a8176);
        this.hemiLight.intensity = 0.75;
      } else if (kind === 'outdoor') {
        this.hemiLight.color.setHex(0x93d5ff);
        this.hemiLight.groundColor.setHex(0x756d63);
        this.hemiLight.intensity = 0.68;
      } else {
        this.hemiLight.color.setHex(0x93c5fd);
        this.hemiLight.groundColor.setHex(0x1e293b);
        this.hemiLight.intensity = 0.75;
      }
    }
    if (this.rimLight) {
      if (kind === 'desert') {
        this.rimLight.color.setHex(0xffd8a8);
        this.rimLight.intensity = 0.32;
      } else if (kind === 'hangar') {
        this.rimLight.color.setHex(0xffe4c4);
        this.rimLight.intensity = 0.36;
      } else if (kind === 'outdoor') {
        this.rimLight.color.setHex(0xffe8d2);
        this.rimLight.intensity = 0.32;
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
    this.sky.geometry.dispose();
    this.sky.material.dispose();
  }
}
