import * as THREE from 'three';
import { WeaponId } from '../types/game';
import { resolveAssetUrl } from '../utils/assetUrl';
import { Dust2TriangleCollider } from './dust2Collider';
import { createGameGltfLoader } from './gltfLoaderFactory';

/**
 * Modo lógico avaliado pela X-Ray Bullet Cam.
 * REGRA CRÍTICA: ativa EXCLUSIVAMENTE em `PRIVATE_BOTS`.
 * Em partidas PvP online, ranqueadas ou campeonatos de clãs permanece 100% desativada.
 */
export type BulletCamGameMode =
  | 'PRIVATE_BOTS'
  | 'ONLINE_PVP'
  | 'RANKED'
  | 'CHAMPIONSHIP'
  | 'TRAINING';

export type BulletCamPhase = 'IDLE' | 'FLIGHT' | 'IMPACT_HOLD' | 'RETURNING';

export type BulletCamHitZone = 'HEAD' | 'TORSO_A' | 'ARMOR';

export interface XRayBulletCamTriggerParams {
  gameMode: BulletCamGameMode;
  weaponId: WeaponId;
  isPredictedKill: boolean;
  isHeadshot: boolean;
  hitZone: BulletCamHitZone;
  isRemoteHumanTarget: boolean;
  distanceMeters: number;
  startPos: THREE.Vector3;
  impactPos: THREE.Vector3;
  impactNormal: THREE.Vector3;
  targetRoot?: THREE.Object3D | null;
  targetHeightMeters?: number;
  yawObject: THREE.Object3D;
  pitchObject: THREE.Object3D;
  baseFov: number;
  onImpact: () => void;
  onComplete?: () => void;
}

export interface BulletCamHudSnapshot {
  active: boolean;
  phase: BulletCamPhase;
  timeScale: number;
  vignetteAlpha: number;
  distanceMeters: number;
  isHeadshot: boolean;
  xrayActive: boolean;
}

export interface XRayBulletCamConfig {
  /** Distância mínima (m) para ativar a Bullet Cam em abates letais. */
  minDistanceMeters: number;
  /** Distância do alvo (m) em que o modo Raio-X é ativado revelando o esqueleto. */
  xrayRevealDistanceMeters: number;
  /** Escala global de tempo durante voo e impacto (0.2 = 20% da velocidade). */
  slowMoTimeScale: number;
  /** Tempo real (s) focado na reação de queda do bot após o impacto. */
  impactHoldSec: number;
  /** Tempo real (s) de retorno suave à câmera 1P. */
  returnDurationSec: number;
  /** Janela inicial (s) antes de aceitar Skip para evitar cancelar com o clique do tiro. */
  skipGraceSec: number;
  /** Altura padrão dos bots do KINETIC em metros (usada no auto-scale do skeleton.glb). */
  defaultBotHeightMeters: number;
}

const DEFAULT_CONFIG: XRayBulletCamConfig = {
  minDistanceMeters: 20,
  xrayRevealDistanceMeters: 1.2,
  slowMoTimeScale: 0.2,
  impactHoldSec: 0.6,
  returnDurationSec: 0.24,
  skipGraceSec: 0.18,
  defaultBotHeightMeters: 1.78,
};

const SKELETON_GLB_URL = resolveAssetUrl('/models/characters/skeleton.glb');
const BONE_SHARD_POOL_SIZE = 10;
const BLOOD_PARTICLE_POOL_SIZE = 25;

// Cores do rastro da bala (entrada branco/ciano -> saída vermelho escuro)
const TRACER_OUTER_ENTRY_COLOR = new THREE.Color(0xe0f2fe);
const TRACER_INNER_ENTRY_COLOR = new THREE.Color(0x67e8f9);
const TRACER_SHOCK_ENTRY_COLOR = new THREE.Color(0xffffff);
const TRACER_OUTER_EXIT_COLOR = new THREE.Color(0x7f1d1d);
const TRACER_INNER_EXIT_COLOR = new THREE.Color(0xdc2626);
const TRACER_SHOCK_EXIT_COLOR = new THREE.Color(0x991b1b);

// Cores emissivas de impacto no esqueleto
const BONE_BASE_EMISSIVE = new THREE.Color(0x162230);
const BONE_HIT_RED = new THREE.Color(0xff2a1f);
const BONE_HIT_WHITE = new THREE.Color(0xfff1e6);

export function isSniperWeaponId(weaponId: WeaponId): boolean {
  return (
    weaponId === 'SNIPER_BOLT' ||
    weaponId === 'SNIPER_TACTICAL' ||
    weaponId === 'SNIPER_AWP' ||
    weaponId === 'SNIPER_HEAVY'
  );
}

interface PooledParticle {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: THREE.Vector3;
  gravity: number;
  drag: number;
}

interface SavedBotMaterialEntry {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
}

interface SkeletonRegionMesh {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  region: 'HEAD' | 'TORSO' | 'LIMB';
}

// Vetores e matrizes pré-alocados no escopo de módulo (ZERO-GC no loop 60 FPS)
const _worldUp = new THREE.Vector3(0, 1, 0);
const _altUp = new THREE.Vector3(1, 0, 0);
const _flightDir = new THREE.Vector3();
const _flightRight = new THREE.Vector3();
const _flightUp = new THREE.Vector3();
const _bulletPos = new THREE.Vector3();
const _exitPos = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _focusPos = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _tmpBox = new THREE.Box3();
const _tmpSize = new THREE.Vector3();
const _tmpCenter = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _dummyObj = new THREE.Object3D();
const _hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * XRayBulletCamManager
 * ---------------------------------------------------------------------------
 * Sistema cinematográfico completo de "X-Ray Sniper Bullet Cam" (estilo Sniper Elite)
 * otimizado para WebGL / Android Mobile (Capacitor) a 60 FPS estáveis:
 *
 * 1. Exclusivo para `gameMode === 'PRIVATE_BOTS'` (100% bloqueado em PvP/Ranked/Campeonato).
 * 2. Object Pooling de 1 única instância de `skeleton.glb` carregada sob demanda/boot,
 *    com auto-normalização de escala via `THREE.Box3` para casar exatamente com a altura do bot.
 * 3. A 1.2m do impacto, revela o esqueleto por dentro tornando a carcaça do bot
 *    semitransparente escura/azulada (`opacity: 0.22, depthWrite: false`) e acende o osso atingido.
 * 4. Pool de 10 estilhaços de osso (`InstancedMesh`) + pool de 25 partículas de sangue procedural
 *    (`InstancedMesh`) no ponto de entrada e saída nas costas do bot.
 * 5. Rastro da bala muda de branco/ciano (pré-impacto) para vermelho escuro ao sair pelas costas.
 * 6. Zero alocação em `update(rawDt)` + retorno suave de `timeScale` (0.2 -> 1.0) e FOV.
 */
export class XRayBulletCamManager {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly weaponRigRoot: THREE.Object3D;
  private readonly config: XRayBulletCamConfig;

  // -------------------------------------------------------------------------
  // 1. Pool do Projétil 3D + Rastro Supersônico (criado 1x no construtor)
  // -------------------------------------------------------------------------
  private readonly bulletRoot: THREE.Group;
  private readonly projectileSpinGroup: THREE.Group;
  private readonly trailGroup: THREE.Group;
  private readonly outerTrailMesh: THREE.Mesh;
  private readonly innerTrailMesh: THREE.Mesh;
  private readonly shockCollarMesh: THREE.Mesh;
  private readonly outerTrailMat: THREE.MeshBasicMaterial;
  private readonly innerTrailMat: THREE.MeshBasicMaterial;
  private readonly shockCollarMat: THREE.MeshBasicMaterial;

  // -------------------------------------------------------------------------
  // 2. Pool ÚNICO do Esqueleto Raio-X (`skeleton.glb`) + Material X-Ray do Bot
  // -------------------------------------------------------------------------
  private readonly skeletonRoot: THREE.Group;
  private skeletonModel: THREE.Object3D | null = null;
  private skeletonLoading = false;
  private skeletonLoaded = false;
  private skeletonRegionMeshes: SkeletonRegionMesh[] = [];
  private readonly xrayBotShellMaterial: THREE.MeshStandardMaterial;
  private readonly savedBotMaterials: SavedBotMaterialEntry[] = [];
  private xrayApplied = false;
  private xrayImpactGlow = 0;

  // -------------------------------------------------------------------------
  // 3. Pools Procedurais de Estilhaços de Osso (10) e Sangue (25)
  // -------------------------------------------------------------------------
  private readonly boneShardMesh: THREE.InstancedMesh;
  private readonly boneShards: PooledParticle[] = [];
  private readonly bloodMesh: THREE.InstancedMesh;
  private readonly bloodParticles: PooledParticle[] = [];
  private particlesActiveCount = 0;

  private readonly pooledGeometries: THREE.BufferGeometry[] = [];
  private readonly pooledMaterials: THREE.Material[] = [];

  // -------------------------------------------------------------------------
  // 4. Máquina de Estados & Snapshots Pré-Alocados (Zero-GC)
  // -------------------------------------------------------------------------
  private phase: BulletCamPhase = 'IDLE';
  private phaseElapsed = 0;
  private totalElapsed = 0;
  private flightDuration = 0.95;
  private timeScale = 1.0;
  private vignetteAlpha = 0;
  private sideSign: -1 | 1 = 1;
  private activeDistanceMeters = 0;
  private activeIsHeadshot = false;
  private activeHitZone: BulletCamHitZone = 'TORSO_A';
  private activeBotHeight = DEFAULT_CONFIG.defaultBotHeightMeters;
  private impactTriggered = false;
  private exitBulletElapsed = 0;
  private impactShake = 0;

  private activeYawObject: THREE.Object3D | null = null;
  private activePitchObject: THREE.Object3D | null = null;
  private activeTargetRoot: THREE.Object3D | null = null;
  private onImpactCallback: (() => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;

  private readonly startPos = new THREE.Vector3();
  private readonly impactPos = new THREE.Vector3();
  private readonly impactNormal = new THREE.Vector3();
  private readonly currentCamPos = new THREE.Vector3();
  private readonly returnStartCamPos = new THREE.Vector3();
  private readonly savedYawPos = new THREE.Vector3();
  private savedYaw = 0;
  private savedPitch = 0;
  private savedCamRoll = 0;
  private savedBaseFov = 72;
  private savedWeaponRigVisible = true;
  private returnStartYaw = 0;
  private returnStartPitch = 0;
  private returnStartRoll = 0;
  private returnStartFov = 72;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    weaponRigRoot: THREE.Object3D,
    config?: Partial<XRayBulletCamConfig>
  ) {
    this.scene = scene;
    this.camera = camera;
    this.weaponRigRoot = weaponRigRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // =======================================================================
    // A. Rig 3D em Pool do Projétil .338 Lapua + Rastro Supersônico
    // =======================================================================
    this.bulletRoot = new THREE.Group();
    this.bulletRoot.name = 'PooledXRayBulletRig';
    this.bulletRoot.visible = false;

    this.projectileSpinGroup = new THREE.Group();
    this.bulletRoot.add(this.projectileSpinGroup);

    // Ogiva FMJ de cobre (LatheGeometry leve de 14 segmentos)
    const ogiveProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.0004, 0.145),
      new THREE.Vector2(0.0095, 0.105),
      new THREE.Vector2(0.0175, 0.055),
      new THREE.Vector2(0.0205, 0.005),
      new THREE.Vector2(0.0205, -0.068),
      new THREE.Vector2(0.0165, -0.095),
      new THREE.Vector2(0.0005, -0.095),
    ];
    const bulletGeo = new THREE.LatheGeometry(ogiveProfile, 14);
    bulletGeo.rotateX(Math.PI / 2);
    this.pooledGeometries.push(bulletGeo);

    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xd98a4a,
      metalness: 0.9,
      roughness: 0.24,
      emissive: 0x3a1806,
      emissiveIntensity: 0.35,
    });
    this.pooledMaterials.push(copperMat);

    const bulletMesh = new THREE.Mesh(bulletGeo, copperMat);
    bulletMesh.frustumCulled = false;
    this.projectileSpinGroup.add(bulletMesh);

    // Anel cannelure + 3 ranhuras longitudinais para evidenciar o giro em Z
    const cannelureGeo = new THREE.CylinderGeometry(0.0214, 0.0214, 0.012, 12, 1, true);
    cannelureGeo.rotateX(Math.PI / 2);
    this.pooledGeometries.push(cannelureGeo);

    const cannelureMat = new THREE.MeshStandardMaterial({
      color: 0x2c1b10,
      metalness: 0.72,
      roughness: 0.45,
    });
    this.pooledMaterials.push(cannelureMat);

    const cannelureMesh = new THREE.Mesh(cannelureGeo, cannelureMat);
    cannelureMesh.position.z = -0.032;
    cannelureMesh.frustumCulled = false;
    this.projectileSpinGroup.add(cannelureMesh);

    const riflingGeo = new THREE.BoxGeometry(0.0032, 0.0032, 0.072);
    this.pooledGeometries.push(riflingGeo);
    const riflingMat = new THREE.MeshStandardMaterial({
      color: 0xffd2a6,
      metalness: 0.95,
      roughness: 0.16,
      emissive: 0x6b320d,
      emissiveIntensity: 0.45,
    });
    this.pooledMaterials.push(riflingMat);

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const stripe = new THREE.Mesh(riflingGeo, riflingMat);
      stripe.position.set(
        Math.cos(angle) * 0.0202,
        Math.sin(angle) * 0.0202,
        -0.025
      );
      stripe.rotation.z = angle;
      stripe.frustumCulled = false;
      this.projectileSpinGroup.add(stripe);
    }

    // Base traçante incandescente
    const tracerBaseGeo = new THREE.CircleGeometry(0.016, 12);
    tracerBaseGeo.rotateY(Math.PI);
    this.pooledGeometries.push(tracerBaseGeo);

    const tracerBaseMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(tracerBaseMat);

    const tracerBaseMesh = new THREE.Mesh(tracerBaseGeo, tracerBaseMat);
    tracerBaseMesh.position.z = -0.097;
    tracerBaseMesh.frustumCulled = false;
    this.projectileSpinGroup.add(tracerBaseMesh);

    // Rastro supersônico (branco/ciano antes de entrar -> vermelho escuro ao sair pelas costas)
    this.trailGroup = new THREE.Group();
    this.bulletRoot.add(this.trailGroup);

    const outerTrailGeo = new THREE.CylinderGeometry(0.004, 0.095, 1.0, 12, 1, true);
    outerTrailGeo.rotateX(Math.PI / 2);
    outerTrailGeo.translate(0, 0, -0.5);
    this.pooledGeometries.push(outerTrailGeo);

    this.outerTrailMat = new THREE.MeshBasicMaterial({
      color: TRACER_OUTER_ENTRY_COLOR.getHex(),
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.outerTrailMat);

    this.outerTrailMesh = new THREE.Mesh(outerTrailGeo, this.outerTrailMat);
    this.outerTrailMesh.position.z = -0.08;
    this.outerTrailMesh.frustumCulled = false;
    this.trailGroup.add(this.outerTrailMesh);

    const innerTrailGeo = new THREE.CylinderGeometry(0.002, 0.024, 1.0, 8, 1, true);
    innerTrailGeo.rotateX(Math.PI / 2);
    innerTrailGeo.translate(0, 0, -0.5);
    this.pooledGeometries.push(innerTrailGeo);

    this.innerTrailMat = new THREE.MeshBasicMaterial({
      color: TRACER_INNER_ENTRY_COLOR.getHex(),
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.innerTrailMat);

    this.innerTrailMesh = new THREE.Mesh(innerTrailGeo, this.innerTrailMat);
    this.innerTrailMesh.position.z = -0.09;
    this.innerTrailMesh.frustumCulled = false;
    this.trailGroup.add(this.innerTrailMesh);

    const shockCollarGeo = new THREE.ConeGeometry(0.068, 0.26, 14, 1, true);
    shockCollarGeo.rotateX(Math.PI / 2);
    this.pooledGeometries.push(shockCollarGeo);

    this.shockCollarMat = new THREE.MeshBasicMaterial({
      color: TRACER_SHOCK_ENTRY_COLOR.getHex(),
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.shockCollarMat);

    this.shockCollarMesh = new THREE.Mesh(shockCollarGeo, this.shockCollarMat);
    this.shockCollarMesh.position.z = -0.01;
    this.shockCollarMesh.frustumCulled = false;
    this.trailGroup.add(this.shockCollarMesh);

    this.scene.add(this.bulletRoot);

    // =======================================================================
    // B. Container ÚNICO do Esqueleto Raio-X + Material Semitransparente do Bot
    // =======================================================================
    this.skeletonRoot = new THREE.Group();
    this.skeletonRoot.name = 'PooledXRaySkeletonRoot';
    this.skeletonRoot.visible = false;
    this.scene.add(this.skeletonRoot);

    this.xrayBotShellMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b1d36,
      emissive: 0x0c2d52,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.pooledMaterials.push(this.xrayBotShellMaterial);

    // =======================================================================
    // C. Pool de 10 Estilhaços de Osso (InstancedMesh, branco-amarelado irregular)
    // =======================================================================
    const boneShardGeo = new THREE.DodecahedronGeometry(0.024, 0);
    // Deforma vértices uma única vez para perfil angular de lasca de osso
    const bonePosAttr = boneShardGeo.attributes.position;
    for (let i = 0; i < bonePosAttr.count; i++) {
      const vx = bonePosAttr.getX(i);
      const vy = bonePosAttr.getY(i);
      const vz = bonePosAttr.getZ(i);
      const jag = 0.72 + ((i * 37) % 10) * 0.055;
      bonePosAttr.setXYZ(i, vx * 1.45 * jag, vy * 0.58 * jag, vz * 0.85 * jag);
    }
    boneShardGeo.computeVertexNormals();
    this.pooledGeometries.push(boneShardGeo);

    const boneShardMat = new THREE.MeshStandardMaterial({
      color: 0xf4ead2,
      emissive: 0x3b2c1a,
      emissiveIntensity: 0.28,
      roughness: 0.7,
      metalness: 0.06,
    });
    this.pooledMaterials.push(boneShardMat);

    this.boneShardMesh = new THREE.InstancedMesh(
      boneShardGeo,
      boneShardMat,
      BONE_SHARD_POOL_SIZE
    );
    this.boneShardMesh.name = 'PooledXRayBoneShards';
    this.boneShardMesh.frustumCulled = false;
    this.boneShardMesh.visible = false;
    for (let i = 0; i < BONE_SHARD_POOL_SIZE; i++) {
      this.boneShardMesh.setMatrixAt(i, _hiddenMatrix);
      this.boneShards.push({
        active: false,
        age: 0,
        maxAge: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: new THREE.Vector3(1, 1, 1),
        gravity: -3.2,
        drag: 0.65,
      });
    }
    this.boneShardMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.boneShardMesh);

    // =======================================================================
    // D. Pool de 25 Partículas de Sangue Procedural (InstancedMesh vermelho-escuro)
    // =======================================================================
    const bloodGeo = new THREE.IcosahedronGeometry(0.022, 0);
    this.pooledGeometries.push(bloodGeo);

    const bloodMat = new THREE.MeshStandardMaterial({
      color: 0x7a0707,
      emissive: 0x2b0303,
      emissiveIntensity: 0.45,
      roughness: 0.28,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.pooledMaterials.push(bloodMat);

    this.bloodMesh = new THREE.InstancedMesh(
      bloodGeo,
      bloodMat,
      BLOOD_PARTICLE_POOL_SIZE
    );
    this.bloodMesh.name = 'PooledXRayBloodParticles';
    this.bloodMesh.frustumCulled = false;
    this.bloodMesh.visible = false;
    for (let i = 0; i < BLOOD_PARTICLE_POOL_SIZE; i++) {
      this.bloodMesh.setMatrixAt(i, _hiddenMatrix);
      this.bloodParticles.push({
        active: false,
        age: 0,
        maxAge: 1,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: new THREE.Vector3(1, 1, 1),
        gravity: -4.4,
        drag: 1.5,
      });
    }
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.bloodMesh);

    // Pré-carrega em background a ÚNICA instância do esqueleto (Object Pooling)
    this.preloadSkeleton();
  }

  /**
   * Carrega UMA ÚNICA instância de `skeleton.glb` na memória e normaliza automaticamente
   * sua escala (`skeleton.scale.set(...)`) e pivô via `THREE.Box3` para a altura dos bots (1.78m).
   */
  public preloadSkeleton(): void {
    if (this.skeletonLoaded || this.skeletonLoading) return;
    this.skeletonLoading = true;

    const loader = createGameGltfLoader();
    loader.load(
      SKELETON_GLB_URL,
      (gltf) => {
        this.skeletonLoading = false;
        this.skeletonLoaded = true;

        const model = gltf.scene;
        model.name = 'LowPolySkeletonPooledModel';

        // 1. Mede o bounding box bruto do GLB (ex.: ~15.3m de altura e deslocado em X)
        model.updateMatrixWorld(true);
        _tmpBox.setFromObject(model);
        _tmpBox.getSize(_tmpSize);
        _tmpBox.getCenter(_tmpCenter);

        // 2. Ajusta escala uniforme automaticamente para casar exatamente com a altura do bot
        const rawHeight = Math.max(0.01, _tmpSize.y);
        const normalizedScale = this.config.defaultBotHeightMeters / rawHeight;
        model.scale.set(normalizedScale, normalizedScale, normalizedScale);

        // 3. Centraliza X/Z em 0 e apoia os pés exatamente no piso (y = 0)
        model.position.set(
          -_tmpCenter.x * normalizedScale,
          -_tmpBox.min.y * normalizedScale,
          -_tmpCenter.z * normalizedScale
        );

        // 4. Prepara materiais dedicados por região anatômica para brilho emissivo no impacto
        this.skeletonRegionMeshes.length = 0;
        model.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.castShadow = false;
          node.receiveShadow = false;
          node.frustumCulled = false;

          const nameLower = `${node.name || ''} ${node.parent?.name || ''}`.toLowerCase();
          let region: 'HEAD' | 'TORSO' | 'LIMB' = 'LIMB';
          if (
            nameLower.includes('skull') ||
            nameLower.includes('teeth') ||
            nameLower.includes('head') ||
            nameLower.includes('jaw')
          ) {
            region = 'HEAD';
          } else if (
            nameLower.includes('rib') ||
            nameLower.includes('spine') ||
            nameLower.includes('clavicle') ||
            nameLower.includes('shoulder') ||
            nameLower.includes('ilium') ||
            nameLower.includes('pelvis')
          ) {
            region = 'TORSO';
          }

          const boneMat = new THREE.MeshStandardMaterial({
            color: 0xebe3cf,
            emissive: BONE_BASE_EMISSIVE.clone(),
            emissiveIntensity: 0.45,
            roughness: 0.52,
            metalness: 0.08,
          });
          // Descarta material original do GLB que será substituído
          if (Array.isArray(node.material)) {
            node.material.forEach((m) => m.dispose());
          } else if (node.material) {
            node.material.dispose();
          }
          node.material = boneMat;
          this.pooledMaterials.push(boneMat);
          this.skeletonRegionMeshes.push({ mesh: node, material: boneMat, region });
        });

        this.skeletonModel = model;
        this.skeletonRoot.add(model);
        this.skeletonRoot.visible = false;
      },
      undefined,
      () => {
        this.skeletonLoading = false;
      }
    );
  }

  /**
   * Wrapper simplificado compatível com `triggerBulletCam(bulletOrigin, hitPoint, targetBot)`.
   */
  public triggerBulletCam(
    bulletOrigin: THREE.Vector3,
    hitPoint: THREE.Vector3,
    targetBot: THREE.Object3D,
    options: Omit<XRayBulletCamTriggerParams, 'startPos' | 'impactPos' | 'targetRoot'>
  ): boolean {
    return this.tryTriggerBulletCam({
      ...options,
      startPos: bulletOrigin,
      impactPos: hitPoint,
      targetRoot: targetBot,
    });
  }

  /**
   * Valida regras críticas e inicia a X-Ray Sniper Bullet Cam se elegível.
   * Retorna `true` quando a câmera assume controle (o dano real roda no callback `onImpact`).
   */
  public tryTriggerBulletCam(params: XRayBulletCamTriggerParams): boolean {
    // 1. REGRA CRÍTICA: ativa EXCLUSIVAMENTE em PRIVATE_BOTS
    if (params.gameMode !== 'PRIVATE_BOTS') {
      return false;
    }

    // 2. Jamais ativa contra jogadores humanos remotos ou durante outra Bullet Cam ativa
    if (params.isRemoteHumanTarget || this.phase !== 'IDLE') {
      return false;
    }

    // 3. Apenas categoria SNIPER
    if (!isSniperWeaponId(params.weaponId)) {
      return false;
    }

    // 4. Apenas disparos confirmados como abate fatal (Kill)
    if (!params.isPredictedKill) {
      return false;
    }

    // 5. Distância mínima de 20 metros
    if (params.distanceMeters < this.config.minDistanceMeters) {
      return false;
    }

    // Garante pré-carregamento do esqueleto caso ainda não tenha finalizado
    if (!this.skeletonLoaded && !this.skeletonLoading) {
      this.preloadSkeleton();
    }

    // -----------------------------------------------------------------------
    // Inicializa sequência cinematográfica (Zero-GC)
    // -----------------------------------------------------------------------
    this.activeYawObject = params.yawObject;
    this.activePitchObject = params.pitchObject;
    this.activeTargetRoot = params.targetRoot || null;
    this.onImpactCallback = params.onImpact;
    this.onCompleteCallback = params.onComplete || null;

    // Salva pose original da câmera 1P
    this.savedYawPos.copy(params.yawObject.position);
    this.savedYaw = params.yawObject.rotation.y;
    this.savedPitch = params.pitchObject.rotation.x;
    this.savedCamRoll = this.camera.rotation.z;
    this.savedBaseFov = params.baseFov;
    this.savedWeaponRigVisible = this.weaponRigRoot.visible;

    this.startPos.copy(params.startPos);
    this.impactPos.copy(params.impactPos);
    this.impactNormal.copy(params.impactNormal).normalize();

    this.activeDistanceMeters = params.distanceMeters;
    this.activeIsHeadshot = params.isHeadshot;
    this.activeHitZone = params.hitZone;
    this.activeBotHeight =
      params.targetHeightMeters && params.targetHeightMeters > 0.5
        ? params.targetHeightMeters
        : this.config.defaultBotHeightMeters;

    this.impactTriggered = false;
    this.xrayApplied = false;
    this.xrayImpactGlow = 0;
    this.exitBulletElapsed = 0;
    this.impactShake = 0;
    this.sideSign = this.sideSign === 1 ? -1 : 1;

    // Duração do voo proporcional à distância (0.82s a 1.38s em tempo real)
    this.flightDuration = THREE.MathUtils.clamp(
      0.8 + (params.distanceMeters - 20) * 0.013,
      0.82,
      1.38
    );

    this.phase = 'FLIGHT';
    this.phaseElapsed = 0;
    this.totalElapsed = 0;
    this.timeScale = this.config.slowMoTimeScale;
    this.vignetteAlpha = 0.25;

    // Oculta arma 1P durante o voo
    this.weaponRigRoot.visible = false;

    // Configura cores iniciais do rastro da bala: BRANCO / CIANO antes do impacto
    this.setTracerColors(false);

    // Posiciona projétil 3D na boca do cano
    this.bulletRoot.position.copy(this.startPos);
    this.bulletRoot.lookAt(this.impactPos);
    this.projectileSpinGroup.visible = true;
    this.projectileSpinGroup.rotation.z = 0;
    this.trailGroup.visible = true;
    this.outerTrailMesh.scale.set(1, 1, 0.35);
    this.innerTrailMesh.scale.set(1, 1, 0.28);
    this.bulletRoot.visible = true;

    this.currentCamPos.copy(this.savedYawPos);
    return true;
  }

  public isActive(): boolean {
    return this.phase !== 'IDLE';
  }

  public getPhase(): BulletCamPhase {
    return this.phase;
  }

  public getTimeScale(): number {
    return this.timeScale;
  }

  public getHudSnapshot(): BulletCamHudSnapshot {
    return {
      active: this.phase !== 'IDLE',
      phase: this.phase,
      timeScale: this.timeScale,
      vignetteAlpha: this.vignetteAlpha,
      distanceMeters: this.activeDistanceMeters,
      isHeadshot: this.activeIsHeadshot,
      xrayActive: this.xrayApplied,
    };
  }

  /**
   * Cancela a Bullet Cam imediatamente (toque na tela / tecla / pause).
   * Executa `onImpact` caso ainda não tenha ocorrido para nunca perder o abate.
   */
  public skip(force = false): boolean {
    if (this.phase === 'IDLE') return false;
    if (!force && this.totalElapsed < this.config.skipGraceSec) {
      return false;
    }

    if (!this.impactTriggered && this.onImpactCallback) {
      this.impactTriggered = true;
      const impactCb = this.onImpactCallback;
      this.onImpactCallback = null;
      impactCb();
    }

    this.finishAndRestoreCamera();
    return true;
  }

  /**
   * Reset seguro em troca de rodada, morte ou saída para o menu.
   */
  public reset(): void {
    this.clearParticles();
    this.restoreBotXRayState();
    if (this.phase === 'IDLE') {
      this.timeScale = 1.0;
      this.vignetteAlpha = 0;
      this.bulletRoot.visible = false;
      this.skeletonRoot.visible = false;
      return;
    }
    this.onImpactCallback = null;
    this.onCompleteCallback = null;
    this.finishAndRestoreCamera();
  }

  /**
   * Atualiza física da câmera/bala em 60 FPS reais (`rawDt`) e atualiza
   * estilhaços de osso + partículas de sangue acompanhando o `timeScale`.
   */
  public update(
    rawDt: number,
    activeGlbCollider?: Dust2TriangleCollider | null,
    getGroundHeight?: (x: number, y: number, z: number) => number
  ): void {
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    // Atualiza partículas procedurais (estilhaços de osso + sangue) mesmo após retorno se ainda vivas
    if (this.particlesActiveCount > 0) {
      this.updateProceduralParticles(dt * this.timeScale);
    }

    if (this.phase === 'IDLE' || !this.activeYawObject || !this.activePitchObject) {
      return;
    }

    this.phaseElapsed += dt;
    this.totalElapsed += dt;

    // Base ortonormal da trajetória da bala
    _flightDir.subVectors(this.impactPos, this.startPos);
    const totalDist = Math.max(0.01, _flightDir.length());
    _flightDir.multiplyScalar(1 / totalDist);

    const upRef = Math.abs(_flightDir.y) > 0.94 ? _altUp : _worldUp;
    _flightRight.crossVectors(_flightDir, upRef).normalize();
    _flightUp.crossVectors(_flightRight, _flightDir).normalize();

    // Sincroniza posição/rotação/brilho emissivo do esqueleto se o modo Raio-X já estiver ativo
    if (this.xrayApplied) {
      this.updateSkeletonXRayVisuals(dt);
    }

    if (this.phase === 'FLIGHT') {
      const linearT = Math.min(1, this.phaseElapsed / this.flightDuration);
      // Curva cinematográfica com leve compressão temporal perto do alvo para destacar o Raio-X
      const flightT =
        linearT < 0.72
          ? (linearT / 0.72) * 0.8
          : 0.8 + ((linearT - 0.72) / 0.28) * 0.2;

      _bulletPos.lerpVectors(this.startPos, this.impactPos, flightT);
      const dropArc = Math.sin(flightT * Math.PI) * Math.min(0.16, totalDist * 0.0028);
      _bulletPos.y += dropArc;

      const remainingDistToImpact = _bulletPos.distanceTo(this.impactPos);

      // TRANSIÇÃO RAIO-X: ativa exatamente quando a bala chega a <= 1.2m do bot alvo
      if (!this.xrayApplied && remainingDistToImpact <= this.config.xrayRevealDistanceMeters) {
        this.activateBotXRayMode();
      }

      // Atualiza malha da bala + rotação no próprio eixo Z
      this.bulletRoot.position.copy(_bulletPos);
      this.bulletRoot.lookAt(this.impactPos);
      this.projectileSpinGroup.rotation.z += dt * 48.0;

      // Rastro branco/ciano supersônico
      const trailLength = THREE.MathUtils.lerp(0.65, 2.4, Math.sin(flightT * Math.PI * 0.85));
      this.outerTrailMesh.scale.set(1, 1, trailLength);
      this.innerTrailMesh.scale.set(1, 1, trailLength * 0.88);
      this.outerTrailMat.opacity = 0.22 + Math.sin(this.totalElapsed * 26) * 0.04;
      this.innerTrailMat.opacity = 0.38 + Math.cos(this.totalElapsed * 32) * 0.06;
      this.shockCollarMesh.rotation.z -= dt * 18.0;
      this.shockCollarMat.opacity = 0.18 * (1 - linearT * 0.3);

      // Posição lateral/orbital suave da câmera que se fecha no close-up do esqueleto a 1.2m
      const xrayZoomBlend = this.xrayApplied ? 1 : 0;
      const orbitalSweep = Math.sin(linearT * Math.PI * 0.95) * 0.45;
      const backOffset = THREE.MathUtils.lerp(0.95, 1.32, linearT);
      const sideOffset =
        this.sideSign * (0.44 + orbitalSweep + xrayZoomBlend * 0.14);
      const upOffset = THREE.MathUtils.lerp(0.16, 0.24, linearT);

      _desiredCamPos
        .copy(_bulletPos)
        .addScaledVector(_flightDir, -backOffset)
        .addScaledVector(_flightRight, sideOffset)
        .addScaledVector(_flightUp, upOffset);

      this.resolveCameraSafety(
        _bulletPos,
        _desiredCamPos,
        activeGlbCollider,
        getGroundHeight
      );

      const camLambda = linearT < 0.14 ? 14 : 18;
      const camAlpha = 1 - Math.exp(-camLambda * dt);
      this.currentCamPos.lerp(_desiredCamPos, camAlpha);

      const focusBlend = THREE.MathUtils.smoothstep(linearT, 0.52, 0.94);
      _lookTarget.lerpVectors(_bulletPos, this.impactPos, focusBlend);
      _lookTarget.addScaledVector(_flightDir, (1 - focusBlend) * 0.4);

      this.applyCameraTransform(
        this.currentCamPos,
        _lookTarget,
        this.sideSign * (0.048 * (1 - linearT * 0.45))
      );

      // FOV dinâmico: leve abertura de velocidade no trajeto -> close-up telefoto no Raio-X
      const targetFov =
        linearT < 0.25
          ? THREE.MathUtils.lerp(this.savedBaseFov, this.savedBaseFov - 6, linearT / 0.25)
          : linearT < 0.76
            ? THREE.MathUtils.lerp(
                this.savedBaseFov - 6,
                this.savedBaseFov + 10,
                (linearT - 0.25) / 0.51
              )
            : THREE.MathUtils.lerp(
                this.savedBaseFov + 10,
                this.savedBaseFov - 12,
                (linearT - 0.76) / 0.24
              );
      this.setCameraFovSmooth(targetFov, 10, dt);

      this.vignetteAlpha = THREE.MathUtils.damp(this.vignetteAlpha, 1.0, 9.5, dt);
      this.timeScale = this.config.slowMoTimeScale;

      if (linearT >= 1) {
        this.triggerImpactPhase();
      }
      return;
    }

    if (this.phase === 'IMPACT_HOLD') {
      const holdT = Math.min(1, this.phaseElapsed / this.config.impactHoldSec);

      // Bala atravessa o esqueleto e sai pelas costas com RASTRO VERMELHO ESCURO!
      this.exitBulletElapsed += dt;
      if (this.bulletRoot.visible) {
        const exitDuration = 0.26;
        const exitT = Math.min(1, this.exitBulletElapsed / exitDuration);
        const throughDist = 2.6;
        _bulletPos.copy(this.impactPos).addScaledVector(_flightDir, exitT * throughDist);
        this.bulletRoot.position.copy(_bulletPos);
        this.projectileSpinGroup.rotation.z += dt * 42.0;

        // Rastro vermelho escuro alonga na saída pelas costas e dissolve suavemente
        const fade = Math.max(0, 1 - exitT);
        this.outerTrailMesh.scale.set(1.15, 1.15, THREE.MathUtils.lerp(1.4, 2.8, exitT));
        this.innerTrailMesh.scale.set(1.2, 1.2, THREE.MathUtils.lerp(1.2, 2.4, exitT));
        this.outerTrailMat.opacity = 0.42 * fade;
        this.innerTrailMat.opacity = 0.62 * fade;
        this.shockCollarMat.opacity = 0.28 * fade;

        if (exitT >= 1) {
          this.bulletRoot.visible = false;
          this.trailGroup.visible = false;
          this.projectileSpinGroup.visible = false;
        }
      }

      // Foca na reação de impacto + queda do bot em câmera lenta por 0.6s
      if (this.activeTargetRoot) {
        _focusPos.set(
          this.activeTargetRoot.position.x,
          this.activeTargetRoot.position.y +
            THREE.MathUtils.lerp(this.activeIsHeadshot ? 1.5 : 1.16, 0.78, holdT),
          this.activeTargetRoot.position.z
        );
      } else {
        _focusPos.copy(this.impactPos);
        _focusPos.y -= holdT * 0.28;
      }

      const holdBack = THREE.MathUtils.lerp(1.48, 2.18, holdT);
      const holdSide = this.sideSign * THREE.MathUtils.lerp(0.76, 1.18, holdT);
      const holdUp = THREE.MathUtils.lerp(0.24, 0.5, holdT);

      _desiredCamPos
        .copy(_focusPos)
        .addScaledVector(_flightDir, -holdBack)
        .addScaledVector(_flightRight, holdSide)
        .addScaledVector(_flightUp, holdUp);

      this.resolveCameraSafety(
        _focusPos,
        _desiredCamPos,
        activeGlbCollider,
        getGroundHeight
      );

      // Micro-tremor (`cameraShake`) tátil no impacto com o esqueleto
      if (this.impactShake > 0.001) {
        this.impactShake = Math.max(0, this.impactShake - dt * 0.28);
        _desiredCamPos.x += (Math.random() - 0.5) * this.impactShake;
        _desiredCamPos.y += (Math.random() - 0.5) * this.impactShake;
        _desiredCamPos.z += (Math.random() - 0.5) * this.impactShake * 0.6;
      }

      const camAlpha = 1 - Math.exp(-9.0 * dt);
      this.currentCamPos.lerp(_desiredCamPos, camAlpha);

      this.applyCameraTransform(
        this.currentCamPos,
        _focusPos,
        this.sideSign * THREE.MathUtils.lerp(0.036, 0.0, holdT)
      );

      this.setCameraFovSmooth(this.savedBaseFov - 8, 6.5, dt);
      this.vignetteAlpha = THREE.MathUtils.damp(this.vignetteAlpha, 0.9, 6, dt);
      this.timeScale = this.config.slowMoTimeScale;

      if (holdT >= 1) {
        this.beginReturnPhase();
      }
      return;
    }

    if (this.phase === 'RETURNING') {
      const retT = Math.min(1, this.phaseElapsed / this.config.returnDurationSec);
      const ease = retT * retT * (3 - 2 * retT);

      // Remove o Raio-X assim que começa o retorno à 1P
      if (this.xrayApplied && retT >= 0.25) {
        this.restoreBotXRayState();
      }

      this.activeYawObject.position.lerpVectors(
        this.returnStartCamPos,
        this.savedYawPos,
        ease
      );

      let yawDiff = this.savedYaw - this.returnStartYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      this.activeYawObject.rotation.y = this.returnStartYaw + yawDiff * ease;
      this.activePitchObject.rotation.x = THREE.MathUtils.lerp(
        this.returnStartPitch,
        this.savedPitch,
        ease
      );
      this.camera.rotation.z = THREE.MathUtils.lerp(
        this.returnStartRoll,
        this.savedCamRoll,
        ease
      );

      const nextFov = THREE.MathUtils.lerp(
        this.returnStartFov,
        this.savedBaseFov,
        ease
      );
      if (Math.abs(this.camera.fov - nextFov) > 0.02) {
        this.camera.fov = nextFov;
        this.camera.updateProjectionMatrix();
      }

      if (retT >= 0.65 && !this.weaponRigRoot.visible) {
        this.weaponRigRoot.visible = this.savedWeaponRigVisible;
      }

      this.timeScale = THREE.MathUtils.lerp(
        this.config.slowMoTimeScale,
        1.0,
        ease
      );
      this.vignetteAlpha = (1 - ease) * 0.78;

      if (retT >= 1) {
        this.finishAndRestoreCamera();
      }
    }
  }

  // =========================================================================
  // TRANSIÇÃO RAIO-X: Esqueleto 3D + Carcaça Semitransparente + Brilho Ósseo
  // =========================================================================
  private activateBotXRayMode(): void {
    this.xrayApplied = true;
    this.xrayImpactGlow = 0;

    if (!this.activeTargetRoot) return;

    // 1. Posiciona e escala o esqueleto único exatamente sobre o bot atingido
    this.syncSkeletonPoseToTarget(0);
    if (this.skeletonModel) {
      const heightRatio =
        this.activeBotHeight / this.config.defaultBotHeightMeters;
      this.skeletonRoot.scale.setScalar(heightRatio);
      this.skeletonRoot.visible = true;
    }

    // 2. Troca temporariamente materiais visíveis externos do bot para X-Ray escuro/azulado
    this.savedBotMaterials.length = 0;
    this.activeTargetRoot.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      // Ignora hitboxes invisíveis (headMesh / torsoMesh / armorMesh invisíveis do raycast)
      if (node.userData?.hitZone) return;
      if (!node.visible) return;
      const mat = node.material;
      if (!mat) return;
      if (!Array.isArray(mat) && (mat.visible === false || (mat.transparent && mat.opacity <= 0.01))) {
        return;
      }

      this.savedBotMaterials.push({
        mesh: node,
        originalMaterial: mat,
      });
      node.material = this.xrayBotShellMaterial;
    });
  }

  private syncSkeletonPoseToTarget(fallProgress: number): void {
    if (!this.activeTargetRoot) return;
    this.skeletonRoot.position.copy(this.activeTargetRoot.position);
    this.skeletonRoot.rotation.set(
      0,
      this.activeTargetRoot.rotation.y,
      0
    );

    // Após o impacto, inclina o esqueleto acompanhando o recuo/queda na direção da bala
    if (fallProgress > 0) {
      const easeFall = 1 - Math.pow(1 - fallProgress, 2.2);
      const localBackX = -Math.sin(this.activeTargetRoot.rotation.y);
      const localBackZ = -Math.cos(this.activeTargetRoot.rotation.y);
      const hitDot = _flightDir.x * localBackX + _flightDir.z * localBackZ;
      const fallDirSign = hitDot >= 0 ? -1 : 1;
      this.skeletonRoot.rotation.x = fallDirSign * easeFall * 0.42;
      this.skeletonRoot.position.y -= easeFall * 0.14;
    }
  }

  private updateSkeletonXRayVisuals(dt: number): void {
    const holdProgress =
      this.phase === 'IMPACT_HOLD'
        ? Math.min(1, this.phaseElapsed / this.config.impactHoldSec)
        : 0;
    this.syncSkeletonPoseToTarget(holdProgress);

    if (this.xrayImpactGlow > 0) {
      this.xrayImpactGlow = Math.max(0, this.xrayImpactGlow - dt * 1.45);
    }

    const hitRegion: 'HEAD' | 'TORSO' =
      this.activeIsHeadshot || this.activeHitZone === 'HEAD' ? 'HEAD' : 'TORSO';

    for (let i = 0; i < this.skeletonRegionMeshes.length; i++) {
      const entry = this.skeletonRegionMeshes[i];
      if (entry.region === hitRegion && this.xrayImpactGlow > 0.01) {
        // Pulso inicial branco-incandescente que decai para vermelho-vivo de fratura
        const flashWhite = Math.pow(this.xrayImpactGlow, 2.2);
        _tmpColor.copy(BONE_HIT_RED).lerp(BONE_HIT_WHITE, flashWhite * 0.78);
        entry.material.emissive.copy(_tmpColor);
        entry.material.emissiveIntensity = 0.7 + this.xrayImpactGlow * 2.8;
      } else {
        entry.material.emissive.copy(BONE_BASE_EMISSIVE);
        entry.material.emissiveIntensity = 0.45;
      }
    }
  }

  private restoreBotXRayState(): void {
    for (let i = 0; i < this.savedBotMaterials.length; i++) {
      const saved = this.savedBotMaterials[i];
      saved.mesh.material = saved.originalMaterial;
    }
    this.savedBotMaterials.length = 0;
    this.skeletonRoot.visible = false;
    this.xrayApplied = false;
    this.xrayImpactGlow = 0;

    // Reseta emissivo dos ossos do pool para o próximo uso
    for (let i = 0; i < this.skeletonRegionMeshes.length; i++) {
      const entry = this.skeletonRegionMeshes[i];
      entry.material.emissive.copy(BONE_BASE_EMISSIVE);
      entry.material.emissiveIntensity = 0.45;
    }
  }

  // =========================================================================
  // IMPACTO: Estilhaços de Osso (10) + Sangue Entrada/Saída (25) + Rastro Vermelho
  // =========================================================================
  private triggerImpactPhase(): void {
    this.phase = 'IMPACT_HOLD';
    this.phaseElapsed = 0;
    this.exitBulletElapsed = 0;
    this.impactShake = this.activeIsHeadshot ? 0.068 : 0.045;

    // Garante que o Raio-X foi ativado mesmo em frame drop extremo
    if (!this.xrayApplied) {
      this.activateBotXRayMode();
    }

    // Brilho emissivo vermelho/branco máximo na região atingida do esqueleto
    this.xrayImpactGlow = 1.0;

    // Rastro da bala muda para VERMELHO ESCURO ao atravessar o esqueleto e sair pelas costas
    this.setTracerColors(true);

    // Calcula ponto de saída nas costas do bot (~20cm crânio / ~36cm tronco)
    const bodyThickness = this.activeIsHeadshot ? 0.2 : 0.36;
    _exitPos.copy(this.impactPos).addScaledVector(_flightDir, bodyThickness);

    // Dispara pools de estilhaços de osso (10) e partículas de sangue entrada/saída (25)
    this.spawnBoneShards(this.impactPos, _exitPos);
    this.spawnBloodBurst(this.impactPos, _exitPos);

    // Executa abate real no KINETIC (Hit Marker vermelho, som de impacto/headshot, queda do bot)
    if (!this.impactTriggered && this.onImpactCallback) {
      this.impactTriggered = true;
      const impactCb = this.onImpactCallback;
      this.onImpactCallback = null;
      impactCb();
    }
  }

  private setTracerColors(isExitBloodTrail: boolean): void {
    if (isExitBloodTrail) {
      this.outerTrailMat.color.copy(TRACER_OUTER_EXIT_COLOR);
      this.innerTrailMat.color.copy(TRACER_INNER_EXIT_COLOR);
      this.shockCollarMat.color.copy(TRACER_SHOCK_EXIT_COLOR);
      this.outerTrailMat.blending = THREE.NormalBlending;
      this.innerTrailMat.blending = THREE.AdditiveBlending;
    } else {
      this.outerTrailMat.color.copy(TRACER_OUTER_ENTRY_COLOR);
      this.innerTrailMat.color.copy(TRACER_INNER_ENTRY_COLOR);
      this.shockCollarMat.color.copy(TRACER_SHOCK_ENTRY_COLOR);
      this.outerTrailMat.blending = THREE.AdditiveBlending;
      this.innerTrailMat.blending = THREE.AdditiveBlending;
    }
    this.outerTrailMat.needsUpdate = true;
    this.innerTrailMat.needsUpdate = true;
  }

  private spawnBoneShards(entryPos: THREE.Vector3, exitPos: THREE.Vector3): void {
    for (let i = 0; i < BONE_SHARD_POOL_SIZE; i++) {
      const p = this.boneShards[i];
      p.active = true;
      p.age = 0;
      p.maxAge = 0.75 + Math.random() * 0.55;

      // Parte sai do impacto ósseo interno e parte explode junto ao ponto de saída
      const fromExit = i >= 3;
      p.pos.copy(fromExit ? exitPos : entryPos);
      p.pos.x += (Math.random() - 0.5) * 0.06;
      p.pos.y += (Math.random() - 0.5) * 0.06;
      p.pos.z += (Math.random() - 0.5) * 0.06;

      // Vetor principal seguindo a direção da bala + espalhamento cônico aleatório
      const forwardSpeed = fromExit
        ? 3.8 + Math.random() * 4.4
        : 1.8 + Math.random() * 2.8;
      const spreadRight = (Math.random() - 0.5) * 2.8;
      const spreadUp = (Math.random() - 0.32) * 2.4;

      p.vel
        .copy(_flightDir)
        .multiplyScalar(forwardSpeed)
        .addScaledVector(_flightRight, spreadRight)
        .addScaledVector(_flightUp, spreadUp);

      p.rot.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      p.rotVel.set(
        (Math.random() - 0.5) * 28,
        (Math.random() - 0.5) * 28,
        (Math.random() - 0.5) * 28
      );
      p.scale.set(
        0.65 + Math.random() * 0.9,
        0.55 + Math.random() * 0.75,
        0.65 + Math.random() * 0.9
      );
    }
    this.boneShardMesh.visible = true;
    this.particlesActiveCount = BONE_SHARD_POOL_SIZE + BLOOD_PARTICLE_POOL_SIZE;
  }

  private spawnBloodBurst(entryPos: THREE.Vector3, exitPos: THREE.Vector3): void {
    // 9 partículas no ponto de entrada (respingo de entrada) + 16 no ponto de saída (jato traseiro)
    const entryCount = 9;
    for (let i = 0; i < BLOOD_PARTICLE_POOL_SIZE; i++) {
      const p = this.bloodParticles[i];
      p.active = true;
      p.age = 0;
      p.maxAge = 0.55 + Math.random() * 0.5;

      const isEntry = i < entryCount;
      p.pos.copy(isEntry ? entryPos : exitPos);
      p.pos.x += (Math.random() - 0.5) * 0.05;
      p.pos.y += (Math.random() - 0.5) * 0.05;
      p.pos.z += (Math.random() - 0.5) * 0.05;

      if (isEntry) {
        // Respingo para trás/lados no ponto de entrada
        const backSpeed = -(0.8 + Math.random() * 1.9);
        const spreadR = (Math.random() - 0.5) * 2.6;
        const spreadU = (Math.random() - 0.25) * 2.2;
        p.vel
          .copy(_flightDir)
          .multiplyScalar(backSpeed)
          .addScaledVector(_flightRight, spreadR)
          .addScaledVector(_flightUp, spreadU);
        const s = 0.55 + Math.random() * 0.75;
        p.scale.set(s, s, s);
      } else {
        // Cone de saída intenso nas costas do bot seguindo a direção da bala
        const exitSpeed = 3.2 + Math.random() * 5.6;
        const spreadR = (Math.random() - 0.5) * 3.0;
        const spreadU = (Math.random() - 0.3) * 2.5;
        p.vel
          .copy(_flightDir)
          .multiplyScalar(exitSpeed)
          .addScaledVector(_flightRight, spreadR)
          .addScaledVector(_flightUp, spreadU);
        const s = 0.75 + Math.random() * 1.15;
        p.scale.set(s * 0.85, s * 0.85, s * 1.35);
      }

      p.rot.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      p.rotVel.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      );
    }
    this.bloodMesh.visible = true;
    this.particlesActiveCount = BONE_SHARD_POOL_SIZE + BLOOD_PARTICLE_POOL_SIZE;
  }

  private updateProceduralParticles(simDt: number): void {
    let alive = 0;

    // 1. Estilhaços de Osso (10)
    let boneDirty = false;
    for (let i = 0; i < BONE_SHARD_POOL_SIZE; i++) {
      const p = this.boneShards[i];
      if (!p.active) continue;
      boneDirty = true;
      p.age += simDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.boneShardMesh.setMatrixAt(i, _hiddenMatrix);
        continue;
      }

      alive++;
      const dragFactor = Math.max(0.2, 1 - p.drag * simDt);
      p.vel.multiplyScalar(dragFactor);
      p.vel.y += p.gravity * simDt;
      p.pos.addScaledVector(p.vel, simDt);

      p.rot.x += p.rotVel.x * simDt;
      p.rot.y += p.rotVel.y * simDt;
      p.rot.z += p.rotVel.z * simDt;

      const lifeShrink = 1 - Math.pow(p.age / p.maxAge, 2.5);
      _dummyObj.position.copy(p.pos);
      _dummyObj.rotation.copy(p.rot);
      _dummyObj.scale.set(
        p.scale.x * lifeShrink,
        p.scale.y * lifeShrink,
        p.scale.z * lifeShrink
      );
      _dummyObj.updateMatrix();
      this.boneShardMesh.setMatrixAt(i, _dummyObj.matrix);
    }
    if (boneDirty) {
      this.boneShardMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Partículas de Sangue Procedural (25)
    let bloodDirty = false;
    for (let i = 0; i < BLOOD_PARTICLE_POOL_SIZE; i++) {
      const p = this.bloodParticles[i];
      if (!p.active) continue;
      bloodDirty = true;
      p.age += simDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this.bloodMesh.setMatrixAt(i, _hiddenMatrix);
        continue;
      }

      alive++;
      const dragFactor = Math.max(0.15, 1 - p.drag * simDt);
      p.vel.multiplyScalar(dragFactor);
      p.vel.y += p.gravity * simDt;
      p.pos.addScaledVector(p.vel, simDt);

      p.rot.x += p.rotVel.x * simDt;
      p.rot.y += p.rotVel.y * simDt;
      p.rot.z += p.rotVel.z * simDt;

      const lifeShrink = 1 - Math.pow(p.age / p.maxAge, 1.8);
      _dummyObj.position.copy(p.pos);
      _dummyObj.rotation.copy(p.rot);
      _dummyObj.scale.set(
        p.scale.x * lifeShrink,
        p.scale.y * lifeShrink,
        p.scale.z * lifeShrink
      );
      _dummyObj.updateMatrix();
      this.bloodMesh.setMatrixAt(i, _dummyObj.matrix);
    }
    if (bloodDirty) {
      this.bloodMesh.instanceMatrix.needsUpdate = true;
    }

    this.particlesActiveCount = alive;
    if (alive === 0) {
      this.boneShardMesh.visible = false;
      this.bloodMesh.visible = false;
    }
  }

  private clearParticles(): void {
    for (let i = 0; i < BONE_SHARD_POOL_SIZE; i++) {
      this.boneShards[i].active = false;
      this.boneShardMesh.setMatrixAt(i, _hiddenMatrix);
    }
    this.boneShardMesh.instanceMatrix.needsUpdate = true;
    this.boneShardMesh.visible = false;

    for (let i = 0; i < BLOOD_PARTICLE_POOL_SIZE; i++) {
      this.bloodParticles[i].active = false;
      this.bloodMesh.setMatrixAt(i, _hiddenMatrix);
    }
    this.bloodMesh.instanceMatrix.needsUpdate = true;
    this.bloodMesh.visible = false;
    this.particlesActiveCount = 0;
  }

  // =========================================================================
  // RETORNO SUAVE & UTILITÁRIOS DE CÂMERA
  // =========================================================================
  private beginReturnPhase(): void {
    this.phase = 'RETURNING';
    this.phaseElapsed = 0;
    this.bulletRoot.visible = false;
    this.trailGroup.visible = false;

    if (this.activeYawObject && this.activePitchObject) {
      this.returnStartCamPos.copy(this.activeYawObject.position);
      this.returnStartYaw = this.activeYawObject.rotation.y;
      this.returnStartPitch = this.activePitchObject.rotation.x;
      this.returnStartRoll = this.camera.rotation.z;
      this.returnStartFov = this.camera.fov;
    }
  }

  private finishAndRestoreCamera(): void {
    this.restoreBotXRayState();
    this.phase = 'IDLE';
    this.phaseElapsed = 0;
    this.totalElapsed = 0;
    this.timeScale = 1.0;
    this.vignetteAlpha = 0;
    this.impactShake = 0;
    this.bulletRoot.visible = false;
    this.trailGroup.visible = false;
    this.projectileSpinGroup.visible = false;

    if (this.activeYawObject && this.activePitchObject) {
      this.activeYawObject.position.copy(this.savedYawPos);
      this.activeYawObject.rotation.y = this.savedYaw;
      this.activePitchObject.rotation.x = this.savedPitch;
    }
    this.camera.rotation.z = this.savedCamRoll;
    if (Math.abs(this.camera.fov - this.savedBaseFov) > 0.01) {
      this.camera.fov = this.savedBaseFov;
      this.camera.updateProjectionMatrix();
    }

    this.weaponRigRoot.visible = this.savedWeaponRigVisible;

    const completeCb = this.onCompleteCallback;
    this.onImpactCallback = null;
    this.onCompleteCallback = null;
    this.activeYawObject = null;
    this.activePitchObject = null;
    this.activeTargetRoot = null;
    completeCb?.();
  }

  private applyCameraTransform(
    camPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    rollRad: number
  ): void {
    if (!this.activeYawObject || !this.activePitchObject) return;
    this.activeYawObject.position.copy(camPos);

    const dx = targetPos.x - camPos.x;
    const dy = targetPos.y - camPos.y;
    const dz = targetPos.z - camPos.z;
    const horizDist = Math.hypot(dx, dz) || 0.001;

    this.activeYawObject.rotation.y = Math.atan2(-dx, -dz);
    this.activePitchObject.rotation.x = THREE.MathUtils.clamp(
      Math.atan2(dy, horizDist),
      -Math.PI * 0.44,
      Math.PI * 0.44
    );
    this.camera.rotation.z = rollRad;
  }

  private setCameraFovSmooth(targetFov: number, lambda: number, dt: number): void {
    const clampedTarget = THREE.MathUtils.clamp(targetFov, 40, 92);
    const nextFov = THREE.MathUtils.damp(this.camera.fov, clampedTarget, lambda, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.02) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private resolveCameraSafety(
    focus: THREE.Vector3,
    desired: THREE.Vector3,
    activeGlbCollider?: Dust2TriangleCollider | null,
    getGroundHeight?: (x: number, y: number, z: number) => number
  ): void {
    if (activeGlbCollider && activeGlbCollider.ready) {
      _rayDir.subVectors(desired, focus);
      const dist = _rayDir.length();
      if (dist > 0.08) {
        _rayDir.multiplyScalar(1 / dist);
        const hitDist = activeGlbCollider.raycastDistance(focus, _rayDir, dist);
        if (hitDist !== null && hitDist < dist) {
          const safeDist = Math.max(0.35, hitDist - 0.24);
          desired.copy(focus).addScaledVector(_rayDir, safeDist);
        }
      }
    }

    if (getGroundHeight) {
      const floorY = getGroundHeight(desired.x, desired.y + 0.5, desired.z);
      if (Number.isFinite(floorY) && desired.y < floorY + 0.35) {
        desired.y = floorY + 0.35;
      }
    }
  }

  /**
   * Libera todas as geometrias e materiais do pool (incluindo o esqueleto único).
   */
  public dispose(): void {
    this.reset();
    this.scene.remove(this.bulletRoot);
    this.scene.remove(this.skeletonRoot);
    this.scene.remove(this.boneShardMesh);
    this.scene.remove(this.bloodMesh);

    if (this.skeletonModel) {
      this.skeletonModel.traverse((node) => {
        if (node instanceof THREE.Mesh && node.geometry) {
          node.geometry.dispose();
        }
      });
      this.skeletonModel = null;
    }
    this.skeletonRegionMeshes.length = 0;

    for (let i = 0; i < this.pooledGeometries.length; i++) {
      this.pooledGeometries[i].dispose();
    }
    for (let i = 0; i < this.pooledMaterials.length; i++) {
      this.pooledMaterials[i].dispose();
    }
    this.pooledGeometries.length = 0;
    this.pooledMaterials.length = 0;
  }
}
