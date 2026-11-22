import { createHmac } from 'node:crypto';
import { getWeaponBallistics } from '../data/weaponBallistics';
import { WeaponId } from '../types/game';

/**
 * Authoritative server-side combat validator for WebSocket combat relay.
 * Enforces per-weapon ballistic damage/range caps, lag-compensated pose proximity,
 * duplicate/rate-limit protection, horizontal speed anomaly tracking, and signed
 * match reward integrity receipts.
 */

export interface ServerPoseSample {
  uid: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  ts: number;
}

export interface IncomingHitLike {
  eventId?: string;
  attackerUid?: string;
  targetUid?: string;
  damage?: number;
  isHeadshot?: boolean;
  lethal?: boolean;
  ts?: number;
  weaponId?: string;
}

export interface RoomCombatLedgerEntry {
  kills: number;
  headshots: number;
  damageDealt: number;
  hitsLanded: number;
  speedAnomalies: number;
}

const VALID_WEAPON_IDS = new Set<WeaponId>([
  'P50_PISTOL',
  'M1911_PISTOL',
  'SMG_45',
  'SMG_MP5',
  'SHOTGUN_12',
  'SHOTGUN_SPAS',
  'M4_CARBINE',
  'CARBINE_AR',
  'S_MILITARY',
  'AK47_RIFLE',
  'AK12_RIFLE',
  'L49_LMG',
  'SNIPER_BOLT',
  'SNIPER_TACTICAL',
  'SNIPER_AWP',
  'SNIPER_HEAVY',
  'RPG7_LAUNCHER',
  'KNIFE_TACTICAL',
]);

const MIN_HIT_INTERVAL_MS = 18;
const POSE_HISTORY = 32;
const MAX_LAG_COMP_SKEW_MS = 1200;
const MAX_HUMAN_SPEED_MPS = 26;

const INTEGRITY_SECRET =
  process.env.MATCH_INTEGRITY_SECRET ||
  'kinetic-tactical-server-authority-secret-v1';

const poseByRoom = new Map<string, Map<string, ServerPoseSample[]>>();
const lastHitByAttackerTarget = new Map<string, number>();
const seenEventIds = new Set<string>();
const ledgerByRoom = new Map<string, Map<string, RoomCombatLedgerEntry>>();

function getOrCreateLedgerEntry(
  roomId: string,
  uid: string
): RoomCombatLedgerEntry {
  let roomLedger = ledgerByRoom.get(roomId);
  if (!roomLedger) {
    roomLedger = new Map();
    ledgerByRoom.set(roomId, roomLedger);
  }
  let entry = roomLedger.get(uid);
  if (!entry) {
    entry = {
      kills: 0,
      headshots: 0,
      damageDealt: 0,
      hitsLanded: 0,
      speedAnomalies: 0,
    };
    roomLedger.set(uid, entry);
  }
  return entry;
}

function findClosestPose(
  ring: ServerPoseSample[] | undefined,
  targetTs: number
): ServerPoseSample | null {
  if (!ring || ring.length === 0) return null;
  let best = ring[ring.length - 1];
  let bestDiff = Math.abs(best.ts - targetTs);
  for (let i = ring.length - 2; i >= 0; i--) {
    const diff = Math.abs(ring[i].ts - targetTs);
    if (diff < bestDiff) {
      best = ring[i];
      bestDiff = diff;
    }
  }
  return best;
}

export function recordServerPlayerPose(
  roomId: string,
  uid: string,
  x: number,
  y: number,
  z: number,
  yaw: number,
  ts = Date.now()
): void {
  if (!roomId || !uid) return;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

  let room = poseByRoom.get(roomId);
  if (!room) {
    room = new Map();
    poseByRoom.set(roomId, room);
  }
  let ring = room.get(uid);
  if (!ring) {
    ring = [];
    room.set(uid, ring);
  }

  const prev = ring.length > 0 ? ring[ring.length - 1] : null;
  if (prev) {
    const dtSec = (ts - prev.ts) / 1000;
    if (dtSec >= 0.025 && dtSec <= 0.85) {
      const horizDist = Math.hypot(x - prev.x, z - prev.z);
      // Ignore round-reset spawn teleports (> 24m single tick)
      if (horizDist < 24 && horizDist / dtSec > MAX_HUMAN_SPEED_MPS) {
        getOrCreateLedgerEntry(roomId, uid).speedAnomalies += 1;
      }
    }
  }

  ring.push({ uid, x, y, z, yaw, ts });
  if (ring.length > POSE_HISTORY) ring.shift();
}

export function validateCombatHit(
  roomId: string,
  senderUid: string | null,
  hit: IncomingHitLike
): { ok: boolean; reason?: string; sanitized?: IncomingHitLike } {
  if (!hit || !hit.eventId || !hit.attackerUid || !hit.targetUid) {
    return { ok: false, reason: 'malformed' };
  }
  if (senderUid && hit.attackerUid !== senderUid) {
    return { ok: false, reason: 'attacker_mismatch' };
  }
  if (hit.attackerUid === hit.targetUid) {
    return { ok: false, reason: 'self_hit' };
  }
  if (seenEventIds.has(hit.eventId)) {
    return { ok: false, reason: 'duplicate' };
  }

  const now = Date.now();
  const pairKey = `${hit.attackerUid}:${hit.targetUid}`;
  const last = lastHitByAttackerTarget.get(pairKey) || 0;
  if (now - last < MIN_HIT_INTERVAL_MS) {
    return { ok: false, reason: 'rate_limit' };
  }

  const rawWeapon = String(hit.weaponId || 'M4_CARBINE');
  const isGrenade = rawWeapon === 'GRENADE';
  if (!isGrenade && !VALID_WEAPON_IDS.has(rawWeapon as WeaponId)) {
    return { ok: false, reason: 'unknown_weapon' };
  }

  let damage = Number(hit.damage);
  if (!Number.isFinite(damage) || damage <= 0) {
    return { ok: false, reason: 'bad_damage' };
  }

  const isHeadshot = Boolean(hit.isHeadshot) && !isGrenade;
  let maxAllowedDamage = 195;
  let maxAllowedRange = 45;

  if (!isGrenade) {
    const spec = getWeaponBallistics(rawWeapon as WeaponId);
    const singleHitCap = spec.baseDamage * (isHeadshot ? spec.headMult : 1);
    const burstPelletCap = spec.baseDamage * Math.max(1, spec.pelletCount);
    maxAllowedDamage = Math.max(
      10,
      Math.round(Math.max(singleHitCap, burstPelletCap) * 1.15)
    );
    maxAllowedRange = spec.maxRange + 10;
  }

  damage = Math.min(maxAllowedDamage, Math.max(1, Math.round(damage)));

  // Lag-compensated 3D distance check against pose history near hit timestamp
  const hitTs =
    typeof hit.ts === 'number' && Math.abs(now - hit.ts) <= MAX_LAG_COMP_SKEW_MS
      ? hit.ts
      : now;
  const room = poseByRoom.get(roomId);
  const atkSample = findClosestPose(room?.get(hit.attackerUid), hitTs);
  const vicSample = findClosestPose(room?.get(hit.targetUid), hitTs);
  if (atkSample && vicSample) {
    const dist = Math.hypot(
      atkSample.x - vicSample.x,
      atkSample.y - vicSample.y,
      atkSample.z - vicSample.z
    );
    if (dist > maxAllowedRange) {
      return { ok: false, reason: 'range' };
    }
  }

  seenEventIds.add(hit.eventId);
  if (seenEventIds.size > 1000) {
    const first = seenEventIds.values().next().value;
    if (first) seenEventIds.delete(first);
  }
  lastHitByAttackerTarget.set(pairKey, now);

  const ledger = getOrCreateLedgerEntry(roomId, hit.attackerUid);
  ledger.hitsLanded += 1;
  ledger.damageDealt += damage;
  if (hit.lethal) {
    ledger.kills += 1;
    if (isHeadshot) ledger.headshots += 1;
  }

  return {
    ok: true,
    sanitized: {
      ...hit,
      weaponId: rawWeapon,
      damage,
      isHeadshot,
      ts: hitTs,
    },
  };
}

export function getRoomPlayerCombatStats(
  roomId: string,
  uid: string
): RoomCombatLedgerEntry | null {
  return ledgerByRoom.get(roomId)?.get(uid) || null;
}

export function issueMatchRewardReceipt(params: {
  roomId: string;
  uid: string;
  claimedXp: number;
  claimedCash: number;
}): {
  verified: boolean;
  allowedXp: number;
  allowedCash: number;
  serverKills: number;
  signature: string;
} {
  const stats = getRoomPlayerCombatStats(params.roomId, params.uid);
  const serverKills = stats?.kills ?? 0;
  const serverHits = stats?.hitsLanded ?? 0;
  // Cap rewards to plausible online match ceilings scaled by authoritative combat participation
  const maxPlausibleXp = Math.min(4500, 450 + serverKills * 220 + serverHits * 35);
  const maxPlausibleCash = Math.min(3500, 350 + serverKills * 160 + serverHits * 25);

  const allowedXp = Math.max(0, Math.min(Math.round(params.claimedXp || 0), maxPlausibleXp));
  const allowedCash = Math.max(0, Math.min(Math.round(params.claimedCash || 0), maxPlausibleCash));
  const anomalyPenalty = (stats?.speedAnomalies || 0) > 8;

  const finalXp = anomalyPenalty ? 0 : allowedXp;
  const finalCash = anomalyPenalty ? 0 : allowedCash;

  const payload = `${params.roomId}|${params.uid}|${finalXp}|${finalCash}|${serverKills}`;
  const signature = createHmac('sha256', INTEGRITY_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 32);

  return {
    verified: !anomalyPenalty,
    allowedXp: finalXp,
    allowedCash: finalCash,
    serverKills,
    signature,
  };
}

export const SERVER_GRENADE_LETHAL_RADIUS_M = 5.0;
export const SERVER_GRENADE_CONCUSSION_RADIUS_M = 11.0;
export const SERVER_GRENADE_SHELLSHOCK_DURATION_SEC = 4.0;
export const SERVER_GRENADE_CONCUSSION_MAX_DAMAGE = 75;
export const SERVER_GRENADE_CONCUSSION_MIN_DAMAGE = 20;

export interface ServerGrenadeVictimVerdict {
  uid: string;
  callsign: string;
  team: 'VANGUARD' | 'BLACKTHORN';
  distanceMeters: number;
  zone: 'LETHAL_R1' | 'CONCUSSION_R2' | 'OUTSIDE';
  isBehindCover: boolean;
  lethal: boolean;
  damageApplied: number;
  isShellshocked: boolean;
  shellshockDurationSec: number;
  shellshockIntensity: number;
  impulseVel: [number, number, number];
}

export interface ServerGrenadeDetonatedEvent {
  eventId: string;
  roomId: string;
  attackerUid: string;
  attackerCallsign: string;
  attackerTeam: 'VANGUARD' | 'BLACKTHORN';
  grenadePos: [number, number, number];
  lethalRadius: number;
  concussionRadius: number;
  victims: ServerGrenadeVictimVerdict[];
  ts: number;
}

export interface RoomMemberSnapshotLike {
  uid?: string;
  callsign?: string;
  team?: 'VANGUARD' | 'BLACKTHORN' | string;
  x?: number;
  y?: number;
  z?: number;
  health?: number;
  isDown?: boolean;
}

/**
 * Avalia de forma autoritativa no servidor a detonação de uma granada FRAG com Dois Raios:
 * - Raio 1 (0m a 5.0m exposto): Dano fatal (100% / eliminação imediata) + vetor de arremesso forte.
 * - Raio 2 (5.0m a 11.0m ou cobertura parcial): Dano escalonado linearmente (75 em 5.0m até 20 em 11.0m)
 *   + flag `isShellshocked = true` por 4.0 segundos + recuo na câmera.
 * - Fora do Raio (> 11.0m): Zero impacto.
 */
export function evaluateServerGrenadeDetonation(params: {
  roomId: string;
  senderUid: string | null;
  eventId?: string;
  attackerUid?: string;
  attackerCallsign?: string;
  attackerTeam?: string;
  grenadePos?: [number, number, number] | number[];
  occludedTargetUids?: string[];
  members: Iterable<[string, RoomMemberSnapshotLike]>;
  ts?: number;
}): {
  ok: boolean;
  reason?: string;
  detonation?: ServerGrenadeDetonatedEvent;
} {
  const { roomId, senderUid } = params;
  const attackerUid = String(params.attackerUid || senderUid || '');
  if (!roomId || !attackerUid) {
    return { ok: false, reason: 'missing_attacker' };
  }
  if (senderUid && attackerUid !== senderUid) {
    return { ok: false, reason: 'attacker_mismatch' };
  }

  const rawPos = params.grenadePos;
  if (!Array.isArray(rawPos) || rawPos.length < 3) {
    return { ok: false, reason: 'invalid_grenade_pos' };
  }
  const gx = Number(rawPos[0]);
  const gy = Number(rawPos[1]);
  const gz = Number(rawPos[2]);
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) {
    return { ok: false, reason: 'nan_grenade_pos' };
  }

  const now = Date.now();
  const eventId = String(
    params.eventId || `gdet_${attackerUid}_${now}`
  ).slice(0, 72);
  if (seenEventIds.has(eventId)) {
    return { ok: false, reason: 'duplicate' };
  }

  const detTs =
    typeof params.ts === 'number' && Math.abs(now - params.ts) <= MAX_LAG_COMP_SKEW_MS
      ? params.ts
      : now;

  // Valida distância plausível entre o lançador e o ponto de detonação (<= 52m)
  const roomPoses = poseByRoom.get(roomId);
  const atkPose = findClosestPose(roomPoses?.get(attackerUid), detTs);
  if (atkPose) {
    const throwDist = Math.hypot(
      atkPose.x - gx,
      atkPose.y - gy,
      atkPose.z - gz
    );
    if (throwDist > 52) {
      return { ok: false, reason: 'grenade_out_of_range' };
    }
  }

  seenEventIds.add(eventId);
  if (seenEventIds.size > 1000) {
    const first = seenEventIds.values().next().value;
    if (first) seenEventIds.delete(first);
  }

  const occludedSet = new Set<string>(
    Array.isArray(params.occludedTargetUids)
      ? params.occludedTargetUids.map((u) => String(u))
      : []
  );

  const attackerTeam: 'VANGUARD' | 'BLACKTHORN' =
    params.attackerTeam === 'BLACKTHORN' ? 'BLACKTHORN' : 'VANGUARD';
  const attackerCallsign = String(params.attackerCallsign || 'OPERADOR').slice(
    0,
    24
  );

  const victims: ServerGrenadeVictimVerdict[] = [];
  const ledger = getOrCreateLedgerEntry(roomId, attackerUid);

  for (const [memberUid, member] of params.members) {
    if (!memberUid || member.isDown || (typeof member.health === 'number' && member.health <= 0)) {
      continue;
    }

    const memberTeam: 'VANGUARD' | 'BLACKTHORN' =
      member.team === 'BLACKTHORN' ? 'BLACKTHORN' : 'VANGUARD';
    // Fogo amigo desativado para aliados (exceto o próprio lançador caso se exploda perto da granada)
    if (memberUid !== attackerUid && memberTeam === attackerTeam) {
      continue;
    }

    const poseSample = findClosestPose(roomPoses?.get(memberUid), detTs);
    const px = poseSample ? poseSample.x : Number(member.x ?? 0);
    const py = poseSample ? poseSample.y : Number(member.y ?? 0);
    const pz = poseSample ? poseSample.z : Number(member.z ?? 0);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      continue;
    }

    const dx = px - gx;
    const dy = py + 0.9 - (gy + 0.15);
    const dz = pz - gz;
    const dist = Math.hypot(dx, dy, dz);

    // Fora do Raio 2 (> 11.0m): Zero impacto
    if (dist > SERVER_GRENADE_CONCUSSION_RADIUS_M) {
      continue;
    }

    const isBehindCover = occludedSet.has(memberUid);
    const horizLen = Math.hypot(dx, dz);
    const dirX = horizLen > 0.001 ? dx / horizLen : 0;
    const dirZ = horizLen > 0.001 ? dz / horizLen : 1;

    // RAIO 1 — Zona Fatal (0m a 5.0m exposto)
    if (dist <= SERVER_GRENADE_LETHAL_RADIUS_M && !isBehindCover) {
      const prox = Math.max(
        0,
        Math.min(1, 1 - dist / SERVER_GRENADE_LETHAL_RADIUS_M)
      );
      const launchHorizSpeed = 8.4 + prox * 4.4;
      const launchUpwardVy = 3.9 + prox * 1.9;
      const damageApplied = 195;

      victims.push({
        uid: memberUid,
        callsign: String(member.callsign || 'OPERADOR').slice(0, 24),
        team: memberTeam,
        distanceMeters: Number(dist.toFixed(2)),
        zone: 'LETHAL_R1',
        isBehindCover: false,
        lethal: true,
        damageApplied,
        isShellshocked: false,
        shellshockDurationSec: 0,
        shellshockIntensity: 1.0,
        impulseVel: [
          Number((dirX * launchHorizSpeed).toFixed(2)),
          Number(launchUpwardVy.toFixed(2)),
          Number((dirZ * launchHorizSpeed).toFixed(2)),
        ],
      });

      if (memberUid !== attackerUid) {
        ledger.hitsLanded += 1;
        ledger.damageDealt += 100;
        ledger.kills += 1;
      }
      continue;
    }

    // RAIO 2 — Zona de Concussão / Shellshock (5.0m a 11.0m ou cobertura parcial)
    const span =
      SERVER_GRENADE_CONCUSSION_RADIUS_M - SERVER_GRENADE_LETHAL_RADIUS_M; // 6.0m
    const distFromLethal = Math.max(0, dist - SERVER_GRENADE_LETHAL_RADIUS_M);
    const linearT = Math.max(0, Math.min(1, distFromLethal / span));

    let rawDamage = Math.round(
      SERVER_GRENADE_CONCUSSION_MAX_DAMAGE -
        linearT *
          (SERVER_GRENADE_CONCUSSION_MAX_DAMAGE -
            SERVER_GRENADE_CONCUSSION_MIN_DAMAGE)
    );
    if (isBehindCover) {
      rawDamage = Math.max(
        SERVER_GRENADE_CONCUSSION_MIN_DAMAGE,
        Math.round(rawDamage * 0.72)
      );
    }

    // No Raio 2 o jogador sobrevive com concussão (a menos que já estivesse com HP crítico e sem cobertura)
    const currentHp =
      typeof member.health === 'number' && member.health > 0
        ? member.health
        : 100;
    const damageApplied = Math.min(Math.max(1, currentHp - 1), rawDamage);
    const peakIntensity = Number((1.0 - linearT * 0.62).toFixed(3));
    const pushHorizSpeed = 3.6 - linearT * 2.25;
    const pushUpwardVy = 1.15 - linearT * 0.8;

    victims.push({
      uid: memberUid,
      callsign: String(member.callsign || 'OPERADOR').slice(0, 24),
      team: memberTeam,
      distanceMeters: Number(dist.toFixed(2)),
      zone: 'CONCUSSION_R2',
      isBehindCover,
      lethal: false,
      damageApplied,
      isShellshocked: true,
      shellshockDurationSec: SERVER_GRENADE_SHELLSHOCK_DURATION_SEC,
      shellshockIntensity: peakIntensity,
      impulseVel: [
        Number((dirX * pushHorizSpeed).toFixed(2)),
        Number(pushUpwardVy.toFixed(2)),
        Number((dirZ * pushHorizSpeed).toFixed(2)),
      ],
    });

    if (memberUid !== attackerUid) {
      ledger.hitsLanded += 1;
      ledger.damageDealt += damageApplied;
    }
  }

  return {
    ok: true,
    detonation: {
      eventId,
      roomId,
      attackerUid,
      attackerCallsign,
      attackerTeam,
      grenadePos: [
        Number(gx.toFixed(2)),
        Number(gy.toFixed(2)),
        Number(gz.toFixed(2)),
      ],
      lethalRadius: SERVER_GRENADE_LETHAL_RADIUS_M,
      concussionRadius: SERVER_GRENADE_CONCUSSION_RADIUS_M,
      victims,
      ts: detTs,
    },
  };
}

export function clearRoomCombatAuthority(roomId: string): void {
  poseByRoom.delete(roomId);
  ledgerByRoom.delete(roomId);
}
