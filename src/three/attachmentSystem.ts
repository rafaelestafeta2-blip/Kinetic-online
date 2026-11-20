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
    position: new THREE.Vector3(0, 0.003, -0.203),
    scale: 0.92,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  M1911_PISTOL: {
    position: new THREE.Vector3(0, -0.004, -0.132),
    scale: 0.86,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SMG_45: {
    position: new THREE.Vector3(0, 0.015, -0.33),
    scale: 0.96,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SMG_MP5: {
    position: new THREE.Vector3(0, 0.0, -0.341),
    scale: 0.96,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SHOTGUN_12: {
    position: new THREE.Vector3(0, 0.01, -0.716),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SHOTGUN_SPAS: {
    position: new THREE.Vector3(0, 0.01, -0.52),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  M4_CARBINE: {
    position: new THREE.Vector3(0, -0.011, -0.596),
    scale: 1.04,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  CARBINE_AR: {
    position: new THREE.Vector3(0, 0.0, -0.57),
    scale: 1.04,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  AK47_RIFLE: {
    position: new THREE.Vector3(0, 0.0, -0.52),
    scale: 1.06,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  AK12_RIFLE: {
    position: new THREE.Vector3(0, 0.0, -0.534),
    scale: 1.06,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  S_MILITARY: {
    position: new THREE.Vector3(-0.004, -0.01, -0.615),
    scale: 1.04,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  L49_LMG: {
    position: new THREE.Vector3(0, 0.015, -0.74),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_BOLT: {
    position: new THREE.Vector3(0, -0.002, -0.713),
    scale: 1.08,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_TACTICAL: {
    position: new THREE.Vector3(0, 0.001, -0.612),
    scale: 1.08,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_AWP: {
    position: new THREE.Vector3(0, 0.01, -0.88),
    scale: 1.12,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  SNIPER_HEAVY: {
    position: new THREE.Vector3(0, 0.015, -0.75),
    scale: 1.14,
    rotation: new THREE.Euler(0, -Math.PI / 2, 0),
  },
  RPG7_LAUNCHER: {
    position: new THREE.Vector3(0, 0.01, -0.849),
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
 * Weapon charm attachment positions (Left side picatinny rail / sling ring)
 */
export const WEAPON_CHARM_OFFSETS: Record<WeaponId, WeaponCharmTransform> = {
  P50_PISTOL: {
    position: new THREE.Vector3(-0.026, -0.032, 0.02),
    scale: 1.4,
    rotation: new THREE.Euler(0, 0, 0),
  },
  M1911_PISTOL: {
    position: new THREE.Vector3(-0.022, -0.026, 0.01),
    scale: 1.32,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SMG_45: {
    position: new THREE.Vector3(-0.028, 0.018, -0.08),
    scale: 1.6,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SMG_MP5: {
    position: new THREE.Vector3(-0.026, 0.012, -0.04),
    scale: 1.55,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SHOTGUN_12: {
    position: new THREE.Vector3(-0.028, 0.004, 0.02),
    scale: 1.65,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SHOTGUN_SPAS: {
    position: new THREE.Vector3(-0.036, -0.055, -0.14),
    scale: 1.65,
    rotation: new THREE.Euler(0, 0, 0),
  },
  M4_CARBINE: {
    position: new THREE.Vector3(-0.046, -0.03, -0.02),
    scale: 1.85,
    rotation: new THREE.Euler(0, 0, 0),
  },
  CARBINE_AR: {
    position: new THREE.Vector3(-0.032, 0.012, -0.06),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  AK47_RIFLE: {
    position: new THREE.Vector3(-0.038, 0.034, 0.04),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  AK12_RIFLE: {
    position: new THREE.Vector3(-0.034, 0.022, -0.02),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  S_MILITARY: {
    position: new THREE.Vector3(-0.034, -0.018, -0.12),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  L49_LMG: {
    position: new THREE.Vector3(-0.038, 0.012, -0.12),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_BOLT: {
    position: new THREE.Vector3(-0.032, 0.018, -0.1),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_TACTICAL: {
    position: new THREE.Vector3(-0.032, 0.018, -0.1),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_AWP: {
    position: new THREE.Vector3(-0.034, 0.012, -0.1),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  SNIPER_HEAVY: {
    position: new THREE.Vector3(-0.036, 0.014, -0.12),
    scale: 1.8,
    rotation: new THREE.Euler(0, 0, 0),
  },
  RPG7_LAUNCHER: {
    position: new THREE.Vector3(-0.04, 0.015, -0.16),
    scale: 1.85,
    rotation: new THREE.Euler(0, 0, 0),
  },
  KNIFE_TACTICAL: {
    position: new THREE.Vector3(-0.018, 0.01, 0.02),
    scale: 1.2,
    rotation: new THREE.Euler(0, 0, 0),
  },
};

export class WeaponAttachmentSystem {
  public muzzleAnchor: THREE.Group;
  public charmAnchor: THREE.Group;

  private muzzleModels: Map<MuzzleType, THREE.Group> = new Map();
  private charmModels: Map<CharmType, THREE.Group> = new Map();

  private currentMuzzle: MuzzleType = 'NONE';
  private currentCharm: CharmType = 'NONE';
  private currentWeapon: WeaponId = 'M4_CARBINE';

  private gltfLoader: GLTFLoader | null = null;
  private loadingMuzzles = new Set<MuzzleType>();
  private loadingCharms = new Set<CharmType>();

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
        root.visible = false;
        this.charmAnchor.add(root);
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

    this.syncMuzzleVisibility();
    this.syncCharmVisibility();
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
    this.charmModels.forEach((model, type) => {
      model.visible = type === this.currentCharm;
    });
  }
}
