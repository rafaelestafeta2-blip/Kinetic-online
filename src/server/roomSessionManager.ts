import { WebSocket } from 'ws';
import {
  QueuedPlayerEntry,
  ServerQueueType,
  tryFindBalancedMatch,
} from './matchmakingEngine';

export const RECONNECT_GRACE_MS = 45_000;

export interface WsClientMeta {
  ws: WebSocket;
  roomId: string | null;
  uid: string | null;
  callsign: string;
  queueType: ServerQueueType;
  arenaMode: string;
  preferExactMap?: boolean;
  mmr: number;
  enqueuedAtMs: number;
  lastSeenAtMs: number;
}

export interface ServerSquadChatMessage {
  id: string;
  senderUid: string;
  senderCallsign: string;
  senderClassId: string;
  text: string;
  ts: number;
}

export interface ServerRoomMeta {
  roomId: string;
  hostUid: string | null;
  queueType: ServerQueueType;
  arenaMode: string;
  isPrivate: boolean;
  randomMap?: boolean;
  includeBots?: boolean;
  createdAtMs: number;
  averageMmr: number;
  serverConfirmedStart: boolean;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  isSearchingMatch: boolean;
  searchStartedAtMs: number | null;
  currentRound: number;
  vanguardScore: number;
  blackthornScore: number;
  bombStatus: 'CARRIED' | 'PLANTED' | 'DEFUSED' | 'DETONATED';
  plantedSite: 'NONE' | 'A' | 'B';
  readyByUid: Map<string, boolean>;
  chatHistory: ServerSquadChatMessage[];
  memberMmrs: Map<string, number>;
  memberPlayers: Map<string, Record<string, unknown>>;
  disconnectGraceTimers: Map<string, ReturnType<typeof setTimeout>>;
}

export const roomsMap = new Map<string, Set<WsClientMeta>>();
export const roomMetaMap = new Map<string, ServerRoomMeta>();
export const matchmakingQueue = new Map<string, WsClientMeta>();

export function recalculateRoomAverageMmr(meta: ServerRoomMeta): number {
  if (meta.memberMmrs.size === 0) return meta.averageMmr || 1000;
  let total = 0;
  meta.memberMmrs.forEach((mmr) => {
    total += mmr;
  });
  meta.averageMmr = Math.round(total / meta.memberMmrs.size);
  return meta.averageMmr;
}

export function broadcastToRoom(
  roomId: string,
  payload: Record<string, unknown>,
  excludeUid?: string | null
): void {
  const members = roomsMap.get(roomId);
  if (!members) return;
  const serialized = JSON.stringify(payload);
  members.forEach((client) => {
    if (excludeUid && client.uid === excludeUid) return;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(serialized);
    }
  });
}

export function removeClientFromQueue(client: WsClientMeta): void {
  if (client.uid) {
    matchmakingQueue.delete(client.uid);
  }
}

export function cancelPlayerDisconnectGraceTimer(meta: ServerRoomMeta, uid: string): boolean {
  const timer = meta.disconnectGraceTimers.get(uid);
  if (timer) {
    clearTimeout(timer);
    meta.disconnectGraceTimers.delete(uid);
    return true;
  }
  return false;
}

function clearAllDisconnectGraceTimers(meta?: ServerRoomMeta): void {
  if (!meta) return;
  meta.disconnectGraceTimers.forEach((timer) => clearTimeout(timer));
  meta.disconnectGraceTimers.clear();
}

function finalizeMemberRemovalFromRoom(roomId: string, uid: string): void {
  const set = roomsMap.get(roomId);
  const meta = roomMetaMap.get(roomId);
  if (!meta) return;

  cancelPlayerDisconnectGraceTimer(meta, uid);
  meta.memberMmrs.delete(uid);
  meta.memberPlayers.delete(uid);
  meta.readyByUid.delete(uid);
  recalculateRoomAverageMmr(meta);
  if (meta.memberMmrs.size < 10) {
    meta.serverConfirmedStart = false;
  }
  if (meta.hostUid === uid) {
    let nextHost: string | null = null;
    if (set) {
      for (const c of set) {
        if (c.uid && c.uid !== uid) {
          nextHost = c.uid;
          break;
        }
      }
    }
    if (!nextHost) {
      nextHost = meta.memberPlayers.keys().next().value ?? null;
    }
    meta.hostUid = nextHost;
  }

  const activeSocketsCount = set ? set.size : 0;
  if (activeSocketsCount === 0 && meta.disconnectGraceTimers.size === 0) {
    clearAllDisconnectGraceTimers(meta);
    roomsMap.delete(roomId);
    roomMetaMap.delete(roomId);
  } else {
    broadcastToRoom(
      roomId,
      {
        type: 'PLAYER_LEFT',
        roomId,
        uid,
        hostUid: meta.hostUid ?? null,
        averageMmr: meta.averageMmr ?? 1000,
        ts: Date.now(),
      },
      uid
    );
  }
}

export function removeClientFromRoom(
  client: WsClientMeta,
  options?: { immediate?: boolean }
): void {
  if (!client.roomId) return;
  const roomId = client.roomId;
  const uid = client.uid;
  const set = roomsMap.get(roomId);
  const meta = roomMetaMap.get(roomId);

  if (set) {
    set.delete(client);
  }
  client.roomId = null;

  if (!meta || !uid) {
    if (set && set.size === 0) {
      clearAllDisconnectGraceTimers(meta);
      roomsMap.delete(roomId);
      roomMetaMap.delete(roomId);
    }
    return;
  }

  // Check if the same UID already re-opened another active socket in this room
  if (set) {
    for (const other of set) {
      if (other.uid === uid && other !== client && other.ws.readyState === WebSocket.OPEN) {
        return;
      }
    }
  }

  // If the squad was searching for a match in WAITING state and a member dropped, cancel search so partial squad isn't matched
  if (meta.status === 'WAITING' && meta.isSearchingMatch) {
    meta.isSearchingMatch = false;
    meta.searchStartedAtMs = null;
    if (set) {
      set.forEach((c) => removeClientFromQueue(c));
    }
    broadcastToRoom(roomId, {
      type: 'SQUAD_QUEUE_STATE',
      roomId,
      isSearchingMatch: false,
      searchStartedAtMs: null,
      arenaMode: meta.arenaMode,
      queueType: meta.queueType,
      randomMap: Boolean(meta.randomMap),
      ts: Date.now(),
    });
  }

  // Reconnection Grace Window (45s) when a player's connection drops unexpectedly during an active match
  if (meta.status === 'PLAYING' && !options?.immediate) {
    cancelPlayerDisconnectGraceTimer(meta, uid);
    const nowMs = Date.now();
    const existingMember = meta.memberPlayers.get(uid);
    if (existingMember) {
      meta.memberPlayers.set(uid, {
        ...existingMember,
        connectionState: 'RECONNECTING',
        disconnectedAtMs: nowMs,
      });
    }

    // If the disconnected player was host, migrate host immediately to an online peer so round events continue
    if (meta.hostUid === uid && set && set.size > 0) {
      for (const c of set) {
        if (c.uid && c.uid !== uid) {
          meta.hostUid = c.uid;
          break;
        }
      }
    }

    broadcastToRoom(
      roomId,
      {
        type: 'PLAYER_CONNECTION_STATE',
        roomId,
        uid,
        hostUid: meta.hostUid,
        connectionState: 'RECONNECTING',
        graceEndsAtMs: nowMs + RECONNECT_GRACE_MS,
        ts: nowMs,
      },
      uid
    );

    const timer = setTimeout(() => {
      meta.disconnectGraceTimers.delete(uid);
      finalizeMemberRemovalFromRoom(roomId, uid);
    }, RECONNECT_GRACE_MS);
    meta.disconnectGraceTimers.set(uid, timer);
    return;
  }

  finalizeMemberRemovalFromRoom(roomId, uid);
}

export function purgeStaleRooms(maxIdleMs = 1000 * 60 * 30): void {
  const now = Date.now();
  roomMetaMap.forEach((meta, roomId) => {
    const members = roomsMap.get(roomId);
    if (
      (!members || members.size === 0) &&
      meta.disconnectGraceTimers.size === 0 &&
      now - meta.createdAtMs > maxIdleMs
    ) {
      clearAllDisconnectGraceTimers(meta);
      roomsMap.delete(roomId);
      roomMetaMap.delete(roomId);
    }
  });
}

export function evaluateAndConfirmRankedRoomIfFull(roomId: string): void {
  const members = roomsMap.get(roomId);
  const meta = roomMetaMap.get(roomId);
  if (!members || !meta || meta.isPrivate) return;
  if (members.size < 10 || meta.serverConfirmedStart) return;

  const entries: QueuedPlayerEntry[] = Array.from(members).map((c) => ({
    uid: c.uid || 'unknown',
    callsign: c.callsign || 'OPERADOR',
    arenaMode: meta.arenaMode,
    queueType: meta.queueType,
    mmr: c.mmr,
    enqueuedAtMs: c.enqueuedAtMs || meta.createdAtMs,
    roomId,
  }));

  const balanced = tryFindBalancedMatch(
    entries,
    meta.queueType,
    meta.arenaMode,
    roomId,
    Date.now()
  );

  if (!balanced) return;

  meta.serverConfirmedStart = true;
  meta.status = 'PLAYING';
  meta.averageMmr = balanced.averageMmr;

  broadcastToRoom(roomId, {
    type: 'SERVER_MATCH_READY',
    roomId,
    queueType: meta.queueType,
    averageMmr: balanced.averageMmr,
    vanguardUids: balanced.vanguardUids,
    blackthornUids: balanced.blackthornUids,
    serverConfirmed: true,
    ts: Date.now(),
  });

  broadcastToRoom(roomId, {
    type: 'MATCH_START',
    roomId,
    queueType: meta.queueType,
    averageMmr: balanced.averageMmr,
    vanguardUids: balanced.vanguardUids,
    blackthornUids: balanced.blackthornUids,
    serverConfirmed: true,
    ts: Date.now(),
  });
}
