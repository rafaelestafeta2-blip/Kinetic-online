import * as THREE from 'three';
import {
  playC4DetonationExplosion,
  playC4KeypadDigitSound,
  playMatchEndFanfare,
  playRealBombPlantedVoice,
  playRealC4Beep,
  stopMatchEndFanfare,
} from '../audio/characterAndBombAudio';
import { soundEngine } from '../audio/soundEngine';
import { playSpatialBotGunshot } from '../audio/spatialCombatAudio';
import { getCloudSyncState, getPlayerCallsign, recordCombatTelemetryDelta } from '../firebase/playerCloudSync';
import { areAllOnlinePlayersLoaded } from '../multiplayer/onlineRoomService';
import { OnlineRoundEvent } from '../multiplayer/onlineTypes';
import { canGrantMatchProgressionRewards } from '../progression/matchProgressionGate';
import { mobileHardware } from '../mobile/nativeHardware';
import { DrillMode, SquadOperatorStats, WeaponId, YardBombHudInfo } from '../types/game';
import { BallisticsFXPool } from './ballisticsPool';
import { triggerBotFireAnimation, triggerBotHitAnimation } from './botCharacterSystem';
import { ASSAULT_BOMB_SITE_A, ASSAULT_BOMB_SITE_B, getAssaultCalloutForPos } from './assaultLevelBuilder';
import { DUST2_BOMB_SITE_A, DUST2_BOMB_SITE_B, getDust2CalloutForPos } from './dust2LevelBuilder';
import {
  INDUSTRIA_BOMB_SITE_A,
  INDUSTRIA_BOMB_SITE_B,
  getIndustriaCalloutForPos,
} from './industriaLevelBuilder';
import {
  HANGAR_BOMB_SITE_A,
  HANGAR_BOMB_SITE_B,
  getHangarCalloutForPos,
} from './hangarLevelBuilder';
import {
  EASTERN_CITY_BOMB_SITE_A,
  EASTERN_CITY_BOMB_SITE_B,
  getEasternCityCalloutForPos,
} from './easternCityLevelBuilder';
import {
  MIRAGE_ANUBIS_BOMB_SITE_A,
  MIRAGE_ANUBIS_BOMB_SITE_B,
  getMirageAnubisCalloutForPos,
} from './mirageAnubisLevelBuilder';
import {
  STATION_ARENA_BLACKTHORN_FLAG_BASE,
  STATION_ARENA_VANGUARD_FLAG_BASE,
  getStationArenaCalloutForPos,
} from './stationArenaLevelBuilder';
import { TacticalTargetEntity } from './levelBuilder';
import { getYardCalloutForPos, YARD_BOMB_SITE_A, YARD_BOMB_SITE_B } from './yardMapData';
import { YardBotEntity } from './yardPropsBuilder';
import { createPlantedC4Visual } from './c4BombProp';

function createTacticalFlagProp(colorHex: number, teamLabel: 'VANGUARD' | 'BLACKTHORN'): {
  group: THREE.Group;
  bannerMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = `TacticalFlag_${teamLabel}`;

  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.92, 24),
    new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.04;
  ringMesh.userData.ignoreCollider = true;
  group.add(ringMesh);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.42, 0.16, 16),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.75,
      roughness: 0.3,
    })
  );
  pedestal.position.y = 0.08;
  pedestal.userData.ignoreCollider = true;
  group.add(pedestal);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 2.55, 12),
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.85,
      roughness: 0.22,
    })
  );
  pole.position.y = 1.35;
  pole.userData.ignoreCollider = true;
  group.add(pole);

  const finial = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshBasicMaterial({ color: colorHex })
  );
  finial.position.y = 2.68;
  finial.userData.ignoreCollider = true;
  group.add(finial);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 256, 128);
  if (teamLabel === 'VANGUARD') {
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(1, '#38bdf8');
  } else {
    grad.addColorStop(0, '#dc2626');
    grad.addColorStop(1, '#f97316');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamLabel === 'VANGUARD' ? '★ VANGUARD' : '★ BLACKTHORN', 128, 64);

  const flagTex = new THREE.CanvasTexture(canvas);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  const bannerGeo = new THREE.PlaneGeometry(1.15, 0.62, 8, 2);
  const bannerMesh = new THREE.Mesh(
    bannerGeo,
    new THREE.MeshBasicMaterial({
      map: flagTex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.96,
    })
  );
  bannerMesh.position.set(0.58, 2.22, 0);
  bannerMesh.userData.ignoreCollider = true;
  group.add(bannerMesh);

  return { group, bannerMesh, ringMesh };
}

const _allyOrigin = new THREE.Vector3();
const _enemyPos = new THREE.Vector3();

function createInitialSquadStats(): SquadOperatorStats[] {
  return [
    { callsign: getPlayerCallsign(), roleTitle: 'LÍDER DE ESQUADRÃO', weaponId: 'M4_CARBINE', kills: 0, deaths: 0, assists: 0, headshots: 0, score: 0, isPlayer: true },
    { callsign: 'RECON-02', roleTitle: 'ATIRADOR DE ELITE', weaponId: 'SNIPER_BOLT', kills: 0, deaths: 0, assists: 0, headshots: 0, score: 0, isPlayer: false },
    { callsign: 'STRIKER-03', roleTitle: 'ASSALTO PESADO', weaponId: 'AK47_RIFLE', kills: 0, deaths: 0, assists: 0, headshots: 0, score: 0, isPlayer: false },
    { callsign: 'LIFELINE-04', roleTitle: 'PARAMÉDICO TÁTICO', weaponId: 'M4_CARBINE', kills: 0, deaths: 0, assists: 0, headshots: 0, score: 0, isPlayer: false },
    { callsign: 'WARDEN-05', roleTitle: 'ENGENHEIRO TÁTICO', weaponId: 'SMG_MP5', kills: 0, deaths: 0, assists: 0, headshots: 0, score: 0, isPlayer: false },
  ];
}

export class YardBombSystem {
  private c4MeshGroup: THREE.Group;
  private c4LedMesh: THREE.Mesh;
  private c4EnsureLoaded: () => Promise<void>;
  private vanguardFlagGroup: THREE.Group;
  private vanguardFlagBanner: THREE.Mesh;
  private vanguardFlagRing: THREE.Mesh;
  private blackthornFlagGroup: THREE.Group;
  private blackthornFlagBanner: THREE.Mesh;
  private blackthornFlagRing: THREE.Mesh;
  private vanguardFlagWorldPos = new THREE.Vector3().copy(STATION_ARENA_VANGUARD_FLAG_BASE);
  private blackthornFlagWorldPos = new THREE.Vector3().copy(STATION_ARENA_BLACKTHORN_FLAG_BASE);
  private beepAccum = 0;
  private allyFireTimer = 0;
  private isPlantingHeld = false;
  private lastKeypadDigitIdx = -1;
  private activeMode: DrillMode = 'YARD_BOMB_5V5';
  private isOnlineMatch = false;
  private onlineLocalTeam: 'VANGUARD' | 'BLACKTHORN' = 'VANGUARD';
  private onlineVanguardCount = 0;
  private onlineBlackthornCount = 0;
  private onBombStateChangedCb:
    | ((
        status: 'CARRIED' | 'PLANTED' | 'DEFUSED' | 'DETONATED',
        site: 'NONE' | 'A' | 'B'
      ) => void)
    | null = null;
  private lastAppliedRoundEventKey = '';
  private onlineBarrierWaitSec = 0;

  public info: YardBombHudInfo = {
    bombStatus: 'CARRIED', plantedSite: null, nearSite: null, plantProgress: 0,
    roundTimerSec: 125, c4TimerSec: 40, alliesAlive: 5, enemiesAlive: 5,
    calloutLabel: 'SPAWN VANGUARD (SUL · RUA DO HOTEL)', currentRound: 1, maxRounds: 6,
    vanguardScore: 0, blackthornScore: 0, roundState: 'EQUIP', roundWinner: null,
    roundWinReason: '', roundTransitionSec: 0, equipTimerSec: 7, matchWinner: null,
    lastRoundXp: 0, lastRoundCash: 0, totalMatchXp: 0, totalMatchCash: 0,
    squadStats: createInitialSquadStats(),
  };

  public setOnlineContext(
    isOnline: boolean,
    localTeam: 'VANGUARD' | 'BLACKTHORN' = 'VANGUARD',
    vanguardCount = 1,
    blackthornCount = 0
  ): void {
    this.isOnlineMatch = isOnline;
    this.onlineLocalTeam = localTeam;
    this.onlineVanguardCount = vanguardCount;
    this.onlineBlackthornCount = blackthornCount;
  }

  public setOnBombStateChanged(
    cb:
      | ((
          status: 'CARRIED' | 'PLANTED' | 'DEFUSED' | 'DETONATED',
          site: 'NONE' | 'A' | 'B'
        ) => void)
      | null
  ): void {
    this.onBombStateChangedCb = cb;
  }

  private getActiveBombSites(): { siteA: THREE.Vector3; siteB: THREE.Vector3 } {
    const isDust2 = this.activeMode === 'DUST2_BOMB_5V5';
    const isAssault = this.activeMode === 'ASSAULT_BOMB_5V5';
    const isIndustria = this.activeMode === 'INDUSTRIA_BOMB_5V5';
    const isHangar = this.activeMode === 'HANGAR_BOMB_5V5';
    const isEasternCity = this.activeMode === 'EASTERN_CITY_BOMB_5V5';
    const isMirageAnubis = this.activeMode === 'MIRAGE_ANUBIS_BOMB_5V5';
    const isStationCapture = this.activeMode === 'STATION_CAPTURE_5V5';
    const siteA = isDust2
      ? DUST2_BOMB_SITE_A
      : isAssault
        ? ASSAULT_BOMB_SITE_A
        : isIndustria
          ? INDUSTRIA_BOMB_SITE_A
          : isHangar
            ? HANGAR_BOMB_SITE_A
            : isEasternCity
              ? EASTERN_CITY_BOMB_SITE_A
              : isMirageAnubis
                ? MIRAGE_ANUBIS_BOMB_SITE_A
                : isStationCapture
                  ? STATION_ARENA_VANGUARD_FLAG_BASE
                  : YARD_BOMB_SITE_A;
    const siteB = isDust2
      ? DUST2_BOMB_SITE_B
      : isAssault
        ? ASSAULT_BOMB_SITE_B
        : isIndustria
          ? INDUSTRIA_BOMB_SITE_B
          : isHangar
            ? HANGAR_BOMB_SITE_B
            : isEasternCity
              ? EASTERN_CITY_BOMB_SITE_B
              : isMirageAnubis
                ? MIRAGE_ANUBIS_BOMB_SITE_B
                : isStationCapture
                  ? STATION_ARENA_BLACKTHORN_FLAG_BASE
                  : YARD_BOMB_SITE_B;
    return { siteA, siteB };
  }

  public captureMatchProgressSnapshot(): void {
    const profile = getCloudSyncState().profile;
    this.info.matchStartXp = profile.playerXp;
    this.info.matchStartRank = profile.rankLevel;
    this.info.matchStartCash = profile.playerCash;
    this.info.matchStartUnlockedWeapons = [...(profile.unlockedWeapons || [])];
  }

  private triggerCaptureAlert(
    text: string,
    team: 'VANGUARD' | 'BLACKTHORN' | 'NEUTRAL',
    durationMs = 5200
  ): void {
    this.info.captureAlertText = text;
    this.info.captureAlertTeam = team;
    this.info.captureAlertUntilMs = Date.now() + durationMs;
  }

  constructor(sceneGroup: THREE.Object3D) {
    const planted = createPlantedC4Visual();
    this.c4MeshGroup = planted.group;
    this.c4LedMesh = planted.ledMesh;
    this.c4EnsureLoaded = planted.ensureLoaded;
    this.c4MeshGroup.visible = false;
    sceneGroup.add(this.c4MeshGroup);
    void this.c4EnsureLoaded();

    const vgFlag = createTacticalFlagProp(0x0ea5e9, 'VANGUARD');
    this.vanguardFlagGroup = vgFlag.group;
    this.vanguardFlagBanner = vgFlag.bannerMesh;
    this.vanguardFlagRing = vgFlag.ringMesh;
    this.vanguardFlagGroup.visible = false;
    sceneGroup.add(this.vanguardFlagGroup);

    const btFlag = createTacticalFlagProp(0xef4444, 'BLACKTHORN');
    this.blackthornFlagGroup = btFlag.group;
    this.blackthornFlagBanner = btFlag.bannerMesh;
    this.blackthornFlagRing = btFlag.ringMesh;
    this.blackthornFlagGroup.visible = false;
    sceneGroup.add(this.blackthornFlagGroup);
  }

  public resetRound(mode: DrillMode = 'YARD_BOMB_5V5', keepMatchScore = false): void {
    this.activeMode = mode;
    const isCapture = mode === 'STATION_CAPTURE_5V5';
    this.isPlantingHeld = false;
    this.lastKeypadDigitIdx = -1;
    this.beepAccum = 0;
    this.allyFireTimer = 0;
    this.c4MeshGroup.visible = false;
    this.vanguardFlagWorldPos.copy(STATION_ARENA_VANGUARD_FLAG_BASE);
    this.blackthornFlagWorldPos.copy(STATION_ARENA_BLACKTHORN_FLAG_BASE);
    this.vanguardFlagGroup.position.copy(this.vanguardFlagWorldPos);
    this.blackthornFlagGroup.position.copy(this.blackthornFlagWorldPos);
    this.vanguardFlagGroup.visible = isCapture;
    this.blackthornFlagGroup.visible = isCapture;
    if (!keepMatchScore) {
      stopMatchEndFanfare();
      this.lastAppliedRoundEventKey = '';
      this.onlineBarrierWaitSec = 0;
    }

    const prevRound = keepMatchScore ? this.info.currentRound : 1;
    const prevVg = keepMatchScore ? this.info.vanguardScore : 0;
    const prevBt = keepMatchScore ? this.info.blackthornScore : 0;
    const prevTotalXp = keepMatchScore ? this.info.totalMatchXp : 0;
    const prevTotalCash = keepMatchScore ? this.info.totalMatchCash : 0;
    const prevStats = keepMatchScore && this.info.squadStats
      ? this.info.squadStats.map((s) => ({ ...s }))
      : createInitialSquadStats();
    const snapXp = keepMatchScore ? this.info.matchStartXp : undefined;
    const snapRank = keepMatchScore ? this.info.matchStartRank : undefined;
    const snapCash = keepMatchScore ? this.info.matchStartCash : undefined;
    const snapUnlocks = keepMatchScore ? this.info.matchStartUnlockedWeapons : undefined;

    this.info = {
      bombStatus: 'CARRIED', plantedSite: null, nearSite: null, plantProgress: 0,
      roundTimerSec: 125, c4TimerSec: 40, alliesAlive: 5, enemiesAlive: 5,
      calloutLabel:
        mode === 'DUST2_BOMB_5V5'
          ? 'BASE VANGUARD (TR SPAWN · SUL)'
          : mode === 'ASSAULT_BOMB_5V5'
            ? 'BASE VANGUARD (CT STREET SPAWN)'
            : mode === 'INDUSTRIA_BOMB_5V5'
              ? 'BASE VANGUARD (APRON SUL · INDUSTRIA)'
              : mode === 'HANGAR_BOMB_5V5'
                ? 'BASE VANGUARD (PORTÃO SUL · HANGAR)'
                : mode === 'EASTERN_CITY_BOMB_5V5'
                  ? 'BASE VANGUARD (ENTRADA SUL · CIDADE LESTE)'
                : mode === 'MIRAGE_ANUBIS_BOMB_5V5'
                  ? 'BASE VANGUARD (ENTRADA SUL · MIRAGE ANUBIS)'
                : mode === 'STATION_CAPTURE_5V5'
                  ? 'BASE VANGUARD (TERMINAL SUL · BANDEIRA ALIADA)'
                : 'BASE VANGUARD (SUL · RUA DO HOTEL)',
      currentRound: prevRound, maxRounds: 6, vanguardScore: prevVg, blackthornScore: prevBt,
      // Warface-style equip window before every round (including first).
      roundState: 'EQUIP',
      equipTimerSec: 7,
      roundWinner: null, roundWinReason: '', roundTransitionSec: 0,
      matchWinner: null, lastRoundXp: 0, lastRoundCash: 0,
      totalMatchXp: prevTotalXp, totalMatchCash: prevTotalCash,
      matchStartXp: snapXp, matchStartRank: snapRank, matchStartCash: snapCash,
      matchStartUnlockedWeapons: snapUnlocks,
      isSpectating: false, spectatedCallsign: undefined, spectatedWeapon: undefined, spectatedHealth: undefined,
      squadStats: prevStats,
      isCaptureMode: isCapture,
      vanguardFlagStatus: 'AT_BASE',
      blackthornFlagStatus: 'AT_BASE',
      vanguardFlagCarrier: null,
      blackthornFlagCarrier: null,
      vanguardFlagPos: {
        x: STATION_ARENA_VANGUARD_FLAG_BASE.x,
        y: STATION_ARENA_VANGUARD_FLAG_BASE.y,
        z: STATION_ARENA_VANGUARD_FLAG_BASE.z,
      },
      blackthornFlagPos: {
        x: STATION_ARENA_BLACKTHORN_FLAG_BASE.x,
        y: STATION_ARENA_BLACKTHORN_FLAG_BASE.y,
        z: STATION_ARENA_BLACKTHORN_FLAG_BASE.z,
      },
      captureAlertText: isCapture
        ? '⚑ MODO CAPTURA: ROUBE A BANDEIRA INIMIGA E TRAGA PARA A SUA BASE!'
        : null,
      captureAlertTeam: isCapture ? 'NEUTRAL' : null,
      captureAlertUntilMs: isCapture ? Date.now() + 6000 : 0,
    };

    if (!keepMatchScore) {
      this.captureMatchProgressSnapshot();
    }
  }

  public recordKillEvent(
    killerName: string,
    killerTeam: 'VANGUARD' | 'BLACKTHORN',
    victimName: string,
    victimTeam: 'VANGUARD' | 'BLACKTHORN',
    isHeadshot: boolean,
    playerPrimaryWeapon?: WeaponId
  ): void {
    const stats = this.info.squadStats || createInitialSquadStats();
    if (playerPrimaryWeapon) {
      const playerOp = stats.find((s) => s.isPlayer);
      if (playerOp && playerPrimaryWeapon !== 'KNIFE_TACTICAL') {
        playerOp.weaponId = playerPrimaryWeapon;
      }
    }

    if (this.isOnlineMatch) {
      const killerOp = stats.find(
        (s) => s.callsign === killerName || (killerName === 'VOCÊ' && s.isPlayer)
      );
      if (killerOp) {
        killerOp.kills += 1;
        if (isHeadshot) killerOp.headshots += 1;
        killerOp.score += isHeadshot ? 150 : 100;
        if (killerOp.isPlayer) {
          recordCombatTelemetryDelta({ kills: 1, headshots: isHeadshot ? 1 : 0 });
        }
      }
      const victimOp = stats.find(
        (s) => s.callsign === victimName || (victimName === 'VOCÊ' && s.isPlayer)
      );
      if (victimOp) {
        victimOp.deaths += 1;
        if (victimOp.isPlayer) recordCombatTelemetryDelta({ deaths: 1 });
      }
      this.info.squadStats = [...stats];
      return;
    }

    if (killerTeam === 'VANGUARD') {
      const killerOp =
        stats.find((s) => s.callsign === killerName || (killerName === 'VOCÊ' && s.isPlayer)) || stats[0];
      if (killerOp) {
        killerOp.kills += 1;
        if (isHeadshot) killerOp.headshots += 1;
        killerOp.score += isHeadshot ? 150 : 100;
        if (killerOp.isPlayer) {
          recordCombatTelemetryDelta({ kills: 1, headshots: isHeadshot ? 1 : 0 });
        }
      }
      const others = stats.filter((s) => s.callsign !== killerOp?.callsign);
      if (others.length > 0 && Math.random() < 0.65) {
        const assister = others[Math.floor(Math.random() * others.length)];
        assister.assists += 1;
        assister.score += 50;
        if (assister.isPlayer) recordCombatTelemetryDelta({ assists: 1 });
      }
    }

    if (victimTeam === 'VANGUARD') {
      const victimOp = stats.find((s) => s.callsign === victimName || (victimName === 'VOCÊ' && s.isPlayer));
      if (victimOp) {
        victimOp.deaths += 1;
        if (victimOp.isPlayer) recordCombatTelemetryDelta({ deaths: 1 });
      }
    }

    this.info.squadStats = [...stats];
  }

  public triggerPlantBomb(): void {
    if (this.info.roundState !== 'PLAYING' || this.info.nearSite === null) return;
    const isDefender = this.isOnlineMatch && this.onlineLocalTeam === 'BLACKTHORN';
    if (isDefender) {
      if (
        this.info.bombStatus === 'PLANTED' &&
        this.info.plantedSite === this.info.nearSite
      ) {
        this.isPlantingHeld = true;
      }
      return;
    }
    if (this.info.bombStatus === 'CARRIED' || this.info.bombStatus === 'PLANTING') {
      this.isPlantingHeld = true;
    }
  }

  public applyRemoteBombState(
    bombStatus: 'CARRIED' | 'PLANTED' | 'DEFUSED' | 'DETONATED',
    plantedSite: 'NONE' | 'A' | 'B'
  ): void {
    const { siteA, siteB } = this.getActiveBombSites();
    if (bombStatus === 'PLANTED' && (plantedSite === 'A' || plantedSite === 'B')) {
      const wasPlanted = this.info.bombStatus === 'PLANTED';
      this.info.bombStatus = 'PLANTED';
      this.info.plantedSite = plantedSite;
      this.info.plantProgress = 0;
      this.isPlantingHeld = false;
      if (!wasPlanted) {
        this.info.c4TimerSec = 40;
        soundEngine.playMechanicalSwitch(1.45);
        playRealBombPlantedVoice();
      }
      const sitePos = plantedSite === 'A' ? siteA : siteB;
      this.c4MeshGroup.position.set(sitePos.x, sitePos.y + 0.12, sitePos.z);
      this.c4MeshGroup.visible = true;
      void this.c4EnsureLoaded();
    } else if (bombStatus === 'DEFUSED') {
      this.info.bombStatus = 'DEFUSED';
      this.info.plantProgress = 0;
      this.isPlantingHeld = false;
      this.c4MeshGroup.visible = false;
      soundEngine.playMechanicalSwitch(1.6);
    } else if (bombStatus === 'DETONATED') {
      this.info.bombStatus = 'DETONATED';
      this.info.plantProgress = 0;
      this.isPlantingHeld = false;
      this.c4MeshGroup.visible = false;
    } else if (bombStatus === 'CARRIED') {
      this.info.bombStatus = 'CARRIED';
      this.info.plantedSite = null;
      this.info.plantProgress = 0;
      this.isPlantingHeld = false;
      this.c4MeshGroup.visible = false;
    }
  }

  public applyRemoteRoundEvent(
    evt: OnlineRoundEvent,
    onReward: (xp: number, cash: number, isMatchEnd: boolean) => void,
    onAdvanceNextRound: () => void
  ): void {
    const key = `${evt.kind}:${evt.roundNumber}:${evt.vanguardScore ?? ''}:${evt.blackthornScore ?? ''}`;
    if (key === this.lastAppliedRoundEventKey) return;
    this.lastAppliedRoundEventKey = key;

    if (evt.kind === 'ROUND_OVER') {
      if (this.info.roundState === 'PLAYING' || this.info.roundState === 'EQUIP') {
        this.info.roundState = 'PLAYING';
        this.finishCurrentRound(
          evt.winner || 'VANGUARD',
          evt.reason || 'RODADA FINALIZADA!',
          onReward
        );
      }
      if (typeof evt.vanguardScore === 'number') {
        this.info.vanguardScore = Math.max(this.info.vanguardScore, evt.vanguardScore);
      }
      if (typeof evt.blackthornScore === 'number') {
        this.info.blackthornScore = Math.max(this.info.blackthornScore, evt.blackthornScore);
      }
      return;
    }

    if (evt.kind === 'NEXT_ROUND') {
      if (typeof evt.vanguardScore === 'number') {
        this.info.vanguardScore = Math.max(this.info.vanguardScore, evt.vanguardScore);
      }
      if (typeof evt.blackthornScore === 'number') {
        this.info.blackthornScore = Math.max(this.info.blackthornScore, evt.blackthornScore);
      }
      if (evt.roundNumber > this.info.currentRound || this.info.roundState === 'ROUND_OVER') {
        this.info.currentRound = Math.max(this.info.currentRound, evt.roundNumber);
        this.resetRound(this.activeMode, true);
        onAdvanceNextRound();
      }
    }
  }

  public finishCurrentRound(
    winner: 'VANGUARD' | 'BLACKTHORN',
    reason: string,
    onReward: (xp: number, cash: number, isMatchEnd: boolean) => void
  ): void {
    if (this.info.roundState !== 'PLAYING') return;

    if (winner === 'VANGUARD') this.info.vanguardScore += 1;
    else this.info.blackthornScore += 1;

    const progressionOk = canGrantMatchProgressionRewards();
    let roundXp = progressionOk ? (winner === 'VANGUARD' ? 180 : 75) : 0;
    let roundCash = progressionOk ? (winner === 'VANGUARD' ? 400 : 150) : 0;

    const roundsPlayed = this.info.vanguardScore + this.info.blackthornScore;
    const hasMajorityClinch = this.info.vanguardScore >= 4 || this.info.blackthornScore >= 4;
    const completedSixDecisiveRounds =
      roundsPlayed >= this.info.maxRounds && this.info.vanguardScore !== this.info.blackthornScore;

    if (hasMajorityClinch || completedSixDecisiveRounds) {
      const matchWinner: 'VANGUARD' | 'BLACKTHORN' =
        this.info.vanguardScore > this.info.blackthornScore ? 'VANGUARD' : 'BLACKTHORN';
      this.info.matchWinner = matchWinner;
      this.info.roundWinner = winner;
      this.info.roundWinReason = reason;
      this.info.roundState = 'MATCH_OVER';
      this.info.isSpectating = false;
      this.info.roundTransitionSec = 0;

      if (progressionOk) {
        const matchBonusXp = matchWinner === 'VANGUARD' ? 450 : 180;
        const matchBonusCash = matchWinner === 'VANGUARD' ? 1200 : 450;
        roundXp += matchBonusXp;
        roundCash += matchBonusCash;
        recordCombatTelemetryDelta({
          matchesPlayed: 1,
          matchesWon: matchWinner === 'VANGUARD' ? 1 : 0,
        });
      }

      this.info.lastRoundXp = roundXp;
      this.info.lastRoundCash = roundCash;
      this.info.totalMatchXp += roundXp;
      this.info.totalMatchCash += roundCash;

      playMatchEndFanfare(matchWinner === 'VANGUARD');
      onReward(roundXp, roundCash, true);
    } else {
      this.info.roundWinner = winner;
      this.info.roundWinReason = reason;
      this.info.roundState = 'ROUND_OVER';
      this.info.roundTransitionSec = 3.5;
      this.info.lastRoundXp = roundXp;
      this.info.lastRoundCash = roundCash;
      this.info.totalMatchXp += roundXp;
      this.info.totalMatchCash += roundCash;
      onReward(roundXp, roundCash, false);
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3,
    targets: TacticalTargetEntity[],
    fxPool: BallisticsFXPool,
    onReward: (xp: number, cash: number, isMatchEnd: boolean) => void,
    onAdvanceNextRound: () => void,
    onMatchReturnToMenu: () => void,
    onRegisterKill?: (
      killerName: string,
      killerTeam: 'VANGUARD' | 'BLACKTHORN',
      victimName: string,
      victimTeam: 'VANGUARD' | 'BLACKTHORN',
      weaponId: WeaponId,
      isHeadshot: boolean
    ) => void,
    playerAlive = true,
    /** Local player still in Warface revive window (downed but not expired). */
    playerPendingRevive = false
  ): void {
    if (this.info.roundState === 'ROUND_OVER') {
      this.info.roundTransitionSec = Math.max(0, this.info.roundTransitionSec - dt);
      if (this.info.roundTransitionSec <= 0) {
        this.info.currentRound += 1;
        this.resetRound(this.activeMode, true);
        onAdvanceNextRound();
      }
      return;
    }

    if (this.info.roundState === 'EQUIP') {
      if (
        this.isOnlineMatch &&
        this.info.currentRound <= 1 &&
        !areAllOnlinePlayersLoaded() &&
        this.onlineBarrierWaitSec < 15
      ) {
        this.onlineBarrierWaitSec += dt;
        this.info.equipTimerSec = 7;
        return;
      }
      this.info.equipTimerSec = Math.max(0, (this.info.equipTimerSec || 0) - dt);
      if (this.info.equipTimerSec <= 0) {
        this.info.roundState = 'PLAYING';
        this.info.equipTimerSec = 0;
        soundEngine.playMechanicalSwitch(1.2);
      }
      return;
    }

    // Permanece na tela de estatísticas e pose 3D até o jogador clicar em Fechar!
    if (this.info.roundState === 'MATCH_OVER') {
      void onMatchReturnToMenu;
      return;
    }

    const isDust2 = this.activeMode === 'DUST2_BOMB_5V5';
    const isAssault = this.activeMode === 'ASSAULT_BOMB_5V5';
    const isIndustria = this.activeMode === 'INDUSTRIA_BOMB_5V5';
    const isHangar = this.activeMode === 'HANGAR_BOMB_5V5';
    const isEasternCity = this.activeMode === 'EASTERN_CITY_BOMB_5V5';
    const isMirageAnubis = this.activeMode === 'MIRAGE_ANUBIS_BOMB_5V5';
    const isStationCapture = this.activeMode === 'STATION_CAPTURE_5V5';
    const { siteA, siteB } = this.getActiveBombSites();

    this.info.calloutLabel = isDust2
      ? getDust2CalloutForPos(playerPos.x, playerPos.y, playerPos.z)
      : isAssault
        ? getAssaultCalloutForPos(playerPos.x, playerPos.y, playerPos.z)
        : isIndustria
          ? getIndustriaCalloutForPos(playerPos.x, playerPos.y, playerPos.z)
          : isHangar
            ? getHangarCalloutForPos(playerPos.x, playerPos.y, playerPos.z)
            : isEasternCity
              ? getEasternCityCalloutForPos(playerPos.x, playerPos.y, playerPos.z)
            : isMirageAnubis
              ? getMirageAnubisCalloutForPos(playerPos.x, playerPos.y, playerPos.z)
            : isStationCapture
              ? getStationArenaCalloutForPos(playerPos.x, playerPos.y, playerPos.z)
            : getYardCalloutForPos(playerPos.x, playerPos.y, playerPos.z);

    let enemies = 0;
    let allies = playerAlive ? 1 : 0;
    const enemyList: YardBotEntity[] = [];
    const allyList: YardBotEntity[] = [];

    const nowSec = performance.now() / 1000;
    let alliesPendingRevive = playerPendingRevive ? 1 : 0;
    for (let i = 0; i < targets.length; i++) {
      const bot = targets[i] as YardBotEntity;
      if (this.isOnlineMatch && !bot.root.userData?.remotePlayerUid) continue;
      if (bot.isDown) {
        if (
          bot.isAlly &&
          !bot.reviveExpired &&
          (bot.reviveUntilSec || 0) > nowSec &&
          (playerAlive || playerPendingRevive)
        ) {
          alliesPendingRevive++;
        }
        continue;
      }
      if (bot.isAlly) {
        allies++;
        allyList.push(bot);
      } else {
        enemies++;
        enemyList.push(bot);
      }
    }

    if (this.isOnlineMatch) {
      const vanguardAlive = this.onlineLocalTeam === 'VANGUARD' ? allies : enemies;
      const blackthornAlive = this.onlineLocalTeam === 'VANGUARD' ? enemies : allies;
      const vanguardPending = this.onlineLocalTeam === 'VANGUARD' ? alliesPendingRevive : 0;
      this.info.alliesAlive = vanguardAlive;
      this.info.enemiesAlive = blackthornAlive;

      if (this.onlineVanguardCount >= 1 && this.onlineBlackthornCount >= 1) {
        if (blackthornAlive === 0) {
          this.finishCurrentRound('VANGUARD', 'ESQUADRÃO BLACKTHORN ELIMINADO EM COMBATE!', onReward);
          return;
        }
        if (vanguardAlive === 0 && vanguardPending === 0 && this.info.bombStatus !== 'PLANTED') {
          this.finishCurrentRound('BLACKTHORN', 'ESQUADRÃO VANGUARD ELIMINADO EM COMBATE!', onReward);
          return;
        }
      }
    } else {
      this.info.enemiesAlive = enemies;
      this.info.alliesAlive = allies;

      if (enemies === 0 && targets.length > 0) {
        this.finishCurrentRound('VANGUARD', 'ESQUADRÃO BLACKTHORN ELIMINADO EM COMBATE!', onReward);
        return;
      }

      if (
        allies === 0 &&
        alliesPendingRevive === 0 &&
        targets.length > 0 &&
        this.info.bombStatus !== 'PLANTED'
      ) {
        this.finishCurrentRound('BLACKTHORN', 'ESQUADRÃO VANGUARD ELIMINADO EM COMBATE!', onReward);
        return;
      }
    }

    if (isStationCapture) {
      this.vanguardFlagGroup.visible = true;
      this.blackthornFlagGroup.visible = true;

      // Animate waving banners and base rings
      const waveT = performance.now() * 0.005;
      this.vanguardFlagBanner.rotation.y = Math.sin(waveT) * 0.22;
      this.blackthornFlagBanner.rotation.y = Math.cos(waveT * 1.05) * 0.22;
      this.vanguardFlagRing.rotation.z = waveT * 0.35;
      this.blackthornFlagRing.rotation.z = -waveT * 0.35;

      // 1) Update Vanguard Flag (Blue — defended by Vanguard, stolen by Blackthorn)
      if (this.info.vanguardFlagStatus === 'CARRIED') {
        const carrierBot = enemyList.find((e) => e.callsign === this.info.vanguardFlagCarrier);
        if (!carrierBot || carrierBot.isDown) {
          // Carrier was killed! Flag drops on the exact spot where carrier died
          const killedBot = targets.find(
            (t) => (t as YardBotEntity).callsign === this.info.vanguardFlagCarrier
          ) as YardBotEntity | undefined;
          if (killedBot) {
            this.vanguardFlagWorldPos.set(
              killedBot.root.position.x,
              Math.max(0.05, killedBot.root.position.y),
              killedBot.root.position.z
            );
          }
          this.info.vanguardFlagStatus = 'DROPPED';
          this.info.vanguardFlagCarrier = null;
          soundEngine.playMechanicalSwitch(1.35);
          mobileHardware.vibrateHitConfirm(false);
          this.triggerCaptureAlert(
            '⚑ PORTADOR INIMIGO ABATIDO! PASSE POR CIMA DA SUA BANDEIRA PARA DEVOLVER À BASE!',
            'VANGUARD',
            5600
          );
        } else {
          // Follow enemy carrier
          this.vanguardFlagWorldPos.set(
            carrierBot.root.position.x,
            carrierBot.root.position.y + 0.35,
            carrierBot.root.position.z
          );
          const distToEnemyBase = Math.hypot(
            carrierBot.root.position.x - STATION_ARENA_BLACKTHORN_FLAG_BASE.x,
            carrierBot.root.position.z - STATION_ARENA_BLACKTHORN_FLAG_BASE.z
          );
          if (distToEnemyBase <= 3.1) {
            soundEngine.playMechanicalSwitch(0.85);
            mobileHardware.vibrateExplosion(0.9);
            this.finishCurrentRound(
              'BLACKTHORN',
              `O TIME INIMIGO (${carrierBot.callsign || 'BLACKTHORN'}) CAPTUROU E ENTREGOU A SUA BANDEIRA!`,
              onReward
            );
            return;
          }
        }
      } else if (this.info.vanguardFlagStatus === 'DROPPED') {
        // Check if Player or any living Vanguard ally walks over the dropped Vanguard flag to return it to base
        let recoveredBy: string | null = null;
        if (
          playerAlive &&
          Math.hypot(
            playerPos.x - this.vanguardFlagWorldPos.x,
            playerPos.z - this.vanguardFlagWorldPos.z
          ) <= 2.5
        ) {
          recoveredBy = 'VOCÊ';
        } else {
          for (let i = 0; i < allyList.length; i++) {
            const ally = allyList[i];
            if (
              Math.hypot(
                ally.root.position.x - this.vanguardFlagWorldPos.x,
                ally.root.position.z - this.vanguardFlagWorldPos.z
              ) <= 2.4
            ) {
              recoveredBy = ally.callsign || 'ALIADO';
              break;
            }
          }
        }

        if (recoveredBy) {
          this.vanguardFlagWorldPos.copy(STATION_ARENA_VANGUARD_FLAG_BASE);
          this.info.vanguardFlagStatus = 'AT_BASE';
          this.info.vanguardFlagCarrier = null;
          if (recoveredBy === 'VOCÊ' && this.info.squadStats?.[0]) {
            this.info.squadStats[0].score += 75;
          }
          soundEngine.playMechanicalSwitch(1.65);
          mobileHardware.vibrateHitConfirm(true);
          this.triggerCaptureAlert(
            `✓ BANDEIRA ALIADA RECUPERADA POR ${recoveredBy} E DEVOLVIDA À BASE!`,
            'VANGUARD',
            4800
          );
        } else {
          // Check if another living Blackthorn enemy picks up the dropped Vanguard flag
          for (let i = 0; i < enemyList.length; i++) {
            const enemy = enemyList[i];
            if (
              Math.hypot(
                enemy.root.position.x - this.vanguardFlagWorldPos.x,
                enemy.root.position.z - this.vanguardFlagWorldPos.z
              ) <= 2.35
            ) {
              this.info.vanguardFlagStatus = 'CARRIED';
              this.info.vanguardFlagCarrier = enemy.callsign || 'BLACKTHORN';
              soundEngine.playMechanicalSwitch(0.95);
              mobileHardware.vibrateHitConfirm(false);
              this.triggerCaptureAlert(
                `⚠ ALERTA: O TIME INIMIGO (${this.info.vanguardFlagCarrier}) CAPTUROU A SUA BANDEIRA!`,
                'BLACKTHORN',
                5600
              );
              break;
            }
          }
        }
      } else {
        // vanguardFlagStatus === 'AT_BASE': check if any living Blackthorn enemy steals it from Vanguard base
        this.vanguardFlagWorldPos.copy(STATION_ARENA_VANGUARD_FLAG_BASE);
        for (let i = 0; i < enemyList.length; i++) {
          const enemy = enemyList[i];
          if (
            Math.hypot(
              enemy.root.position.x - STATION_ARENA_VANGUARD_FLAG_BASE.x,
              enemy.root.position.z - STATION_ARENA_VANGUARD_FLAG_BASE.z
            ) <= 2.45
          ) {
            this.info.vanguardFlagStatus = 'CARRIED';
            this.info.vanguardFlagCarrier = enemy.callsign || 'BLACKTHORN';
            soundEngine.playMechanicalSwitch(0.9);
            mobileHardware.vibrateHitConfirm(false);
            this.triggerCaptureAlert(
              `⚠ ALERTA: O TIME INIMIGO CAPTUROU A BANDEIRA NA SUA BASE! ELIMINE ${this.info.vanguardFlagCarrier}!`,
              'BLACKTHORN',
              6000
            );
            break;
          }
        }
      }

      // 2) Update Blackthorn Flag (Red — defended by Blackthorn, captured by Player or Vanguard ally)
      if (this.info.blackthornFlagStatus === 'CARRIED') {
        const isPlayerCarrier = this.info.blackthornFlagCarrier === 'VOCÊ';
        const carrierAlly = !isPlayerCarrier
          ? allyList.find((a) => a.callsign === this.info.blackthornFlagCarrier)
          : null;

        if ((isPlayerCarrier && !playerAlive) || (!isPlayerCarrier && (!carrierAlly || carrierAlly.isDown))) {
          // Carrier died -> drop Blackthorn flag at carrier's death spot
          if (isPlayerCarrier) {
            this.blackthornFlagWorldPos.set(playerPos.x, Math.max(0.05, playerPos.y), playerPos.z);
          } else {
            const downedAlly = targets.find(
              (t) => (t as YardBotEntity).callsign === this.info.blackthornFlagCarrier
            ) as YardBotEntity | undefined;
            if (downedAlly) {
              this.blackthornFlagWorldPos.set(
                downedAlly.root.position.x,
                Math.max(0.05, downedAlly.root.position.y),
                downedAlly.root.position.z
              );
            }
          }
          this.info.blackthornFlagStatus = 'DROPPED';
          this.info.blackthornFlagCarrier = null;
          soundEngine.playMechanicalSwitch(1.1);
          this.triggerCaptureAlert(
            '⚠ A BANDEIRA INIMIGA FOI DROPADA NO CHÃO! RECUPERE-A ANTES DO INIMIGO!',
            'NEUTRAL',
            5000
          );
        } else {
          const cx = isPlayerCarrier ? playerPos.x : carrierAlly!.root.position.x;
          const cy = isPlayerCarrier ? playerPos.y : carrierAlly!.root.position.y;
          const cz = isPlayerCarrier ? playerPos.z : carrierAlly!.root.position.z;
          this.blackthornFlagWorldPos.set(cx, cy + 0.35, cz);

          const distToVanguardBase = Math.hypot(
            cx - STATION_ARENA_VANGUARD_FLAG_BASE.x,
            cz - STATION_ARENA_VANGUARD_FLAG_BASE.z
          );
          if (distToVanguardBase <= 3.2) {
            if (isPlayerCarrier && this.info.squadStats?.[0]) {
              this.info.squadStats[0].score += 200;
            }
            recordCombatTelemetryDelta({ bombsPlanted: 1 });
            soundEngine.playMechanicalSwitch(1.75);
            mobileHardware.vibrateHitConfirm(true);
            this.finishCurrentRound(
              'VANGUARD',
              `${this.info.blackthornFlagCarrier || 'VANGUARD'} CAPTUROU E ENTREGOU A BANDEIRA INIMIGA NA BASE!`,
              onReward
            );
            return;
          }
        }
      } else if (this.info.blackthornFlagStatus === 'DROPPED') {
        // Check if Player or Vanguard ally picks up the dropped enemy flag
        if (
          playerAlive &&
          Math.hypot(
            playerPos.x - this.blackthornFlagWorldPos.x,
            playerPos.z - this.blackthornFlagWorldPos.z
          ) <= 2.5
        ) {
          this.info.blackthornFlagStatus = 'CARRIED';
          this.info.blackthornFlagCarrier = 'VOCÊ';
          soundEngine.playMechanicalSwitch(1.55);
          mobileHardware.vibrateHitConfirm(true);
          this.triggerCaptureAlert(
            '★ VOCÊ PEGOU A BANDEIRA INIMIGA! LEVE-A PARA A SUA BASE VANGUARD!',
            'VANGUARD',
            5500
          );
        } else {
          let pickedByAlly = false;
          for (let i = 0; i < allyList.length; i++) {
            const ally = allyList[i];
            if (
              Math.hypot(
                ally.root.position.x - this.blackthornFlagWorldPos.x,
                ally.root.position.z - this.blackthornFlagWorldPos.z
              ) <= 2.35
            ) {
              this.info.blackthornFlagStatus = 'CARRIED';
              this.info.blackthornFlagCarrier = ally.callsign || 'ALIADO';
              pickedByAlly = true;
              soundEngine.playMechanicalSwitch(1.45);
              this.triggerCaptureAlert(
                `★ ${this.info.blackthornFlagCarrier} PEGOU A BANDEIRA INIMIGA! ESCOLTE-O ATÉ A BASE!`,
                'VANGUARD',
                5200
              );
              break;
            }
          }
          // Check if a Blackthorn enemy walks over their dropped flag to return it to Blackthorn base
          if (!pickedByAlly) {
            for (let i = 0; i < enemyList.length; i++) {
              const enemy = enemyList[i];
              if (
                Math.hypot(
                  enemy.root.position.x - this.blackthornFlagWorldPos.x,
                  enemy.root.position.z - this.blackthornFlagWorldPos.z
                ) <= 2.4
              ) {
                this.blackthornFlagWorldPos.copy(STATION_ARENA_BLACKTHORN_FLAG_BASE);
                this.info.blackthornFlagStatus = 'AT_BASE';
                this.info.blackthornFlagCarrier = null;
                soundEngine.playMechanicalSwitch(1.0);
                this.triggerCaptureAlert(
                  '⚠ O TIME INIMIGO RECUPEROU A BANDEIRA DELES DE VOLTA PARA A BASE BLACKTHORN!',
                  'BLACKTHORN',
                  4800
                );
                break;
              }
            }
          }
        }
      } else {
        // blackthornFlagStatus === 'AT_BASE': check if Player or Vanguard ally grabs it from Blackthorn base
        this.blackthornFlagWorldPos.copy(STATION_ARENA_BLACKTHORN_FLAG_BASE);
        if (
          playerAlive &&
          Math.hypot(
            playerPos.x - STATION_ARENA_BLACKTHORN_FLAG_BASE.x,
            playerPos.z - STATION_ARENA_BLACKTHORN_FLAG_BASE.z
          ) <= 2.55
        ) {
          this.info.blackthornFlagStatus = 'CARRIED';
          this.info.blackthornFlagCarrier = 'VOCÊ';
          if (this.info.squadStats?.[0]) {
            this.info.squadStats[0].score += 100;
          }
          soundEngine.playMechanicalSwitch(1.6);
          mobileHardware.vibrateHitConfirm(true);
          this.triggerCaptureAlert(
            '★ VOCÊ CAPTUROU A BANDEIRA INIMIGA! CORRA PARA A SUA BASE VANGUARD!',
            'VANGUARD',
            6000
          );
        } else {
          for (let i = 0; i < allyList.length; i++) {
            const ally = allyList[i];
            if (
              Math.hypot(
                ally.root.position.x - STATION_ARENA_BLACKTHORN_FLAG_BASE.x,
                ally.root.position.z - STATION_ARENA_BLACKTHORN_FLAG_BASE.z
              ) <= 2.45
            ) {
              this.info.blackthornFlagStatus = 'CARRIED';
              this.info.blackthornFlagCarrier = ally.callsign || 'ALIADO';
              soundEngine.playMechanicalSwitch(1.45);
              this.triggerCaptureAlert(
                `★ ${this.info.blackthornFlagCarrier} CAPTUROU A BANDEIRA INIMIGA! PROTEJA O PORTADOR!`,
                'VANGUARD',
                5600
              );
              break;
            }
          }
        }
      }

      // Update 3D flag positions & HUD coordinates
      this.vanguardFlagGroup.position.copy(this.vanguardFlagWorldPos);
      this.blackthornFlagGroup.position.copy(this.blackthornFlagWorldPos);
      // Hide 3D flag in first-person view when local player is carrying it so it doesn't block camera
      this.blackthornFlagGroup.visible = this.info.blackthornFlagCarrier !== 'VOCÊ';

      this.info.vanguardFlagPos = {
        x: this.vanguardFlagWorldPos.x,
        y: this.vanguardFlagWorldPos.y,
        z: this.vanguardFlagWorldPos.z,
      };
      this.info.blackthornFlagPos = {
        x: this.blackthornFlagWorldPos.x,
        y: this.blackthornFlagWorldPos.y,
        z: this.blackthornFlagWorldPos.z,
      };

      // Round timer countdown in Capture mode
      this.info.roundTimerSec = Math.max(0, this.info.roundTimerSec - dt);
      if (this.info.roundTimerSec <= 0) {
        const winner: 'VANGUARD' | 'BLACKTHORN' =
          allies >= enemies ? 'VANGUARD' : 'BLACKTHORN';
        this.finishCurrentRound(
          winner,
          winner === 'VANGUARD'
            ? 'TEMPO ESGOTADO — VANGUARD VENCE POR SUPERIORIDADE TÁTICA!'
            : 'TEMPO ESGOTADO — BLACKTHORN VENCE POR DEFESA DE BASE!',
          onReward
        );
        return;
      }
    } else {
      this.vanguardFlagGroup.visible = false;
      this.blackthornFlagGroup.visible = false;

      const distA = Math.hypot(playerPos.x - siteA.x, playerPos.z - siteA.z);
      const distB = Math.hypot(playerPos.x - siteB.x, playerPos.z - siteB.z);

      if (playerAlive && distA <= 4.2) {
        this.info.nearSite = 'A';
      } else if (playerAlive && distB <= 4.2) {
        this.info.nearSite = 'B';
      } else {
        this.info.nearSite = null;
        this.isPlantingHeld = false;
        this.lastKeypadDigitIdx = -1;
        if (this.info.bombStatus === 'PLANTING') {
          this.info.bombStatus = 'CARRIED';
          this.info.plantProgress = 0;
        } else if (this.info.bombStatus === 'PLANTED') {
          this.info.plantProgress = 0;
        }
      }

      const isOnlineDefender = this.isOnlineMatch && this.onlineLocalTeam === 'BLACKTHORN';

      if (
        playerAlive &&
        this.isPlantingHeld &&
        this.info.nearSite &&
        !isOnlineDefender &&
        (this.info.bombStatus === 'CARRIED' || this.info.bombStatus === 'PLANTING')
      ) {
        this.info.bombStatus = 'PLANTING';
        this.info.plantProgress = Math.min(1, this.info.plantProgress + dt / 2.4);
        const digitIdx = Math.min(7, Math.floor(this.info.plantProgress * 8));
        if (digitIdx !== this.lastKeypadDigitIdx) {
          this.lastKeypadDigitIdx = digitIdx;
          playC4KeypadDigitSound(digitIdx);
        }
        if (this.info.plantProgress >= 1) {
          this.isPlantingHeld = false;
          this.lastKeypadDigitIdx = -1;
          this.info.bombStatus = 'PLANTED';
          this.info.plantedSite = this.info.nearSite;
          this.info.c4TimerSec = 40;
          if (this.info.squadStats && this.info.squadStats[0]) {
            this.info.squadStats[0].score += 100;
          }
          recordCombatTelemetryDelta({ bombsPlanted: 1 });
          const sitePos = this.info.plantedSite === 'A' ? siteA : siteB;
          this.c4MeshGroup.position.set(sitePos.x, sitePos.y + 0.12, sitePos.z);
          this.c4MeshGroup.visible = true;
          void this.c4EnsureLoaded();
          soundEngine.playMechanicalSwitch(1.45);
          playRealBombPlantedVoice();
          mobileHardware.vibrateHitConfirm(true);
          if (this.isOnlineMatch && this.info.plantedSite) {
            this.onBombStateChangedCb?.('PLANTED', this.info.plantedSite);
          }
        }
      }

      // BLACKTHORN online defuse when standing near planted C4
      if (
        playerAlive &&
        isOnlineDefender &&
        this.isPlantingHeld &&
        this.info.bombStatus === 'PLANTED' &&
        this.info.nearSite &&
        this.info.nearSite === this.info.plantedSite
      ) {
        this.info.plantProgress = Math.min(1, this.info.plantProgress + dt / 3.2);
        const digitIdx = Math.min(7, Math.floor(this.info.plantProgress * 8));
        if (digitIdx !== this.lastKeypadDigitIdx) {
          this.lastKeypadDigitIdx = digitIdx;
          playC4KeypadDigitSound(digitIdx);
        }
        if (this.info.plantProgress >= 1) {
          const defusedSite = this.info.plantedSite || 'A';
          this.isPlantingHeld = false;
          this.lastKeypadDigitIdx = -1;
          this.info.plantProgress = 0;
          this.info.bombStatus = 'DEFUSED';
          this.c4MeshGroup.visible = false;
          soundEngine.playMechanicalSwitch(1.6);
          mobileHardware.vibrateHitConfirm(true);
          this.onBombStateChangedCb?.('DEFUSED', defusedSite);
          this.finishCurrentRound(
            'BLACKTHORN',
            `BOMBA C4 DESARMADA NO PONTO ${defusedSite}!`,
            onReward
          );
          return;
        }
      }

      if (this.info.bombStatus === 'PLANTED' && !this.c4MeshGroup.visible && this.info.plantedSite) {
        const sitePos = this.info.plantedSite === 'A' ? siteA : siteB;
        this.c4MeshGroup.position.set(sitePos.x, sitePos.y + 0.12, sitePos.z);
        this.c4MeshGroup.visible = true;
        void this.c4EnsureLoaded();
      }

      if (this.info.bombStatus === 'PLANTED') {
        this.info.c4TimerSec = Math.max(0, this.info.c4TimerSec - dt);
        const beepInterval = this.info.c4TimerSec < 5 ? 0.18 : this.info.c4TimerSec < 12 ? 0.35 : 0.75;
        this.beepAccum += dt;
        if (this.beepAccum >= beepInterval) {
          this.beepAccum = 0;
          this.c4LedMesh.visible = !this.c4LedMesh.visible;
          playRealC4Beep(this.c4MeshGroup.position, playerPos, this.info.c4TimerSec);
        }

        if (this.info.c4TimerSec <= 0) {
          const detSite = this.info.plantedSite || 'A';
          this.info.bombStatus = 'DETONATED';
          this.c4MeshGroup.visible = false;
          playC4DetonationExplosion(this.c4MeshGroup.position, playerPos);
          mobileHardware.vibrateExplosion(1.0);
          if (this.isOnlineMatch) {
            this.onBombStateChangedCb?.('DETONATED', detSite);
          }
          this.finishCurrentRound('VANGUARD', `BOMBA C4 DETONADA NO PONTO ${detSite}!`, onReward);
        }
      } else if (this.info.bombStatus === 'CARRIED' || this.info.bombStatus === 'PLANTING') {
        this.info.roundTimerSec = Math.max(0, this.info.roundTimerSec - dt);
        if (this.info.roundTimerSec <= 0) {
          this.finishCurrentRound('BLACKTHORN', 'TEMPO ESGOTADO — ALVOS A E B DEFENDIDOS PELA BLACKTHORN!', onReward);
        }
      }
    }

    if (!this.isOnlineMatch) {
      this.allyFireTimer += dt;
      const skirmishInterval = playerAlive ? 1.25 : 0.75;
      if (this.allyFireTimer >= skirmishInterval && allyList.length > 0 && enemyList.length > 0) {
        this.allyFireTimer = 0;
        const ally = allyList[Math.floor(Math.random() * allyList.length)];
        const enemy = enemyList[Math.floor(Math.random() * enemyList.length)];
        if (ally.root.position.distanceTo(enemy.root.position) < 46) {
          _allyOrigin.set(ally.root.position.x, ally.root.position.y + 1.45, ally.root.position.z);
          _enemyPos.set(
            enemy.root.position.x + (Math.random() - 0.5) * 0.5,
            enemy.root.position.y + 1.25,
            enemy.root.position.z + (Math.random() - 0.5) * 0.5
          );
          fxPool.spawnTracer(_allyOrigin, _enemyPos, 0x38bdf8);
          triggerBotFireAnimation(ally);
          playSpatialBotGunshot(_allyOrigin, playerPos, 0, ally.weaponId || 'M4_CARBINE', true);

          const hitProb = playerAlive ? 0.26 : 0.42;
          if (Math.random() < hitProb && !enemy.isDown) {
            enemy.health -= 55;
            enemy.hitTiltVelocity = -12.0;
            triggerBotHitAnimation(enemy);
            if (enemy.health <= 0) {
              const hs = Math.random() < 0.35;
              enemy.isDown = true;
              enemy.lastDeathWasHeadshot = hs;
              if (hs) enemy.hitTiltVelocity = -18.0;
              enemy.downTimer = 9999;
              onRegisterKill?.(ally.callsign || 'RECON-02', 'VANGUARD', enemy.callsign || 'KRAKEN-BT', 'BLACKTHORN', ally.weaponId || 'M4_CARBINE', hs);
            }
          } else if (Math.random() < (playerAlive ? 0.18 : 0.36) && !ally.isDown) {
            triggerBotFireAnimation(enemy);
            playSpatialBotGunshot(_enemyPos, playerPos, 0, enemy.weaponId || 'AK47_RIFLE', true);
            ally.health -= 55;
            ally.hitTiltVelocity = -12.0;
            triggerBotHitAnimation(ally);
            if (ally.health <= 0) {
              const hs = Math.random() < 0.25;
              ally.isDown = true;
              ally.lastDeathWasHeadshot = hs;
              if (hs) ally.hitTiltVelocity = -18.0;
              ally.downTimer = 9999;
              const now = performance.now() / 1000;
              ally.reviveUntilSec = now + 40;
              ally.reviveExpired = false;
              ally.root.visible = true;
              onRegisterKill?.(enemy.callsign || 'KRAKEN-BT', 'BLACKTHORN', ally.callsign || 'RECON-02', 'VANGUARD', enemy.weaponId || 'AK47_RIFLE', hs);
            }
          }
        }
      }
    }
  }
}
