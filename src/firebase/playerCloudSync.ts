import { onAuthStateChanged } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { WarfaceClassId } from '../components/WarfaceClassIcons';
import { evaluateUnlockedAchievements } from '../progression/achievementsData';
import {
  applyCloudCallingCardSnapshot,
  getEquippedCallingCardId,
  registerCloudCallingCardHook,
} from '../progression/callingCardsSystem';
import {
  applyCloudDailyContractsSnapshot,
  getDailyContractsSnapshot,
  recordDailyContractProgress,
  registerCloudDailyContractsHook,
  resetDailyContractsLocal,
  sanitizeDailyContractsState,
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
  sanitizeVipBattlePassState,
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
let lastLocalDiamondMutationMs = 0;
let pendingDiamondMutationCount = 0;
let cloudWriteEpoch = 0;
let cloudWriteChain: Promise<void> = Promise.resolve();
let cloudHydrationPromise: Promise<void> | null = null;
let hydratedCloudUid: string | null = null;

function enqueueCloudWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = cloudWriteChain.then(task, task);
  cloudWriteChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback = min
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function clampRecordEntries<T>(
  input: Record<string, T> | undefined | null,
  maxEntries: number
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!input || typeof input !== 'object') return out;
  let count = 0;
  for (const [k, v] of Object.entries(input)) {
    if (count >= maxEntries) break;
    if (v !== undefined) {
      out[k] = v;
      count++;
    }
  }
  return out;
}

const VALID_CLASSES = new Set<WarfaceClassId>([
  'FUZILEIRO',
  'MEDICO',
  'ENGENHEIRO',
  'FRANCO_ATIRADOR',
]);

function normalizeIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length >= 10 && value.length <= 40) {
    return value;
  }
  return fallback;
}

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
  const nowIso = new Date().toISOString();
  const loadoutSnap = getCloudLoadoutSnapshot();
  const opSnap = getOperatorOwnershipState();

  const matchesPlayed = clampInt(profile.matchesPlayed, 0, 500_000, 0);
  const matchesWon = Math.min(matchesPlayed, clampInt(profile.matchesWon, 0, 500_000, 0));

  const equippedOptics = clampRecordEntries(
    (profile.equippedWeaponOptics || loadoutSnap.equippedWeaponOptics) as Record<
      string,
      NonNullable<PlayerCloudProfile['equippedWeaponOptics']>[WeaponId]
    >,
    25
  ) as PlayerCloudProfile['equippedWeaponOptics'];

  const rawSkins = (profile.equippedWeaponSkins || loadoutSnap.equippedWeaponSkins) as Record<
    string,
    string
  >;
  const equippedSkins: Partial<Record<WeaponId, string>> = {};
  let skinMapCount = 0;
  for (const [k, v] of Object.entries(rawSkins || {})) {
    if (skinMapCount >= 25) break;
    if (typeof v === 'string' && v.length > 0) {
      equippedSkins[k as WeaponId] = v.slice(0, 48);
      skinMapCount++;
    }
  }

  const equippedGunsmith = clampRecordEntries(
    (profile.equippedWeaponGunsmith || loadoutSnap.equippedWeaponGunsmith) as Record<
      string,
      NonNullable<PlayerCloudProfile['equippedWeaponGunsmith']>[WeaponId]
    >,
    25
  ) as PlayerCloudProfile['equippedWeaponGunsmith'];

  const unlockedWeaponsList = Array.from(
    new Set(
      (profile.unlockedWeapons || []).filter(
        (w): w is WeaponId => typeof w === 'string' && w.length > 0 && w.length <= 40
      )
    )
  ).slice(0, 25);
  if (unlockedWeaponsList.length === 0) {
    unlockedWeaponsList.push('M4_CARBINE');
  }

  const unlockedAchievements = Array.from(
    new Set(
      (profile.unlockedAchievements || []).filter(
        (a): a is string => typeof a === 'string' && a.length > 0
      )
    )
  ).slice(0, 50);

  const unlockedWeaponSkins = Array.from(
    new Set([
      ...(profile.unlockedWeaponSkins || []),
      ...(loadoutSnap.purchasedSkinIds || []),
      ...Object.values(equippedSkins).filter(
        (v): v is string => typeof v === 'string' && v.length > 0
      ),
    ])
  )
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => s.slice(0, 48))
    .slice(0, 60);

  const unlockedGearIds = Array.from(
    new Set([
      ...(profile.unlockedGearIds || []),
      ...(loadoutSnap.purchasedGearIds || []),
    ])
  )
    .filter((g): g is string => typeof g === 'string' && g.length > 0)
    .map((g) => g.slice(0, 48))
    .slice(0, 40);

  const rawSelectedClass =
    profile.selectedClass || loadoutSnap.selectedClass || 'FUZILEIRO';
  const selectedClass: WarfaceClassId = VALID_CLASSES.has(rawSelectedClass)
    ? rawSelectedClass
    : 'FUZILEIRO';

  const rawClassLoadouts = profile.classLoadouts || loadoutSnap.classLoadouts || {};
  const classLoadouts: PlayerCloudProfile['classLoadouts'] = {};
  (['FUZILEIRO', 'MEDICO', 'ENGENHEIRO', 'FRANCO_ATIRADOR'] as WarfaceClassId[]).forEach(
    (cId) => {
      const cfg = rawClassLoadouts[cId] || loadoutSnap.classLoadouts?.[cId];
      if (cfg) {
        classLoadouts[cId] = { ...cfg };
      }
    }
  );

  const cleanClanId =
    typeof profile.clanId === 'string'
      ? profile.clanId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24)
      : '';

  const callsign = (
    typeof profile.callsign === 'string' && profile.callsign.trim().length > 0
      ? profile.callsign.trim()
      : 'OPERADOR-01'
  ).slice(0, 32);

  const rankTitle = (
    typeof profile.rankTitle === 'string' && profile.rankTitle.trim().length > 0
      ? profile.rankTitle.trim()
      : 'RECRUTA'
  ).slice(0, 64);

  const activeWeapon = (
    typeof profile.activeWeapon === 'string' && profile.activeWeapon.length > 0
      ? profile.activeWeapon
      : 'M4_CARBINE'
  ).slice(0, 40) as WeaponId;

  const activeOperatorId = (
    typeof profile.activeOperatorId === 'string' && profile.activeOperatorId.length > 0
      ? profile.activeOperatorId
      : opSnap.activeOperatorId || 'op_vanguard_default'
  ).slice(0, 40);

  const unlockedOperators = Array.from(
    new Set([
      'op_vanguard_default',
      ...(profile.unlockedOperators || opSnap.unlockedOperatorIds || []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 40
      ),
    ])
  ).slice(0, 40);

  const purchasedClanOfferIds = Array.from(
    new Set(
      (profile.purchasedClanOfferIds || []).filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    )
  ).slice(0, 30);

  return {
    uid,
    callsign,
    callsignLocked: Boolean(profile.callsignLocked),
    avatarDataUrl:
      typeof profile.avatarDataUrl === 'string'
        ? profile.avatarDataUrl.slice(0, 58000)
        : '',
    playerXp: clampInt(profile.playerXp, 0, 50_000_000, 0),
    rankLevel: clampInt(profile.rankLevel, 1, 70, 1),
    rankTitle,
    playerCash: clampInt(profile.playerCash, 0, 50_000_000, 3000),
    activeWeapon,
    unlockedWeapons: unlockedWeaponsList,
    totalKills: clampInt(profile.totalKills, 0, 1_000_000, 0),
    totalDeaths: clampInt(profile.totalDeaths, 0, 1_000_000, 0),
    totalAssists: clampInt(profile.totalAssists, 0, 1_000_000, 0),
    totalHeadshots: clampInt(profile.totalHeadshots, 0, 1_000_000, 0),
    matchesPlayed,
    matchesWon,
    bombsPlanted: clampInt(profile.bombsPlanted, 0, 500_000, 0),
    unlockedAchievements,
    economyVersion: clampInt(profile.economyVersion, 1, 100, 2),
    mmr: clampInt(profile.mmr, 100, 10_000, 2450),
    equippedWeaponOptics: equippedOptics,
    equippedWeaponSkins: equippedSkins,
    equippedWeaponGunsmith: equippedGunsmith,
    unlockedWeaponSkins,
    unlockedGearIds,
    selectedClass,
    classLoadouts,
    equippedCallingCardId: (
      profile.equippedCallingCardId ||
      getEquippedCallingCardId() ||
      'obsidian_vanguard'
    ).slice(0, 48),
    clanId: cleanClanId,
    clanTokens: clampInt(profile.clanTokens, 0, 1_000_000, 0),
    purchasedClanOfferIds,
    dailyContracts: sanitizeDailyContractsState(
      profile.dailyContracts || getDailyContractsSnapshot().state
    ),
    diamonds: clampInt(profile.diamonds, 0, 1_000_000, 0),
    vipBattlePass: sanitizeVipBattlePassState(
      profile.vipBattlePass || getVipBattlePassState()
    ),
    activeOperatorId,
    unlockedOperators,
    founderDiamondsClaimed: Boolean(profile.founderDiamondsClaimed),
    createdAt: normalizeIsoTimestamp(profile.createdAt, nowIso),
    updatedAt: normalizeIsoTimestamp(profile.updatedAt, nowIso),
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
  if (pendingDiamondMutationCount > 0) return;

  const capturedEpoch = cloudWriteEpoch;
  await enqueueCloudWrite(async () => {
    const activeUser = auth.currentUser;
    if (!activeUser || activeUser.uid !== user.uid) return;
    if (pendingDiamondMutationCount > 0 || capturedEpoch !== cloudWriteEpoch) return;

    const path = `players/${activeUser.uid}`;
    state.isSyncing = true;
    emitState();

    const payload = {
      ...buildCloudSafeProfilePayload(state.profile, activeUser.uid),
      updatedAt: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'players', activeUser.uid), payload);
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
  });
}

function scheduleCloudPush(): void {
  if (!auth.currentUser || hydratedCloudUid !== auth.currentUser.uid) return;
  if (pendingDiamondMutationCount > 0) return;
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
      applyCloudCallingCardSnapshot(merged.equippedCallingCardId);
      applyCloudDailyContractsSnapshot(merged.dailyContracts);
      applyCloudVipBattlePassSnapshot(merged.vipBattlePass);
      applyCloudOperatorSnapshot(merged);

      const hydrateEpoch = cloudWriteEpoch;
      const cloudSafeProfile = buildCloudSafeProfilePayload(merged, user.uid);
      void enqueueCloudWrite(async () => {
        if (
          !auth.currentUser ||
          auth.currentUser.uid !== user.uid ||
          pendingDiamondMutationCount > 0 ||
          hydrateEpoch !== cloudWriteEpoch
        ) {
          return;
        }
        try {
          await setDoc(playerRef, cloudSafeProfile);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `players/${user.uid}`);
        }
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
        merged.selectedClass = state.profile.selectedClass;
        merged.classLoadouts = state.profile.classLoadouts;
        merged.equippedWeaponOptics = state.profile.equippedWeaponOptics;
        merged.equippedWeaponSkins = state.profile.equippedWeaponSkins;
        merged.equippedWeaponGunsmith = state.profile.equippedWeaponGunsmith;
        merged.equippedCallingCardId = state.profile.equippedCallingCardId;
      }

      // Protect in-flight / recently committed diamond & store mutations from
      // being reverted by stale Firestore snapshots (especially under long-polling on mobile).
      const hasRecentDiamondMutation =
        pendingDiamondMutationCount > 0 ||
        Date.now() - lastLocalDiamondMutationMs < 6000;
      if (hasRecentDiamondMutation) {
        const remoteDiamonds = Math.max(0, Math.floor(Number(remote.diamonds) || 0));
        const localDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
        const remoteFounder = Boolean(remote.founderDiamondsClaimed);
        const localFounder = Boolean(state.profile.founderDiamondsClaimed);
        if (
          pendingDiamondMutationCount > 0 ||
          remoteDiamonds !== localDiamonds ||
          remoteFounder !== localFounder
        ) {
          merged.diamonds = state.profile.diamonds;
          merged.founderDiamondsClaimed = state.profile.founderDiamondsClaimed;
          merged.activeOperatorId = state.profile.activeOperatorId;
          merged.unlockedOperators = state.profile.unlockedOperators;
          merged.unlockedWeapons = state.profile.unlockedWeapons;
          merged.unlockedWeaponSkins = state.profile.unlockedWeaponSkins;
          merged.equippedWeaponSkins = state.profile.equippedWeaponSkins;
          merged.vipBattlePass = state.profile.vipBattlePass;
        }
      }

      state.profile = merged;
      state.lastSyncedAt = merged.updatedAt;
      persistLocalProfile(merged);
      if (!hasRecentLocalLoadoutEdit && !hasRecentDiamondMutation) {
        applyCloudLoadoutSnapshot(merged);
        applyCloudCallingCardSnapshot(merged.equippedCallingCardId);
      }
      applyCloudDailyContractsSnapshot(merged.dailyContracts);
      if (!hasRecentDiamondMutation) {
        applyCloudVipBattlePassSnapshot(merged.vipBattlePass);
        applyCloudOperatorSnapshot(merged);
      }
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
  const unlockedWeaponSkins = Array.from(
    new Set([
      ...(state.profile.unlockedWeaponSkins || []),
      ...(loadoutSnap.purchasedSkinIds || []),
      ...Object.values(loadoutSnap.equippedWeaponSkins || {}).filter(
        (v): v is string => typeof v === 'string' && v.length > 0
      ),
    ])
  ).slice(0, 60);
  const unlockedGearIds = Array.from(
    new Set([
      ...(state.profile.unlockedGearIds || []),
      ...(loadoutSnap.purchasedGearIds || []),
    ])
  ).slice(0, 40);
  state.profile = {
    ...state.profile,
    activeWeapon: loadoutSnap.activeWeapon || state.profile.activeWeapon,
    unlockedWeapons,
    unlockedWeaponSkins,
    unlockedGearIds,
    selectedClass: loadoutSnap.selectedClass || state.profile.selectedClass || 'FUZILEIRO',
    classLoadouts: loadoutSnap.classLoadouts || state.profile.classLoadouts,
    equippedWeaponOptics: loadoutSnap.equippedWeaponOptics,
    equippedWeaponSkins: loadoutSnap.equippedWeaponSkins,
    equippedWeaponGunsmith: loadoutSnap.equippedWeaponGunsmith,
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  scheduleCloudPush();
});

registerCloudCallingCardHook((cardId) => {
  lastLocalLoadoutMutationMs = Date.now();
  state.profile = {
    ...state.profile,
    equippedCallingCardId: cardId.slice(0, 48),
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  void pushProfileToFirestoreNow();
});

export async function updatePlayerClanCloudMeta(patch: {
  clanId?: string;
  clanTokens?: number;
  purchasedClanOfferIds?: string[];
}): Promise<void> {
  lastLocalLoadoutMutationMs = Date.now();
  state.profile = {
    ...state.profile,
    ...(patch.clanId !== undefined ? { clanId: patch.clanId.slice(0, 24) } : {}),
    ...(patch.clanTokens !== undefined
      ? { clanTokens: Math.max(0, Math.floor(patch.clanTokens)) }
      : {}),
    ...(patch.purchasedClanOfferIds !== undefined
      ? {
          purchasedClanOfferIds: Array.from(
            new Set(patch.purchasedClanOfferIds)
          ).slice(0, 30),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  persistLocalProfile(state.profile);
  emitState();
  if (auth.currentUser) {
    await pushProfileToFirestoreNow();
  }
}

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

function anchorProfileToServerBaseline(
  candidate: PlayerCloudProfile,
  serverData: Partial<PlayerCloudProfile> | null
): PlayerCloudProfile {
  if (!serverData) return candidate;
  const serverCreatedAt =
    typeof serverData.createdAt === 'string' &&
    serverData.createdAt.length >= 10 &&
    serverData.createdAt.length <= 40
      ? serverData.createdAt
      : candidate.createdAt;
  const serverCallsign =
    typeof serverData.callsign === 'string' && serverData.callsign.trim().length > 0
      ? serverData.callsign.slice(0, 32)
      : candidate.callsign;
  const serverCallsignLocked = Boolean(serverData.callsignLocked);
  const serverXp = Math.max(0, Math.floor(Number(serverData.playerXp) || 0));
  const serverCash = Math.max(0, Math.floor(Number(serverData.playerCash) || 0));
  const nextXp = Math.max(candidate.playerXp, serverXp);
  const nextCash = Math.max(candidate.playerCash, serverCash);
  const nextRank = getRankForXp(nextXp);
  const serverMatchesPlayed = Math.max(0, Math.floor(Number(serverData.matchesPlayed) || 0));
  const nextMatchesPlayed = Math.max(candidate.matchesPlayed, serverMatchesPlayed);
  const nextMatchesWon = Math.min(
    nextMatchesPlayed,
    Math.max(candidate.matchesWon, Math.max(0, Math.floor(Number(serverData.matchesWon) || 0)))
  );

  return {
    ...candidate,
    createdAt: serverCreatedAt,
    callsign: serverCallsignLocked ? serverCallsign : candidate.callsign,
    callsignLocked: serverCallsignLocked || Boolean(candidate.callsignLocked),
    playerXp: nextXp,
    rankLevel: nextRank.level,
    rankTitle: nextRank.title,
    playerCash: nextCash,
    totalKills: Math.max(candidate.totalKills, Math.max(0, Math.floor(Number(serverData.totalKills) || 0))),
    totalDeaths: Math.max(candidate.totalDeaths, Math.max(0, Math.floor(Number(serverData.totalDeaths) || 0))),
    totalAssists: Math.max(candidate.totalAssists, Math.max(0, Math.floor(Number(serverData.totalAssists) || 0))),
    totalHeadshots: Math.max(candidate.totalHeadshots, Math.max(0, Math.floor(Number(serverData.totalHeadshots) || 0))),
    matchesPlayed: nextMatchesPlayed,
    matchesWon: nextMatchesWon,
    bombsPlanted: Math.max(candidate.bombsPlanted, Math.max(0, Math.floor(Number(serverData.bombsPlanted) || 0))),
    mmr:
      typeof serverData.mmr === 'number' && serverData.mmr >= 100 && serverData.mmr <= 10000
        ? serverData.mmr
        : candidate.mmr,
    founderDiamondsClaimed:
      Boolean(serverData.founderDiamondsClaimed) || Boolean(candidate.founderDiamondsClaimed),
  };
}

async function fetchAuthoritativeServerProfile(
  uid: string
): Promise<Partial<PlayerCloudProfile> | null> {
  const playerRef = doc(db, 'players', uid);
  try {
    const snap = await getDocFromServer(playerRef);
    return snap.exists() ? (snap.data() as Partial<PlayerCloudProfile>) : null;
  } catch {
    try {
      const fallbackSnap = await getDoc(playerRef);
      return fallbackSnap.exists()
        ? (fallbackSnap.data() as Partial<PlayerCloudProfile>)
        : null;
    } catch {
      return null;
    }
  }
}

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
  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

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
  if (!user) {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
    lastLocalDiamondMutationMs = Date.now();
    return { ok: true, granted: FOUNDER_WELCOME_DIAMONDS };
  }

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        lastLocalDiamondMutationMs = Date.now();
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        return { ok: true, granted: FOUNDER_WELCOME_DIAMONDS };
      } catch (firstErr) {
        // Reconcile against authoritative server doc (handles stale createdAt, locked callsign, or prior commit)
        const serverData = await fetchAuthoritativeServerProfile(user.uid);
        if (serverData && serverData.founderDiamondsClaimed === true) {
          const adopted = mergeLocalAndCloudProfiles(updatedProfile, serverData, user);
          state.profile = adopted;
          persistLocalProfile(adopted);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = adopted.updatedAt;
          state.syncError = null;
          emitState();
          return { ok: true, granted: FOUNDER_WELCOME_DIAMONDS };
        }

        try {
          const retryNowIso = new Date().toISOString();
          const serverDiamonds = Math.max(
            0,
            Math.floor(Number(serverData?.diamonds) || 0)
          );
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: Math.min(1_000_000, serverDiamonds + FOUNDER_WELCOME_DIAMONDS),
              founderDiamondsClaimed: true,
              updatedAt: retryNowIso,
            },
            serverData
          );
          const retryPayload = buildCloudSafeProfilePayload(anchored, user.uid);
          await setDoc(playerRef, retryPayload);
          state.profile = anchored;
          persistLocalProfile(anchored);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          emitState();
          return { ok: true, granted: FOUNDER_WELCOME_DIAMONDS };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          persistLocalProfile(prevProfile);
          emitState();
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Não foi possível sincronizar o resgate de Diamantes com a nuvem. Verifique sua conexão e tente novamente.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
  }
}

const ALLOWED_DIAMOND_PACK_AMOUNTS: Record<string, number> = {
  pack_400: 400,
  pack_800: 880,
  pack_1800: 2050,
  pack_4000: 4800,
};

export async function creditPurchasedDiamondPack(params: {
  packId: string;
  purchaseToken: string;
}): Promise<{
  ok: boolean;
  credited?: number;
  newBalance?: number;
  error?: string;
}> {
  await ensureCloudProfileHydrated();
  const creditedAmount = ALLOWED_DIAMOND_PACK_AMOUNTS[params.packId];
  if (!creditedAmount || !params.purchaseToken) {
    return {
      ok: false,
      error: 'Pacote ou token de compra da Google Play inválido.',
    };
  }

  clearPendingCloudPushTimer();
  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

  const prevProfile = { ...state.profile };
  const currentDiamonds = Math.max(0, Math.floor(Number(state.profile.diamonds) || 0));
  const nextDiamonds = Math.min(1_000_000, currentDiamonds + creditedAmount);
  const nowIso = new Date().toISOString();

  const updatedProfile: PlayerCloudProfile = {
    ...state.profile,
    diamonds: nextDiamonds,
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (!user) {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
    return { ok: true, credited: creditedAmount, newBalance: nextDiamonds };
  }

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        lastLocalDiamondMutationMs = Date.now();
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        return { ok: true, credited: creditedAmount, newBalance: nextDiamonds };
      } catch (firstErr) {
        try {
          const serverData = await fetchAuthoritativeServerProfile(user.uid);
          const serverDiamonds = Math.max(
            0,
            Math.floor(Number(serverData?.diamonds) || 0)
          );
          const reconciledBalance = Math.min(1_000_000, serverDiamonds + creditedAmount);
          const retryNowIso = new Date().toISOString();
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: reconciledBalance,
              updatedAt: retryNowIso,
            },
            serverData
          );
          await setDoc(playerRef, buildCloudSafeProfilePayload(anchored, user.uid));
          state.profile = anchored;
          persistLocalProfile(anchored);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          emitState();
          return { ok: true, credited: creditedAmount, newBalance: reconciledBalance };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          persistLocalProfile(prevProfile);
          emitState();
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Não foi possível salvar os Diamantes comprados na nuvem.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
  }
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
  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

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
    unlockedOperators: Array.from(nextUnlockedOperators).slice(0, 40),
    updatedAt: nowIso,
  };

  state.profile = updatedProfile;
  persistLocalProfile(updatedProfile);
  emitState();

  const user = auth.currentUser;
  if (!user) {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
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

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        lastLocalDiamondMutationMs = Date.now();
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        return {
          ok: true,
          results: resolvedResults,
          nextPityCount: rolled.nextPityCount,
          totalCashGained,
          totalXpGained,
          unlockedWeaponId: firstUnlockedWeaponId,
          unlockedOperatorId: firstUnlockedOperatorId,
        };
      } catch (firstErr) {
        try {
          const serverData = await fetchAuthoritativeServerProfile(user.uid);
          const serverDiamonds = Math.max(0, Math.floor(Number(serverData?.diamonds) || 0));
          if (serverDiamonds < cost) {
            throw new Error('Saldo insuficiente no servidor.');
          }
          const retryNowIso = new Date().toISOString();
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: serverDiamonds - cost,
              updatedAt: retryNowIso,
            },
            serverData
          );
          await setDoc(playerRef, buildCloudSafeProfilePayload(anchored, user.uid));
          state.profile = anchored;
          persistLocalProfile(anchored);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          emitState();
          return {
            ok: true,
            results: resolvedResults,
            nextPityCount: rolled.nextPityCount,
            totalCashGained,
            totalXpGained,
            unlockedWeaponId: firstUnlockedWeaponId,
            unlockedOperatorId: firstUnlockedOperatorId,
          };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          persistLocalProfile(prevProfile);
          emitState();
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Falha ao sincronizar abertura da Caixa com o servidor.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
  }
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
  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

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
  if (!user) {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
    return { ok: true, weaponId: offer.weaponId, skinId: offer.skinId };
  }

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        lastLocalDiamondMutationMs = Date.now();
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        return { ok: true, weaponId: offer.weaponId, skinId: offer.skinId };
      } catch (firstErr) {
        try {
          const serverData = await fetchAuthoritativeServerProfile(user.uid);
          const serverDiamonds = Math.max(0, Math.floor(Number(serverData?.diamonds) || 0));
          if (serverDiamonds < offer.diamondPrice) {
            throw new Error('Saldo insuficiente no servidor.');
          }
          const retryNowIso = new Date().toISOString();
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: serverDiamonds - offer.diamondPrice,
              updatedAt: retryNowIso,
            },
            serverData
          );
          await setDoc(playerRef, buildCloudSafeProfilePayload(anchored, user.uid));
          state.profile = anchored;
          persistLocalProfile(anchored);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          emitState();
          return { ok: true, weaponId: offer.weaponId, skinId: offer.skinId };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          persistLocalProfile(prevProfile);
          emitState();
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Falha ao validar compra da arma no servidor.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
  }
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
  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

  const prevProfile = { ...state.profile };
  const opSnap = getOperatorOwnershipState();
  const nextUnlockedOps = Array.from(
    new Set([
      'op_vanguard_default',
      ...opSnap.unlockedOperatorIds,
      ...(state.profile.unlockedOperators || []),
      op.id,
    ])
  ).slice(0, 40);
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
  if (!user) {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
    return { ok: true };
  }

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        lastLocalDiamondMutationMs = Date.now();
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        return { ok: true };
      } catch (firstErr) {
        try {
          const serverData = await fetchAuthoritativeServerProfile(user.uid);
          const serverDiamonds = Math.max(0, Math.floor(Number(serverData?.diamonds) || 0));
          if (serverDiamonds < op.diamondPrice) {
            throw new Error('Saldo insuficiente no servidor.');
          }
          const retryNowIso = new Date().toISOString();
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: serverDiamonds - op.diamondPrice,
              updatedAt: retryNowIso,
            },
            serverData
          );
          await setDoc(playerRef, buildCloudSafeProfilePayload(anchored, user.uid));
          state.profile = anchored;
          persistLocalProfile(anchored);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          emitState();
          return { ok: true };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          persistLocalProfile(prevProfile);
          emitState();
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Falha ao validar compra do Operador no servidor.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
  }
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
  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

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
  if (!user) {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
    return { ok: true };
  }

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        lastLocalDiamondMutationMs = Date.now();
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        return { ok: true };
      } catch (firstErr) {
        try {
          const serverData = await fetchAuthoritativeServerProfile(user.uid);
          const serverDiamonds = Math.max(0, Math.floor(Number(serverData?.diamonds) || 0));
          if (serverDiamonds < skin.diamondPrice!) {
            throw new Error('Saldo insuficiente no servidor.');
          }
          const retryNowIso = new Date().toISOString();
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: serverDiamonds - skin.diamondPrice!,
              updatedAt: retryNowIso,
            },
            serverData
          );
          await setDoc(playerRef, buildCloudSafeProfilePayload(anchored, user.uid));
          state.profile = anchored;
          persistLocalProfile(anchored);
          lastLocalDiamondMutationMs = Date.now();
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          emitState();
          return { ok: true };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          persistLocalProfile(prevProfile);
          emitState();
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Falha ao validar compra da Skin no servidor.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
  }
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

  cloudWriteEpoch++;
  pendingDiamondMutationCount++;
  lastLocalDiamondMutationMs = Date.now();

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
    unlockedWeaponSkins: Array.from(
      new Set([
        ...(state.profile.unlockedWeaponSkins || []),
        ...(getCloudLoadoutSnapshot().purchasedSkinIds || []),
        nextVip.weaponOfMonthSkinId,
      ])
    ).slice(0, 60),
    updatedAt: nowIso,
  };

  try {
    return await enqueueCloudWrite(async () => {
      const playerRef = doc(db, 'players', user.uid);
      const cloudSafePayload = buildCloudSafeProfilePayload(updatedProfile, user.uid);
      try {
        state.isSyncing = true;
        emitState();
        await setDoc(playerRef, cloudSafePayload);
        state.profile = updatedProfile;
        state.lastSyncedAt = nowIso;
        state.syncError = null;
        lastLocalDiamondMutationMs = Date.now();
        commitActivatedVipStateLocal(nextVip);
        grantVipWeaponAndSkin(nextVip.weaponOfMonthId, nextVip.weaponOfMonthSkinId);
        persistLocalProfile(updatedProfile);
        emitState();
        return {
          ok: true,
          weaponId: nextVip.weaponOfMonthId,
          skinId: nextVip.weaponOfMonthSkinId,
        };
      } catch (firstErr) {
        try {
          const serverData = await fetchAuthoritativeServerProfile(user.uid);
          const serverDiamonds = Math.max(0, Math.floor(Number(serverData?.diamonds) || 0));
          if (serverDiamonds < VIP_PASS_DIAMOND_PRICE) {
            throw new Error('Saldo insuficiente no servidor.');
          }
          const retryNowIso = new Date().toISOString();
          const anchored = anchorProfileToServerBaseline(
            {
              ...updatedProfile,
              diamonds: serverDiamonds - VIP_PASS_DIAMOND_PRICE,
              updatedAt: retryNowIso,
            },
            serverData
          );
          await setDoc(playerRef, buildCloudSafeProfilePayload(anchored, user.uid));
          state.profile = anchored;
          state.lastSyncedAt = retryNowIso;
          state.syncError = null;
          lastLocalDiamondMutationMs = Date.now();
          commitActivatedVipStateLocal(nextVip);
          grantVipWeaponAndSkin(nextVip.weaponOfMonthId, nextVip.weaponOfMonthSkinId);
          persistLocalProfile(anchored);
          emitState();
          return {
            ok: true,
            weaponId: nextVip.weaponOfMonthId,
            skinId: nextVip.weaponOfMonthSkinId,
          };
        } catch (retryErr) {
          lastLocalDiamondMutationMs = 0;
          state.profile = prevProfile;
          handleFirestoreError(retryErr || firstErr, OperationType.WRITE, `players/${user.uid}`);
          return {
            ok: false,
            error: 'Não foi possível validar a compra do Passe VIP no servidor. Tente novamente.',
          };
        }
      } finally {
        state.isSyncing = false;
        emitState();
      }
    });
  } finally {
    pendingDiamondMutationCount = Math.max(0, pendingDiamondMutationCount - 1);
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
