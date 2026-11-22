import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { WarfaceClassId } from '../components/WarfaceClassIcons';
import { getRankForXp } from '../progression/ranks';
import { WeaponId } from '../types/game';
import {
  auth,
  db,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
} from './firebaseClient';
import { getCloudSyncState } from './playerCloudSync';
import { PlayerCloudProfile } from './playerProfileModel';

export type LeaderboardSortKey =
  | 'OVERALL'
  | 'KD'
  | 'KILLS'
  | 'LEVEL'
  | 'WINS'
  | 'HEADSHOTS';

export interface LeaderboardPlayerEntry {
  uid: string;
  callsign: string;
  avatarDataUrl: string;
  rankLevel: number;
  rankTitle: string;
  playerXp: number;
  mmr: number;
  selectedClass: WarfaceClassId;
  activeWeapon: WeaponId;
  equippedCallingCardId: string;
  clanId: string;
  isVip: boolean;
  totalKills: number;
  totalDeaths: number;
  totalAssists: number;
  totalHeadshots: number;
  matchesPlayed: number;
  matchesWon: number;
  bombsPlanted: number;
  kdRatio: number;
  kdaRatio: number;
  headshotPct: number;
  winRatePct: number;
  updatedAtMs: number;
  isOnlineRecently: boolean;
}

export interface LeaderboardFetchResult {
  entries: LeaderboardPlayerEntry[];
  source: 'cloud' | 'local-only';
  fetchedAtMs: number;
  error?: string;
}

const VALID_CLASSES: ReadonlySet<string> = new Set<WarfaceClassId>([
  'FUZILEIRO',
  'MEDICO',
  'ENGENHEIRO',
  'FRANCO_ATIRADOR',
]);

const ONLINE_RECENT_WINDOW_MS = 2 * 60 * 1000;
const CACHE_TTL_MS = 30 * 1000;
const MAX_LEADERBOARD_FETCH = 200;

let cachedResult: LeaderboardFetchResult | null = null;

function toSafeNonNegInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function isProfileVipActive(profile: Partial<PlayerCloudProfile>): boolean {
  const activeUntilIso = profile.vipBattlePass?.activeUntilIso;
  if (!activeUntilIso || typeof activeUntilIso !== 'string') return false;
  const expiryMs = Date.parse(activeUntilIso);
  return Number.isFinite(expiryMs) && expiryMs > Date.now();
}

export function mapProfileToLeaderboardEntry(
  raw: Partial<PlayerCloudProfile>,
  fallbackUid: string,
  nowMs: number
): LeaderboardPlayerEntry {
  const uid = (raw.uid || fallbackUid || '').trim() || fallbackUid;
  const playerXp = toSafeNonNegInt(raw.playerXp, 0);
  const derivedRank = getRankForXp(playerXp);
  const rankLevel = Math.max(
    1,
    Math.min(70, toSafeNonNegInt(raw.rankLevel, derivedRank.level) || derivedRank.level)
  );
  const rankTitle =
    typeof raw.rankTitle === 'string' && raw.rankTitle.trim().length > 0
      ? raw.rankTitle.trim()
      : derivedRank.title;

  const rawMmr = Number(raw.mmr);
  const mmr =
    Number.isFinite(rawMmr) && rawMmr >= 100
      ? Math.min(10000, Math.round(rawMmr))
      : 2450;

  const totalKills = toSafeNonNegInt(raw.totalKills, 0);
  const totalDeaths = toSafeNonNegInt(raw.totalDeaths, 0);
  const totalAssists = toSafeNonNegInt(raw.totalAssists, 0);
  const totalHeadshots = Math.min(totalKills, toSafeNonNegInt(raw.totalHeadshots, 0));
  const matchesPlayed = toSafeNonNegInt(raw.matchesPlayed, 0);
  const matchesWon = Math.min(matchesPlayed, toSafeNonNegInt(raw.matchesWon, 0));
  const bombsPlanted = toSafeNonNegInt(raw.bombsPlanted, 0);

  const kdRatio =
    totalDeaths > 0
      ? totalKills / totalDeaths
      : totalKills > 0
        ? totalKills
        : 0;
  const kdaRatio =
    totalDeaths > 0
      ? (totalKills + totalAssists * 0.5) / totalDeaths
      : totalKills + totalAssists * 0.5;
  const headshotPct =
    totalKills > 0 ? Math.min(100, (totalHeadshots / totalKills) * 100) : 0;
  const winRatePct =
    matchesPlayed > 0 ? Math.min(100, (matchesWon / matchesPlayed) * 100) : 0;

  const selectedClass: WarfaceClassId =
    typeof raw.selectedClass === 'string' && VALID_CLASSES.has(raw.selectedClass)
      ? (raw.selectedClass as WarfaceClassId)
      : 'FUZILEIRO';

  const updatedAtMs = raw.updatedAt ? Date.parse(raw.updatedAt) : 0;
  const safeUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : 0;

  return {
    uid,
    callsign: (raw.callsign || 'OPERADOR').trim().slice(0, 32) || 'OPERADOR',
    avatarDataUrl: typeof raw.avatarDataUrl === 'string' ? raw.avatarDataUrl : '',
    rankLevel,
    rankTitle,
    playerXp,
    mmr,
    selectedClass,
    activeWeapon: (raw.activeWeapon as WeaponId) || 'M4_CARBINE',
    equippedCallingCardId:
      typeof raw.equippedCallingCardId === 'string' && raw.equippedCallingCardId
        ? raw.equippedCallingCardId
        : 'obsidian_vanguard',
    clanId: typeof raw.clanId === 'string' ? raw.clanId : '',
    isVip: isProfileVipActive(raw),
    totalKills,
    totalDeaths,
    totalAssists,
    totalHeadshots,
    matchesPlayed,
    matchesWon,
    bombsPlanted,
    kdRatio,
    kdaRatio,
    headshotPct,
    winRatePct,
    updatedAtMs: safeUpdatedAtMs,
    isOnlineRecently:
      safeUpdatedAtMs > 0 && nowMs - safeUpdatedAtMs <= ONLINE_RECENT_WINDOW_MS,
  };
}

/**
 * Fetches global player leaderboard from Cloud Firestore `/players` using a single-field
 * indexed query (`where('rankLevel', '>=', 1)` + `orderBy('rankLevel', 'desc')`)
 * that strictly complies with Firestore Security Rules and requires zero composite indexes.
 */
export async function fetchGlobalLeaderboard(
  forceRefresh = false
): Promise<LeaderboardFetchResult> {
  const nowMs = Date.now();
  const localProfile = getCloudSyncState().profile;
  const localEntry = mapProfileToLeaderboardEntry(
    localProfile,
    auth.currentUser?.uid || localProfile.uid || 'local-guest',
    nowMs
  );

  if (
    !forceRefresh &&
    cachedResult &&
    nowMs - cachedResult.fetchedAtMs < CACHE_TTL_MS &&
    (cachedResult.source === 'cloud' || !auth.currentUser)
  ) {
    // Keep current user's live stats fresh inside cached list
    const merged = mergeLocalPlayerEntry(cachedResult.entries, localEntry);
    return {
      ...cachedResult,
      entries: merged,
    };
  }

  if (!auth.currentUser) {
    const result: LeaderboardFetchResult = {
      entries: [localEntry],
      source: 'local-only',
      fetchedAtMs: nowMs,
    };
    cachedResult = result;
    return result;
  }

  try {
    const playersQuery = query(
      collection(db, 'players'),
      where('rankLevel', '>=', 1),
      orderBy('rankLevel', 'desc'),
      limit(MAX_LEADERBOARD_FETCH)
    );
    const snap = await getDocs(playersQuery);
    const list: LeaderboardPlayerEntry[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as Partial<PlayerCloudProfile>;
      if (!data) return;
      list.push(mapProfileToLeaderboardEntry(data, docSnap.id, nowMs));
    });

    const merged = mergeLocalPlayerEntry(list, localEntry);
    const result: LeaderboardFetchResult = {
      entries: merged,
      source: 'cloud',
      fetchedAtMs: nowMs,
    };
    cachedResult = result;
    return result;
  } catch (err) {
    if (!isFirestoreOfflineError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'players');
    }
    const result: LeaderboardFetchResult = {
      entries: [localEntry],
      source: 'local-only',
      fetchedAtMs: nowMs,
      error: isFirestoreOfflineError(err)
        ? 'Sem conexão com a nuvem. Exibindo seu perfil local.'
        : 'Não foi possível carregar o ranking global agora. Tente atualizar.',
    };
    return result;
  }
}

function mergeLocalPlayerEntry(
  entries: LeaderboardPlayerEntry[],
  localEntry: LeaderboardPlayerEntry
): LeaderboardPlayerEntry[] {
  const byUid = new Map<string, LeaderboardPlayerEntry>();
  for (const item of entries) {
    byUid.set(item.uid, item);
  }
  const existing = byUid.get(localEntry.uid);
  if (existing) {
    // Prefer whichever snapshot has fresher/higher progression for the local user
    byUid.set(localEntry.uid, {
      ...existing,
      ...localEntry,
      isOnlineRecently: true,
    });
  } else {
    byUid.set(localEntry.uid, {
      ...localEntry,
      isOnlineRecently: true,
    });
  }
  return Array.from(byUid.values());
}

export function sortLeaderboardEntries(
  entries: LeaderboardPlayerEntry[],
  sortKey: LeaderboardSortKey
): LeaderboardPlayerEntry[] {
  const copy = [...entries];
  copy.sort((a, b) => {
    switch (sortKey) {
      case 'OVERALL': {
        // Competitive MMR first, then K/D, then Kills, then XP
        if (b.mmr !== a.mmr) return b.mmr - a.mmr;
        if (b.kdRatio !== a.kdRatio) return b.kdRatio - a.kdRatio;
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
        if (b.playerXp !== a.playerXp) return b.playerXp - a.playerXp;
        return a.callsign.localeCompare(b.callsign);
      }
      case 'KD': {
        if (b.kdRatio !== a.kdRatio) return b.kdRatio - a.kdRatio;
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
        if (b.headshotPct !== a.headshotPct) return b.headshotPct - a.headshotPct;
        if (b.mmr !== a.mmr) return b.mmr - a.mmr;
        return a.callsign.localeCompare(b.callsign);
      }
      case 'KILLS': {
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
        if (b.kdRatio !== a.kdRatio) return b.kdRatio - a.kdRatio;
        if (b.totalHeadshots !== a.totalHeadshots) return b.totalHeadshots - a.totalHeadshots;
        if (b.playerXp !== a.playerXp) return b.playerXp - a.playerXp;
        return a.callsign.localeCompare(b.callsign);
      }
      case 'LEVEL': {
        if (b.playerXp !== a.playerXp) return b.playerXp - a.playerXp;
        if (b.rankLevel !== a.rankLevel) return b.rankLevel - a.rankLevel;
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
        if (b.mmr !== a.mmr) return b.mmr - a.mmr;
        return a.callsign.localeCompare(b.callsign);
      }
      case 'WINS': {
        if (b.matchesWon !== a.matchesWon) return b.matchesWon - a.matchesWon;
        if (b.winRatePct !== a.winRatePct) return b.winRatePct - a.winRatePct;
        if (b.matchesPlayed !== a.matchesPlayed) return b.matchesPlayed - a.matchesPlayed;
        if (b.mmr !== a.mmr) return b.mmr - a.mmr;
        return a.callsign.localeCompare(b.callsign);
      }
      case 'HEADSHOTS': {
        if (b.totalHeadshots !== a.totalHeadshots) return b.totalHeadshots - a.totalHeadshots;
        if (b.headshotPct !== a.headshotPct) return b.headshotPct - a.headshotPct;
        if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
        if (b.mmr !== a.mmr) return b.mmr - a.mmr;
        return a.callsign.localeCompare(b.callsign);
      }
    }
  });
  return copy;
}

export function getMetricGapToAbove(
  above: LeaderboardPlayerEntry,
  me: LeaderboardPlayerEntry,
  sortKey: LeaderboardSortKey
): string {
  switch (sortKey) {
    case 'OVERALL': {
      const diff = Math.max(1, Math.ceil(above.mmr - me.mmr));
      return `+${diff.toLocaleString('pt-BR')} MMR`;
    }
    case 'KD': {
      const diff = Math.max(0.01, above.kdRatio - me.kdRatio);
      return `+${diff.toFixed(2)} K/D`;
    }
    case 'KILLS': {
      const diff = Math.max(1, above.totalKills - me.totalKills);
      return `+${diff.toLocaleString('pt-BR')} abates`;
    }
    case 'LEVEL': {
      const diff = Math.max(1, above.playerXp - me.playerXp);
      return `+${diff.toLocaleString('pt-BR')} XP`;
    }
    case 'WINS': {
      const diff = Math.max(1, above.matchesWon - me.matchesWon);
      return `+${diff.toLocaleString('pt-BR')} vitórias`;
    }
    case 'HEADSHOTS': {
      const diff = Math.max(1, above.totalHeadshots - me.totalHeadshots);
      return `+${diff.toLocaleString('pt-BR')} HS`;
    }
  }
}
