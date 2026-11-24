import { DrillMode, WarfaceClassId, WeaponId } from '../types/game';

export type OnlineTeam = 'VANGUARD' | 'BLACKTHORN';
export type MatchQueueType = 'CASUAL' | 'RANKED';

export interface OnlinePlayerState {
  uid: string;
  callsign: string;
  team: OnlineTeam;
  rankLevel: number;
  mmr?: number;
  avatarDataUrl: string;
  weaponId: WeaponId;
  weaponSkinId?: string;
  classId?: WarfaceClassId;
  clanName?: string;
  clanTag?: string;
  clanEmblemId?: string;
  clanLevel?: number;
  callingCardId?: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  isDown: boolean;
  isCrouching: boolean;
  isFiring: boolean;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  loadProgress?: number;
  isLoaded?: boolean;
  isReady?: boolean;
  connectionState?: 'CONNECTED' | 'RECONNECTING';
  disconnectedAtMs?: number;
  lastShotAtMs: number;
  updatedAtMs: number;
}

export interface SquadChatMessage {
  id: string;
  senderUid: string;
  senderCallsign: string;
  senderClassId: WarfaceClassId;
  text: string;
  ts: number;
}

export interface OnlineHitEvent {
  eventId: string;
  attackerUid: string;
  attackerCallsign: string;
  attackerTeam: OnlineTeam;
  targetUid: string;
  targetCallsign: string;
  targetTeam: OnlineTeam;
  weaponId: WeaponId | 'GRENADE';
  damage: number;
  isHeadshot: boolean;
  lethal: boolean;
  ts: number;
}

export interface OnlineGrenadeEvent {
  eventId: string;
  senderUid: string;
  senderCallsign: string;
  senderTeam: OnlineTeam;
  grenadeType: 'FRAG' | 'SMOKE';
  origin: [number, number, number];
  velocity: [number, number, number];
  ts: number;
}

export interface OnlineScorestreakEvent {
  eventId: string;
  senderUid: string;
  senderCallsign: string;
  senderTeam: OnlineTeam;
  streak: 'UAV' | 'ADVANCED_UAV';
  durationSec: number;
  ts: number;
}

export interface OnlineRoundEvent {
  eventId: string;
  kind: 'ROUND_OVER' | 'NEXT_ROUND' | 'ROUND_END_BOMB_EXPLODED';
  roundNumber: number;
  winner?: OnlineTeam;
  reason?: string;
  vanguardScore?: number;
  blackthornScore?: number;
  blastPayload?: {
    plantedSite: 'A' | 'B';
    bombPos: [number, number, number];
    lethalRadiusMeters: number;
    victims: Array<{
      id: string;
      callsign: string;
      team: OnlineTeam;
      isLocalPlayer: boolean;
      distanceMeters: number;
      inBlastRadius: boolean;
      isBehindCover: boolean;
      lethal: boolean;
      damageApplied: number;
      impulseVel: [number, number, number];
      angularVel: [number, number, number];
    }>;
    ts: number;
  };
  ts: number;
}

export interface OnlineRoomState {
  roomId: string;
  hostUid: string;
  arenaMode: DrillMode;
  isPrivate: boolean;
  queueType?: MatchQueueType;
  randomMap?: boolean;
  includeBots?: boolean;
  averageMmr?: number;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  isSearchingMatch?: boolean;
  searchStartedAtMs?: number | null;
  currentRound: number;
  vanguardScore: number;
  blackthornScore: number;
  bombStatus: 'CARRIED' | 'PLANTED' | 'DEFUSED' | 'DETONATED';
  plantedSite: 'NONE' | 'A' | 'B';
  players: Record<string, OnlinePlayerState>;
  lastHitEvent?: OnlineHitEvent | null;
  lastRoundEvent?: OnlineRoundEvent | null;
  updatedAtMs: number;
  createdAt: string;
}

export function getTeamSpawnForArena(
  mode: DrillMode,
  team: OnlineTeam,
  slotIndex = 0
): { x: number; y: number; z: number; yaw: number } {
  const offsetX = ((slotIndex % 5) - 2) * 1.15;
  const offsetZ = (slotIndex % 2) * 1.1;

  if (mode === 'DUST2_BOMB_5V5') {
    if (team === 'VANGUARD') {
      // TR Spawn (South) at y = 8.0m facing East (-PI/2)
      return { x: -16.25 + offsetX, y: 8.0, z: 18.75 + offsetZ, yaw: -Math.PI / 2 };
    }
    // CT Spawn (North Underpass) at y = 1.6m facing South (0)
    return { x: -6.25 + offsetX, y: 1.6, z: -56.25 + offsetZ, yaw: 0 };
  }

  if (mode === 'ASSAULT_BOMB_5V5') {
    if (team === 'VANGUARD') {
      // Attacker Street Spawn at y = 0.5m facing North (0)
      return { x: -26.7 + offsetX, y: 0.5, z: 36.7 + offsetZ, yaw: 0 };
    }
    // Defender Warehouse Interior Spawn at y = 0.5m facing South (PI)
    return { x: -2.3 + offsetX, y: 0.5, z: 6.9 - offsetZ, yaw: Math.PI };
  }

  // MUST match level-builder authored spawns (INDUSTRIA_* / HANGAR_* / …).
  // Stale far-field coords put feet outside the GLB AABB → FrontSide white void.
  if (mode === 'INDUSTRIA_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: 8.0 + offsetX, y: 2.28, z: -28.0 + offsetZ, yaw: 0 };
    }
    return { x: -5.0 + offsetX, y: 2.0, z: 40.0 - offsetZ, yaw: Math.PI };
  }

  if (mode === 'HANGAR_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: -32.0 + offsetX * 0.7, y: 0.6, z: 4.5 + offsetZ * 0.8, yaw: -Math.PI / 2 };
    }
    return { x: 30.5 + offsetX * 0.7, y: 0.6, z: -1.5 - offsetZ * 0.8, yaw: Math.PI / 2 };
  }

  if (mode === 'EASTERN_CITY_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: 0.0 + offsetX, y: 3.25, z: -20.0 + offsetZ, yaw: 0 };
    }
    return { x: -6.0 + offsetX, y: 7.46, z: 36.0 - offsetZ, yaw: Math.PI };
  }

  if (mode === 'MIRAGE_ANUBIS_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: -33.0 + offsetX, y: 5.16, z: -40.0 + offsetZ, yaw: 0 };
    }
    return { x: -20.0 + offsetX, y: 7.59, z: 0.0 - offsetZ, yaw: Math.PI };
  }

  if (mode === 'CSGO_ASSAULT_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: -22.79 + offsetX, y: -0.41, z: -33.44 + offsetZ, yaw: Math.PI };
    }
    return { x: 22.11 + offsetX, y: 6.30, z: 25.64 - offsetZ, yaw: 0 };
  }

  if (mode === 'DE_DST_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: -19.93 + offsetX, y: 0.0, z: -64.31 + offsetZ, yaw: Math.PI };
    }
    return { x: -11.34 + offsetX, y: 1.42, z: 62.84 - offsetZ, yaw: 0 };
  }

  if (mode === 'MP_NUKED_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: -43.23 + offsetX, y: -0.13, z: -13.92 + offsetZ, yaw: -Math.PI / 2 };
    }
    return { x: 42.10 + offsetX, y: -0.13, z: 3.68 - offsetZ, yaw: Math.PI / 2 };
  }

  if (mode === 'DE_SUPPLY_BOMB_5V5') {
    if (team === 'VANGUARD') {
      return { x: -34.95 + offsetX, y: 4.27, z: -43.08 + offsetZ, yaw: Math.PI };
    }
    return { x: -26.82 + offsetX, y: 0.13, z: 32.11 - offsetZ, yaw: 0 };
  }

  if (mode === 'STATION_CAPTURE_5V5' || mode === 'STATION_TDM_5V5') {
    if (team === 'VANGUARD') {
      return { x: -14.0 + offsetX, y: 0.15, z: -18.0 + offsetZ, yaw: Math.PI };
    }
    return { x: 14.0 + offsetX, y: 0.15, z: 18.0 - offsetZ, yaw: 0 };
  }

  // YARD_BOMB_5V5 default
  if (team === 'VANGUARD') {
    return { x: 0 + offsetX, y: 0, z: 34.5 + offsetZ, yaw: 0 };
  }
  return { x: 0 + offsetX, y: 0, z: -25.5 - offsetZ, yaw: Math.PI };
}

