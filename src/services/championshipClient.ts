import { auth } from '../firebase/firebaseClient';
import type {
  AuditLogRecord,
  ChampionshipLobbySnapshot,
  ChampionshipRecord,
  ChampionshipStatus,
  MatchLineupPlayer,
  MatchPhase,
  MatchRecord,
  MatchStatus,
  RegistrationRecord,
  RegistrationStatus,
  RosterMemberRecord,
  RosterSlotRole,
  StandingRecord,
} from '../server/championship/types';

export type {
  AuditLogRecord,
  ChampionshipLobbySnapshot,
  ChampionshipRecord,
  ChampionshipStatus,
  MatchLineupPlayer,
  MatchPhase,
  MatchRecord,
  MatchStatus,
  RegistrationRecord,
  RegistrationStatus,
  RosterMemberRecord,
  RosterSlotRole,
  StandingRecord,
};

export interface ChampionshipOverviewData {
  ok: true;
  serverNowMs: number;
  /** Client-measured HTTP round-trip latency in ms for half-RTT clock compensation */
  measuredRttMs?: number;
  isAdmin: boolean;
  stripeConfigured: boolean;
  championship: ChampionshipRecord;
  confirmedCount: number;
  pendingCount: number;
  registrations: RegistrationRecord[];
  myRegistration: RegistrationRecord | null;
  nextMatch: MatchRecord | null;
  matches: MatchRecord[];
  standings: StandingRecord[];
}

const API_BASE = '/api/championships';

async function getAuthHeaders(required = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const user = auth.currentUser;
  if (user) {
    try {
      const idToken = await user.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      if (required) {
        throw new Error('Falha ao validar sua sessão Google. Tente entrar novamente.');
      }
    }
  } else if (required) {
    throw new Error('Faça login com sua Conta Google para continuar.');
  }
  return headers;
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }
  if (!res.ok) {
    const errMsg =
      typeof data.error === 'string' && data.error.trim().length > 0
        ? data.error
        : `Erro HTTP ${res.status} na comunicação com o servidor do campeonato.`;
    throw new Error(errMsg);
  }
  return data as T;
}

export async function fetchActiveChampionship(): Promise<ChampionshipOverviewData> {
  const headers = await getAuthHeaders(false);
  const reqStartPerf = typeof performance !== 'undefined' ? performance.now() : 0;
  const res = await fetch(`${API_BASE}/active`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  const data = await parseJsonResponse<ChampionshipOverviewData>(res);
  const reqEndPerf = typeof performance !== 'undefined' ? performance.now() : reqStartPerf;
  const rttMs = Math.max(0, Math.min(4000, Math.round(reqEndPerf - reqStartPerf)));
  return {
    ...data,
    measuredRttMs: rttMs,
  };
}

export async function registerClanInChampionship(
  championshipId: number,
  payload: {
    clanId: string;
    starterUids: string[];
    reserveUids: string[];
  }
): Promise<{ ok: true; registration: RegistrationRecord }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/${championshipId}/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function createChampionshipCheckout(
  championshipId: number
): Promise<{ ok: true; checkoutUrl: string; sessionId: string }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/${championshipId}/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res);
}

export async function requestMatchLobbyToken(matchId: number): Promise<{
  ok: true;
  token: string;
  expiresInSec: number;
  lobby: ChampionshipLobbySnapshot;
}> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/matches/${matchId}/join-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res);
}

export async function substituteChampionshipStarter(
  matchId: number,
  starterOutUid: string,
  reserveInUid: string
): Promise<{ ok: true; lobby: ChampionshipLobbySnapshot }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/matches/${matchId}/substitute`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ starterOutUid, reserveInUid }),
  });
  return parseJsonResponse(res);
}

export async function fetchRosterLockStatus(): Promise<{
  ok: boolean;
  locked: boolean;
  championshipTitle?: string;
  clanName?: string;
}> {
  try {
    const headers = await getAuthHeaders(false);
    if (!headers.Authorization) {
      return { ok: true, locked: false };
    }
    const res = await fetch(`${API_BASE}/roster-lock-status`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, locked: false };
    return (await res.json()) as {
      ok: boolean;
      locked: boolean;
      championshipTitle?: string;
      clanName?: string;
    };
  } catch {
    return { ok: false, locked: false };
  }
}

// ---------------------------------------------------------------------------
// Admin Endpoints (Organizer only — verified on server)
// ---------------------------------------------------------------------------

export async function adminSaveChampionship(payload: {
  championshipId?: number;
  createNew?: boolean;
  title: string;
  seasonLabel: string;
  entryFeeCents: number;
  prizePoolCents: number;
  maxClans: number;
  playoffSize: 4 | 8;
  registrationOpensAt: string;
  rosterLockAt: string;
  startsAt: string;
  rulesSummary: string;
  status?: ChampionshipStatus;
}): Promise<{ ok: true; championship: ChampionshipRecord }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/admin/championship`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function adminConfirmClanPayment(
  championshipId: number,
  registrationId: number
): Promise<{ ok: true; registration: RegistrationRecord }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(
    `${API_BASE}/admin/${championshipId}/confirm-payment/${registrationId}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    }
  );
  return parseJsonResponse(res);
}

export async function adminExecuteRosterLock(
  championshipId: number
): Promise<{ ok: true; matchesGenerated: number; confirmedClans: number }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/admin/${championshipId}/roster-lock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res);
}

export async function adminOpenMatchRoom(
  matchId: number
): Promise<{ ok: true; match: MatchRecord }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/admin/matches/${matchId}/open-room`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res);
}

export async function adminRecordMatchResult(
  matchId: number,
  payload: {
    scoreA: number;
    scoreB: number;
    killsA: number;
    killsB: number;
    woClanRegId?: number | null;
  }
): Promise<{ ok: true; match: MatchRecord }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/admin/matches/${matchId}/result`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function adminFetchAuditLogs(
  championshipId: number
): Promise<{ ok: true; logs: AuditLogRecord[] }> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/admin/${championshipId}/audit-logs`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  return parseJsonResponse(res);
}

export async function adminRunSchedulerNow(): Promise<{
  ok: true;
  summary: {
    openedChampionshipIds: number[];
    lockedChampionshipIds: number[];
    openedMatchIds: number[];
    woAppliedMatchIds: number[];
  };
}> {
  const headers = await getAuthHeaders(true);
  const res = await fetch(`${API_BASE}/admin/run-scheduler`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res);
}

// ---------------------------------------------------------------------------
// Authoritative Private Match Lobby WebSocket Client
// ---------------------------------------------------------------------------

export interface ChampionshipLobbyWsCallbacks {
  onLobbyState: (lobby: ChampionshipLobbySnapshot) => void;
  onMatchLaunch: (payload: {
    matchId: number;
    privateRoomCode: string;
    arenaMode: string;
    clanAName: string;
    clanBName: string;
  }) => void;
  onWoApplied?: (matchId: number) => void;
  onError?: (message: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  onServerTimeSync?: (serverNowMs: number, rttMs: number) => void;
}

export interface ChampionshipLobbyWsHandle {
  toggleReady: (ready: boolean) => void;
  disconnect: () => void;
}

function resolveChampionshipWsUrl(): string {
  const custom = (import.meta.env.VITE_WS_SERVER_URL as string | undefined)?.trim();
  if (custom) {
    return custom.endsWith('/ws') ? custom : `${custom.replace(/\/$/, '')}/ws`;
  }
  if (typeof window === 'undefined') return 'ws://localhost:3000/ws';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function connectChampionshipLobbyWs(
  token: string,
  callbacks: ChampionshipLobbyWsCallbacks
): ChampionshipLobbyWsHandle {
  let socket: WebSocket | null = null;
  let closedByUser = false;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  try {
    socket = new WebSocket(resolveChampionshipWsUrl());
  } catch {
    callbacks.onError?.('Não foi possível abrir conexão WebSocket com o lobby.');
    return { toggleReady: () => {}, disconnect: () => {} };
  }

  socket.onopen = () => {
    if (!socket || closedByUser) return;
    callbacks.onConnectionChange?.(true);
    socket.send(
      JSON.stringify({
        type: 'CHAMP_JOIN_LOBBY',
        token,
      })
    );
    pingTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(
            JSON.stringify({
              type: 'PING',
              clientTs: typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now(),
            })
          );
        } catch {
          // ignore
        }
      }
    }, 15_000);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(String(event.data || '{}')) as Record<string, unknown>;
      if (msg.type === 'PONG' && typeof msg.serverTs === 'number') {
        const nowPerf = typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now();
        const sentPerf = typeof msg.clientTs === 'number' ? msg.clientTs : nowPerf;
        const rttMs = Math.max(0, Math.min(4000, nowPerf - sentPerf));
        callbacks.onServerTimeSync?.(msg.serverTs, rttMs);
        return;
      }
      if (msg.type === 'CHAMP_LOBBY_STATE' && msg.lobby) {
        callbacks.onLobbyState(msg.lobby as ChampionshipLobbySnapshot);
        return;
      }
      if (msg.type === 'CHAMP_MATCH_LAUNCH' && typeof msg.privateRoomCode === 'string') {
        callbacks.onMatchLaunch({
          matchId: Number(msg.matchId || 0),
          privateRoomCode: msg.privateRoomCode,
          arenaMode: String(msg.arenaMode || 'DUST2_BOMB_5V5'),
          clanAName: String(msg.clanAName || ''),
          clanBName: String(msg.clanBName || ''),
        });
        return;
      }
      if (msg.type === 'CHAMP_WO_APPLIED') {
        callbacks.onWoApplied?.(Number(msg.matchId || 0));
        return;
      }
      if (msg.type === 'CHAMP_LOBBY_ERROR') {
        callbacks.onError?.(String(msg.message || 'Erro no lobby privado da partida.'));
      }
    } catch {
      // ignore malformed message
    }
  };

  socket.onerror = () => {
    callbacks.onConnectionChange?.(false);
    callbacks.onError?.('Falha na conexão em tempo real do lobby.');
  };

  socket.onclose = () => {
    callbacks.onConnectionChange?.(false);
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  return {
    toggleReady: (ready: boolean) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'CHAMP_TOGGLE_READY', ready }));
      }
    },
    disconnect: () => {
      closedByUser = true;
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (socket) {
        try {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'CHAMP_LEAVE_LOBBY' }));
          }
          socket.close();
        } catch {
          // ignore
        }
        socket = null;
      }
    },
  };
}
