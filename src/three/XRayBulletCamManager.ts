import * as THREE from 'three';
import { soundEngine } from '../audio/soundEngine';
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
  /** Fase A (Voo até o alvo): escala global de tempo (~0.30 = 30% da velocidade). */
  flightTimeScale: number;
  /** Fase B (Momento do impacto no osso/esqueleto): ultra-câmera lenta (0.06 a 0.10). */
  impactUltraSlowMoTimeScale: number;
  /** Duração real (s) da janela de ultra-câmera lenta durante a travessia óssea. */
  ultraSlowMoDurationSec: number;
  /** Compatibilidade legada: escala de tempo pós-fratura durante a reação de queda. */
  slowMoTimeScale: number;
  /** Tempo real (s) total focado na travessia óssea + reação de queda do bot. */
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
  xrayRevealDistanceMeters: 1.25,
  flightTimeScale: 0.3,
  impactUltraSlowMoTimeScale: 0.07,
  ultraSlowMoDurationSec: 0.46,
  slowMoTimeScale: 0.26,
  impactHoldSec: 0.86,
  returnDurationSec: 0.24,
  skipGraceSec: 0.18,
  defaultBotHeightMeters: 1.78,
};

const SKELETON_GLB_URL = resolveAssetUrl('/models/characters/skeleton.glb');
export const BULLET_CAM_TRAIL_LOCAL_URL = resolveAssetUrl(
  '/sounds/bullet_cam_trail.wav'
);
export const BULLET_CAM_TRAIL_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/421d862b7cd36af242c9f3edaeb2484d686198de/Sound/456266__soundfxstudio__grad-bm-21-mlrs.wav';

export const BULLET_CAM_BONE_CRACK_LOCAL_URL = resolveAssetUrl(
  '/sounds/bullet_cam_bone_crack.wav'
);
export const BULLET_CAM_BONE_CRACK_GITHUB_RAW_URL =
  'https://raw.githubusercontent.com/rafaelestafeta2-blip/Gamesfps/421d862b7cd36af242c9f3edaeb2484d686198de/Sound/369602__evanboyerman__bone-crunchcrack-3-mixed.wav';

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

interface ActiveFlightAudioHandle {
  stop: () => void;
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
const _regionBox = new THREE.Box3();
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
 * 2. Precisão Cirúrgica do Impacto:
 *    - Captura e trava no instante do disparo a posição/rotação do bot alvo (`bulletCamTargetLocked = true`)
 *      e o ponto exato de impacto (`impactPos`), impedindo que o bot continue andando e que a bala
 *      acerte outra parte do corpo no fim do trajeto.
 *    - Alinha e trava o `skeleton.glb` diretamente ao ponto de impacto anatômico (`HEAD` crânio ou
 *      `TORSO` costelas/esterno/coluna) e congela a locomoção/animação do bot durante a cena.
 * 3. Duas Fases de Câmera Lenta + Áudio Modular de Rastro e Fratura:
 *    - Fase A (Voo): `timeScale = 0.30` com rastro branco/ciano visível e som contínuo de voo/assobio da bala.
 *    - Fase B (Impacto no Esqueleto): reduz `timeScale` para `0.07` (ultra-câmera lenta) enquanto a bala
 *      atravessa o osso, os 10 estilhaços de osso se abrem e as 25 partículas de sangue explodem na entrada
 *      e saída com som sincronizado de fratura óssea e penetração.
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
  /** Alturas anatômicas normalizadas (em relação à base 0..1.78m do skeleton.glb). */
  private skeletonHeadCenterY = 1.56;
  private skeletonTorsoMinY = 0.96;
  private skeletonTorsoMaxY = 1.36;
  private skeletonTorsoCenterY = 1.18;

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
  // 4. Máquina de Estados, Travamento Anatômico do Alvo & Áudio Modular
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
  private activeFlightAudio: ActiveFlightAudioHandle | null = null;
  private trailRawBytes: ArrayBuffer | null = null;
  private boneCrackRawBytes: ArrayBuffer | null = null;
  private boneCrackFromGithubFallback = false;
  private trailAudioBuffer: AudioBuffer | null = null;
  private boneCrackAudioBuffer: AudioBuffer | null = null;
  private audioPreloadStarted = false;
  private audioDecodeInFlight = false;

  private activeYawObject: THREE.Object3D | null = null;
  private activePitchObject: THREE.Object3D | null = null;
  private activeTargetRoot: THREE.Object3D | null = null;
  private onImpactCallback: (() => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;

  private readonly startPos = new THREE.Vector3();
  private readonly impactPos = new THREE.Vector3();
  private readonly impactNormal = new THREE.Vector3();
  /** Posição e rotação travadas do bot no exato instante do raycast letal. */
  private readonly lockedTargetPos = new THREE.Vector3();
  private lockedTargetYaw = 0;
  /** Âncora 3D exata do esqueleto alinhada ao ponto de impacto capturado. */
  private readonly lockedSkeletonAnchorPos = new THREE.Vector3();

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

    // Pré-carrega em background a ÚNICA instância do esqueleto (Object Pooling) e os 2 efeitos sonoros (.wav)
    this.preloadSkeleton();
    this.preloadBulletCamAudio();
  }

  /**
   * Pré-carrega em memória os arquivos `.wav` reais do rastro da bala
   * (`456266__soundfxstudio__grad-bm-21-mlrs.wav`) e dos ossos quebrando no impacto
   * (`369602__evanboyerman__bone-crunchcrack-3-mixed.wav`).
   */
  public preloadBulletCamAudio(): void {
    if (this.audioPreloadStarted) return;
    this.audioPreloadStarted = true;

    const fetchWithFallback = async (
      localUrl: string,
      githubRawUrl: string
    ): Promise<{ bytes: ArrayBuffer; isFallback: boolean } | null> => {
      try {
        const res = await fetch(localUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 256) {
            return { bytes: buf, isFallback: false };
          }
        }
      } catch {
        /* fallback to GitHub Raw */
      }
      try {
        const res = await fetch(githubRawUrl);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 256) {
            return { bytes: buf, isFallback: true };
          }
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    void Promise.all([
      fetchWithFallback(
        BULLET_CAM_TRAIL_LOCAL_URL,
        BULLET_CAM_TRAIL_GITHUB_RAW_URL
      ),
      fetchWithFallback(
        BULLET_CAM_BONE_CRACK_LOCAL_URL,
        BULLET_CAM_BONE_CRACK_GITHUB_RAW_URL
      ),
    ]).then(([trailRes, boneRes]) => {
      if (trailRes) {
        this.trailRawBytes = trailRes.bytes;
      }
      if (boneRes) {
        this.boneCrackRawBytes = boneRes.bytes;
        this.boneCrackFromGithubFallback = boneRes.isFallback;
      }
      const state = soundEngine.getSpatialAudioState();
      if (state.ctx) {
        void this.ensureAudioBuffersDecoded(state.ctx);
      }
    });
  }

  private async ensureAudioBuffersDecoded(ctx: AudioContext): Promise<void> {
    if (this.audioDecodeInFlight) return;
    if (
      (!this.trailRawBytes || this.trailAudioBuffer) &&
      (!this.boneCrackRawBytes || this.boneCrackAudioBuffer)
    ) {
      return;
    }
    this.audioDecodeInFlight = true;
    try {
      if (this.trailRawBytes && !this.trailAudioBuffer) {
        const copy = this.trailRawBytes.slice(0);
        this.trailAudioBuffer = await ctx.decodeAudioData(copy);
      }
      if (this.boneCrackRawBytes && !this.boneCrackAudioBuffer) {
        const copy = this.boneCrackRawBytes.slice(0);
        this.boneCrackAudioBuffer = await ctx.decodeAudioData(copy);
      }
    } catch {
      /* fallback procedural permanece disponível se decode falhar */
    } finally {
      this.audioDecodeInFlight = false;
    }
  }

  /**
   * Carrega UMA ÚNICA instância de `skeleton.glb` na memória, normaliza sua escala
   * via `THREE.Box3` para a altura dos bots (1.78m) e mede as cotas anatômicas exatas
   * do crânio (`HEAD`) e caixa torácica (`TORSO`) para alinhamento cirúrgico no impacto.
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

        // 1. Mede o bounding box bruto do GLB
        model.updateMatrixWorld(true);
        _tmpBox.setFromObject(model);
        _tmpBox.getSize(_tmpSize);
        _tmpBox.getCenter(_tmpCenter);

        // 2. Ajusta escala uniforme automaticamente para casar com a altura padrão do bot (1.78m)
        const rawHeight = Math.max(0.01, _tmpSize.y);
        const normalizedScale = this.config.defaultBotHeightMeters / rawHeight;
        model.scale.set(normalizedScale, normalizedScale, normalizedScale);

        // 3. Centraliza X/Z em 0 e apoia os pés exatamente no piso (y = 0)
        model.position.set(
          -_tmpCenter.x * normalizedScale,
          -_tmpBox.min.y * normalizedScale,
          -_tmpCenter.z * normalizedScale
        );
        model.updateMatrixWorld(true);

        // 4. Prepara materiais por região anatômica e mede cotas Y reais de crânio e costelas
        this.skeletonRegionMeshes.length = 0;
        let headMinY = Infinity;
        let headMaxY = -Infinity;
        let torsoMinY = Infinity;
        let torsoMaxY = -Infinity;

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

          _regionBox.setFromObject(node);
          if (!_regionBox.isEmpty()) {
            if (region === 'HEAD') {
              headMinY = Math.min(headMinY, _regionBox.min.y);
              headMaxY = Math.max(headMaxY, _regionBox.max.y);
            } else if (
              region === 'TORSO' &&
              !nameLower.includes('ilium') &&
              !nameLower.includes('pelvis')
            ) {
              torsoMinY = Math.min(torsoMinY, _regionBox.min.y);
              torsoMaxY = Math.max(torsoMaxY, _regionBox.max.y);
            }
          }

          const boneMat = new THREE.MeshStandardMaterial({
            color: 0xebe3cf,
            emissive: BONE_BASE_EMISSIVE.clone(),
            emissiveIntensity: 0.45,
            roughness: 0.52,
            metalness: 0.08,
          });
          if (Array.isArray(node.material)) {
            node.material.forEach((m) => m.dispose());
          } else if (node.material) {
            node.material.dispose();
          }
          node.material = boneMat;
          this.pooledMaterials.push(boneMat);
          this.skeletonRegionMeshes.push({ mesh: node, material: boneMat, region });
        });

        if (Number.isFinite(headMinY) && Number.isFinite(headMaxY)) {
          this.skeletonHeadCenterY = (headMinY + headMaxY) * 0.5;
        }
        if (Number.isFinite(torsoMinY) && Number.isFinite(torsoMaxY)) {
          this.skeletonTorsoMinY = torsoMinY;
          this.skeletonTorsoMaxY = torsoMaxY;
          this.skeletonTorsoCenterY = (torsoMinY + torsoMaxY) * 0.5;
        }

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
   * Valida regras críticas, trava o ponto exato de impacto e a pose do bot alvo,
   * e inicia a X-Ray Sniper Bullet Cam com som de voo e câmera lenta em 2 fases.
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

    if (!this.skeletonLoaded && !this.skeletonLoading) {
      this.preloadSkeleton();
    }

    // -----------------------------------------------------------------------
    // 1. CAPTURA E TRAVAMENTO CIRÚRGICO DO PONTO DE IMPACTO E DO BOT ALVO
    // -----------------------------------------------------------------------
    this.activeYawObject = params.yawObject;
    this.activePitchObject = params.pitchObject;
    this.activeTargetRoot = params.targetRoot || null;
    this.onImpactCallback = params.onImpact;
    this.onCompleteCallback = params.onComplete || null;

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

    // Direção unitária exata da trajetória da bala até o ponto travado
    _flightDir.subVectors(this.impactPos, this.startPos).normalize();

    if (this.activeTargetRoot) {
      this.lockedTargetPos.copy(this.activeTargetRoot.position);
      this.lockedTargetYaw = this.activeTargetRoot.rotation.y;
      // Trava imediatamente a navegação e a locomoção do bot alvo para não sair do lugar!
      this.activeTargetRoot.userData = this.activeTargetRoot.userData || {};
      this.activeTargetRoot.userData.bulletCamTargetLocked = true;
      this.activeTargetRoot.userData.bulletCamPenetrationFreeze = false;
    } else {
      this.lockedTargetPos.set(
        this.impactPos.x,
        Math.max(0, this.impactPos.y - (this.activeIsHeadshot ? 1.56 : 1.18)),
        this.impactPos.z
      );
      this.lockedTargetYaw = Math.atan2(-_flightDir.x, -_flightDir.z);
    }

    // Calcula a âncora 3D exata do `skeleton.glb` alinhada ao ponto de impacto capturado
    this.computeLockedSkeletonAnchor();

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
    // Fase A (Voo até o alvo): timeScale em ~0.30
    this.timeScale = this.config.flightTimeScale;
    this.vignetteAlpha = 0.25;

    // Oculta arma 1P durante o voo
    this.weaponRigRoot.visible = false;

    // Configura cores iniciais do rastro da bala: BRANCO / CIANO antes do impacto
    this.setTracerColors(false);

    // Posiciona projétil 3D na boca do cano apontando para o impactPos travado
    this.bulletRoot.position.copy(this.startPos);
    this.bulletRoot.lookAt(this.impactPos);
    this.projectileSpinGroup.visible = true;
    this.projectileSpinGroup.rotation.z = 0;
    this.trailGroup.visible = true;
    this.outerTrailMesh.scale.set(1, 1, 0.35);
    this.innerTrailMesh.scale.set(1, 1, 0.28);
    this.bulletRoot.visible = true;

    this.currentCamPos.copy(this.savedYawPos);

    // Inicia som modular de rastro/assobio do projétil em câmera lenta
    this.startFlightTrailSound(this.flightDuration);
    return true;
  }

  /**
   * Alinha cirurgicamente a raiz do `skeleton.glb` ao ponto de impacto (`this.impactPos`)
   * para que a bala SEMPRE atinja o osso exato mirado (crânio em Headshot ou costela/esterno/coluna
   * em tiro no tronco), mesmo que o bot estivesse agachado ou inclinado no instante do disparo.
   */
  private computeLockedSkeletonAnchor(): void {
    const heightRatio =
      this.activeBotHeight / this.config.defaultBotHeightMeters;

    // Profundidade média entre a superfície frontal do hitbox e o centro do osso
    const boneDepthFromEntry =
      this.activeIsHeadshot || this.activeHitZone === 'HEAD' ? 0.085 : 0.125;

    // Preserva o deslocamento lateral (esquerda/direita na costela ou crânio) limitado à largura óssea
    const upRef = Math.abs(_flightDir.y) > 0.94 ? _altUp : _worldUp;
    _flightRight.crossVectors(_flightDir, upRef).normalize();

    const rawCenterX = this.impactPos.x + _flightDir.x * boneDepthFromEntry;
    const rawCenterZ = this.impactPos.z + _flightDir.z * boneDepthFromEntry;
    const dxFromBot = rawCenterX - this.lockedTargetPos.x;
    const dzFromBot = rawCenterZ - this.lockedTargetPos.z;
    const lateralOffset = THREE.MathUtils.clamp(
      dxFromBot * _flightRight.x + dzFromBot * _flightRight.z,
      -0.11,
      0.11
    );

    // Posiciona X/Z do esqueleto exatamente na linha de impacto da bala (com offset lateral da costela)
    this.lockedSkeletonAnchorPos.x = rawCenterX - _flightRight.x * (lateralOffset * 0.45);
    this.lockedSkeletonAnchorPos.z = rawCenterZ - _flightRight.z * (lateralOffset * 0.45);

    // Calcula a altura (Y) do osso alvo no modelo normalizado do esqueleto
    const localHitY = this.impactPos.y - this.lockedTargetPos.y;
    let targetBoneHeightOnSkeleton: number;

    if (this.activeIsHeadshot || this.activeHitZone === 'HEAD') {
      targetBoneHeightOnSkeleton = this.skeletonHeadCenterY * heightRatio;
    } else {
      // Mapeia o ponto atingido no torso diretamente para a faixa da caixa torácica (costelas/esterno)
      // garantindo que nunca desça para a bacia/pernas mesmo se o bot estava agachado!
      const minRibY = this.skeletonTorsoMinY * heightRatio;
      const maxRibY = this.skeletonTorsoMaxY * heightRatio;
      const defaultRibY = this.skeletonTorsoCenterY * heightRatio;
      targetBoneHeightOnSkeleton = THREE.MathUtils.clamp(
        localHitY,
        minRibY + 0.04,
        maxRibY - 0.03
      );
      if (!Number.isFinite(targetBoneHeightOnSkeleton)) {
        targetBoneHeightOnSkeleton = defaultRibY;
      }
    }

    // Trava o Y do esqueleto de forma que `lockedSkeletonAnchorPos.y + targetBoneHeightOnSkeleton === impactPos.y`
    this.lockedSkeletonAnchorPos.y =
      this.impactPos.y - targetBoneHeightOnSkeleton;
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

    this.stopFlightTrailSound();

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
    this.stopFlightTrailSound();
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

    // Atualiza partículas procedurais (estilhaços de osso + sangue) respeitando o timeScale da fase atual
    if (this.particlesActiveCount > 0) {
      // Durante a ultra-câmera lenta (0.07), mantém fluidez suave dos estilhaços se abrindo
      const particleTimeScale =
        this.phase === 'IMPACT_HOLD' &&
        this.phaseElapsed < this.config.ultraSlowMoDurationSec
          ? Math.max(0.14, this.timeScale * 2.1)
          : this.timeScale;
      this.updateProceduralParticles(dt * particleTimeScale);
    }

    if (this.phase === 'IDLE' || !this.activeYawObject || !this.activePitchObject) {
      return;
    }

    this.phaseElapsed += dt;
    this.totalElapsed += dt;

    // Mantém o bot alvo travado na posição/rotação exata capturada no disparo até o fim da travessia óssea
    if (
      this.activeTargetRoot &&
      (!this.impactTriggered ||
        (this.phase === 'IMPACT_HOLD' &&
          this.phaseElapsed < this.config.ultraSlowMoDurationSec))
    ) {
      this.activeTargetRoot.position.copy(this.lockedTargetPos);
      this.activeTargetRoot.rotation.y = this.lockedTargetYaw;
    }

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
      // Curva cinematográfica com desaceleração progressiva ao entrar na janela de Raio-X
      const flightT =
        linearT < 0.72
          ? (linearT / 0.72) * 0.82
          : 0.82 + ((linearT - 0.72) / 0.28) * 0.18;

      _bulletPos.lerpVectors(this.startPos, this.impactPos, flightT);
      // Arco balístico zera suavemente nos metros finais para cravar 100% no impactPos mirado
      const arcEnvelope = Math.sin(flightT * Math.PI) * (1 - flightT * flightT);
      const dropArc = arcEnvelope * Math.min(0.14, totalDist * 0.0024);
      _bulletPos.y += dropArc;

      const remainingDistToImpact = _bulletPos.distanceTo(this.impactPos);

      // TRANSIÇÃO RAIO-X: ativa exatamente quando a bala chega a <= 1.25m do ponto de impacto travado
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

      // Posição lateral/orbital suave da câmera que fecha no close-up do esqueleto a 1.25m
      const xrayZoomBlend = this.xrayApplied ? 1 : 0;
      const orbitalSweep = Math.sin(linearT * Math.PI * 0.95) * 0.42;
      const backOffset = THREE.MathUtils.lerp(0.92, 1.18, linearT);
      const sideOffset =
        this.sideSign * (0.42 + orbitalSweep + xrayZoomBlend * 0.16);
      const upOffset = THREE.MathUtils.lerp(0.14, 0.2, linearT);

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

      const focusBlend = THREE.MathUtils.smoothstep(linearT, 0.5, 0.94);
      _lookTarget.lerpVectors(_bulletPos, this.impactPos, focusBlend);
      _lookTarget.addScaledVector(_flightDir, (1 - focusBlend) * 0.35);

      this.applyCameraTransform(
        this.currentCamPos,
        _lookTarget,
        this.sideSign * (0.048 * (1 - linearT * 0.45))
      );

      const targetFov =
        linearT < 0.25
          ? THREE.MathUtils.lerp(this.savedBaseFov, this.savedBaseFov - 6, linearT / 0.25)
          : linearT < 0.74
            ? THREE.MathUtils.lerp(
                this.savedBaseFov - 6,
                this.savedBaseFov + 9,
                (linearT - 0.25) / 0.49
              )
            : THREE.MathUtils.lerp(
                this.savedBaseFov + 9,
                this.savedBaseFov - 13,
                (linearT - 0.74) / 0.26
              );
      this.setCameraFovSmooth(targetFov, 10, dt);

      this.vignetteAlpha = THREE.MathUtils.damp(this.vignetteAlpha, 1.0, 9.5, dt);

      // Fase A (Voo até o alvo): timeScale em ~0.30, reduzindo suavemente para 0.12 nos últimos centímetros antes do osso
      if (this.xrayApplied) {
        const approachFactor = THREE.MathUtils.clamp(
          remainingDistToImpact / this.config.xrayRevealDistanceMeters,
          0,
          1
        );
        this.timeScale = THREE.MathUtils.lerp(
          0.11,
          this.config.flightTimeScale,
          approachFactor
        );
      } else {
        this.timeScale = this.config.flightTimeScale;
      }

      if (linearT >= 1) {
        this.triggerImpactPhase();
      }
      return;
    }

    if (this.phase === 'IMPACT_HOLD') {
      const holdT = Math.min(1, this.phaseElapsed / this.config.impactHoldSec);
      const ultraWindow = this.config.ultraSlowMoDurationSec;
      const inUltraSlowMo = this.phaseElapsed < ultraWindow;

      // Fase B (Momento do impacto no esqueleto): ultra-câmera lenta (0.07) durante a travessia óssea,
      // subindo gradualmente para ~0.26 após a bala sair pelas costas para exibir o colapso do bot
      if (inUltraSlowMo) {
        this.timeScale = this.config.impactUltraSlowMoTimeScale;
      } else {
        const postUltraT = Math.min(
          1,
          (this.phaseElapsed - ultraWindow) /
            Math.max(0.1, this.config.impactHoldSec - ultraWindow)
        );
        this.timeScale = THREE.MathUtils.lerp(
          this.config.impactUltraSlowMoTimeScale,
          this.config.slowMoTimeScale,
          postUltraT
        );
        if (this.activeTargetRoot?.userData) {
          this.activeTargetRoot.userData.bulletCamPenetrationFreeze = false;
        }
      }

      // Bala atravessa o esqueleto bem devagar durante a janela de ultra-câmera lenta e sai pelas costas com RASTRO VERMELHO ESCURO!
      this.exitBulletElapsed += dt;
      if (this.bulletRoot.visible) {
        const exitDuration = ultraWindow * 0.96;
        const exitT = Math.min(1, this.exitBulletElapsed / exitDuration);
        // Primeiros 45% do tempo atravessa o osso (0 -> 0.36m) bem devagar; depois acelera ao sair pelas costas (0.36m -> 2.1m)
        const throughDist =
          exitT < 0.45
            ? (exitT / 0.45) * 0.36
            : 0.36 + ((exitT - 0.45) / 0.55) * 1.75;

        _bulletPos.copy(this.impactPos).addScaledVector(_flightDir, throughDist);
        this.bulletRoot.position.copy(_bulletPos);
        this.projectileSpinGroup.rotation.z += dt * (exitT < 0.45 ? 22.0 : 38.0);

        // Rastro vermelho escuro alonga na saída pelas costas e dissolve suavemente
        const fade = Math.max(0, 1 - Math.max(0, (exitT - 0.25) / 0.75));
        this.outerTrailMesh.scale.set(1.15, 1.15, THREE.MathUtils.lerp(0.8, 2.5, exitT));
        this.innerTrailMesh.scale.set(1.2, 1.2, THREE.MathUtils.lerp(0.7, 2.2, exitT));
        this.outerTrailMat.opacity = 0.46 * fade;
        this.innerTrailMat.opacity = 0.66 * fade;
        this.shockCollarMat.opacity = 0.3 * fade;

        if (exitT >= 1) {
          this.bulletRoot.visible = false;
          this.trailGroup.visible = false;
          this.projectileSpinGroup.visible = false;
        }
      }

      // Durante a ultra-câmera lenta, mantém o foco cravado no ponto exato da fratura óssea (`impactPos`);
      // após a bala atravessar, acompanha suavemente a reação de queda do bot
      if (inUltraSlowMo) {
        const boneFollowT = Math.min(1, this.phaseElapsed / ultraWindow);
        _focusPos
          .copy(this.impactPos)
          .addScaledVector(_flightDir, boneFollowT * 0.16);
      } else {
        const collapseT =
          (this.phaseElapsed - ultraWindow) /
          Math.max(0.1, this.config.impactHoldSec - ultraWindow);
        _focusPos.copy(this.impactPos);
        _focusPos.y -= collapseT * 0.24;
      }

      const holdBack = inUltraSlowMo
        ? THREE.MathUtils.lerp(0.95, 1.22, this.phaseElapsed / ultraWindow)
        : THREE.MathUtils.lerp(1.22, 1.95, holdT);
      const holdSide =
        this.sideSign *
        (inUltraSlowMo
          ? THREE.MathUtils.lerp(0.68, 0.84, this.phaseElapsed / ultraWindow)
          : THREE.MathUtils.lerp(0.84, 1.15, holdT));
      const holdUp = THREE.MathUtils.lerp(0.12, 0.38, holdT);

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

      if (this.impactShake > 0.001) {
        this.impactShake = Math.max(0, this.impactShake - dt * 0.24);
        _desiredCamPos.x += (Math.random() - 0.5) * this.impactShake;
        _desiredCamPos.y += (Math.random() - 0.5) * this.impactShake;
        _desiredCamPos.z += (Math.random() - 0.5) * this.impactShake * 0.6;
      }

      const camAlpha = 1 - Math.exp(-10.0 * dt);
      this.currentCamPos.lerp(_desiredCamPos, camAlpha);

      this.applyCameraTransform(
        this.currentCamPos,
        _focusPos,
        this.sideSign * THREE.MathUtils.lerp(0.038, 0.0, holdT)
      );

      this.setCameraFovSmooth(
        inUltraSlowMo ? this.savedBaseFov - 14 : this.savedBaseFov - 8,
        7.5,
        dt
      );
      this.vignetteAlpha = THREE.MathUtils.damp(this.vignetteAlpha, 0.92, 6, dt);

      if (holdT >= 1) {
        this.beginReturnPhase();
      }
      return;
    }

    if (this.phase === 'RETURNING') {
      const retT = Math.min(1, this.phaseElapsed / this.config.returnDurationSec);
      const ease = retT * retT * (3 - 2 * retT);

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
  // TRANSIÇÃO RAIO-X: Esqueleto 3D Travado no Ponto de Impacto + Carcaça X-Ray
  // =========================================================================
  private activateBotXRayMode(): void {
    this.xrayApplied = true;
    this.xrayImpactGlow = 0;

    this.playXRayActivateSound();

    if (!this.activeTargetRoot) return;

    // 1. Posiciona e trava o esqueleto único exatamente na âncora calculada para o ponto de impacto
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
      if (node.userData?.hitZone) return;
      if (!node.visible) return;
      const mat = node.material;
      if (!mat) return;
      if (
        !Array.isArray(mat) &&
        (mat.visible === false || (mat.transparent && mat.opacity <= 0.01))
      ) {
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
    // Mantém o esqueleto alinhado e travado na âncora exata do ponto de impacto capturado
    this.skeletonRoot.position.copy(this.lockedSkeletonAnchorPos);
    this.skeletonRoot.rotation.set(0, this.lockedTargetYaw, 0);

    // Somente após a janela de ultra-câmera lenta de travessia óssea, inclina o esqueleto na direção do impacto
    if (fallProgress > 0) {
      const easeFall = 1 - Math.pow(1 - fallProgress, 2.2);
      const localBackX = -Math.sin(this.lockedTargetYaw);
      const localBackZ = -Math.cos(this.lockedTargetYaw);
      const hitDot = _flightDir.x * localBackX + _flightDir.z * localBackZ;
      const fallDirSign = hitDot >= 0 ? -1 : 1;
      this.skeletonRoot.rotation.x = fallDirSign * easeFall * 0.36;
      this.skeletonRoot.position.y -= easeFall * 0.11;
    }
  }

  private updateSkeletonXRayVisuals(dt: number): void {
    // Durante a janela de ultra-câmera lenta (travessia da bala pelo osso), fallProgress = 0
    // para que o esqueleto fique 100% firme no ponto exato onde a bala está perfurando!
    let fallProgress = 0;
    if (
      this.phase === 'IMPACT_HOLD' &&
      this.phaseElapsed > this.config.ultraSlowMoDurationSec
    ) {
      fallProgress = Math.min(
        1,
        (this.phaseElapsed - this.config.ultraSlowMoDurationSec) /
          Math.max(
            0.1,
            this.config.impactHoldSec - this.config.ultraSlowMoDurationSec
          )
      );
    }
    this.syncSkeletonPoseToTarget(fallProgress);

    if (this.xrayImpactGlow > 0) {
      this.xrayImpactGlow = Math.max(0, this.xrayImpactGlow - dt * 1.15);
    }

    const hitRegion: 'HEAD' | 'TORSO' =
      this.activeIsHeadshot || this.activeHitZone === 'HEAD' ? 'HEAD' : 'TORSO';

    for (let i = 0; i < this.skeletonRegionMeshes.length; i++) {
      const entry = this.skeletonRegionMeshes[i];
      if (entry.region === hitRegion && this.xrayImpactGlow > 0.01) {
        const flashWhite = Math.pow(this.xrayImpactGlow, 2.0);
        _tmpColor.copy(BONE_HIT_RED).lerp(BONE_HIT_WHITE, flashWhite * 0.82);
        entry.material.emissive.copy(_tmpColor);
        entry.material.emissiveIntensity = 0.75 + this.xrayImpactGlow * 3.1;
      } else {
        entry.material.emissive.copy(BONE_BASE_EMISSIVE);
        entry.material.emissiveIntensity = 0.45;
      }
    }
  }

  private restoreBotXRayState(): void {
    if (this.activeTargetRoot?.userData) {
      this.activeTargetRoot.userData.bulletCamTargetLocked = false;
      this.activeTargetRoot.userData.bulletCamPenetrationFreeze = false;
    }
    for (let i = 0; i < this.savedBotMaterials.length; i++) {
      const saved = this.savedBotMaterials[i];
      saved.mesh.material = saved.originalMaterial;
    }
    this.savedBotMaterials.length = 0;
    this.skeletonRoot.visible = false;
    this.xrayApplied = false;
    this.xrayImpactGlow = 0;

    for (let i = 0; i < this.skeletonRegionMeshes.length; i++) {
      const entry = this.skeletonRegionMeshes[i];
      entry.material.emissive.copy(BONE_BASE_EMISSIVE);
      entry.material.emissiveIntensity = 0.45;
    }
  }

  // =========================================================================
  // IMPACTO: Ultra-Câmera Lenta (0.07) + Som de Fratura + Osso (10) + Sangue (25)
  // =========================================================================
  private triggerImpactPhase(): void {
    this.phase = 'IMPACT_HOLD';
    this.phaseElapsed = 0;
    this.exitBulletElapsed = 0;
    this.impactShake = this.activeIsHeadshot ? 0.058 : 0.042;

    // Fase B: reduz timeScale imediatamente para ultra-câmera lenta (0.07) no contato com o osso
    this.timeScale = this.config.impactUltraSlowMoTimeScale;

    // Encerra o som contínuo de voo e dispara o som visceral de fratura óssea + impacto
    this.stopFlightTrailSound();
    this.playBoneFractureImpactSound(this.activeIsHeadshot);

    if (!this.xrayApplied) {
      this.activateBotXRayMode();
    }

    if (this.activeTargetRoot?.userData) {
      this.activeTargetRoot.userData.bulletCamPenetrationFreeze = true;
    }

    // Brilho emissivo vermelho/branco máximo na região atingida do esqueleto
    this.xrayImpactGlow = 1.0;

    // Rastro da bala muda para VERMELHO ESCURO ao atravessar o esqueleto e sair pelas costas
    this.setTracerColors(true);

    // Calcula ponto de saída nas costas do bot (~20cm crânio / ~34cm tronco)
    const bodyThickness = this.activeIsHeadshot ? 0.2 : 0.34;
    _exitPos.copy(this.impactPos).addScaledVector(_flightDir, bodyThickness);

    // Dispara pools de estilhaços de osso (10) e partículas de sangue entrada/saída (25)
    this.spawnBoneShards(this.impactPos, _exitPos);
    this.spawnBloodBurst(this.impactPos, _exitPos);

    // Executa abate real no KINETIC (Hit Marker vermelho, killfeed, estado down)
    if (!this.impactTriggered && this.onImpactCallback) {
      this.impactTriggered = true;
      const impactCb = this.onImpactCallback;
      this.onImpactCallback = null;
      impactCb();
    }
  }

  // =========================================================================
  // ÁUDIO MODULAR DA BULLET CAM (.WAV REAIS DE RASTRO E OSSOS QUEBRANDO)
  // =========================================================================
  /**
   * Reproduz o som real do rastro/voo do projétil (`456266__soundfxstudio__grad-bm-21-mlrs.wav`)
   * durante a Fase A (`timeScale = 0.30`), interrompendo limpa e imediatamente ao atingir o osso
   * ou se o jogador acionar Skip.
   */
  private startFlightTrailSound(flightDurationSec: number): void {
    this.stopFlightTrailSound();
    const state = soundEngine.getSpatialAudioState();
    if (state.muted || !state.ctx) return;

    const ctx = state.ctx;
    if (!this.trailAudioBuffer || !this.boneCrackAudioBuffer) {
      void this.ensureAudioBuffersDecoded(ctx);
    }

    const now = ctx.currentTime;
    const dur = Math.max(0.45, Math.min(2.2, flightDurationSec));

    try {
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.68, now + 0.045);
      masterGain.gain.setValueAtTime(0.64, now + dur * 0.82);
      masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.08);
      masterGain.connect(ctx.destination);

      // Caso o buffer WAV real (`bullet_cam_trail.wav`) já esteja decodificado, toca o sample real
      if (this.trailAudioBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.trailAudioBuffer;
        // Leve ajuste de pitch (0.94) para encorpar o rastro em câmera lenta (0.30x)
        src.playbackRate.setValueAtTime(0.94, now);
        src.connect(masterGain);
        src.start(now, 0);
        src.stop(now + dur + 0.1);

        let stopped = false;
        this.activeFlightAudio = {
          stop: () => {
            if (stopped) return;
            stopped = true;
            try {
              const t = ctx.currentTime;
              masterGain.gain.cancelScheduledValues(t);
              masterGain.gain.setValueAtTime(
                Math.max(0.001, masterGain.gain.value),
                t
              );
              masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
              setTimeout(() => {
                try {
                  src.stop();
                } catch {
                  /* ignore */
                }
                try {
                  masterGain.disconnect();
                } catch {
                  /* ignore */
                }
              }, 45);
            } catch {
              /* ignore */
            }
          },
        };
        return;
      }

      // Fallback procedural caso o sample ainda esteja decodificando no 1º disparo
      const whistleOsc = ctx.createOscillator();
      whistleOsc.type = 'triangle';
      whistleOsc.frequency.setValueAtTime(540, now);
      whistleOsc.frequency.linearRampToValueAtTime(980, now + dur * 0.68);
      whistleOsc.frequency.exponentialRampToValueAtTime(410, now + dur);

      const whistleGain = ctx.createGain();
      whistleGain.gain.setValueAtTime(0.18, now);
      whistleGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      whistleOsc.connect(whistleGain);
      whistleGain.connect(masterGain);
      whistleOsc.start(now);
      whistleOsc.stop(now + dur + 0.04);

      let noiseSrc: AudioBufferSourceNode | null = null;
      if (state.noiseBuffer) {
        noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = state.noiseBuffer;
        noiseSrc.loop = true;

        const airFilter = ctx.createBiquadFilter();
        airFilter.type = 'bandpass';
        airFilter.frequency.setValueAtTime(780, now);
        airFilter.frequency.linearRampToValueAtTime(1650, now + dur * 0.72);
        airFilter.Q.setValueAtTime(1.5, now);

        noiseSrc.connect(airFilter);
        airFilter.connect(masterGain);
        noiseSrc.start(now);
        noiseSrc.stop(now + dur + 0.04);
      }

      let stopped = false;
      this.activeFlightAudio = {
        stop: () => {
          if (stopped) return;
          stopped = true;
          try {
            const t = ctx.currentTime;
            masterGain.gain.cancelScheduledValues(t);
            masterGain.gain.setValueAtTime(
              Math.max(0.001, masterGain.gain.value),
              t
            );
            masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
            setTimeout(() => {
              try {
                whistleOsc.stop();
              } catch {
                /* ignore */
              }
              try {
                noiseSrc?.stop();
              } catch {
                /* ignore */
              }
              try {
                masterGain.disconnect();
              } catch {
                /* ignore */
              }
            }, 45);
          } catch {
            /* ignore */
          }
        },
      };
    } catch {
      /* ignore WebAudio errors on restricted devices */
    }
  }

  private stopFlightTrailSound(): void {
    if (this.activeFlightAudio) {
      this.activeFlightAudio.stop();
      this.activeFlightAudio = null;
    }
  }

  /**
   * Pulso sonoro sutil ao ativar a visão Raio-X a 1.25m do alvo.
   */
  private playXRayActivateSound(): void {
    const state = soundEngine.getSpatialAudioState();
    if (state.muted || !state.ctx) return;

    const ctx = state.ctx;
    const now = ctx.currentTime;

    try {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(92, now);
      osc.frequency.exponentialRampToValueAtTime(44, now + 0.16);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch {
      /* ignore */
    }
  }

  /**
   * Reproduz o som real de ossos quebrando com o impacto da bala
   * (`369602__evanboyerman__bone-crunchcrack-3-mixed.wav`) sincronizado no exato
   * milissegundo em que o projétil atinge o esqueleto em ultra-câmera lenta (`timeScale = 0.07`).
   */
  private playBoneFractureImpactSound(isHeadshot: boolean): void {
    const state = soundEngine.getSpatialAudioState();
    if (state.muted || !state.ctx) return;

    const ctx = state.ctx;
    const now = ctx.currentTime;

    try {
      // 1. Sample WAV real de fratura óssea (`bullet_cam_bone_crack.wav`)
      if (this.boneCrackAudioBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.boneCrackAudioBuffer;
        // Em Headshot (crânio), pitch levemente mais incisivo (1.04); em costelas/tronco, 0.96
        src.playbackRate.setValueAtTime(isHeadshot ? 1.04 : 0.96, now);

        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.95, now);

        src.connect(crackGain);
        crackGain.connect(ctx.destination);

        // O arquivo local já teve os 0.135s de silêncio inicial removidos; se vier do fallback bruto do GitHub, pula 0.135s
        const startOffset = this.boneCrackFromGithubFallback ? 0.135 : 0;
        src.start(now, startOffset);
      } else if (state.noiseBuffer) {
        // Fallback procedural imediato caso o buffer ainda não tenha decodificado
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = state.noiseBuffer;
        const crackFilter = ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(isHeadshot ? 2900 : 2200, now);
        crackFilter.Q.setValueAtTime(3.4, now);
        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.45, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        crackSrc.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(ctx.destination);
        crackSrc.start(now);
        crackSrc.stop(now + 0.095);
      }

      // 2. Sub-impacto balístico grave para dar peso físico ao projétil entrando no osso
      const thudOsc = ctx.createOscillator();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(isHeadshot ? 104 : 86, now);
      thudOsc.frequency.exponentialRampToValueAtTime(26, now + 0.22);

      const thudGain = ctx.createGain();
      thudGain.gain.setValueAtTime(0.38, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.25);
    } catch {
      /* ignore */
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
      p.maxAge = 0.78 + Math.random() * 0.55;

      const fromExit = i >= 3;
      p.pos.copy(fromExit ? exitPos : entryPos);
      p.pos.x += (Math.random() - 0.5) * 0.045;
      p.pos.y += (Math.random() - 0.5) * 0.045;
      p.pos.z += (Math.random() - 0.5) * 0.045;

      const forwardSpeed = fromExit
        ? 3.4 + Math.random() * 4.2
        : 1.6 + Math.random() * 2.5;
      const spreadRight = (Math.random() - 0.5) * 2.6;
      const spreadUp = (Math.random() - 0.32) * 2.2;

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
      p.maxAge = 0.58 + Math.random() * 0.5;

      const isEntry = i < entryCount;
      p.pos.copy(isEntry ? entryPos : exitPos);
      p.pos.x += (Math.random() - 0.5) * 0.045;
      p.pos.y += (Math.random() - 0.5) * 0.045;
      p.pos.z += (Math.random() - 0.5) * 0.045;

      if (isEntry) {
        const backSpeed = -(0.8 + Math.random() * 1.9);
        const spreadR = (Math.random() - 0.5) * 2.4;
        const spreadU = (Math.random() - 0.25) * 2.0;
        p.vel
          .copy(_flightDir)
          .multiplyScalar(backSpeed)
          .addScaledVector(_flightRight, spreadR)
          .addScaledVector(_flightUp, spreadU);
        const s = 0.55 + Math.random() * 0.75;
        p.scale.set(s, s, s);
      } else {
        const exitSpeed = 3.0 + Math.random() * 5.2;
        const spreadR = (Math.random() - 0.5) * 2.8;
        const spreadU = (Math.random() - 0.3) * 2.3;
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

    if (this.activeTargetRoot?.userData) {
      this.activeTargetRoot.userData.bulletCamTargetLocked = false;
      this.activeTargetRoot.userData.bulletCamPenetrationFreeze = false;
    }

    if (this.activeYawObject && this.activePitchObject) {
      this.returnStartCamPos.copy(this.activeYawObject.position);
      this.returnStartYaw = this.activeYawObject.rotation.y;
      this.returnStartPitch = this.activePitchObject.rotation.x;
      this.returnStartRoll = this.camera.rotation.z;
      this.returnStartFov = this.camera.fov;
    }
  }

  private finishAndRestoreCamera(): void {
    this.stopFlightTrailSound();
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
