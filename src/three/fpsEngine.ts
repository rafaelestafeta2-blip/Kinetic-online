import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  playRealPlayerHitGrunt,
  preloadCharacterAndBombAudio,
  stopMatchEndFanfare,
  updatePlayerSprintPantingAudio,
} from '../audio/characterAndBombAudio';
import { soundEngine } from '../audio/soundEngine';
import {
  playBulletSnapAndWhizz,
  playSpatialBotGunshot,
  updateSpatialBotFootstepsAndHeartbeat,
} from '../audio/spatialCombatAudio';
import {
  detectSurfaceMaterialFromMesh,
  playMaterialImpact3D,
  playShellCasingDrop3D,
  triggerShellshockTinnitus,
  triggerTacticalRadioCallout,
} from '../audio/tacticalImmersionAudio';
import { mobileHardware } from '../mobile/nativeHardware';
import {
  BallisticShotTelemetry,
  DrillMode,
  FireMode,
  GameScreenState,
  GrenadeType,
  GyroMode,
  HudState,
  KillfeedEntry,
  OpticType,
  QualityPreset,
  TacticalScorestreakId,
  WeaponId,
} from '../types/game';
import {
  addPlayerCash,
  getNextRank,
  getRankForXp,
  loadSavedPlayerXp,
  savePlayerXp,
} from '../progression/ranks';
import { canGrantMatchProgressionRewards } from '../progression/matchProgressionGate';
import { computeEffectiveMagCapacity } from '../progression/gunsmithSystem';
import {
  equipWeaponOptic,
  getClassCombatModifiers,
  getEquippedWeaponOptic,
  getEquippedWeaponSkinId,
  getWeaponGunsmithModifiers,
  isOpticCompatibleWithWeapon,
  subscribePlayerInventory,
  syncEquippedWeaponToInventory,
} from '../progression/loadoutSystem';
import { BallisticsFXPool } from './ballisticsPool';
import { TacticalGrenadeSystem } from './grenadeSystem';
import {
  buildPreProductionLevel,
  ColliderBox,
  TacticalLevelData,
  TacticalTargetEntity,
} from './levelBuilder';
import { createProceduralTextures, ProceduralTextures } from './textures';
import {
  buildTacticalWeaponRig,
  getOpticAdsTransform,
  TacticalWeaponRig,
} from './weaponBuilder';
import { isMobileGpuTarget, warmSubtreeOnGpu } from './gpuBudget';
import { runtimeTelemetry } from '../telemetry/runtimeTelemetry';
import { AssetPreloader } from './preloader';
import { buildYardLevel } from './yardLevelBuilder';
import { YardBombSystem } from './yardBombSystem';
import { YARD_ATTACKER_SPAWN } from './yardMapData';
import { YardBotEntity } from './yardPropsBuilder';
import {
  ASSAULT_ATTACKER_SPAWN,
  ASSAULT_SPAWN_YAW,
  buildAssaultLevel,
  loadAssaultMapGeometry,
} from './assaultLevelBuilder';
import {
  INDUSTRIA_ATTACKER_SPAWN,
  INDUSTRIA_SPAWN_YAW,
  buildIndustriaLevel,
  loadIndustriaMapGeometry,
} from './industriaLevelBuilder';
import {
  HANGAR_ATTACKER_SPAWN,
  HANGAR_SPAWN_YAW,
  buildHangarLevel,
  loadHangarMapGeometry,
} from './hangarLevelBuilder';
import {
  EASTERN_CITY_ATTACKER_SPAWN,
  EASTERN_CITY_SPAWN_YAW,
  buildEasternCityLevel,
  loadEasternCityMapGeometry,
} from './easternCityLevelBuilder';
import {
  MIRAGE_ANUBIS_ATTACKER_SPAWN,
  MIRAGE_ANUBIS_SPAWN_YAW,
  buildMirageAnubisLevel,
  loadMirageAnubisMapGeometry,
} from './mirageAnubisLevelBuilder';
import {
  V23_MAP_CONFIGS,
  V23BombMapMode,
  buildV23MapLevel,
  isV23BombMapMode,
  loadV23MapGeometry,
} from './v23MapsLevelBuilder';
import {
  STATION_ARENA_ATTACKER_SPAWN,
  STATION_ARENA_SPAWN_YAW,
  buildStationArenaLevel,
  loadStationArenaMapGeometry,
  setStationCaptureBeaconsVisible,
} from './stationArenaLevelBuilder';
import {
  buildDust2Level,
  Dust2LevelBundle,
  DUST2_T_SPAWN,
  DUST2_T_SPAWN_YAW,
  loadDust2MapGeometry,
} from './dust2LevelBuilder';
import type { Dust2TriangleCollider } from './dust2Collider';
import { attachCompressedTextureSupport } from './gltfLoaderFactory';
import {
  cleanupMatchArenaAssets,
  prepareMatchArena,
} from './matchAssetManager';
import {
  setBotEnemyOutline,
  triggerBotFireAnimation,
  triggerBotGrenadeAnimation,
  triggerBotHitAnimation,
  updateAllBotCharacters,
} from './botCharacterSystem';
import { PlayerDeathThirdPersonController } from './playerDeathThirdPerson';
import { PostMatchShowcase3D } from './postMatchShowcase3D';
import {
  BulletCamGameMode,
  BulletCamHitZone,
  XRayBulletCamManager,
} from './XRayBulletCamManager';
import {
  BombBlastManager,
  BombExplodedAuthorityPayload,
} from './BombBlastManager';
import {
  evaluateGrenadeTwoRadiusVerdict,
  GRENADE_CONCUSSION_RADIUS_M,
  GRENADE_LETHAL_RADIUS_M,
  ShellshockEffectController,
} from './ShellshockEffectController';
import { GrenadeKillCam } from './GrenadeKillCam';
import { GrenadeThrowerInfo } from './grenadeSystem';
import { getPlayerCallsign } from '../firebase/playerCloudSync';
import {
  buildStanderTiroLevel,
  loadStanderTiroMapGeometry,
  STANDER_TIRO_SPAWN,
  STANDER_TIRO_SPAWN_YAW,
  StanderTiroBundle,
} from './standerTiroBuilder';
import { TacticalSkySystem } from './skySystem';
import {
  countOtherHumanPlayersInRoom,
  getActiveOnlineRoom,
  getLocalOnlinePlayerState,
  isOnlineMatchActive,
  isPrivateRoomWithBotsActive,
  leaveActiveRoom,
  publishBombStateChange,
  publishCombatHit,
  publishGrenadeDetonation,
  publishGrenadeThrow,
  publishRoundEvent,
  publishScorestreakEvent,
  resetLocalOnlinePlayerForNextRound,
  subscribeOnlineBombEvents,
  subscribeOnlineClassSupport,
  subscribeOnlineGrenadeDetonations,
  subscribeOnlineGrenadeEvents,
  subscribeOnlineHitEvents,
  subscribeOnlineRoundEvents,
  subscribeOnlineScorestreakEvents,
} from '../multiplayer/onlineRoomService';
import {
  getActiveVipCashMultiplier,
  getActiveVipXpMultiplier,
} from '../progression/vipBattlePassSystem';
import {
  applyOnlineTeamSpawnToLocalPlayer,
  enforceUnusedBotVisibility,
  hideAllBotsForOnlineMatch,
  syncOnlineMatchFrame,
} from './onlineMatchSync';
import {
  createDrsRuntimeState,
  DrsRuntimeState,
  updateDynamicResolutionGovernor,
} from './dynamicResolutionGovernor';
import { emitHudIfChanged, HudRadarCacheEntry } from './hudBridge';
import {
  arenaAssetMode,
  isMapSpawnHarness,
  isNewGlbBombArena,
  shouldForceSpawnDebug,
} from './mapModeUtils';
import { clearSharedMaterialCache } from './scenePerfOptimizer';
import { disposeAllSecondaryWebGLRenderers } from './webglContextGuard';
import { CombatRayHit, raycastCombatShot } from './combatRaycast';
import { attemptFireWeapon as runAttemptFireWeapon, executeSingleShot as runExecuteSingleShot } from './weaponFireSystem';
import { handleTargetHit as runHandleTargetHit } from './weaponHitSystem';
import { getWeaponFeel } from '../data/weaponFeel';
import {
  configureTacticalPostFx,
  createTacticalPostFx,
  disposeTacticalPostFx,
  renderWithTacticalPostFx,
  setTacticalPostFxBiome,
  TacticalPostFxState,
} from '../graphics/tacticalPostFx';
import { applyAimAssistToLookDelta } from './aimAssist';
import { applyLookDelta, type LookInputState } from './engineLookInput';
import {
  configureIntermittentShadows,
  createShadowBudgetState,
  followKeyLightShadowFrustum,
  requestShadowRefresh,
  ShadowBudgetState,
  tickShadowBudget,
} from './shadowUpdateBudget';

// Pre-allocated math helpers outside the frame loop (Zero GC)
import {
  _resolvedHoriz,
  _forward,
  _right,
  _up,
  _moveVec,
  _rayOrigin,
  _rayDir,
  _worldPos,
  _worldPos2,
  _hitNormal,
  _targetToPlayer,
  _hipPosPistol,
  _hipPosRifle,
} from './engineMathTemps';
import { updateReloadStateMachine as runReloadStateMachine } from './reloadStateMachine';
import { updatePlayerMovementAndCollision as runPlayerMovement } from './playerMovementSystem';
import { checkHorizontalCollision as runHorizontalCollision } from './playerCollisionSystem';
import { updateWeaponKinematicsAndOptics as runWeaponKinematics } from './weaponKinematicsSystem';
import { updateTargetsAndCombatAI as runTargetsCombatAI } from './targetsCombatAiSystem';
import { createMantleState, MantleState } from './playerMantleSystem';
import {
  applyIncomingClassSupportToLocal,
  applyPlayerCombatDamage,
  createClassSupportRuntime,
  isLocalPlayerPendingRevive,
  markAllyDownForRevive,
  markLocalPlayerDownForRevive,
  resetClassSupportForRound,
  setClassSupportHeld,
  updateClassSupport,
  useClassSupport,
  ClassSupportRuntime,
} from './classSupportSystem';
import { PlayerGestureThirdPerson } from './playerGestureThirdPerson';
import { ClassKitPropSystem } from './classKitPropSystem';
import { C4PlantViewmodel } from './c4BombProp';

export class TacticalFPSEngine {
  private container: HTMLElement;
  private onHudUpdate: (state: HudState) => void;
  private unsubOnlineHits: (() => void) | null = null;
  private unsubOnlineGrenades: (() => void) | null = null;
  private unsubOnlineGrenadeDetonations: (() => void) | null = null;
  private unsubOnlineScorestreaks: (() => void) | null = null;
  private unsubOnlineClassSupport: (() => void) | null = null;
  private unsubOnlineBomb: (() => void) | null = null;
  private unsubOnlineRounds: (() => void) | null = null;
  private unsubInventory: (() => void) | null = null;
  /** Warface local-player revive window (bomb modes). */
  private playerReviveUntilSec = 0;
  private playerReviveExpired = false;
  private playerCorpsePos: THREE.Vector3 | null = null;
  private _allyReviveCharge = 0;

  public readonly isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private pitchObject: THREE.Object3D;
  private yawObject: THREE.Object3D;

  private textures: ProceduralTextures;
  private weaponRig: TacticalWeaponRig;
  private standerTiroLevelData: StanderTiroBundle;
  private facilityLevelData: TacticalLevelData;
  private yardLevelData: TacticalLevelData;
  private dust2LevelData: Dust2LevelBundle;
  private assaultLevelData: Dust2LevelBundle;
  private industriaLevelData: Dust2LevelBundle;
  private hangarLevelData: Dust2LevelBundle;
  private easternCityLevelData: Dust2LevelBundle;
  private mirageAnubisLevelData: Dust2LevelBundle;
  private csgoAssaultLevelData: Dust2LevelBundle;
  private deDstLevelData: Dust2LevelBundle;
  private mpNukedLevelData: Dust2LevelBundle;
  private deSupplyLevelData: Dust2LevelBundle;
  private yardV2LevelData: Dust2LevelBundle;
  private stationArenaLevelData: Dust2LevelBundle;
  private yardBombSystem: YardBombSystem;
  private colliders: ColliderBox[] = [];
  private targets: TacticalTargetEntity[] = [];
  private targetMap = new Map<string, TacticalTargetEntity>();
  private shootableMeshes: THREE.Mesh[] = [];
  private wallStandPositions: THREE.Vector3[] = [];
  private fxPool: BallisticsFXPool;
  private grenadeSystem: TacticalGrenadeSystem;
  private raycaster = new THREE.Raycaster();
  private laserDotMesh: THREE.Mesh;
  private keyLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private skySystem: TacticalSkySystem;

  // Loop, Timing & Dynamic Resolution Governor (DRS)
  private frameId = 0;
  private isLoopRunning = false;
  private rankUpTimeoutId: number | null = null;
  private disposed = false;
  private lastTime = performance.now();
  private elapsedTime = 0;
  private hitstopTimer = 0;
  private hudSyncTimer = 0;
  private drsState: DrsRuntimeState = createDrsRuntimeState(1.0);
  /** Mirrored for applyGraphicsToEngine / legacy field access. */
  private get currentRenderScale(): number {
    return this.drsState.currentRenderScale;
  }
  private set currentRenderScale(value: number) {
    this.drsState.currentRenderScale = value;
  }
  private hudFingerprint = { value: '' };
  private hudForceEmit = { value: true };
  private aimRaycastTimer = 0;
  private aimRaycastInitialized = false;
  private cachedAimHits: THREE.Intersection[] = [];
  private outlinedEnemyBotId: string | null = null;
  private enemyOutlineTimer = 0;
  private isWindowFocused = true;
  private shadowBudget: ShadowBudgetState = createShadowBudgetState();
  private readonly combatRayHit: CombatRayHit = {
    distance: 0,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    object: null,
    isEnvironment: false,
  };

  // Input State (Separated Held vs Edge-Triggered + Mobile Touch Analog State)
  private keysHeld = new Set<string>();
  private mouseButtonsHeld = new Set<number>();
  private jumpBufferTimer = 0;
  private coyoteTimer = 0;
  private lastRKeyPressTime = 0;
  private touchMoveX = 0; // -1 (Left) to +1 (Right)
  private touchMoveY = 0; // -1 (Backward) to +1 (Forward)
  private touchSprinting = false;
  private touchFireHeld = false;
  private touchHoldBreath = false;
  private touchLeanToggle: -1 | 0 | 1 = 0;
  private canvasTouchLookId: number | null = null;
  private canvasTouchLastX = 0;
  private canvasTouchLastY = 0;

  // Player Physics & Kinematics
  private playerPos = new THREE.Vector3(-6.8, 0, 3.2);
  private playerVel = new THREE.Vector3();
  private isGrounded = true;
  private yaw = 0;
  private pitch = 0;
  private currentEyeHeight = 1.68;
  /**
   * Re-snap feet to walkable floor until collider bake finishes (or briefly after).
   * Authored spawn Y can sit ~0.4m under FrontSide floors when collider.ready is false.
   */
  private pendingFloorSnapUntilMs = 0;
  private pendingFloorSnapHintY = 0;
  private slideTimer = 0;
  private slideDir = new THREE.Vector3();
  private leanTarget: -1 | 0 | 1 = 0;
  private leanCurrent = 0;
  private walkBobPhase = 0;
  private walkBobAmp = 0;
  private sprintPoseAlpha = 0;
  private sprintExhausted = false;
  private landingDip = 0;
  private landingDipVel = 0;
  /** FOV punch from jump/land/slide exit — decays in movement loop. */
  private cameraFovPunch = 0;
  /** Base camera roll before head-bob polish in kinematics. */
  private cameraBaseRoll = 0;
  /** True when slide forced crouch toggle on entry (auto-clear on exit). */
  private slideForcedCrouch = false;
  /** Code-only mantle / vault state (no dedicated mantle GLB). */
  private mantle: MantleState = createMantleState();
  /** Set by movement when horizontal resolve blocks intended forward motion. */
  private mantleWallBlocked = false;
  /** Warface class support kits (ammo / heal+revive / armor). */
  private classSupport: ClassSupportRuntime = createClassSupportRuntime();
  /** Mixamo 3P gestures (mantle hang, CPR, kit use) from Animaçao pack. */
  private playerGesture!: PlayerGestureThirdPerson;
  /** 1P class kit props (ammo crate / medkit / armor plate) held while using support. */
  public classKitProps!: ClassKitPropSystem;
  /** 1P C4 held while planting in bomb modes. */
  public c4PlantView!: C4PlantViewmodel;

  // Weapon & Recoil Spring Kinematics
  private swayPos = new THREE.Vector2();
  private swayVel = new THREE.Vector2();
  private recoilKickZ = 0;
  private recoilPitch = 0;
  private recoilYaw = 0;
  private cameraShake = 0;
  /** Per-weapon recovery multiplier for recoil damp (from weaponFeel). */
  private weaponFeelRecovery = 1;
  private postFx: TacticalPostFxState = createTacticalPostFx();
  private boltCycleOffset = 0;
  private muzzleFlashTimer = 0;
  private fireCooldown = 0;
  private burstRemaining = 0;
  private triggerPulledThisPress = false;
  private sniperChamberTimer = 0;
  private sniperChamberDuration = 1.25;
  private sniperReturnToScopeAfterBolt = false;

  // Premium Cinematic Player Death Camera State (3rd-Person Mixamo Avatar)
  private isPlayerDying = false;
  private deathAnimElapsed = 0;
  private deathSequenceDuration = 2.85;
  private deathOnFinish: (() => void) | null = null;
  private playerDeathTp!: PlayerDeathThirdPersonController;
  private postMatchShowcase!: PostMatchShowcase3D;
  public bulletCamManager!: XRayBulletCamManager;
  public bombBlastManager!: BombBlastManager;
  public shellshockController!: ShellshockEffectController;
  public grenadeKillCam!: GrenadeKillCam;
  private pendingBlastAuthorityPayload: BombExplodedAuthorityPayload | null =
    null;

  // Reload State Machine
  private reloadTimer = 0;
  private reloadDuration = 1.9;
  private isSpeedReload = false;
  private needsBoltReleaseStage = false;
  private stageSoundFlags = {
    magOut: false,
    magIn: false,
    boltSlap: false,
  };
  private magCheckTimer = 0;
  private shotgunShellsTarget = 0;
  private shotgunShellsInserted = 0;
  private shotgunNextShellAt = 0;
  private shotgunShellInterval = 0.46;
  private shotgunNeedsPumpRack = false;
  private shotgunPumpRacked = false;

  private primaryWeapon: WeaponId = 'M4_CARBINE';
  private secondaryWeapon: WeaponId = 'P50_PISTOL';
  private cachedRadarTargets: HudRadarCacheEntry[] = [];
  private cachedClassAdsMult = 1;
  private cachedClassSprintMult = 1;
  private streakReloadBoostSec = 0;
  private streakBannerTimer = 0;
  private uavOutlineSyncTimer = 0;
  private uavOutlinedActive = false;

  // Public HUD state mirror (All players start with M4_CARBINE as primary and P50_PISTOL as secondary)
  public state: HudState = {
    screen: 'INTRO',
    pointerLocked: false,
    activeWeapon: 'M4_CARBINE',
    primaryWeapon: 'M4_CARBINE',
    secondaryWeapon: 'P50_PISTOL',
    nearWallStand: false,
    focusedWallWeapon: null,
    chambered: 1,
    currentMagRounds: 30,
    magCapacity: 30,
    magazines: [30, 30, 30, 30],
    fragGrenades: 3,
    smokeGrenades: 3,
    equippedGrenade: null,
    isThrowingGrenade: false,
    boltLockedBack: false,
    fireMode: 'AUTO',
    optic: 'iron',
    lpvoZoom: 2.0,
    cantedActive: false,
    suppressorAttached: false,
    muzzleDevice: 'NONE',
    weaponCharm: 'NONE',
    laserActive: false,
    reloadPhase: 'IDLE',
    reloadProgress: 0,
    reloadTypeLabel: '',
    magCheckVisible: false,
    wallTuckAmount: 0,

    health: 100,
    maxHealth: 100,
    armor: 15,
    maxArmor: 15,
    playerClass: 'FUZILEIRO',
    supportKind: 'AMMO',
    supportCharges: 2,
    supportMaxCharges: 2,
    supportCooldownSec: 0,
    supportPrompt: '',
    kitChannelProgress: 0,
    reviveChargeProgress: 0,
    reviveMarkers: [],
    allyNeedMarkers: [],
    stamina: 100,
    isHoldingBreath: false,
    isAds: false,
    adsAlpha: 0,
    stance: 'STAND',
    leanDirection: 0,
    playerPos: { x: -6.8, z: 3.2 },
    spawnDebug: undefined,
    playerYaw: 0,
    radarTargets: [],

    drillMode: 'FREE_RANGE',
    score: 0,
    hits: 0,
    shotsFired: 0,
    headshots: 0,
    targetsRemaining: 6,
    totalTargetsInDrill: 6,
    courseTimerSec: 0,
    bestCourseTimeSec: null,
    lastHitZone: null,
    lastShotTelemetry: null,
    shotHistory: [],
    hitMarkerAlpha: 0,
    hitMarkerIsCrit: false,
    hitMarkerIsKill: false,
    bulletCamActive: false,
    bulletCamVignetteAlpha: 0,
    bulletCamDistanceM: 0,
    bulletCamIsHeadshot: false,
    isShellshocked: false,
    shellshockIntensity: 0,
    grenadeKillCamActive: false,
    grenadeKillCamKiller: '',
    grenadeKillCamDistanceM: 0,
    killConfirmAlpha: 0,
    killConfirmLabel: '',
    damageFlashAlpha: 0,
    killfeed: [],
    killStreak: 0,
    readyStreak: 'NONE',
    activeUavSec: 0,
    activeEmpSec: 0,
    empJammedSec: 0,
    streakBannerText: null,

    // Warface Rank Progression System
    playerXp: 0,
    rankLevel: 1,
    rankTitle: 'Recruta I',
    rankBadge: '★',
    rankBadgeColor: '#94a3b8',
    nextRankXp: 250,
    lastXpGained: 0,
    rankUpNotification: null,

    muted: false,
    dockCollapsed: true,
    touchControlsVisible: true,
    isCrouchingToggled: false,
    isProneToggled: false,
    qualityPreset: 'BALANCED_60',
    dynamicResolutionEnabled: true,
    liveFps: 60,
    renderScalePercent: 100,
    gyroMode: 'OFF',
    gyroSensitivity: 1.0,
    lookSensitivity: 1.0,
    adsSensitivity: 1.0,
    aimAssistStrength: 0.45,
    hapticsEnabled: true,
    isFullscreen: false,
    graphicQuality: 'HIGH',
    fpsLimit: 60,
  };

  constructor(container: HTMLElement, onHudUpdate: (state: HudState) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;

    // Load saved Warface Rank Progression XP
    const savedXp = loadSavedPlayerXp();
    const rankInfo = getRankForXp(savedXp);
    const nextRank = getNextRank(rankInfo.level);

    this.state.playerXp = savedXp;
    this.state.rankLevel = rankInfo.level;
    this.state.rankTitle = rankInfo.title;
    this.state.rankBadge = rankInfo.badge;
    this.state.rankBadgeColor = rankInfo.badgeColor;
    this.state.nextRankXp = nextRank ? nextRank.requiredXp : rankInfo.requiredXp;

    // 1. Mandatory Software-WebGL Guard
    let detectedGpuRenderer = 'unknown';
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      detectedGpuRenderer = gpu;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    runtimeTelemetry.initEnvironment(detectedGpuRenderer);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.currentRenderScale = this.isSoftwareGl
      ? 1.0
      : Math.min(window.devicePixelRatio || 1, isMobileGpuTarget() ? 1.32 : 1.65);
    this.renderer.setPixelRatio(this.currentRenderScale);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    attachCompressedTextureSupport(this.renderer);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    // PCF (not Soft) — Soft is significantly heavier on mobile GPUs.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    configureIntermittentShadows(this.renderer);
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Studio IBL Environment (`RoomEnvironment`) & Horizon Fog
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0x0d121a);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.FogExp2(0x0d121a, 0.014);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const indoorEnvTex = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    this.scene.environment = indoorEnvTex;
    this.scene.userData.preferredEnvironmentTex = indoorEnvTex;
    pmremGenerator.dispose();

    // 3. Balanced 3-Point Warm/Cool Lighting Rig
    // Outdoor maps automatically swap to atmospheric sky PMREM IBL via skySystem.
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.75);
    this.hemiLight = hemiLight;
    hemiLight.position.set(0, 30, 0);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.95);
    this.keyLight = keyLight;
    keyLight.position.set(22, 36, 18);
    keyLight.castShadow = !this.isSoftwareGl;
    if (!this.isSoftwareGl) {
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 36;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 110;
      keyLight.shadow.bias = -0.00035;
      keyLight.shadow.normalBias = 0.025;
      keyLight.shadow.radius = 2.0;
    }
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    this.rimLight = rimLight;
    rimLight.position.set(-25, 18, -35);
    this.scene.add(rimLight);

    this.skySystem = new TacticalSkySystem(
      this.scene,
      this.keyLight,
      this.hemiLight,
      this.rimLight,
      this.isSoftwareGl ? null : this.renderer,
      indoorEnvTex
    );

    // 4. First-Person Camera Hierarchy (Yaw -> Pitch -> Camera -> WeaponRig)
    this.camera = new THREE.PerspectiveCamera(
      72,
      container.clientWidth / container.clientHeight,
      0.03,
      160
    );
    this.pitchObject = new THREE.Object3D();
    this.pitchObject.add(this.camera);

    this.yawObject = new THREE.Object3D();
    // Camera Y must include feet (playerPos.y) — eye-only puts the view under elevated floors.
    this.yawObject.position.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight,
      this.playerPos.z
    );
    this.yawObject.add(this.pitchObject);
    this.scene.add(this.yawObject);

    // 5. Procedural Textures, Weapon Rig, Level & Ballistics Pool
    this.textures = createProceduralTextures(this.renderer);
    this.weaponRig = buildTacticalWeaponRig(
      this.textures,
      this.isSoftwareGl,
      (subtree) => {
        // Keep 1P hero firearm textures razor-sharp (2048px + 8x anisotropy) even on mobile
        warmSubtreeOnGpu(
          subtree,
          this.scene,
          this.camera,
          this.renderer,
          this.isSoftwareGl,
          2048,
          true
        );
      }
    );
    this.camera.add(this.weaponRig.root);
    this.unsubInventory = subscribePlayerInventory(() => {
      const classMods = getClassCombatModifiers();
      this.cachedClassAdsMult = classMods.adsSpeedMult;
      this.cachedClassSprintMult = classMods.sprintSpeedMult;
      const w = this.state.activeWeapon;
      this.weaponRig.applyWeaponSkin(w, getEquippedWeaponSkinId(w));
      const eqOptic = getEquippedWeaponOptic(w, this.state.playerXp);
      if (this.state.optic !== eqOptic) {
        this.state.optic = eqOptic;
        this.weaponRig.setOpticType(eqOptic);
      }
    });
    this.playerDeathTp = new PlayerDeathThirdPersonController(
      this.scene,
      this.isSoftwareGl
    );
    this.playerGesture = new PlayerGestureThirdPerson(
      this.scene,
      this.isSoftwareGl
    );
    this.classKitProps = new ClassKitPropSystem(this.camera);
    this.c4PlantView = new C4PlantViewmodel(this.camera);
    this.postMatchShowcase = new PostMatchShowcase3D(
      this.scene,
      this.isSoftwareGl
    );
    this.bulletCamManager = new XRayBulletCamManager(
      this.scene,
      this.camera,
      this.weaponRig.root
    );
    this.bombBlastManager = new BombBlastManager(
      this.scene,
      this.camera,
      this.weaponRig.root
    );
    this.shellshockController = new ShellshockEffectController();
    this.grenadeKillCam = new GrenadeKillCam(this.scene);

    const standerData = buildStanderTiroLevel(this.isSoftwareGl);
    this.standerTiroLevelData = standerData;
    // Hidden until FREE_RANGE prepare finishes loading shooting_range_2k.glb
    // (avoids empty booth/lights-only scene if start races the GLB).
    standerData.levelGroup.visible = false;
    this.scene.add(standerData.levelGroup);

    const levelData = buildPreProductionLevel(this.textures, this.isSoftwareGl);
    this.facilityLevelData = levelData;
    this.facilityLevelData.levelGroup.visible = false;
    this.scene.add(levelData.levelGroup);

    this.yardLevelData = buildYardLevel(
      this.textures,
      this.isSoftwareGl
    );
    this.yardLevelData.levelGroup.visible = false;
    this.scene.add(this.yardLevelData.levelGroup);

    this.dust2LevelData = buildDust2Level(this.isSoftwareGl);
    this.dust2LevelData.levelGroup.visible = false;
    this.scene.add(this.dust2LevelData.levelGroup);

    this.assaultLevelData = buildAssaultLevel(this.isSoftwareGl);
    this.assaultLevelData.levelGroup.visible = false;
    this.scene.add(this.assaultLevelData.levelGroup);

    this.industriaLevelData = buildIndustriaLevel(this.isSoftwareGl);
    this.industriaLevelData.levelGroup.visible = false;
    this.scene.add(this.industriaLevelData.levelGroup);

    this.hangarLevelData = buildHangarLevel(this.isSoftwareGl);
    this.hangarLevelData.levelGroup.visible = false;
    this.scene.add(this.hangarLevelData.levelGroup);

    this.easternCityLevelData = buildEasternCityLevel(this.isSoftwareGl);
    this.easternCityLevelData.levelGroup.visible = false;
    this.scene.add(this.easternCityLevelData.levelGroup);

    this.mirageAnubisLevelData = buildMirageAnubisLevel(this.isSoftwareGl);
    this.mirageAnubisLevelData.levelGroup.visible = false;
    this.scene.add(this.mirageAnubisLevelData.levelGroup);

    this.csgoAssaultLevelData = buildV23MapLevel('CSGO_ASSAULT_BOMB_5V5', this.isSoftwareGl);
    this.csgoAssaultLevelData.levelGroup.visible = false;
    this.scene.add(this.csgoAssaultLevelData.levelGroup);

    this.deDstLevelData = buildV23MapLevel('DE_DST_BOMB_5V5', this.isSoftwareGl);
    this.deDstLevelData.levelGroup.visible = false;
    this.scene.add(this.deDstLevelData.levelGroup);

    this.mpNukedLevelData = buildV23MapLevel('MP_NUKED_BOMB_5V5', this.isSoftwareGl);
    this.mpNukedLevelData.levelGroup.visible = false;
    this.scene.add(this.mpNukedLevelData.levelGroup);

    this.deSupplyLevelData = buildV23MapLevel('DE_SUPPLY_BOMB_5V5', this.isSoftwareGl);
    this.deSupplyLevelData.levelGroup.visible = false;
    this.scene.add(this.deSupplyLevelData.levelGroup);

    this.yardV2LevelData = buildV23MapLevel('YARD_V2_BOMB_5V5', this.isSoftwareGl);
    this.yardV2LevelData.levelGroup.visible = false;
    this.scene.add(this.yardV2LevelData.levelGroup);

    this.stationArenaLevelData = buildStationArenaLevel(this.isSoftwareGl);
    this.stationArenaLevelData.levelGroup.visible = false;
    this.scene.add(this.stationArenaLevelData.levelGroup);

    this.yardBombSystem = new YardBombSystem(this.scene);

    this.colliders = standerData.colliders;
    this.targets = standerData.targets;
    this.targetMap.clear();
    for (let i = 0; i < this.targets.length; i++) {
      this.targetMap.set(this.targets[i].id, this.targets[i]);
    }
    this.shootableMeshes = standerData.shootableMeshes;
    this.wallStandPositions = standerData.wallStandPositions;

    // Initialize optic visibility on the starting weapon
    this.weaponRig.setOpticType('iron');

    this.fxPool = new BallisticsFXPool(this.scene);
    this.grenadeSystem = new TacticalGrenadeSystem(
      this.scene,
      this.camera,
      (blastCenter, blastRadius, isRemote, throwerInfo) =>
        this.handleFragGrenadeDetonation(
          blastCenter,
          blastRadius,
          Boolean(isRemote),
          throwerInfo
        ),
      (type, origin, velocity) => {
        if (type === 'FRAG') {
          this.state.fragGrenades = Math.max(0, this.state.fragGrenades - 1);
        } else {
          this.state.smokeGrenades = Math.max(0, this.state.smokeGrenades - 1);
        }
        this.state.equippedGrenade = null;
        if (isOnlineMatchActive()) {
          publishGrenadeThrow(
            type,
            [origin.x, origin.y, origin.z],
            [velocity.x, velocity.y, velocity.z]
          );
        }
        this.emitHud();
      }
    );

    // World-space green laser impact dot
    this.laserDotMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    this.laserDotMesh.visible = false;
    this.scene.add(this.laserDotMesh);

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.ensureOnlineSubscriptions();
    // Do NOT start requestAnimationFrame loop during INTRO / LOADING screens
  }

  public async preloadAssets(
    onProgress: (pct: number, statusLabel: string) => void
  ): Promise<void> {
    this.stopLoop();
    await AssetPreloader.executePreloadSequence(
      this.renderer,
      this.scene,
      this.camera,
      this.isSoftwareGl,
      onProgress
    );
    preloadCharacterAndBombAudio();
    this.fxPool.prewarm(
      this.renderer,
      this.scene,
      this.camera,
      this.isSoftwareGl
    );
    this.grenadeSystem.prewarmShadersAndTextures(
      this.renderer,
      this.isSoftwareGl
    );
    if (!this.isSoftwareGl) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Loading 2 (Match/Arena - Vanguard vs. Blackthorn):
   * Pausa o loop de renderização para evitar frame drops, baixa o .glb via
   * THREE.LoadingManager + DRACOLoader, gera colisores Box3/triângulos,
   * envia texturas para a VRAM e compila todos os shaders antes de liberar a partida.
   */
  public async prepareMapForMatch(
    mode: DrillMode,
    onProgress: (pct: number, statusLabel: string) => void
  ): Promise<void> {
    this.stopLoop();
    const loadStartMs = performance.now();
    const loadoutMod = getClassCombatModifiers();
    const loadoutWeaponIds: WeaponId[] = [
      loadoutMod.primaryWeapon || this.primaryWeapon || 'M4_CARBINE',
      loadoutMod.secondaryWeapon || this.secondaryWeapon || 'P50_PISTOL',
      'KNIFE_TACTICAL',
    ];
    await prepareMatchArena({
      mode,
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      isSoftwareGl: this.isSoftwareGl,
      standerTiroLevelData: this.standerTiroLevelData,
      facilityLevelData: this.facilityLevelData,
      yardLevelData: this.yardLevelData,
      dust2LevelData: this.dust2LevelData,
      assaultLevelData: this.assaultLevelData,
      industriaLevelData: this.industriaLevelData,
      hangarLevelData: this.hangarLevelData,
      easternCityLevelData: this.easternCityLevelData,
      mirageAnubisLevelData: this.mirageAnubisLevelData,
      csgoAssaultLevelData: this.csgoAssaultLevelData,
      deDstLevelData: this.deDstLevelData,
      mpNukedLevelData: this.mpNukedLevelData,
      deSupplyLevelData: this.deSupplyLevelData,
      yardV2LevelData: this.yardV2LevelData,
      stationArenaLevelData: this.stationArenaLevelData,
      skySystem: this.skySystem,
      grenadeSystem: this.grenadeSystem,
      weaponRig: this.weaponRig,
      ballisticsPool: this.fxPool,
      loadoutWeaponIds,
      onProgress,
    });
    runtimeTelemetry.recordMatchLoad(mode, performance.now() - loadStartMs);
  }

  /**
   * Limpa geometrias, materiais, texturas e colisores do mapa da partida da RAM/GPU
   * ao retornar para o Lobby, prevenindo vazamento de memória (Memory Leak) no celular.
   */
  public cleanupMatchAssets(): void {
    cleanupMatchArenaAssets(
      this.renderer,
      this.standerTiroLevelData,
      this.facilityLevelData,
      this.yardLevelData,
      this.dust2LevelData,
      this.assaultLevelData,
      this.industriaLevelData,
      this.hangarLevelData,
      this.easternCityLevelData,
      this.mirageAnubisLevelData,
      this.csgoAssaultLevelData,
      this.deDstLevelData,
      this.mpNukedLevelData,
      this.deSupplyLevelData,
      this.yardV2LevelData,
      this.stationArenaLevelData,
      this.grenadeSystem
    );
    this.colliders = this.standerTiroLevelData.colliders;
    this.targets = this.standerTiroLevelData.targets;
    this.targetMap.clear();
    for (let i = 0; i < this.targets.length; i++) {
      this.targetMap.set(this.targets[i].id, this.targets[i]);
    }
    this.shootableMeshes = this.standerTiroLevelData.shootableMeshes;
    this.wallStandPositions = this.standerTiroLevelData.wallStandPositions;
    this.cachedRadarTargets = [];

    this.ensureOnlineSubscriptions();
  }

  private ensureOnlineSubscriptions(): void {
    this.yardBombSystem?.setOnBombStateChanged((status, site) => {
      if (isOnlineMatchActive()) {
        publishBombStateChange(status, site);
      }
    });

    this.yardBombSystem?.setOnBombDetonated((site, bombPos) => {
      this.triggerAuthoritativeBombBlast(site, bombPos);
    });

    this.unsubOnlineHits?.();
    this.unsubOnlineHits = subscribeOnlineHitEvents((hit) => {
      if (!isOnlineMatchActive()) return;
      const localOp = getLocalOnlinePlayerState();
      if (hit.lethal && hit.attackerUid !== localOp?.uid) {
        this.registerKill(
          hit.attackerCallsign,
          hit.attackerTeam,
          hit.targetCallsign,
          hit.targetTeam,
          hit.weaponId,
          hit.isHeadshot
        );
      }
      if (localOp && hit.targetUid === localOp.uid) {
        if (
          this.isPlayerDying ||
          this.playerDeathTp?.isActive() ||
          isLocalPlayerPendingRevive(this as any)
        )
          return;
        soundEngine.playImpact(hit.isHeadshot ? 'HEADSHOT' : 'TORSO');
        mobileHardware.vibrateDamage();
        playRealPlayerHitGrunt(hit.isHeadshot);
        applyPlayerCombatDamage(this as any, hit.damage, hit.isHeadshot);
        this.state.damageFlashAlpha = hit.isHeadshot ? 0.95 : 0.75;
        {
          const flinch = getWeaponFeel(this.state.activeWeapon).flinchScale;
          this.cameraShake = (hit.isHeadshot ? 0.024 : 0.012) * flinch;
          this.pitch = THREE.MathUtils.clamp(
            this.pitch - (hit.isHeadshot ? 0.018 : 0.01) * flinch,
            -Math.PI * 0.46,
            Math.PI * 0.46
          );
        }
        if (this.state.health <= 0) {
          const room = getActiveOnlineRoom();
          const atk = room?.players?.[hit.attackerUid];
          const killerPos =
            atk != null
              ? _worldPos.set(atk.x, atk.y, atk.z)
              : null;
          this.triggerPlayerDeathSequence(
            hit.isHeadshot,
            hit.attackerCallsign,
            hit.attackerTeam,
            hit.weaponId,
            () => {
              if (this.state.drillMode === 'STATION_TDM_5V5') {
                if (this.yardBombSystem?.info.roundState === 'PLAYING') {
                  this.respawnLocalPlayerTdm();
                }
                this.emitHud();
                return;
              }
              const bomb =
                this.state.drillMode === 'YARD_BOMB_5V5' ||
                this.state.drillMode === 'DUST2_BOMB_5V5' ||
                this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
                this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
                this.state.drillMode === 'HANGAR_BOMB_5V5' ||
                this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
                this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
                isV23BombMapMode(this.state.drillMode) ||
                this.state.drillMode === 'STATION_CAPTURE_5V5';
              if (bomb) {
                const specBot = this.playerDeathTp.startSpectating(
                  this.targets as YardBotEntity[]
                );
                if (specBot && this.yardBombSystem.info.roundState === 'PLAYING') {
                  this.yardBombSystem.info.isSpectating = true;
                  this.yardBombSystem.info.spectatedCallsign =
                    specBot.callsign || 'VANGUARD-02';
                  this.yardBombSystem.info.spectatedWeapon =
                    specBot.weaponId || 'M4_CARBINE';
                  this.yardBombSystem.info.spectatedHealth = Math.max(
                    0,
                    specBot.health
                  );
                  this.state.damageFlashAlpha = 0;
                }
              }
              this.emitHud();
            },
            killerPos
          );
        }
        this.emitHud();
      }
    });

    this.unsubOnlineClassSupport?.();
    this.unsubOnlineClassSupport = subscribeOnlineClassSupport((evt) => {
      if (!isOnlineMatchActive()) return;
      const localOp = getLocalOnlinePlayerState();
      if (!localOp || evt.targetUid !== localOp.uid) return;
      if (evt.fromUid === localOp.uid) return;
      applyIncomingClassSupportToLocal(
        this as any,
        evt.kind,
        evt.amount,
        evt.phase || 'APPLY'
      );
    });

    this.unsubOnlineGrenades?.();
    this.unsubOnlineGrenades = subscribeOnlineGrenadeEvents((evt) => {
      if (!isOnlineMatchActive()) return;
      const localOp = getLocalOnlinePlayerState();
      if (localOp && evt.senderUid === localOp.uid) return;
      _worldPos.set(
        Number(evt.origin?.[0] || 0),
        Number(evt.origin?.[1] || 0),
        Number(evt.origin?.[2] || 0)
      );
      _worldPos2.set(
        Number(evt.velocity?.[0] || 0),
        Number(evt.velocity?.[1] || 0),
        Number(evt.velocity?.[2] || 0)
      );
      this.grenadeSystem?.spawnBotGrenade(
        _worldPos,
        _worldPos2,
        evt.grenadeType === 'SMOKE' ? 'SMOKE' : 'FRAG',
        true,
        {
          isBot: false,
          callsign: evt.senderCallsign || 'OPERADOR',
          team: evt.senderTeam || 'BLACKTHORN',
        }
      );
      for (let i = 0; i < this.targets.length; i++) {
        const bot = this.targets[i];
        if (bot.root.userData?.remotePlayerUid === evt.senderUid && !bot.isDown) {
          triggerBotGrenadeAnimation(bot);
          break;
        }
      }
    });

    this.unsubOnlineGrenadeDetonations?.();
    this.unsubOnlineGrenadeDetonations = subscribeOnlineGrenadeDetonations(
      (evt) => {
        if (!isOnlineMatchActive()) return;
        const room = getActiveOnlineRoom();
        const localOp = getLocalOnlinePlayerState();
        _worldPos.set(
          Number(evt.grenadePos?.[0] || 0),
          Number(evt.grenadePos?.[1] || 0),
          Number(evt.grenadePos?.[2] || 0)
        );
        // Spawn 3D expansive shockwave ring & pressure dome at authoritative detonation center
        this.grenadeKillCam?.spawnShockwaveAt(_worldPos);

        for (const v of evt.victims || []) {
          const victimOp = room?.players?.[v.targetUid];
          // Register killfeed for remote victims killed in Raio 1
          if (v.lethal && v.targetUid !== localOp?.uid && victimOp) {
            this.registerKill(
              evt.attackerCallsign,
              evt.attackerTeam,
              victimOp.callsign || 'OPERADOR',
              victimOp.team,
              'GRENADE',
              false
            );
          }

          // Parabolic blast throw for remote player avatars killed in Raio 1
          if (v.lethal && v.targetUid !== localOp?.uid) {
            for (let i = 0; i < this.targets.length; i++) {
              const t = this.targets[i];
              if (t.root.userData?.remotePlayerUid === v.targetUid) {
                t.isDown = true;
                t.health = 0;
                const groundY = this.getCurrentGroundHeight(
                  t.root.position.x,
                  t.root.position.y,
                  t.root.position.z
                );
                this.grenadeKillCam?.triggerBotBlastThrow(
                  t as YardBotEntity,
                  _worldPos,
                  v.distanceMeters,
                  groundY
                );
                break;
              }
            }
          }

          // Authoritative verdict for the local player
          if (localOp && v.targetUid === localOp.uid) {
            this.applyAuthoritativeGrenadeVerdictToLocalPlayer(
              _worldPos,
              v.zone,
              v.distanceMeters,
              v.damage,
              v.lethal,
              v.shellshockIntensity,
              v.shellshockDurationSec,
              evt.attackerCallsign,
              evt.attackerTeam,
              v.impulseVel
            );
          }
        }
        this.emitHud(true);
      }
    );

    this.unsubOnlineScorestreaks?.();
    this.unsubOnlineScorestreaks = subscribeOnlineScorestreakEvents((evt) => {
      if (!isOnlineMatchActive() || this.state.screen !== 'PLAYING') return;
      const localOp = getLocalOnlinePlayerState();
      if (!localOp || evt.senderUid === localOp.uid) return;
      const nowMs = performance.now();
      const dur = Math.max(10, Math.min(24, Number(evt.durationSec) || 18));

      if (evt.senderTeam === localOp.team) {
        this.state.activeUavSec = Math.max(this.state.activeUavSec, dur);
        this.uavOutlinedActive = true;
        this.uavOutlineSyncTimer = 0;
        const revealUntil = nowMs + dur * 1000 + 500;
        for (let i = 0; i < this.targets.length; i++) {
          const t = this.targets[i];
          if (
            t &&
            t.type === 'COMBAT_BOT' &&
            !t.isDown &&
            !(t as YardBotEntity).isAlly
          ) {
            t.root.userData = t.root.userData || {};
            t.root.userData.radarRevealedUntilMs = Math.max(
              Number(t.root.userData.radarRevealedUntilMs || 0),
              revealUntil
            );
            setBotEnemyOutline(t, true);
          }
        }
        const label =
          evt.streak === 'ADVANCED_UAV'
            ? `${evt.senderCallsign} ATIVOU UAV AVANÇADO (${dur}s)`
            : `${evt.senderCallsign} ATIVOU UAV TÁTICO (${dur}s)`;
        this.showStreakBanner(label, 3.2);
        soundEngine.playMechanicalSwitch(1.3);
      } else if (evt.streak === 'ADVANCED_UAV') {
        this.state.empJammedSec = Math.max(this.state.empJammedSec, 10);
        this.showStreakBanner(
          'PULSO EMP INIMIGO · RADAR INTERROMPIDO (10s)',
          3.6
        );
        soundEngine.playMechanicalSwitch(0.75);
      } else {
        this.showStreakBanner('ALERTA · UAV INIMIGO DETECTADO NO SETOR', 2.8);
      }
      this.emitHud(true);
    });

    this.unsubOnlineBomb?.();
    this.unsubOnlineBomb = subscribeOnlineBombEvents((evt) => {
      if (!isOnlineMatchActive()) return;
      this.yardBombSystem?.applyRemoteBombState(evt.bombStatus, evt.plantedSite);
      this.state.yardBomb = { ...this.yardBombSystem.info };
      this.emitHud();
    });

    this.unsubOnlineRounds?.();
    this.unsubOnlineRounds = subscribeOnlineRoundEvents((evt) => {
      if (!isOnlineMatchActive()) return;
      if (
        evt.kind === 'ROUND_END_BOMB_EXPLODED' &&
        !this.bombBlastManager?.isActive()
      ) {
        const bp = evt.blastPayload;
        if (bp && Array.isArray(bp.bombPos) && bp.bombPos.length === 3) {
          _worldPos.set(
            Number(bp.bombPos[0]) || 0,
            Number(bp.bombPos[1]) || 0,
            Number(bp.bombPos[2]) || 0
          );
        } else {
          this.yardBombSystem.getPlantedBombWorldPosition(_worldPos);
        }
        this.triggerAuthoritativeBombBlast(
          bp?.plantedSite || this.yardBombSystem.info.plantedSite || 'A',
          _worldPos,
          bp
        );
      }
      this.yardBombSystem?.applyRemoteRoundEvent(
        evt,
        (xp, cash) => {
          this.addPlayerXp(xp);
          if (canGrantMatchProgressionRewards() && cash > 0) {
            addPlayerCash(Math.round(cash * getActiveVipCashMultiplier()));
          }
          this.state.score += xp;
          this.emitHud();
        },
        () => {
          resetLocalOnlinePlayerForNextRound(this.state.drillMode);
          this.resetScenario(this.state.drillMode, true);
          this.emitHud();
        }
      );
      this.state.yardBomb = { ...this.yardBombSystem.info };
      this.emitHud();
    });
  }

  // =========================================================================
  // PUBLIC CONTROLS FOR UI OVERLAYS & KEYBOARD
  // =========================================================================
  public startGame(mode?: DrillMode): void {
    if (mode) {
      this.state.drillMode = mode;
    }
    // Free menu/inspection WebGL contexts so the match owns the GPU.
    disposeAllSecondaryWebGLRenderers();
    requestShadowRefresh(this.shadowBudget);
    this.resetScenario(this.state.drillMode);
    this.state.screen = 'PLAYING';
    this.hudForceEmit.value = true;
    this.startLoop();
    if (this.state.gyroMode !== 'OFF') {
      void this.enableGyroSensor();
    }
    this.requestPointerLock();
    this.emitHud(true);
  }

  public resumeGame(): void {
    this.state.screen = 'PLAYING';
    this.startLoop();
    this.requestPointerLock();
    this.emitHud();
  }

  public pauseGame(): void {
    if (this.state.screen === 'PLAYING') {
      if (this.bulletCamManager?.isActive()) {
        this.bulletCamManager.skip(true);
        this.syncBulletCamHudState();
      }
      this.state.screen = 'PAUSED';
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
      this.emitHud();
    }
  }

  private resolveBulletCamGameMode(): BulletCamGameMode {
    if (isOnlineMatchActive()) {
      // Ativa exclusivamente em sala privada com bots sem oponentes humanos PvP;
      // 100% desativada em PvP online, ranqueada e campeonato de clãs.
      if (
        isPrivateRoomWithBotsActive() &&
        countOtherHumanPlayersInRoom() === 0
      ) {
        return 'PRIVATE_BOTS';
      }
      return 'ONLINE_PVP';
    }
    if (this.state.drillMode === 'FREE_RANGE') {
      return 'TRAINING';
    }
    return 'PRIVATE_BOTS';
  }

  private syncBulletCamHudState(): void {
    if (!this.bulletCamManager) return;
    const snap = this.bulletCamManager.getHudSnapshot();
    this.state.bulletCamActive = snap.active;
    this.state.bulletCamVignetteAlpha = snap.vignetteAlpha;
    this.state.bulletCamDistanceM = snap.distanceMeters;
    this.state.bulletCamIsHeadshot = snap.isHeadshot;
  }

  public tryTriggerSniperBulletCam(params: {
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
    onImpact: () => void;
  }): boolean {
    if (
      !this.bulletCamManager ||
      this.isPlayerDying ||
      this.playerDeathTp?.isActive() ||
      this.postMatchShowcase?.isActive()
    ) {
      return false;
    }

    const triggered = this.bulletCamManager.tryTriggerBulletCam({
      ...params,
      gameMode: this.resolveBulletCamGameMode(),
      yawObject: this.yawObject,
      pitchObject: this.pitchObject,
      baseFov: 72,
      onComplete: () => {
        this.syncBulletCamHudState();
        this.emitHud();
      },
    });

    if (triggered) {
      // Trava inputs pendentes de movimento e disparo para evitar tiros duplicados ou deriva de câmera
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      this.touchSprinting = false;
      this.touchFireHeld = false;
      this.burstRemaining = 0;
      this.mouseButtonsHeld.clear();
      this.syncBulletCamHudState();
      this.emitHud();
    }
    return triggered;
  }

  public skipBulletCam(): boolean {
    if (!this.bulletCamManager?.isActive()) return false;
    const skipped = this.bulletCamManager.skip(false);
    if (skipped) {
      this.syncBulletCamHudState();
      this.emitHud();
    }
    return skipped;
  }

  public isBulletCamActive(): boolean {
    return Boolean(this.bulletCamManager?.isActive());
  }

  private clearEnemyAimOutline(): void {
    if (this.outlinedEnemyBotId) {
      const prev = this.targetMap.get(this.outlinedEnemyBotId);
      if (prev) setBotEnemyOutline(prev, false);
      this.outlinedEnemyBotId = null;
    }
  }

  private triggerAuthoritativeBombBlast(
    site: 'A' | 'B',
    bombPos: THREE.Vector3,
    authoritativePayload?: BombExplodedAuthorityPayload
  ): void {
    if (!this.bombBlastManager) return;

    if (this.bulletCamManager?.isActive()) {
      this.bulletCamManager.reset();
      this.syncBulletCamHudState();
    }
    if (this.weaponRig?.root) {
      this.playerDeathTp?.stop(this.camera, this.weaponRig.root);
    }
    this.isPlayerDying = false;
    this.yardBombSystem.info.isSpectating = false;

    const localOp = getLocalOnlinePlayerState();
    const localCallsign =
      localOp?.callsign || getPlayerCallsign() || 'VOCÊ';
    const localTeam: 'VANGUARD' | 'BLACKTHORN' =
      localOp?.team || 'VANGUARD';
    const localPlayerAlive =
      this.state.health > 0 &&
      !this.isPlayerDying &&
      !isLocalPlayerPendingRevive(this as any);

    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprinting = false;
    this.touchFireHeld = false;
    this.burstRemaining = 0;
    this.mouseButtonsHeld.clear();

    const payload = this.bombBlastManager.onBombDetonate({
      plantedSite: site,
      bombPos,
      localPlayerPos: this.playerPos,
      localPlayerAlive,
      localPlayerCallsign: localCallsign,
      localPlayerTeam: localTeam,
      bots: this.targets as YardBotEntity[],
      obstacles: this.colliders,
      activeGlbCollider: this.getActiveGlbCollider(),
      yawObject: this.yawObject,
      pitchObject: this.pitchObject,
      baseFov: 72,
      getGroundHeight: (x, y, z) => this.getCurrentGroundHeight(x, y, z),
      authoritativePayload,
      onApplyLocalPlayerBlastResult: (verdict) => {
        if (!verdict.inBlastRadius) return;
        if (verdict.lethal) {
          this.state.armor = 0;
          this.state.health = 0;
          this.state.damageFlashAlpha = 0.95;
          this.cameraShake = 0.048;
          this.state.reloadTypeLabel =
            'ATINGIDO PELA ONDA DE CHOQUE LETAL DO C4 (SEM COBERTURA)';
          this.magCheckTimer = 3.0;
        } else if (verdict.isBehindCover) {
          if (verdict.damageApplied > 0) {
            applyPlayerCombatDamage(this as any, verdict.damageApplied, false);
            this.state.damageFlashAlpha = 0.45;
          }
          this.cameraShake = 0.026;
          this.state.reloadTypeLabel =
            'PROTEGIDO ATRÁS DE COBERTURA SÓLIDA — IMPACTO LETAL BLOQUEADO!';
          this.magCheckTimer = 3.2;
        }
      },
      onRegisterBlastKill: (victimCallsign, victimTeam) => {
        this.registerKill(
          'BOMBA C4',
          'VANGUARD',
          victimCallsign,
          victimTeam,
          'RPG7_LAUNCHER',
          false
        );
      },
    });

    this.pendingBlastAuthorityPayload = payload;
    this.yardBombSystem.info.blastCineActive = this.bombBlastManager.isActive();
    this.state.yardBomb = { ...this.yardBombSystem.info };
  }

  public returnToMainMenu(): void {
    stopMatchEndFanfare();
    this.bulletCamManager?.reset();
    this.syncBulletCamHudState();
    this.bombBlastManager?.reset();
    this.shellshockController?.clear();
    this.grenadeKillCam?.clear();
    this.state.isShellshocked = false;
    this.state.shellshockIntensity = 0;
    this.state.grenadeKillCamActive = false;
    this.pendingBlastAuthorityPayload = null;
    this.clearEnemyAimOutline();
    this.clearTacticalStreaks(true);
    if (isOnlineMatchActive()) {
      void leaveActiveRoom();
    }
    if (this.weaponRig?.root) {
      this.postMatchShowcase?.stop(this.camera, this.weaponRig.root);
      this.playerDeathTp?.stop(this.camera, this.weaponRig.root);
    }
    this.weaponRig?.pruneUnusedWeapons([
      this.primaryWeapon,
      this.secondaryWeapon,
      'KNIFE_TACTICAL',
    ]);
    this.cleanupMatchAssets();
    runtimeTelemetry.flush(true);
    this.state.screen = 'MAIN_MENU';
    this.startLoop();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  private getActiveGlbCollider(): Dust2TriangleCollider | null {
    const mode = arenaAssetMode(this.state.drillMode);
    if (mode === 'DUST2_BOMB_5V5') return this.dust2LevelData.collider;
    if (mode === 'ASSAULT_BOMB_5V5') return this.assaultLevelData.collider;
    if (mode === 'INDUSTRIA_BOMB_5V5') return this.industriaLevelData.collider;
    if (mode === 'HANGAR_BOMB_5V5') return this.hangarLevelData.collider;
    if (mode === 'EASTERN_CITY_BOMB_5V5') return this.easternCityLevelData.collider;
    if (mode === 'MIRAGE_ANUBIS_BOMB_5V5') return this.mirageAnubisLevelData.collider;
    if (mode === 'CSGO_ASSAULT_BOMB_5V5') return this.csgoAssaultLevelData.collider;
    if (mode === 'DE_DST_BOMB_5V5') return this.deDstLevelData.collider;
    if (mode === 'MP_NUKED_BOMB_5V5') return this.mpNukedLevelData.collider;
    if (mode === 'DE_SUPPLY_BOMB_5V5') return this.deSupplyLevelData.collider;
    if (mode === 'YARD_V2_BOMB_5V5') return this.yardV2LevelData.collider;
    if (mode === 'STATION_CAPTURE_5V5' || mode === 'STATION_TDM_5V5') {
      return this.stationArenaLevelData.collider;
    }
    return null;
  }

  /** Public snap used by revive / harness / round respawn. */
  public snapLocalPlayerToPlayableFloor(
    hintX?: number,
    hintZ?: number,
    hintY?: number
  ): void {
    const col = this.getActiveGlbCollider();
    const x = hintX ?? this.playerPos.x;
    const z = hintZ ?? this.playerPos.z;
    const y = hintY ?? this.playerPos.y;
    if (col?.ready) {
      const p = col.findPlayableSpawn(x, z, y);
      this.playerPos.set(p.x, p.y, p.z);
    } else {
      const gy = this.getCurrentGroundHeight(x, y, z);
      this.playerPos.set(x, gy, z);
    }
    this.playerVel.y = 0;
    this.isGrounded = true;
    this.syncYawObjectToPlayerFeet();
    this.scheduleFloorResnap(this.playerPos.y);
  }

  private syncYawObjectToPlayerFeet(): void {
    this.yawObject.position.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight,
      this.playerPos.z
    );
  }

  private scheduleFloorResnap(hintY: number, durationMs = 4500): void {
    this.pendingFloorSnapHintY = hintY;
    this.pendingFloorSnapUntilMs = performance.now() + durationMs;
  }

  /**
   * Place local player on a collider-proven playable point (XZ inside footprint + Y on street).
   * New GLB maps must not trust authored coords alone — movement used to glue Y to deep
   * AABB-min slabs under FrontSide floors (white void).
   */
  private placePlayerOnPlayableSpawn(
    col: Dust2TriangleCollider,
    hint: THREE.Vector3,
    readyFallback = true
  ): void {
    if (col.ready) {
      const p = col.findPlayableSpawn(hint.x, hint.z, hint.y);
      this.playerPos.set(p.x, p.y, p.z);
    } else if (readyFallback) {
      this.playerPos.set(hint.x, hint.y, hint.z);
    }
    this.playerVel.y = 0;
    this.isGrounded = true;
    this.syncYawObjectToPlayerFeet();
  }

  /**
   * Dust2-parity place for new GLB maps: join in-flight prepare load (never dispose
   * mid-bake), place only when collider.ready, otherwise wait — no Yard fallback Y.
   */
  private ensureGlbMapThenPlace(
    bundle: Dust2LevelBundle,
    startLoad: () => Promise<void>,
    expectedMode: DrillMode,
    hint: THREE.Vector3
  ): void {
    const placeNow = () => {
      const cur = this.state.drillMode;
      if (cur !== expectedMode && arenaAssetMode(cur) !== expectedMode) return;
      this.placePlayerOnPlayableSpawn(bundle.collider, hint, false);
      this.syncYawObjectToPlayerFeet();
      requestShadowRefresh(this.shadowBudget);
    };
    if (bundle.isLoaded && bundle.collider.ready) {
      placeNow();
      return;
    }
    void (bundle.loadingPromise ?? startLoad()).then(() => {
      placeNow();
      this.scheduleFloorResnap(hint.y);
    });
  }

  /** Snap feet onto walkable floor once when collider becomes ready; returns true when collider applied a snap. */
  private applyPendingFloorSnap(): boolean {
    if (performance.now() > this.pendingFloorSnapUntilMs) return false;
    const col = this.getActiveGlbCollider();
    if (!col?.ready) return false;
    const mode = this.state.drillMode;
    const usePlayable = isNewGlbBombArena(mode) || isMapSpawnHarness(mode);
    if (usePlayable) {
      const p = col.findPlayableSpawn(
        this.playerPos.x,
        this.playerPos.z,
        this.pendingFloorSnapHintY || this.playerPos.y
      );
      this.playerPos.set(p.x, p.y, p.z);
    } else {
      const y = col.getGroundHeight(
        this.playerPos.x,
        this.playerPos.y,
        this.playerPos.z
      );
      if (!Number.isFinite(y)) return false;
      this.playerPos.y = y;
    }
    this.pendingFloorSnapUntilMs = 0;
    this.playerVel.y = 0;
    this.isGrounded = true;
    this.syncYawObjectToPlayerFeet();
    return true;
  }

  public getCurrentGroundHeight(x: number, y: number, z: number): number {
    const mode = arenaAssetMode(this.state.drillMode);
    if (mode === 'DUST2_BOMB_5V5') {
      return this.dust2LevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'ASSAULT_BOMB_5V5') {
      return this.assaultLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'INDUSTRIA_BOMB_5V5') {
      return this.industriaLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'HANGAR_BOMB_5V5') {
      return this.hangarLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'EASTERN_CITY_BOMB_5V5') {
      return this.easternCityLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'MIRAGE_ANUBIS_BOMB_5V5') {
      return this.mirageAnubisLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'CSGO_ASSAULT_BOMB_5V5') {
      return this.csgoAssaultLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'DE_DST_BOMB_5V5') {
      return this.deDstLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'MP_NUKED_BOMB_5V5') {
      return this.mpNukedLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'DE_SUPPLY_BOMB_5V5') {
      return this.deSupplyLevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'YARD_V2_BOMB_5V5') {
      return this.yardV2LevelData.collider.getGroundHeight(x, y, z);
    }
    if (mode === 'STATION_CAPTURE_5V5' || mode === 'STATION_TDM_5V5') {
      return this.stationArenaLevelData.collider.getGroundHeight(x, y, z);
    }
    let groundHeight = 0;
    const r = 0.15;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) {
        if (y >= c.maxY - 0.46 && c.maxY > groundHeight && c.maxY <= 8.0) {
          groundHeight = c.maxY;
        }
      }
    }
    return groundHeight;
  }

  public setScreenState(screen: GameScreenState): void {
    this.state.screen = screen;
    this.hudForceEmit.value = true;
    if (screen === 'INTRO' || screen === 'LOADING' || screen === 'AUTH_LOGIN') {
      this.stopLoop();
    } else {
      this.startLoop();
    }
    if (screen !== 'PLAYING' && document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.emitHud();
  }

  public setDrillMode(mode: DrillMode): void {
    this.state.drillMode = mode;
    this.resetScenario(mode);
    this.emitHud();
  }

  public triggerPlantBomb(): void {
    if (
      this.state.screen !== 'PLAYING' ||
      (this.state.drillMode !== 'YARD_BOMB_5V5' &&
        this.state.drillMode !== 'DUST2_BOMB_5V5' &&
        this.state.drillMode !== 'ASSAULT_BOMB_5V5' &&
        this.state.drillMode !== 'INDUSTRIA_BOMB_5V5' &&
        this.state.drillMode !== 'HANGAR_BOMB_5V5' &&
        this.state.drillMode !== 'EASTERN_CITY_BOMB_5V5' &&
        this.state.drillMode !== 'MIRAGE_ANUBIS_BOMB_5V5' &&
        !isV23BombMapMode(this.state.drillMode))
    ) {
      return;
    }
    this.yardBombSystem?.triggerPlantBomb();
    this.state.yardBomb = { ...this.yardBombSystem.info };
    this.emitHud();
  }

  public cycleSpectator(dir: -1 | 1): void {
    if (!this.playerDeathTp?.isSpectating()) return;
    const specBot = this.playerDeathTp.cycleSpectateTarget(
      this.targets as YardBotEntity[],
      dir
    );
    if (specBot && this.yardBombSystem) {
      soundEngine.playMechanicalSwitch(1.15);
      this.yardBombSystem.info.isSpectating = true;
      this.yardBombSystem.info.spectatedCallsign = specBot.callsign || 'VANGUARD-02';
      this.yardBombSystem.info.spectatedWeapon = specBot.weaponId || 'M4_CARBINE';
      this.yardBombSystem.info.spectatedHealth = Math.max(0, specBot.health);
      this.state.yardBomb = { ...this.yardBombSystem.info };
      this.emitHud();
    }
  }

  public respawnLocalPlayerTdm(): void {
    if (this.state.drillMode !== 'STATION_TDM_5V5') return;
    if (this.yardBombSystem?.info.roundState === 'MATCH_OVER') return;

    this.isPlayerDying = false;
    this.deathAnimElapsed = 0;
    this.deathOnFinish = null;
    this.shellshockController?.clear();
    this.grenadeKillCam?.clear();
    this.state.isShellshocked = false;
    this.state.shellshockIntensity = 0;
    this.state.grenadeKillCamActive = false;
    if (this.weaponRig?.root) {
      this.playerDeathTp?.stop(this.camera, this.weaponRig.root);
      this.weaponRig.root.visible = true;
    }

    const loadoutMod = getClassCombatModifiers();
    this.state.health = 100;
    this.state.maxArmor = Math.max(0, loadoutMod.armorBonus);
    this.state.armor = this.state.maxArmor;
    this.state.stamina = 100;
    this.state.damageFlashAlpha = 0;
    this.state.isCrouchingToggled = false;
    this.state.isProneToggled = false;
    this.currentEyeHeight = 1.68;
    this.camera.rotation.z = 0;
    this.playerVel.set(0, 0, 0);

    if (this.state.currentMagRounds === 0 && this.state.chambered === 0) {
      this.state.currentMagRounds = Math.max(0, this.state.magCapacity - 1);
      this.state.chambered = this.state.magCapacity > 0 ? 1 : 0;
      this.state.boltLockedBack = false;
      this.state.reloadPhase = 'IDLE';
    }

    if (isOnlineMatchActive()) {
      resetLocalOnlinePlayerForNextRound(this.state.drillMode);
      const col = this.stationArenaLevelData.collider;
      const onlineSpawn = applyOnlineTeamSpawnToLocalPlayer(
        this.state.drillMode,
        this.playerPos,
        (x, y, z) => this.getCurrentGroundHeight(x, y, z),
        col.ready ? (hx, hz, hy) => col.findPlayableSpawn(hx, hz, hy) : undefined
      );
      if (onlineSpawn) {
        this.yaw = onlineSpawn.yaw;
        this.pitch = 0;
      }
      this.snapLocalPlayerToPlayableFloor(this.playerPos.x, this.playerPos.z, this.playerPos.y);
    } else {
      const col = this.stationArenaLevelData.collider;
      const offsetX = (Math.random() - 0.5) * 3.0;
      const offsetZ = (Math.random() - 0.5) * 2.2;
      const hint = new THREE.Vector3(
        STATION_ARENA_ATTACKER_SPAWN.x + offsetX,
        STATION_ARENA_ATTACKER_SPAWN.y,
        STATION_ARENA_ATTACKER_SPAWN.z + offsetZ
      );
      this.placePlayerOnPlayableSpawn(col, hint, true);
      this.yaw = STATION_ARENA_SPAWN_YAW;
      this.pitch = 0;
    }

    this.state.reloadTypeLabel = 'REENTROU EM COMBATE · MATA-MATA';
    this.magCheckTimer = 1.6;
    this.emitHud(true);
  }

  public registerKill(
    killerName: string,
    killerTeam: 'VANGUARD' | 'BLACKTHORN',
    victimName: string,
    victimTeam: 'VANGUARD' | 'BLACKTHORN',
    weaponId: WeaponId | 'GRENADE' | 'KNIFE_TACTICAL',
    isHeadshot: boolean
  ): void {
    const now = Date.now();
    const entry: KillfeedEntry = {
      id: `kill_${now}_${Math.random().toString(36).substring(2, 7)}`,
      killerName,
      killerTeam,
      victimName,
      victimTeam,
      weaponId,
      isHeadshot,
      timestamp: now,
    };

    const fresh = this.state.killfeed.filter((e) => now - e.timestamp < 4500);
    this.state.killfeed = [...fresh.slice(-4), entry];

    if (
      this.state.drillMode === 'YARD_BOMB_5V5' ||
      this.state.drillMode === 'DUST2_BOMB_5V5' ||
      this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
      this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
      this.state.drillMode === 'HANGAR_BOMB_5V5' ||
      this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
      this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      isV23BombMapMode(this.state.drillMode) ||
      this.state.drillMode === 'STATION_CAPTURE_5V5' ||
      this.state.drillMode === 'STATION_TDM_5V5'
    ) {
      this.yardBombSystem?.recordKillEvent(
        killerName,
        killerTeam,
        victimName,
        victimTeam,
        isHeadshot,
        this.primaryWeapon
      );
      this.state.yardBomb = { ...this.yardBombSystem.info };
    }

    if (
      killerName === 'VOCÊ' &&
      victimTeam === 'BLACKTHORN' &&
      this.state.drillMode !== 'FREE_RANGE'
    ) {
      this.state.killStreak += 1;
      const ks = this.state.killStreak;
      if (ks === 3) {
        this.state.readyStreak = 'UAV';
        this.showStreakBanner('UAV TÁTICO PRONTO · PRESSIONE [4]', 3.4);
        soundEngine.playMechanicalSwitch(1.25);
      } else if (ks === 5) {
        this.state.readyStreak = 'ARMOR_PACK';
        this.showStreakBanner('PACOTE TÁTICO PRONTO · PRESSIONE [4]', 3.4);
        soundEngine.playMechanicalSwitch(1.3);
      } else if (ks >= 7 && (ks === 7 || (ks - 7) % 4 === 0)) {
        this.state.readyStreak = 'ADVANCED_UAV';
        this.showStreakBanner('UAV AVANÇADO + EMP PRONTO · PRESSIONE [4]', 3.6);
        soundEngine.playMechanicalSwitch(1.35);
      }
    }

    this.emitHud();
  }

  private showStreakBanner(text: string, durationSec = 3.2): void {
    this.state.streakBannerText = text;
    this.streakBannerTimer = durationSec;
  }

  private clearTacticalStreaks(resetReady: boolean): void {
    this.state.killStreak = 0;
    if (resetReady) {
      this.state.readyStreak = 'NONE';
    }
    this.state.activeUavSec = 0;
    this.state.activeEmpSec = 0;
    this.state.empJammedSec = 0;
    this.streakReloadBoostSec = 0;
    this.streakBannerTimer = 0;
    this.state.streakBannerText = null;
    if (this.uavOutlinedActive) {
      this.uavOutlinedActive = false;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (t && t.id !== this.outlinedEnemyBotId) {
          setBotEnemyOutline(t, false);
        }
      }
    }
  }

  public activateReadyStreak(): void {
    if (
      this.state.screen !== 'PLAYING' ||
      this.isPlayerDying ||
      this.playerDeathTp?.isActive()
    ) {
      return;
    }
    const streak: TacticalScorestreakId = this.state.readyStreak;
    if (streak === 'NONE') return;
    this.state.readyStreak = 'NONE';

    const nowMs = performance.now();
    if (streak === 'UAV') {
      this.state.activeUavSec = Math.max(this.state.activeUavSec, 18);
      this.uavOutlinedActive = true;
      this.uavOutlineSyncTimer = 0;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (
          t &&
          t.type === 'COMBAT_BOT' &&
          !t.isDown &&
          !(t as YardBotEntity).isAlly
        ) {
          t.root.userData = t.root.userData || {};
          t.root.userData.radarRevealedUntilMs = Math.max(
            Number(t.root.userData.radarRevealedUntilMs || 0),
            nowMs + 18500
          );
          setBotEnemyOutline(t, true);
        }
      }
      if (isOnlineMatchActive()) {
        publishScorestreakEvent('UAV', 18);
      }
      this.showStreakBanner('UAV TÁTICO ATIVO · RADAR & CONTORNO (18s)', 3.2);
      soundEngine.playMechanicalSwitch(1.35);
      triggerTacticalRadioCallout('TARGET_DOWN');
    } else if (streak === 'ARMOR_PACK') {
      this.state.armor = this.state.maxArmor;
      if (this.state.activeWeapon !== 'KNIFE_TACTICAL') {
        const cap = this.state.magCapacity;
        this.state.magazines = [cap, cap, cap, cap];
      }
      this.streakReloadBoostSec = 15;
      this.showStreakBanner(
        'PACOTE TÁTICO · COLETE 100% + MUNIÇÃO + RECARGA RÁPIDA',
        3.4
      );
      soundEngine.playMechanicalSwitch(1.2);
    } else if (streak === 'ADVANCED_UAV') {
      this.state.activeUavSec = Math.max(this.state.activeUavSec, 22);
      this.state.activeEmpSec = Math.max(this.state.activeEmpSec, 12);
      this.uavOutlinedActive = true;
      this.uavOutlineSyncTimer = 0;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (
          t &&
          t.type === 'COMBAT_BOT' &&
          !t.isDown &&
          !(t as YardBotEntity).isAlly
        ) {
          t.root.userData = t.root.userData || {};
          t.root.userData.radarRevealedUntilMs = Math.max(
            Number(t.root.userData.radarRevealedUntilMs || 0),
            nowMs + 22500
          );
          t.root.userData.empDisruptedUntilMs = Math.max(
            Number(t.root.userData.empDisruptedUntilMs || 0),
            nowMs + 12500
          );
          setBotEnemyOutline(t, true);
        }
      }
      if (isOnlineMatchActive()) {
        publishScorestreakEvent('ADVANCED_UAV', 22);
      }
      this.showStreakBanner(
        'UAV AVANÇADO + PULSO EMP · RADAR 22s · SENSORES INTERROMPIDOS',
        3.6
      );
      soundEngine.playMechanicalSwitch(1.4);
      triggerTacticalRadioCallout('TARGET_DOWN');
    }
    this.emitHud(true);
  }

  public triggerPlayerDeathSequence(
    isHeadshot: boolean,
    killerCallsign: string,
    killerTeam: 'BLACKTHORN' | 'VANGUARD',
    killerWeapon: WeaponId | 'GRENADE',
    onFinish: () => void,
    killerPos?: THREE.Vector3 | null
  ): void {
    if (this.isPlayerDying) return;
    this.state.killStreak = 0;
    this.clearEnemyAimOutline();
    this.isPlayerDying = true;
    this.deathAnimElapsed = 0;
    this.deathSequenceDuration = 2.85;
    this.deathOnFinish = onFinish;
    this.cameraShake = isHeadshot ? 0.048 : 0.028;
    this.state.damageFlashAlpha = 1.0;
    this.grenadeSystem?.unequipFromHand();

    const isBombMode =
      this.state.drillMode === 'YARD_BOMB_5V5' ||
      this.state.drillMode === 'DUST2_BOMB_5V5' ||
      this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
      this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
      this.state.drillMode === 'HANGAR_BOMB_5V5' ||
      this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
      this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      isV23BombMapMode(this.state.drillMode) ||
      this.state.drillMode === 'STATION_CAPTURE_5V5';
    if (isBombMode) {
      markLocalPlayerDownForRevive(this as any);
    } else {
      this.playerReviveUntilSec = 0;
      this.playerReviveExpired = true;
      this.playerCorpsePos = null;
      this._allyReviveCharge = 0;
    }

    this.playerDeathTp.startDeathSequence(
      this.playerPos,
      this.yaw,
      this.state.stance,
      this.state.activeWeapon,
      isHeadshot,
      this.weaponRig.root,
      killerPos
    );

    if (isHeadshot) {
      soundEngine.playHeadshotDeath();
    } else {
      soundEngine.playImpact('TORSO');
    }

    this.registerKill(
      killerCallsign,
      killerTeam,
      'VOCÊ',
      'VANGUARD',
      killerWeapon,
      isHeadshot
    );

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  public addPlayerXp(amount: number): void {
    // Strict: XP / rank unlocks only from online matches with other humans.
    // FREE_RANGE, offline bomb vs AI, killhouse, and solo rooms grant 0.
    if (amount <= 0) return;
    if (this.state.drillMode === 'FREE_RANGE') return;
    if (!canGrantMatchProgressionRewards()) {
      this.state.lastXpGained = 0;
      return;
    }
    const boostedAmount = Math.max(1, Math.round(amount * getActiveVipXpMultiplier()));
    const oldLevel = this.state.rankLevel;
    this.state.playerXp += boostedAmount;
    this.state.lastXpGained = boostedAmount;
    savePlayerXp(this.state.playerXp);

    const rankInfo = getRankForXp(this.state.playerXp);
    this.state.rankLevel = rankInfo.level;
    this.state.rankTitle = rankInfo.title;
    this.state.rankBadge = rankInfo.badge;
    this.state.rankBadgeColor = rankInfo.badgeColor;

    const nextRank = getNextRank(rankInfo.level);
    this.state.nextRankXp = nextRank ? nextRank.requiredXp : rankInfo.requiredXp;

    // Registra a nova patente para exibir a tela dedicada de promoção no Menu Principal ao sair da partida
    if (rankInfo.level > oldLevel) {
      this.state.rankUpNotification = String(rankInfo.level);
    }
  }

  public acknowledgeRankUp(): void {
    if (this.state.rankUpNotification) {
      addPlayerCash(1500);
      this.state.rankUpNotification = null;
      this.emitHud();
    }
  }

  public syncProgressionFromCloud(xp: number, activeWeapon?: WeaponId): void {
    if (xp > this.state.playerXp) {
      this.state.playerXp = xp;
      const rankInfo = getRankForXp(xp);
      const nextRank = getNextRank(rankInfo.level);
      this.state.rankLevel = rankInfo.level;
      this.state.rankTitle = rankInfo.title;
      this.state.rankBadge = rankInfo.badge;
      this.state.rankBadgeColor = rankInfo.badgeColor;
      this.state.nextRankXp = nextRank ? nextRank.requiredXp : rankInfo.requiredXp;
    }
    if (
      activeWeapon &&
      activeWeapon !== this.state.activeWeapon &&
      this.state.screen !== 'PLAYING' &&
      this.state.screen !== 'PAUSED'
    ) {
      this.selectWeapon(activeWeapon, true);
    }
    this.emitHud();
  }

  public setOptic(optic: OpticType, persistToInventory = true): void {
    const validOptic: OpticType = isOpticCompatibleWithWeapon(
      this.state.activeWeapon,
      optic
    )
      ? optic
      : 'iron';
    this.state.optic = validOptic;
    this.state.cantedActive = false;
    this.weaponRig.cantedSightGroup.visible = false;
    this.weaponRig.setOpticType(validOptic);
    if (persistToInventory && this.state.activeWeapon !== 'KNIFE_TACTICAL') {
      equipWeaponOptic(this.state.activeWeapon, validOptic, this.state.playerXp);
    }
    const labels: Record<OpticType, string> = {
      iron: 'MIRA NATIVA / FERRO PADRÃO ATIVADA',
      red_dot: 'AIMPOINT MICRO RED DOT 3D ACOPLADA',
      kolimator: 'KOLIMATOR KOBRA REFLEX 3D ACOPLADA',
      holo: 'MIRA HOLOGRÁFICA EOTECH XPS2 3D ACOPLADA',
      lpvo: 'LUNETA TÁTICA SCOPE LPVO (1-4X) 3D ACOPLADA',
    };
    this.state.reloadTypeLabel = labels[validOptic];
    this.magCheckTimer = 1.6;
    soundEngine.playMechanicalSwitch(1.1);
    this.emitHud();
  }

  public toggleCantedSight(): void {
    this.state.cantedActive = !this.state.cantedActive;
    this.weaponRig.cantedSightGroup.visible = this.state.cantedActive;
    this.state.reloadTypeLabel = this.state.cantedActive
      ? 'MIRA INCLINADA 45° ATIVADA'
      : 'MIRA INCLINADA 45° DESATIVADA';
    this.magCheckTimer = 1.6;
    soundEngine.playMechanicalSwitch(1.25);
    this.emitHud();
  }

  public toggleSuppressor(): void {
    if (this.state.activeWeapon === 'KNIFE_TACTICAL') {
      soundEngine.playMechanicalSwitch(0.7);
      return;
    }

    const order: Array<typeof this.state.muzzleDevice> = [
      'NONE',
      'SILENCER_PACK',
      'SL01_LONG',
      'SC01_SHORT',
      'FH01_FLASH_HIDER',
      'MB01_BRAKE',
      'MC01_COMPENSATOR',
    ];
    const currIdx = order.indexOf(this.state.muzzleDevice);
    const nextIdx = (currIdx + 1) % order.length;
    const nextMuzzle = order[nextIdx];

    this.state.muzzleDevice = nextMuzzle;
    this.weaponRig.attachmentSystem.setMuzzle(nextMuzzle);

    // Suppressor ballistic flags: SILENCER_PACK, SL01, and SC01 act as sound suppressors
    this.state.suppressorAttached =
      nextMuzzle === 'SILENCER_PACK' ||
      nextMuzzle === 'SL01_LONG' ||
      nextMuzzle === 'SC01_SHORT';

    const labels: Record<typeof nextMuzzle, string> = {
      NONE: 'DISPOSITIVO DE BOCA REMOVIDO (CANO ORIGINAL)',
      SILENCER_PACK: 'SILENCIADOR TÁTICO SCOPE PACK ACOPLADO (.GLB REAL)',
      SL01_LONG: 'SUPRESSOR SL01 SLIM LONGO ACOPLADO (.GLB REAL)',
      SC01_SHORT: 'SUPRESSOR SC01 CQB CURTO ACOPLADO (.GLB REAL)',
      FH01_FLASH_HIDER: 'QUEBRA-CHAMAS FH01 PETAL ACOPLADO (.GLB REAL)',
      MB01_BRAKE: 'FREIO DE BOCA MB01 CUT ACOPLADO (.GLB REAL)',
      MC01_COMPENSATOR: 'COMPENSADOR COMPACTO MC01 ACOPLADO (.GLB REAL)',
    };

    this.state.reloadTypeLabel = labels[nextMuzzle];
    this.magCheckTimer = 2.0;
    soundEngine.playMechanicalSwitch(0.85);
    this.emitHud();
  }

  public cycleWeaponCharm(): void {
    const order: Array<typeof this.state.weaponCharm> = [
      'NONE',
      'HONEY_CUB',
      'MICRO_TERMINAL',
      'STARDROP_TEAL',
    ];
    const currIdx = order.indexOf(this.state.weaponCharm);
    const nextIdx = (currIdx + 1) % order.length;
    const nextCharm = order[nextIdx];

    this.state.weaponCharm = nextCharm;
    this.weaponRig.attachmentSystem.setCharm(nextCharm);

    const labels: Record<typeof nextCharm, string> = {
      NONE: 'PINGENTE TÁTICO REMOVIDO',
      HONEY_CUB: 'PINGENTE 3D: URSINHO HONEY CUB ACOPLADO',
      MICRO_TERMINAL: 'PINGENTE 3D: MICRO TERMINAL CYBER ACOPLADO',
      STARDROP_TEAL: 'PINGENTE 3D: STARDROP SMOKE TEAL ACOPLADO',
    };

    this.state.reloadTypeLabel = labels[nextCharm];
    this.magCheckTimer = 2.0;
    soundEngine.playMechanicalSwitch(1.15);
    this.emitHud();
  }

  public toggleLaser(): void {
    this.state.laserActive = !this.state.laserActive;
    this.weaponRig.peqLaserBeam.visible = this.state.laserActive;
    this.laserDotMesh.visible = this.state.laserActive;
    this.state.reloadTypeLabel = this.state.laserActive
      ? 'LASER TÁTICO PEQ-15 ATIVADO'
      : 'LASER TÁTICO PEQ-15 DESATIVADO';
    this.magCheckTimer = 1.6;
    soundEngine.playMechanicalSwitch(1.35);
    this.emitHud();
  }

  public cycleFireMode(): void {
    const order: FireMode[] = ['SEMI', 'BURST', 'AUTO'];
    const idx = (order.indexOf(this.state.fireMode) + 1) % order.length;
    this.state.fireMode = order[idx];
    const modeNames: Record<FireMode, string> = {
      SEMI: 'MODO DE DISPARO: SEMIAUTOMÁTICO (TIRO ÚNICO)',
      BURST: 'MODO DE DISPARO: RAJADA CURTA (3 TIROS)',
      AUTO: 'MODO DE DISPARO: AUTOMÁTICO CONTÍNUO',
    };
    this.state.reloadTypeLabel = modeNames[this.state.fireMode];
    this.magCheckTimer = 1.5;
    soundEngine.playFireModeSwitch();
    this.emitHud();
  }

  public toggleWeaponSlot(): void {
    if (this.state.equippedGrenade !== null) {
      this.grenadeSystem?.unequipFromHand();
      this.state.equippedGrenade = null;
      this.selectWeapon(this.state.activeWeapon);
      return;
    }
    if (
      this.state.activeWeapon === 'P50_PISTOL' ||
      this.state.activeWeapon === 'M1911_PISTOL' ||
      this.state.activeWeapon === 'KNIFE_TACTICAL'
    ) {
      this.selectWeapon(this.primaryWeapon);
    } else {
      this.selectWeapon(this.secondaryWeapon || 'P50_PISTOL');
    }
  }

  public selectWeapon(weaponId: WeaponId, skipInventorySync = false): void {
    this.grenadeSystem?.unequipFromHand();
    this.state.equippedGrenade = null;
    if (weaponId === 'P50_PISTOL' || weaponId === 'M1911_PISTOL') {
      this.secondaryWeapon = weaponId;
    } else if (weaponId !== 'KNIFE_TACTICAL') {
      this.primaryWeapon = weaponId;
      if (
        !skipInventorySync &&
        (this.state.screen === 'PLAYING' || this.state.screen === 'MAIN_MENU')
      ) {
        syncEquippedWeaponToInventory(weaponId);
      }
    }
    this.state.primaryWeapon = this.primaryWeapon;
    this.state.secondaryWeapon = this.secondaryWeapon || 'P50_PISTOL';
    this.state.activeWeapon = weaponId;
    this.weaponRig.setActiveWeapon(weaponId);
    this.weaponRig.applyWeaponSkin(weaponId, getEquippedWeaponSkinId(weaponId));
    this.state.reloadPhase = 'IDLE';
    this.state.reloadProgress = 0;
    this.state.boltLockedBack = false;
    this.state.chambered = 1;
    this.sniperChamberTimer = 0;
    this.sniperReturnToScopeAfterBolt = false;
    this.weaponRig.root.visible = true;

    const savedOptic = getEquippedWeaponOptic(weaponId, this.state.playerXp);
    switch (weaponId) {
      case 'P50_PISTOL':
        this.state.magCapacity = 7;
        this.state.currentMagRounds = 7;
        this.state.magazines = [7, 7, 7, 7, 7];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: DESERT EAGLE .50AE';
        break;
      case 'M1911_PISTOL':
        this.state.magCapacity = 8;
        this.state.currentMagRounds = 8;
        this.state.magazines = [8, 8, 8, 8];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: COLT M1911A1 (.45 ACP)';
        break;
      case 'SMG_45':
        this.state.magCapacity = 32;
        this.state.currentMagRounds = 32;
        this.state.magazines = [32, 32, 32, 32];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: SMG .45 TÁTICA (.45 ACP)';
        break;
      case 'SMG_MP5':
        this.state.magCapacity = 30;
        this.state.currentMagRounds = 30;
        this.state.magazines = [30, 30, 30, 30];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: MPS5 TÁTICA (9x19MM)';
        break;
      case 'SHOTGUN_12':
        this.state.magCapacity = 6;
        this.state.currentMagRounds = 6;
        this.state.magazines = [6, 6, 6, 6];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: DRAKE-12 BREACHER (12GA)';
        break;
      case 'SHOTGUN_SPAS':
        this.state.magCapacity = 8;
        this.state.currentMagRounds = 8;
        this.state.magazines = [8, 8, 8, 8];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: SPAS-12 TÁTICA (CALIBRE 12GA)';
        break;
      case 'M4_CARBINE':
        this.state.magCapacity = 30;
        this.state.currentMagRounds = 30;
        this.state.magazines = [30, 30, 30, 30];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: MX16A4 / M4 TÁTICA (5.56MM)';
        break;
      case 'CARBINE_AR':
        this.state.magCapacity = 30;
        this.state.currentMagRounds = 30;
        this.state.magazines = [30, 30, 30, 30];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: CARABINA TÁTICA (5.56MM)';
        break;
      case 'S_MILITARY':
        this.state.magCapacity = 30;
        this.state.currentMagRounds = 30;
        this.state.magazines = [30, 30, 30, 30];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: SCAR-L S-MILITARY (5.56MM)';
        break;
      case 'AK47_RIFLE':
        this.state.magCapacity = 30;
        this.state.currentMagRounds = 30;
        this.state.magazines = [30, 30, 30, 30];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: AK-47 COMANDO (7.62MM)';
        break;
      case 'AK12_RIFLE':
        this.state.magCapacity = 30;
        this.state.currentMagRounds = 30;
        this.state.magazines = [30, 30, 30, 30];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: AK-200 TÁTICA (5.45MM)';
        break;
      case 'L49_LMG':
        this.state.magCapacity = 100;
        this.state.currentMagRounds = 100;
        this.state.magazines = [100, 100, 100];
        this.state.fireMode = 'AUTO';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: LMG PESADA (5.56MM)';
        break;
      case 'SNIPER_BOLT':
        this.state.magCapacity = 5;
        this.state.currentMagRounds = 5;
        this.state.magazines = [5, 5, 5, 5];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: KAR98K PRECISÃO (7.92MM)';
        break;
      case 'SNIPER_TACTICAL':
        this.state.magCapacity = 10;
        this.state.currentMagRounds = 10;
        this.state.magazines = [10, 10, 10, 10];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: MK14 EBR TÁTICA (.308 WIN)';
        break;
      case 'SNIPER_AWP':
        this.state.magCapacity = 5;
        this.state.currentMagRounds = 5;
        this.state.magazines = [5, 5, 5, 5];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: AWP-M .338 LUNETA (6X)';
        break;
      case 'SNIPER_HEAVY':
        this.state.magCapacity = 5;
        this.state.currentMagRounds = 5;
        this.state.magazines = [5, 5, 5, 5];
        this.state.fireMode = 'SEMI';
        this.setOptic(savedOptic, false);
        this.state.reloadTypeLabel = 'EQUIPADO: M200 INTERVENTION (.408)';
        break;
      case 'RPG7_LAUNCHER':
        this.state.magCapacity = 1;
        this.state.currentMagRounds = 0;
        this.state.magazines = [1, 1, 1, 1];
        this.state.fireMode = 'SEMI';
        this.setOptic('iron', false);
        this.state.reloadTypeLabel = 'EQUIPADO: RPG-7V LANÇA-FOGUETES (PG-7V)';
        break;
      case 'KNIFE_TACTICAL':
        this.state.magCapacity = 1;
        this.state.currentMagRounds = 1;
        this.state.magazines = [1];
        this.state.fireMode = 'SEMI';
        this.setOptic('iron', false);
        this.state.reloadTypeLabel = 'EQUIPADO: FACA TÁTICA COMBATE';
        break;
    }

    // Apply Gunsmith extended-magazine capacity modifier cleanly
    if (weaponId !== 'RPG7_LAUNCHER' && weaponId !== 'KNIFE_TACTICAL') {
      const gunsmith = getWeaponGunsmithModifiers(weaponId);
      const effCap = computeEffectiveMagCapacity(
        weaponId,
        this.state.magCapacity,
        gunsmith
      );
      if (effCap !== this.state.magCapacity) {
        const magCount = this.state.magazines.length;
        this.state.magCapacity = effCap;
        this.state.currentMagRounds = effCap;
        this.state.magazines = Array.from({ length: magCount }, () => effCap);
      }
    }

    this.magCheckTimer = 1.8;
    // Boot calls selectWeapon while the intro video is on screen. The swap
    // sample is the character-equip sound the player was hearing underneath it.
    if (this.state.screen === 'PLAYING') {
      soundEngine.playWeaponSwap(
        weaponId === 'P50_PISTOL' || weaponId === 'M1911_PISTOL'
      );
    }
    if (
      (weaponId === 'AK47_RIFLE' || weaponId === 'AK12_RIFLE') &&
      this.state.screen === 'PLAYING'
    ) {
      setTimeout(() => {
        if (
          this.state.screen === 'PLAYING' &&
          this.state.activeWeapon === weaponId
        ) {
          soundEngine.playAk47BoltRack();
        }
      }, 280);
    }
    this.emitHud();
  }

  public triggerWeaponInspect(): void {
    if (this.state.equippedGrenade !== null) {
      this.grenadeSystem?.unequipFromHand();
      this.state.equippedGrenade = null;
      this.weaponRig.root.visible = true;
    }
    if (
      this.state.reloadPhase !== 'IDLE' &&
      this.state.reloadPhase !== 'MAG_CHECK'
    ) {
      return;
    }
    this.state.reloadPhase = 'IDLE';
    this.weaponRig.triggerInspectAnimation();
    const names: Record<WeaponId, string> = {
      P50_PISTOL: 'INSPECIONANDO DESERT EAGLE (.50 AE)',
      M1911_PISTOL: 'INSPECIONANDO COLT M1911A1 (.45 ACP)',
      SMG_45: 'INSPECIONANDO SMG .45 TÁTICA (.45 ACP)',
      SMG_MP5: 'INSPECIONANDO MPS5 TÁTICA (9x19MM)',
      SHOTGUN_12: 'INSPECIONANDO DRAKE-12 BREACHER (12GA)',
      SHOTGUN_SPAS: 'INSPECIONANDO SPAS-12 TÁTICA (CALIBRE 12GA)',
      M4_CARBINE: 'INSPECIONANDO MX16A4 / M4 TÁTICA (5.56MM)',
      CARBINE_AR: 'INSPECIONANDO CARABINA TÁTICA (5.56MM)',
      S_MILITARY: 'INSPECIONANDO SCAR-L S-MILITARY (5.56MM)',
      AK47_RIFLE: 'INSPECIONANDO AK-47 COMANDO (7.62MM)',
      AK12_RIFLE: 'INSPECIONANDO AK-200 TÁTICA (5.45MM)',
      L49_LMG: 'INSPECIONANDO LMG PESADA (5.56MM)',
      SNIPER_BOLT: 'INSPECIONANDO KAR98K PRECISÃO (7.92MM)',
      SNIPER_TACTICAL: 'INSPECIONANDO MK14 EBR TÁTICA (.308 WIN)',
      SNIPER_AWP: 'INSPECIONANDO AWP-M .338 LUNETA (6X)',
      SNIPER_HEAVY: 'INSPECIONANDO M200 INTERVENTION (.408 CHEYTAC)',
      RPG7_LAUNCHER: 'INSPECIONANDO RPG-7V LANÇA-FOGUETES (85MM)',
      KNIFE_TACTICAL: 'INSPECIONANDO FACA TÁTICA DE COMBATE',
    };
    this.state.reloadTypeLabel = names[this.state.activeWeapon];
    this.magCheckTimer = 2.4;
    if (
      this.state.activeWeapon === 'AK47_RIFLE' ||
      this.state.activeWeapon === 'AK12_RIFLE'
    ) {
      soundEngine.playAk47BoltRack();
    } else {
      soundEngine.playMechanicalSwitch(0.95);
    }
    this.emitHud();
  }

  /** Class support kit (ammo crate / medkit+defib / armor). Key U / dock +. */
  public resupplyAmmo(): void {
    useClassSupport(this as any);
  }

  public setClassSupportHeld(held: boolean): void {
    setClassSupportHeld(this as any, held);
  }

  private lastGrenadeEquipTime = 0;

  public throwGrenade(type: GrenadeType): void {
    if (this.state.screen !== 'PLAYING') return;
    if (this.grenadeSystem.isThrowing()) return;

    // If this grenade type is ALREADY held in the player's hand, clicking it again triggers the pin-pull & throw!
    if (this.state.equippedGrenade === type) {
      this.useEquippedGrenade();
      return;
    }

    // Step 1: Equip the grenade in the player's hand & show the 3D landing trajectory arc!
    if (type === 'FRAG') {
      if (this.state.fragGrenades <= 0) {
        soundEngine.playMechanicalSwitch(0.75);
        this.state.reloadTypeLabel =
          'SEM GRANADAS DE FRAGMENTAÇÃO — REABASTEÇA NO BOTÃO [+]';
        this.magCheckTimer = 1.5;
        this.emitHud(true);
        return;
      }
      this.state.reloadTypeLabel = 'FRAG PRONTA — ATIRE PARA JOGAR';
    } else {
      if (this.state.smokeGrenades <= 0) {
        soundEngine.playMechanicalSwitch(0.75);
        this.state.reloadTypeLabel =
          'SEM GRANADAS DE FUMAÇA (SMOKE) — REABASTEÇA NO BOTÃO [+]';
        this.magCheckTimer = 1.5;
        this.emitHud(true);
        return;
      }
      this.state.reloadTypeLabel = 'SMOKE PRONTA — ATIRE PARA JOGAR';
    }

    // Instant feedback first (haptic + state), then light equip — avoid HUD/startTransition hitch.
    this.lastGrenadeEquipTime = performance.now();
    this.state.isAds = false;
    this.state.reloadPhase = 'IDLE';
    this.state.equippedGrenade = type;
    this.magCheckTimer = 1.6;
    mobileHardware.vibratePinPull();
    this.grenadeSystem.equipInHand(type);
    this.emitHud(true);
  }

  public useEquippedGrenade(): void {
    if (this.state.screen !== 'PLAYING') return;
    if (!this.state.equippedGrenade || this.grenadeSystem.isThrowing()) return;
    // Was 100ms — felt like lag on second tap / fire-to-throw.
    if (performance.now() - this.lastGrenadeEquipTime < 40) return;

    const type = this.state.equippedGrenade;
    if (this.grenadeSystem.triggerPinPullAndThrow()) {
      this.state.isThrowingGrenade = true;
      this.state.reloadTypeLabel =
        type === 'FRAG' ? 'ARREMESSANDO FRAG!' : 'LANÇANDO SMOKE!';
      this.magCheckTimer = 1.2;
      this.emitHud(true);
    }
  }

  private readonly _shellshockCamImpulse = {
    pitchKick: 0,
    rollKick: 0,
    shake: 0,
  };

  private applyAuthoritativeGrenadeVerdictToLocalPlayer(
    blastCenter: THREE.Vector3,
    zone: 'LETHAL_R1' | 'CONCUSSION_R2',
    distanceMeters: number,
    damage: number,
    lethal: boolean,
    shellshockIntensity: number,
    shellshockDurationSec: number,
    attackerCallsign: string,
    attackerTeam: 'VANGUARD' | 'BLACKTHORN',
    impulseVel?: [number, number, number]
  ): void {
    if (
      this.isPlayerDying ||
      this.playerDeathTp?.isActive() ||
      isLocalPlayerPendingRevive(this as any) ||
      this.state.health <= 0
    ) {
      return;
    }

    if (zone === 'LETHAL_R1' || lethal) {
      // Raio 1 (0m a 5.0m): Dano fatal (100% / eliminação imediata) + Grenade Death Cam
      this.shellshockController?.clear();
      this.state.isShellshocked = false;
      this.state.shellshockIntensity = 0;
      this.state.armor = 0;
      this.state.health = 0;
      this.state.damageFlashAlpha = 1.0;
      this.cameraShake = 0.052;
      mobileHardware.vibrateExplosion(1.0);
      playRealPlayerHitGrunt(true);

      this.grenadeKillCam?.triggerLocalPlayerDeath(
        blastCenter,
        this.playerPos,
        attackerCallsign,
        impulseVel
      );
      this.state.grenadeKillCamActive = true;
      this.state.grenadeKillCamKiller = attackerCallsign;
      this.state.grenadeKillCamDistanceM = distanceMeters;

      this.triggerPlayerDeathSequence(
        false,
        attackerCallsign,
        attackerTeam,
        'GRENADE',
        () => {
          this.state.grenadeKillCamActive = false;
          if (this.state.drillMode === 'STATION_TDM_5V5') {
            if (this.yardBombSystem?.info.roundState === 'PLAYING') {
              this.respawnLocalPlayerTdm();
            }
            this.emitHud();
            return;
          }
          const isBomb =
            this.state.drillMode === 'YARD_BOMB_5V5' ||
            this.state.drillMode === 'DUST2_BOMB_5V5' ||
            this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
            this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
            this.state.drillMode === 'HANGAR_BOMB_5V5' ||
            this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
            this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
            isV23BombMapMode(this.state.drillMode) ||
            this.state.drillMode === 'STATION_CAPTURE_5V5';
          if (isBomb) {
            const specBot = this.playerDeathTp.startSpectating(
              this.targets as YardBotEntity[]
            );
            if (specBot && this.yardBombSystem.info.roundState === 'PLAYING') {
              this.yardBombSystem.info.isSpectating = true;
              this.yardBombSystem.info.spectatedCallsign =
                specBot.callsign || 'VANGUARD-02';
              this.yardBombSystem.info.spectatedWeapon =
                specBot.weaponId || 'M4_CARBINE';
              this.yardBombSystem.info.spectatedHealth = Math.max(
                0,
                specBot.health
              );
              this.state.damageFlashAlpha = 0;
            }
          } else if (
            this.state.drillMode === 'KILLHOUSE_BLITZ' ||
            this.state.drillMode === 'TACTICAL_WAVE'
          ) {
            this.state.screen = 'GAME_OVER';
          }
          this.emitHud();
        },
        blastCenter
      );
      return;
    }

    // Raio 2 (5.0m a 11.0m ou protegido parcialmente por cobertura):
    // Sobrevive com dano escalonado (75 até 20), recuo/empurrão na câmera e isShellshocked = true por 4.0s
    const prevHp = this.state.health;
    applyPlayerCombatDamage(this as any, damage, false);
    if (prevHp > 0 && this.state.health <= 0) {
      // No Raio 2 o jogador sobrevive à concussão (mínimo 1 HP)
      this.state.health = 1;
    }
    this.state.damageFlashAlpha = Math.max(
      this.state.damageFlashAlpha,
      0.38 + shellshockIntensity * 0.42
    );
    playRealPlayerHitGrunt(false);
    mobileHardware.vibrateExplosion(Math.max(0.45, shellshockIntensity));

    this.shellshockController?.triggerShellshock(
      blastCenter,
      this.playerPos,
      shellshockIntensity,
      shellshockDurationSec,
      this.playerVel,
      this._shellshockCamImpulse
    );
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + this._shellshockCamImpulse.pitchKick,
      -Math.PI * 0.46,
      Math.PI * 0.46
    );
    this.yaw += this._shellshockCamImpulse.rollKick;
    this.cameraShake = Math.max(
      this.cameraShake,
      this._shellshockCamImpulse.shake
    );
    this.cameraFovPunch = Math.min(
      (this.cameraFovPunch || 0) + 3.8 * shellshockIntensity,
      7.5
    );
    this.state.isShellshocked = true;
    this.state.shellshockIntensity = shellshockIntensity;
    this.state.reloadTypeLabel = `CONCUSSÃO DE GRANADA (${distanceMeters.toFixed(1)}M) · -${damage} HP · ATORDOADO (4.0S)`;
    this.magCheckTimer = 2.6;
  }

  private handleFragGrenadeDetonation(
    blastCenter: THREE.Vector3,
    _blastRadius: number,
    isRemote = false,
    throwerInfo?: GrenadeThrowerInfo
  ): void {
    // Spawn extra metallic/fire spark burst & 3D expansive shockwave ring at detonation point
    _hitNormal.set(0, 1, 0);
    this.fxPool.spawnImpactFX(blastCenter, _hitNormal, true, true);
    this.grenadeKillCam?.spawnShockwaveAt(blastCenter);

    const activeGlbCol = this.getActiveGlbCollider();
    const localOp = getLocalOnlinePlayerState();
    const myTeam = localOp?.team || 'VANGUARD';
    const enemyTeam = myTeam === 'VANGUARD' ? 'BLACKTHORN' : 'VANGUARD';

    // Em partidas online PvP, o cliente que lançou a granada envia GRENADE_DETONATE ao servidor autoritativo
    if (isOnlineMatchActive() && !isRemote && !throwerInfo?.isBot) {
      const room = getActiveOnlineRoom();
      const occludedUids: string[] = [];
      if (room && this.bombBlastManager) {
        for (const p of Object.values(room.players)) {
          if (!p || p.isDown) continue;
          _worldPos2.set(p.x, p.y, p.z);
          if (
            _worldPos2.distanceTo(blastCenter) <= GRENADE_CONCUSSION_RADIUS_M &&
            this.bombBlastManager.isProtectedByCover(
              blastCenter,
              _worldPos2,
              this.colliders,
              activeGlbCol
            )
          ) {
            occludedUids.push(p.uid);
          }
        }
      }
      publishGrenadeDetonation(
        [blastCenter.x, blastCenter.y, blastCenter.z],
        occludedUids
      );
    }

    // Se a granada veio de outro jogador remoto via WS, o servidor aplicará o veredito via ON_GRENADE_DETONATED
    if (isRemote && isOnlineMatchActive() && !throwerInfo?.isBot) {
      this.emitHud();
      return;
    }

    // Avalia impacto da granada no JOGADOR LOCAL (em partidas contra bots/treino ou auto-dano offline)
    if (!isOnlineMatchActive() || isPrivateRoomWithBotsActive()) {
      const isEnemyBotGrenade =
        Boolean(throwerInfo?.isBot) && throwerInfo?.team !== myTeam;
      const isSelfGrenade = !throwerInfo?.isBot && !isRemote;
      if (isEnemyBotGrenade || isSelfGrenade) {
        const playerBehindCover = this.bombBlastManager
          ? this.bombBlastManager.isProtectedByCover(
              blastCenter,
              this.playerPos,
              this.colliders,
              activeGlbCol
            )
          : false;
        const playerVerdict = evaluateGrenadeTwoRadiusVerdict(
          blastCenter.x,
          blastCenter.y,
          blastCenter.z,
          this.playerPos.x,
          this.playerPos.y,
          this.playerPos.z,
          playerBehindCover
        );
        // Fora de 11.0m: zero impacto (100% velocidade, visão e audição normais)
        if (playerVerdict.zone !== 'OUTSIDE') {
          const killerName = isEnemyBotGrenade
            ? throwerInfo?.callsign || 'KRAKEN-BT'
            : localOp?.callsign || 'VOCÊ';
          const killerTeam = isEnemyBotGrenade ? enemyTeam : myTeam;
          this.applyAuthoritativeGrenadeVerdictToLocalPlayer(
            blastCenter,
            playerVerdict.zone,
            playerVerdict.distanceMeters,
            playerVerdict.damageApplied,
            playerVerdict.lethal,
            playerVerdict.shellshockIntensity,
            playerVerdict.shellshockDurationSec,
            killerName,
            killerTeam,
            playerVerdict.impulseVel
          );
        }
      }
    }

    // Se a granada foi jogada por um bot inimigo, ela também não dá pontos de hitmarker ao jogador local
    if (throwerInfo?.isBot && throwerInfo.team !== myTeam) {
      this.emitHud();
      return;
    }

    let targetsHitCount = 0;
    let killsCount = 0;
    let concussedCount = 0;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.isDown || (t as YardBotEntity).isAlly) continue;

      const remoteUid = t.root.userData?.remotePlayerUid as string | undefined;
      // Jogadores humanos remotos em partida online recebem dano via ON_GRENADE_DETONATED autoritativo
      if (remoteUid && isOnlineMatchActive()) continue;

      const dist = t.root.position.distanceTo(blastCenter);
      if (dist > GRENADE_CONCUSSION_RADIUS_M) continue;

      if (t.type === 'STEEL_GONG') {
        targetsHitCount++;
        this.state.hits += 1;
        soundEngine.playImpact('STEEL_GONG');
        t.hitTiltVelocity = -18.0;
        this.state.score += 100;
        continue;
      }

      const targetBehindCover = this.bombBlastManager
        ? this.bombBlastManager.isProtectedByCover(
            blastCenter,
            t.root.position,
            this.colliders,
            activeGlbCol
          )
        : false;
      const verdict = evaluateGrenadeTwoRadiusVerdict(
        blastCenter.x,
        blastCenter.y,
        blastCenter.z,
        t.root.position.x,
        t.root.position.y,
        t.root.position.z,
        targetBehindCover
      );
      if (verdict.zone === 'OUTSIDE') continue;

      targetsHitCount++;
      this.state.hits += 1;

      if (verdict.zone === 'LETHAL_R1') {
        // Raio 1 (0m a 5.0m exposto): Dano fatal (100% / eliminação imediata) + arremesso forte do bot
        if (t.armorHealth > 0) {
          t.armorHealth = 0;
          if (t.armorMesh) t.armorMesh.visible = false;
        }
        t.health = 0;
        t.hitTiltVelocity = -22.0;
      } else {
        // Raio 2 (5.0m a 11.0m ou cobertura parcial): Dano escalonado (75..20) + concussão de 4.0s
        let remainingDmg = verdict.damageApplied;
        if (t.armorHealth > 0) {
          const absorbed = Math.min(t.armorHealth, Math.round(remainingDmg * 0.55));
          t.armorHealth -= absorbed;
          remainingDmg = Math.max(10, remainingDmg - absorbed);
          if (t.armorHealth <= 0 && t.armorMesh) {
            t.armorMesh.visible = false;
          }
        }
        t.health -= remainingDmg;
        t.hitTiltVelocity = -14.0;
        concussedCount++;
        t.root.userData = t.root.userData || {};
        t.root.userData.concussedUntilMs =
          performance.now() + verdict.shellshockDurationSec * 1000;
        triggerBotHitAnimation(t);
      }

      if (t.health <= 0) {
        killsCount++;
        t.isDown = true;
        t.lastDeathWasHeadshot = false;
        t.downTimer =
          this.state.drillMode === 'FREE_RANGE'
            ? 2.6
            : this.state.drillMode === 'STATION_TDM_5V5'
              ? 3.2
              : 9999;
        t.isTelegraphing = false;
        if (t.laserLine) t.laserLine.visible = false;
        this.state.score += 150;
        this.state.lastHitZone = 'KILL';
        const bot = t as YardBotEntity;
        const groundY = this.getCurrentGroundHeight(
          bot.root.position.x,
          bot.root.position.y,
          bot.root.position.z
        );
        this.grenadeKillCam?.triggerBotBlastThrow(
          bot,
          blastCenter,
          verdict.distanceMeters,
          groundY
        );
        this.registerKill(
          localOp?.callsign || 'VOCÊ',
          myTeam,
          bot.callsign || 'INIMIGO-BT',
          enemyTeam,
          'GRENADE',
          false
        );
      } else {
        this.state.score += 55;
        this.state.lastHitZone = 'TORSO';
      }
    }

    if (targetsHitCount > 0) {
      this.state.hitMarkerAlpha = 1.0;
      this.state.hitMarkerIsCrit = killsCount > 0;
      this.state.hitMarkerIsKill = killsCount > 0;
      if (killsCount > 0) {
        this.state.killConfirmAlpha = 1.0;
        this.state.killConfirmLabel =
          killsCount > 1 ? `${killsCount}x HITKILL GRANADA!` : 'ABATE GRANADA (RAIO 1)';
      }
      this.state.reloadTypeLabel =
        killsCount > 0
          ? `RAIO FATAL (${GRENADE_LETHAL_RADIUS_M}M)! ${killsCount} ELIMINADO(S)${concussedCount > 0 ? ` · ${concussedCount} ATORDOADO(S)` : ''}`
          : `RAIO DE CONCUSSÃO (${GRENADE_CONCUSSION_RADIUS_M}M)! ${targetsHitCount} ALVO(S) ATORDOADO(S)`;
      this.magCheckTimer = 2.2;

      if (
        this.state.drillMode === 'KILLHOUSE_BLITZ' ||
        this.state.drillMode === 'TACTICAL_WAVE' ||
        this.state.drillMode === 'YARD_BOMB_5V5' ||
        this.state.drillMode === 'DUST2_BOMB_5V5' ||
        this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
        this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
        this.state.drillMode === 'HANGAR_BOMB_5V5' ||
        this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
        this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
        isV23BombMapMode(this.state.drillMode) ||
        this.state.drillMode === 'STATION_CAPTURE_5V5' ||
        this.state.drillMode === 'STATION_TDM_5V5'
      ) {
        const remaining = this.targets.filter(
          (t) =>
            t.sector === 'KILLHOUSE' &&
            !t.isDown &&
            !(t as YardBotEntity).isAlly
        ).length;
        this.state.targetsRemaining = remaining;

        if (
          remaining === 0 &&
          (this.state.drillMode === 'KILLHOUSE_BLITZ' ||
            this.state.drillMode === 'TACTICAL_WAVE')
        ) {
          if (
            this.state.bestCourseTimeSec === null ||
            this.state.courseTimerSec < this.state.bestCourseTimeSec
          ) {
            this.state.bestCourseTimeSec = Number(
              this.state.courseTimerSec.toFixed(2)
            );
          }
          this.addPlayerXp(350);
          this.state.screen = 'VICTORY';
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
      }
    }

    this.emitHud();
  }

  public handleRpgExplosion(
    blastCenter: THREE.Vector3,
    impactNormal?: THREE.Vector3
  ): void {
    const blastRadius = 6.2;
    soundEngine.playGrenadeExplosion();
    this.fxPool.spawnImpactFX(blastCenter, impactNormal || _up, true, true);
    this.cameraShake = Math.min(this.cameraShake + 0.032, 0.045);
    mobileHardware.vibrateExplosion();
    triggerShellshockTinnitus(blastCenter, this.playerPos);

    let targetsHitCount = 0;
    let killsCount = 0;

    for (let i = 0; i < this.targets.length; i++) {
      const t = this.targets[i];
      if (t.isDown || (t as YardBotEntity).isAlly) continue;

      const dist = t.root.position.distanceTo(blastCenter);
      if (dist > blastRadius) continue;

      targetsHitCount++;
      this.state.hits += 1;

      if (t.type === 'STEEL_GONG') {
        soundEngine.playImpact('STEEL_GONG');
        t.hitTiltVelocity = -22.0;
        this.state.score += 120;
        continue;
      }

      const falloff = Math.max(0.28, 1 - dist / (blastRadius * 1.12));
      const blastDmg = Math.round(220 * falloff);

      if (t.armorHealth > 0) {
        t.armorHealth = 0;
        if (t.armorMesh) t.armorMesh.visible = false;
      }

      t.health -= blastDmg;
      t.hitTiltVelocity = -20.0;

      const remoteUid = t.root.userData?.remotePlayerUid as string | undefined;
      if (remoteUid && isOnlineMatchActive()) {
        publishCombatHit(remoteUid, blastDmg, false, 'RPG7_LAUNCHER');
      }

      if (t.health <= 0) {
        killsCount++;
        t.isDown = true;
        t.lastDeathWasHeadshot = false;
        t.downTimer =
          this.state.drillMode === 'FREE_RANGE'
            ? 2.6
            : this.state.drillMode === 'STATION_TDM_5V5'
              ? 3.2
              : 9999;
        t.isTelegraphing = false;
        if (t.laserLine) t.laserLine.visible = false;
        this.state.score += 175;
        this.state.lastHitZone = 'KILL';
        const bot = t as YardBotEntity;
        const localOp = getLocalOnlinePlayerState();
        const myTeam = localOp?.team || 'VANGUARD';
        const enemyTeam = myTeam === 'VANGUARD' ? 'BLACKTHORN' : 'VANGUARD';
        this.registerKill(
          localOp?.callsign || 'VOCÊ',
          myTeam,
          bot.callsign || 'INIMIGO-BT',
          enemyTeam,
          'RPG7_LAUNCHER',
          false
        );
      } else {
        this.state.score += 65;
        this.state.lastHitZone = 'TORSO';
      }
    }

    if (targetsHitCount > 0) {
      this.state.hitMarkerAlpha = 1.0;
      this.state.hitMarkerIsCrit = killsCount > 0;
      this.state.hitMarkerIsKill = killsCount > 0;
      if (killsCount > 0) {
        this.state.killConfirmAlpha = 1.0;
        this.state.killConfirmLabel =
          killsCount > 1 ? `${killsCount}x EXPLOSÃO RPG!` : 'ABATE RPG-7!';
      }
      this.state.reloadTypeLabel =
        killsCount > 0
          ? `DETONAÇÃO RPG-7V! ${killsCount} ALVO(S) ELIMINADO(S)`
          : `ONDA DE CHOQUE RPG-7V EM ${targetsHitCount} ALVO(S)!`;
      this.magCheckTimer = 2.0;

      if (
        this.state.drillMode === 'KILLHOUSE_BLITZ' ||
        this.state.drillMode === 'TACTICAL_WAVE' ||
        this.state.drillMode === 'YARD_BOMB_5V5' ||
        this.state.drillMode === 'DUST2_BOMB_5V5' ||
        this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
        this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
        this.state.drillMode === 'HANGAR_BOMB_5V5' ||
        this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
        this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
        isV23BombMapMode(this.state.drillMode) ||
        this.state.drillMode === 'STATION_CAPTURE_5V5' ||
        this.state.drillMode === 'STATION_TDM_5V5'
      ) {
        const remaining = this.targets.filter(
          (t) =>
            t.sector === 'KILLHOUSE' &&
            !t.isDown &&
            !(t as YardBotEntity).isAlly
        ).length;
        this.state.targetsRemaining = remaining;
      }
    }

    this.emitHud();
  }

  public toggleMute(): void {
    this.state.muted = !this.state.muted;
    soundEngine.muted = this.state.muted;
    this.emitHud();
  }

  public toggleDockCollapsed(): void {
    this.state.dockCollapsed = !this.state.dockCollapsed;
    this.emitHud();
  }

  public toggleTouchControlsVisible(): void {
    this.state.touchControlsVisible = !this.state.touchControlsVisible;
    this.emitHud();
  }

  public setTouchMovement(moveX: number, moveY: number, sprinting: boolean): void {
    if (this.bulletCamManager?.isActive()) {
      this.touchMoveX = 0;
      this.touchMoveY = 0;
      this.touchSprinting = false;
      return;
    }
    this.touchMoveX = THREE.MathUtils.clamp(moveX, -1, 1);
    this.touchMoveY = THREE.MathUtils.clamp(moveY, -1, 1);
    this.touchSprinting = sprinting;
  }

  public applyTouchLookDelta(dx: number, dy: number): void {
    if (this.bulletCamManager?.isActive()) return;
    const assistTargets = (this.targets || []).map((t) => ({
      position: t.root.position,
      isDown: t.isDown,
      isAlly: Boolean((t as { isAlly?: boolean }).isAlly),
    }));
    const assisted = applyAimAssistToLookDelta(
      dx,
      dy,
      this.camera,
      assistTargets,
      this.state.aimAssistStrength || 0,
      this.state.isAds
    );
    applyLookDelta(
      this.state,
      this as unknown as LookInputState,
      assisted.dx,
      assisted.dy
    );
  }

  public setAimAssistStrength(strength: number): void {
    this.state.aimAssistStrength = THREE.MathUtils.clamp(strength, 0, 1);
    this.emitHud();
  }

  public configurePostFx(opts: {
    enabled: boolean;
    sharpen?: number;
  }): void {
    configureTacticalPostFx(this.postFx, this.renderer, {
      enabled: opts.enabled,
      sharpen: opts.sharpen ?? 0.55,
      biome: this.skySystem?.getPostFxBiome(),
    });
  }

  public setTouchFireHeld(held: boolean): void {
    if (this.bulletCamManager?.isActive()) {
      this.touchFireHeld = false;
      if (held) {
        this.skipBulletCam();
      }
      return;
    }
    if (this.state.screen !== 'PLAYING') {
      this.touchFireHeld = false;
      return;
    }
    const wasHeld = this.touchFireHeld;
    this.touchFireHeld = held;
    if (held && !wasHeld) {
      this.triggerPulledThisPress = false;
      this.attemptFireWeapon();
    } else if (!held) {
      this.triggerPulledThisPress = false;
    }
  }

  public toggleAds(): void {
    if (this.state.screen !== 'PLAYING' || this.bulletCamManager?.isActive()) return;
    if (this.state.equippedGrenade !== null) {
      this.grenadeSystem?.unequipFromHand();
      this.state.equippedGrenade = null;
      this.weaponRig.root.visible = true;
    }
    if (this.sniperChamberTimer > 0) {
      this.sniperReturnToScopeAfterBolt = !this.sniperReturnToScopeAfterBolt;
      soundEngine.playMechanicalSwitch(1.05);
      this.emitHud();
      return;
    }
    this.state.isAds = !this.state.isAds;
    if (!this.state.isAds) {
      this.touchHoldBreath = false;
    }
    soundEngine.playAimTransition(this.state.isAds);
    this.emitHud();
  }

  public triggerJump(): void {
    if (this.state.screen !== 'PLAYING' || this.bulletCamManager?.isActive()) return;
    this.state.isCrouchingToggled = false;
    this.state.isProneToggled = false;
    this.slideTimer = 0;
    this.jumpBufferTimer = 0.18;
    this.emitHud();
  }

  public triggerProne(): void {
    if (this.state.screen !== 'PLAYING' || this.bulletCamManager?.isActive()) return;
    this.slideTimer = 0;
    this.state.isProneToggled = !this.state.isProneToggled;
    if (this.state.isProneToggled) {
      this.state.isCrouchingToggled = false;
    }
    soundEngine.playMechanicalSwitch(0.75);
    this.emitHud();
  }

  public toggleCrouchOrSlide(): void {
    if (this.state.screen !== 'PLAYING' || this.bulletCamManager?.isActive()) return;

    // Mid-slide crouch tap = slide cancel into crouch (COD).
    if (this.slideTimer > 0) {
      this.slideTimer = 0;
      this.state.isCrouchingToggled = true;
      this.slideForcedCrouch = false;
      this.state.stance = 'CROUCH';
      this.playerVel.x *= 0.5;
      this.playerVel.z *= 0.5;
      this.cameraFovPunch = Math.min((this.cameraFovPunch || 0) + 2.0, 6);
      this.emitHud();
      return;
    }

    const isMovingForwardFast =
      (this.touchSprinting ||
        (this.keysHeld.has('ShiftLeft') && this.keysHeld.has('KeyW')) ||
        this.touchMoveY > 0.75) &&
      this.isGrounded &&
      this.slideTimer <= 0;

    if (isMovingForwardFast && !this.state.isCrouchingToggled && !this.state.isProneToggled) {
      this.slideTimer = 0.72;
      this.camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      this.slideDir.copy(_forward);
      this.slideForcedCrouch = !this.state.isCrouchingToggled;
      this.state.isCrouchingToggled = true;
      this.state.isProneToggled = false;
      this.cameraFovPunch = Math.min(this.cameraFovPunch + 3.2, 7);
      soundEngine.playPlayerSlide();
    } else if (this.state.isProneToggled) {
      // Stand up from Prone
      this.state.isProneToggled = false;
      this.state.isCrouchingToggled = false;
      soundEngine.playMechanicalSwitch(0.85);
    } else if (this.state.isCrouchingToggled) {
      // Drop to Prone from Crouch
      this.state.isCrouchingToggled = false;
      this.state.isProneToggled = true;
      soundEngine.playMechanicalSwitch(0.75);
    } else {
      // Crouch from Stand
      this.state.isCrouchingToggled = true;
      this.state.isProneToggled = false;
      soundEngine.playMechanicalSwitch(0.8);
    }
    this.emitHud();
  }

  public toggleLean(dir: -1 | 1): void {
    if (this.state.screen !== 'PLAYING') return;
    this.touchLeanToggle = this.touchLeanToggle === dir ? 0 : dir;
    soundEngine.playMechanicalSwitch(0.95);
    this.emitHud();
  }

  public setHoldBreath(held: boolean): void {
    this.touchHoldBreath = held;
  }

  public cycleLpvoZoom(): void {
    if (this.state.optic !== 'lpvo') {
      this.setOptic('lpvo');
    } else {
      this.state.lpvoZoom =
        this.state.lpvoZoom >= 3.5 ? 1.0 : this.state.lpvoZoom + 1.0;
      soundEngine.playMechanicalSwitch(1.2);
      this.emitHud();
    }
  }

  // =========================================================================
  // MOBILE GPU QUALITY PRESETS, DRS, GYROSCOPE, HAPTICS & FULLSCREEN
  // =========================================================================
  public setQualityPreset(preset: QualityPreset): void {
    this.state.qualityPreset = preset;
    if (preset === 'COMPETITIVE_120') {
      this.setGraphicQuality('LOW');
      this.setFpsLimit(120);
    } else if (preset === 'BALANCED_60') {
      this.setGraphicQuality('HIGH');
      this.setFpsLimit(60);
    } else {
      this.setGraphicQuality('HIGH');
      this.setFpsLimit(0);
    }
  }

  public setGraphicQuality(quality: 'HIGH' | 'LOW'): void {
    this.state.graphicQuality = quality;
    if (!this.isSoftwareGl) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
      if (quality === 'HIGH') {
        this.renderer.shadowMap.enabled = true;
        this.keyLight.castShadow = true;
        this.currentRenderScale = dpr;
        configureIntermittentShadows(this.renderer);
        requestShadowRefresh(this.shadowBudget);
      } else {
        this.renderer.shadowMap.enabled = false;
        this.keyLight.castShadow = false;
        this.currentRenderScale = 1.0;
      }
      this.renderer.setPixelRatio(this.currentRenderScale);
      this.renderer.shadowMap.needsUpdate = true;
      this.state.renderScalePercent = Math.round(
        (this.currentRenderScale / dpr) * 100
      );
    }
    soundEngine.playMechanicalSwitch(1.15);
    this.emitHud();
  }

  public setFpsLimit(fps: number): void {
    this.state.fpsLimit = Math.max(0, Math.min(120, fps));
    soundEngine.playMechanicalSwitch(1.05);
    this.emitHud();
  }

  public toggleDynamicResolution(): void {
    this.state.dynamicResolutionEnabled = !this.state.dynamicResolutionEnabled;
    soundEngine.playMechanicalSwitch(1.0);
    this.emitHud();
  }

  public async setGyroMode(mode: GyroMode): Promise<void> {
    this.state.gyroMode = mode;
    if (mode === 'OFF') {
      mobileHardware.disableGyroscope();
    } else {
      await this.enableGyroSensor();
    }
    soundEngine.playMechanicalSwitch(1.15);
    this.emitHud();
  }

  private async enableGyroSensor(): Promise<void> {
    await mobileHardware.enableGyroscope((dx, dy) => {
      if (this.state.screen !== 'PLAYING') return;
      if (this.state.gyroMode === 'OFF') return;
      if (this.state.gyroMode === 'ADS_ONLY' && !this.state.isAds) return;
      const sens = this.state.gyroSensitivity;
      this.applyTouchLookDelta(dx * sens, dy * sens);
    });
  }

  public setGyroSensitivity(sens: number): void {
    this.state.gyroSensitivity = THREE.MathUtils.clamp(sens, 0.2, 3.0);
    this.emitHud();
  }

  public setLookSensitivity(sens: number): void {
    this.state.lookSensitivity = THREE.MathUtils.clamp(sens, 0.2, 3.0);
    this.emitHud();
  }

  public setAdsSensitivity(sens: number): void {
    this.state.adsSensitivity = THREE.MathUtils.clamp(sens, 0.2, 3.0);
    this.emitHud();
  }

  public recalibrateGyro(): void {
    mobileHardware.recalibrateGyroCenter();
    soundEngine.playMechanicalSwitch(1.3);
  }

  public toggleHaptics(): void {
    this.state.hapticsEnabled = !this.state.hapticsEnabled;
    mobileHardware.hapticsEnabled = this.state.hapticsEnabled;
    if (this.state.hapticsEnabled) {
      mobileHardware.vibrateHitConfirm(false);
    }
    this.emitHud();
  }

  public async enterFullscreenLandscape(): Promise<void> {
    const active = await mobileHardware.enterFullscreenLandscape();
    this.state.isFullscreen = active;
    this.onResize();
    this.emitHud();
  }

  public async toggleFullscreenLandscape(): Promise<void> {
    const active = await mobileHardware.toggleFullscreenLandscape();
    this.state.isFullscreen = active;
    this.onResize();
    this.emitHud();
  }

  private updateDynamicResolutionGovernor(rawDt: number): void {
    updateDynamicResolutionGovernor(
      this.drsState,
      this.state,
      this.renderer,
      rawDt,
      {
        isSoftwareGl: this.isSoftwareGl,
        suppressResize:
          this.touchFireHeld ||
          this.mouseButtonsHeld.has(0) ||
          this.state.isAds,
      }
    );
  }

  public resetScenario(mode: DrillMode, keepMatchScore = false): void {
    const loadoutMod = getClassCombatModifiers();
    this.state.drillMode = mode;
    runtimeTelemetry.setContext(mode, this.state.qualityPreset);
    resetClassSupportForRound(this as any);
    this.playerReviveUntilSec = 0;
    this.playerReviveExpired = false;
    this.playerCorpsePos = null;
    this._allyReviveCharge = 0;
    try {
      this.classKitProps?.hide?.();
    } catch {
      /* optional */
    }
    this.state.stamina = 100;
    this.bulletCamManager?.reset();
    this.syncBulletCamHudState();
    this.bombBlastManager?.reset();
    this.shellshockController?.clear();
    this.grenadeKillCam?.clear();
    this.state.isShellshocked = false;
    this.state.shellshockIntensity = 0;
    this.state.grenadeKillCamActive = false;
    this.pendingBlastAuthorityPayload = null;
    this.clearEnemyAimOutline();
    this.state.hitMarkerAlpha = 0;
    this.state.hitMarkerIsCrit = false;
    this.state.hitMarkerIsKill = false;
    this.state.killConfirmAlpha = 0;
    this.state.killConfirmLabel = '';
    this.isPlayerDying = false;
    this.deathAnimElapsed = 0;
    this.deathOnFinish = null;
    this.currentEyeHeight = 1.68;
    this.camera.rotation.z = 0;
    if (this.weaponRig?.root) {
      this.weaponRig.root.position.y = 0;
      this.weaponRig.root.rotation.x = 0;
      this.weaponRig.root.visible = true;
      this.playerDeathTp?.stop(this.camera, this.weaponRig.root);
      this.postMatchShowcase?.stop(this.camera, this.weaponRig.root);
    }
    this.sprintExhausted = false;
    this.sprintPoseAlpha = 0;
    this.cachedClassAdsMult = loadoutMod.adsSpeedMult;
    this.cachedClassSprintMult = loadoutMod.sprintSpeedMult;
    if (!keepMatchScore) {
      stopMatchEndFanfare();
      this.clearTacticalStreaks(true);
      this.state.score = 0;
      this.state.hits = 0;
      this.state.shotsFired = 0;
      this.state.headshots = 0;
      this.state.courseTimerSec = 0;
      this.state.killfeed = [];
    } else {
      // Between bomb rounds, clear active UAV/EMP timers cleanly
      this.state.activeUavSec = 0;
      this.state.activeEmpSec = 0;
      this.state.empJammedSec = 0;
      this.streakReloadBoostSec = 0;
      if (this.uavOutlinedActive) {
        this.uavOutlinedActive = false;
        for (let i = 0; i < this.targets.length; i++) {
          setBotEnemyOutline(this.targets[i], false);
        }
      }
    }
    this.state.damageFlashAlpha = 0;
    this.secondaryWeapon = loadoutMod.secondaryWeapon || 'P50_PISTOL';
    this.state.secondaryWeapon = this.secondaryWeapon;
    const startingWeapon = !keepMatchScore
      ? loadoutMod.primaryWeapon
      : this.primaryWeapon || loadoutMod.primaryWeapon || 'M4_CARBINE';
    this.weaponRig?.prewarmLoadout([
      startingWeapon,
      this.secondaryWeapon || 'P50_PISTOL',
      'KNIFE_TACTICAL',
    ]);
    this.weaponRig?.pruneUnusedWeapons([
      startingWeapon,
      this.secondaryWeapon || 'P50_PISTOL',
      'KNIFE_TACTICAL',
    ]);
    this.selectWeapon(startingWeapon);
    this.state.fragGrenades = loadoutMod.fragCount;
    this.state.smokeGrenades = loadoutMod.smokeCount;
    this.state.equippedGrenade = null;
    this.state.isThrowingGrenade = false;
    this.grenadeSystem?.clearAll();
    this.state.boltLockedBack = false;
    this.state.reloadPhase = 'IDLE';

    // Activate bomb arenas, Stander de Tiro (FREE_RANGE), or Killhouse Facility
    const assetMode = arenaAssetMode(mode);
    const harness = isMapSpawnHarness(mode);
    const isYard = assetMode === 'YARD_BOMB_5V5';
    const isDust2 = assetMode === 'DUST2_BOMB_5V5';
    const isAssault = assetMode === 'ASSAULT_BOMB_5V5';
    const isIndustria = assetMode === 'INDUSTRIA_BOMB_5V5';
    const isHangar = assetMode === 'HANGAR_BOMB_5V5';
    const isEasternCity = assetMode === 'EASTERN_CITY_BOMB_5V5';
    const isMirageAnubis = assetMode === 'MIRAGE_ANUBIS_BOMB_5V5';
    const isCsgoAssault = assetMode === 'CSGO_ASSAULT_BOMB_5V5';
    const isDeDst = assetMode === 'DE_DST_BOMB_5V5';
    const isMpNuked = assetMode === 'MP_NUKED_BOMB_5V5';
    const isDeSupply = assetMode === 'DE_SUPPLY_BOMB_5V5';
    const isYardV2 = assetMode === 'YARD_V2_BOMB_5V5';
    const isV23Map = isCsgoAssault || isDeDst || isMpNuked || isDeSupply || isYardV2;
    const isStationArena =
      assetMode === 'STATION_CAPTURE_5V5' || assetMode === 'STATION_TDM_5V5';
    const isFreeRange = assetMode === 'FREE_RANGE';
    const isBombMode =
      !harness &&
      (isYard ||
        isDust2 ||
        isAssault ||
        isIndustria ||
        isHangar ||
        isEasternCity ||
        isMirageAnubis ||
        isV23Map ||
        isStationArena);

    // Prefer prepareMatchArena (Loading 2) to have already loaded the GLB.
    // Fallback await-path only if somehow starting without prepare.
    if (isFreeRange && !this.standerTiroLevelData.isLoaded) {
      void loadStanderTiroMapGeometry(
        this.standerTiroLevelData,
        this.isSoftwareGl
      ).then(() => {
        if (this.state.drillMode === 'FREE_RANGE') {
          this.standerTiroLevelData.levelGroup.visible = true;
        }
      });
    }

    this.standerTiroLevelData.levelGroup.visible =
      isFreeRange && this.standerTiroLevelData.isLoaded;
    this.facilityLevelData.levelGroup.visible = !isBombMode && !isFreeRange;
    this.yardLevelData.levelGroup.visible = isYard;
    this.dust2LevelData.levelGroup.visible = isDust2;
    this.assaultLevelData.levelGroup.visible = isAssault;
    this.industriaLevelData.levelGroup.visible = isIndustria;
    this.hangarLevelData.levelGroup.visible = isHangar;
    this.easternCityLevelData.levelGroup.visible = isEasternCity;
    this.mirageAnubisLevelData.levelGroup.visible = isMirageAnubis;
    this.csgoAssaultLevelData.levelGroup.visible = isCsgoAssault;
    this.deDstLevelData.levelGroup.visible = isDeDst;
    this.mpNukedLevelData.levelGroup.visible = isMpNuked;
    this.deSupplyLevelData.levelGroup.visible = isDeSupply;
    this.yardV2LevelData.levelGroup.visible = isYardV2;
    this.stationArenaLevelData.levelGroup.visible = isStationArena;

    const activeLevel = isDust2
      ? this.dust2LevelData
      : isAssault
        ? this.assaultLevelData
        : isIndustria
          ? this.industriaLevelData
          : isHangar
            ? this.hangarLevelData
            : isEasternCity
              ? this.easternCityLevelData
            : isMirageAnubis
              ? this.mirageAnubisLevelData
            : isCsgoAssault
              ? this.csgoAssaultLevelData
            : isDeDst
              ? this.deDstLevelData
            : isMpNuked
              ? this.mpNukedLevelData
            : isDeSupply
              ? this.deSupplyLevelData
            : isYardV2
              ? this.yardV2LevelData
            : isStationArena
              ? this.stationArenaLevelData
            : isYard
              ? this.yardLevelData
              : isFreeRange
                ? this.standerTiroLevelData
                : this.facilityLevelData;
    this.colliders = activeLevel.colliders;
    this.targets = activeLevel.targets;
    this.targetMap.clear();
    for (let i = 0; i < this.targets.length; i++) {
      this.targetMap.set(this.targets[i].id, this.targets[i]);
    }
    this.shootableMeshes = activeLevel.shootableMeshes;
    this.wallStandPositions = activeLevel.wallStandPositions;
    this.cachedRadarTargets = [];
    this.aimRaycastInitialized = false;

    this.skySystem.configureForMode(mode, this.scene.fog !== null);
    setTacticalPostFxBiome(this.postFx, this.skySystem.getPostFxBiome());

    // Position player according to drill sector
    if (isDust2) {
      if (!this.dust2LevelData.isLoaded) {
        void loadDust2MapGeometry(
          this.dust2LevelData,
          this.isSoftwareGl,
          new THREE.LoadingManager()
        ).then(() => {
          if (this.state.drillMode === 'DUST2_BOMB_5V5') {
            this.playerPos.y = this.dust2LevelData.collider.getGroundHeight(
              this.playerPos.x,
              this.playerPos.y,
              this.playerPos.z
            );
            this.playerVel.y = 0;
            this.isGrounded = true;
            this.syncYawObjectToPlayerFeet();
          }
        });
      }
      const startY = this.dust2LevelData.collider.ready
        ? this.dust2LevelData.collider.getGroundHeight(
            DUST2_T_SPAWN.x,
            DUST2_T_SPAWN.y,
            DUST2_T_SPAWN.z
          )
        : DUST2_T_SPAWN.y;
      this.playerPos.set(DUST2_T_SPAWN.x, startY, DUST2_T_SPAWN.z);
      this.yaw = DUST2_T_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(DUST2_T_SPAWN.y);
      this.yardBombSystem.resetRound('DUST2_BOMB_5V5', keepMatchScore);
      this.state.yardBomb = { ...this.yardBombSystem.info };
    } else if (isAssault) {
      if (!this.assaultLevelData.isLoaded) {
        void loadAssaultMapGeometry(
          this.assaultLevelData,
          this.isSoftwareGl,
          new THREE.LoadingManager()
        ).then(() => {
          if (this.state.drillMode === 'ASSAULT_BOMB_5V5') {
            this.playerPos.y = this.assaultLevelData.collider.getGroundHeight(
              this.playerPos.x,
              this.playerPos.y,
              this.playerPos.z
            );
            this.playerVel.y = 0;
            this.isGrounded = true;
            this.syncYawObjectToPlayerFeet();
          }
        });
      }
      const startY = this.assaultLevelData.collider.ready
        ? this.assaultLevelData.collider.getGroundHeight(
            ASSAULT_ATTACKER_SPAWN.x,
            ASSAULT_ATTACKER_SPAWN.y,
            ASSAULT_ATTACKER_SPAWN.z
          )
        : ASSAULT_ATTACKER_SPAWN.y;
      this.playerPos.set(
        ASSAULT_ATTACKER_SPAWN.x,
        startY,
        ASSAULT_ATTACKER_SPAWN.z
      );
      this.yaw = ASSAULT_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(ASSAULT_ATTACKER_SPAWN.y);
      this.yardBombSystem.resetRound('ASSAULT_BOMB_5V5', keepMatchScore);
      this.state.yardBomb = { ...this.yardBombSystem.info };
    } else if (isIndustria) {
      // Dust2 parity: only place when collider.ready; never invent Yard Y into empty mesh.
      this.ensureGlbMapThenPlace(
        this.industriaLevelData,
        () =>
          loadIndustriaMapGeometry(
            this.industriaLevelData,
            this.isSoftwareGl,
            new THREE.LoadingManager()
          ),
        'INDUSTRIA_BOMB_5V5',
        INDUSTRIA_ATTACKER_SPAWN
      );
      this.yaw = INDUSTRIA_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(INDUSTRIA_ATTACKER_SPAWN.y);
      if (!harness) {
        this.yardBombSystem.resetRound('INDUSTRIA_BOMB_5V5', keepMatchScore);
        this.state.yardBomb = { ...this.yardBombSystem.info };
      }
    } else if (isHangar) {
      this.ensureGlbMapThenPlace(
        this.hangarLevelData,
        () =>
          loadHangarMapGeometry(
            this.hangarLevelData,
            this.isSoftwareGl,
            new THREE.LoadingManager()
          ),
        'HANGAR_BOMB_5V5',
        HANGAR_ATTACKER_SPAWN
      );
      this.yaw = HANGAR_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(HANGAR_ATTACKER_SPAWN.y);
      if (!harness) {
        this.yardBombSystem.resetRound('HANGAR_BOMB_5V5', keepMatchScore);
        this.state.yardBomb = { ...this.yardBombSystem.info };
      }
    } else if (isEasternCity) {
      this.ensureGlbMapThenPlace(
        this.easternCityLevelData,
        () =>
          loadEasternCityMapGeometry(
            this.easternCityLevelData,
            this.isSoftwareGl,
            new THREE.LoadingManager()
          ),
        'EASTERN_CITY_BOMB_5V5',
        EASTERN_CITY_ATTACKER_SPAWN
      );
      this.yaw = EASTERN_CITY_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(EASTERN_CITY_ATTACKER_SPAWN.y);
      if (!harness) {
        this.yardBombSystem.resetRound('EASTERN_CITY_BOMB_5V5', keepMatchScore);
        this.state.yardBomb = { ...this.yardBombSystem.info };
      }
    } else if (isMirageAnubis) {
      this.ensureGlbMapThenPlace(
        this.mirageAnubisLevelData,
        () =>
          loadMirageAnubisMapGeometry(
            this.mirageAnubisLevelData,
            this.isSoftwareGl,
            new THREE.LoadingManager()
          ),
        'MIRAGE_ANUBIS_BOMB_5V5',
        MIRAGE_ANUBIS_ATTACKER_SPAWN
      );
      this.yaw = MIRAGE_ANUBIS_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(MIRAGE_ANUBIS_ATTACKER_SPAWN.y);
      if (!harness) {
        this.yardBombSystem.resetRound('MIRAGE_ANUBIS_BOMB_5V5', keepMatchScore);
        this.state.yardBomb = { ...this.yardBombSystem.info };
      }
    } else if (isV23Map) {
      const v23Mode = assetMode as V23BombMapMode;
      const v23Cfg = V23_MAP_CONFIGS[v23Mode];
      const v23Bundle =
        v23Mode === 'CSGO_ASSAULT_BOMB_5V5'
          ? this.csgoAssaultLevelData
          : v23Mode === 'DE_DST_BOMB_5V5'
            ? this.deDstLevelData
            : v23Mode === 'MP_NUKED_BOMB_5V5'
              ? this.mpNukedLevelData
              : v23Mode === 'DE_SUPPLY_BOMB_5V5'
                ? this.deSupplyLevelData
                : this.yardV2LevelData;
      this.ensureGlbMapThenPlace(
        v23Bundle,
        () =>
          loadV23MapGeometry(
            v23Mode,
            v23Bundle,
            this.isSoftwareGl,
            new THREE.LoadingManager()
          ),
        v23Mode,
        v23Cfg.attackerSpawn
      );
      this.yaw = v23Cfg.spawnYaw;
      this.pitch = 0;
      this.scheduleFloorResnap(v23Cfg.attackerSpawn.y);
      if (!harness) {
        this.yardBombSystem.resetRound(v23Mode, keepMatchScore);
        this.state.yardBomb = { ...this.yardBombSystem.info };
      }
    } else if (isStationArena) {
      const stationMode: DrillMode =
        mode === 'STATION_TDM_5V5' ? 'STATION_TDM_5V5' : 'STATION_CAPTURE_5V5';
      setStationCaptureBeaconsVisible(
        this.stationArenaLevelData,
        stationMode === 'STATION_CAPTURE_5V5'
      );
      this.ensureGlbMapThenPlace(
        this.stationArenaLevelData,
        () =>
          loadStationArenaMapGeometry(
            this.stationArenaLevelData,
            this.isSoftwareGl,
            new THREE.LoadingManager()
          ),
        stationMode,
        STATION_ARENA_ATTACKER_SPAWN
      );
      this.yaw = STATION_ARENA_SPAWN_YAW;
      this.pitch = 0;
      this.scheduleFloorResnap(STATION_ARENA_ATTACKER_SPAWN.y);
      if (!harness) {
        this.yardBombSystem.resetRound(stationMode, keepMatchScore);
        this.state.yardBomb = { ...this.yardBombSystem.info };
      }
    } else if (isYard) {
      this.playerPos.set(
        YARD_ATTACKER_SPAWN.x,
        YARD_ATTACKER_SPAWN.y,
        YARD_ATTACKER_SPAWN.z
      );
      this.yaw = 0;
      this.pitch = 0;
      this.yardBombSystem.resetRound('YARD_BOMB_5V5', keepMatchScore);
      this.state.yardBomb = { ...this.yardBombSystem.info };
    } else if (mode === 'FREE_RANGE') {
      this.playerPos.copy(STANDER_TIRO_SPAWN);
      this.yaw = STANDER_TIRO_SPAWN_YAW;
      this.pitch = 0;
      this.state.yardBomb = undefined;
    } else {
      // Spawn at Killhouse Breach Entry
      this.playerPos.set(12.2, 0, 4.5);
      this.yaw = 0;
      this.pitch = 0;
      this.state.yardBomb = undefined;
    }
    this.playerVel.set(0, 0, 0);
    this.isGrounded = true;
    this.state.isCrouchingToggled = false;
    this.state.isProneToggled = false;

    if (harness) {
      // Isolated floor test: no bomb HUD, no bots, no online overwrite.
      this.state.yardBomb = undefined;
      this.targets.forEach((t) => {
        t.isDown = true;
        t.health = 0;
        t.root.visible = false;
        t.root.position.set(0, -999, 0);
      });
      this.state.targetsRemaining = 0;
      this.state.totalTargetsInDrill = 0;
      this.applyPendingFloorSnap();
      this.syncYawObjectToPlayerFeet();
      this.emitHud(true);
      return;
    }

    // Reset all targets to their exact spawn positions & fresh AI navigation state
    let activeCount = 0;
    this.targets.forEach((t) => {
      t.isDown = false;
      t.lastDeathWasHeadshot = false;
      t.reviveUntilSec = 0;
      t.reviveExpired = false;
      t.downTimer = 0;
      t.health = t.maxHealth;
      t.armorHealth = t.armorMesh ? 60 : 0;
      if (t.armorMesh) t.armorMesh.visible = true;
      t.root.visible = true;
      t.root.position.copy(t.basePosition);
      if (t.root.userData) {
        t.root.userData.navData = undefined;
        t.root.userData.prevPos = undefined;
      }
      t.pivotGroup.position.y = 0;
      t.pivotGroup.rotation.x = 0;
      t.hitTiltAngle = 0;
      t.hitTiltVelocity = 0;
      t.windupTimer = 0;
      t.cooldownTimer = 1.5 + Math.random() * 2.0;
      t.isTelegraphing = false;
      if (t.laserLine) t.laserLine.visible = false;

      if (isBombMode) {
        if (!(t as YardBotEntity).isAlly) activeCount++;
      } else if (mode === 'KILLHOUSE_BLITZ' || mode === 'TACTICAL_WAVE') {
        if (t.sector === 'KILLHOUSE') activeCount++;
      } else {
        if (t.type !== 'STEEL_GONG') activeCount++;
      }
    });

    if (isBombMode && isOnlineMatchActive()) {
      const room = getActiveOnlineRoom();
      const localOp = getLocalOnlinePlayerState();
      const privateWithBots = isPrivateRoomWithBotsActive();
      if (room && localOp) {
        const allPlayers = Object.values(room.players || {});
        const vgCount = privateWithBots
          ? 5
          : allPlayers.filter((p) => p.team === 'VANGUARD').length;
        const btCount = privateWithBots
          ? 5
          : allPlayers.filter((p) => p.team === 'BLACKTHORN').length;
        this.yardBombSystem.setOnlineContext(
          true,
          localOp.team,
          vgCount,
          btCount,
          privateWithBots
        );
      }
      // Online used to overwrite Dust2-parity place with stale far-field coords
      // (Eastern z±48, Mirage z=-72) → outside GLB AABB → white void.
      const activeCol = this.getActiveGlbCollider();
      const onlineSpawn = applyOnlineTeamSpawnToLocalPlayer(
        mode,
        this.playerPos,
        (x, y, z) => this.getCurrentGroundHeight(x, y, z),
        activeCol?.ready
          ? (hx, hz, hy) => activeCol.findPlayableSpawn(hx, hz, hy)
          : undefined
      );
      if (onlineSpawn) {
        this.yaw = onlineSpawn.yaw;
        if (activeCol?.ready) {
          this.scheduleFloorResnap(this.playerPos.y);
        }
      }
      if (!privateWithBots) {
        hideAllBotsForOnlineMatch(
          this.targets as YardBotEntity[],
          this.shootableMeshes
        );
        activeCount = 0;
      }
    } else if (isBombMode) {
      this.yardBombSystem.setOnlineContext(false);
    }

    this.state.targetsRemaining = activeCount;
    this.state.totalTargetsInDrill = activeCount;

    // Immediate camera sync — never leave yaw at eyeHeight-only under elevated floors.
    this.applyPendingFloorSnap();
    this.syncYawObjectToPlayerFeet();
  }

  public requestPointerLock(): void {
    if (this.state.touchControlsVisible) return;
    try {
      this.renderer.domElement.requestPointerLock?.();
    } catch {
      // Ignore sandbox lock errors
    }
  }

  // =========================================================================
  // INPUT & EVENT HANDLERS
  // =========================================================================
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keysHeld.add(e.code);

    if (this.state.screen === 'TITLE') {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.startGame();
      }
      return;
    }

    if (e.code === 'Escape') {
      if (this.state.screen === 'PLAYING') {
        if (this.bulletCamManager?.isActive()) {
          this.bulletCamManager.skip(true);
          this.syncBulletCamHudState();
          this.emitHud();
          return;
        }
        this.pauseGame();
      } else if (this.state.screen === 'PAUSED') {
        this.resumeGame();
      }
      return;
    }

    if (this.state.screen !== 'PLAYING') return;

    // Durante Sniper Bullet Cam: trava todos os inputs de gameplay e permite Skip rápido
    if (this.bulletCamManager?.isActive()) {
      if (
        e.code === 'Space' ||
        e.code === 'Enter' ||
        e.code === 'KeyE' ||
        e.code === 'KeyF'
      ) {
        e.preventDefault();
        this.skipBulletCam();
      }
      return;
    }

    if (this.playerDeathTp?.isSpectating()) {
      if (e.code === 'KeyQ' || e.code === 'ArrowLeft' || e.code === 'KeyA') {
        this.cycleSpectator(-1);
      } else if (e.code === 'KeyE' || e.code === 'ArrowRight' || e.code === 'KeyD') {
        this.cycleSpectator(1);
      }
      return;
    }

    if (this.isPlayerDying) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.triggerJump();
        break;
      case 'KeyZ':
        if (this.state.isAds && this.state.optic === 'lpvo') {
          this.cycleLpvoZoom();
        } else {
          this.triggerProne();
        }
        break;
      case 'KeyC':
      case 'ControlLeft':
        this.toggleCrouchOrSlide();
        break;
      case 'KeyR': {
        const now = performance.now();
        const isDoubleTap = now - this.lastRKeyPressTime < 280;
        this.lastRKeyPressTime = now;
        this.triggerReload(isDoubleTap);
        break;
      }
      case 'KeyT':
        this.triggerMagCheck();
        break;
      case 'KeyG':
        if (this.state.boltLockedBack || this.state.chambered === 0) {
          this.triggerManualBoltRack();
        } else {
          this.throwGrenade('FRAG');
        }
        break;
      case 'KeyJ':
      case 'KeyN':
        this.throwGrenade('SMOKE');
        break;
      case 'KeyB':
        this.cycleFireMode();
        break;
      case 'KeyV':
        this.toggleCantedSight();
        break;
      case 'KeyX':
        this.toggleSuppressor();
        break;
      case 'KeyK':
        this.cycleWeaponCharm();
        break;
      case 'KeyL':
        this.toggleLaser();
        break;
      case 'KeyU':
        this.resupplyAmmo();
        this.setClassSupportHeld(true);
        break;
      case 'KeyM':
        this.toggleMute();
        break;
      case 'KeyH':
        this.toggleDockCollapsed();
        break;
      case 'KeyE':
        if (
          (this.state.drillMode === 'YARD_BOMB_5V5' ||
            this.state.drillMode === 'DUST2_BOMB_5V5' ||
            this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
            this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
            this.state.drillMode === 'HANGAR_BOMB_5V5' ||
            this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
            this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
            isV23BombMapMode(this.state.drillMode)) &&
          this.yardBombSystem.info.nearSite &&
          (this.yardBombSystem.info.bombStatus === 'CARRIED' ||
            this.yardBombSystem.info.bombStatus === 'PLANTED')
        ) {
          this.triggerPlantBomb();
        }
        break;
      case 'KeyF':
        if (
          (this.state.drillMode === 'YARD_BOMB_5V5' ||
            this.state.drillMode === 'DUST2_BOMB_5V5' ||
            this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
            this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
            this.state.drillMode === 'HANGAR_BOMB_5V5' ||
            this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
            this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
            isV23BombMapMode(this.state.drillMode)) &&
          this.yardBombSystem.info.nearSite &&
          (this.yardBombSystem.info.bombStatus === 'CARRIED' ||
            this.yardBombSystem.info.bombStatus === 'PLANTED')
        ) {
          this.triggerPlantBomb();
        } else if (this.state.focusedWallWeapon) {
          this.selectWeapon(this.state.focusedWallWeapon);
        } else {
          this.triggerWeaponInspect();
        }
        break;
      case 'Tab':
        e.preventDefault();
        this.toggleWeaponSlot();
        break;
      case 'Digit1':
        this.selectWeapon(this.primaryWeapon);
        break;
      case 'Digit2':
        this.selectWeapon(this.secondaryWeapon || 'P50_PISTOL');
        break;
      case 'Digit3':
        this.selectWeapon('KNIFE_TACTICAL');
        break;
      case 'Digit4':
        if (this.state.readyStreak !== 'NONE') {
          this.activateReadyStreak();
        } else if (this.state.drillMode === 'FREE_RANGE') {
          this.selectWeapon('M4_CARBINE');
        }
        break;
      case 'KeyX':
        if (this.state.readyStreak !== 'NONE') {
          this.activateReadyStreak();
        }
        break;
      case 'Digit5':
        this.selectWeapon('AK47_RIFLE');
        break;
      case 'Digit6':
        this.selectWeapon('L49_LMG');
        break;
      case 'Digit7':
        this.selectWeapon('SNIPER_BOLT');
        break;
      case 'Digit8':
        this.selectWeapon('SNIPER_TACTICAL');
        break;
      case 'Digit9': {
        const order: OpticType[] = [
          'iron',
          'red_dot',
          'kolimator',
          'holo',
          'lpvo',
        ];
        const curIdx = order.indexOf(this.state.optic);
        const nextOptic = order[(curIdx + 1) % order.length];
        this.setOptic(nextOptic);
        break;
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
    if (e.code === 'KeyU') {
      this.setClassSupportHeld(false);
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.state.screen !== 'PLAYING' || this.isPlayerDying) return;

    // Ignore clicks on DOM UI controls (like the bottom dock)
    if (e.target !== this.renderer.domElement) return;

    // Clique durante Sniper Bullet Cam cancela (Skip) sem gerar disparo duplicado
    if (this.bulletCamManager?.isActive()) {
      this.skipBulletCam();
      return;
    }

    if (!this.state.pointerLocked) {
      this.requestPointerLock();
    }

    this.mouseButtonsHeld.add(e.button);

    if (e.button === 0) {
      this.triggerPulledThisPress = false;
      this.attemptFireWeapon();
    } else if (e.button === 2) {
      if (!this.state.isAds) {
        soundEngine.playAimTransition(true);
      }
      this.state.isAds = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseButtonsHeld.delete(e.button);
    if (e.button === 0) {
      this.triggerPulledThisPress = false;
    } else if (e.button === 2) {
      if (this.state.isAds) {
        soundEngine.playAimTransition(false);
      }
      this.state.isAds = false;
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (
      this.state.screen !== 'PLAYING' ||
      this.isPlayerDying ||
      this.bulletCamManager?.isActive()
    ) {
      return;
    }
    if (!this.state.pointerLocked && !this.mouseButtonsHeld.has(0) && !this.mouseButtonsHeld.has(2)) {
      return;
    }

    const userSens = this.state.isAds
      ? this.state.lookSensitivity * this.state.adsSensitivity
      : this.state.lookSensitivity;

    const zoomSensFactor =
      this.state.isAds && this.state.optic === 'lpvo' && !this.state.cantedActive
        ? 0.45 / Math.sqrt(this.state.lpvoZoom)
        : this.state.isAds
          ? 0.65
          : 1.0;

    const sens = 0.0021 * zoomSensFactor * userSens;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;

    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * sens,
      -Math.PI * 0.46,
      Math.PI * 0.46
    );

    // Feed mouse angular velocity into weapon inertia spring
    this.swayVel.x -= dx * 0.00055;
    this.swayVel.y += dy * 0.00055;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.state.screen !== 'PLAYING') return;
    if (this.state.optic === 'lpvo' && !this.state.cantedActive) {
      const delta = e.deltaY < 0 ? 0.5 : -0.5;
      this.state.lpvoZoom = THREE.MathUtils.clamp(
        this.state.lpvoZoom + delta,
        1.0,
        4.0
      );
      soundEngine.playMechanicalSwitch(1.25);
      this.emitHud();
    }
  };

  private onPointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.state.pointerLocked = locked;
    this.emitHud();
  };

  private onWindowBlur = () => {
    this.isWindowFocused = false;
    this.keysHeld.clear();
    this.mouseButtonsHeld.clear();
    this.touchMoveX = 0;
    this.touchMoveY = 0;
    this.touchSprinting = false;
    this.touchFireHeld = false;
    this.touchHoldBreath = false;
    this.canvasTouchLookId = null;
    this.emitHud();
  };

  private onWindowFocus = () => {
    this.isWindowFocused = true;
    this.lastTime = performance.now();
  };

  private onVisibilityChange = () => {
    if (document.hidden) {
      this.isWindowFocused = false;
      this.onWindowBlur();
    } else {
      this.isWindowFocused = true;
      this.lastTime = performance.now();
    }
  };

  private onCanvasTouchStart = (e: TouchEvent) => {
    if (this.state.screen !== 'PLAYING') return;
    if (this.bulletCamManager?.isActive()) {
      this.skipBulletCam();
      return;
    }
    if (this.canvasTouchLookId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    this.canvasTouchLookId = t.identifier;
    this.canvasTouchLastX = t.clientX;
    this.canvasTouchLastY = t.clientY;
  };

  private onCanvasTouchMove = (e: TouchEvent) => {
    if (
      this.state.screen !== 'PLAYING' ||
      this.canvasTouchLookId === null ||
      this.bulletCamManager?.isActive()
    ) {
      return;
    }
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.canvasTouchLookId) {
        const dx = t.clientX - this.canvasTouchLastX;
        const dy = t.clientY - this.canvasTouchLastY;
        this.canvasTouchLastX = t.clientX;
        this.canvasTouchLastY = t.clientY;
        this.applyTouchLookDelta(dx, dy);
        break;
      }
    }
  };

  private onCanvasTouchEnd = (e: TouchEvent) => {
    if (this.canvasTouchLookId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.canvasTouchLookId) {
        this.canvasTouchLookId = null;
        break;
      }
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onResize = () => {
    if (!this.container) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onWebGlContextLost = (e: Event): void => {
    e.preventDefault();
    runtimeTelemetry.recordError('context_lost', 'canvas_webglcontextlost');
  };

  private onWebGlContextRestored = (): void => {
    runtimeTelemetry.recordError('context_restored');
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('focus', this.onWindowFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.onWebGlContextLost,
      false
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.onWebGlContextRestored,
      false
    );
    this.renderer.domElement.addEventListener('touchstart', this.onCanvasTouchStart, {
      passive: true,
    });
    this.renderer.domElement.addEventListener('touchmove', this.onCanvasTouchMove, {
      passive: true,
    });
    this.renderer.domElement.addEventListener('touchend', this.onCanvasTouchEnd, {
      passive: true,
    });
    this.renderer.domElement.addEventListener('touchcancel', this.onCanvasTouchEnd, {
      passive: true,
    });
  }

  // =========================================================================
  // ADVANCED RELOAD, MAG CHECK & BOLT MECHANICS
  // =========================================================================
  public triggerReload(isDoubleTapSpeedReload = false): void {
    if (this.state.equippedGrenade !== null) {
      this.grenadeSystem?.unequipFromHand();
      this.state.equippedGrenade = null;
      this.weaponRig.root.visible = true;
    }
    if (this.state.reloadPhase === 'MAG_CHECK') {
      this.state.reloadPhase = 'IDLE';
      this.state.magCheckVisible = false;
    }
    // If already in a reload, upgrade to speed reload if double-tapped early!
    if (this.state.reloadPhase !== 'IDLE') {
      if (isDoubleTapSpeedReload && !this.isSpeedReload && this.state.reloadPhase === 'MAG_OUT') {
        this.isSpeedReload = true;
        this.reloadDuration *= 0.68;
        this.state.reloadTypeLabel = 'RECARGA RÁPIDA (DROP)';
        // Drop current mag on floor
        this.weaponRig.magazineGroup.getWorldPosition(_worldPos);
        this.camera.getWorldDirection(_forward);
        this.fxPool.spawnDroppedMagazine(_worldPos, _forward);
        this.state.currentMagRounds = 0;
      }
      return;
    }

    if (this.state.activeWeapon === 'KNIFE_TACTICAL') {
      this.triggerWeaponInspect();
      return;
    }

    // Do not allow reload if current magazine is already 100% full and a round is chambered
    if (
      this.state.currentMagRounds === this.state.magCapacity &&
      this.state.chambered === 1
    ) {
      soundEngine.playMechanicalSwitch(0.85);
      this.state.reloadTypeLabel = 'CARREGADOR JÁ ESTÁ CHEIO';
      this.magCheckTimer = 1.4;
      this.emitHud();
      return;
    }

    // Realistic Shell-by-Shell Reload for 12-Gauge Shotguns
    if (
      this.state.activeWeapon === 'SHOTGUN_12' ||
      this.state.activeWeapon === 'SHOTGUN_SPAS'
    ) {
      const maxTotal = this.state.magCapacity + 1;
      const currentLoaded = this.state.currentMagRounds + this.state.chambered;
      const missing = Math.max(0, maxTotal - currentLoaded);
      if (missing <= 0) {
        soundEngine.playMechanicalSwitch(0.85);
        this.state.reloadTypeLabel = 'CARREGADOR JÁ ESTÁ CHEIO';
        this.magCheckTimer = 1.4;
        this.emitHud();
        return;
      }

      let totalReserve = this.state.magazines.reduce((acc, r) => acc + r, 0);
      if (totalReserve <= 0) {
        const cap = this.state.magCapacity;
        this.state.magazines = [cap, cap, cap, cap];
        totalReserve = cap * 4;
      }

      const shellsToLoad = Math.min(missing, totalReserve);
      const dryReload = this.state.chambered === 0;
      const reloadMult =
        Math.max(1, getClassCombatModifiers().reloadSpeedMult) *
        getWeaponGunsmithModifiers(this.state.activeWeapon).reloadSpeedMult *
        (this.streakReloadBoostSec > 0 ? 1.35 : 1);
      const shellInterval = 0.46 / reloadMult;
      const firstInsertDelay = Math.min(0.24 / reloadMult, shellInterval * 0.55);
      const pumpTime = dryReload ? 0.44 / reloadMult : 0;

      this.shotgunShellsTarget = shellsToLoad;
      this.shotgunShellsInserted = 0;
      this.shotgunShellInterval = shellInterval;
      this.shotgunNextShellAt = firstInsertDelay;
      this.shotgunNeedsPumpRack = dryReload;
      this.shotgunPumpRacked = false;

      this.isSpeedReload = false;
      this.needsBoltReleaseStage = dryReload;
      this.reloadTimer = 0;
      this.reloadDuration = Math.max(
        0.55,
        firstInsertDelay +
          Math.max(0, shellsToLoad - 1) * shellInterval +
          (dryReload ? pumpTime + 0.14 : 0.18)
      );
      this.sniperChamberTimer = 0;
      this.sniperReturnToScopeAfterBolt = false;
      this.state.isAds = false;
      this.state.reloadPhase = 'MAG_IN';
      this.state.reloadProgress = 0;
      this.state.reloadTypeLabel = `RECARREGANDO ${shellsToLoad} CARTUCHO${shellsToLoad > 1 ? 'S' : ''}...`;
      this.stageSoundFlags = { magOut: false, magIn: false, boltSlap: false };
      this.weaponRig.triggerShotgunShellInsertAnimation(
        Math.min(0.45, shellInterval),
        this.reloadDuration
      );
      this.emitHud();
      return;
    }

    // Check if we have any magazine with rounds in our chest rig
    let bestMagIdx = this.findFullestMagazineIndex();
    if (bestMagIdx === -1 || this.state.magazines[bestMagIdx] <= 0) {
      // Auto-replenish spare magazines so player can always reload during combat/movement
      const cap = this.state.magCapacity;
      this.state.magazines = [cap, cap, cap, cap];
      bestMagIdx = 0;
    }

    // Allow reload at any time (even if mag is full, performs a tactical magazine swap so reload animation always plays on demand)
    const dryReload = this.state.chambered === 0 || this.state.boltLockedBack;
    this.isSpeedReload = isDoubleTapSpeedReload || this.state.currentMagRounds === 0;
    this.needsBoltReleaseStage = dryReload;

    if (this.isSpeedReload) {
      this.reloadDuration = dryReload ? 1.65 : 1.25;
      this.state.reloadTypeLabel = dryReload
        ? 'RECARGA EMERGENCIAL + LIBERAÇÃO DO FERROLHO'
        : 'RECARGA RÁPIDA (DROP DE CARREGADOR)';
    } else {
      this.reloadDuration = dryReload ? 2.25 : 1.78;
      this.state.reloadTypeLabel = dryReload
        ? 'RECARGA SECA + MANEJO DE FERROLHO'
        : 'RECARGA TÁTICA (RETENÇÃO DE CARREGADOR)';
    }

    if (this.state.activeWeapon === 'P50_PISTOL') {
      this.reloadDuration = dryReload ? 2.15 : 1.75;
      soundEngine.playPistolFullReload(dryReload);
    } else if (this.state.activeWeapon === 'M1911_PISTOL') {
      this.reloadDuration = dryReload ? 1.95 : 1.55;
      soundEngine.playM1911FullReload(dryReload);
    } else if (
      this.state.activeWeapon === 'SMG_MP5' ||
      this.state.activeWeapon === 'SMG_45'
    ) {
      this.reloadDuration = dryReload ? 2.3 : 1.85;
      soundEngine.playSmgFullReload(dryReload);
    } else if (
      this.state.activeWeapon === 'M4_CARBINE' ||
      this.state.activeWeapon === 'CARBINE_AR' ||
      this.state.activeWeapon === 'S_MILITARY'
    ) {
      this.reloadDuration = this.state.activeWeapon === 'S_MILITARY' ? 2.4 : 2.55;
      soundEngine.playM4a1FullReload(dryReload);
    } else if (
      this.state.activeWeapon === 'AK47_RIFLE' ||
      this.state.activeWeapon === 'AK12_RIFLE'
    ) {
      this.reloadDuration = dryReload ? 2.5 : 2.0;
      soundEngine.playAk47FullReload(dryReload);
    } else if (this.state.activeWeapon === 'L49_LMG') {
      this.reloadDuration = dryReload ? 2.75 : 2.25;
      soundEngine.playDmrOrLmgFullReload(dryReload);
    } else if (this.state.activeWeapon === 'SNIPER_TACTICAL') {
      this.reloadDuration = dryReload ? 2.6 : 2.15;
      soundEngine.playDmrOrLmgFullReload(dryReload);
    } else if (this.state.activeWeapon === 'SNIPER_BOLT') {
      this.reloadDuration = 2.2;
      soundEngine.playKar98kFullReload();
    } else if (
      this.state.activeWeapon === 'SNIPER_AWP' ||
      this.state.activeWeapon === 'SNIPER_HEAVY'
    ) {
      this.reloadDuration = dryReload ? 2.85 : 2.35;
      soundEngine.playDmrOrLmgFullReload(dryReload);
    } else if (this.state.activeWeapon === 'RPG7_LAUNCHER') {
      this.reloadDuration = 2.65;
      soundEngine.playDmrOrLmgFullReload(true);
    }

    this.reloadTimer = 0;
    this.sniperChamberTimer = 0;
    this.sniperReturnToScopeAfterBolt = false;
    this.state.isAds = false;
    this.state.reloadPhase = 'MAG_OUT';
    this.state.reloadProgress = 0;
    this.stageSoundFlags = { magOut: false, magIn: false, boltSlap: false };
    const reloadMult =
      Math.max(1, getClassCombatModifiers().reloadSpeedMult) *
      getWeaponGunsmithModifiers(this.state.activeWeapon).reloadSpeedMult *
      (this.streakReloadBoostSec > 0 ? 1.35 : 1);
    this.reloadDuration = Math.max(0.45, this.reloadDuration / reloadMult);
    this.weaponRig.triggerReloadAnimation(this.reloadDuration);
    this.emitHud();
  }

  public triggerMagCheck(): void {
    if (this.state.reloadPhase !== 'IDLE') return;
    this.state.reloadPhase = 'MAG_CHECK';
    this.state.magCheckVisible = true;
    this.state.reloadTypeLabel = `INSPEÇÃO: ${this.state.currentMagRounds}/${this.state.magCapacity} NO CARREGADOR ${
      this.state.chambered ? '+ 1 NA CÂMARA' : '(CÂMARA VAZIA)'
    }`;
    this.magCheckTimer = 1.85;
    soundEngine.playMechanicalSwitch(0.9);
    this.emitHud();
  }

  public triggerManualBoltRack(): void {
    if (
      this.state.reloadPhase !== 'IDLE' &&
      this.state.reloadPhase !== 'MAG_CHECK'
    ) {
      return;
    }
    if (this.state.currentMagRounds <= 0 && this.state.chambered === 0) {
      this.triggerReload(false);
      return;
    }
    this.state.reloadPhase = 'CHARGING_PULL';
    this.reloadTimer = 0;
    this.reloadDuration = 0.65;
    this.state.reloadTypeLabel = this.state.boltLockedBack
      ? 'LIBERANDO FERROLHO [G]'
      : 'MANOBRANDO ALAVANCA DE MANEJO [G]';
    if (
      this.state.activeWeapon === 'AK47_RIFLE' ||
      this.state.activeWeapon === 'AK12_RIFLE'
    ) {
      soundEngine.playAk47BoltRack();
    } else if (
      this.state.activeWeapon === 'SNIPER_BOLT' ||
      this.state.activeWeapon === 'SNIPER_TACTICAL' ||
      this.state.activeWeapon === 'SNIPER_AWP' ||
      this.state.activeWeapon === 'SNIPER_HEAVY'
    ) {
      soundEngine.playBoltActionCycle();
    } else {
      soundEngine.playReloadStage('CHARGING_HANDLE');
    }
    this.weaponRig.triggerBoltAnimation();

    // If a live round was chambered, eject it!
    if (this.state.chambered === 1) {
      this.weaponRig.ejectionPortWorldPos.getWorldPosition(_worldPos);
      this.camera.getWorldDirection(_forward);
      _right.crossVectors(_forward, _up).normalize();
      this.fxPool.spawnBrassCasing(_worldPos, _right, _up);
      this.state.chambered = 0;
    }

    // Chamber a round from current magazine if available
    if (this.state.currentMagRounds > 0) {
      this.state.currentMagRounds -= 1;
      this.state.chambered = 1;
      this.state.boltLockedBack = false;
    } else {
      this.state.boltLockedBack = false;
    }
    this.emitHud();
  }

  private findFullestMagazineIndex(): number {
    let bestIdx = -1;
    let maxRounds = 0;
    for (let i = 0; i < this.state.magazines.length; i++) {
      if (this.state.magazines[i] > maxRounds) {
        maxRounds = this.state.magazines[i];
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private completeMagazineSwap(): void {
    const bestIdx = this.findFullestMagazineIndex();
    if (bestIdx === -1) return;

    const incomingRounds = this.state.magazines[bestIdx];
    const outgoingRounds = this.state.currentMagRounds;

    if (this.isSpeedReload) {
      // Dropped on floor! Remove the used mag from chest rig or set to 0
      this.state.magazines.splice(bestIdx, 1);
    } else {
      // Tactical retention: stow partially spent mag back in chest rig slot
      if (outgoingRounds > 0) {
        this.state.magazines[bestIdx] = outgoingRounds;
      } else {
        this.state.magazines.splice(bestIdx, 1);
      }
    }

    this.state.currentMagRounds = incomingRounds;
  }

  // =========================================================================
  // BALLISTICS & WEAPON FIRING
  // =========================================================================
  private attemptFireWeapon(): void {
    runAttemptFireWeapon(this as any);
  }

  private executeSingleShot(): void {
    runExecuteSingleShot(this as any);
  }

  private handleTargetHit(
    targetId: string,
    hitZone: 'HEAD' | 'TORSO_A' | 'ARMOR' | 'STEEL_GONG',
    distanceMeters: number,
    hitPoint: THREE.Vector3,
    hitNormal: THREE.Vector3,
    isShotgunPellet = false
  ): void {
    runHandleTargetHit(
      this as any,
      targetId,
      hitZone,
      distanceMeters,
      hitPoint,
      hitNormal,
      isShotgunPellet
    );
  }

  private recordShotTelemetry(
    distanceMeters: number,
    zone: BallisticShotTelemetry['zone'],
    damage: number,
    velocityMs: number
  ): void {
    const entry: BallisticShotTelemetry = {
      id: this.state.shotsFired,
      distanceMeters: Number(distanceMeters.toFixed(1)),
      zone,
      damage,
      velocityMs,
      reactionMs: Math.round(185 + Math.random() * 90),
      timestamp: performance.now(),
    };
    this.state.lastShotTelemetry = entry;
    this.state.shotHistory = [entry, ...this.state.shotHistory.slice(0, 4)];
  }

  // =========================================================================
  // MAIN SIMULATION LOOP (60FPS + SOFTWARE WEBGL FENCE SYNC)
  private tick = () => {
    if (this.disposed || !this.isLoopRunning) return;

    const now = performance.now();
    const elapsed = (now - this.lastTime) / 1000;

    if (!this.isWindowFocused) {
      this.lastTime = now;
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }

    if (
      this.state.fpsLimit > 0 &&
      elapsed < 1 / this.state.fpsLimit - 0.0015
    ) {
      this.frameId = requestAnimationFrame(this.tick);
      return;
    }

    this.lastTime = now;
    const rawDt = elapsed;

    // Clamp delta time to prevent physics tunneling on tab switch
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedTime += dt;

    this.updateDynamicResolutionGovernor(rawDt);
    if (this.state.screen === 'PLAYING') {
      runtimeTelemetry.recordFrame(rawDt);
    }

    if (
      this.state.screen === 'TITLE' ||
      this.state.screen === 'MAIN_MENU'
    ) {
      this.updateTitleScreenShowroom(dt);
    } else if (this.state.screen === 'PLAYING') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.updatePlayingSimulation(dt);
      }
      if (this.state.drillMode === 'YARD_V2_BOMB_5V5') {
        this.yardV2LevelData.updateVisibility?.(
          this.yawObject.position.x,
          this.yawObject.position.y,
          this.yawObject.position.z
        );
      }
      if (this.keyLight?.castShadow && this.renderer.shadowMap.enabled) {
        followKeyLightShadowFrustum(this.keyLight, this.playerPos, {
          sunDirection: this.skySystem.getSunDirection(),
        });
        tickShadowBudget(this.renderer, this.shadowBudget, this.playerPos, dt);
      }
    }

    if (this.postFx.enabled && this.state.screen === 'PLAYING') {
      renderWithTacticalPostFx(
        this.postFx,
        this.renderer,
        this.scene,
        this.camera,
        this.state.damageFlashAlpha || 0
      );
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    if (this.isLoopRunning && !this.disposed) {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public startLoop(): void {
    if (this.isLoopRunning || this.disposed) return;
    this.isLoopRunning = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
  }

  public stopLoop(): void {
    this.isLoopRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }

  // =========================================================================
  // TITLE SCREEN LIVE 3D SHOWROOM CAMERA & WEAPON PRESENTATION
  // =========================================================================
  private updateTitleScreenShowroom(dt: number): void {
    // Gentle atmospheric camera pan overlooking the firing line & 3D rifle centerpiece
    this.yaw = Math.sin(this.elapsedTime * 0.35) * 0.22 - 0.15;
    this.pitch = Math.cos(this.elapsedTime * 0.28) * 0.04 - 0.03;

    this.yawObject.position.set(-5.8, 1.68, 2.6);
    this.yawObject.rotation.y = this.yaw;
    this.pitchObject.rotation.x = this.pitch;

    // Position the 3D Tactical Weapon & Two-Handed Arms Rig in an angled hero pose
    this.weaponRig.root.position.set(
      0.055 + Math.sin(this.elapsedTime * 0.9) * 0.006,
      -0.035 + Math.cos(this.elapsedTime * 1.1) * 0.005,
      -0.35
    );
    this.weaponRig.root.rotation.set(
      0.08,
      0.32 + Math.sin(this.elapsedTime * 0.6) * 0.06,
      -0.12
    );
    this.weaponRig.updateGlbAnimations(dt, false, false, 'IDLE', 0);
  }

  // =========================================================================
  // ACTIVE FIRST-PERSON COMBAT & RANGE SIMULATION
  // =========================================================================
  private updatePlayingSimulation(rawDt: number): void {
    // 0. X-Ray Sniper Bullet Cam & Bomb Detonation Slow-Mo Camera (60 FPS rawDt)
    if (this.bulletCamManager) {
      const wasActive = this.bulletCamManager.isActive();
      this.bulletCamManager.update(
        rawDt,
        this.getActiveGlbCollider(),
        (x, y, z) => this.getCurrentGroundHeight(x, y, z)
      );
      if (wasActive || this.bulletCamManager.isActive()) {
        this.syncBulletCamHudState();
      }
    }

    if (this.bombBlastManager) {
      this.bombBlastManager.update(
        rawDt,
        this.getActiveGlbCollider(),
        (x, y, z) => this.getCurrentGroundHeight(x, y, z)
      );
    }

    if (this.shellshockController) {
      const ssTelem = this.shellshockController.update(rawDt);
      this.state.isShellshocked = ssTelem.isShellshocked;
      this.state.shellshockIntensity = ssTelem.intensity;
    }

    if (this.grenadeKillCam) {
      this.grenadeKillCam.update(
        rawDt,
        this.playerPos,
        this.playerDeathTp,
        this.colliders,
        this.getActiveGlbCollider(),
        (x, y, z) => this.getCurrentGroundHeight(x, y, z),
        (x, z, y, r) => this.checkHorizontalCollision(x, z, y, r)
      );
      this.state.grenadeKillCamActive = this.grenadeKillCam.isActive();
    }

    const bulletCamActive = Boolean(this.bulletCamManager?.isActive());
    const bombBlastCineActive = Boolean(this.bombBlastManager?.isActive());
    const grenadeKillCamActive = Boolean(this.grenadeKillCam?.isActive());
    const cineLocked = bulletCamActive || bombBlastCineActive;
    const bulletTimeScale = this.bulletCamManager
      ? this.bulletCamManager.getTimeScale()
      : 1.0;
    const blastTimeScale = this.bombBlastManager
      ? this.bombBlastManager.getTimeScale()
      : 1.0;
    const grenadeKillCamTimeScale = this.grenadeKillCam
      ? this.grenadeKillCam.getTimeScale()
      : 1.0;
    const timeScale = Math.min(
      bulletTimeScale,
      blastTimeScale,
      grenadeKillCamTimeScale
    );
    const dt = rawDt * timeScale;

    // 1. Course Timer & Decay Timers
    if (
      this.state.drillMode === 'KILLHOUSE_BLITZ' ||
      this.state.drillMode === 'TACTICAL_WAVE' ||
      this.state.drillMode === 'YARD_BOMB_5V5' ||
      this.state.drillMode === 'DUST2_BOMB_5V5' ||
      this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
      this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
      this.state.drillMode === 'HANGAR_BOMB_5V5' ||
      this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
      this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      isV23BombMapMode(this.state.drillMode) ||
      this.state.drillMode === 'STATION_CAPTURE_5V5' ||
      this.state.drillMode === 'STATION_TDM_5V5'
    ) {
      this.state.courseTimerSec += dt;
    }

    if (
      this.state.drillMode === 'YARD_BOMB_5V5' ||
      this.state.drillMode === 'DUST2_BOMB_5V5' ||
      this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
      this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
      this.state.drillMode === 'HANGAR_BOMB_5V5' ||
      this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
      this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      isV23BombMapMode(this.state.drillMode) ||
      this.state.drillMode === 'STATION_CAPTURE_5V5' ||
      this.state.drillMode === 'STATION_TDM_5V5'
    ) {
      const playerAlive =
        this.state.health > 0 &&
        !this.isPlayerDying &&
        !this.playerDeathTp?.isActive();

      const bombSystemDt =
        this.yardBombSystem.info.roundState === 'ROUND_OVER' ? rawDt : dt;

      this.yardBombSystem.update(
        bombSystemDt,
        this.playerPos,
        this.targets,
        this.fxPool,
        (xp, cash) => {
          this.addPlayerXp(xp);
          if (canGrantMatchProgressionRewards() && cash > 0) {
            addPlayerCash(Math.round(cash * getActiveVipCashMultiplier()));
          }
          this.state.score += xp;
          if (isOnlineMatchActive()) {
            const isBombDetonated =
              this.yardBombSystem.info.bombStatus === 'DETONATED';
            publishRoundEvent({
              kind: isBombDetonated
                ? 'ROUND_END_BOMB_EXPLODED'
                : 'ROUND_OVER',
              roundNumber: this.yardBombSystem.info.currentRound,
              winner: this.yardBombSystem.info.roundWinner || undefined,
              reason: this.yardBombSystem.info.roundWinReason,
              vanguardScore: this.yardBombSystem.info.vanguardScore,
              blackthornScore: this.yardBombSystem.info.blackthornScore,
              blastPayload: isBombDetonated
                ? this.pendingBlastAuthorityPayload || undefined
                : undefined,
            });
          }
          this.emitHud();
        },
        () => {
          if (isOnlineMatchActive()) {
            resetLocalOnlinePlayerForNextRound(this.state.drillMode);
            publishRoundEvent({
              kind: 'NEXT_ROUND',
              roundNumber: this.yardBombSystem.info.currentRound,
              vanguardScore: this.yardBombSystem.info.vanguardScore,
              blackthornScore: this.yardBombSystem.info.blackthornScore,
            });
          }
          this.resetScenario(this.state.drillMode, true);
          this.emitHud();
        },
        () => {
          this.returnToMainMenu();
        },
        this.registerKill.bind(this),
        playerAlive,
        isLocalPlayerPendingRevive(this as any)
      );

      if (this.bombBlastManager) {
        const isBombPlanted =
          !this.yardBombSystem.info.isCaptureMode &&
          !this.yardBombSystem.info.isTdmMode &&
          this.yardBombSystem.info.roundState === 'PLAYING' &&
          this.yardBombSystem.info.bombStatus === 'PLANTED';
        const dangerHud = this.bombBlastManager.updateDangerZoneWarning(
          rawDt,
          isBombPlanted,
          this.yardBombSystem.info.c4TimerSec,
          this.yardBombSystem.getPlantedBombWorldPosition(_worldPos),
          this.playerPos,
          this.colliders,
          this.getActiveGlbCollider()
        );
        this.yardBombSystem.info.dangerZoneInRadius = dangerHud.inDangerZone;
        this.yardBombSystem.info.dangerZoneDistanceM =
          dangerHud.distanceMeters;
        this.yardBombSystem.info.dangerZoneLethalRadiusM =
          dangerHud.lethalRadiusMeters;
        this.yardBombSystem.info.dangerZoneBehindCover =
          dangerHud.isBehindCover;
        this.yardBombSystem.info.dangerZoneCritical =
          dangerHud.countdownCritical;
        this.yardBombSystem.info.blastCineActive =
          this.bombBlastManager.isActive();
      }

      // Pre-round equip freeze: look OK, no combat / sprint / plant.
      if (this.yardBombSystem.info.roundState === 'EQUIP') {
        this.touchFireHeld = false;
        this.touchSprinting = false;
        this.burstRemaining = 0;
        this.fireCooldown = Math.max(this.fireCooldown, 0.05);
        this.playerVel.x = 0;
        this.playerVel.z = 0;
        this.state.isAds = false;
        this.state.yardBomb = { ...this.yardBombSystem.info };
        // Keep camera orientation live so players can look around while equipping.
        this.yawObject.position.set(
          this.playerPos.x,
          this.playerPos.y + this.currentEyeHeight,
          this.playerPos.z
        );
        this.yawObject.rotation.y = this.yaw;
        this.pitchObject.rotation.x = this.pitch;
        this.updateWeaponKinematicsAndOptics(dt);
        if (isOnlineMatchActive()) {
          this.updateTargetsAndCombatAI(dt);
        }
        this.hudSyncTimer += dt;
        if (this.hudSyncTimer >= 0.09) {
          this.hudSyncTimer = 0;
          this.emitHud();
        }
        return;
      }

      if (this.playerDeathTp?.isSpectating()) {
        const specBot = this.playerDeathTp.getSpectatedBot(
          this.targets as YardBotEntity[]
        );
        if (specBot && this.yardBombSystem.info.roundState === 'PLAYING') {
          this.yardBombSystem.info.isSpectating = true;
          this.yardBombSystem.info.spectatedCallsign =
            specBot.callsign || 'VANGUARD-02';
          this.yardBombSystem.info.spectatedWeapon =
            specBot.weaponId || 'M4_CARBINE';
          this.yardBombSystem.info.spectatedHealth = Math.max(0, specBot.health);
        } else {
          this.yardBombSystem.info.isSpectating = false;
        }
      } else {
        this.yardBombSystem.info.isSpectating = false;
      }

      this.state.yardBomb = { ...this.yardBombSystem.info };

      if (this.yardBombSystem.info.roundState === 'MATCH_OVER') {
        if (!this.postMatchShowcase.isActive()) {
          this.isPlayerDying = false;
          this.playerDeathTp?.stop(this.camera, this.weaponRig.root);
          this.yardBombSystem.info.isSpectating = false;
          this.state.yardBomb = { ...this.yardBombSystem.info };
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
          this.postMatchShowcase.startShowcase(
            this.yardBombSystem.info.squadStats || [],
            this.weaponRig.root
          );
          this.emitHud();
        }
        this.postMatchShowcase.update(
          dt,
          this.yardBombSystem.info.squadStats || [],
          this.yawObject,
          this.pitchObject,
          this.camera,
          this.weaponRig.root
        );
        updatePlayerSprintPantingAudio(false, 0, false, dt);
        this.hudSyncTimer += dt;
        if (this.hudSyncTimer >= 0.09) {
          this.hudSyncTimer = 0;
          this.emitHud();
        }
        return;
      }
    }

    if (this.state.killfeed.length > 0) {
      const nowMs = Date.now();
      if (nowMs - this.state.killfeed[0].timestamp >= 4500) {
        this.state.killfeed = this.state.killfeed.filter(
          (e) => nowMs - e.timestamp < 4500
        );
        this.emitHud();
      }
    }

    if (this.state.hitMarkerAlpha > 0) {
      const decayRate = this.state.hitMarkerIsKill ? 2.5 : 3.8;
      this.state.hitMarkerAlpha = Math.max(0, this.state.hitMarkerAlpha - rawDt * decayRate);
      if (this.state.hitMarkerAlpha <= 0) {
        this.state.hitMarkerIsKill = false;
      }
    }
    if (this.state.killConfirmAlpha > 0) {
      this.state.killConfirmAlpha = Math.max(0, this.state.killConfirmAlpha - rawDt * 1.05);
      if (this.state.killConfirmAlpha <= 0) {
        this.state.killConfirmLabel = '';
      }
    }
    if (this.state.damageFlashAlpha > 0) {
      this.state.damageFlashAlpha = Math.max(0, this.state.damageFlashAlpha - rawDt * 2.5);
    }
    if (this.streakBannerTimer > 0) {
      this.streakBannerTimer -= dt;
      if (this.streakBannerTimer <= 0) {
        this.streakBannerTimer = 0;
        this.state.streakBannerText = null;
      }
    }
    if (this.streakReloadBoostSec > 0) {
      this.streakReloadBoostSec = Math.max(0, this.streakReloadBoostSec - dt);
    }
    if (this.state.activeEmpSec > 0) {
      this.state.activeEmpSec = Math.max(0, this.state.activeEmpSec - dt);
    }
    if (this.state.empJammedSec > 0) {
      this.state.empJammedSec = Math.max(0, this.state.empJammedSec - dt);
    }
    if (this.state.activeUavSec > 0) {
      this.state.activeUavSec = Math.max(0, this.state.activeUavSec - dt);
      this.uavOutlineSyncTimer += dt;
      if (this.uavOutlineSyncTimer >= 0.35) {
        this.uavOutlineSyncTimer = 0;
        const nowMs = performance.now();
        const revealUntil = nowMs + Math.max(800, this.state.activeUavSec * 1000);
        for (let i = 0; i < this.targets.length; i++) {
          const t = this.targets[i];
          if (t && t.type === 'COMBAT_BOT' && !(t as YardBotEntity).isAlly) {
            if (!t.isDown) {
              t.root.userData = t.root.userData || {};
              t.root.userData.radarRevealedUntilMs = Math.max(
                Number(t.root.userData.radarRevealedUntilMs || 0),
                revealUntil
              );
              setBotEnemyOutline(t, true);
            } else {
              setBotEnemyOutline(t, false);
            }
          }
        }
      }
      if (this.state.activeUavSec <= 0 && this.uavOutlinedActive) {
        this.uavOutlinedActive = false;
        for (let i = 0; i < this.targets.length; i++) {
          const t = this.targets[i];
          if (t && t.id !== this.outlinedEnemyBotId) {
            setBotEnemyOutline(t, false);
          }
        }
      }
    }

    if (this.magCheckTimer > 0) {
      this.magCheckTimer -= dt;
      if (this.magCheckTimer <= 0) {
        this.state.magCheckVisible = false;
        if (this.state.reloadPhase === 'MAG_CHECK') {
          this.state.reloadPhase = 'IDLE';
        }
        if (this.state.reloadPhase === 'IDLE') {
          this.state.reloadTypeLabel = '';
        }
      }
    }

    // Sniper Bolt-Action Chambering Timer (Cycles fresh round into battery & returns to scope if player was scoped!)
    if (this.sniperChamberTimer > 0) {
      this.sniperChamberTimer -= dt;
      if (this.sniperChamberTimer <= 0) {
        this.sniperChamberTimer = 0;
        if (
          this.state.activeWeapon === 'SNIPER_BOLT' ||
          this.state.activeWeapon === 'SNIPER_TACTICAL' ||
          this.state.activeWeapon === 'SNIPER_AWP' ||
          this.state.activeWeapon === 'SNIPER_HEAVY'
        ) {
          if (this.state.currentMagRounds > 0) {
            this.state.currentMagRounds -= 1;
            this.state.chambered = 1;
            this.state.boltLockedBack = false;
            this.state.reloadTypeLabel = '';
            if (
              this.sniperReturnToScopeAfterBolt &&
              this.state.reloadPhase === 'IDLE' &&
              this.state.equippedGrenade === null
            ) {
              this.state.isAds = true;
              soundEngine.playMechanicalSwitch(1.08);
            }
          } else {
            this.state.chambered = 0;
            this.state.boltLockedBack = true;
            this.state.reloadTypeLabel = 'FERROLHO ABERTO — SEM MUNIÇÃO';
          }
          this.sniperReturnToScopeAfterBolt = false;
          this.emitHud();
        }
      }
    }

    // 2. Continuous Fire / Burst Fire Handling (bloqueado durante Sniper Bullet Cam / Detonação C4)
    if (this.fireCooldown > 0) {
      this.fireCooldown -= dt;
    }
    if (!cineLocked && this.fireCooldown <= 0) {
      if (this.burstRemaining > 0) {
        if (this.state.chambered === 0 && this.state.activeWeapon !== 'KNIFE_TACTICAL') {
          this.burstRemaining = 0;
          soundEngine.playDryFire();
          if (this.state.currentMagRounds <= 0) {
            this.triggerReload(false);
          } else {
            this.triggerManualBoltRack();
          }
        } else {
          this.executeSingleShot();
        }
      } else if (
        this.state.fireMode === 'AUTO' &&
        (this.mouseButtonsHeld.has(0) || this.touchFireHeld) &&
        this.state.reloadPhase === 'IDLE' &&
        !this.grenadeSystem.isBusyOrHolding()
      ) {
        if (this.state.chambered === 0 && this.state.activeWeapon !== 'KNIFE_TACTICAL') {
          soundEngine.playDryFire();
          if (this.state.currentMagRounds <= 0) {
            this.triggerReload(false);
          } else {
            this.triggerManualBoltRack();
          }
        } else {
          this.executeSingleShot();
        }
      }
    }

    // 3. Update Multi-Stage Reload State Machine & Hand Kinematics
    if (!cineLocked) {
      this.updateReloadStateMachine(dt);

      // 3b. Late collider bake: keep feet on walkable floor (new GLB maps).
      this.applyPendingFloorSnap();

      // 4. Player Movement, Stance (Stand/Crouch/Sprint/Slide) & Q/E Leaning
      this.updatePlayerMovementAndCollision(dt);

      // 5. Weapon ADS Alignment, Respiratory Breath Hold, Recoil & Wall-Tuck
      this.updateWeaponKinematicsAndOptics(dt);
    }

    // 6. Reactive Targets & Killhouse Combat Bot AI (roda em slow-motion durante Bullet Cam / Explosão C4)
    this.updateTargetsAndCombatAI(dt);

    // 6b. Warface class support (ammo / heal+revive / armor) + medic markers
    if (!cineLocked) {
      updateClassSupport(this as any, dt);
    }
    this.playerGesture?.update(dt);
    this.classKitProps?.update(dt);
    const planting =
      (this.state.drillMode === 'YARD_BOMB_5V5' ||
        this.state.drillMode === 'DUST2_BOMB_5V5' ||
        this.state.drillMode === 'ASSAULT_BOMB_5V5' ||
        this.state.drillMode === 'INDUSTRIA_BOMB_5V5' ||
        this.state.drillMode === 'HANGAR_BOMB_5V5' ||
      this.state.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
      this.state.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      isV23BombMapMode(this.state.drillMode)) &&
      this.yardBombSystem?.info.bombStatus === 'PLANTING';
    this.c4PlantView?.setPlanting(Boolean(planting));
    this.c4PlantView?.update(dt);

    // 6c. Red outline highlight when aiming directly at a living enemy operator
    this.enemyOutlineTimer += dt;
    const isPlayerAliveForOutline =
      !cineLocked &&
      this.state.health > 0 &&
      !this.isPlayerDying &&
      !this.playerDeathTp?.isActive();
    if (!isPlayerAliveForOutline) {
      this.clearEnemyAimOutline();
    } else if (this.enemyOutlineTimer >= 0.08) {
      this.enemyOutlineTimer = 0;
      this.camera.getWorldPosition(_rayOrigin);
      this.camera.getWorldDirection(_rayDir);
      const prevFar = this.raycaster.far;
      this.raycaster.set(_rayOrigin, _rayDir);
      this.raycaster.far = 95;
      const aimHit = raycastCombatShot(
        this.raycaster,
        this.shootableMeshes,
        this.getActiveGlbCollider(),
        this.combatRayHit
      );
      this.raycaster.far = prevFar;
      let nextHoveredEnemyId: string | null = null;
      if (aimHit && !aimHit.isEnvironment && aimHit.object) {
        const tId = aimHit.object.userData?.targetId as string | undefined;
        if (tId) {
          const target = this.targetMap.get(tId);
          if (
            target &&
            target.type === 'COMBAT_BOT' &&
            !target.isDown &&
            !(target as YardBotEntity).isAlly
          ) {
            nextHoveredEnemyId = tId;
          }
        }
      }
      if (nextHoveredEnemyId !== this.outlinedEnemyBotId) {
        if (this.outlinedEnemyBotId && this.state.activeUavSec <= 0) {
          const oldTarget = this.targetMap.get(this.outlinedEnemyBotId);
          if (oldTarget) setBotEnemyOutline(oldTarget, false);
        }
        if (nextHoveredEnemyId) {
          const newTarget = this.targetMap.get(nextHoveredEnemyId);
          if (newTarget) setBotEnemyOutline(newTarget, true);
        }
        this.outlinedEnemyBotId = nextHoveredEnemyId;
      }
    }

    // 7. Update Pooled Brass Casings, Dropped Magazines, Sparks, Tracers & 3D Grenades
    this.fxPool.update(dt);
    this.grenadeSystem.update(
      dt,
      this.colliders,
      this.walkBobAmp,
      (x, y, z) => this.getCurrentGroundHeight(x, y, z)
    );
    this.skySystem.update(this.playerPos, dt);
    this.state.isThrowingGrenade = this.grenadeSystem.isThrowing();
    this.state.equippedGrenade = this.grenadeSystem.getHeldGrenade();

    // 8. Throttled HUD Sync (30Hz durante câmera cinematográfica/shellshock, 11Hz em combate normal)
    this.hudSyncTimer += rawDt;
    const hudInterval =
      cineLocked || grenadeKillCamActive || this.state.isShellshocked
        ? 0.033
        : 0.09;
    if (this.hudSyncTimer >= hudInterval) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }
  }

  private updateReloadStateMachine(dt: number): void {
    runReloadStateMachine(this as any, dt);
  }

  private updatePlayerMovementAndCollision(dt: number): void {
    runPlayerMovement(this as any, dt);
  }

  private checkHorizontalCollision(
    x: number,
    z: number,
    yBottom: number,
    r: number
  ): boolean {
    return runHorizontalCollision(this as any, x, z, yBottom, r);
  }

  private updateWeaponKinematicsAndOptics(dt: number): void {
    runWeaponKinematics(this as any, dt);
  }

  private updateTargetsAndCombatAI(dt: number): void {
    runTargetsCombatAI(this as any, dt);
  }

  private emitHud(force = false): void {
    const mode = this.state.drillMode;
    if (shouldForceSpawnDebug(mode, false)) {
      const col = this.getActiveGlbCollider();
      const wb = col?.worldBounds;
      const groundY = col?.ready
        ? Number(
            col
              .getGroundHeight(
                this.playerPos.x,
                this.playerPos.y + 0.1,
                this.playerPos.z
              )
              .toFixed(3)
          )
        : -999;
      const delta =
        groundY > -900 ? Math.abs(groundY - this.playerPos.y) : 999;
      this.state.spawnDebug = {
        mode,
        xz: `${this.playerPos.x.toFixed(2)}, ${this.playerPos.z.toFixed(2)}`,
        feetY: Number(this.playerPos.y.toFixed(3)),
        groundY,
        ready: Boolean(col?.ready),
        tris: col?.triangleCount ?? 0,
        aabb: wb && !wb.isEmpty()
          ? `${wb.min.x.toFixed(0)}..${wb.max.x.toFixed(0)} x ${wb.min.y.toFixed(0)}..${wb.max.y.toFixed(0)} x ${wb.min.z.toFixed(0)}..${wb.max.z.toFixed(0)}`
          : 'EMPTY',
        harness: isMapSpawnHarness(mode),
        note:
          !col?.ready
            ? 'COLIDER NAO READY'
            : delta > 0.85
              ? `UNDER/OFF FLOOR dY=${delta.toFixed(2)}`
              : 'ON FLOOR',
      };
    } else if (!isNewGlbBombArena(mode) && !isMapSpawnHarness(mode)) {
      this.state.spawnDebug = undefined;
    }
    if (force) this.hudForceEmit.value = true;
    emitHudIfChanged(
      {
        state: this.state,
        primaryWeapon: this.primaryWeapon,
        secondaryWeapon: this.secondaryWeapon,
        playerPos: this.playerPos,
        yaw: this.yaw,
        targets: this.targets as Array<{
          id: string;
          sector: 'RANGE' | 'KILLHOUSE';
          root: { position: { x: number; z: number } };
          isDown: boolean;
          isAlly?: boolean;
        }>,
        cachedRadarTargets: this.cachedRadarTargets,
        lastFingerprint: this.hudFingerprint,
        forceNext: this.hudForceEmit,
      },
      this.onHudUpdate
    );
  }

  public dispose(): void {
    this.disposed = true;
    disposeTacticalPostFx(this.postFx);
    this.unsubOnlineHits?.();
    this.unsubOnlineHits = null;
    this.unsubOnlineGrenades?.();
    this.unsubOnlineGrenades = null;
    this.unsubOnlineGrenadeDetonations?.();
    this.unsubOnlineGrenadeDetonations = null;
    this.unsubOnlineScorestreaks?.();
    this.unsubOnlineScorestreaks = null;
    this.unsubOnlineClassSupport?.();
    this.unsubOnlineClassSupport = null;
    this.unsubOnlineBomb?.();
    this.unsubOnlineBomb = null;
    this.unsubOnlineRounds?.();
    this.unsubOnlineRounds = null;
    this.unsubInventory?.();
    this.unsubInventory = null;
    cancelAnimationFrame(this.frameId);
    if (this.rankUpTimeoutId !== null) {
      window.clearTimeout(this.rankUpTimeoutId);
      this.rankUpTimeoutId = null;
    }

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('focus', this.onWindowFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onWebGlContextLost
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.onWebGlContextRestored
    );
    this.renderer.domElement.removeEventListener(
      'touchstart',
      this.onCanvasTouchStart
    );
    this.renderer.domElement.removeEventListener(
      'touchmove',
      this.onCanvasTouchMove
    );
    this.renderer.domElement.removeEventListener(
      'touchend',
      this.onCanvasTouchEnd
    );
    this.renderer.domElement.removeEventListener(
      'touchcancel',
      this.onCanvasTouchEnd
    );

    runtimeTelemetry.flush(true);
    this.bulletCamManager?.dispose();
    this.bombBlastManager?.dispose();
    this.shellshockController?.dispose();
    this.grenadeKillCam?.dispose();
    this.weaponRig?.dispose();
    this.fxPool?.dispose?.();
    (
      this.grenadeSystem as unknown as {
        dispose?: () => void;
        clearAll?: () => void;
      }
    )?.dispose?.();
    this.grenadeSystem?.clearAll?.();
    this.skySystem?.dispose();

    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }

    const disposeMaterialMaps = (m: THREE.Material) => {
      const std = m as THREE.MeshStandardMaterial;
      if (std.map) std.map.dispose();
      if (std.normalMap) std.normalMap.dispose();
      if (std.roughnessMap) std.roughnessMap.dispose();
      if (std.metalnessMap) std.metalnessMap.dispose();
      if (std.aoMap) std.aoMap.dispose();
      if (std.emissiveMap) std.emissiveMap.dispose();
      if (std.bumpMap) std.bumpMap.dispose();
      m.dispose();
    };

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(disposeMaterialMaps);
        } else if (child.material) {
          disposeMaterialMaps(child.material);
        }
      }
    });

    clearSharedMaterialCache();

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
