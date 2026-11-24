import * as THREE from 'three';
import { DrillMode, WeaponId } from '../types/game';
import { createGameGltfLoader, disposeGameGltfLoader, ensureMeshoptDecoder } from './gltfLoaderFactory';
import { Dust2TriangleCollider } from './dust2Collider';
import { Dust2LevelBundle, runExclusiveGlbLoad } from './dust2LevelBuilder';
import { TacticalTargetEntity } from './levelBuilder';
import { YardBotEntity } from './yardPropsBuilder';
import { resolveAssetUrl } from '../utils/assetUrl';

export type V23BombMapMode =
  | 'CSGO_ASSAULT_BOMB_5V5'
  | 'DE_DST_BOMB_5V5'
  | 'MP_NUKED_BOMB_5V5'
  | 'DE_SUPPLY_BOMB_5V5'
  | 'YARD_V2_BOMB_5V5';

export interface V23MapConfig {
  mode: V23BombMapMode;
  label: string;
  glbUrl: string;
  floorYLift: number;
  attackerSpawn: THREE.Vector3;
  defenderSpawn: THREE.Vector3;
  spawnYaw: number;
  bombSiteA: THREE.Vector3;
  bombSiteB: THREE.Vector3;
  getCallout: (x: number, y: number, z: number) => string;
}

export const V23_MAP_CONFIGS: Record<V23BombMapMode, V23MapConfig> = {
  CSGO_ASSAULT_BOMB_5V5: {
    mode: 'CSGO_ASSAULT_BOMB_5V5',
    label: 'CS:GO ASSAULT',
    glbUrl: resolveAssetUrl('/models/maps/mp_csgo_assault_2k.glb'),
    floorYLift: 0,
    attackerSpawn: new THREE.Vector3(-22.79, -0.41, -33.44),
    defenderSpawn: new THREE.Vector3(22.11, 6.30, 25.64),
    spawnYaw: -Math.PI * 0.75,
    bombSiteA: new THREE.Vector3(13.20, 6.25, 27.01),
    bombSiteB: new THREE.Vector3(-10.58, -0.41, -31.56),
    getCallout: (x, y, z) => {
      if (y > 8.5) return 'TELHADO / PASSARELA SUPERIOR (ROOFTOP)';
      if (x > 4 && z > 10) return 'BOMBA A (WAREHOUSE INTERIOR)';
      if (z < -20 && x < 2) return 'BOMBA B (LOADING STREET)';
      if (z > 0) return 'GALPÃO PRINCIPAL (MAIN WAREHOUSE)';
      return 'PÁTIO INDUSTRIAL (ASSAULT EXTERIOR)';
    },
  },
  DE_DST_BOMB_5V5: {
    mode: 'DE_DST_BOMB_5V5',
    label: 'DE_DST (DUST REMASTER)',
    glbUrl: resolveAssetUrl('/models/maps/de_dst_2k.glb'),
    floorYLift: 0,
    attackerSpawn: new THREE.Vector3(-19.93, 0.0, -64.31),
    defenderSpawn: new THREE.Vector3(-11.34, 1.42, 62.84),
    spawnYaw: Math.PI,
    bombSiteA: new THREE.Vector3(34.59, 0.0, 6.40),
    bombSiteB: new THREE.Vector3(-2.50, 0.20, 34.64),
    getCallout: (x, _y, z) => {
      if (z < -45) return 'BASE BLACKTHORN (T SPAWN)';
      if (z > 48) return 'BASE VANGUARD (CT SPAWN)';
      if (x > 20 && z > -12 && z < 24) return 'BOMBA A (EAST COURTYARD)';
      if (x > -18 && x < 14 && z > 20 && z < 48) return 'BOMBA B (PALACE PLAZA)';
      if (Math.abs(x) < 15 && Math.abs(z) < 20) return 'PASSAGEM SUBTERRÂNEA / MEIO (UNDERPASS)';
      return 'DE_DST (DESERT SECTOR)';
    },
  },
  MP_NUKED_BOMB_5V5: {
    mode: 'MP_NUKED_BOMB_5V5',
    label: 'MP_NUKED (NUKETOWN)',
    glbUrl: resolveAssetUrl('/models/maps/mp_nuked_2k.glb'),
    floorYLift: 0,
    attackerSpawn: new THREE.Vector3(-43.23, -0.13, -13.92),
    defenderSpawn: new THREE.Vector3(42.10, -0.13, 3.68),
    spawnYaw: -Math.PI * 0.55,
    bombSiteA: new THREE.Vector3(21.26, 0.05, -4.51),
    bombSiteB: new THREE.Vector3(-22.86, 0.05, -1.22),
    getCallout: (x, y, _z) => {
      if (y > 2.8) return 'SEGUNDO ANDAR / JANELA (UPPER WINDOW)';
      if (x < -32) return 'JARDIM OESTE (YELLOW HOUSE BACKYARD)';
      if (x > 32) return 'JARDIM LESTE (GREEN HOUSE BACKYARD)';
      if (x >= 12 && x <= 32) return 'BOMBA A (GREEN HOUSE)';
      if (x <= -12 && x >= -32) return 'BOMBA B (YELLOW HOUSE)';
      return 'RUA CENTRAL / ÔNIBUS (NUKETOWN MID)';
    },
  },
  DE_SUPPLY_BOMB_5V5: {
    mode: 'DE_SUPPLY_BOMB_5V5',
    label: 'DE_SUPPLY',
    glbUrl: resolveAssetUrl('/models/maps/de_supply_2k.glb'),
    floorYLift: 0,
    attackerSpawn: new THREE.Vector3(-34.95, 4.27, -43.08),
    defenderSpawn: new THREE.Vector3(-26.82, 0.13, 32.11),
    spawnYaw: Math.PI * 0.85,
    bombSiteA: new THREE.Vector3(-32.31, 0.01, 9.75),
    bombSiteB: new THREE.Vector3(35.05, 0.04, 6.30),
    getCallout: (x, _y, z) => {
      if (z < -32) return 'ENTRADA SUL (ATTACKER SPAWN)';
      if (z > 22 && x < -10) return 'BASE NORTE (DEFENDER SPAWN)';
      if (x < -18 && z > -4 && z < 22) return 'BOMBA A (WEST STORAGE)';
      if (x > 20 && z > -8 && z < 20) return 'BOMBA B (EAST DEPOT)';
      return 'COMPLEXO CENTRAL (SUPPLY MID)';
    },
  },
  YARD_V2_BOMB_5V5: {
    mode: 'YARD_V2_BOMB_5V5',
    label: 'YARD 2.0 HD',
    glbUrl: resolveAssetUrl('/models/maps/yard_v2_2k.glb'),
    floorYLift: 0,
    attackerSpawn: new THREE.Vector3(-36.73, 1.38, 28.27),
    defenderSpawn: new THREE.Vector3(50.60, 0.15, -4.95),
    spawnYaw: -Math.PI * 0.65,
    bombSiteA: new THREE.Vector3(-7.75, 4.98, 51.92),
    bombSiteB: new THREE.Vector3(-32.45, 5.00, -21.10),
    getCallout: (x, y, z) => {
      if (x > 34) return 'BASE BLACKTHORN (EAST MARKET SPAWN)';
      if (x < -28 && z > 16) return 'BASE VANGUARD (WEST ROAD SPAWN)';
      if (z > 36 && x > -24 && x < 12) return 'BOMBA A (CAMO TENT / NORTH YARD)';
      if (z < -8 && x < -18) return 'BOMBA B (SOUTH-WEST COMPOUND)';
      if (y > 7.5) return 'VARANDA / PASSARELA SUPERIOR (UPPER BALCONY)';
      return 'PÁTIO CENTRAL (YARD 2.0 MID)';
    },
  },
};

export function isV23BombMapMode(mode: DrillMode | undefined | null): mode is V23BombMapMode {
  return (
    mode === 'CSGO_ASSAULT_BOMB_5V5' ||
    mode === 'DE_DST_BOMB_5V5' ||
    mode === 'MP_NUKED_BOMB_5V5' ||
    mode === 'DE_SUPPLY_BOMB_5V5' ||
    mode === 'YARD_V2_BOMB_5V5'
  );
}

export function buildV23MapLevel(
  mode: V23BombMapMode,
  isSoftwareGl: boolean
): Dust2LevelBundle {
  const cfg = V23_MAP_CONFIGS[mode];
  const levelGroup = new THREE.Group();
  levelGroup.name = `${mode}_Root`;

  const shootableMeshes: THREE.Mesh[] = [];
  const targets: TacticalTargetEntity[] = [];
  const collider = new Dust2TriangleCollider();

  addBombSiteBeacon(levelGroup, cfg.bombSiteA, 'A', 0xdc2626);
  addBombSiteBeacon(levelGroup, cfg.bombSiteB, 'B', 0x0284c7);
  spawnV23Squads(cfg, levelGroup, targets, shootableMeshes, isSoftwareGl);

  return {
    levelGroup,
    colliders: [],
    targets,
    shootableMeshes,
    wallStandPositions: [
      cfg.attackerSpawn.clone(),
      cfg.defenderSpawn.clone(),
    ],
    collider,
    mapGeometryGroup: null,
    isLoaded: false,
  };
}

export async function loadV23MapGeometry(
  mode: V23BombMapMode,
  bundle: Dust2LevelBundle,
  isSoftwareGl: boolean,
  loadingManager: THREE.LoadingManager,
  onByteProgress?: (ratio0to1: number) => void
): Promise<void> {
  const cfg = V23_MAP_CONFIGS[mode];
  await runExclusiveGlbLoad(bundle, async () => {
    disposeV23MapGeometry(bundle);

    await ensureMeshoptDecoder();
    const gltfLoader = createGameGltfLoader(loadingManager);

    try {
      const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
        gltfLoader.load(
          cfg.glbUrl,
          (loaded) => resolve(loaded),
          (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              onByteProgress?.(Math.min(1, evt.loaded / evt.total));
            }
          },
          (err) => reject(err)
        );
      });

      const modelRoot = gltf.scene;
      modelRoot.name = `${mode}_GLB`;

      const mapTransformGroup = new THREE.Group();
      mapTransformGroup.name = `${mode}_NormalizedGeometry`;
      mapTransformGroup.position.set(0, cfg.floorYLift, 0);
      mapTransformGroup.add(modelRoot);

      mapTransformGroup.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = false;
        child.receiveShadow = !isSoftwareGl;
        child.frustumCulled = false;
        child.userData.isEnvironment = true;

        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        mats.forEach((m) => {
          const std = m as THREE.MeshStandardMaterial;
          if (!std) return;
          if (std.map) {
            std.map.colorSpace = THREE.SRGBColorSpace;
            std.map.anisotropy = isSoftwareGl ? 1 : 4;
            std.map.needsUpdate = true;
          }
          std.roughness = Math.max(0.65, std.roughness ?? 0.85);
          std.metalness = Math.min(0.18, std.metalness ?? 0.05);
          std.envMapIntensity = 0.42;
          const matName = (std.name || '').toLowerCase();
          const isCutout =
            std.alphaTest > 0 ||
            std.transparent ||
            /fence|chainlink|grate|foliage|tree|shrub|bush|grass|plant|flower|leaf|wire|glass|window|decal|sign_alpha/i.test(
              matName
            );
          if (isCutout) {
            std.alphaTest = Math.max(std.alphaTest || 0, 0.4);
            std.transparent = false;
            std.depthWrite = true;
            std.side = THREE.DoubleSide;
          } else {
            // DoubleSide prevents any single-sided brush/prop seam from appearing transparent
            std.side = THREE.DoubleSide;
          }
          if (/decal|graf|poster|stain|overlay/i.test(matName)) {
            std.polygonOffset = true;
            std.polygonOffsetFactor = -1;
            std.polygonOffsetUnits = -1;
          }
        });
      });

      bundle.levelGroup.add(mapTransformGroup);
      bundle.levelGroup.updateMatrixWorld(true);
      bundle.mapGeometryGroup = mapTransformGroup;

      bundle.collider.buildFromGroup(mapTransformGroup, []);

      for (let i = 0; i < bundle.targets.length; i++) {
        const bot = bundle.targets[i];
        const p = bundle.collider.findPlayableSpawn(
          bot.basePosition.x,
          bot.basePosition.z,
          bot.basePosition.y
        );
        bot.basePosition.set(p.x, p.y, p.z);
        bot.root.position.set(p.x, p.y, p.z);
      }

      bundle.isLoaded = true;
      onByteProgress?.(1.0);
    } finally {
      disposeGameGltfLoader(gltfLoader);
    }
  }, onByteProgress);
}

export function disposeV23MapGeometry(bundle: Dust2LevelBundle): void {
  if (bundle.mapGeometryGroup) {
    bundle.mapGeometryGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        mats.forEach((m) => {
          const basic = m as THREE.MeshBasicMaterial;
          if (basic.map) basic.map.dispose();
          m.dispose();
        });
      }
    });
    bundle.levelGroup.remove(bundle.mapGeometryGroup);
    bundle.mapGeometryGroup = null;
  }

  for (let i = bundle.shootableMeshes.length - 1; i >= 0; i--) {
    if (bundle.shootableMeshes[i].userData?.isEnvironment) {
      bundle.shootableMeshes.splice(i, 1);
    }
  }

  bundle.collider.clear();
  bundle.isLoaded = false;
}

function addBombSiteBeacon(
  levelGroup: THREE.Group,
  pos: THREE.Vector3,
  siteLabel: 'A' | 'B',
  colorHex: number
): void {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.45, 24),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, pos.y + 0.05, pos.z);
  ring.userData.ignoreCollider = true;
  levelGroup.add(ring);

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = siteLabel === 'A' ? '#dc2626' : '#0284c7';
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 66px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(siteLabel, 64, 68);

  const badgeTex = new THREE.CanvasTexture(canvas);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, 1.3),
    new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  sign.position.set(pos.x, pos.y + 2.35, pos.z);
  sign.userData.ignoreCollider = true;
  levelGroup.add(sign);
}

function spawnV23Squads(
  cfg: V23MapConfig,
  levelGroup: THREE.Group,
  targets: TacticalTargetEntity[],
  shootableMeshes: THREE.Mesh[],
  isSoftwareGl: boolean
): void {
  const spawnBot = (opts: {
    id: string;
    x: number;
    y: number;
    z: number;
    isAlly: boolean;
    callsign: string;
    weaponId: WeaponId;
    patrolAxis?: 'X' | 'Z' | 'NONE';
    patrolRange?: number;
    patrolSpeed?: number;
    hasArmor?: boolean;
  }) => {
    const root = new THREE.Group();
    root.position.set(opts.x, opts.y, opts.z);
    const pivotGroup = new THREE.Group();
    root.add(pivotGroup);

    const matSuit = new THREE.MeshStandardMaterial({
      color: opts.isAlly ? 0x1e3a5f : 0x5c2828,
      roughness: 0.72,
      metalness: 0.18,
    });
    const matHead = new THREE.MeshStandardMaterial({
      color: opts.isAlly ? 0x0f172a : 0x2a1212,
      roughness: 0.55,
      metalness: 0.25,
    });

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.68, 0.2), matSuit);
    legs.position.set(0, 0.34, 0);
    pivotGroup.add(legs);

    const torsoMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.76, 0.24),
      matSuit
    );
    torsoMesh.position.set(0, 1.06, 0);
    torsoMesh.castShadow = !isSoftwareGl;
    pivotGroup.add(torsoMesh);

    const headMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.3, 0.24),
      matHead
    );
    headMesh.position.set(0, 1.64, 0);
    headMesh.castShadow = !isSoftwareGl;
    pivotGroup.add(headMesh);

    const visorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.04),
      new THREE.MeshBasicMaterial({
        color: opts.isAlly ? 0x38bdf8 : 0xf59e0b,
      })
    );
    visorMesh.position.set(0, 1.66, 0.12);
    pivotGroup.add(visorMesh);

    let armorMesh: THREE.Mesh | undefined;
    if (opts.hasArmor) {
      armorMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.48, 0.06),
        new THREE.MeshStandardMaterial({
          color: opts.isAlly ? 0x38bdf8 : 0xf59e0b,
          metalness: 0.75,
          roughness: 0.3,
        })
      );
      armorMesh.position.set(0, 1.1, 0.14);
      if (!opts.isAlly) {
        armorMesh.userData.targetId = opts.id;
        armorMesh.userData.hitZone = 'ARMOR';
        shootableMeshes.push(armorMesh);
      }
      pivotGroup.add(armorMesh);
    }

    let laserLine: THREE.Line | undefined;
    if (!opts.isAlly) {
      torsoMesh.userData.targetId = opts.id;
      torsoMesh.userData.hitZone = 'TORSO_A';
      headMesh.userData.targetId = opts.id;
      headMesh.userData.hitZone = 'HEAD';
      shootableMeshes.push(torsoMesh, headMesh);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 1.64, 0.12),
        new THREE.Vector3(0, 1.4, 14),
      ]);
      laserLine = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.75,
        })
      );
      laserLine.visible = false;
      pivotGroup.add(laserLine);
    }

    levelGroup.add(root);
    targets.push({
      id: opts.id,
      type: 'COMBAT_BOT',
      sector: 'KILLHOUSE',
      root,
      pivotGroup,
      headMesh,
      torsoMesh,
      armorMesh,
      visorMesh,
      laserLine,
      basePosition: new THREE.Vector3(opts.x, opts.y, opts.z),
      patrolOffset: Math.random() * Math.PI * 2,
      patrolSpeed: opts.patrolSpeed ?? 1.0,
      patrolAxis: opts.patrolAxis ?? 'X',
      patrolRange: opts.patrolRange ?? 2.2,
      maxHealth: 100,
      health: 100,
      armorHealth: opts.hasArmor ? 60 : 0,
      isDown: false,
      downTimer: 0,
      hitTiltAngle: 0,
      hitTiltVelocity: 0,
      canShootBack: !opts.isAlly,
      windupTimer: 0,
      cooldownTimer: 1.4 + Math.random() * 1.5,
      isTelegraphing: false,
      isAlly: opts.isAlly,
      callsign: opts.callsign,
      team: opts.isAlly ? 'VANGUARD' : 'BLACKTHORN',
      weaponId: opts.weaponId,
    } as YardBotEntity);
  };

  const a = cfg.bombSiteA;
  const b = cfg.bombSiteB;
  const def = cfg.defenderSpawn;
  const atk = cfg.attackerSpawn;
  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  const midY = Math.min(a.y, b.y);
  const prefix = cfg.mode.slice(0, 6).toLowerCase();

  // 5 Blackthorn defenders around Site A, Site B, Mid, and Defender spawn
  spawnBot({
    id: `${prefix}_bt_siteA`,
    callsign: 'HAVOC-BT',
    weaponId: 'AK47_RIFLE',
    x: a.x + 1.8,
    y: a.y,
    z: a.z - 1.5,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 3.5,
    hasArmor: true,
  });
  spawnBot({
    id: `${prefix}_bt_siteB`,
    callsign: 'KRAKEN-BT',
    weaponId: 'AK47_RIFLE',
    x: b.x - 1.8,
    y: b.y,
    z: b.z + 1.5,
    isAlly: false,
    patrolAxis: 'Z',
    patrolRange: 3.5,
    hasArmor: true,
  });
  spawnBot({
    id: `${prefix}_bt_mid`,
    callsign: 'SERAPH-BT',
    weaponId: 'M4_CARBINE',
    x: midX,
    y: midY,
    z: midZ,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 4.0,
    hasArmor: true,
  });
  spawnBot({
    id: `${prefix}_bt_anchor`,
    callsign: 'WRAITH-BT',
    weaponId: 'SNIPER_BOLT',
    x: def.x - 2.2,
    y: def.y,
    z: def.z - 2.0,
    isAlly: false,
    patrolAxis: 'Z',
    patrolRange: 3.0,
    hasArmor: true,
  });
  spawnBot({
    id: `${prefix}_bt_flank`,
    callsign: 'VOLT-BT',
    weaponId: 'SMG_MP5',
    x: (midX + def.x) * 0.5,
    y: def.y,
    z: (midZ + def.z) * 0.5,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 3.2,
    hasArmor: true,
  });

  // 4 Vanguard allies with player at Attacker spawn
  spawnBot({
    id: `${prefix}_vg_1`,
    callsign: 'RECON-02',
    weaponId: 'SNIPER_BOLT',
    x: atk.x + 2.4,
    y: atk.y,
    z: atk.z + 1.5,
    isAlly: true,
    patrolAxis: 'X',
    patrolRange: 2.8,
    hasArmor: true,
  });
  spawnBot({
    id: `${prefix}_vg_2`,
    callsign: 'STRIKER-03',
    weaponId: 'AK47_RIFLE',
    x: atk.x - 2.4,
    y: atk.y,
    z: atk.z + 1.5,
    isAlly: true,
    patrolAxis: 'Z',
    patrolRange: 2.8,
    hasArmor: true,
  });
  spawnBot({
    id: `${prefix}_vg_3`,
    callsign: 'LIFELINE-04',
    weaponId: 'M4_CARBINE',
    x: atk.x + 1.8,
    y: atk.y,
    z: atk.z - 1.8,
    isAlly: true,
    patrolAxis: 'X',
    patrolRange: 2.6,
  });
  spawnBot({
    id: `${prefix}_vg_4`,
    callsign: 'WARDEN-05',
    weaponId: 'SMG_MP5',
    x: atk.x - 1.8,
    y: atk.y,
    z: atk.z - 1.8,
    isAlly: true,
    patrolAxis: 'Z',
    patrolRange: 2.6,
  });
}
