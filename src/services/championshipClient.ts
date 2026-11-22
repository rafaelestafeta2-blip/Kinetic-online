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

const REQUEST_TIMEOUT_MS = 10_000;

function isNativeCapacitorRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function') {
    try {
      if (cap.isNativePlatform()) return true;
    } catch {
      // ignore
    }
  }
  return window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';
}

function getEnvString(key: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return (env?.[key] || '').trim();
  } catch {
    return '';
  }
}

/**
 * Resolves the Championship API base URL for both Web (same-origin `/api/championships`)
 * and Capacitor Android APK (`VITE_API_SERVER_URL` or origin derived from `VITE_WS_SERVER_URL`).
 */
export function resolveChampionshipApiBase(): string {
  const explicitApiUrl = getEnvString('VITE_API_SERVER_URL');
  if (explicitApiUrl && /^https?:\/\//i.test(explicitApiUrl)) {
    const clean = explicitApiUrl.replace(/\/+$/, '');
    return clean.endsWith('/api/championships') ? clean : `${clean}/api/championships`;
  }

  const wsUrl = getEnvString('VITE_WS_SERVER_URL');
  const isLocalOrNative =
    isNativeCapacitorRuntime() ||
    (typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'));

  if (wsUrl && /^wss?:\/\//i.test(wsUrl)) {
    try {
      const parsed = new URL(wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:'));
      if (isLocalOrNative) {
        return `${parsed.origin}/api/championships`;
      }
    } catch {
      // ignore malformed URL
    }
  }

  if (isNativeCapacitorRuntime()) {
    throw new Error(
      'Este APK não possui endereço do servidor do Campeonato configurado. Defina VITE_WS_SERVER_URL ou VITE_API_SERVER_URL apontando para o servidor online do KINETIC antes de compilar o APK.'
    );
  }

  return '/api/championships';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  if (typeof AbortController === 'undefined') {
    return fetch(url, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao conectar com o servidor do campeonato. Verifique sua internet.');
    }
    throw new Error(
      'Não foi possível conectar ao servidor do campeonato. Verifique sua conexão ou o endereço do servidor.'
    );
  } finally {
    clearTimeout(timer);
  }
}

async function getAuthHeaders(required = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
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
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const rawText = await res.text();

  let data: Record<string, unknown> | null = null;
  if (rawText) {
    try {
      const parsed: unknown = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      // Non-JSON payload (e.g. SPA index.html served by Capacitor local asset server)
    }
  }

  if (!res.ok) {
    const errMsg =
      data && typeof data.error === 'string' && data.error.trim().length > 0
        ? data.error
        : `Erro HTTP ${res.status} na comunicação com o servidor do campeonato.`;
    throw new Error(errMsg);
  }

  if (!data || (!contentType.includes('application/json') && rawText.trim().startsWith('<'))) {
    throw new Error(
      'O servidor do Campeonato não respondeu em JSON válido. No APK Android, configure VITE_WS_SERVER_URL ou VITE_API_SERVER_URL apontando para a URL HTTPS do servidor KINETIC.'
    );
  }

  return data as T;
}

export async function fetchActiveChampionship(): Promise<ChampionshipOverviewData> {
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(false);
  const reqStartPerf = typeof performance !== 'undefined' ? performance.now() : 0;
  const res = await fetchWithTimeout(`${apiBase}/active`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });
  const data = await parseJsonResponse<ChampionshipOverviewData>(res);
  if (!data.championship || typeof data.championship.id !== 'number') {
    throw new Error('Resposta incompleta do servidor do campeonato. Tente atualizar novamente.');
  }
  const reqEndPerf = typeof performance !== 'undefined' ? performance.now() : reqStartPerf;
  const rttMs = Math.max(0, Math.min(4000, Math.round(reqEndPerf - reqStartPerf)));
  return {
    ...data,
    registrations: Array.isArray(data.registrations) ? data.registrations : [],
    matches: Array.isArray(data.matches) ? data.matches : [],
    standings: Array.isArray(data.standings) ? data.standings : [],
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/${championshipId}/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function createChampionshipCheckout(
  championshipId: number
): Promise<{ ok: true; checkoutUrl: string; sessionId: string }> {
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/${championshipId}/checkout`, {
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/matches/${matchId}/join-token`, {
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/matches/${matchId}/substitute`, {
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
    const apiBase = resolveChampionshipApiBase();
    const headers = await getAuthHeaders(false);
    if (!headers.Authorization) {
      return { ok: true, locked: false };
    }
    const res = await fetchWithTimeout(
      `${apiBase}/roster-lock-status`,
      {
        method: 'GET',
        headers,
        cache: 'no-store',
      },
      5000
    );
    if (!res.ok) return { ok: false, locked: false };
    return await parseJsonResponse<{
      ok: boolean;
      locked: boolean;
      championshipTitle?: string;
      clanName?: string;
    }>(res);
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/admin/championship`, {
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(
    `${apiBase}/admin/${championshipId}/confirm-payment/${registrationId}`,
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/admin/${championshipId}/roster-lock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res);
}

export async function adminOpenMatchRoom(
  matchId: number
): Promise<{ ok: true; match: MatchRecord }> {
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/admin/matches/${matchId}/open-room`, {
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/admin/matches/${matchId}/result`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res);
}

export async function adminFetchAuditLogs(
  championshipId: number
): Promise<{ ok: true; logs: AuditLogRecord[] }> {
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/admin/${championshipId}/audit-logs`, {
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
  const apiBase = resolveChampionshipApiBase();
  const headers = await getAuthHeaders(true);
  const res = await fetchWithTimeout(`${apiBase}/admin/run-scheduler`, {
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
  const customWs = getEnvString('VITE_WS_SERVER_URL');
  if (customWs && /^wss?:\/\//i.test(customWs)) {
    return customWs.endsWith('/ws') ? customWs : `${customWs.replace(/\/+$/, '')}/ws`;
  }
  const customApi = getEnvString('VITE_API_SERVER_URL');
  if (customApi && /^https?:\/\//i.test(customApi)) {
    try {
      const parsed = new URL(customApi);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/ws`;
    } catch {
      // ignore
    }
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
