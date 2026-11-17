import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { WeaponId } from '../types/game';
import { Dust2TriangleCollider } from './dust2Collider';
import { Dust2LevelBundle, runExclusiveGlbLoad } from './dust2LevelBuilder';
import { TacticalTargetEntity } from './levelBuilder';
import { YardBotEntity } from './yardPropsBuilder';

/** Station Arena — FBX urban transit station + 2048x2048 PBR atlas (`Arena_tex01.png`). */
export const STATION_ARENA_FBX_URL = '/maps/station_arena/Station_Arena.FBX';
export const STATION_ARENA_ATLAS_URL = '/maps/station_arena/Arena_tex01.png';

/**
 * Raw FBX units are in centimeters (`Ground_0` is 1783 × 1556 units).
 * Scaling by 0.032 yields a 57m × 50m playable street (`X ∈ [-28.5, 28.5]`, `Z ∈ [-25.0, 24.7]`)
 * with flat street floor at Y = 0.00.
 */
export const STATION_ARENA_SCALE = 0.032;

/** Vanguard (Blue) base flag pedestal — South-West transit terminal plaza. */
export const STATION_ARENA_VANGUARD_FLAG_BASE = new THREE.Vector3(-10.0, 0.05, -16.0);
/** Blackthorn (Red) base flag pedestal — North-East transit terminal plaza. */
export const STATION_ARENA_BLACKTHORN_FLAG_BASE = new THREE.Vector3(10.0, 0.05, 16.0);

/** Compatibility aliases for bomb-site helpers / nav routes. */
export const STATION_ARENA_BOMB_SITE_A = STATION_ARENA_VANGUARD_FLAG_BASE;
export const STATION_ARENA_BOMB_SITE_B = STATION_ARENA_BLACKTHORN_FLAG_BASE;

/** Vanguard player spawn — South-West street behind Vanguard Flag Base. */
export const STATION_ARENA_ATTACKER_SPAWN = new THREE.Vector3(-14.0, 0.15, -18.0);
/** Look +Z toward mid street and Blackthorn base. */
export const STATION_ARENA_SPAWN_YAW = Math.PI;
/** Blackthorn defender spawn — North-East street behind Blackthorn Flag Base. */
export const STATION_ARENA_DEFENDER_SPAWN = new THREE.Vector3(14.0, 0.15, 18.0);

export function getStationArenaCalloutForPos(
  x: number,
  y: number,
  z: number
): string {
  const distVg = Math.hypot(x - STATION_ARENA_VANGUARD_FLAG_BASE.x, z - STATION_ARENA_VANGUARD_FLAG_BASE.z);
  if (distVg <= 6.5) return 'BASE VANGUARD (BANDEIRA ALIADA)';
  const distBt = Math.hypot(x - STATION_ARENA_BLACKTHORN_FLAG_BASE.x, z - STATION_ARENA_BLACKTHORN_FLAG_BASE.z);
  if (distBt <= 6.5) return 'BASE BLACKTHORN (BANDEIRA INIMIGA)';
  if (z < -12) return 'TERMINAL SUL (VANGUARD SPAWN)';
  if (z > 12) return 'TERMINAL NORTE (BLACKTHORN SPAWN)';
  if (x < -7) return 'CORREDOR OESTE (CAIXAS ELETRÔNICOS)';
  if (x > 7) return 'AVENIDA LESTE (SUBSOLO / LOJAS)';
  if (y > 4.5) return 'PASSARELA ELEVADA (MONOTRILHO)';
  return 'PRAÇA CENTRAL (STATION ARENA)';
}

export function buildStationArenaLevel(
  isSoftwareGl: boolean
): Dust2LevelBundle {
  const levelGroup = new THREE.Group();
  levelGroup.name = 'StationArenaLevelRoot';

  const shootableMeshes: THREE.Mesh[] = [];
  const targets: TacticalTargetEntity[] = [];
  const collider = new Dust2TriangleCollider();

  // Crisp urban twilight / daylight bounce
  const hemi = new THREE.HemisphereLight(0xf2f7ff, 0x7c746b, 0.95);
  levelGroup.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e4, 1.35);
  sun.position.set(18, 36, -22);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = false;
  levelGroup.add(sun);
  levelGroup.add(sun.target);

  addStationFlagBaseBeacon(
    levelGroup,
    STATION_ARENA_VANGUARD_FLAG_BASE,
    'BASE VANGUARD',
    0x0ea5e9
  );
  addStationFlagBaseBeacon(
    levelGroup,
    STATION_ARENA_BLACKTHORN_FLAG_BASE,
    'BASE BLACKTHORN',
    0xef4444
  );

  spawnStationArenaSquads(levelGroup, targets, shootableMeshes, isSoftwareGl);

  return {
    levelGroup,
    colliders: [],
    targets,
    shootableMeshes,
    wallStandPositions: [
      STATION_ARENA_ATTACKER_SPAWN.clone(),
      STATION_ARENA_DEFENDER_SPAWN.clone(),
    ],
    collider,
    mapGeometryGroup: null,
    isLoaded: false,
  };
}

export async function loadStationArenaMapGeometry(
  bundle: Dust2LevelBundle,
  isSoftwareGl: boolean,
  loadingManager: THREE.LoadingManager,
  onByteProgress?: (ratio0to1: number) => void
): Promise<void> {
  await runExclusiveGlbLoad(bundle, async () => {
    disposeStationArenaMapGeometry(bundle);

    const texLoader = new THREE.TextureLoader(loadingManager);
    const fbxLoader = new FBXLoader(loadingManager);

    const [atlasTex, fbxRoot] = await Promise.all([
      new Promise<THREE.Texture>((resolve, reject) => {
        texLoader.load(
          STATION_ARENA_ATLAS_URL,
          (tex) => resolve(tex),
          undefined,
          (err) => reject(err)
        );
      }),
      new Promise<THREE.Group>((resolve, reject) => {
        fbxLoader.load(
          STATION_ARENA_FBX_URL,
          (group) => resolve(group),
          (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              onByteProgress?.(Math.min(1, evt.loaded / evt.total));
            }
          },
          (err) => reject(err)
        );
      }),
    ]);

    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.flipY = true;
    atlasTex.wrapS = THREE.RepeatWrapping;
    atlasTex.wrapT = THREE.RepeatWrapping;
    atlasTex.anisotropy = isSoftwareGl ? 1 : 8;
    atlasTex.needsUpdate = true;

    const sharedArenaMaterial = new THREE.MeshStandardMaterial({
      name: 'StationArenaAtlasPBR',
      map: atlasTex,
      roughness: 0.66,
      metalness: 0.12,
      envMapIntensity: 0.88,
      side: THREE.DoubleSide,
    });

    fbxRoot.name = 'StationArenaFBX';
    fbxRoot.scale.setScalar(STATION_ARENA_SCALE);

    const mapTransformGroup = new THREE.Group();
    mapTransformGroup.name = 'StationArenaNormalizedGeometry';
    mapTransformGroup.position.set(0, 0, 0);
    mapTransformGroup.add(fbxRoot);

    mapTransformGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const meshName = (child.name || '').toLowerCase();

      child.castShadow = false;
      child.receiveShadow = !isSoftwareGl;
      child.frustumCulled = false;
      child.userData.isEnvironment = true;

      // Distant backdrop buildings, overhead monorail bridge & wires should not expand playable street bounds
      if (
        meshName.includes('background_buildings') ||
        meshName.includes('bridge') ||
        meshName.includes('wires')
      ) {
        child.userData.ignoreCollider = true;
      }

      // Dispose default untextured FBX Phong material and bind the 2K Station_Arena atlas
      const prevMats = Array.isArray(child.material)
        ? child.material
        : child.material
          ? [child.material]
          : [];
      prevMats.forEach((m) => m?.dispose?.());

      child.material = sharedArenaMaterial;
      if (child.geometry && !child.geometry.attributes.normal) {
        child.geometry.computeVertexNormals();
      }
      if (!child.userData.ignoreCollider) {
        bundle.shootableMeshes.push(child);
      }
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
  }, onByteProgress);
}

export function disposeStationArenaMapGeometry(bundle: Dust2LevelBundle): void {
  if (bundle.mapGeometryGroup) {
    const disposedMaterials = new Set<THREE.Material>();
    bundle.mapGeometryGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        mats.forEach((m) => {
          if (m && !disposedMaterials.has(m)) {
            disposedMaterials.add(m);
            const std = m as THREE.MeshStandardMaterial;
            if (std.map) std.map.dispose();
            m.dispose();
          }
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

function addStationFlagBaseBeacon(
  levelGroup: THREE.Group,
  pos: THREE.Vector3,
  label: string,
  colorHex: number
): void {
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 2.45, 32),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
    })
  );
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.set(pos.x, pos.y + 0.04, pos.z);
  outerRing.userData.ignoreCollider = true;
  levelGroup.add(outerRing);

  const innerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.95, 32),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18,
    })
  );
  innerDisc.rotation.x = -Math.PI / 2;
  innerDisc.position.set(pos.x, pos.y + 0.03, pos.z);
  innerDisc.userData.ignoreCollider = true;
  levelGroup.add(innerDisc);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = colorHex === 0x0ea5e9 ? 'rgba(14, 165, 233, 0.9)' : 'rgba(239, 68, 68, 0.9)';
  ctx.fillRect(4, 4, 248, 56);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`⚑ ${label}`, 128, 34);

  const badgeTex = new THREE.CanvasTexture(canvas);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshBasicMaterial({
      map: badgeTex,
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  sign.position.set(pos.x, pos.y + 3.4, pos.z);
  sign.userData.ignoreCollider = true;
  levelGroup.add(sign);
}

function spawnStationArenaSquads(
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
      patrolSpeed: opts.patrolSpeed ?? 1.1,
      patrolAxis: opts.patrolAxis ?? 'X',
      patrolRange: opts.patrolRange ?? 2.5,
      maxHealth: 100,
      health: 100,
      armorHealth: opts.hasArmor ? 60 : 0,
      isDown: false,
      downTimer: 0,
      hitTiltAngle: 0,
      hitTiltVelocity: 0,
      canShootBack: !opts.isAlly,
      windupTimer: 0,
      cooldownTimer: 1.3 + Math.random() * 1.4,
      isTelegraphing: false,
      isAlly: opts.isAlly,
      callsign: opts.callsign,
      team: opts.isAlly ? 'VANGUARD' : 'BLACKTHORN',
      weaponId: opts.weaponId,
    } as YardBotEntity);
  };

  // Blackthorn 5-man squad (North-East terminal)
  spawnBot({
    id: 'sta_bt_1',
    callsign: 'KRAKEN-BT',
    weaponId: 'AK47_RIFLE',
    x: 14.0,
    y: 0.15,
    z: 18.0,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 2.8,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_bt_2',
    callsign: 'WRAITH-BT',
    weaponId: 'SNIPER_BOLT',
    x: 6.0,
    y: 0.15,
    z: 18.0,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 2.4,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_bt_3',
    callsign: 'HAVOC-BT',
    weaponId: 'M4_CARBINE',
    x: 10.0,
    y: 0.15,
    z: 13.0,
    isAlly: false,
    patrolAxis: 'Z',
    patrolRange: 3.0,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_bt_4',
    callsign: 'SERAPH-BT',
    weaponId: 'SMG_MP5',
    x: 14.0,
    y: 0.15,
    z: 14.0,
    isAlly: false,
    patrolAxis: 'Z',
    patrolRange: 3.2,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_bt_5',
    callsign: 'VOLT-BT',
    weaponId: 'AK12_RIFLE',
    x: 6.0,
    y: 0.15,
    z: 14.0,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 2.6,
    hasArmor: true,
  });

  // Vanguard 4 AI teammates (South-West terminal with player)
  spawnBot({
    id: 'sta_vg_1',
    callsign: 'RECON-02',
    weaponId: 'SNIPER_BOLT',
    x: -6.0,
    y: 0.15,
    z: -18.0,
    isAlly: true,
    patrolAxis: 'X',
    patrolRange: 2.4,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_vg_2',
    callsign: 'STRIKER-03',
    weaponId: 'AK47_RIFLE',
    x: -10.0,
    y: 0.15,
    z: -13.0,
    isAlly: true,
    patrolAxis: 'Z',
    patrolRange: 2.8,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_vg_3',
    callsign: 'LIFELINE-04',
    weaponId: 'M4_CARBINE',
    x: -14.0,
    y: 0.15,
    z: -14.0,
    isAlly: true,
    patrolAxis: 'X',
    patrolRange: 2.5,
    hasArmor: true,
  });
  spawnBot({
    id: 'sta_vg_4',
    callsign: 'WARDEN-05',
    weaponId: 'SMG_MP5',
    x: -6.0,
    y: 0.15,
    z: -14.0,
    isAlly: true,
    patrolAxis: 'Z',
    patrolRange: 2.8,
    hasArmor: true,
  });
}
