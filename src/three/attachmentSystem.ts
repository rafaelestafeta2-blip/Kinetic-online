import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WeaponId } from '../types/game';
import { createGameGltfLoader } from './gltfLoaderFactory';
import { resolveAssetUrl } from '../utils/assetUrl';

export type MuzzleType =
  | 'NONE'
  | 'SILENCER_PACK'
  | 'SL01_LONG'
  | 'SC01_SHORT'
  | 'FH01_FLASH_HIDER'
  | 'MB01_BRAKE'
  | 'MC01_COMPENSATOR';

export type CharmType =
  | 'NONE'
  | 'HONEY_CUB'
  | 'MICRO_TERMINAL'
  | 'STARDROP_TEAL';

export interface WeaponMuzzleTransform {
  position: THREE.Vector3;
  scale: number;
  rotation: THREE.Euler;
}

export interface WeaponCharmTransform {
  position: THREE.Vector3;
  scale: number;
  rotation: THREE.Euler;
}

/**
 * Exact muzzle attachment offsets calibrated per weapon so devices
 * snap precisely to the barrel threads/crown without clipping.
 */
export const WEAPON_MUZZLE_OFFSETS: Record<WeaponId, WeaponMuzzleTransform> = {
  P50_PISTOL: {
    position: new THREE.Vector3(0, 0.0031, -0.203),
    scale: 0.92,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  M1911_PISTOL: {
    position: new THREE.Vector3(0, -0.0042, -0.132),
    scale: 0.86,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SMG_45: {
    position: new THREE.Vector3(0, 0.0155, -0.581),
    scale: 0.96,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SMG_MP5: {
    position: new THREE.Vector3(0, 0.0, -0.341),
    scale: 0.96,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SHOTGUN_12: {
    position: new THREE.Vector3(0, 0.0104, -0.716),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SHOTGUN_SPAS: {
    position: new THREE.Vector3(0, -0.0019, -0.512),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  M4_CARBINE: {
    position: new THREE.Vector3(0, -0.0113, -0.596),
    scale: 1.04,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  CARBINE_AR: {
    position: new THREE.Vector3(0, 0.0114, -0.568),
    scale: 1.04,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  AK47_RIFLE: {
    position: new THREE.Vector3(0, -0.009, -0.516),
    scale: 1.06,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  AK12_RIFLE: {
    position: new THREE.Vector3(0, 0.0, -0.534),
    scale: 1.06,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  S_MILITARY: {
    position: new THREE.Vector3(0, 0.001, -0.613),
    scale: 1.04,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  L49_LMG: {
    position: new THREE.Vector3(0, 0.021, -0.737),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_BOLT: {
    position: new THREE.Vector3(0, -0.0022, -0.713),
    scale: 1.08,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_TACTICAL: {
    position: new THREE.Vector3(0, 0.0012, -0.612),
    scale: 1.08,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_AWP: {
    position: new THREE.Vector3(0, 0.0096, -0.882),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_HEAVY: {
    position: new THREE.Vector3(0, 0.0338, -0.788),
    scale: 1.14,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  RPG7_LAUNCHER: {
    position: new THREE.Vector3(0, -0.0154, -0.856),
    scale: 1.0,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  KNIFE_TACTICAL: {
    position: new THREE.Vector3(0, 0, 0),
    scale: 1.0,
    rotation: new THREE.Euler(0, 0, 0),
  },
};

/**
 * Weapon charm attachment positions calibrated flush against each weapon's
 * left receiver wall / forward side rail (`ReceiverLeftWallX - 3mm`).
 */
export const WEAPON_CHARM_OFFSETS: Record<WeaponId, WeaponCharmTransform> = {
  P50_PISTOL: {
    position: new THREE.Vector3(-0.024, 0.008, -0.035),
    scale: 1.18,
    rotation: new THREE.Euler(0, 0, 0),
  },
  M1911_PISTOL: {
    position: new THREE.Vector3(-0.0145, 0.004, -0.028),
    scale: 1.12,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SMG_45: {
    position: new THREE.Vector3(-0.0185, 0.044, -0.055),
    scale: 1.38,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SMG_MP5: {
    position: new THREE.Vector3(-0.0235, 0.025, -0.045),
    scale: 1.38,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SHOTGUN_12: {
    position: new THREE.Vector3(-0.0175, 0.011, -0.045),
    scale: 1.42,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SHOTGUN_SPAS: {
    position: new THREE.Vector3(-0.027, 0.058, -0.055),
    scale: 1.45,
    rotation: new THREE.Euler(0, 0, 0),
  },
  M4_CARBINE: {
    position: new THREE.Vector3(-0.0245, 0.006, -0.045),
    scale: 1.48,
    rotation: new THREE.Euler(0, 0, 0),
  },
  CARBINE_AR: {
    position: new THREE.Vector3(-0.0265, 0.028, -0.045),
    scale: 1.48,
    rotation: new THREE.Euler(0, 0, 0),
  },
  AK47_RIFLE: {
    position: new THREE.Vector3(-0.0165, 0.026, -0.045),
    scale: 1.45,
    rotation: new THREE.Euler(0, 0, 0),
  },
  AK12_RIFLE: {
    position: new THREE.Vector3(-0.0215, 0.035, -0.045),
    scale: 1.45,
    rotation: new THREE.Euler(0, 0, 0),
  },
  S_MILITARY: {
    position: new THREE.Vector3(-0.0245, 0.014, -0.055),
    scale: 1.48,
    rotation: new THREE.Euler(0, 0, 0),
  },
  L49_LMG: {
    position: new THREE.Vector3(-0.025, 0.054, -0.055),
    scale: 1.5,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_BOLT: {
    position: new THREE.Vector3(-0.0215, 0.009, -0.05),
    scale: 1.42,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_TACTICAL: {
    position: new THREE.Vector3(-0.0295, 0.011, -0.055),
    scale: 1.45,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_AWP: {
    position: new THREE.Vector3(-0.0255, 0.046, -0.055),
    scale: 1.48,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_HEAVY: {
    position: new THREE.Vector3(-0.0225, 0.04, -0.06),
    scale: 1.48,
    rotation: new THREE.Euler(0, 0, 0),
  },
  RPG7_LAUNCHER: {
    position: new THREE.Vector3(-0.0165, 0.078, -0.05),
    scale: 1.48,
    rotation: new THREE.Euler(0, 0, 0),
  },
  KNIFE_TACTICAL: {
    position: new THREE.Vector3(-0.018, 0.01, 0.02),
    scale: 1.1,
    rotation: new THREE.Euler(0, 0, 0),
  },
};

/**
 * Constrói o suporte metálico de trilho lateral + argola (split-ring) onde o chaveiro é pendurado.
 */
export function createCharmMountHardware(): THREE.Group {
  const hw = new THREE.Group();
  hw.name = 'CharmMountHardware';

  const bracketMat = new THREE.MeshStandardMaterial({
    color: 0x1e222a,
    metalness: 0.86,
    roughness: 0.28,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3b2,
    metalness: 0.94,
    roughness: 0.18,
  });

  // Base parafusada na parede esquerda do receptor (+X aponta para dentro do receptor)
  const basePlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.0045, 0.007, 0.012),
    bracketMat
  );
  basePlate.position.set(0.0038, 0.002, 0);
  hw.add(basePlate);

  // Olhal horizontal que projeta a argola 3mm para fora da parede da arma
  const eyelet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0022, 0.0022, 0.005, 10),
    bracketMat
  );
  eyelet.rotation.z = Math.PI / 2;
  eyelet.position.set(0.0014, 0.002, 0);
  hw.add(eyelet);

  // Argola superior fixa no olhal
  const splitRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.0028, 0.00065, 8, 18),
    ringMat
  );
  splitRing.rotation.y = Math.PI / 2;
  splitRing.position.set(-0.0005, 0.0005, 0);
  hw.add(splitRing);

  return hw;
}

export class WeaponAttachmentSystem {
  public muzzleAnchor: THREE.Group;
  public charmAnchor: THREE.Group;
  public charmPendulumPivot: THREE.Group;
  private charmMountHardware: THREE.Group;

  private muzzleModels: Map<MuzzleType, THREE.Group> = new Map();
  private charmModels: Map<CharmType, THREE.Group> = new Map();

  private currentMuzzle: MuzzleType = 'NONE';
  private currentCharm: CharmType = 'NONE';
  private currentWeapon: WeaponId = 'M4_CARBINE';

  private gltfLoader: GLTFLoader | null = null;
  private loadingMuzzles = new Set<MuzzleType>();
  private loadingCharms = new Set<CharmType>();

  // Estado físico Zero-GC do pêndulo 2-DOF + torção do chaveiro
  private pitchAngle = 0; // Rotação em X (balanço frente/trás)
  private pitchVel = 0;
  private rollAngle = -0.15; // Rotação em Z (balanço lateral; negativo = afastado da parede da arma)
  private rollVel = 0;
  private yawAngle = 0.22; // Rotação em Y (torção sutil na corrente)
  private yawVel = 0;
  private prevLookSwayX = 0;
  private prevLookSwayY = 0;
  private prevVerticalVel = 0;

  private static readonly MUZZLE_URLS: Partial<Record<MuzzleType, string>> = {
    SILENCER_PACK: '/models/accessories/scopes/Silencer_Pack_01.glb',
    SL01_LONG: '/models/accessories/SL01_Slim_Long_Suppressor.glb',
    SC01_SHORT: '/models/accessories/SC01_Short_Suppressor.glb',
    FH01_FLASH_HIDER: '/models/accessories/FH01_Petal_Flash_Hider.glb',
    MB01_BRAKE: '/models/accessories/MB01_Cut_Muzzle_Brake.glb',
    MC01_COMPENSATOR: '/models/accessories/MC01_Compact_Compensator.glb',
  };

  private static readonly CHARM_URLS: Partial<Record<CharmType, string>> = {
    HONEY_CUB: '/models/accessories/Charm_Honey_Cub.glb',
    MICRO_TERMINAL: '/models/accessories/Charm_Micro_Terminal.glb',
    STARDROP_TEAL: '/models/accessories/Charm_Stardrop_Smoke_Teal.glb',
  };

  constructor(weaponMotionAnchor: THREE.Group) {
    this.muzzleAnchor = new THREE.Group();
    this.charmAnchor = new THREE.Group();
    this.charmMountHardware = createCharmMountHardware();
    this.charmPendulumPivot = new THREE.Group();
    this.charmPendulumPivot.name = 'CharmPendulumPivot';
    this.charmPendulumPivot.position.set(-0.0005, -0.0015, 0);
    this.charmAnchor.add(this.charmMountHardware);
    this.charmAnchor.add(this.charmPendulumPivot);

    weaponMotionAnchor.add(this.muzzleAnchor);
    weaponMotionAnchor.add(this.charmAnchor);
  }

  private getLoader(): GLTFLoader {
    if (!this.gltfLoader) {
      this.gltfLoader = createGameGltfLoader();
    }
    return this.gltfLoader;
  }

  private ensureMuzzleLoaded(type: MuzzleType): void {
    if (type === 'NONE' || this.muzzleModels.has(type) || this.loadingMuzzles.has(type)) {
      return;
    }
    const localUrl = WeaponAttachmentSystem.MUZZLE_URLS[type];
    if (!localUrl) return;
    this.loadingMuzzles.add(type);
    this.getLoader().load(
      resolveAssetUrl(localUrl),
      (gltf) => {
        this.loadingMuzzles.delete(type);
        const root = gltf.scene;
        root.traverse((c) => {
          c.frustumCulled = false;
        });
        root.visible = false;
        this.muzzleAnchor.add(root);
        this.muzzleModels.set(type, root);
        this.syncMuzzleVisibility();
      },
      undefined,
      () => {
        this.loadingMuzzles.delete(type);
      }
    );
  }

  private ensureCharmLoaded(type: CharmType): void {
    if (type === 'NONE' || this.charmModels.has(type) || this.loadingCharms.has(type)) {
      return;
    }
    const localUrl = WeaponAttachmentSystem.CHARM_URLS[type];
    if (!localUrl) return;
    this.loadingCharms.add(type);
    this.getLoader().load(
      resolveAssetUrl(localUrl),
      (gltf) => {
        this.loadingCharms.delete(type);
        const root = gltf.scene;
        root.traverse((c) => {
          c.frustumCulled = false;
        });
        root.visible = false;
        this.charmPendulumPivot.add(root);
        this.charmModels.set(type, root);
        this.syncCharmVisibility();
      },
      undefined,
      () => {
        this.loadingCharms.delete(type);
      }
    );
  }

  public updateWeaponAlignment(weaponId: WeaponId): void {
    this.currentWeapon = weaponId;
    const mTrans = WEAPON_MUZZLE_OFFSETS[weaponId];
    if (mTrans) {
      this.muzzleAnchor.position.copy(mTrans.position);
      this.muzzleAnchor.rotation.copy(mTrans.rotation);
      this.muzzleAnchor.scale.setScalar(mTrans.scale);
    }

    const cTrans = WEAPON_CHARM_OFFSETS[weaponId];
    if (cTrans) {
      this.charmAnchor.position.copy(cTrans.position);
      this.charmAnchor.rotation.copy(cTrans.rotation);
      this.charmAnchor.scale.setScalar(cTrans.scale);
    }

    // Dá um leve impulso de inércia ao trocar de arma
    this.pitchVel = -2.2;
    this.rollVel = -1.6;

    this.syncMuzzleVisibility();
    this.syncCharmVisibility();
  }

  /**
   * Impulso físico instantâneo no chaveiro ao disparar a arma.
   */
  public notifyFireImpulse(recoilIntensity = 1.0): void {
    if (this.currentCharm === 'NONE' || this.currentWeapon === 'KNIFE_TACTICAL') {
      return;
    }
    const k = THREE.MathUtils.clamp(recoilIntensity, 0.5, 2.2);
    // O recuo empurra a arma para trás (+Z) e para cima (+Y), lançando o pêndulo do chaveiro
    this.pitchVel -= (7.8 + Math.random() * 2.6) * k;
    this.rollVel -= (3.6 + Math.random() * 1.8) * k;
    this.yawVel += (Math.random() - 0.45) * 9.5 * k;
  }

  /**
   * Simulação física Zero-GC de pêndulo esférico 2-DOF + torção com colisão na parede do receptor.
   */
  public updatePhysics(
    dt: number,
    lookSwayX: number,
    lookSwayY: number,
    horizSpeed: number,
    verticalVel: number,
    walkPhase: number,
    weaponTiltZ: number,
    weaponPitchX: number
  ): void {
    const isKnife = this.currentWeapon === 'KNIFE_TACTICAL';
    if (this.currentCharm === 'NONE' || isKnife) {
      return;
    }

    const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);
    const invDt = 1 / clampedDt;

    // Acelerações lineares aparentes provenientes do giro da câmera e pulo/aterrissagem
    const lookAccX = THREE.MathUtils.clamp(
      (lookSwayX - this.prevLookSwayX) * invDt,
      -12,
      12
    );
    const lookAccY = THREE.MathUtils.clamp(
      (lookSwayY - this.prevLookSwayY) * invDt,
      -12,
      12
    );
    const vertAcc = THREE.MathUtils.clamp(
      (verticalVel - this.prevVerticalVel) * invDt,
      -32,
      32
    );
    this.prevLookSwayX = lookSwayX;
    this.prevLookSwayY = lookSwayY;
    this.prevVerticalVel = verticalVel;

    // Cadência de passos / corrida excita o pêndulo organicamente
    const moveFactor = THREE.MathUtils.clamp(horizSpeed / 5.5, 0, 1.35);
    const stepDrivePitch =
      Math.cos(walkPhase * 2) * moveFactor * 16.5 - moveFactor * 4.2;
    const stepDriveRoll =
      Math.sin(walkPhase) * moveFactor * 11.0 - moveFactor * 2.6;

    // Ângulo de equilíbrio considerando a inclinação da arma (ADS canted / inspect)
    const restPitch = THREE.MathUtils.clamp(-weaponPitchX * 0.85, -0.65, 0.65);
    const restRoll = THREE.MathUtils.clamp(
      -0.15 - weaponTiltZ * 0.75,
      -0.85,
      -0.06
    );

    // Constantes físicas de um pêndulo curto (~3.5 cm de comprimento efetivo: omega_n = sqrt(g / L) ≈ 16.7 rad/s)
    const omegaSq = 245.0;
    const damping = 5.2;

    // Excitação externa combinada
    const extPitchAcc =
      -lookAccY * 18.0 + stepDrivePitch - vertAcc * 0.55;
    const extRollAcc =
      -lookAccX * 22.0 + stepDriveRoll - Math.abs(vertAcc) * 0.32;
    const extYawAcc =
      -lookAccX * 14.0 + Math.sin(walkPhase * 1.5) * moveFactor * 8.0;

    // Integração semi-implícita com 2 sub-passos para estabilidade absoluta a qualquer FPS
    const subDt = clampedDt * 0.5;
    for (let step = 0; step < 2; step++) {
      const pitchForce =
        -omegaSq * Math.sin(this.pitchAngle - restPitch) -
        damping * this.pitchVel +
        extPitchAcc;
      this.pitchVel += pitchForce * subDt;
      this.pitchAngle += this.pitchVel * subDt;

      const rollForce =
        -omegaSq * Math.sin(this.rollAngle - restRoll) -
        damping * this.rollVel +
        extRollAcc;
      this.rollVel += rollForce * subDt;
      this.rollAngle += this.rollVel * subDt;

      const yawForce =
        -85.0 * (this.yawAngle - 0.22 - this.rollAngle * 0.35) -
        6.5 * this.yawVel +
        extYawAcc;
      this.yawVel += yawForce * subDt;
      this.yawAngle += this.yawVel * subDt;

      // Colisão elástica contra a parede esquerda do receptor (roll > -0.045 rad):
      // impede que o chaveiro atravesse a arma e gera um quique metálico realista!
      if (this.rollAngle > -0.045) {
        this.rollAngle = -0.045;
        if (this.rollVel > 0) {
          this.rollVel = -this.rollVel * 0.44;
          this.yawVel += (this.pitchVel > 0 ? 1 : -1) * Math.abs(this.rollVel) * 0.35;
        }
      } else if (this.rollAngle < -1.15) {
        this.rollAngle = -1.15;
        if (this.rollVel < 0) {
          this.rollVel = -this.rollVel * 0.35;
        }
      }

      if (this.pitchAngle > 1.05) {
        this.pitchAngle = 1.05;
        if (this.pitchVel > 0) this.pitchVel = -this.pitchVel * 0.35;
      } else if (this.pitchAngle < -1.05) {
        this.pitchAngle = -1.05;
        if (this.pitchVel < 0) this.pitchVel = -this.pitchVel * 0.35;
      }

      this.yawAngle = THREE.MathUtils.clamp(this.yawAngle, -0.85, 1.15);
    }

    this.charmPendulumPivot.rotation.set(
      this.pitchAngle,
      this.yawAngle,
      this.rollAngle,
      'XZY'
    );
  }

  public setMuzzle(type: MuzzleType): void {
    this.currentMuzzle = type;
    this.ensureMuzzleLoaded(type);
    this.syncMuzzleVisibility();
  }

  public setCharm(type: CharmType): void {
    this.currentCharm = type;
    this.ensureCharmLoaded(type);
    this.syncCharmVisibility();
  }

  public getMuzzle(): MuzzleType {
    return this.currentMuzzle;
  }

  public getCharm(): CharmType {
    return this.currentCharm;
  }

  private syncMuzzleVisibility(): void {
    const isKnife = this.currentWeapon === 'KNIFE_TACTICAL';
    this.muzzleModels.forEach((model, type) => {
      model.visible = !isKnife && type === this.currentMuzzle;
    });
  }

  private syncCharmVisibility(): void {
    const isKnife = this.currentWeapon === 'KNIFE_TACTICAL';
    const hasCharm = !isKnife && this.currentCharm !== 'NONE';
    this.charmMountHardware.visible = hasCharm;
    this.charmModels.forEach((model, type) => {
      model.visible = !isKnife && type === this.currentCharm;
    });
  }
}
