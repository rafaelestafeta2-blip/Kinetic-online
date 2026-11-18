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

export function clearRoomCombatAuthority(roomId: string): void {
  poseByRoom.delete(roomId);
  ledgerByRoom.delete(roomId);
}
