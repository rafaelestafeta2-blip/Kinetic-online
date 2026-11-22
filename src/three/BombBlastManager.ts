import * as THREE from 'three';
import { Dust2TriangleCollider } from './dust2Collider';
import { ColliderBox } from './levelBuilder';
import { YardBotEntity } from './yardPropsBuilder';

/**
 * Obstáculo sólido de cobertura para mitigação/bloqueio da onda de choque do Bomb.
 */
export interface BombCoverObstacle extends ColliderBox {
  isCoverObstacle?: boolean;
}

/**
 * Resultado autoritativo individual por jogador/bot avaliado na detonação do Bomb.
 */
export interface BombBlastVictimVerdict {
  id: string;
  callsign: string;
  team: 'VANGUARD' | 'BLACKTHORN';
  isLocalPlayer: boolean;
  distanceMeters: number;
  inBlastRadius: boolean;
  isBehindCover: boolean;
  lethal: boolean;
  damageApplied: number;
  impulseVel: [number, number, number];
  angularVel: [number, number, number];
}

/**
 * Payload autoritativo do evento `ROUND_END_BOMB_EXPLODED` sincronizado entre servidor e clientes.
 */
export interface BombExplodedAuthorityPayload {
  plantedSite: 'A' | 'B';
  bombPos: [number, number, number];
  lethalRadiusMeters: number;
  victims: BombBlastVictimVerdict[];
  ts: number;
}

/**
 * Telemetria da Zona de Perigo (Danger Zone) para o HUD nos segundos finais do Bomb.
 */
export interface BombDangerZoneHudTelemetry {
  inDangerZone: boolean;
  distanceMeters: number;
  lethalRadiusMeters: number;
  isBehindCover: boolean;
  countdownCritical: boolean;
  c4RemainingSec: number;
  blastCineActive: boolean;
}

export interface BombBlastConfig {
  /** Raio letal amplo da explosão (padrão 22 metros). */
  lethalRadiusMeters: number;
  /** Raio secundário de concussão leve fora da área letal (padrão 29 metros). */
  concussionRadiusMeters: number;
  /** Limiar do timer C4 (segundos) para acionar alerta crítico e anel pulsante no chão (5s a 0s). */
  dangerWarningThresholdSec: number;
  /** Escala de tempo durante a câmera lenta cinematográfica da detonação (0.28 = 28%). */
  slowMoTimeScale: number;
  /** Duração real (segundos) da câmera lenta cinematográfica antes do resumo da rodada (~2.0s). */
  cinematicDurationSec: number;
  /** Altura mínima (m) de um obstáculo para servir como abrigo válido contra a onda de choque. */
  minCoverHeightMeters: number;
  /** Espessura mínima (m) de um obstáculo para bloquear o impacto letal. */
  minCoverThicknessMeters: number;
}

const DEFAULT_CONFIG: BombBlastConfig = {
  lethalRadiusMeters: 22.0,
  concussionRadiusMeters: 29.0,
  dangerWarningThresholdSec: 8.0,
  slowMoTimeScale: 0.28,
  cinematicDurationSec: 2.0,
  minCoverHeightMeters: 0.95,
  minCoverThicknessMeters: 0.28,
};

const FIRE_POOL_SIZE = 28;
const SMOKE_POOL_SIZE = 32;
const DEBRIS_POOL_SIZE = 26;

interface PooledBlastParticle {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  baseScale: number;
  endScale: number;
  gravity: number;
  drag: number;
}

interface ActiveThrownBody {
  bot: YardBotEntity;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  groundY: number;
  active: boolean;
}

// Vetores e matrizes pré-alocados no escopo de módulo (ZERO-GC no loop de 60 FPS)
const _bombOrigin = new THREE.Vector3();
const _targetChest = new THREE.Vector3();
const _targetHead = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _pushDir = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camFocus = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * BombBlastManager
 * ---------------------------------------------------------------------------
 * Gerenciador autoritativo e cinematográfico de detonação do Bomb C4 para KINETIC:
 *
 * 1. Área de Perigo Ampla (`22 metros` de raio letal base) + Anel 3D Pulsante no chão
 *    e telemetria em tempo real para o HUD (indicando se o jogador está EXPOSTO ou EM ABRIGO).
 * 2. Sistema de Cobertura / Abrigo (Line-of-Sight / Cover Check) validando obstáculos sólidos
 *    (`ColliderBox` / `isCoverObstacle` com altura e espessura suficientes + `Dust2TriangleCollider`).
 * 3. Vetor de Impulso Físico (`dir = normalize(playerPos - bombPos)` + `vy` em arco + `angularVelocity`)
 *    que arremessa os corpos atingidos para longe da explosão em câmera lenta.
 * 4. Câmera Lenta Cinematográfica (`timeScale = 0.28` por `2.0s`), câmera elevada/angular com
 *    *camera shake*, abertura dinâmica de FOV, onda de choque expansiva e *Object Pooling*
 *    (`InstancedMesh`) para fogo, fumaça e detritos (Zero-GC no celular).
 * 5. Sincronização autoritativa via payload `ROUND_END_BOMB_EXPLODED`.
 */
export class BombBlastManager {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly weaponRigRoot: THREE.Object3D;
  private readonly config: BombBlastConfig;

  // -------------------------------------------------------------------------
  // 1. Indicador Visual 3D no Chão (Danger Zone Ring 22m)
  // -------------------------------------------------------------------------
  private readonly dangerZoneGroup: THREE.Group;
  private readonly dangerOuterRingMesh: THREE.Mesh;
  private readonly dangerInnerPulseMesh: THREE.Mesh;
  private readonly dangerOuterMat: THREE.MeshBasicMaterial;
  private readonly dangerInnerMat: THREE.MeshBasicMaterial;

  // -------------------------------------------------------------------------
  // 2. Onda de Choque 3D Expansiva (Shockwave Dome + Mach Ring)
  // -------------------------------------------------------------------------
  private readonly shockwaveGroup: THREE.Group;
  private readonly shockwaveRingMesh: THREE.Mesh;
  private readonly shockwaveDomeMesh: THREE.Mesh;
  private readonly fireballCoreMesh: THREE.Mesh;
  private readonly shockwaveRingMat: THREE.MeshBasicMaterial;
  private readonly shockwaveDomeMat: THREE.MeshBasicMaterial;
  private readonly fireballCoreMat: THREE.MeshBasicMaterial;

  // -------------------------------------------------------------------------
  // 3. Object Pools (`InstancedMesh`) para Fogo (28), Fumaça (32) e Detritos (26)
  // -------------------------------------------------------------------------
  private readonly fireInstancedMesh: THREE.InstancedMesh;
  private readonly fireParticles: PooledBlastParticle[] = [];
  private readonly smokeInstancedMesh: THREE.InstancedMesh;
  private readonly smokeParticles: PooledBlastParticle[] = [];
  private readonly debrisInstancedMesh: THREE.InstancedMesh;
  private readonly debrisParticles: PooledBlastParticle[] = [];
  private activeParticleCount = 0;

  private readonly pooledGeometries: THREE.BufferGeometry[] = [];
  private readonly pooledMaterials: THREE.Material[] = [];

  // -------------------------------------------------------------------------
  // 4. Estado da Câmera Cinematográfica, Corpos Arremessados e Telemetria
  // -------------------------------------------------------------------------
  private cineActive = false;
  private cineElapsed = 0;
  private timeScale = 1.0;
  private cameraShake = 0;
  private orbitBaseYaw = 0;
  private readonly activeBombPos = new THREE.Vector3();
  private readonly currentCamPos = new THREE.Vector3();
  private readonly savedYawPos = new THREE.Vector3();
  private savedYaw = 0;
  private savedPitch = 0;
  private savedCamRoll = 0;
  private savedBaseFov = 72;
  private savedWeaponVisible = true;

  private activeYawObject: THREE.Object3D | null = null;
  private activePitchObject: THREE.Object3D | null = null;
  private onCineCompleteCallback: (() => void) | null = null;

  private readonly thrownBodies: ActiveThrownBody[] = [];

  private readonly dangerTelemetry: BombDangerZoneHudTelemetry = {
    inDangerZone: false,
    distanceMeters: 999,
    lethalRadiusMeters: DEFAULT_CONFIG.lethalRadiusMeters,
    isBehindCover: false,
    countdownCritical: false,
    c4RemainingSec: 40,
    blastCineActive: false,
  };

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    weaponRigRoot: THREE.Object3D,
    config?: Partial<BombBlastConfig>
  ) {
    this.scene = scene;
    this.camera = camera;
    this.weaponRigRoot = weaponRigRoot;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dangerTelemetry.lethalRadiusMeters = this.config.lethalRadiusMeters;

    // =======================================================================
    // A. Danger Zone Ring no Chão (22 metros de raio)
    // =======================================================================
    this.dangerZoneGroup = new THREE.Group();
    this.dangerZoneGroup.name = 'PooledBombDangerZoneGroup';
    this.dangerZoneGroup.visible = false;

    const r = this.config.lethalRadiusMeters;
    const outerRingGeo = new THREE.RingGeometry(r - 0.35, r, 48);
    outerRingGeo.rotateX(-Math.PI / 2);
    this.pooledGeometries.push(outerRingGeo);

    this.dangerOuterMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.dangerOuterMat);

    this.dangerOuterRingMesh = new THREE.Mesh(outerRingGeo, this.dangerOuterMat);
    this.dangerOuterRingMesh.position.y = 0.08;
    this.dangerOuterRingMesh.frustumCulled = false;
    this.dangerZoneGroup.add(this.dangerOuterRingMesh);

    const innerPulseGeo = new THREE.RingGeometry(0.4, r, 40);
    innerPulseGeo.rotateX(-Math.PI / 2);
    this.pooledGeometries.push(innerPulseGeo);

    this.dangerInnerMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.dangerInnerMat);

    this.dangerInnerPulseMesh = new THREE.Mesh(innerPulseGeo, this.dangerInnerMat);
    this.dangerInnerPulseMesh.position.y = 0.06;
    this.dangerInnerPulseMesh.frustumCulled = false;
    this.dangerZoneGroup.add(this.dangerInnerPulseMesh);

    this.scene.add(this.dangerZoneGroup);

    // =======================================================================
    // B. Onda de Choque Visual 3D (Anel Supersônico + Domo de Pressão + Núcleo)
    // =======================================================================
    this.shockwaveGroup = new THREE.Group();
    this.shockwaveGroup.name = 'PooledBombShockwaveGroup';
    this.shockwaveGroup.visible = false;

    const swRingGeo = new THREE.RingGeometry(0.72, 1.0, 40);
    swRingGeo.rotateX(-Math.PI / 2);
    this.pooledGeometries.push(swRingGeo);

    this.shockwaveRingMat = new THREE.MeshBasicMaterial({
      color: 0xffedd5,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.shockwaveRingMat);

    this.shockwaveRingMesh = new THREE.Mesh(swRingGeo, this.shockwaveRingMat);
    this.shockwaveRingMesh.position.y = 0.18;
    this.shockwaveRingMesh.frustumCulled = false;
    this.shockwaveGroup.add(this.shockwaveRingMesh);

    const swDomeGeo = new THREE.SphereGeometry(
      1.0,
      24,
      14,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.52
    );
    this.pooledGeometries.push(swDomeGeo);

    this.shockwaveDomeMat = new THREE.MeshBasicMaterial({
      color: 0xfb923c,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.shockwaveDomeMat);

    this.shockwaveDomeMesh = new THREE.Mesh(swDomeGeo, this.shockwaveDomeMat);
    this.shockwaveDomeMesh.frustumCulled = false;
    this.shockwaveGroup.add(this.shockwaveDomeMesh);

    const coreGeo = new THREE.IcosahedronGeometry(1.0, 2);
    this.pooledGeometries.push(coreGeo);

    this.fireballCoreMat = new THREE.MeshBasicMaterial({
      color: 0xfff7ed,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(this.fireballCoreMat);

    this.fireballCoreMesh = new THREE.Mesh(coreGeo, this.fireballCoreMat);
    this.fireballCoreMesh.position.y = 0.65;
    this.fireballCoreMesh.frustumCulled = false;
    this.shockwaveGroup.add(this.fireballCoreMesh);

    this.scene.add(this.shockwaveGroup);

    // =======================================================================
    // C. Pools de Partículas (`InstancedMesh`): Fogo (28), Fumaça (32), Detritos (26)
    // =======================================================================
    const fireGeo = new THREE.DodecahedronGeometry(0.45, 0);
    this.pooledGeometries.push(fireGeo);
    const fireMat = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.pooledMaterials.push(fireMat);

    this.fireInstancedMesh = new THREE.InstancedMesh(fireGeo, fireMat, FIRE_POOL_SIZE);
    this.fireInstancedMesh.frustumCulled = false;
    this.fireInstancedMesh.visible = false;
    for (let i = 0; i < FIRE_POOL_SIZE; i++) {
      this.fireInstancedMesh.setMatrixAt(i, _hiddenMatrix);
      this.fireParticles.push(this.createEmptyParticle(-1.2, 1.8));
    }
    this.fireInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.fireInstancedMesh);

    const smokeGeo = new THREE.IcosahedronGeometry(0.68, 0);
    this.pooledGeometries.push(smokeGeo);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x0f172a,
      emissiveIntensity: 0.25,
      roughness: 0.92,
      metalness: 0.05,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
    });
    this.pooledMaterials.push(smokeMat);

    this.smokeInstancedMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, SMOKE_POOL_SIZE);
    this.smokeInstancedMesh.frustumCulled = false;
    this.smokeInstancedMesh.visible = false;
    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      this.smokeInstancedMesh.setMatrixAt(i, _hiddenMatrix);
      this.smokeParticles.push(this.createEmptyParticle(1.4, 1.4));
    }
    this.smokeInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.smokeInstancedMesh);

    const debrisGeo = new THREE.DodecahedronGeometry(0.11, 0);
    this.pooledGeometries.push(debrisGeo);
    const debrisMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0x7c2d12,
      emissiveIntensity: 0.45,
      roughness: 0.8,
      metalness: 0.2,
    });
    this.pooledMaterials.push(debrisMat);

    this.debrisInstancedMesh = new THREE.InstancedMesh(debrisGeo, debrisMat, DEBRIS_POOL_SIZE);
    this.debrisInstancedMesh.frustumCulled = false;
    this.debrisInstancedMesh.visible = false;
    for (let i = 0; i < DEBRIS_POOL_SIZE; i++) {
      this.debrisInstancedMesh.setMatrixAt(i, _hiddenMatrix);
      this.debrisParticles.push(this.createEmptyParticle(-11.5, 0.35));
    }
    this.debrisInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.debrisInstancedMesh);
  }

  private createEmptyParticle(gravity: number, drag: number): PooledBlastParticle {
    return {
      active: false,
      age: 0,
      maxAge: 1,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      rotVel: new THREE.Vector3(),
      baseScale: 1,
      endScale: 1,
      gravity,
      drag,
    };
  }

  // =========================================================================
  // 1. CHECAGEM DE COBERTURA / ABRIGO (LINE-OF-SIGHT / COVER CHECK)
  // =========================================================================
  /**
   * Verifica se há um obstáculo sólido do mapa (`isCoverObstacle` / parede / container / coluna)
   * com altura e espessura suficientes bloqueando a linha direta entre `bombPos` e o corpo do jogador.
   */
  public isProtectedByCover(
    bombPos: THREE.Vector3,
    targetFeetPos: THREE.Vector3,
    obstacles?: BombCoverObstacle[],
    activeGlbCollider?: Dust2TriangleCollider | null
  ): boolean {
    _bombOrigin.set(bombPos.x, bombPos.y + 0.38, bombPos.z);
    _targetChest.set(targetFeetPos.x, targetFeetPos.y + 1.05, targetFeetPos.z);
    _targetHead.set(targetFeetPos.x, targetFeetPos.y + 1.52, targetFeetPos.z);

    const chestBlocked = this.isSegmentBlockedBySolidCover(
      _bombOrigin,
      _targetChest,
      obstacles,
      activeGlbCollider
    );
    if (!chestBlocked) return false;

    // Para abrigo válido, exige que o tronco esteja protegido e também a cabeça (ou agachado atrás de cobertura)
    const headBlocked = this.isSegmentBlockedBySolidCover(
      _bombOrigin,
      _targetHead,
      obstacles,
      activeGlbCollider
    );
    return chestBlocked && headBlocked;
  }

  private isSegmentBlockedBySolidCover(
    from: THREE.Vector3,
    to: THREE.Vector3,
    obstacles?: BombCoverObstacle[],
    activeGlbCollider?: Dust2TriangleCollider | null
  ): boolean {
    _rayDir.subVectors(to, from);
    const dist = _rayDir.length();
    if (dist < 0.35) return false;
    _rayDir.multiplyScalar(1 / dist);

    // 1. Checagem contra geometria triangular do mapa GLB (paredes, colunas, containers)
    if (activeGlbCollider && activeGlbCollider.ready) {
      const hitDist = activeGlbCollider.raycastDistance(
        from,
        _rayDir,
        Math.max(0.2, dist - 0.28)
      );
      if (hitDist !== null && hitDist > 0.2 && hitDist < dist - 0.25) {
        return true;
      }
    }

    // 2. Checagem contra ColliderBox[] do mapa (filtrando por altura e espessura mínimas de abrigo)
    if (obstacles && obstacles.length > 0) {
      const invX = 1 / (to.x - from.x || 0.000001);
      const invY = 1 / (to.y - from.y || 0.000001);
      const invZ = 1 / (to.z - from.z || 0.000001);

      for (let i = 0; i < obstacles.length; i++) {
        const c = obstacles[i];
        if (c.isCoverObstacle === false) continue;
        const height = c.maxY - c.minY;
        const spanX = c.maxX - c.minX;
        const spanZ = c.maxZ - c.minZ;
        if (
          height < this.config.minCoverHeightMeters ||
          Math.min(spanX, spanZ) < this.config.minCoverThicknessMeters
        ) {
          continue;
        }

        const t1 = (c.minX - from.x) * invX;
        const t2 = (c.maxX - from.x) * invX;
        const t3 = (c.minY - from.y) * invY;
        const t4 = (c.maxY - from.y) * invY;
        const t5 = (c.minZ - from.z) * invZ;
        const t6 = (c.maxZ - from.z) * invZ;
        const tmin = Math.max(
          Math.max(Math.min(t1, t2), Math.min(t3, t4)),
          Math.min(t5, t6)
        );
        const tmax = Math.min(
          Math.min(Math.max(t1, t2), Math.max(t3, t4)),
          Math.max(t5, t6)
        );
        if (tmax >= tmin && tmin >= 0.02 && tmin <= 0.96) {
          return true;
        }
      }
    }

    return false;
  }

  // =========================================================================
  // 2. DANGER ZONE (ANEL DE PERIGO 22M + ALERTA DE PROXIMIDADE NO HUD)
  // =========================================================================
  /**
   * Atualiza o anel de perigo 3D pulsante no chão e calcula a telemetria de risco
   * para o jogador local enquanto o Bomb está plantado.
   */
  public updateDangerZoneWarning(
    rawDt: number,
    isBombPlanted: boolean,
    c4TimerSec: number,
    bombPos: THREE.Vector3,
    playerFeetPos: THREE.Vector3,
    obstacles?: BombCoverObstacle[],
    activeGlbCollider?: Dust2TriangleCollider | null
  ): BombDangerZoneHudTelemetry {
    this.dangerTelemetry.c4RemainingSec = c4TimerSec;
    this.dangerTelemetry.blastCineActive = this.cineActive;

    if (!isBombPlanted || this.cineActive || c4TimerSec <= 0) {
      this.dangerZoneGroup.visible = false;
      this.dangerTelemetry.inDangerZone = false;
      this.dangerTelemetry.countdownCritical = false;
      return this.dangerTelemetry;
    }

    const dist = Math.hypot(
      playerFeetPos.x - bombPos.x,
      playerFeetPos.y - bombPos.y,
      playerFeetPos.z - bombPos.z
    );
    const inRadius = dist <= this.config.lethalRadiusMeters;
    const isCritical = c4TimerSec <= this.config.dangerWarningThresholdSec;
    const sheltered = inRadius
      ? this.isProtectedByCover(bombPos, playerFeetPos, obstacles, activeGlbCollider)
      : true;

    this.dangerTelemetry.distanceMeters = dist;
    this.dangerTelemetry.inDangerZone = inRadius;
    this.dangerTelemetry.isBehindCover = sheltered;
    this.dangerTelemetry.countdownCritical = isCritical;

    // Exibe anel de perigo pulsante no chão nos segundos finais ou quando o jogador está dentro do raio de 22m
    const showRing = inRadius || c4TimerSec <= 10.0;
    this.dangerZoneGroup.visible = showRing;
    if (showRing) {
      this.dangerZoneGroup.position.set(bombPos.x, bombPos.y + 0.03, bombPos.z);
      const urgencyFreq = c4TimerSec <= 5 ? 14.0 : 6.5;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.001 * urgencyFreq);

      // Muda cor do anel para ciano/verde se o jogador estiver protegido atrás de cobertura, ou vermelho/laranja se exposto!
      if (inRadius && sheltered) {
        this.dangerOuterMat.color.setHex(0x38bdf8);
        this.dangerInnerMat.color.setHex(0x0284c7);
      } else {
        this.dangerOuterMat.color.setHex(0xef4444);
        this.dangerInnerMat.color.setHex(0xf97316);
      }

      this.dangerOuterMat.opacity = 0.45 + pulse * 0.45;
      this.dangerInnerMat.opacity = (isCritical ? 0.14 : 0.06) + pulse * 0.14;
      const innerScale = 0.25 + ((performance.now() * 0.001 * (c4TimerSec <= 5 ? 1.35 : 0.65)) % 0.75);
      this.dangerInnerPulseMesh.scale.set(innerScale, 1, innerScale);
      void rawDt;
    }

    return this.dangerTelemetry;
  }

  // =========================================================================
  // 3. DETONAÇÃO AUTORITATIVA + VETOR DE IMPULSO + CÂMERA LENTA (`onBombDetonate`)
  // =========================================================================
  /**
   * Calcula autoritativamente quem morreu ou sobreviveu atrás de cobertura na explosão,
   * calcula os vetores de impulso (`dir = normalize(playerPos - bombPos)` + `vy` em arco),
   * inicia a onda de choque + câmera lenta (`timeScale = 0.28`) e retorna o payload `ROUND_END_BOMB_EXPLODED`.
   */
  public onBombDetonate(params: {
    plantedSite: 'A' | 'B';
    bombPos: THREE.Vector3;
    localPlayerPos: THREE.Vector3;
    localPlayerAlive: boolean;
    localPlayerCallsign: string;
    localPlayerTeam: 'VANGUARD' | 'BLACKTHORN';
    bots: YardBotEntity[];
    obstacles?: BombCoverObstacle[];
    activeGlbCollider?: Dust2TriangleCollider | null;
    yawObject: THREE.Object3D;
    pitchObject: THREE.Object3D;
    baseFov: number;
    getGroundHeight?: (x: number, y: number, z: number) => number;
    onApplyLocalPlayerBlastResult?: (verdict: BombBlastVictimVerdict) => void;
    onRegisterBlastKill?: (victimCallsign: string, victimTeam: 'VANGUARD' | 'BLACKTHORN') => void;
    onComplete?: () => void;
    /** Quando fornecido por evento de rede autoritativo, aplica os vereditos validados sem recalcular divergências. */
    authoritativePayload?: BombExplodedAuthorityPayload | null;
  }): BombExplodedAuthorityPayload {
    this.dangerZoneGroup.visible = false;
    this.activeBombPos.copy(params.bombPos);

    const victims: BombBlastVictimVerdict[] = [];
    this.thrownBodies.length = 0;

    // 1. Avalia Jogador Local
    if (params.localPlayerAlive) {
      const preValidated = params.authoritativePayload?.victims.find((v) => v.isLocalPlayer);
      const localVerdict =
        preValidated ||
        this.evaluateEntityBlastVerdict(
          'LOCAL_PLAYER',
          params.localPlayerCallsign,
          params.localPlayerTeam,
          true,
          params.bombPos,
          params.localPlayerPos,
          params.obstacles,
          params.activeGlbCollider
        );
      victims.push(localVerdict);
      params.onApplyLocalPlayerBlastResult?.(localVerdict);
      if (localVerdict.lethal) {
        params.onRegisterBlastKill?.(localVerdict.callsign, localVerdict.team);
      }
    }

    // 2. Avalia todos os Bots / Operadores vivos no mapa e aplica arremesso físico nos eliminados
    for (let i = 0; i < params.bots.length; i++) {
      const bot = params.bots[i];
      if (!bot || bot.isDown || !bot.root.visible) continue;

      const botTeam: 'VANGUARD' | 'BLACKTHORN' = bot.isAlly ? 'VANGUARD' : 'BLACKTHORN';
      const preValidated = params.authoritativePayload?.victims.find(
        (v) => v.id === bot.id || v.callsign === bot.callsign
      );
      const verdict =
        preValidated ||
        this.evaluateEntityBlastVerdict(
          bot.id,
          bot.callsign || `OP-${i + 1}`,
          botTeam,
          false,
          params.bombPos,
          bot.root.position,
          params.obstacles,
          params.activeGlbCollider
        );

      victims.push(verdict);

      if (verdict.lethal) {
        bot.health = 0;
        bot.isDown = true;
        bot.downTimer = 9999;
        bot.isTelegraphing = false;
        if (bot.laserLine) bot.laserLine.visible = false;
        params.onRegisterBlastKill?.(verdict.callsign, verdict.team);

        // Registra corpo para arremesso físico em arco durante a câmera lenta
        const groundY = params.getGroundHeight
          ? params.getGroundHeight(
              bot.root.position.x,
              bot.root.position.y + 0.4,
              bot.root.position.z
            )
          : bot.root.position.y;

        bot.root.userData = bot.root.userData || {};
        bot.root.userData.bombBlastThrown = true;
        this.thrownBodies.push({
          bot,
          pos: bot.root.position.clone(),
          vel: new THREE.Vector3(
            verdict.impulseVel[0],
            verdict.impulseVel[1],
            verdict.impulseVel[2]
          ),
          angVel: new THREE.Vector3(
            verdict.angularVel[0],
            verdict.angularVel[1],
            verdict.angularVel[2]
          ),
          groundY: Number.isFinite(groundY) ? groundY : bot.root.position.y,
          active: true,
        });
      } else if (verdict.damageApplied > 0) {
        bot.health = Math.max(1, bot.health - verdict.damageApplied);
        bot.hitTiltVelocity = -14.0;
      }
    }

    // 3. Dispara Onda de Choque Visual + Pools de Fogo, Fumaça e Detritos
    this.spawnBlastShockwaveAndParticles(params.bombPos);

    // 4. Inicia Câmera Lenta Cinematográfica Elevada/Angular sobre a zona do Bomb
    this.startCinematicCamera(
      params.bombPos,
      params.localPlayerPos,
      params.yawObject,
      params.pitchObject,
      params.baseFov,
      params.onComplete
    );

    return {
      plantedSite: params.plantedSite,
      bombPos: [params.bombPos.x, params.bombPos.y, params.bombPos.z],
      lethalRadiusMeters: this.config.lethalRadiusMeters,
      victims,
      ts: Date.now(),
    };
  }

  private evaluateEntityBlastVerdict(
    id: string,
    callsign: string,
    team: 'VANGUARD' | 'BLACKTHORN',
    isLocalPlayer: boolean,
    bombPos: THREE.Vector3,
    entityPos: THREE.Vector3,
    obstacles?: BombCoverObstacle[],
    activeGlbCollider?: Dust2TriangleCollider | null
  ): BombBlastVictimVerdict {
    const dx = entityPos.x - bombPos.x;
    const dy = entityPos.y - bombPos.y;
    const dz = entityPos.z - bombPos.z;
    const dist = Math.hypot(dx, dy, dz);

    const inBlastRadius = dist <= this.config.lethalRadiusMeters;
    const inConcussionRadius = dist <= this.config.concussionRadiusMeters;
    const isBehindCover = inConcussionRadius
      ? this.isProtectedByCover(bombPos, entityPos, obstacles, activeGlbCollider)
      : true;

    // Regra Autoritativa:
    // - Exposto dentro do raio de 22m sem cobertura sólida -> Dano Fatal (100% / eliminação) + Arremesso.
    // - Abrigado atrás de cobertura sólida dentro do raio -> Sobrevive! (sofrendo apenas concussão leve se muito próximo < 7.5m).
    // - Fora do raio de 22m -> Sobrevive!
    const lethal = inBlastRadius && !isBehindCover;
    let damageApplied = 0;
    if (lethal) {
      damageApplied = 100;
    } else if (inBlastRadius && isBehindCover && dist < 8.5) {
      // Onda de sobrepressão atenuada pela cobertura sólida (nunca letal)
      damageApplied = Math.round(
        THREE.MathUtils.lerp(38, 10, dist / 8.5)
      );
    } else if (!inBlastRadius && inConcussionRadius && !isBehindCover) {
      damageApplied = Math.round(
        THREE.MathUtils.lerp(
          35,
          5,
          (dist - this.config.lethalRadiusMeters) /
            Math.max(1, this.config.concussionRadiusMeters - this.config.lethalRadiusMeters)
        )
      );
    }

    // Vetor de Impulso (Arremesso dos Atingidos): dir = normalize(playerPos - bombPos)
    const horizLen = Math.hypot(dx, dz);
    if (horizLen > 0.001) {
      _pushDir.set(dx / horizLen, 0, dz / horizLen);
    } else {
      _pushDir.set(0, 0, 1);
    }

    const proximityFactor = THREE.MathUtils.clamp(
      1 - dist / (this.config.lethalRadiusMeters * 1.1),
      0.28,
      1.0
    );
    const horizSpeed = lethal ? THREE.MathUtils.lerp(7.5, 16.5, proximityFactor) : 0;
    const vertSpeed = lethal ? THREE.MathUtils.lerp(4.2, 8.4, proximityFactor) : 0;

    const impulseVel: [number, number, number] = [
      Number((_pushDir.x * horizSpeed).toFixed(2)),
      Number(vertSpeed.toFixed(2)),
      Number((_pushDir.z * horizSpeed).toFixed(2)),
    ];
    const angularVel: [number, number, number] = lethal
      ? [
          Number((-_pushDir.z * (3.2 + proximityFactor * 2.8)).toFixed(2)),
          Number(((id.charCodeAt(0) % 2 === 0 ? 1 : -1) * 2.4).toFixed(2)),
          Number((_pushDir.x * (3.2 + proximityFactor * 2.8)).toFixed(2)),
        ]
      : [0, 0, 0];

    return {
      id,
      callsign,
      team,
      isLocalPlayer,
      distanceMeters: Number(dist.toFixed(2)),
      inBlastRadius,
      isBehindCover,
      lethal,
      damageApplied,
      impulseVel,
      angularVel,
    };
  }

  private spawnBlastShockwaveAndParticles(bombPos: THREE.Vector3): void {
    this.shockwaveGroup.position.copy(bombPos);
    this.shockwaveGroup.visible = true;
    this.shockwaveRingMesh.scale.setScalar(0.5);
    this.shockwaveDomeMesh.scale.setScalar(0.5);
    this.fireballCoreMesh.scale.setScalar(0.8);
    this.shockwaveRingMat.opacity = 0.92;
    this.shockwaveDomeMat.opacity = 0.45;
    this.fireballCoreMat.opacity = 0.98;

    // 1. Pool de Fogo (28)
    for (let i = 0; i < FIRE_POOL_SIZE; i++) {
      const p = this.fireParticles[i];
      p.active = true;
      p.age = 0;
      p.maxAge = 0.55 + Math.random() * 0.65;
      p.pos.set(
        bombPos.x + (Math.random() - 0.5) * 1.4,
        bombPos.y + 0.25 + Math.random() * 0.8,
        bombPos.z + (Math.random() - 0.5) * 1.4
      );
      const ang = Math.random() * Math.PI * 2;
      const spd = 4.5 + Math.random() * 11.5;
      p.vel.set(Math.cos(ang) * spd, 3.2 + Math.random() * 7.5, Math.sin(ang) * spd);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );
      p.baseScale = 0.85 + Math.random() * 1.35;
      p.endScale = p.baseScale * 2.3;
    }
    this.fireInstancedMesh.visible = true;

    // 2. Pool de Fumaça Densa (32)
    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      const p = this.smokeParticles[i];
      p.active = true;
      p.age = 0;
      p.maxAge = 1.15 + Math.random() * 0.95;
      p.pos.set(
        bombPos.x + (Math.random() - 0.5) * 2.2,
        bombPos.y + 0.35 + Math.random() * 1.2,
        bombPos.z + (Math.random() - 0.5) * 2.2
      );
      const ang = Math.random() * Math.PI * 2;
      const spd = 3.0 + Math.random() * 9.5;
      p.vel.set(Math.cos(ang) * spd, 2.2 + Math.random() * 5.8, Math.sin(ang) * spd);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4
      );
      p.baseScale = 1.1 + Math.random() * 1.5;
      p.endScale = p.baseScale * 2.9;
    }
    this.smokeInstancedMesh.visible = true;

    // 3. Pool de Detritos Balísticos (26)
    for (let i = 0; i < DEBRIS_POOL_SIZE; i++) {
      const p = this.debrisParticles[i];
      p.active = true;
      p.age = 0;
      p.maxAge = 1.1 + Math.random() * 0.85;
      p.pos.set(
        bombPos.x + (Math.random() - 0.5) * 0.9,
        bombPos.y + 0.2 + Math.random() * 0.5,
        bombPos.z + (Math.random() - 0.5) * 0.9
      );
      const ang = Math.random() * Math.PI * 2;
      const spd = 8.0 + Math.random() * 15.5;
      p.vel.set(Math.cos(ang) * spd, 5.5 + Math.random() * 10.5, Math.sin(ang) * spd);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18
      );
      p.baseScale = 0.8 + Math.random() * 1.4;
      p.endScale = p.baseScale * 0.35;
    }
    this.debrisInstancedMesh.visible = true;
    this.activeParticleCount = FIRE_POOL_SIZE + SMOKE_POOL_SIZE + DEBRIS_POOL_SIZE;
  }

  private startCinematicCamera(
    bombPos: THREE.Vector3,
    localPlayerPos: THREE.Vector3,
    yawObject: THREE.Object3D,
    pitchObject: THREE.Object3D,
    baseFov: number,
    onComplete?: () => void
  ): void {
    this.cineActive = true;
    this.cineElapsed = 0;
    this.timeScale = this.config.slowMoTimeScale;
    this.cameraShake = 0.22;
    this.dangerTelemetry.blastCineActive = true;

    this.activeYawObject = yawObject;
    this.activePitchObject = pitchObject;
    this.onCineCompleteCallback = onComplete || null;

    this.savedYawPos.copy(yawObject.position);
    this.savedYaw = yawObject.rotation.y;
    this.savedPitch = pitchObject.rotation.x;
    this.savedCamRoll = this.camera.rotation.z;
    this.savedBaseFov = baseFov;
    this.savedWeaponVisible = this.weaponRigRoot.visible;

    this.weaponRigRoot.visible = false;

    // Orienta a câmera elevada/angular a partir da direção entre o Bomb e o jogador/corpos arremessados
    const dx = localPlayerPos.x - bombPos.x;
    const dz = localPlayerPos.z - bombPos.z;
    this.orbitBaseYaw =
      Math.hypot(dx, dz) > 0.5 ? Math.atan2(dx, dz) : this.savedYaw;
    this.currentCamPos.copy(this.savedYawPos);
  }

  // =========================================================================
  // 4. UPDATE NO GAME LOOP (`rawDt` para câmera 60 FPS + `simDt` para slow-mo)
  // =========================================================================
  public update(
    rawDt: number,
    activeGlbCollider?: Dust2TriangleCollider | null,
    getGroundHeight?: (x: number, y: number, z: number) => number
  ): void {
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    const simDt = dt * this.timeScale;

    if (this.activeParticleCount > 0) {
      this.updateBlastParticlePools(simDt);
    }

    if (!this.cineActive || !this.activeYawObject || !this.activePitchObject) {
      return;
    }

    this.cineElapsed += dt;
    const progress = Math.min(1, this.cineElapsed / this.config.cinematicDurationSec);

    // 1. Atualiza Onda de Choque 3D Expansiva até 22 metros
    if (this.shockwaveGroup.visible) {
      const waveT = Math.min(1, this.cineElapsed / 1.15);
      const easeOut = 1 - Math.pow(1 - waveT, 2.4);
      const ringRadius = THREE.MathUtils.lerp(0.6, this.config.lethalRadiusMeters, easeOut);
      this.shockwaveRingMesh.scale.setScalar(ringRadius);
      this.shockwaveRingMat.opacity = Math.max(0, (1 - waveT) * 0.9);

      const domeRadius = THREE.MathUtils.lerp(0.5, this.config.lethalRadiusMeters * 0.78, easeOut);
      this.shockwaveDomeMesh.scale.setScalar(domeRadius);
      this.shockwaveDomeMat.opacity = Math.max(0, (1 - waveT) * 0.42);

      const coreScale = THREE.MathUtils.lerp(1.2, 5.8, Math.min(1, this.cineElapsed / 0.55));
      this.fireballCoreMesh.scale.setScalar(coreScale);
      this.fireballCoreMat.opacity = Math.max(0, 1 - this.cineElapsed / 0.65);

      if (waveT >= 1) {
        this.shockwaveGroup.visible = false;
      }
    }

    // 2. Atualiza Física em Câmera Lenta dos Corpos Arremessados pela Onda de Choque
    for (let i = 0; i < this.thrownBodies.length; i++) {
      const body = this.thrownBodies[i];
      if (!body.active) continue;

      body.vel.x *= Math.max(0.2, 1 - 0.85 * simDt);
      body.vel.z *= Math.max(0.2, 1 - 0.85 * simDt);
      body.vel.y -= 13.5 * simDt;

      body.pos.addScaledVector(body.vel, simDt);

      if (getGroundHeight) {
        const gY = getGroundHeight(body.pos.x, body.pos.y + 0.6, body.pos.z);
        if (Number.isFinite(gY)) body.groundY = gY;
      }

      if (body.pos.y <= body.groundY) {
        body.pos.y = body.groundY;
        body.vel.y = 0;
        body.vel.x *= 0.45;
        body.vel.z *= 0.45;
        body.angVel.multiplyScalar(0.5);
      }

      body.bot.root.position.copy(body.pos);
      if (body.bot.pivotGroup) {
        body.bot.pivotGroup.rotation.x = THREE.MathUtils.clamp(
          body.bot.pivotGroup.rotation.x + body.angVel.x * simDt,
          -Math.PI * 0.48,
          Math.PI * 0.48
        );
        body.bot.pivotGroup.rotation.z = THREE.MathUtils.clamp(
          body.bot.pivotGroup.rotation.z + body.angVel.z * simDt,
          -Math.PI * 0.48,
          Math.PI * 0.48
        );
      }
    }

    // 3. Posicionamento Cinematográfico Elevado/Angular com Camera Shake e FOV Dinâmico
    const orbitAngle = this.orbitBaseYaw + 0.35 + progress * 0.55;
    const camDist = THREE.MathUtils.lerp(6.8, 12.8, progress);
    const camHeight = THREE.MathUtils.lerp(3.6, 5.8, progress);

    _camFocus.set(
      this.activeBombPos.x,
      this.activeBombPos.y + THREE.MathUtils.lerp(1.2, 1.85, progress),
      this.activeBombPos.z
    );

    // Se houver corpos arremessados, desloca suavemente 25% do foco para enquadrá-los voando
    if (this.thrownBodies.length > 0) {
      const firstThrown = this.thrownBodies[0];
      _camFocus.lerp(firstThrown.pos, 0.25);
      _camFocus.y = Math.max(this.activeBombPos.y + 1.1, _camFocus.y + 0.8);
    }

    _camDesired.set(
      this.activeBombPos.x + Math.sin(orbitAngle) * camDist,
      this.activeBombPos.y + camHeight,
      this.activeBombPos.z + Math.cos(orbitAngle) * camDist
    );

    // Evita atravessar paredes do mapa GLB durante a órbita
    if (activeGlbCollider && activeGlbCollider.ready) {
      _rayDir.subVectors(_camDesired, _camFocus);
      const fullDist = _rayDir.length();
      if (fullDist > 0.2) {
        _rayDir.multiplyScalar(1 / fullDist);
        const hitDist = activeGlbCollider.raycastDistance(_camFocus, _rayDir, fullDist);
        if (hitDist !== null && hitDist < fullDist) {
          _camDesired.copy(_camFocus).addScaledVector(_rayDir, Math.max(1.2, hitDist - 0.35));
        }
      }
    }

    if (this.cameraShake > 0.001) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 0.22);
      _camDesired.x += (Math.random() - 0.5) * this.cameraShake;
      _camDesired.y += (Math.random() - 0.5) * this.cameraShake;
      _camDesired.z += (Math.random() - 0.5) * this.cameraShake;
    }

    const camAlpha = 1 - Math.exp(-7.5 * dt);
    this.currentCamPos.lerp(_camDesired, camAlpha);
    this.activeYawObject.position.copy(this.currentCamPos);

    const dx = _camFocus.x - this.currentCamPos.x;
    const dy = _camFocus.y - this.currentCamPos.y;
    const dz = _camFocus.z - this.currentCamPos.z;
    const horizDist = Math.hypot(dx, dz) || 0.001;

    this.activeYawObject.rotation.y = Math.atan2(-dx, -dz);
    this.activePitchObject.rotation.x = THREE.MathUtils.clamp(
      Math.atan2(dy, horizDist),
      -Math.PI * 0.44,
      Math.PI * 0.44
    );
    this.camera.rotation.z = Math.sin(progress * Math.PI) * 0.045;

    // Leve abertura de FOV (de 72° para ~83°) para enfatizar a escala da onda de choque
    const targetFov =
      progress < 0.75
        ? this.savedBaseFov + 11
        : THREE.MathUtils.lerp(this.savedBaseFov + 11, this.savedBaseFov, (progress - 0.75) / 0.25);
    const nextFov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt);
    if (Math.abs(nextFov - this.camera.fov) > 0.02) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    // Nos últimos 20% da sequência, restaura timeScale gradualmente de 0.28 -> 1.0
    if (progress > 0.8) {
      const restoreT = (progress - 0.8) / 0.2;
      this.timeScale = THREE.MathUtils.lerp(this.config.slowMoTimeScale, 1.0, restoreT);
    } else {
      this.timeScale = this.config.slowMoTimeScale;
    }

    if (progress >= 1) {
      this.finishCinematicAndRestore();
    }
  }

  private updateBlastParticlePools(simDt: number): void {
    let alive = 0;

    alive += this.stepInstancedPool(this.fireParticles, this.fireInstancedMesh, simDt);
    alive += this.stepInstancedPool(this.smokeParticles, this.smokeInstancedMesh, simDt);
    alive += this.stepInstancedPool(this.debrisParticles, this.debrisInstancedMesh, simDt);

    this.activeParticleCount = alive;
    if (alive === 0) {
      this.fireInstancedMesh.visible = false;
      this.smokeInstancedMesh.visible = false;
      this.debrisInstancedMesh.visible = false;
    }
  }

  private stepInstancedPool(
    pool: PooledBlastParticle[],
    mesh: THREE.InstancedMesh,
    simDt: number
  ): number {
    let alive = 0;
    let dirty = false;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.active) continue;
      dirty = true;
      p.age += simDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        mesh.setMatrixAt(i, _hiddenMatrix);
        continue;
      }
      alive++;
      const t = p.age / p.maxAge;
      const dragFactor = Math.max(0.15, 1 - p.drag * simDt);
      p.vel.multiplyScalar(dragFactor);
      p.vel.y += p.gravity * simDt;
      p.pos.addScaledVector(p.vel, simDt);

      p.rot.x += p.rotVel.x * simDt;
      p.rot.y += p.rotVel.y * simDt;
      p.rot.z += p.rotVel.z * simDt;

      const s = THREE.MathUtils.lerp(p.baseScale, p.endScale, t) * (1 - Math.pow(t, 3));
      _dummyObj.position.copy(p.pos);
      _dummyObj.rotation.copy(p.rot);
      _dummyObj.scale.setScalar(Math.max(0.01, s));
      _dummyObj.updateMatrix();
      mesh.setMatrixAt(i, _dummyObj.matrix);
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    return alive;
  }

  private finishCinematicAndRestore(): void {
    this.cineActive = false;
    this.cineElapsed = 0;
    this.timeScale = 1.0;
    this.cameraShake = 0;
    this.shockwaveGroup.visible = false;
    this.dangerTelemetry.blastCineActive = false;

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
    this.weaponRigRoot.visible = this.savedWeaponVisible;

    const completeCb = this.onCineCompleteCallback;
    this.onCineCompleteCallback = null;
    this.activeYawObject = null;
    this.activePitchObject = null;
    completeCb?.();
  }

  public isActive(): boolean {
    return this.cineActive;
  }

  public getTimeScale(): number {
    return this.timeScale;
  }

  public getDangerZoneTelemetry(): BombDangerZoneHudTelemetry {
    return this.dangerTelemetry;
  }

  public reset(): void {
    for (let i = 0; i < this.thrownBodies.length; i++) {
      const b = this.thrownBodies[i].bot;
      if (b?.root?.userData) {
        b.root.userData.bombBlastThrown = false;
      }
      if (b?.pivotGroup) {
        b.pivotGroup.rotation.x = 0;
        b.pivotGroup.rotation.z = 0;
      }
    }
    this.thrownBodies.length = 0;
    this.dangerZoneGroup.visible = false;
    this.shockwaveGroup.visible = false;

    for (let i = 0; i < FIRE_POOL_SIZE; i++) {
      this.fireParticles[i].active = false;
      this.fireInstancedMesh.setMatrixAt(i, _hiddenMatrix);
    }
    this.fireInstancedMesh.instanceMatrix.needsUpdate = true;
    this.fireInstancedMesh.visible = false;

    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      this.smokeParticles[i].active = false;
      this.smokeInstancedMesh.setMatrixAt(i, _hiddenMatrix);
    }
    this.smokeInstancedMesh.instanceMatrix.needsUpdate = true;
    this.smokeInstancedMesh.visible = false;

    for (let i = 0; i < DEBRIS_POOL_SIZE; i++) {
      this.debrisParticles[i].active = false;
      this.debrisInstancedMesh.setMatrixAt(i, _hiddenMatrix);
    }
    this.debrisInstancedMesh.instanceMatrix.needsUpdate = true;
    this.debrisInstancedMesh.visible = false;
    this.activeParticleCount = 0;

    if (this.cineActive) {
      this.onCineCompleteCallback = null;
      this.finishCinematicAndRestore();
    } else {
      this.timeScale = 1.0;
      this.dangerTelemetry.inDangerZone = false;
      this.dangerTelemetry.blastCineActive = false;
    }
  }

  public dispose(): void {
    this.reset();
    this.scene.remove(this.dangerZoneGroup);
    this.scene.remove(this.shockwaveGroup);
    this.scene.remove(this.fireInstancedMesh);
    this.scene.remove(this.smokeInstancedMesh);
    this.scene.remove(this.debrisInstancedMesh);

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
