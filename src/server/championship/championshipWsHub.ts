import type { WebSocket } from 'ws';
import { verifyMatchLobbyToken } from './authAndClanGuard';
import {
  ChampionshipError,
  getMatchLobbySnapshot,
  setMatchPlayerReady,
} from './championshipService';
import { SignedMatchLobbyTokenPayload } from './types';

interface LobbySocketSession {
  ws: WebSocket;
  matchId: number;
  payload: SignedMatchLobbyTokenPayload;
}

const sessionsByMatch = new Map<number, Set<LobbySocketSession>>();
const sessionBySocket = new Map<WebSocket, LobbySocketSession>();

function getConnectedUidsForMatch(matchId: number): string[] {
  const set = sessionsByMatch.get(matchId);
  if (!set) return [];
  const uids = new Set<string>();
  set.forEach((s) => {
    if (s.ws.readyState === 1) {
      uids.add(s.payload.uid);
    }
  });
  return Array.from(uids);
}

export function broadcastChampionshipLobbyState(matchId: number): void {
  const set = sessionsByMatch.get(matchId);
  if (!set || set.size === 0) return;

  try {
    const connectedUids = getConnectedUidsForMatch(matchId);
    const snapshot = getMatchLobbySnapshot(matchId, connectedUids);
    const frame = JSON.stringify({
      type: 'CHAMP_LOBBY_STATE',
      matchId,
      lobby: snapshot,
      ts: Date.now(),
    });
    set.forEach((session) => {
      if (session.ws.readyState === 1) {
        session.ws.send(frame);
      }
    });
  } catch {
    // ignore if match disappeared
  }
}

export function broadcastChampionshipEvent(
  matchId: number,
  eventPayload: Record<string, unknown>
): void {
  const set = sessionsByMatch.get(matchId);
  if (!set || set.size === 0) return;
  const frame = JSON.stringify({ ...eventPayload, matchId, ts: Date.now() });
  set.forEach((session) => {
    if (session.ws.readyState === 1) {
      session.ws.send(frame);
    }
  });
}

export function detachChampionshipSocket(ws: WebSocket): void {
  const existing = sessionBySocket.get(ws);
  if (!existing) return;
  sessionBySocket.delete(ws);
  const set = sessionsByMatch.get(existing.matchId);
  if (set) {
    set.delete(existing);
    if (set.size === 0) {
      sessionsByMatch.delete(existing.matchId);
    } else {
      broadcastChampionshipLobbyState(existing.matchId);
    }
  }
}

/**
 * Handles all `CHAMP_*` WebSocket messages inside the existing `/ws` server.
 * Returns `true` if the message belonged to the Championship Hub.
 */
export function handleChampionshipWsMessage(
  ws: WebSocket,
  msg: Record<string, unknown>
): boolean {
  const type = typeof msg.type === 'string' ? msg.type : '';
  if (!type.startsWith('CHAMP_')) return false;

  if (type === 'CHAMP_JOIN_LOBBY') {
    const token = typeof msg.token === 'string' ? msg.token : '';
    const verified = verifyMatchLobbyToken(token);
    if (!verified) {
      ws.send(
        JSON.stringify({
          type: 'CHAMP_LOBBY_ERROR',
          code: 'INVALID_LOBBY_TOKEN',
          message: 'Token de sala expirado ou inválido. Solicite um novo acesso.',
        })
      );
      return true;
    }

    detachChampionshipSocket(ws);
    const session: LobbySocketSession = {
      ws,
      matchId: verified.matchId,
      payload: verified,
    };
    sessionBySocket.set(ws, session);
    let set = sessionsByMatch.get(verified.matchId);
    if (!set) {
      set = new Set();
      sessionsByMatch.set(verified.matchId, set);
    }
    // Deduplicate same UID on reconnect
    set.forEach((other) => {
      if (other !== session && other.payload.uid === verified.uid) {
        set!.delete(other);
        sessionBySocket.delete(other.ws);
      }
    });
    set.add(session);

    broadcastChampionshipLobbyState(verified.matchId);
    return true;
  }

  if (type === 'CHAMP_LEAVE_LOBBY') {
    detachChampionshipSocket(ws);
    return true;
  }

  if (type === 'CHAMP_TOGGLE_READY') {
    const session = sessionBySocket.get(ws);
    if (!session) {
      ws.send(
        JSON.stringify({
          type: 'CHAMP_LOBBY_ERROR',
          code: 'NOT_IN_LOBBY',
          message: 'Entre na sala com um token autorizado antes de marcar Pronto.',
        })
      );
      return true;
    }

    try {
      const desiredReady = Boolean(msg.ready);
      const connectedUids = getConnectedUidsForMatch(session.matchId);
      const { lobby, launchedRoomCode } = setMatchPlayerReady(
        session.matchId,
        session.payload.uid,
        desiredReady,
        connectedUids
      );

      broadcastChampionshipEvent(session.matchId, {
        type: 'CHAMP_LOBBY_STATE',
        lobby,
      });

      if (launchedRoomCode) {
        broadcastChampionshipEvent(session.matchId, {
          type: 'CHAMP_MATCH_LAUNCH',
          privateRoomCode: launchedRoomCode,
          arenaMode: lobby.match.arenaMode,
          clanAName: lobby.match.clanAName,
          clanBName: lobby.match.clanBName,
        });
      }
    } catch (err) {
      const message =
        err instanceof ChampionshipError
          ? err.message
          : 'Erro ao atualizar estado de Pronto.';
      ws.send(
        JSON.stringify({
          type: 'CHAMP_LOBBY_ERROR',
          code: err instanceof ChampionshipError ? err.code : 'READY_ERROR',
          message,
        })
      );
    }
    return true;
  }

  return true;
}
