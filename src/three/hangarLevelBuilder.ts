import * as THREE from 'three';
import { WeaponId } from '../types/game';
import { createGameGltfLoader, disposeGameGltfLoader, ensureMeshoptDecoder } from './gltfLoaderFactory';
import { Dust2TriangleCollider } from './dust2Collider';
import { Dust2LevelBundle, runExclusiveGlbLoad } from './dust2LevelBuilder';
import { TacticalTargetEntity } from './levelBuilder';
import { YardBotEntity } from './yardPropsBuilder';
import { resolveAssetUrl } from '../utils/assetUrl';

/** Hangar — ETC1S GPU textures + Meshopt geometry. */
const HANGAR_LOCAL_URL = resolveAssetUrl('/models/maps/hangar_2k.glb');

/**
 * angar.fbx floor sits near y≈0 (AABB y≈[-0.6, 27]). Small lift clears floor thickness.
 */
export const HANGAR_FLOOR_Y_LIFT = 0.6;

/** Vanguard attackers — West hangar bay facing East (+X) down the 75m warehouse. */
export const HANGAR_ATTACKER_SPAWN = new THREE.Vector3(-32.0, 0.6, 5.0);
/** Camera local -Z. -PI/2 rotates forward to +X (East). */
export const HANGAR_SPAWN_YAW = -Math.PI / 2;
/** Blackthorn defenders — East hangar bay opposite Vanguard. */
export const HANGAR_DEFENDER_SPAWN = new THREE.Vector3(30.5, 0.6, -1.5);
/** Bomb A — North Container Yard. */
export const HANGAR_BOMB_SITE_A = new THREE.Vector3(-9.0, 0.6, -9.0);
/** Bomb B — South-East Cargo Bay. */
export const HANGAR_BOMB_SITE_B = new THREE.Vector3(12.5, 0.6, 7.5);

export function getHangarCalloutForPos(
  x: number,
  y: number,
  z: number
): string {
  if (x < -24 && z < -0.5) return 'ESCRITÓRIO OESTE (WEST OFFICE)';
  if (x < -24) return 'BASE VANGUARD / ALA OESTE';
  if (x > 22) return 'BASE BLACKTHORN / ALA LESTE';
  if (x >= -15 && x <= -3 && z <= -4) return 'BOMBA A (PÁTIO NORTE)';
  if (x >= 7 && x <= 20 && z >= 2) return 'BOMBA B (CARGA SUDESTE)';
  if (x >= -8 && x <= 8) return 'MEIO / PONTE ROLANTE (MID)';
  if (y > 8) return 'ESTRUTURA / TELHADO (ROOF STEEL)';
  return 'HANGAR INDUSTRIAL (ANGAR)';
}

/**
 * `ray` is a light-shaft card. Drawn as opaque it becomes black shards
 * across the bay and hides the containers behind it.
 */
function turnHangarLightShaft(mesh: THREE.Mesh): void {
  const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const next = list.map((m) => {
    const src = m as THREE.MeshStandardMaterial;
    const basic = new THREE.MeshBasicMaterial({
      map: src.map ?? null,
      color: 0xffeacc,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
    if (basic.map) {
      basic.map.colorSpace = THREE.SRGBColorSpace;
      basic.map.needsUpdate = true;
    }
    src.map = null;
    src.dispose();
    return basic;
  });
  mesh.material = Array.isArray(mesh.material) ? next : next[0];
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.ignoreCollider = true;
  mesh.userData.isEnvironment = true;
}

/**
 * Floor and roof albedos in the source file are solid black, so the bay
 * reads as an empty void. Drop that map and keep the normal.
 */
function restoreHangarMaterial(
  std: THREE.MeshStandardMaterial,
  isSoftwareGl: boolean
): void {
  if (!std) return;
  const matName = (std.name || '').toLowerCase();
  if (matName === 'floor' || matName === 'room_ceiling') {
    // Source albedos are solid #000000 black; drop black albedo + metallic maps so ceiling/floor never turn black.
    if (std.map) {
      std.map.dispose();
      std.map = null;
    }
    if (std.metalnessMap) {
      std.metalnessMap.dispose();
      std.metalnessMap = null;
    }
    if (std.roughnessMap) {
      std.roughnessMap.dispose();
      std.roughnessMap = null;
    }
    std.color.setHex(matName === 'floor' ? 0xc2bab0 : 0xb6bec6);
    std.roughness = matName === 'floor' ? 0.84 : 0.78;
    std.metalness = matName === 'floor' ? 0.05 : 0.12;
    std.envMapIntensity = matName === 'floor' ? 0.35 : 0.78;
  } else {
    if (matName === 'window') {
      std.color.setHex(0xdbeafe);
      std.emissive.setHex(0x6ba3d6);
      std.emissiveIntensity = 0.65;
    } else if (matName === 'steel') {
      std.color.setHex(0xd6dce2);
    }
    if (std.map) {
      std.map.colorSpace = THREE.SRGBColorSpace;
      std.map.anisotropy = isSoftwareGl ? 1 : 8;
      std.map.needsUpdate = true;
    }
    std.roughness = Math.max(0.5, std.roughness ?? 0.68);
    std.metalness = matName === 'steel' ? 0.25 : Math.min(0.35, std.metalness ?? 0.08);
    std.envMapIntensity = 0.9;
  }
  if (std.normalMap) {
    std.normalMap.anisotropy = isSoftwareGl ? 1 : 8;
    std.normalMap.needsUpdate = true;
  }
  // Unity planes often wind downward. FrontSide then hides the floor/roof from inside.
  std.side = THREE.DoubleSide;
}

export function buildHangarLevel(
  isSoftwareGl: boolean
): Dust2LevelBundle {
  const levelGroup = new THREE.Group();
  levelGroup.name = 'HangarLevelRoot';

  const shootableMeshes: THREE.Mesh[] = [];
  const targets: TacticalTargetEntity[] = [];
  const collider = new Dust2TriangleCollider();

  // Concrete bounce, not a navy void. The scene sun still supplies the direction.
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x8a8176, 0.9);
  levelGroup.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1e0, 1.2);
  sun.position.set(6, 28, -24);
  sun.target.position.set(0, 3, 8);
  sun.castShadow = false;
  levelGroup.add(sun);
  levelGroup.add(sun.target);

  // Overhead bay fills to bring out PBR metallic & normal detail without shadow overhead.
  const bayFillCoords: Array<[number, number, number]> = [
    [-22, 11, 2],
    [0, 12, 0],
    [22, 11, 0],
  ];
  for (let i = 0; i < bayFillCoords.length; i++) {
    const [lx, ly, lz] = bayFillCoords[i];
    const fill = new THREE.PointLight(0xfff1dc, 12, 34, 1.4);
    fill.position.set(lx, ly, lz);
    fill.castShadow = false;
    levelGroup.add(fill);
  }

  addHangarBombSiteBeacon(levelGroup, HANGAR_BOMB_SITE_A, 'A', 0xdc2626);
  addHangarBombSiteBeacon(levelGroup, HANGAR_BOMB_SITE_B, 'B', 0x0284c7);
  spawnHangarSquads(levelGroup, targets, shootableMeshes, isSoftwareGl);

  return {
    levelGroup,
    colliders: [],
    targets,
    shootableMeshes,
    wallStandPositions: [
      HANGAR_ATTACKER_SPAWN.clone(),
      HANGAR_DEFENDER_SPAWN.clone(),
    ],
    collider,
    mapGeometryGroup: null,
    isLoaded: false,
  };
}

export async function loadHangarMapGeometry(
  bundle: Dust2LevelBundle,
  isSoftwareGl: boolean,
  loadingManager: THREE.LoadingManager,
  onByteProgress?: (ratio0to1: number) => void
): Promise<void> {
  await runExclusiveGlbLoad(bundle, async () => {
  disposeHangarMapGeometry(bundle);

  await ensureMeshoptDecoder();
  const gltfLoader = createGameGltfLoader(loadingManager);

  try {
    const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
      gltfLoader.load(
        HANGAR_LOCAL_URL,
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
    modelRoot.name = 'HangarGLB';

    const mapTransformGroup = new THREE.Group();
    mapTransformGroup.name = 'HangarNormalizedGeometry';
    // Meter-scale hangar; lift floor thickness to playable y≈0.
    mapTransformGroup.position.set(0, HANGAR_FLOOR_Y_LIFT, 0);
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
      if (
        mats.some(
          (m) =>
            child.name.toLowerCase() === 'ray' ||
            (m?.name || '').toLowerCase() === 'ray'
        )
      ) {
        turnHangarLightShaft(child);
        return;
      }
      mats.forEach((m) => {
        restoreHangarMaterial(m as THREE.MeshStandardMaterial, isSoftwareGl);
      });
    });

    assembleHangarArena(modelRoot, mapTransformGroup, isSoftwareGl);

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

/**
 * The source GLB exports all modular props (containers, truck, crates, barrels)
 * stacked on top of each other at (0,0,0). Clone & arrange them into a balanced
 * 3-lane 75m x 29m arena while hiding and de-colliding the original pile.
 */
function assembleHangarArena(
  modelRoot: THREE.Group,
  mapTransformGroup: THREE.Group,
  isSoftwareGl: boolean
): void {
  const c1 = modelRoot.getObjectByName('container_1');
  const c2 = modelRoot.getObjectByName('container_2');
  const c3 = modelRoot.getObjectByName('container_3');
  const truck = modelRoot.getObjectByName('truck');
  const boxMetal = modelRoot.getObjectByName('box_metal');
  const boxWood = modelRoot.getObjectByName('box_wooden');
  const barrel = modelRoot.getObjectByName('barrel');
  const boards = modelRoot.getObjectByName('boards');
  const boardsLong = modelRoot.getObjectByName('boards_1');

  const arenaGroup = new THREE.Group();
  arenaGroup.name = 'AssembledHangarArena';

  const placePrefab = (
    prefab: THREE.Object3D | undefined,
    x: number,
    y: number,
    z: number,
    rotY = 0
  ) => {
    if (!prefab) return;
    const clone = prefab.clone(true);
    clone.position.set(x, y, z);
    clone.rotation.set(0, rotY, 0);
    clone.visible = true;
    clone.traverse((obj) => {
      obj.visible = true;
      if (obj instanceof THREE.Mesh) {
        obj.userData.ignoreCollider = false;
        obj.userData.isEnvironment = true;
        obj.castShadow = false;
        obj.receiveShadow = !isSoftwareGl;
        obj.frustumCulled = false;
      }
    });
    arenaGroup.add(clone);
  };

  /**
   * Builds a smooth ~27° walkable wooden ramp from floor (y=0) up to container roof (y=2.59m).
   * Using boards_1 (2.86m x 0.43m at scale 100) scaled to ~5.72m x 1.12m keeps cos(26.9°)=0.89 >= 0.72
   * so Dust2TriangleCollider treats it purely as a walkable floor with zero wall collision.
   */
  const placeWalkableRamp = (
    cx: number,
    cz: number,
    yawTowardTop: number
  ) => {
    const src = boardsLong || boards;
    if (!src) return;
    const pivot = new THREE.Group();
    pivot.position.set(cx, 1.29, cz);
    pivot.rotation.set(0, yawTowardTop, 0);

    const rampMesh = src.clone(true);
    rampMesh.position.set(0, 0, 0);
    rampMesh.rotation.set(-0.47, 0, 0);
    rampMesh.scale.set(
      src.scale.x * 2.6,
      src.scale.y * 2.2,
      src.scale.z * (boardsLong ? 2.0 : 2.82)
    );
    rampMesh.visible = true;
    rampMesh.traverse((obj) => {
      obj.visible = true;
      if (obj instanceof THREE.Mesh) {
        obj.userData.ignoreCollider = false;
        obj.userData.isEnvironment = true;
        obj.castShadow = false;
        obj.receiveShadow = !isSoftwareGl;
        obj.frustumCulled = false;
      }
    });
    pivot.add(rampMesh);
    arenaGroup.add(pivot);
  };

  // 1) West Defense Shield (Vanguard side) — 2-story container + walkable wooden ramp
  placePrefab(c1, -20.0, 0, 4.8, Math.PI / 2);
  placePrefab(c3, -20.0, 2.58, 1.6, Math.PI / 2);
  placePrefab(boxMetal, -20.0, 2.58, 7.6, 0.08);
  placeWalkableRamp(-23.7, 4.5, Math.PI / 2);
  placePrefab(truck, -29.0, 0.67, 9.2, Math.PI / 2);
  // Outside West Office East Doorway (-25.2, -12.7)
  placePrefab(boxMetal, -21.5, 0, -10.5, 0);
  placePrefab(boxWood, -21.5, 0, -9.4, 0.12);
  placePrefab(boxWood, -21.5, 1.0, -10.0, -0.08);
  placePrefab(barrel, -20.2, 0, -10.6, 0);

  // 2) Bomb Site A (North Container Yard around (-9, -9)) — stacked upper red container
  placePrefab(c2, -13.5, 0, -6.2, 0);
  placePrefab(c3, -14.8, 2.58, -6.2, 0);
  placePrefab(boxWood, -11.2, 2.58, -6.2, 0.15);
  placePrefab(c3, -5.2, 0, -9.8, Math.PI / 2);
  placePrefab(boxMetal, -11.2, 0, -11.4, 0);
  placePrefab(boxWood, -10.1, 0, -11.4, 0.05);
  placePrefab(boxWood, -10.65, 1.0, -11.4, -0.1);
  placePrefab(barrel, -8.0, 0, -6.2, 0);

  // 3) Mid Crane Chokepoint
  placePrefab(c2, -1.0, 0, -0.5, 0.35);
  placePrefab(boxMetal, -1.2, 2.58, -0.6, 0.35);
  // North Mid cover
  placePrefab(boxMetal, 5.5, 0, -6.5, 0.15);
  placePrefab(boxWood, 5.5, 1.0, -6.5, -0.1);
  placePrefab(barrel, 6.6, 0, -6.3, 0);
  // South Mid cover
  placePrefab(boxWood, -6.5, 0, 7.2, 0);
  placePrefab(boxMetal, -5.4, 0, 7.2, -0.12);
  placePrefab(barrel, -4.4, 0, 7.4, 0);
  placePrefab(boards, -6.0, 0.02, 5.8, 0.25);

  // 4) Bomb Site B (South-East Cargo Bay around (12.5, 7.5)) — elevated green open container + East ramp
  placePrefab(c1, 14.0, 0, -5.5, 0);
  placePrefab(c2, 13.5, 2.58, -5.5, Math.PI / 2);
  placeWalkableRamp(22.7, -5.5, -Math.PI / 2);
  placePrefab(c2, 9.5, 0, 4.0, Math.PI / 2);
  placePrefab(boxWood, 9.5, 2.58, 2.8, 0);
  placePrefab(boxMetal, 9.5, 2.58, 4.9, 0.12);
  placePrefab(c3, 17.5, 0, 9.8, 0);
  placePrefab(boxMetal, 13.5, 0, 3.6, 0);
  placePrefab(boxWood, 14.6, 0, 3.6, 0.1);
  placePrefab(boxWood, 14.05, 1.0, 3.6, -0.05);
  placePrefab(barrel, 11.2, 0, 11.2, 0);
  placePrefab(barrel, 12.3, 0, 11.4, 0);

  // 5) East Bay (Blackthorn Spawn & Cover)
  placePrefab(truck, 24.5, 0.67, 1.5, 0);
  placePrefab(c3, 26.0, 0, -9.2, Math.PI / 4);
  placePrefab(boxMetal, 24.0, 0, 10.0, 0);
  placePrefab(boxWood, 25.1, 0, 10.0, -0.08);
  placePrefab(boxWood, 24.55, 1.0, 10.0, 0.12);
  placePrefab(barrel, 23.0, 0, 10.3, 0);

  // Hide & de-collide original stacked prefabs at origin
  const origNames = [
    'container_1',
    'container_2',
    'container_3',
    'truck',
    'box_metal',
    'box_wooden',
    'barrel',
    'boards',
    'boards_1',
  ];
  for (let i = 0; i < origNames.length; i++) {
    const orig = modelRoot.getObjectByName(origNames[i]);
    if (!orig) continue;
    orig.visible = false;
    orig.traverse((obj) => {
      obj.visible = false;
      obj.userData.ignoreCollider = true;
    });
  }

  mapTransformGroup.add(arenaGroup);
}

export function disposeHangarMapGeometry(bundle: Dust2LevelBundle): void {
  if (bundle.mapGeometryGroup) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();

    bundle.mapGeometryGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) geometries.add(child.geometry);
        const mats = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        mats.forEach((m) => {
          materials.add(m);
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) textures.add(std.map);
          if (std.normalMap) textures.add(std.normalMap);
        });
      }
    });

    geometries.forEach((g) => g.dispose());
    textures.forEach((t) => t.dispose());
    materials.forEach((m) => m.dispose());

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

function addHangarBombSiteBeacon(
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

function spawnHangarSquads(
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

  // Blackthorn — East bay & defending Bomb Sites A / B / Mid
  spawnBot({
    id: 'hng_bt_siteB',
    callsign: 'KRAKEN-BT',
    weaponId: 'AK47_RIFLE',
    x: 15.0,
    y: 0.6,
    z: 7.2,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 3.0,
    hasArmor: true,
  });
  spawnBot({
    id: 'hng_bt_back',
    callsign: 'WRAITH-BT',
    weaponId: 'SNIPER_BOLT',
    x: 31.0,
    y: 0.6,
    z: -4.0,
    isAlly: false,
    patrolAxis: 'Z',
    patrolRange: 2.5,
    hasArmor: true,
  });
  spawnBot({
    id: 'hng_bt_siteA',
    callsign: 'HAVOC-BT',
    weaponId: 'AK47_RIFLE',
    x: -11.0,
    y: 0.6,
    z: -9.2,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 2.8,
    hasArmor: true,
  });
  spawnBot({
    id: 'hng_bt_mid',
    callsign: 'SERAPH-BT',
    weaponId: 'M4_CARBINE',
    x: 2.0,
    y: 0.6,
    z: 4.0,
    isAlly: false,
    patrolAxis: 'Z',
    patrolRange: 3.0,
    hasArmor: true,
  });
  spawnBot({
    id: 'hng_bt_crane',
    callsign: 'VOLT-BT',
    weaponId: 'P50_PISTOL',
    x: 29.2,
    y: 0.6,
    z: 4.2,
    isAlly: false,
    patrolAxis: 'X',
    patrolRange: 2.6,
    hasArmor: true,
  });

  // Vanguard allies — West bay with player
  spawnBot({
    id: 'hng_vg_1',
    callsign: 'RECON-02',
    weaponId: 'SNIPER_BOLT',
    x: -33.5,
    y: 0.6,
    z: 2.2,
    isAlly: true,
    patrolAxis: 'X',
    patrolRange: 2.2,
    hasArmor: true,
  });
  spawnBot({
    id: 'hng_vg_2',
    callsign: 'STRIKER-03',
    weaponId: 'AK47_RIFLE',
    x: -30.0,
    y: 0.6,
    z: 2.4,
    isAlly: true,
    patrolAxis: 'Z',
    patrolRange: 2.4,
    hasArmor: true,
  });
  spawnBot({
    id: 'hng_vg_3',
    callsign: 'LIFELINE-04',
    weaponId: 'M4_CARBINE',
    x: -28.5,
    y: 0.6,
    z: 5.4,
    isAlly: true,
    patrolAxis: 'X',
    patrolRange: 2.2,
  });
  spawnBot({
    id: 'hng_vg_4',
    callsign: 'WARDEN-05',
    weaponId: 'SMG_MP5',
    x: -34.2,
    y: 0.6,
    z: 6.2,
    isAlly: true,
    patrolAxis: 'Z',
    patrolRange: 2.2,
  });
}
