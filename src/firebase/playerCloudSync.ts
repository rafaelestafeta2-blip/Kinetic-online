import { onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromCache,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { evaluateUnlockedAchievements } from '../progression/achievementsData';
import {
  applyCloudDailyContractsSnapshot,
  getDailyContractsSnapshot,
  recordDailyContractProgress,
  registerCloudDailyContractsHook,
  resetDailyContractsLocal,
} from '../progression/dailyContractsSystem';
import {
  DIAMOND_EXCLUSIVE_WEAPON_OFFERS,
  rollWarboxDrops,
  WARBOX_CATALOG,
  WarboxDropItem,
} from '../progression/diamondWarboxStore';
import {
  applyCloudLoadoutSnapshot,
  getCloudLoadoutSnapshot,
  grantVipWeaponAndSkin,
  grantWeaponSkinDirect,
  isWeaponOwnedInInventory,
  isWeaponSkinOwned,
  registerCloudLoadoutHook,
} from '../progression/loadoutSystem';
import { canGrantMatchProgressionRewards } from '../progression/matchProgressionGate';
import {
  applyCloudOperatorSnapshot,
  getOperatorDefinition,
  getOperatorOwnershipState,
  grantOperatorSkin,
  isOperatorUnlocked,
  registerCloudOperatorHook,
} from '../progression/operatorSkinsSystem';
import {
  applyCloudVipBattlePassSnapshot,
  buildActivatedVipState,
  commitActivatedVipStateLocal,
  getVipBattlePassState,
  registerCloudVipClaimHook,
  VIP_PASS_DIAMOND_PRICE,
} from '../progression/vipBattlePassSystem';
import { getSkinDefinition } from '../progression/weaponSkins';
import {
  getRankForXp,
  registerCloudCashSpendHook,
  registerCloudProgressionHook,
} from '../progression/ranks';
import { WeaponId } from '../types/game';
import {
  auth,
  db,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
} from './firebaseClient';
import { performGoogleSignIn, performGoogleSignOut } from './googleAuthService';
import {
  CloudSyncState,
  compressAvatarFileToDataUrl,
  computeUnlockedWeaponsForXp,
  loadLocalProfileFallback,
  mergeLocalAndCloudProfiles,
  persistLocalProfile,
  PlayerCloudProfile,
} from './playerProfileModel';

export type { CloudSyncState, PlayerCloudProfile };
export { compressAvatarFileToDataUrl };

let state: CloudSyncState = {
  profile: loadLocalProfileFallback(),
  authReady: false,
  isGoogleLinked: false,
  isSyncing: false,
  lastSyncedAt: null,
  syncError: null,
};

type SyncListener = (next: CloudSyncState) => void;
const listeners = new Set<SyncListener>();
let firestoreUnsub: Unsubscribe | null = null;
let saveTimeoutId: number | null = null;
let lastLocalLoadoutMutationMs = 0;
let cloudHydrationPromise: Promise<void> | null = null;
let hydratedCloudUid: string | null = null;

function emitState(): void {
  const snapshot: CloudSyncState = {
    ...state,
    profile: { ...state.profile },
  };
  listeners.forEach((fn) => fn(snapshot));
}

function clearPendingCloudPushTimer(): void {
  if (saveTimeoutId !== null) {
    window.clearTimeout(saveTimeoutId);
    saveTimeoutId = null;
  }
}

function buildCloudSafeProfilePayload(
  profile: PlayerCloudProfile,
  uid: string
): Omit<PlayerCloudProfile, 'email'> {
  const { email: _omitEmail, ...restProfile } = profile;
  const loadoutSnap = getCloudLoadoutSnapshot();
  const opSnap = getOperatorOwnershipState();
  const matchesPlayed = Math.max(0, Math.floor(Number(restProfile.matchesPlayed) || 0));
  const matchesWon = Math.min(
    matchesPlayed,
    Math.max(0, Math.floor(Number(restProfile.matchesWon) || 0))
  );
  return {
    ...restProfile,
    matchesPlayed,
    matchesWon,
    equippedWeaponOptics:
      restProfile.equippedWeaponOptics || loadoutSnap.equippedWeaponOptics,
    equippedWeaponSkins:
      restProfile.equippedWeaponSkins || loadoutSnap.equippedWeaponSkins,
    equippedWeaponGunsmith:
      restProfile.equippedWeaponGunsmith || loadoutSnap.equippedWeaponGunsmith,
    dailyContracts:
      restProfile.dailyContracts || getDailyContractsSnapshot().state,
    diamonds: Math.max(0, Math.floor(Number(restProfile.diamonds) || 0)),
    vipBattlePass: restProfile.vipBattlePass || getVipBattlePassState(),
    activeOperatorId:
      restProfile.activeOperatorId || opSnap.activeOperatorId || 'op_vanguard_default',
    unlockedOperators: Array.from(
      new Set([
        'op_vanguard_default',
        ...(restProfile.unlockedOperators || opSnap.unlockedOperatorIds || []),
      ])
    ).slice(0, 20),
    founderDiamondsClaimed: Boolean(restProfile.founderDiamondsClaimed),
    uid,
  };
}

async function ensureCloudProfileHydrated(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  if (hydratedCloudUid === user.uid) return;
  if (cloudHydrationPromise) {
    await cloudHydrationPromise;
  }
}

export async function pushProfileToFirestoreNow(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await ensureCloudProfileHydrated();
  if (!auth.currentUser || hydratedCloudUid !== user.uid) return;

  const path = `players/${user.uid}`;
  state.isSyncing = true;
  emitState();

  const payload = {
    ...buildCloudSafeProfilePayload(state.profile, user.uid),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'players', user.uid), payload);
    state.lastSyncedAt = payload.updatedAt;
    state.syncError = null;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    if (!isFirestoreOfflineError(err)) {
      state.syncError = 'Falha ao sincronizar com a nuvem.';
    }
  } finally {
    state.isSyncing = false;
    emitState();
  }
}

function scheduleCloudPush(): void {
  if (!auth.currentUser || hydratedCloudUid !== auth.currentUser.uid) return;
  if (saveTimeoutId !== null) {
    window.clearTimeout(saveTimeoutId);
  }
  saveTimeoutId = window.setTimeout(() => {
    saveTimeoutId = null;
    void pushProfileToFirestoreNow();
  }, 600);
}

onAuthStateChanged(auth, async (user) => {
  if (firestoreUnsub) {
    firestoreUnsub();
    firestoreUnsub = null;
  }
  clearPendingCloudPushTimer();

  if (!user) {
    hydratedCloudUid = null;
    cloudHydrationPromise = null;
    state.authReady = true;
    state.isGoogleLinked = false;
    emitState();
    return;
  }

  state.isGoogleLinked = true;
  state.isSyncing = true;
  emitState();

  const playerRef = doc(db, 'players', user.uid);
  const hydrateTask = (async () => {
    try {
      const snap = await getDoc(playerRef).catch(async (err) => {
        if (isFirestoreOfflineError(err)) {
          return getDocFromCache(playerRef).catch(() => null);
        }
        throw err;
      });
      const cloudData =
        snap && snap.exists()
          ? (snap.data() as Partial<PlayerCloudProfile>)
          : null;
      const merged = mergeLocalAndCloudProfiles(state.profile, cloudData, user);
      state.profile = merged;
      hydratedCloudUid = user.uid;
      persistLocalProfile(merged);
      applyCloudLoadoutSnapshot(merged);
      applyCloudDailyContractsSnapshot(merged.dailyContracts);
      applyCloudVipBattlePassSnapshot(merged.vipBattlePass);
      applyCloudOperatorSnapshot(merged);
      const cloudSafeProfile = buildCloudSafeProfilePayload(merged, user.uid);
      void setDoc(playerRef, cloudSafeProfile).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
      });
      state.lastSyncedAt = merged.updatedAt;
      state.syncError = null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `players/${user.uid}`);
      if (!isFirestoreOfflineError(err)) {
        state.syncError =
          err instanceof Error
            ? `Falha ao conectar ao Firestore: ${err.message}`
            : 'Falha ao conectar ao Firestore.';
      }
    } finally {
      state.authReady = true;
      state.isSyncing = false;
      emitState();
    }
  })();

  cloudHydrationPromise = hydrateTask;
  await hydrateTask;

  firestoreUnsub = onSnapshot(
    playerRef,
    (docSnap) => {
      if (!docSnap.exists() || !auth.currentUser) return;
      const remote = docSnap.data() as Partial<PlayerCloudProfile>;
      const merged = mergeLocalAndCloudProfiles(
        state.profile,
        remote,
        auth.currentUser
      );
      // Protect recent local weapon/loadout changes from being reverted by
      // in-flight or latency-compensated Firestore snapshots before the push commits.
      const hasRecentLocalLoadoutEdit =
        saveTimeoutId !== null || Date.now() - lastLocalLoadoutMutationMs < 6000;
      if (hasRecentLocalLoadoutEdit) {
        merged.activeWeapon = state.profile.activeWeapon;
        merged.equippedWeaponOptics = state.profile.equippedWeaponOptics;
        merged.equippedWeaponSkins = state.profile.equippedWeaponSkins;
        merged.equippedWeaponGunsmith = state.profile.equippedWeaponGunsmith;
      }
      state.profile = merged;
      state.lastSyncedAt = merged.updatedAt;
      persistLocalProfile(merged);
      if (!hasRecentLocalLoadoutEdit) {
        applyCloudLoadoutSnapshot(merged);
      }
      applyCloudDailyContractsSnapshot(merged.dailyContracts);
      applyCloudVipBattlePassSnapshot(merged.vipBattlePass);
      applyCloudOperatorSnapshot(merged);
      emitState();
    },
    (err) => {
      handleFirestoreError(err, OperationType.GET, `players/${user.uid}`);
    }
  );
});

export function getCloudSyncState(): CloudSyncState {
  return state;
}

export function getPlayerCallsign(): string {
  return state.profile.callsign || 'VOCÊ';
}

export function subscribePlayerProfile(listener: SyncListener): () => void {
  listeners.add(listener);
  listener({ ...state, profile: { ...state.profile } });
  return () => {
    listeners.delete(listener);
  };
}

export async function signInWithGoogleAccount(): Promise<boolean> {
  state.syncError = null;
  state.isSyncing = true;
  emitState();
  try {
    const res = await performGoogleSignIn();
    if (!res.ok) {
      state.syncError =
        res.error || 'Não foi possível concluir o login com Google.';
      return false;
    }
    // Credential applied — onAuthStateChanged pulls profile. Never leave
    // isSyncing=true if the Promise hung; finally clears either way.
    return true;
  } finally {
    state.isSyncing = false;
    emitState();
  }
}

export async function signOutGoogleAccount(): Promise<void> {
  if (firestoreUnsub) {
    firestoreUnsub();
    firestoreUnsub = null;
  }
  await performGoogleSignOut();
  state.isGoogleLinked = false;
  emitState();
}

export function syncProgressionFromLocal(
  xp: number,
  cash: number,
  activeWeapon?: WeaponId
): void {
  const nextXp = Math.max(state.profile.playerXp, xp);
  const nextCash = Math.max(state.profile.playerCash, cash);
  const rank = getRankForXp(nextXp);
  const unlockedWeapons = computeUnlockedWeaponsForXp(
    nextXp,
    state.profile.unlockedWeapons
  );
  const unlockedAchievements = evaluateUnlockedAchievements({
    playerXp: nextXp, rankLevel: rank.level, playerCash: nextCash, unlockedWeapons,
    totalKills: state.profile.totalKills, totalDeaths: state.profile.totalDeaths,
    totalAssists: state.profile.totalAssists, totalHeadshots: state.profile.totalHeadshots,
    matchesPlayed: state.profile.matchesPlayed, matchesWon: state.profile.matchesWon,
    bombsPlanted: state.profile.bombsPlanted,
    hasCustomAvatarOrCallsign: state.profile.callsign !== 'OPERADOR-01' || state.profile.avatarDataUrl.length > 0,
    isGoogleLinked: state.isGoogleLinked,
  }, state.profile.unlockedAchievements);

  if (activeWeapon) {
    lastLocalLoadoutMutationMs = Date.now();
  }
  state.profile = {
    ...state.profile,
    playerXp: nextXp, rankLevel: rank.level, rankTitle: rank.title, playerCash: nextCash,
    activeWeapon: activeWeapon || state.profile.activeWeapon, unlockedWeapons,
    unlockedAchievements, updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
}

registerCloudProgressionHook((xp, cash) => {
  syncProgressionFromLocal(xp, cash);
});

registerCloudCashSpendHook((newCash) => {
  const unlockedWeapons = computeUnlockedWeaponsForXp(
    state.profile.playerXp,
    state.profile.unlockedWeapons
  );
  state.profile = {
    ...state.profile,
    playerCash: Math.max(0, newCash),
    unlockedWeapons,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
});

registerCloudLoadoutHook((loadoutSnap) => {
  lastLocalLoadoutMutationMs = Date.now();
  const unlockedWeapons = computeUnlockedWeaponsForXp(
    state.profile.playerXp,
    [
      ...(state.profile.unlockedWeapons || []),
      ...(loadoutSnap.purchasedWeaponIds || []),
    ]
  );
  state.profile = {
    ...state.profile,
    activeWeapon: loadoutSnap.activeWeapon || state.profile.activeWeapon,
    unlockedWeapons,
    equippedWeaponOptics: loadoutSnap.equippedWeaponOptics,
    equippedWeaponSkins: loadoutSnap.equippedWeaponSkins,
    equippedWeaponGunsmith: loadoutSnap.equippedWeaponGunsmith,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
});

registerCloudDailyContractsHook((dailyContracts) => {
  state.profile = {
    ...state.profile,
    dailyContracts,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
});

registerCloudVipClaimHook((vipBattlePass) => {
  state.profile = {
    ...state.profile,
    vipBattlePass,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
});

registerCloudOperatorHook((opState) => {
  state.profile = {
    ...state.profile,
    activeOperatorId: opState.activeOperatorId,
    unlockedOperators: opState.unlockedOperatorIds,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
});

export const FOUNDER_WELCOME_DIAMONDS = 1500;

export async function claimFounderWelcomeDiamonds(): Promise<{
  ok: boolean;
  error?: string;
  granted?: number;
}> {
  await ensureCloudProfileHydrated();
  if (state.profile.founderDiamondsClaimed) {
    return {
      ok: false,
      error: 'O Pacote Fundador de 1.500 Diamantes já foi resgatado nesta conta.',
    };
  }

  clearPendingCloudPushTimer();
  const prevProfile = { ...state.profile };
  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  const nextDiamonds = currentDiamonds + FOUNDER_WELCOME_DIAMONDS;
  const nowIso = new Date().toISOString();

  const updatedProfile: PlayerCloudProfile = {
    ...state.profile,
    diamonds: nextDiamonds,
    founderDiamondsClaimed: true,
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (user) {
    const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
    try {
      state.isSyncing = true;
      emitState();
      await setDoc(doc(db, 'players', user.uid), cloudSafePayload);
      state.lastSyncedAt = nowIso;
      state.syncError = null;
    } catch (err) {
      state.profile = prevProfile;
      persistLocalProfile(prevProfile);
      emitState();
      handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
      return {
        ok: false,
        error: 'Não foi possível sincronizar o resgate de Diamantes com a nuvem.',
      };
    } finally {
      state.isSyncing = false;
      emitState();
    }
  }

  return { ok: true, granted: FOUNDER_WELCOME_DIAMONDS };
}

export interface WarboxResolvedDropResult {
  item: WarboxDropItem;
  wasGuaranteedPity: boolean;
  isDuplicate: boolean;
  grantedCash: number;
  grantedXp: number;
}

export async function openWarfaceWarboxWithDiamonds(
  boxId: string,
  count: 1 | 5,
  activeWeaponId: WeaponId
): Promise<{
  ok: boolean;
  error?: string;
  results?: WarboxResolvedDropResult[];
  nextPityCount?: number;
  totalCashGained?: number;
  totalXpGained?: number;
  unlockedWeaponId?: WeaponId;
  unlockedOperatorId?: string;
}> {
  await ensureCloudProfileHydrated();
  const box = WARBOX_CATALOG.find((b) => b.id === boxId);
  if (!box) {
    return { ok: false, error: 'Caixa Tática inválida.' };
  }
  const cost = count === 5 ? box.price5xDiamonds : box.price1xDiamonds;
  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  if (currentDiamonds < cost) {
    return {
      ok: false,
      error: `Diamantes insuficientes: necessários ${cost} 💎 (saldo atual: ${currentDiamonds} 💎).`,
    };
  }

  clearPendingCloudPushTimer();
  const prevProfile = { ...state.profile };
  const rolled = rollWarboxDrops(box.id, count);

  let nextXp = state.profile.playerXp;
  let nextCash = state.profile.playerCash;
  const nextUnlockedWeapons = new Set<WeaponId>(state.profile.unlockedWeapons || []);
  const nextSkins: Partial<Record<WeaponId, string>> = {
    ...(state.profile.equippedWeaponSkins || getCloudLoadoutSnapshot().equippedWeaponSkins),
  };
  const opSnap = getOperatorOwnershipState();
  const nextUnlockedOperators = new Set<string>([
    'op_vanguard_default',
    ...opSnap.unlockedOperatorIds,
    ...(state.profile.unlockedOperators || []),
  ]);
  let nextActiveOperatorId =
    state.profile.activeOperatorId || opSnap.activeOperatorId || 'op_vanguard_default';

  let firstUnlockedWeaponId: WeaponId | undefined;
  let firstUnlockedOperatorId: string | undefined;
  let totalCashGained = 0;
  let totalXpGained = 0;

  const resolvedResults: WarboxResolvedDropResult[] = [];

  for (const r of rolled.results) {
    const drop = r.item;
    let isDuplicate = false;
    let grantedCash = 0;
    let grantedXp = 0;

    if (drop.kind === 'WEAPON_BUNDLE' && drop.weaponId) {
      const alreadyOwned =
        nextUnlockedWeapons.has(drop.weaponId) ||
        isWeaponOwnedInInventory(drop.weaponId, nextXp);
      const skinOwned = drop.skinId ? isWeaponSkinOwned(drop.skinId) : true;
      if (alreadyOwned && skinOwned) {
        isDuplicate = true;
        grantedCash = drop.duplicateCashCompensation;
        grantedXp = drop.duplicateXpCompensation;
      } else {
        nextUnlockedWeapons.add(drop.weaponId);
        if (drop.skinId) {
          nextSkins[drop.weaponId] = drop.skinId;
        }
        grantVipWeaponAndSkin(drop.weaponId, drop.skinId || 'default');
        if (!firstUnlockedWeaponId) {
          firstUnlockedWeaponId = drop.weaponId;
        }
      }
    } else if (drop.kind === 'OPERATOR' && drop.operatorId) {
      if (nextUnlockedOperators.has(drop.operatorId) || isOperatorUnlocked(drop.operatorId)) {
        isDuplicate = true;
        grantedCash = drop.duplicateCashCompensation;
        grantedXp = drop.duplicateXpCompensation;
      } else {
        nextUnlockedOperators.add(drop.operatorId);
        nextActiveOperatorId = drop.operatorId;
        grantOperatorSkin(drop.operatorId, true);
        if (!firstUnlockedOperatorId) {
          firstUnlockedOperatorId = drop.operatorId;
        }
      }
    } else if (drop.kind === 'SKIN' && drop.skinId) {
      if (isWeaponSkinOwned(drop.skinId)) {
        isDuplicate = true;
        grantedCash = drop.duplicateCashCompensation;
        grantedXp = drop.duplicateXpCompensation;
      } else {
        grantWeaponSkinDirect(drop.skinId, activeWeaponId);
        nextSkins[activeWeaponId] = drop.skinId;
      }
    } else if (drop.kind === 'CURRENCY') {
      grantedCash = drop.cashAmount || 0;
      grantedXp = drop.xpAmount || 0;
    }

    nextCash += grantedCash;
    nextXp += grantedXp;
    totalCashGained += grantedCash;
    totalXpGained += grantedXp;

    resolvedResults.push({
      item: drop,
      wasGuaranteedPity: r.wasGuaranteedPity,
      isDuplicate,
      grantedCash,
      grantedXp,
    });
  }

  clearPendingCloudPushTimer();
  const nextRank = getRankForXp(nextXp);
  const finalWeapons = computeUnlockedWeaponsForXp(
    nextXp,
    Array.from(nextUnlockedWeapons)
  );
  const nowIso = new Date().toISOString();

  const updatedProfile: PlayerCloudProfile = {
    ...prevProfile,
    diamonds: currentDiamonds - cost,
    playerCash: nextCash,
    playerXp: nextXp,
    rankLevel: nextRank.level,
    rankTitle: nextRank.title,
    unlockedWeapons: finalWeapons,
    equippedWeaponSkins: nextSkins,
    activeOperatorId: nextActiveOperatorId,
    unlockedOperators: Array.from(nextUnlockedOperators).slice(0, 20),
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (user) {
    const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
    try {
      state.isSyncing = true;
      emitState();
      await setDoc(doc(db, 'players', user.uid), cloudSafePayload);
      state.lastSyncedAt = nowIso;
      state.syncError = null;
    } catch (err) {
      state.profile = prevProfile;
      persistLocalProfile(prevProfile);
      emitState();
      handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
      return {
        ok: false,
        error: 'Falha ao sincronizar abertura da Caixa com o servidor.',
      };
    } finally {
      state.isSyncing = false;
      emitState();
    }
  }

  return {
    ok: true,
    results: resolvedResults,
    nextPityCount: rolled.nextPityCount,
    totalCashGained,
    totalXpGained,
    unlockedWeaponId: firstUnlockedWeaponId,
    unlockedOperatorId: firstUnlockedOperatorId,
  };
}

export async function purchaseDirectWeaponOfferWithDiamonds(
  offerId: string
): Promise<{
  ok: boolean;
  error?: string;
  weaponId?: WeaponId;
  skinId?: string;
}> {
  await ensureCloudProfileHydrated();
  const offer = DIAMOND_EXCLUSIVE_WEAPON_OFFERS.find((o) => o.id === offerId);
  if (!offer) {
    return { ok: false, error: 'Oferta de arma inválida.' };
  }

  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  if (currentDiamonds < offer.diamondPrice) {
    return {
      ok: false,
      error: `Diamantes insuficientes: necessários ${offer.diamondPrice} 💎 (saldo atual: ${currentDiamonds} 💎).`,
    };
  }

  clearPendingCloudPushTimer();
  const prevProfile = { ...state.profile };
  const nextDiamonds = currentDiamonds - offer.diamondPrice;
  const nextCash = state.profile.playerCash + offer.bonusCash;
  const nextUnlockedWeapons = computeUnlockedWeaponsForXp(state.profile.playerXp, [
    ...(state.profile.unlockedWeapons || []),
    offer.weaponId,
  ]);
  const nextSkins = {
    ...(state.profile.equippedWeaponSkins || getCloudLoadoutSnapshot().equippedWeaponSkins),
    [offer.weaponId]: offer.skinId,
  };
  const nowIso = new Date().toISOString();

  grantVipWeaponAndSkin(offer.weaponId, offer.skinId);
  clearPendingCloudPushTimer();

  const updatedProfile: PlayerCloudProfile = {
    ...prevProfile,
    diamonds: nextDiamonds,
    playerCash: nextCash,
    activeWeapon: offer.weaponId,
    unlockedWeapons: nextUnlockedWeapons,
    equippedWeaponSkins: nextSkins,
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (user) {
    const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
    try {
      state.isSyncing = true;
      emitState();
      await setDoc(doc(db, 'players', user.uid), cloudSafePayload);
      state.lastSyncedAt = nowIso;
      state.syncError = null;
    } catch (err) {
      state.profile = prevProfile;
      persistLocalProfile(prevProfile);
      emitState();
      handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
      return {
        ok: false,
        error: 'Falha ao validar compra da arma no servidor.',
      };
    } finally {
      state.isSyncing = false;
      emitState();
    }
  }

  return {
    ok: true,
    weaponId: offer.weaponId,
    skinId: offer.skinId,
  };
}

export async function purchaseOperatorWithDiamonds(
  operatorId: string
): Promise<{
  ok: boolean;
  error?: string;
}> {
  await ensureCloudProfileHydrated();
  const op = getOperatorDefinition(operatorId);
  if (!op || op.id === 'op_vanguard_default') {
    return { ok: false, error: 'Operador inválido.' };
  }
  if (isOperatorUnlocked(op.id)) {
    grantOperatorSkin(op.id, true);
    return { ok: true };
  }

  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  if (currentDiamonds < op.diamondPrice) {
    return {
      ok: false,
      error: `Diamantes insuficientes: necessários ${op.diamondPrice} 💎 (saldo atual: ${currentDiamonds} 💎).`,
    };
  }

  clearPendingCloudPushTimer();
  const prevProfile = { ...state.profile };
  const opSnap = getOperatorOwnershipState();
  const nextUnlockedOps = Array.from(
    new Set([
      'op_vanguard_default',
      ...opSnap.unlockedOperatorIds,
      ...(state.profile.unlockedOperators || []),
      op.id,
    ])
  ).slice(0, 20);
  const nowIso = new Date().toISOString();

  grantOperatorSkin(op.id, true);
  clearPendingCloudPushTimer();

  const updatedProfile: PlayerCloudProfile = {
    ...prevProfile,
    diamonds: currentDiamonds - op.diamondPrice,
    activeOperatorId: op.id,
    unlockedOperators: nextUnlockedOps,
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (user) {
    const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
    try {
      state.isSyncing = true;
      emitState();
      await setDoc(doc(db, 'players', user.uid), cloudSafePayload);
      state.lastSyncedAt = nowIso;
      state.syncError = null;
    } catch (err) {
      state.profile = prevProfile;
      persistLocalProfile(prevProfile);
      emitState();
      handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
      return {
        ok: false,
        error: 'Falha ao validar compra do Operador no servidor.',
      };
    } finally {
      state.isSyncing = false;
      emitState();
    }
  }

  return { ok: true };
}

export async function purchaseWeaponSkinWithDiamonds(
  skinId: string,
  activeWeaponId: WeaponId
): Promise<{
  ok: boolean;
  error?: string;
}> {
  await ensureCloudProfileHydrated();
  const skin = getSkinDefinition(skinId);
  if (!skin || skin.id === 'default' || !skin.diamondPrice) {
    return { ok: false, error: 'Skin inválida para compra com Diamantes.' };
  }
  if (isWeaponSkinOwned(skin.id)) {
    grantWeaponSkinDirect(skin.id, activeWeaponId);
    return { ok: true };
  }

  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  if (currentDiamonds < skin.diamondPrice) {
    return {
      ok: false,
      error: `Diamantes insuficientes: necessários ${skin.diamondPrice} 💎 (saldo atual: ${currentDiamonds} 💎).`,
    };
  }

  clearPendingCloudPushTimer();
  const prevProfile = { ...state.profile };
  const targetWeapon =
    skin.weaponIds && skin.weaponIds.length > 0
      ? skin.weaponIds[0]
      : activeWeaponId;
  const nextSkins = {
    ...(state.profile.equippedWeaponSkins || getCloudLoadoutSnapshot().equippedWeaponSkins),
    [targetWeapon]: skin.id,
  };
  const nowIso = new Date().toISOString();

  grantWeaponSkinDirect(skin.id, targetWeapon);
  clearPendingCloudPushTimer();

  const updatedProfile: PlayerCloudProfile = {
    ...prevProfile,
    diamonds: currentDiamonds - skin.diamondPrice,
    equippedWeaponSkins: nextSkins,
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (user) {
    const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
    try {
      state.isSyncing = true;
      emitState();
      await setDoc(doc(db, 'players', user.uid), cloudSafePayload);
      state.lastSyncedAt = nowIso;
      state.syncError = null;
    } catch (err) {
      state.profile = prevProfile;
      persistLocalProfile(prevProfile);
      emitState();
      handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
      return {
        ok: false,
        error: 'Falha ao validar compra da Skin no servidor.',
      };
    } finally {
      state.isSyncing = false;
      emitState();
    }
  }

  return { ok: true };
}

export async function purchaseMonthlyVipBattlePassWithDiamonds(): Promise<{
  ok: boolean;
  error?: string;
  weaponId?: WeaponId;
  skinId?: string;
}> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: 'Faça login com sua conta Google para ativar o Passe VIP com Diamantes.',
    };
  }

  await ensureCloudProfileHydrated();
  clearPendingCloudPushTimer();
  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  if (currentDiamonds < VIP_PASS_DIAMOND_PRICE) {
    return {
      ok: false,
      error: `Saldo insuficiente: você precisa de ${VIP_PASS_DIAMOND_PRICE} Diamantes (saldo atual: ${currentDiamonds}).`,
    };
  }

  const prevProfile = { ...state.profile };
  const nextVip = buildActivatedVipState();
  const nextDiamonds = currentDiamonds - VIP_PASS_DIAMOND_PRICE;
  const nextUnlockedWeapons = Array.from(
    new Set([...(state.profile.unlockedWeapons || []), nextVip.weaponOfMonthId])
  );
  const nextSkins = {
    ...(state.profile.equippedWeaponSkins || getCloudLoadoutSnapshot().equippedWeaponSkins),
    [nextVip.weaponOfMonthId]: nextVip.weaponOfMonthSkinId,
  };
  const nowIso = new Date().toISOString();

  const updatedProfile: PlayerCloudProfile = {
    ...state.profile,
    diamonds: nextDiamonds,
    vipBattlePass: nextVip,
    unlockedWeapons: nextUnlockedWeapons,
    equippedWeaponSkins: nextSkins,
    updatedAt: nowIso,
  };

  const { email: _omitEmail, ...cloudSafePayload } = updatedProfile;

  try {
    state.isSyncing = true;
    emitState();
    await setDoc(doc(db, 'players', user.uid), {
      ...cloudSafePayload,
      uid: user.uid,
    });
    state.profile = updatedProfile;
    state.lastSyncedAt = nowIso;
    state.syncError = null;
    commitActivatedVipStateLocal(nextVip);
    grantVipWeaponAndSkin(nextVip.weaponOfMonthId, nextVip.weaponOfMonthSkinId);
    persistLocalProfile(updatedProfile);
    emitState();
    return {
      ok: true,
      weaponId: nextVip.weaponOfMonthId,
      skinId: nextVip.weaponOfMonthSkinId,
    };
  } catch (err) {
    state.profile = prevProfile;
    handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
    return {
      ok: false,
      error: 'Não foi possível validar a compra do Passe VIP no servidor. Tente novamente.',
    };
  } finally {
    state.isSyncing = false;
    emitState();
  }
}

export function recordCombatTelemetryDelta(delta: {
  kills?: number; deaths?: number; assists?: number; headshots?: number;
  matchesPlayed?: number; matchesWon?: number; bombsPlanted?: number; activeWeapon?: WeaponId;
}): void {
  // Profile combat / match / MMR / Daily Contract progression only from online human matches.
  if (!canGrantMatchProgressionRewards()) return;

  const updatedContracts = recordDailyContractProgress({
    kills: delta.kills,
    headshots: delta.headshots,
    bombsPlanted: delta.bombsPlanted,
    matchesWon: delta.matchesWon,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('kinetic:online-combat-delta', {
        detail: {
          kills: delta.kills || 0,
          headshots: delta.headshots || 0,
          matchesPlayed: delta.matchesPlayed || 0,
          matchesWon: delta.matchesWon || 0,
        },
      })
    );
  }

  const p = state.profile;
  const totalKills = p.totalKills + (delta.kills || 0);
  const totalDeaths = p.totalDeaths + (delta.deaths || 0);
  const totalAssists = p.totalAssists + (delta.assists || 0);
  const totalHeadshots = p.totalHeadshots + (delta.headshots || 0);
  const matchesPlayed = p.matchesPlayed + (delta.matchesPlayed || 0);
  const matchesWon = p.matchesWon + (delta.matchesWon || 0);
  const bombsPlanted = p.bombsPlanted + (delta.bombsPlanted || 0);
  const activeWeapon = delta.activeWeapon || p.activeWeapon;
  const currentMmr = Number(p.mmr) > 0 ? Number(p.mmr) : 1000;
  const mmrDelta = (delta.matchesPlayed || 0) > 0 ? ((delta.matchesWon || 0) > 0 ? 25 : -18) : 0;
  const nextMmr = Math.max(100, currentMmr + mmrDelta);

  const unlockedAchievements = evaluateUnlockedAchievements({
    playerXp: p.playerXp, rankLevel: p.rankLevel, playerCash: p.playerCash,
    unlockedWeapons: p.unlockedWeapons, totalKills, totalDeaths, totalAssists,
    totalHeadshots, matchesPlayed, matchesWon, bombsPlanted,
    hasCustomAvatarOrCallsign: p.callsign !== 'OPERADOR-01' || p.avatarDataUrl.length > 0,
    isGoogleLinked: state.isGoogleLinked,
  }, p.unlockedAchievements);

  state.profile = {
    ...p, activeWeapon, totalKills, totalDeaths, totalAssists, totalHeadshots,
    matchesPlayed, matchesWon, bombsPlanted, mmr: nextMmr, unlockedAchievements,
    dailyContracts: updatedContracts,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
}

export interface CallsignClaimResult {
  success: boolean;
  error?: string;
  locked?: boolean;
}

export async function claimUniqueCallsign(
  requestedCallsign: string
): Promise<CallsignClaimResult> {
  const sanitized = requestedCallsign
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_\-]/g, '')
    .slice(0, 20);

  if (sanitized.length < 3) {
    return { success: false, error: 'O nome deve ter no mínimo 3 caracteres (apenas letras, números, hífen).' };
  }

  const p = state.profile;
  if (p.callsignLocked && p.callsign === sanitized) {
    return { success: true, locked: true };
  }

  if (p.callsignLocked && p.callsign !== sanitized) {
    return {
      success: false,
      error: `Seu Callsign único (${p.callsign}) já foi registrado permanentemente e não pode ser alterado.`,
    };
  }

  const lowerKey = sanitized.toLowerCase();
  const user = auth.currentUser;

  if (user) {
    try {
      const usernameRef = doc(db, 'usernames', lowerKey);
      const snap = await getDoc(usernameRef);
      if (snap.exists()) {
        const ownerUid = snap.data()?.uid;
        if (ownerUid !== user.uid) {
          return {
            success: false,
            error: `O Callsign "${sanitized}" já pertence a outro operador. Escolha outro nome exclusivo.`,
          };
        }
      } else {
        await setDoc(usernameRef, {
          callsign: sanitized,
          uid: user.uid,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `usernames/${lowerKey}`);
    }
  }

  state.profile = {
    ...p,
    callsign: sanitized,
    callsignLocked: true,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  if (user) {
    await pushProfileToFirestoreNow();
  }
  return { success: true, locked: true };
}

export async function updatePlayerCallsignAndAvatar(
  newCallsign: string,
  newAvatarDataUrl?: string
): Promise<CallsignClaimResult> {
  const p = state.profile;
  const avatarDataUrl =
    newAvatarDataUrl !== undefined
      ? newAvatarDataUrl.slice(0, 58000)
      : p.avatarDataUrl;

  if (newAvatarDataUrl !== undefined) {
    state.profile = {
      ...state.profile,
      avatarDataUrl,
      updatedAt: new Date().toISOString(),
    };
    persistLocalProfile(state.profile);
    emitState();
  }

  if (newCallsign && newCallsign.trim() && newCallsign !== p.callsign) {
    const claimRes = await claimUniqueCallsign(newCallsign);
    if (!claimRes.success) {
      return claimRes;
    }
  } else if (newAvatarDataUrl !== undefined) {
    await pushProfileToFirestoreNow();
  }

  return { success: true, locked: Boolean(state.profile.callsignLocked) };
}

export async function resetPlayerAccountEntirely(): Promise<void> {
  const nowIso = new Date().toISOString();
  const defaultRank = getRankForXp(0);
  state.profile = {
    ...state.profile,
    playerXp: 0,
    playerCash: 3000,
    rankLevel: defaultRank.level,
    rankTitle: defaultRank.title,
    totalKills: 0,
    totalDeaths: 0,
    totalAssists: 0,
    totalHeadshots: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    bombsPlanted: 0,
    unlockedAchievements: [],
    unlockedWeapons: computeUnlockedWeaponsForXp(0),
    economyVersion: 2,
    mmr: 1000,
    dailyContracts: resetDailyContractsLocal(),
    updatedAt: nowIso,
  };
  persistLocalProfile(state.profile);
  emitState();
  if (auth.currentUser) {
    await pushProfileToFirestoreNow();
  }
}
