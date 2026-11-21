import { WebSocket } from 'ws';
import {
  QueuedPlayerEntry,
  ServerQueueType,
  tryFindBalancedMatch,
} from './matchmakingEngine';

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
  readyByUid: Map<string, boolean>;
  chatHistory: ServerSquadChatMessage[];
  memberMmrs: Map<string, number>;
  memberPlayers: Map<string, Record<string, unknown>>;
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

export function removeClientFromRoom(client: WsClientMeta): void {
  if (!client.roomId) return;
  const roomId = client.roomId;
  const set = roomsMap.get(roomId);
  const meta = roomMetaMap.get(roomId);

  if (meta && client.uid) {
    meta.memberMmrs.delete(client.uid);
    meta.memberPlayers.delete(client.uid);
    meta.readyByUid.delete(client.uid);
    recalculateRoomAverageMmr(meta);
    if (meta.memberMmrs.size < 10) {
      meta.serverConfirmedStart = false;
    }
    if (meta.hostUid === client.uid) {
      const nextHost = meta.memberPlayers.keys().next().value ?? null;
      meta.hostUid = nextHost;
    }
  }

  if (set) {
    set.delete(client);
    if (set.size === 0) {
      roomsMap.delete(roomId);
      roomMetaMap.delete(roomId);
    } else if (client.uid) {
      broadcastToRoom(
        roomId,
        {
          type: 'PLAYER_LEFT',
          roomId,
          uid: client.uid,
          hostUid: meta?.hostUid ?? null,
          averageMmr: meta?.averageMmr ?? 1000,
          ts: Date.now(),
        },
        client.uid
      );
    }
  }
  client.roomId = null;
}

export function purgeStaleRooms(maxIdleMs = 1000 * 60 * 30): void {
  const now = Date.now();
  roomMetaMap.forEach((meta, roomId) => {
    const members = roomsMap.get(roomId);
    if ((!members || members.size === 0) && now - meta.createdAtMs > maxIdleMs) {
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
