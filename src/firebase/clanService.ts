import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import {
  ClanEmblemId,
  CLAN_EMBLEM_CATALOG,
} from '../components/ClanEmblemIcons';
import {
  addPlayerCash,
  loadSavedPlayerXp,
  savePlayerXp,
} from '../progression/ranks';
import { WeaponId } from '../types/game';
import {
  grantWeaponSkinDirect,
} from '../progression/loadoutSystem';
import {
  auth,
  db,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
} from './firebaseClient';
import { fetchRosterLockStatus } from '../services/championshipClient';
import {
  getCloudSyncState,
  subscribePlayerProfile,
  updatePlayerClanCloudMeta,
} from './playerCloudSync';

export const MAX_CLAN_MEMBERS = 7;

export type ClanMemberRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export interface ClanMemberEntry {
  uid: string;
  callsign: string;
  role: ClanMemberRole;
  rankLevel: number;
  mmr: number;
  avatarDataUrl: string;
  contributedXp: number;
  joinedAt: string;
}

export interface ClanDailyMissionDef {
  id: string;
  title: string;
  description: string;
  target: number;
  rewardClanXp: number;
  rewardPlayerCash: number;
  rewardClanTokens: number;
  icon: string;
}

export const CLAN_DAILY_MISSIONS: ClanDailyMissionDef[] = [
  {
    id: 'clan_matches_3',
    title: 'PATRULHA DO CLÃ',
    description: 'Jogar 3 partidas online representando o clã',
    target: 3,
    rewardClanXp: 450,
    rewardPlayerCash: 1200,
    rewardClanTokens: 45,
    icon: '⚔️',
  },
  {
    id: 'clan_kills_25',
    title: 'CAÇADA ALFA',
    description: 'Acumular 25 eliminações com membros do clã',
    target: 25,
    rewardClanXp: 650,
    rewardPlayerCash: 1800,
    rewardClanTokens: 65,
    icon: '🎯',
  },
  {
    id: 'clan_headshots_10',
    title: 'PRECISÃO CIRÚRGICA',
    description: 'Conseguir 10 Headshots em partidas oficiais',
    target: 10,
    rewardClanXp: 550,
    rewardPlayerCash: 1500,
    rewardClanTokens: 55,
    icon: '💀',
  },
  {
    id: 'clan_wins_2',
    title: 'DOMÍNIO TERRITORIAL',
    description: 'Vencer 2 partidas 5v5 com a tag do clã ativa',
    target: 2,
    rewardClanXp: 850,
    rewardPlayerCash: 2500,
    rewardClanTokens: 90,
    icon: '🏆',
  },
];

export interface ClanStoreOffer {
  id: string;
  name: string;
  subtitle: string;
  requiredClanLevel: number;
  costClanTokens: number;
  rewardType: 'CASH' | 'XP' | 'SKIN';
  rewardAmount?: number;
  weaponId?: WeaponId;
  skinId?: string;
  badgeText: string;
}

export const CLAN_STORE_OFFERS: ClanStoreOffer[] = [
  {
    id: 'clan_offer_cash_pack',
    name: 'SUPRIMENTO DE GUERRA DO CLÃ',
    subtitle: '+$5.000 K-Money imediato para o arsenal',
    requiredClanLevel: 1,
    costClanTokens: 80,
    rewardType: 'CASH',
    rewardAmount: 5000,
    badgeText: '$5.000 CASH',
  },
  {
    id: 'clan_offer_xp_boost',
    name: 'MANUAL DE COMBATE ALFA',
    subtitle: '+2.500 XP de Patente Militar instantâneo',
    requiredClanLevel: 2,
    costClanTokens: 110,
    rewardType: 'XP',
    rewardAmount: 2500,
    badgeText: '+2.500 XP',
  },
  {
    id: 'clan_offer_m4_crimson',
    name: 'M4 TÁTICA // RUBI DO CLÃ',
    subtitle: 'Skin exclusiva Crimson Pulse para M4 Tática',
    requiredClanLevel: 3,
    costClanTokens: 180,
    rewardType: 'SKIN',
    weaponId: 'M4_CARBINE',
    skinId: 'crimson_pulse',
    badgeText: 'SKIN ÉPICA',
  },
  {
    id: 'clan_offer_ak12_cobalt',
    name: 'AK-200 // GUARDA IMPERIAL',
    subtitle: 'Skin Cyber Cobalt de elite para o clã',
    requiredClanLevel: 5,
    costClanTokens: 240,
    rewardType: 'SKIN',
    weaponId: 'AK12_RIFLE',
    skinId: 'cyber_cobalt',
    badgeText: 'SKIN CLÃ NV.5',
  },
  {
    id: 'clan_offer_scar_gold',
    name: 'SCAR-L // OURO SOBERANO',
    subtitle: 'Acabamento Gold Imperial para veteranos do clã',
    requiredClanLevel: 7,
    costClanTokens: 350,
    rewardType: 'SKIN',
    weaponId: 'S_MILITARY',
    skinId: 'gold_imperial',
    badgeText: 'LENDÁRIA NV.7',
  },
];

export interface ClanDocument {
  clanId: string;
  name: string;
  tag: string;
  emblemId: ClanEmblemId;
  motto: string;
  ownerUid: string;
  ownerCallsign: string;
  clanXp: number;
  clanLevel: number;
  memberUids: string[];
  members: Record<string, ClanMemberEntry>;
  dailyState: {
    dayKey: string;
    progress: Record<string, number>;
    claimedBy: Record<string, string[]>;
  };
  updatedAtMs: number;
  createdAt: string;
}

export interface ClanInviteEntry {
  clanId: string;
  clanName: string;
  clanTag: string;
  emblemId: ClanEmblemId;
  fromUid: string;
  fromCallsign: string;
  sentAtMs: number;
}

export interface ClanServiceState {
  myClan: ClanDocument | null;
  invites: ClanInviteEntry[];
  leaderboard: ClanDocument[];
  clanTokens: number;
  purchasedOfferIds: string[];
  isLoading: boolean;
}

const LOCAL_CLAN_CACHE_KEY = 'kinetic_clan_state_v1';
const LOCAL_CLAN_TOKENS_KEY = 'kinetic_clan_tokens_v1';

export function computeClanLevelFromXp(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  const safeXp = Math.max(0, Math.floor(xp || 0));
  const step = 2500;
  const level = Math.min(50, Math.floor(safeXp / step) + 1);
  const base = (level - 1) * step;
  const currentLevelXp = safeXp - base;
  const nextLevelXp = step;
  const progressPct = Math.min(
    100,
    Math.max(0, Math.round((currentLevelXp / nextLevelXp) * 100))
  );
  return { level, currentLevelXp, nextLevelXp, progressPct };
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

function normalizeClanId(rawName: string): string {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function loadLocalTokensState(): {
  clanTokens: number;
  purchasedOfferIds: string[];
} {
  try {
    const raw = localStorage.getItem(LOCAL_CLAN_TOKENS_KEY);
    if (!raw) return { clanTokens: 0, purchasedOfferIds: [] };
    const parsed = JSON.parse(raw);
    return {
      clanTokens: Math.max(0, Number(parsed.clanTokens) || 0),
      purchasedOfferIds: Array.isArray(parsed.purchasedOfferIds)
        ? parsed.purchasedOfferIds
        : [],
    };
  } catch {
    return { clanTokens: 0, purchasedOfferIds: [] };
  }
}

function saveLocalTokensState(clanTokens: number, purchasedOfferIds: string[]): void {
  try {
    localStorage.setItem(
      LOCAL_CLAN_TOKENS_KEY,
      JSON.stringify({ clanTokens, purchasedOfferIds })
    );
  } catch {
    // ignore storage errors
  }
}

function loadCachedClan(): ClanDocument | null {
  try {
    const raw = localStorage.getItem(LOCAL_CLAN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ClanDocument;
    if (parsed && parsed.clanId && parsed.name) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedClan(clan: ClanDocument | null): void {
  try {
    if (!clan) {
      localStorage.removeItem(LOCAL_CLAN_CACHE_KEY);
    } else {
      localStorage.setItem(LOCAL_CLAN_CACHE_KEY, JSON.stringify(clan));
    }
  } catch {
    // ignore
  }
}

const initialTokenData = loadLocalTokensState();

let currentState: ClanServiceState = {
  myClan: loadCachedClan(),
  invites: [],
  leaderboard: [],
  clanTokens: initialTokenData.clanTokens,
  purchasedOfferIds: initialTokenData.purchasedOfferIds,
  isLoading: false,
};

type ClanSubscriber = (state: ClanServiceState) => void;
const subscribers = new Set<ClanSubscriber>();
let clanDocUnsub: Unsubscribe | null = null;

function emitClanState(): void {
  const snap: ClanServiceState = {
    ...currentState,
    myClan: currentState.myClan ? { ...currentState.myClan } : null,
    invites: [...currentState.invites],
    leaderboard: [...currentState.leaderboard],
    purchasedOfferIds: [...currentState.purchasedOfferIds],
  };
  subscribers.forEach((fn) => fn(snap));
}

export function getClanServiceState(): ClanServiceState {
  return currentState;
}

export function getActivePlayerClanSummary(): {
  clanId?: string;
  clanName?: string;
  clanTag?: string;
  clanEmblemId?: ClanEmblemId;
  clanLevel?: number;
} {
  const c = currentState.myClan;
  if (!c) return {};
  return {
    clanId: c.clanId,
    clanName: c.name,
    clanTag: c.tag,
    clanEmblemId: c.emblemId,
    clanLevel: c.clanLevel,
  };
}

export function subscribeClanService(cb: ClanSubscriber): () => void {
  subscribers.add(cb);
  cb(currentState);
  return () => {
    subscribers.delete(cb);
  };
}

function attachClanListener(clanId: string): void {
  if (clanDocUnsub) {
    clanDocUnsub();
    clanDocUnsub = null;
  }
  if (!clanId) return;

  const ref = doc(db, 'clans', clanId);
  clanDocUnsub = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        currentState.myClan = null;
        saveCachedClan(null);
        emitClanState();
        return;
      }
      const data = snap.data() as ClanDocument;
      const myUid = auth.currentUser?.uid || getCloudSyncState().profile.uid;
      if (myUid && data.members && !data.members[myUid]) {
        // Player was removed from clan
        currentState.myClan = null;
        saveCachedClan(null);
        emitClanState();
        return;
      }
      currentState.myClan = data;
      saveCachedClan(data);
      emitClanState();
    },
    (err) => {
      if (!isFirestoreOfflineError(err)) {
        handleFirestoreError(err, OperationType.GET, `clans/${clanId}`);
      }
    }
  );
}

async function hydrateRealClanForUser(uid: string, preferredClanId?: string): Promise<void> {
  if (!uid) return;
  try {
    // 1. Direct O(1) lookup via cloud profile clanId or local cache
    const candidateIds = Array.from(
      new Set(
        [
          preferredClanId,
          getCloudSyncState().profile.clanId,
          currentState.myClan?.clanId,
        ].filter((id): id is string => typeof id === 'string' && id.length >= 3)
      )
    );

    for (const candidateId of candidateIds) {
      const ref = doc(db, 'clans', candidateId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as ClanDocument;
        if (data.members && data.members[uid]) {
          currentState.myClan = data;
          saveCachedClan(data);
          attachClanListener(data.clanId);
          emitClanState();
          if (getCloudSyncState().profile.clanId !== data.clanId) {
            void updatePlayerClanCloudMeta({ clanId: data.clanId });
          }
          return;
        }
      }
    }

    // 2. Fallback query across /clans where memberUids contains uid (authorized by firestore.rules)
    const q = query(
      collection(db, 'clans'),
      where('memberUids', 'array-contains', uid),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data() as ClanDocument;
      if (data.members && data.members[uid]) {
        currentState.myClan = data;
        saveCachedClan(data);
        attachClanListener(data.clanId);
        emitClanState();
        if (getCloudSyncState().profile.clanId !== data.clanId) {
          void updatePlayerClanCloudMeta({ clanId: data.clanId });
        }
        return;
      }
    }

    currentState.myClan = null;
    saveCachedClan(null);
    emitClanState();
  } catch (err) {
    if (!isFirestoreOfflineError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'clans');
    }
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    if (clanDocUnsub) {
      clanDocUnsub();
      clanDocUnsub = null;
    }
    currentState.myClan = null;
    currentState.leaderboard = [];
    saveCachedClan(null);
    emitClanState();
    return;
  }
  void hydrateRealClanForUser(user.uid);
  void refreshClanLeaderboard();
});

if (typeof window !== 'undefined') {
  window.addEventListener('kinetic:online-combat-delta', (evt: Event) => {
    const detail = (evt as CustomEvent<{
      kills?: number;
      headshots?: number;
      matchesPlayed?: number;
      matchesWon?: number;
    }>).detail;
    if (!detail || !currentState.myClan) return;
    void recordClanMissionActivity({
      matches: detail.matchesPlayed || 0,
      kills: detail.kills || 0,
      headshots: detail.headshots || 0,
      wins: detail.matchesWon || 0,
    });
  });
}

let lastHydratedProfileClanId = '';

subscribePlayerProfile((sync) => {
  // Hydrate cloud-saved clanTokens and purchasedClanOfferIds (survives reinstalls)
  const cloudTokens = Math.max(0, Math.floor(Number(sync.profile.clanTokens) || 0));
  const cloudOffers = Array.isArray(sync.profile.purchasedClanOfferIds)
    ? sync.profile.purchasedClanOfferIds
    : [];
  const mergedOffers = Array.from(
    new Set([...currentState.purchasedOfferIds, ...cloudOffers])
  );
  if (
    cloudTokens !== currentState.clanTokens ||
    mergedOffers.length !== currentState.purchasedOfferIds.length
  ) {
    currentState.clanTokens = Math.max(currentState.clanTokens, cloudTokens);
    currentState.purchasedOfferIds = mergedOffers;
    saveLocalTokensState(currentState.clanTokens, currentState.purchasedOfferIds);
    emitClanState();
  }

  // If cloud profile arrived with a clanId and we don't have it loaded yet, hydrate it immediately
  const profileClanId = (sync.profile.clanId || '').trim();
  const authUid = auth.currentUser?.uid;
  if (
    authUid &&
    profileClanId.length >= 3 &&
    profileClanId !== lastHydratedProfileClanId &&
    currentState.myClan?.clanId !== profileClanId
  ) {
    lastHydratedProfileClanId = profileClanId;
    void hydrateRealClanForUser(authUid, profileClanId);
  }

  const myClan = currentState.myClan;
  if (!myClan) return;
  const uid = sync.profile.uid;
  if (uid && myClan.members?.[uid]) {
    const member = myClan.members[uid];
    if (
      member.callsign !== sync.profile.callsign ||
      member.rankLevel !== sync.profile.rankLevel
    ) {
      myClan.members[uid] = {
        ...member,
        callsign: sync.profile.callsign,
        rankLevel: sync.profile.rankLevel,
        mmr: sync.profile.mmr || 2450,
        avatarDataUrl: sync.profile.avatarDataUrl || member.avatarDataUrl,
      };
      saveCachedClan(myClan);
      emitClanState();
    }
  }
});

/**
 * Creates a brand new Clan enforcing unique name (via normalized `clanId` document ID)
 * and max 7 members limit.
 */
export async function createNewClan(params: {
  name: string;
  tag: string;
  emblemId: ClanEmblemId;
  motto?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const cleanName = params.name.trim().replace(/\s+/g, ' ');
  if (cleanName.length < 3 || cleanName.length > 18) {
    return {
      ok: false,
      error: 'O nome do clã deve ter entre 3 e 18 caracteres.',
    };
  }
  if (!/^[A-Za-z0-9 _\-]+$/.test(cleanName)) {
    return {
      ok: false,
      error: 'Use apenas letras, números, espaços ou hífen no nome do clã.',
    };
  }

  const clanId = normalizeClanId(cleanName);
  if (clanId.length < 3) {
    return {
      ok: false,
      error: 'O nome do clã precisa conter ao menos 3 letras ou números.',
    };
  }

  const cleanTag = (params.tag.trim() || cleanName.slice(0, 4))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  if (cleanTag.length < 2) {
    return {
      ok: false,
      error: 'A TAG do clã deve ter de 2 a 4 letras/números.',
    };
  }

  const validEmblem = CLAN_EMBLEM_CATALOG.some((e) => e.id === params.emblemId)
    ? params.emblemId
    : 'alpha_wolf';

  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: 'Faça login com sua conta Google para fundar um clã salvo permanentemente na nuvem.',
    };
  }

  const sync = getCloudSyncState();
  const uid = user.uid;
  const callsign = (sync.profile.callsign || 'OPERADOR').slice(0, 32);
  const nowIso = new Date().toISOString();

  const leaderEntry: ClanMemberEntry = {
    uid,
    callsign,
    role: 'LEADER',
    rankLevel: sync.profile.rankLevel || 1,
    mmr: sync.profile.mmr || 2450,
    avatarDataUrl:
      sync.profile.avatarDataUrl && sync.profile.avatarDataUrl.length <= 45000
        ? sync.profile.avatarDataUrl
        : '',
    contributedXp: 0,
    joinedAt: nowIso,
  };

  const newClan: ClanDocument = {
    clanId,
    name: cleanName,
    tag: cleanTag,
    emblemId: validEmblem,
    motto: (params.motto || 'Honra, Tática e Supremacia Competitiva.').slice(0, 80),
    ownerUid: uid,
    ownerCallsign: callsign,
    clanXp: 0,
    clanLevel: 1,
    memberUids: [uid],
    members: {
      [uid]: leaderEntry,
    },
    dailyState: {
      dayKey: getTodayKey(),
      progress: {},
      claimedBy: {},
    },
    updatedAtMs: Date.now(),
    createdAt: nowIso,
  };

  try {
    const ref = doc(db, 'clans', clanId);
    await runTransaction(db, async (tx) => {
      const existingSnap = await tx.get(ref);
      if (existingSnap.exists()) {
        throw new Error('CLAN_NAME_TAKEN');
      }
      tx.set(ref, newClan);
    });
    attachClanListener(clanId);
  } catch (err) {
    if (err instanceof Error && err.message === 'CLAN_NAME_TAKEN') {
      return {
        ok: false,
        error: `Já existe um clã chamado "${cleanName}". Escolha um nome único!`,
      };
    }
    if (isFirestoreOfflineError(err)) {
      return {
        ok: false,
        error: 'Sem conexão com o servidor. Conecte-se à internet para registrar seu clã com nome único.',
      };
    }
    handleFirestoreError(err, OperationType.CREATE, `clans/${clanId}`);
    return {
      ok: false,
      error: 'Não foi possível registrar o clã no servidor. Tente outro nome.',
    };
  }

  currentState.myClan = newClan;
  lastHydratedProfileClanId = clanId;
  saveCachedClan(newClan);
  emitClanState();
  await updatePlayerClanCloudMeta({ clanId });
  void refreshClanLeaderboard();
  return { ok: true };
}

/**
 * Updates clan emblem or motto (Owner only).
 */
export async function updateClanBranding(params: {
  emblemId: ClanEmblemId;
  motto: string;
}): Promise<{ ok: boolean; error?: string }> {
  const clan = currentState.myClan;
  if (!clan) return { ok: false, error: 'Você não está em um clã.' };
  const uid = auth.currentUser?.uid || getCloudSyncState().profile.uid;
  if (clan.ownerUid !== uid) {
    return { ok: false, error: 'Apenas o Dono do Clã pode alterar o brasão.' };
  }

  const updated: ClanDocument = {
    ...clan,
    emblemId: params.emblemId,
    motto: params.motto.trim().slice(0, 80),
    updatedAtMs: Date.now(),
  };

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'clans', clan.clanId), updated);
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `clans/${clan.clanId}`);
      }
    }
  }

  currentState.myClan = updated;
  saveCachedClan(updated);
  emitClanState();
  return { ok: true };
}

/**
 * Adds or invites a friend into the Clan (Owner only, max 7 members).
 */
export async function addMemberToClanByOwner(friend: {
  uid: string;
  callsign: string;
  rankLevel: number;
  avatarDataUrl?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const clan = currentState.myClan;
  if (!clan) return { ok: false, error: 'Você não possui um clã ativo.' };

  const myUid = auth.currentUser?.uid || getCloudSyncState().profile.uid;
  if (clan.ownerUid !== myUid) {
    return { ok: false, error: 'Apenas o Dono do Clã pode recrutar membros.' };
  }

  const currentCount = Object.keys(clan.members || {}).length;
  if (currentCount >= MAX_CLAN_MEMBERS) {
    return {
      ok: false,
      error: `Limite máximo atingido (${MAX_CLAN_MEMBERS}/${MAX_CLAN_MEMBERS} membros no clã).`,
    };
  }

  if (clan.members[friend.uid]) {
    return { ok: false, error: `${friend.callsign} já faz parte do clã.` };
  }

  const nowIso = new Date().toISOString();
  const nextMembers: Record<string, ClanMemberEntry> = {
    ...clan.members,
    [friend.uid]: {
      uid: friend.uid,
      callsign: friend.callsign,
      role: 'MEMBER',
      rankLevel: friend.rankLevel || 1,
      mmr: 2450,
      avatarDataUrl:
        friend.avatarDataUrl && friend.avatarDataUrl.length <= 45000
          ? friend.avatarDataUrl
          : '',
      contributedXp: 0,
      joinedAt: nowIso,
    },
  };
  const nextUids = Object.keys(nextMembers);

  const updated: ClanDocument = {
    ...clan,
    memberUids: nextUids,
    members: nextMembers,
    updatedAtMs: Date.now(),
  };

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'clans', clan.clanId), updated);
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `clans/${clan.clanId}`);
      }
    }
  }

  currentState.myClan = updated;
  saveCachedClan(updated);
  emitClanState();
  return { ok: true };
}

/**
 * Kicks / removes a member from the Clan (Owner only).
 */
export async function removeMemberFromClan(
  targetUid: string
): Promise<{ ok: boolean; error?: string }> {
  const clan = currentState.myClan;
  if (!clan) return { ok: false, error: 'Clã não encontrado.' };

  const myUid = auth.currentUser?.uid || getCloudSyncState().profile.uid;
  if (clan.ownerUid !== myUid) {
    return {
      ok: false,
      error: 'Apenas o Dono do Clã pode expulsar integrantes.',
    };
  }
  if (targetUid === clan.ownerUid) {
    return {
      ok: false,
      error: 'O Dono do Clã não pode remover a si mesmo.',
    };
  }
  if (!clan.members[targetUid]) {
    return { ok: false, error: 'Operador não encontrado no clã.' };
  }

  // Roster Lock protection: locked championship rosters cannot be altered
  const lockStatus = await fetchRosterLockStatus();
  if (lockStatus.locked) {
    return {
      ok: false,
      error: `Elenco travado (Roster Lock) no campeonato "${lockStatus.championshipTitle || 'KINETIC'}". Não é possível remover membros durante o torneio.`,
    };
  }

  const nextMembers = { ...clan.members };
  delete nextMembers[targetUid];
  const nextUids = Object.keys(nextMembers);

  const updated: ClanDocument = {
    ...clan,
    memberUids: nextUids,
    members: nextMembers,
    updatedAtMs: Date.now(),
  };

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'clans', clan.clanId), updated);
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `clans/${clan.clanId}`);
      }
    }
  }

  currentState.myClan = updated;
  saveCachedClan(updated);
  emitClanState();
  return { ok: true };
}

/**
 * Join an existing open clan by its clanId or name (if under 7 members).
 */
export async function joinExistingClanById(
  targetClanId: string
): Promise<{ ok: boolean; error?: string }> {
  const cleanId = normalizeClanId(targetClanId);
  if (!cleanId) return { ok: false, error: 'Código/nome de clã inválido.' };

  const sync = getCloudSyncState();
  const myUid = auth.currentUser?.uid || sync.profile.uid || 'local_operator';

  try {
    const ref = doc(db, 'clans', cleanId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ok: false, error: 'Clã não encontrado no servidor.' };
    }
    const clan = snap.data() as ClanDocument;
    const count = Object.keys(clan.members || {}).length;
    if (!clan.members[myUid] && count >= MAX_CLAN_MEMBERS) {
      return {
        ok: false,
        error: `Este clã já está lotado (${MAX_CLAN_MEMBERS}/${MAX_CLAN_MEMBERS} membros).`,
      };
    }

    const nowIso = new Date().toISOString();
    const nextMembers: Record<string, ClanMemberEntry> = {
      ...clan.members,
      [myUid]: clan.members[myUid] || {
        uid: myUid,
        callsign: sync.profile.callsign || 'OPERADOR',
        role: 'MEMBER',
        rankLevel: sync.profile.rankLevel || 1,
        mmr: sync.profile.mmr || 2450,
        avatarDataUrl:
          sync.profile.avatarDataUrl && sync.profile.avatarDataUrl.length <= 45000
            ? sync.profile.avatarDataUrl
            : '',
        contributedXp: 0,
        joinedAt: nowIso,
      },
    };

    const updated: ClanDocument = {
      ...clan,
      memberUids: Object.keys(nextMembers),
      members: nextMembers,
      updatedAtMs: Date.now(),
    };

    if (!auth.currentUser) {
      return {
        ok: false,
        error: 'Faça login com sua conta Google para entrar em um clã.',
      };
    }

    await setDoc(ref, updated);
    attachClanListener(cleanId);

    currentState.myClan = updated;
    lastHydratedProfileClanId = cleanId;
    saveCachedClan(updated);
    emitClanState();
    await updatePlayerClanCloudMeta({ clanId: cleanId });
    return { ok: true };
  } catch (err) {
    if (!isFirestoreOfflineError(err)) {
      handleFirestoreError(err, OperationType.UPDATE, `clans/${cleanId}`);
    }
    return { ok: false, error: 'Não foi possível entrar no clã.' };
  }
}

/**
 * Leaves current clan (or disbands if owner is the last member).
 */
export async function leaveOrDisbandClan(): Promise<{ ok: boolean; error?: string }> {
  const clan = currentState.myClan;
  if (!clan) return { ok: true };
  const myUid = auth.currentUser?.uid || getCloudSyncState().profile.uid;

  // Roster Lock protection: players enrolled in an active locked championship cannot leave/disband
  const lockStatus = await fetchRosterLockStatus();
  if (lockStatus.locked) {
    return {
      ok: false,
      error: `Elenco travado (Roster Lock) em "${lockStatus.championshipTitle || 'Campeonato KINETIC'}". Você não pode sair ou dissolver o clã até o fim do torneio.`,
    };
  }

  if (clanDocUnsub) {
    clanDocUnsub();
    clanDocUnsub = null;
  }

  const nextMembers = { ...clan.members };
  delete nextMembers[myUid];
  const remainingUids = Object.keys(nextMembers);

  if (auth.currentUser) {
    try {
      const ref = doc(db, 'clans', clan.clanId);
      if (remainingUids.length === 0 || clan.ownerUid === myUid) {
        await deleteDoc(ref);
      } else {
        const updated: ClanDocument = {
          ...clan,
          memberUids: remainingUids,
          members: nextMembers,
          updatedAtMs: Date.now(),
        };
        await setDoc(ref, updated);
      }
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        handleFirestoreError(err, OperationType.DELETE, `clans/${clan.clanId}`);
      }
    }
  }

  currentState.myClan = null;
  lastHydratedProfileClanId = '';
  saveCachedClan(null);
  emitClanState();
  await updatePlayerClanCloudMeta({ clanId: '' });
  return { ok: true };
}

/**
 * Records daily clan mission progress (or simulates progress increment) and allows claiming rewards.
 */
export async function recordClanMissionActivity(deltas: {
  matches?: number;
  kills?: number;
  headshots?: number;
  wins?: number;
}): Promise<void> {
  const clan = currentState.myClan;
  if (!clan) return;

  const today = getTodayKey();
  const baseDaily =
    clan.dailyState?.dayKey === today
      ? clan.dailyState
      : { dayKey: today, progress: {}, claimedBy: {} };

  const prog = { ...baseDaily.progress };
  if (deltas.matches) {
    prog.clan_matches_3 = Math.min(3, (prog.clan_matches_3 || 0) + deltas.matches);
  }
  if (deltas.kills) {
    prog.clan_kills_25 = Math.min(25, (prog.clan_kills_25 || 0) + deltas.kills);
  }
  if (deltas.headshots) {
    prog.clan_headshots_10 = Math.min(
      10,
      (prog.clan_headshots_10 || 0) + deltas.headshots
    );
  }
  if (deltas.wins) {
    prog.clan_wins_2 = Math.min(2, (prog.clan_wins_2 || 0) + deltas.wins);
  }

  const updated: ClanDocument = {
    ...clan,
    dailyState: {
      dayKey: today,
      progress: prog,
      claimedBy: { ...baseDaily.claimedBy },
    },
    updatedAtMs: Date.now(),
  };

  currentState.myClan = updated;
  saveCachedClan(updated);
  emitClanState();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'clans', clan.clanId), updated);
    } catch {
      // ignore offline
    }
  }
}

export async function claimClanDailyMissionReward(
  missionId: string
): Promise<{ ok: boolean; error?: string }> {
  const clan = currentState.myClan;
  if (!clan) return { ok: false, error: 'Você não está em um clã.' };
  const mission = CLAN_DAILY_MISSIONS.find((m) => m.id === missionId);
  if (!mission) return { ok: false, error: 'Missão inválida.' };

  const today = getTodayKey();
  const daily =
    clan.dailyState?.dayKey === today
      ? clan.dailyState
      : { dayKey: today, progress: {}, claimedBy: {} };

  const currentVal = daily.progress[missionId] || 0;
  if (currentVal < mission.target) {
    return {
      ok: false,
      error: `Progresso insuficiente (${currentVal}/${mission.target}).`,
    };
  }

  const myUid = auth.currentUser?.uid || getCloudSyncState().profile.uid || 'local';
  const claimedList = daily.claimedBy[missionId] || [];
  if (claimedList.includes(myUid)) {
    return { ok: false, error: 'Recompensa já resgatada hoje!' };
  }

  const nextClanXp = (clan.clanXp || 0) + mission.rewardClanXp;
  const { level: nextClanLevel } = computeClanLevelFromXp(nextClanXp);

  const nextMembers = { ...clan.members };
  if (nextMembers[myUid]) {
    nextMembers[myUid] = {
      ...nextMembers[myUid],
      contributedXp: (nextMembers[myUid].contributedXp || 0) + mission.rewardClanXp,
    };
  }

  const updated: ClanDocument = {
    ...clan,
    clanXp: nextClanXp,
    clanLevel: nextClanLevel,
    members: nextMembers,
    dailyState: {
      dayKey: today,
      progress: { ...daily.progress },
      claimedBy: {
        ...daily.claimedBy,
        [missionId]: [...claimedList, myUid],
      },
    },
    updatedAtMs: Date.now(),
  };

  addPlayerCash(mission.rewardPlayerCash);
  currentState.clanTokens += mission.rewardClanTokens;
  saveLocalTokensState(currentState.clanTokens, currentState.purchasedOfferIds);

  currentState.myClan = updated;
  saveCachedClan(updated);
  emitClanState();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'clans', clan.clanId), updated);
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        handleFirestoreError(err, OperationType.UPDATE, `clans/${clan.clanId}`);
      }
    }
    await updatePlayerClanCloudMeta({
      clanId: clan.clanId,
      clanTokens: currentState.clanTokens,
      purchasedClanOfferIds: currentState.purchasedOfferIds,
    });
  }

  return { ok: true };
}

export function redeemClanStoreOffer(
  offerId: string
): { ok: boolean; error?: string } {
  const clan = currentState.myClan;
  if (!clan) return { ok: false, error: 'Entre em um clã para usar a Loja do Clã.' };

  const offer = CLAN_STORE_OFFERS.find((o) => o.id === offerId);
  if (!offer) return { ok: false, error: 'Item não encontrado.' };

  if (clan.clanLevel < offer.requiredClanLevel) {
    return {
      ok: false,
      error: `Requer Clã Nível ${offer.requiredClanLevel} (atual: Nível ${clan.clanLevel}).`,
    };
  }

  if (
    offer.rewardType === 'SKIN' &&
    currentState.purchasedOfferIds.includes(offer.id)
  ) {
    return { ok: false, error: 'Você já resgatou esta skin exclusiva do clã.' };
  }

  if (currentState.clanTokens < offer.costClanTokens) {
    return {
      ok: false,
      error: `Moedas do Clã insuficientes (${currentState.clanTokens}/${offer.costClanTokens}).`,
    };
  }

  currentState.clanTokens -= offer.costClanTokens;
  if (offer.rewardType === 'CASH' && offer.rewardAmount) {
    addPlayerCash(offer.rewardAmount);
  } else if (offer.rewardType === 'XP' && offer.rewardAmount) {
    const nextXp = loadSavedPlayerXp() + offer.rewardAmount;
    savePlayerXp(nextXp);
  } else if (offer.rewardType === 'SKIN' && offer.weaponId && offer.skinId) {
    grantWeaponSkinDirect(offer.skinId, offer.weaponId);
    currentState.purchasedOfferIds = [
      ...currentState.purchasedOfferIds,
      offer.id,
    ];
  }

  saveLocalTokensState(currentState.clanTokens, currentState.purchasedOfferIds);
  emitClanState();
  void updatePlayerClanCloudMeta({
    clanId: clan.clanId,
    clanTokens: currentState.clanTokens,
    purchasedClanOfferIds: currentState.purchasedOfferIds,
  });
  return { ok: true };
}

export async function refreshClanLeaderboard(): Promise<void> {
  if (!auth.currentUser) {
    currentState.leaderboard = currentState.myClan ? [currentState.myClan] : [];
    emitClanState();
    return;
  }

  try {
    // Explicitly filter by clanLevel >= 1 to satisfy Firestore Security Rules allow list
    const q = query(
      collection(db, 'clans'),
      where('clanLevel', '>=', 1),
      limit(30)
    );
    const snap = await getDocs(q);
    const list: ClanDocument[] = [];
    snap.forEach((d) => {
      const data = d.data() as ClanDocument;
      if (data && data.clanId && data.name) {
        list.push(data);
      }
    });
    if (
      currentState.myClan &&
      !list.some((c) => c.clanId === currentState.myClan?.clanId)
    ) {
      list.push(currentState.myClan);
    }
    list.sort((a, b) => (b.clanXp || 0) - (a.clanXp || 0));
    currentState.leaderboard = list;
    emitClanState();
  } catch (err) {
    if (!isFirestoreOfflineError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'clans');
    }
    currentState.leaderboard = currentState.myClan ? [currentState.myClan] : [];
    emitClanState();
  }
}
