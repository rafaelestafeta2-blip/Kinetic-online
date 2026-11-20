import { WeaponId } from '../types/game';
import { addPlayerCash, loadSavedPlayerXp, savePlayerXp } from './ranks';

export const VIP_PASS_DIAMOND_PRICE = 800;
export const VIP_PASS_DURATION_DAYS = 30;
export const VIP_XP_MULTIPLIER = 1.5;
export const VIP_CASH_MULTIPLIER = 1.25;

export interface DiamondStorePack {
  id: string;
  sku: string;
  diamonds: number;
  bonusDiamonds: number;
  priceBrlCents: number;
  priceLabel: string;
  badge?: string;
}

export const DIAMOND_STORE_PACKS: DiamondStorePack[] = [
  {
    id: 'pack_400',
    sku: 'kinetic_diamonds_400',
    diamonds: 400,
    bonusDiamonds: 0,
    priceBrlCents: 990,
    priceLabel: 'R$ 9,90',
  },
  {
    id: 'pack_800',
    sku: 'kinetic_diamonds_800',
    diamonds: 800,
    bonusDiamonds: 80,
    priceBrlCents: 1990,
    priceLabel: 'R$ 19,90',
    badge: 'IDEAL · PASSE VIP',
  },
  {
    id: 'pack_1800',
    sku: 'kinetic_diamonds_1800',
    diamonds: 1800,
    bonusDiamonds: 250,
    priceBrlCents: 3990,
    priceLabel: 'R$ 39,90',
    badge: 'POPULAR',
  },
  {
    id: 'pack_4000',
    sku: 'kinetic_diamonds_4000',
    diamonds: 4000,
    bonusDiamonds: 800,
    priceBrlCents: 7990,
    priceLabel: 'R$ 79,90',
    badge: 'MELHOR CUSTO',
  },
];

export interface MonthlyVipWeaponSpec {
  weaponId: WeaponId;
  weaponName: string;
  category: string;
  caliber: string;
  skinId: string;
  skinName: string;
  editionLabel: string;
  highlightNote: string;
}

const MONTHLY_VIP_ROTATION: MonthlyVipWeaponSpec[] = [
  {
    weaponId: 'SNIPER_HEAVY',
    weaponName: 'M200 INTERVENTION',
    category: 'Sniper Anti-Material',
    caliber: '.408 CheyTac',
    skinId: 'camo_carbon_gold',
    skinName: 'Carbono & Ouro Elite',
    editionLabel: 'EDIÇÃO VIP OURO',
    highlightNote: 'Desbloqueio imediato no Arsenal 3D + acabamento Carbono & Ouro.',
  },
  {
    weaponId: 'AK47_RIFLE',
    weaponName: 'AK-47 COMANDO',
    category: 'Fuzil de Assalto',
    caliber: '7.62x39mm',
    skinId: 'camo_crimson_ops',
    skinName: 'Rubro Blackthorn',
    editionLabel: 'EDIÇÃO VIP RUBRO',
    highlightNote: 'Alto impacto por disparo + pintura exclusiva Rubro Blackthorn.',
  },
  {
    weaponId: 'L49_LMG',
    weaponName: 'LMG PESADA 100R',
    category: 'Metralhadora Leve',
    caliber: '5.56x45mm',
    skinId: 'camo_carbon_gold',
    skinName: 'Carbono & Ouro Elite',
    editionLabel: 'EDIÇÃO VIP SUPRESSÃO',
    highlightNote: 'Carregador de 100 disparos liberado + acabamento Carbono & Ouro.',
  },
  {
    weaponId: 'SHOTGUN_SPAS',
    weaponName: 'SPAS-12 TÁTICA 12GA',
    category: 'Escopeta Semiautomática',
    caliber: 'Calibre 12',
    skinId: 'auto_shotgun_05',
    skinName: 'Camuflagem Urbana Ártica',
    editionLabel: 'EDIÇÃO VIP BREACHER',
    highlightNote: 'Cadência semiautomática CQB + camuflagem exclusiva Ártica.',
  },
  {
    weaponId: 'SNIPER_BOLT',
    weaponName: 'KAR98K PRECISÃO',
    category: 'Fuzil de Precisão',
    caliber: '7.92x57mm',
    skinId: 'camo_carbon_gold',
    skinName: 'Carbono & Ouro Elite',
    editionLabel: 'EDIÇÃO VIP ATIRADOR',
    highlightNote: 'Ferrolho rápido de precisão + acabamento Carbono & Ouro.',
  },
  {
    weaponId: 'SMG_MP5',
    weaponName: 'MPS5 TÁTICA 9MM',
    category: 'Submetralhadora',
    caliber: '9x19mm',
    skinId: 'camo_crimson_ops',
    skinName: 'Rubro Blackthorn',
    editionLabel: 'EDIÇÃO VIP CQB',
    highlightNote: 'Mobilidade máxima em curta distância + acabamento Rubro.',
  },
];

export interface BattlePassTierDefinition {
  tier: number;
  requiredXp: number;
  freeLabel: string;
  freeCash: number;
  freeXp: number;
  vipLabel: string;
  vipCash: number;
  vipXp: number;
  isWeaponTier?: boolean;
}

export const BATTLE_PASS_TIERS: BattlePassTierDefinition[] = [
  {
    tier: 1,
    requiredXp: 0,
    freeLabel: '+200 K-Money',
    freeCash: 200,
    freeXp: 0,
    vipLabel: 'Arma do Mês + Skin + +50% XP',
    vipCash: 500,
    vipXp: 0,
    isWeaponTier: true,
  },
  {
    tier: 2,
    requiredXp: 800,
    freeLabel: '+250 K-Money',
    freeCash: 250,
    freeXp: 0,
    vipLabel: '+600 K-Money + 250 XP',
    vipCash: 600,
    vipXp: 250,
  },
  {
    tier: 3,
    requiredXp: 1800,
    freeLabel: '+150 XP Bônus',
    freeCash: 0,
    freeXp: 150,
    vipLabel: '+750 K-Money + 300 XP',
    vipCash: 750,
    vipXp: 300,
  },
  {
    tier: 4,
    requiredXp: 3200,
    freeLabel: '+350 K-Money',
    freeCash: 350,
    freeXp: 0,
    vipLabel: '+900 K-Money + 400 XP',
    vipCash: 900,
    vipXp: 400,
  },
  {
    tier: 5,
    requiredXp: 5000,
    freeLabel: '+450 K-Money',
    freeCash: 450,
    freeXp: 0,
    vipLabel: '+1.200 K-Money + 500 XP',
    vipCash: 1200,
    vipXp: 500,
  },
  {
    tier: 6,
    requiredXp: 7200,
    freeLabel: '+250 XP Bônus',
    freeCash: 0,
    freeXp: 250,
    vipLabel: '+1.350 K-Money + 600 XP',
    vipCash: 1350,
    vipXp: 600,
  },
  {
    tier: 7,
    requiredXp: 9800,
    freeLabel: '+550 K-Money',
    freeCash: 550,
    freeXp: 0,
    vipLabel: '+1.500 K-Money + 750 XP',
    vipCash: 1500,
    vipXp: 750,
  },
  {
    tier: 8,
    requiredXp: 12600,
    freeLabel: '+650 K-Money',
    freeCash: 650,
    freeXp: 0,
    vipLabel: '+1.750 K-Money + 900 XP',
    vipCash: 1750,
    vipXp: 900,
  },
  {
    tier: 9,
    requiredXp: 15500,
    freeLabel: '+400 XP Bônus',
    freeCash: 0,
    freeXp: 400,
    vipLabel: '+2.000 K-Money + 1.100 XP',
    vipCash: 2000,
    vipXp: 1100,
  },
  {
    tier: 10,
    requiredXp: 19000,
    freeLabel: '+1.000 K-Money',
    freeCash: 1000,
    freeXp: 0,
    vipLabel: '+3.000 K-Money + 1.500 XP',
    vipCash: 3000,
    vipXp: 1500,
  },
];

export interface VipBattlePassCloudState {
  activeUntilIso: string;
  monthKey: string;
  weaponOfMonthId: WeaponId;
  weaponOfMonthSkinId: string;
  xpMultiplier: number;
  cashMultiplier: number;
  claimedFreeTiers: number[];
  claimedVipTiers: number[];
}

const STORAGE_KEY = 'kinetic_vip_battlepass_v1';

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getWeaponOfTheMonth(monthKey = getCurrentMonthKey()): MonthlyVipWeaponSpec {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr) || 2026;
  const m = Number(mStr) || 1;
  const index = Math.abs(y * 12 + (m - 1)) % MONTHLY_VIP_ROTATION.length;
  return MONTHLY_VIP_ROTATION[index];
}

export function createDefaultVipBattlePassState(
  monthKey = getCurrentMonthKey()
): VipBattlePassCloudState {
  const wom = getWeaponOfTheMonth(monthKey);
  return {
    activeUntilIso: '',
    monthKey,
    weaponOfMonthId: wom.weaponId,
    weaponOfMonthSkinId: wom.skinId,
    xpMultiplier: 1.0,
    cashMultiplier: 1.0,
    claimedFreeTiers: [],
    claimedVipTiers: [],
  };
}

function sanitizeTierList(arr: unknown): number[] {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr
        .map((n) => Math.floor(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 20)
    )
  )
    .sort((a, b) => a - b)
    .slice(0, 20);
}

export function sanitizeVipBattlePassState(
  raw: Partial<VipBattlePassCloudState> | null | undefined
): VipBattlePassCloudState {
  const currentMonth = getCurrentMonthKey();
  const currentWom = getWeaponOfTheMonth(currentMonth);
  if (!raw || typeof raw !== 'object') {
    return createDefaultVipBattlePassState(currentMonth);
  }
  const activeUntilIso =
    typeof raw.activeUntilIso === 'string' && raw.activeUntilIso.length >= 10
      ? raw.activeUntilIso.slice(0, 40)
      : '';
  const activeMs = activeUntilIso ? Date.parse(activeUntilIso) : 0;
  const isActive = Number.isFinite(activeMs) && activeMs > Date.now();
  const sameMonth = raw.monthKey === currentMonth;

  return {
    activeUntilIso: isActive ? activeUntilIso : '',
    monthKey: currentMonth,
    weaponOfMonthId: (isActive && raw.weaponOfMonthId) || currentWom.weaponId,
    weaponOfMonthSkinId: (isActive && raw.weaponOfMonthSkinId) || currentWom.skinId,
    xpMultiplier: isActive ? VIP_XP_MULTIPLIER : 1.0,
    cashMultiplier: isActive ? VIP_CASH_MULTIPLIER : 1.0,
    claimedFreeTiers: sameMonth ? sanitizeTierList(raw.claimedFreeTiers) : [],
    claimedVipTiers: sameMonth ? sanitizeTierList(raw.claimedVipTiers) : [],
  };
}

export function mergeVipBattlePassStates(
  localRaw: Partial<VipBattlePassCloudState> | null | undefined,
  remoteRaw: Partial<VipBattlePassCloudState> | null | undefined
): VipBattlePassCloudState {
  const local = sanitizeVipBattlePassState(localRaw);
  const remote = sanitizeVipBattlePassState(remoteRaw);
  const localUntil = local.activeUntilIso ? Date.parse(local.activeUntilIso) : 0;
  const remoteUntil = remote.activeUntilIso ? Date.parse(remote.activeUntilIso) : 0;
  const bestActiveUntil =
    remoteUntil >= localUntil ? remote.activeUntilIso : local.activeUntilIso;
  const isActive = Boolean(bestActiveUntil && Date.parse(bestActiveUntil) > Date.now());
  const currentMonth = getCurrentMonthKey();
  const wom = getWeaponOfTheMonth(currentMonth);

  return {
    activeUntilIso: isActive ? bestActiveUntil : '',
    monthKey: currentMonth,
    weaponOfMonthId: isActive
      ? remoteUntil >= localUntil
        ? remote.weaponOfMonthId
        : local.weaponOfMonthId
      : wom.weaponId,
    weaponOfMonthSkinId: isActive
      ? remoteUntil >= localUntil
        ? remote.weaponOfMonthSkinId
        : local.weaponOfMonthSkinId
      : wom.skinId,
    xpMultiplier: isActive ? VIP_XP_MULTIPLIER : 1.0,
    cashMultiplier: isActive ? VIP_CASH_MULTIPLIER : 1.0,
    claimedFreeTiers: Array.from(
      new Set([...local.claimedFreeTiers, ...remote.claimedFreeTiers])
    )
      .sort((a, b) => a - b)
      .slice(0, 20),
    claimedVipTiers: Array.from(
      new Set([...local.claimedVipTiers, ...remote.claimedVipTiers])
    )
      .sort((a, b) => a - b)
      .slice(0, 20),
  };
}

function loadFromStorage(): VipBattlePassCloudState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultVipBattlePassState();
    return sanitizeVipBattlePassState(JSON.parse(raw) as Partial<VipBattlePassCloudState>);
  } catch {
    return createDefaultVipBattlePassState();
  }
}

let currentState: VipBattlePassCloudState = loadFromStorage();
let isApplyingRemoteVip = false;
let cloudVipClaimHook: ((next: VipBattlePassCloudState) => void) | null = null;
const listeners = new Set<(state: VipBattlePassCloudState) => void>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  } catch {
    // Ignore storage quota errors
  }
}

function emit(pushToCloud = false): void {
  const snap: VipBattlePassCloudState = {
    ...currentState,
    claimedFreeTiers: [...currentState.claimedFreeTiers],
    claimedVipTiers: [...currentState.claimedVipTiers],
  };
  listeners.forEach((fn) => fn(snap));
  if (pushToCloud && !isApplyingRemoteVip && cloudVipClaimHook) {
    cloudVipClaimHook(snap);
  }
}

export function registerCloudVipClaimHook(
  hook: (next: VipBattlePassCloudState) => void
): void {
  cloudVipClaimHook = hook;
}

export function getVipBattlePassState(): VipBattlePassCloudState {
  currentState = sanitizeVipBattlePassState(currentState);
  return {
    ...currentState,
    claimedFreeTiers: [...currentState.claimedFreeTiers],
    claimedVipTiers: [...currentState.claimedVipTiers],
  };
}

export function subscribeVipBattlePass(
  listener: (state: VipBattlePassCloudState) => void
): () => void {
  listeners.add(listener);
  listener(getVipBattlePassState());
  return () => {
    listeners.delete(listener);
  };
}

export function isVipBattlePassActive(
  state: VipBattlePassCloudState = currentState
): boolean {
  if (!state.activeUntilIso) return false;
  const until = Date.parse(state.activeUntilIso);
  return Number.isFinite(until) && until > Date.now();
}

export function getVipRemainingDays(
  state: VipBattlePassCloudState = currentState
): number {
  if (!isVipBattlePassActive(state)) return 0;
  const diffMs = Date.parse(state.activeUntilIso) - Date.now();
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function getActiveVipXpMultiplier(): number {
  return isVipBattlePassActive(currentState) ? VIP_XP_MULTIPLIER : 1.0;
}

export function getActiveVipCashMultiplier(): number {
  return isVipBattlePassActive(currentState) ? VIP_CASH_MULTIPLIER : 1.0;
}

export function applyCloudVipBattlePassSnapshot(
  remote: Partial<VipBattlePassCloudState> | null | undefined
): VipBattlePassCloudState {
  const merged = mergeVipBattlePassStates(currentState, remote);
  isApplyingRemoteVip = true;
  try {
    currentState = merged;
    persist();
    emit(false);
  } finally {
    isApplyingRemoteVip = false;
  }
  return getVipBattlePassState();
}

export function buildActivatedVipState(): VipBattlePassCloudState {
  const now = Date.now();
  const baseMs =
    isVipBattlePassActive(currentState) && Date.parse(currentState.activeUntilIso) > now
      ? Date.parse(currentState.activeUntilIso)
      : now;
  const nextUntil = new Date(
    baseMs + VIP_PASS_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const monthKey = getCurrentMonthKey();
  const wom = getWeaponOfTheMonth(monthKey);

  return {
    ...getVipBattlePassState(),
    activeUntilIso: nextUntil,
    monthKey,
    weaponOfMonthId: wom.weaponId,
    weaponOfMonthSkinId: wom.skinId,
    xpMultiplier: VIP_XP_MULTIPLIER,
    cashMultiplier: VIP_CASH_MULTIPLIER,
  };
}

export function commitActivatedVipStateLocal(next: VipBattlePassCloudState): void {
  isApplyingRemoteVip = true;
  try {
    currentState = sanitizeVipBattlePassState(next);
    persist();
    emit(false);
  } finally {
    isApplyingRemoteVip = false;
  }
}

export function claimBattlePassTierReward(
  tierNumber: number,
  track: 'FREE' | 'VIP',
  playerXp = loadSavedPlayerXp()
): { ok: boolean; xp: number; cash: number } {
  const tier = BATTLE_PASS_TIERS.find((t) => t.tier === tierNumber);
  if (!tier) return { ok: false, xp: 0, cash: 0 };
  if (playerXp < tier.requiredXp) return { ok: false, xp: 0, cash: 0 };

  const state = getVipBattlePassState();
  if (track === 'VIP' && !isVipBattlePassActive(state)) {
    return { ok: false, xp: 0, cash: 0 };
  }

  if (track === 'FREE') {
    if (state.claimedFreeTiers.includes(tierNumber)) {
      return { ok: false, xp: 0, cash: 0 };
    }
    currentState = {
      ...state,
      claimedFreeTiers: [...state.claimedFreeTiers, tierNumber].sort((a, b) => a - b),
    };
    persist();
    emit(true);
    if (tier.freeXp > 0) savePlayerXp(loadSavedPlayerXp() + tier.freeXp);
    if (tier.freeCash > 0) addPlayerCash(tier.freeCash);
    return { ok: true, xp: tier.freeXp, cash: tier.freeCash };
  }

  if (state.claimedVipTiers.includes(tierNumber)) {
    return { ok: false, xp: 0, cash: 0 };
  }
  currentState = {
    ...state,
    claimedVipTiers: [...state.claimedVipTiers, tierNumber].sort((a, b) => a - b),
  };
  persist();
  emit(true);
  if (tier.vipXp > 0) savePlayerXp(loadSavedPlayerXp() + tier.vipXp);
  if (tier.vipCash > 0) addPlayerCash(tier.vipCash);
  return { ok: true, xp: tier.vipXp, cash: tier.vipCash };
}
