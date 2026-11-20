import { canGrantMatchProgressionRewards } from './matchProgressionGate';
import {
  addPlayerCash,
  loadSavedPlayerXp,
  savePlayerXp,
} from './ranks';

export type DailyContractMetric = 'kills' | 'headshots' | 'objectives' | 'matchesWon';

export interface DailyContractDefinition {
  id: string;
  title: string;
  description: string;
  metric: DailyContractMetric;
  target: number;
  rewardXp: number;
  rewardCash: number;
}

export interface DailyContractsCloudState {
  dayKey: string;
  kills: number;
  headshots: number;
  objectives: number;
  matchesWon: number;
  claimedIds: string[];
}

export interface ResolvedDailyContract extends DailyContractDefinition {
  progress: number;
  completed: boolean;
  claimed: boolean;
  canClaim: boolean;
}

export interface DailyContractsSnapshot {
  state: DailyContractsCloudState;
  contracts: ResolvedDailyContract[];
  claimableCount: number;
}

const STORAGE_KEY = 'kinetic_daily_contracts_v1';

const COMBAT_POOL: DailyContractDefinition[] = [
  {
    id: 'daily_kills_12',
    title: 'LIMPEZA DE SETOR',
    description: 'Elimine 12 operadores inimigos em partidas online PvP.',
    metric: 'kills',
    target: 12,
    rewardXp: 300,
    rewardCash: 450,
  },
  {
    id: 'daily_kills_18',
    title: 'DOMÍNIO BALÍSTICO',
    description: 'Consiga 18 eliminações confirmadas em partidas online PvP.',
    metric: 'kills',
    target: 18,
    rewardXp: 400,
    rewardCash: 600,
  },
];

const PRECISION_POOL: DailyContractDefinition[] = [
  {
    id: 'daily_hs_4',
    title: 'PRECISÃO CIRÚRGICA',
    description: 'Execute 4 headshots letais em combates online PvP.',
    metric: 'headshots',
    target: 4,
    rewardXp: 350,
    rewardCash: 500,
  },
  {
    id: 'daily_hs_6',
    title: 'ATIRADOR DE ELITE',
    description: 'Execute 6 headshots letais em combates online PvP.',
    metric: 'headshots',
    target: 6,
    rewardXp: 450,
    rewardCash: 650,
  },
];

const OBJECTIVE_POOL: DailyContractDefinition[] = [
  {
    id: 'daily_wins_2',
    title: 'VITÓRIA TÁTICA',
    description: 'Vença 2 partidas online PvP (Bomba, Captura ou Mata-Mata).',
    metric: 'matchesWon',
    target: 2,
    rewardXp: 500,
    rewardCash: 750,
  },
  {
    id: 'daily_obj_2',
    title: 'ESPECIALISTA EM OBJETIVOS',
    description: 'Complete 2 plantios de C4 ou vitórias em partidas online PvP.',
    metric: 'objectives',
    target: 2,
    rewardXp: 450,
    rewardCash: 700,
  },
];

export function getTodayDayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashDayKey(dayKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i++) {
    h ^= dayKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function getDailyContractDefinitions(dayKey: string): DailyContractDefinition[] {
  const seed = hashDayKey(dayKey);
  return [
    COMBAT_POOL[seed % COMBAT_POOL.length],
    PRECISION_POOL[(seed >> 2) % PRECISION_POOL.length],
    OBJECTIVE_POOL[(seed >> 4) % OBJECTIVE_POOL.length],
  ];
}

export function createEmptyDailyContractsState(
  dayKey = getTodayDayKey()
): DailyContractsCloudState {
  return {
    dayKey,
    kills: 0,
    headshots: 0,
    objectives: 0,
    matchesWon: 0,
    claimedIds: [],
  };
}

function clampCount(v: unknown): number {
  const n = Math.floor(Number(v) || 0);
  return Math.max(0, Math.min(9999, n));
}

export function sanitizeDailyContractsState(
  raw: Partial<DailyContractsCloudState> | null | undefined
): DailyContractsCloudState {
  const today = getTodayDayKey();
  if (!raw || typeof raw !== 'object') {
    return createEmptyDailyContractsState(today);
  }
  const dayKey =
    typeof raw.dayKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dayKey)
      ? raw.dayKey
      : today;
  if (dayKey !== today) {
    return createEmptyDailyContractsState(today);
  }
  const claimedIds = Array.isArray(raw.claimedIds)
    ? Array.from(
        new Set(
          raw.claimedIds.filter((id): id is string => typeof id === 'string').slice(0, 6)
        )
      )
    : [];
  return {
    dayKey: today,
    kills: clampCount(raw.kills),
    headshots: clampCount(raw.headshots),
    objectives: clampCount(raw.objectives),
    matchesWon: clampCount(raw.matchesWon),
    claimedIds,
  };
}

export function mergeDailyContractsStates(
  localRaw: Partial<DailyContractsCloudState> | null | undefined,
  remoteRaw: Partial<DailyContractsCloudState> | null | undefined
): DailyContractsCloudState {
  const local = sanitizeDailyContractsState(localRaw);
  const remote = sanitizeDailyContractsState(remoteRaw);
  return {
    dayKey: getTodayDayKey(),
    kills: Math.max(local.kills, remote.kills),
    headshots: Math.max(local.headshots, remote.headshots),
    objectives: Math.max(local.objectives, remote.objectives),
    matchesWon: Math.max(local.matchesWon, remote.matchesWon),
    claimedIds: Array.from(new Set([...local.claimedIds, ...remote.claimedIds])).slice(0, 6),
  };
}

function loadFromStorage(): DailyContractsCloudState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyDailyContractsState();
    return sanitizeDailyContractsState(JSON.parse(raw) as Partial<DailyContractsCloudState>);
  } catch {
    return createEmptyDailyContractsState();
  }
}

let currentState: DailyContractsCloudState = loadFromStorage();
let isApplyingRemoteContracts = false;
let cloudDailyContractsHook: ((next: DailyContractsCloudState) => void) | null = null;
const listeners = new Set<(snap: DailyContractsSnapshot) => void>();

function ensureCurrentDay(): void {
  const today = getTodayDayKey();
  if (currentState.dayKey !== today) {
    currentState = createEmptyDailyContractsState(today);
    persistState();
  }
}

function persistState(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  } catch {
    // Ignore quota errors
  }
}

function buildSnapshot(): DailyContractsSnapshot {
  ensureCurrentDay();
  const defs = getDailyContractDefinitions(currentState.dayKey);
  const contracts: ResolvedDailyContract[] = defs.map((def) => {
    const rawProgress = currentState[def.metric] || 0;
    const progress = Math.min(def.target, rawProgress);
    const completed = progress >= def.target;
    const claimed = currentState.claimedIds.includes(def.id);
    return {
      ...def,
      progress,
      completed,
      claimed,
      canClaim: completed && !claimed,
    };
  });
  const claimableCount = contracts.filter((c) => c.canClaim).length;
  return {
    state: {
      ...currentState,
      claimedIds: [...currentState.claimedIds],
    },
    contracts,
    claimableCount,
  };
}

function emit(): void {
  const snap = buildSnapshot();
  listeners.forEach((fn) => fn(snap));
  if (!isApplyingRemoteContracts && cloudDailyContractsHook) {
    cloudDailyContractsHook(snap.state);
  }
}

export function registerCloudDailyContractsHook(
  hook: (next: DailyContractsCloudState) => void
): void {
  cloudDailyContractsHook = hook;
}

export function getDailyContractsSnapshot(): DailyContractsSnapshot {
  return buildSnapshot();
}

export function subscribeDailyContracts(
  listener: (snap: DailyContractsSnapshot) => void
): () => void {
  listeners.add(listener);
  listener(buildSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function applyCloudDailyContractsSnapshot(
  remote: Partial<DailyContractsCloudState> | null | undefined
): DailyContractsCloudState {
  ensureCurrentDay();
  const merged = mergeDailyContractsStates(currentState, remote);
  const changed =
    merged.dayKey !== currentState.dayKey ||
    merged.kills !== currentState.kills ||
    merged.headshots !== currentState.headshots ||
    merged.objectives !== currentState.objectives ||
    merged.matchesWon !== currentState.matchesWon ||
    merged.claimedIds.length !== currentState.claimedIds.length ||
    merged.claimedIds.some((id) => !currentState.claimedIds.includes(id));

  if (changed) {
    isApplyingRemoteContracts = true;
    try {
      currentState = merged;
      persistState();
      emit();
    } finally {
      isApplyingRemoteContracts = false;
    }
  }
  return buildSnapshot().state;
}

export function recordDailyContractProgress(delta: {
  kills?: number;
  headshots?: number;
  bombsPlanted?: number;
  matchesWon?: number;
}): DailyContractsCloudState {
  ensureCurrentDay();
  if (!canGrantMatchProgressionRewards()) {
    return buildSnapshot().state;
  }

  const killsInc = Math.max(0, Math.floor(delta.kills || 0));
  const headshotsInc = Math.max(0, Math.floor(delta.headshots || 0));
  const winsInc = Math.max(0, Math.floor(delta.matchesWon || 0));
  const objInc = Math.max(0, Math.floor(delta.bombsPlanted || 0)) + winsInc;

  if (killsInc === 0 && headshotsInc === 0 && winsInc === 0 && objInc === 0) {
    return buildSnapshot().state;
  }

  currentState = {
    ...currentState,
    kills: clampCount(currentState.kills + killsInc),
    headshots: clampCount(currentState.headshots + headshotsInc),
    objectives: clampCount(currentState.objectives + objInc),
    matchesWon: clampCount(currentState.matchesWon + winsInc),
  };
  persistState();
  // Emit to UI without triggering a duplicate cloud push when called from recordCombatTelemetryDelta
  const snap = buildSnapshot();
  listeners.forEach((fn) => fn(snap));
  return snap.state;
}

export function claimDailyContractReward(
  contractId: string
): { ok: boolean; xp: number; cash: number } {
  const snap = buildSnapshot();
  const contract = snap.contracts.find((c) => c.id === contractId);
  if (!contract || !contract.canClaim) {
    return { ok: false, xp: 0, cash: 0 };
  }

  currentState = {
    ...currentState,
    claimedIds: [...currentState.claimedIds, contract.id],
  };
  persistState();
  emit();

  // Grant progression rewards through canonical rank/cash pipeline (syncs to Firestore)
  savePlayerXp(loadSavedPlayerXp() + contract.rewardXp);
  addPlayerCash(contract.rewardCash);

  return {
    ok: true,
    xp: contract.rewardXp,
    cash: contract.rewardCash,
  };
}

export function resetDailyContractsLocal(): DailyContractsCloudState {
  isApplyingRemoteContracts = true;
  try {
    currentState = createEmptyDailyContractsState();
    persistState();
    const snap = buildSnapshot();
    listeners.forEach((fn) => fn(snap));
    return snap.state;
  } finally {
    isApplyingRemoteContracts = false;
  }
}
