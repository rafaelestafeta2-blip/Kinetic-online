import fs from 'node:fs';
import path from 'node:path';

export type ServerQueueType = 'CASUAL' | 'RANKED';

export interface QueuedPlayerEntry {
  uid: string;
  callsign: string;
  arenaMode: string;
  queueType: ServerQueueType;
  preferExactMap?: boolean;
  mmr: number;
  enqueuedAtMs: number;
  roomId?: string | null;
}

export interface BalancedMatchAllocation {
  roomId: string;
  queueType: ServerQueueType;
  arenaMode: string;
  averageMmr: number;
  vanguardUids: string[];
  blackthornUids: string[];
  players: QueuedPlayerEntry[];
}

const DEFAULT_MMR = 1000;
const BASE_RANKED_MMR_TOLERANCE = 150;
const EXPAND_MMR_PER_10S = 50;
const MAX_RANKED_MMR_TOLERANCE = 600;
const REQUIRED_MATCH_PLAYERS = 10;
const MIN_HUMAN_MATCH_PLAYERS = 2;
const CASUAL_PARTIAL_WAIT_MS = 10_000;
const RANKED_PARTIAL_WAIT_MS = 15_000;

export const OFFICIAL_5V5_BOMB_MAPS: readonly string[] = [
  'DUST2_BOMB_5V5',
  'ASSAULT_BOMB_5V5',
  'INDUSTRIA_BOMB_5V5',
  'HANGAR_BOMB_5V5',
  'EASTERN_CITY_BOMB_5V5',
  'MIRAGE_ANUBIS_BOMB_5V5',
  'CSGO_ASSAULT_BOMB_5V5',
  'DE_DST_BOMB_5V5',
  'MP_NUKED_BOMB_5V5',
  'DE_SUPPLY_BOMB_5V5',
  'YARD_V2_BOMB_5V5',
];

/**
 * Unifica todos os mapas oficiais 5v5 Defusal/Bomb no mesmo pool de matchmaking ('BOMB_5V5')
 * para que esquadrões em Ranqueada ou Clássica sempre se encontrem na mesma fila,
 * enquanto o servidor sorteia UM único mapa oficial compartilhado na hora de fechar a partida.
 */
export function getMatchmakingPoolKey(
  arenaMode: string,
  queueType: ServerQueueType = 'CASUAL',
  preferExactMap = false
): string {
  const normalized = String(arenaMode || '').trim().toUpperCase();
  if (queueType === 'RANKED') {
    return 'BOMB_5V5';
  }
  if (normalized === 'STATION_TDM_5V5') return 'STATION_TDM_5V5';
  if (normalized === 'STATION_CAPTURE_5V5') return 'STATION_CAPTURE_5V5';
  if (preferExactMap && normalized) {
    return `EXACT::${normalized}`;
  }
  return 'BOMB_5V5';
}

export function drawOfficialArenaForPool(poolKey: string): string {
  if (poolKey.startsWith('EXACT::')) {
    return poolKey.slice('EXACT::'.length) || 'DUST2_BOMB_5V5';
  }
  if (poolKey === 'STATION_TDM_5V5') return 'STATION_TDM_5V5';
  if (poolKey === 'STATION_CAPTURE_5V5') return 'STATION_CAPTURE_5V5';
  const idx = Math.floor(Math.random() * OFFICIAL_5V5_BOMB_MAPS.length);
  return OFFICIAL_5V5_BOMB_MAPS[idx] || 'DUST2_BOMB_5V5';
}

let cachedFirebaseConfig: { projectId: string; firestoreDatabaseId: string } | null = null;

function getFirebaseProjectAndDb(): { projectId: string; firestoreDatabaseId: string } {
  if (cachedFirebaseConfig) return cachedFirebaseConfig;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string; firestoreDatabaseId?: string };
    cachedFirebaseConfig = {
      projectId: parsed.projectId || 'gen-lang-client-0974852104',
      firestoreDatabaseId:
        parsed.firestoreDatabaseId ||
        'ai-studio-tacticalstrikeco-8b3150dc-163c-4aa2-9aa0-02f143e178e6',
    };
    return cachedFirebaseConfig;
  } catch {
    return {
      projectId: 'gen-lang-client-0974852104',
      firestoreDatabaseId: 'ai-studio-tacticalstrikeco-8b3150dc-163c-4aa2-9aa0-02f143e178e6',
    };
  }
}

export function normalizeQueueType(rawQueue?: unknown): ServerQueueType {
  const normalized = String(rawQueue || 'CASUAL').trim().toUpperCase();
  return normalized === 'RANKED' ? 'RANKED' : 'CASUAL';
}

/**
 * Lê o valor de MMR (Skill Rating) do jogador diretamente no Firebase Firestore (`players/{uid}`).
 * Caso o documento ainda não possua o campo `mmr`, calcula um MMR inicial baseado em vitórias/XP ou usa 1000.
 */
export async function fetchPlayerMmrFromFirebase(
  uid: string,
  idToken?: string | null,
  fallbackMmr?: number
): Promise<number> {
  const safeFallback =
    typeof fallbackMmr === 'number' && Number.isFinite(fallbackMmr) && fallbackMmr >= 100
      ? Math.round(fallbackMmr)
      : DEFAULT_MMR;

  if (!uid || !idToken) {
    return safeFallback;
  }

  try {
    const { projectId, firestoreDatabaseId } = getFirebaseProjectAndDb();
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(
      firestoreDatabaseId
    )}/documents/players/${encodeURIComponent(uid)}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) return safeFallback;

    const docData = (await res.json()) as {
      fields?: Record<string, { integerValue?: string; doubleValue?: number }>;
    };
    const fields = docData?.fields;
    if (!fields) return safeFallback;

    const rawMmr =
      fields.mmr?.integerValue !== undefined
        ? Number(fields.mmr.integerValue)
        : fields.mmr?.doubleValue !== undefined
        ? Number(fields.mmr.doubleValue)
        : NaN;

    if (Number.isFinite(rawMmr) && rawMmr >= 100) {
      return Math.round(rawMmr);
    }

    const wins = Number(fields.matchesWon?.integerValue ?? fields.matchesWon?.doubleValue ?? 0);
    const played = Number(fields.matchesPlayed?.integerValue ?? fields.matchesPlayed?.doubleValue ?? 0);
    const losses = Math.max(0, played - wins);
    const derivedMmr = Math.max(100, DEFAULT_MMR + wins * 25 - losses * 18);
    return Math.round(derivedMmr);
  } catch {
    return safeFallback;
  }
}

export function getAllowedMmrTolerance(enqueuedAtMs: number, nowMs = Date.now()): number {
  const waitedSec = Math.max(0, (nowMs - enqueuedAtMs) / 1000);
  const steps = Math.floor(waitedSec / 10);
  return Math.min(
    MAX_RANKED_MMR_TOLERANCE,
    BASE_RANKED_MMR_TOLERANCE + steps * EXPAND_MMR_PER_10S
  );
}

export function isPlayerMmrCompatibleWithRoom(
  playerMmr: number,
  roomAverageMmr: number,
  roomCreatedAtMs: number,
  nowMs = Date.now()
): boolean {
  const tolerance = getAllowedMmrTolerance(roomCreatedAtMs, nowMs);
  return Math.abs(playerMmr - roomAverageMmr) <= tolerance;
}

function findBestRankedWindow(
  sortedByMmr: QueuedPlayerEntry[],
  windowSize: number,
  nowMs: number
): QueuedPlayerEntry[] | null {
  if (sortedByMmr.length < windowSize) return null;
  let bestSpread = Infinity;
  let bestWindow: QueuedPlayerEntry[] | null = null;

  for (let i = 0; i <= sortedByMmr.length - windowSize; i++) {
    const windowSlice = sortedByMmr.slice(i, i + windowSize);
    const minMmr = windowSlice[0].mmr;
    const maxMmr = windowSlice[windowSlice.length - 1].mmr;
    const spread = maxMmr - minMmr;

    const oldestEnqueue = Math.min(...windowSlice.map((p) => p.enqueuedAtMs));
    const maxAllowedSpread = getAllowedMmrTolerance(oldestEnqueue, nowMs) * 2;

    if (spread <= maxAllowedSpread && spread < bestSpread) {
      bestSpread = spread;
      bestWindow = windowSlice;
    }
  }
  return bestWindow;
}

/**
 * Tenta formar uma partida online equilibrada no pool unificado (`BOMB_5V5`, `STATION_TDM_5V5` ou `STATION_CAPTURE_5V5`):
 * - Prioriza 10 jogadores humanos imediatamente assim que houver >= 10 na fila.
 * - Caso haja entre 2 e 9 jogadores reais esperando no mesmo pool há >= 10s (Casual) ou >= 15s (Ranked),
 *   forma partida real balanceada via Snake Draft (bots completam apenas os slots restantes no cliente,
 *   nunca liberando 1 jogador sozinho na Ranqueada).
 * - Sorteia UM único mapa oficial no servidor para todos os jogadores da partida.
 */
export function tryFindBalancedMatch(
  queueEntries: QueuedPlayerEntry[],
  queueType: ServerQueueType,
  poolKeyOrArena: string,
  roomId: string,
  nowMs = Date.now()
): BalancedMatchAllocation | null {
  const poolKey = poolKeyOrArena.startsWith('EXACT::')
    ? poolKeyOrArena
    : getMatchmakingPoolKey(poolKeyOrArena, queueType, false);
  const candidates = queueEntries.filter(
    (entry) =>
      entry.queueType === queueType &&
      getMatchmakingPoolKey(entry.arenaMode, entry.queueType, Boolean(entry.preferExactMap)) ===
        poolKey
  );

  if (candidates.length < MIN_HUMAN_MATCH_PLAYERS) {
    return null;
  }

  let selectedPlayers: QueuedPlayerEntry[] | null = null;

  if (candidates.length >= REQUIRED_MATCH_PLAYERS) {
    if (queueType === 'CASUAL') {
      const byWaitTime = [...candidates].sort((a, b) => a.enqueuedAtMs - b.enqueuedAtMs);
      selectedPlayers = byWaitTime.slice(0, REQUIRED_MATCH_PLAYERS);
    } else {
      const byMmr = [...candidates].sort((a, b) => a.mmr - b.mmr);
      selectedPlayers = findBestRankedWindow(byMmr, REQUIRED_MATCH_PLAYERS, nowMs);
    }
  } else {
    const oldestWaitMs = Math.max(
      0,
      nowMs - Math.min(...candidates.map((p) => p.enqueuedAtMs))
    );
    const minWaitRequired =
      queueType === 'RANKED' ? RANKED_PARTIAL_WAIT_MS : CASUAL_PARTIAL_WAIT_MS;

    if (oldestWaitMs < minWaitRequired) {
      return null;
    }

    if (queueType === 'CASUAL') {
      selectedPlayers = [...candidates]
        .sort((a, b) => a.enqueuedAtMs - b.enqueuedAtMs)
        .slice(0, REQUIRED_MATCH_PLAYERS);
    } else {
      const byMmr = [...candidates].sort((a, b) => a.mmr - b.mmr);
      // Encontra a maior janela MMR-compatível (>= 2 humanos reais)
      for (let size = Math.min(byMmr.length, REQUIRED_MATCH_PLAYERS); size >= MIN_HUMAN_MATCH_PLAYERS; size--) {
        const win = findBestRankedWindow(byMmr, size, nowMs);
        if (win) {
          selectedPlayers = win;
          break;
        }
      }
    }
  }

  if (!selectedPlayers || selectedPlayers.length < MIN_HUMAN_MATCH_PLAYERS) {
    return null;
  }

  // Ordenar por MMR decrescente e aplicar Snake Draft para equilibrar as duas equipes
  const sortedBySkill = [...selectedPlayers].sort((a, b) => b.mmr - a.mmr);
  const vanguardUids: string[] = [];
  const blackthornUids: string[] = [];

  // Padrão Snake Draft 5v5: V, B, B, V, V, B, B, V, B, V
  const snakeTeams: ('VANGUARD' | 'BLACKTHORN')[] = [
    'VANGUARD',
    'BLACKTHORN',
    'BLACKTHORN',
    'VANGUARD',
    'VANGUARD',
    'BLACKTHORN',
    'BLACKTHORN',
    'VANGUARD',
    'BLACKTHORN',
    'VANGUARD',
  ];

  sortedBySkill.forEach((p, idx) => {
    if (snakeTeams[idx] === 'VANGUARD') {
      vanguardUids.push(p.uid);
    } else {
      blackthornUids.push(p.uid);
    }
  });

  const totalMmr = sortedBySkill.reduce((sum, p) => sum + p.mmr, 0);
  const averageMmr = Math.round(totalMmr / sortedBySkill.length);
  const drawnArenaMode = drawOfficialArenaForPool(poolKey);

  return {
    roomId,
    queueType,
    arenaMode: drawnArenaMode,
    averageMmr,
    vanguardUids,
    blackthornUids,
    players: sortedBySkill,
  };
}
