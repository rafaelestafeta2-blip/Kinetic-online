import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { ControlSettings } from '../controls/hudLayoutSettings';
import {
  CloudSyncState,
  getCloudSyncState,
  subscribePlayerProfile,
  syncProgressionFromLocal,
} from '../firebase/playerCloudSync';
import { subscribeSocialInbox } from '../firebase/friendsSocialService';
import { GameSettings } from '../graphics/graphicsSettings';
import { mobileHardware } from '../mobile/nativeHardware';
import {
  createSquadReadyRoom,
  getActiveOnlineRoom,
  getLocalEffectiveUid,
  subscribeOnlineRoom,
  updateSquadRoomConfig,
} from '../multiplayer/onlineRoomService';
import { MatchQueueType, OnlineRoomState } from '../multiplayer/onlineTypes';
import {
  getNextRank,
  getRankForXp,
  loadSavedPlayerCash,
  loadSavedPlayerXp,
} from '../progression/ranks';
import {
  PlayerInventoryState,
  getPlayerInventoryState,
  subscribePlayerInventory,
  syncEquippedWeaponToInventory,
} from '../progression/loadoutSystem';
import { subscribeDailyContracts } from '../progression/dailyContractsSystem';
import { DrillMode, WeaponId } from '../types/game';
import { ActiveSquadDockBar } from './ActiveSquadDockBar';
import { CompetitiveRankedScreen } from './CompetitiveRankedScreen';
import { DailyContractsModal } from './DailyContractsModal';
import { DownloadCenterModal } from './DownloadCenterModal';
import { FriendsSocialModal } from './FriendsSocialModal';
import { GraphicsSettingsPanel } from './GraphicsSettingsPanel';
import { InventoryLoadoutModal } from './InventoryLoadoutModal';
import { MainMenuOverlays } from './MainMenuOverlays';
import { MainMenuPlayPanel } from './MainMenuPlayPanel';
import { MainMenuRanksModal } from './MainMenuRanksModal';
import { MainMenuTopNav } from './MainMenuTopNav';
import { MenuBackground } from './MenuBackground';
import { OnlineLobbyModal } from './OnlineLobbyModal';
import { PlayerProfileModal } from './PlayerProfileModal';
import { SquadReadyRoomModal } from './SquadReadyRoomModal';
import { VipBattlePassModal } from './VipBattlePassModal';
import { WarfaceDiamondStoreModal } from './WarfaceDiamondStoreModal';
import { WeaponInspectionModal } from './WeaponInspectionModal';

interface MainMenuProps {
  onStartTraining: () => void;
  onStartDrill: (mode: DrillMode) => void;
  onStartMatchmaking: (targetMode: DrillMode) => void;
  activeWeapon: WeaponId;
  onSelectStartingWeapon: (weaponId: WeaponId) => void;
  gameSettings?: GameSettings;
  onUpdateGameSettings?: (settings: GameSettings) => void;
  onResetGameSettings?: () => void;
  controlSettings?: ControlSettings;
  onUpdateControlSettings?: (next: ControlSettings) => void;
  onRecalibrateGyro?: () => void;
  initialOpenSquadRoom?: boolean;
  onConsumeInitialOpenSquadRoom?: () => void;
}

const WEAPON_DISPLAY_NAMES: Record<
  WeaponId,
  { name: string; caliber: string; category: string }
> = {
  P50_PISTOL: { name: 'DESERT EAGLE .50AE', caliber: '.50 AE', category: 'Pistola Pesada' },
  M1911_PISTOL: { name: 'COLT M1911A1 .45', caliber: '.45 ACP', category: 'Pistola Tática' },
  M4_CARBINE: { name: 'MX16A4 / M4 TÁTICA', caliber: '5.56x45mm', category: 'Fuzil de Assalto' },
  SMG_45: { name: 'V18 SPECTRE SILENCIADA', caliber: '9x19mm Subsonic', category: 'SMG Engenheiro Silenciada' },
  SMG_MP5: { name: 'MPS5 TÁTICA 9MM', caliber: '9x19mm', category: 'Submetralhadora' },
  SHOTGUN_12: { name: 'DRAKE-12 BREACHER', caliber: 'Calibre 12', category: 'Escopeta Curto Alcance' },
  SHOTGUN_SPAS: { name: 'SPAS-12 TÁTICA 12GA', caliber: 'Calibre 12', category: 'Escopeta Semiautomática' },
  AK47_RIFLE: { name: 'AK-47 COMANDO', caliber: '7.62x39mm', category: 'Fuzil de Assalto' },
  AK12_RIFLE: { name: 'AK-200 TÁTICA', caliber: '5.45x39mm', category: 'Fuzil de Assalto' },
  S_MILITARY: { name: 'SCAR-L S-MILITARY', caliber: '5.56x45mm NATO', category: 'Fuzil de Assalto' },
  CARBINE_AR: { name: 'CARABINA TÁTICA', caliber: '5.56x45mm', category: 'Carabina de Precisão' },
  L49_LMG: { name: 'LMG PESADA 100R', caliber: '5.56x45mm', category: 'Metralhadora Leve' },
  SNIPER_TACTICAL: { name: 'MK14 EBR TÁTICA', caliber: '.308 Win', category: 'Fuzil Sniper' },
  SNIPER_BOLT: { name: 'KAR98K PRECISÃO', caliber: '7.92x57mm', category: 'Fuzil de Precisão' },
  SNIPER_AWP: { name: 'AWP-M .338 LUNETA', caliber: '.338 Lapua', category: 'Sniper Ferrolho 6x' },
  SNIPER_HEAVY: { name: 'M200 INTERVENTION', caliber: '.408 CheyTac', category: 'Sniper Anti-Material' },
  RPG7_LAUNCHER: { name: 'RPG-7V LANÇA-FOGUETES', caliber: '85mm PG-7V', category: 'Lançador Pesado' },
  KNIFE_TACTICAL: { name: 'FACA TÁTICA COMBATE', caliber: 'Aço Carbono', category: 'Lâmina Corpo a Corpo' },
};

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartTraining,
  onStartDrill,
  onStartMatchmaking,
  activeWeapon,
  onSelectStartingWeapon,
  gameSettings,
  onUpdateGameSettings,
  onResetGameSettings,
  controlSettings,
  onUpdateControlSettings,
  onRecalibrateGyro,
  initialOpenSquadRoom = false,
  onConsumeInitialOpenSquadRoom,
}) => {
  const [activeTab, setActiveTab] = useState<
    'PLAY' | 'STORE' | 'INVENTORY' | 'WEAPON' | 'RANKS' | 'BATTLE_PASS' | 'SETTINGS'
  >('PLAY');
  const [inventoryState, setInventoryState] = useState<PlayerInventoryState>(() =>
    getPlayerInventoryState()
  );
  const [showNewsModal, setShowNewsModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [showContractsModal, setShowContractsModal] = useState(false);
  const [contractsBadgeCount, setContractsBadgeCount] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showDownloadCenter, setShowDownloadCenter] = useState(false);
  const [socialBadgeCount, setSocialBadgeCount] = useState(0);
  const [showOnlineLobby, setShowOnlineLobby] = useState(false);
  const [showSquadRoom, setShowSquadRoom] = useState(false);
  const [activeRoom, setActiveRoom] = useState<OnlineRoomState | null>(() =>
    getActiveOnlineRoom()
  );
  const [showRankedScreen, setShowRankedScreen] = useState(false);
  const [onlineLobbyArena, setOnlineLobbyArena] = useState<DrillMode>('DUST2_BOMB_5V5');
  const [syncState, setSyncState] = useState<CloudSyncState>(() =>
    getCloudSyncState()
  );

  useEffect(() => {
    soundEngine.playMenuMusic();
    const unsub = subscribePlayerProfile((next) => setSyncState(next));
    const unsubInv = subscribePlayerInventory((next) => setInventoryState(next));
    const unsubContracts = subscribeDailyContracts((snap) =>
      setContractsBadgeCount(snap.claimableCount)
    );
    const unsubSocial = subscribeSocialInbox((inbox) => {
      const reqCount = Object.keys(inbox.requests || {}).length;
      const invCount = Object.keys(inbox.invites || {}).length;
      setSocialBadgeCount(reqCount + invCount);
    });
    const unsubRoom = subscribeOnlineRoom((room) => {
      setActiveRoom(room);
      if (!room) setShowSquadRoom(false);
    });
    return () => {
      unsub();
      unsubInv();
      unsubContracts();
      unsubSocial();
      unsubRoom();
      soundEngine.stopMenuMusic();
    };
  }, []);

  // Re-open Squad Ready Room automatically when returning from a match via "Voltar para a Sala"
  useEffect(() => {
    if (initialOpenSquadRoom && getActiveOnlineRoom()) {
      setShowSquadRoom(true);
      onConsumeInitialOpenSquadRoom?.();
    }
  }, [initialOpenSquadRoom, onConsumeInitialOpenSquadRoom]);

  const launchedPlayingRoomRef = useRef<string | null>(null);

  // Single source of truth: whenever the active squad room enters PLAYING
  // (whether the modal is open or minimized while browsing Store/Inventory),
  // launch the match exactly once.
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== 'PLAYING') {
      launchedPlayingRoomRef.current = null;
      return;
    }
    if (launchedPlayingRoomRef.current === activeRoom.roomId) return;
    launchedPlayingRoomRef.current = activeRoom.roomId;
    setShowSquadRoom(false);
    soundEngine.playMenuSelect();
    soundEngine.stopMenuMusic();
    void mobileHardware.enterFullscreenLandscape().finally(() => {
      onStartDrill(activeRoom.arenaMode);
    });
  }, [activeRoom, onStartDrill]);

  const playerXp = Math.max(loadSavedPlayerXp(), syncState.profile.playerXp);
  const currentRank = getRankForXp(playerXp);
  const nextRank = getNextRank(currentRank.level);
  const xpCurrentLevelBase = currentRank.requiredXp;
  const xpForNextLevel = nextRank ? nextRank.requiredXp : currentRank.requiredXp + 5000;
  const xpLevelProgress = Math.max(
    0,
    Math.min(
      100,
      ((playerXp - xpCurrentLevelBase) / (xpForNextLevel - xpCurrentLevelBase)) * 100
    )
  );
  const savedCash = loadSavedPlayerCash();

  const handleHover = () => {
    soundEngine.playMenuHover();
  };

  const handleLaunchTraining = async () => {
    soundEngine.playMenuSelect();
    soundEngine.stopMenuMusic();
    await mobileHardware.enterFullscreenLandscape();
    onStartTraining();
  };

  const handleLaunchDrill = async (mode: DrillMode) => {
    soundEngine.playMenuSelect();
    soundEngine.stopMenuMusic();
    await mobileHardware.enterFullscreenLandscape();
    onStartDrill(mode);
  };

  const handleLaunchMatchmaking = async (targetMode: DrillMode) => {
    soundEngine.playMenuSelect();
    soundEngine.stopMenuMusic();
    await mobileHardware.enterFullscreenLandscape();
    onStartMatchmaking(targetMode);
  };

  const handleOpenSquadRoom = async (
    targetMode: DrillMode,
    queueType: MatchQueueType,
    isPrivate: boolean
  ) => {
    soundEngine.playMenuSelect();
    const existing = getActiveOnlineRoom();
    if (existing) {
      if (existing.hostUid === getLocalEffectiveUid() && !existing.isSearchingMatch) {
        updateSquadRoomConfig(targetMode, queueType);
      }
      setShowSquadRoom(true);
      return;
    }
    const created = await createSquadReadyRoom(targetMode, queueType, isPrivate);
    if (created) {
      setShowSquadRoom(true);
    } else {
      // Offline fallback if Firestore room creation failed
      await handleLaunchDrill(targetMode);
    }
  };

  const classEquippedPrimary =
    inventoryState.classLoadouts[inventoryState.selectedClass]?.primaryWeapon ||
    activeWeapon;
  const heroEquippedWeapon: WeaponId =
    classEquippedPrimary in WEAPON_DISPLAY_NAMES ? classEquippedPrimary : activeWeapon;
  const activeWeaponMeta = WEAPON_DISPLAY_NAMES[heroEquippedWeapon];

  return (
    <div
      onClick={() => {
        soundEngine.playMenuMusic();
        void mobileHardware.enterFullscreenLandscape();
      }}
      className="fixed inset-0 z-40 h-[100dvh] max-h-[100dvh] bg-[#06080c] select-none text-white flex flex-col justify-between overflow-hidden font-sans"
    >
      {/* 1. BACKGROUND (Soldado 3D .glb centralizado + Bandeira 3D Blackthorn atrás) */}
      <MenuBackground
        showHero={activeTab === 'PLAY' && !showRankedScreen}
        activeWeapon={heroEquippedWeapon}
        selectedClass={inventoryState.selectedClass}
      />

      {/* 2. TOP HEADER BAR (Único local de Perfil, Amigos, Correio e Configurações) */}
      <MainMenuTopNav
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        onHover={handleHover}
        playerCashBalance={savedCash}
        currentRank={currentRank}
        xpLevelProgress={xpLevelProgress}
        syncState={syncState}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenDownloads={() => setShowDownloadCenter(true)}
        onOpenFriends={() => setShowFriendsModal(true)}
        onToggleNews={() => setShowNewsModal((prev) => !prev)}
        socialBadgeCount={socialBadgeCount}
      />

      {/* 3. CORPO PRINCIPAL LIMPO (Rail Esquerdo + Centro Livre sobre o Soldado 3D + Direita) */}
      <main
        className={`relative z-10 flex-1 min-h-0 flex items-center pointer-events-none overflow-hidden ${
          activeTab === 'STORE'
            ? 'justify-stretch p-0'
            : activeTab === 'PLAY'
              ? 'justify-between px-2.5 sm:px-4 lg:px-6 py-1 lg:py-2.5'
              : 'justify-center px-2.5 sm:px-4 lg:px-6 py-1 lg:py-2.5'
        }`}
      >
        {activeTab === 'PLAY' && (
          <MainMenuPlayPanel
            activeWeapon={heroEquippedWeapon}
            selectedClass={inventoryState.selectedClass}
            weaponName={activeWeaponMeta.name}
            weaponCategory={activeWeaponMeta.category}
            weaponCaliber={activeWeaponMeta.caliber}
            playerMmr={syncState.profile.mmr || 2450}
            onOpenStoreTab={() => setActiveTab('STORE')}
            onOpenInventory={() => setActiveTab('INVENTORY')}
            onOpenWeaponSelect={() => setActiveTab('WEAPON')}
            onStartTraining={handleLaunchTraining}
            onStartDrill={handleLaunchDrill}
            onStartMatchmaking={handleLaunchMatchmaking}
            onOpenRankedScreen={(targetMode) => {
              setOnlineLobbyArena(targetMode);
              setShowRankedScreen(true);
            }}
            onOpenOnlineLobby={(targetMode) => {
              setOnlineLobbyArena(targetMode);
              setShowOnlineLobby(true);
            }}
            onOpenSquadRoom={(targetMode, queueType, isPrivate) => {
              void handleOpenSquadRoom(targetMode, queueType, isPrivate);
            }}
            onOpenRanksTab={() => setActiveTab('RANKS')}
            onOpenBattlePassTab={() => setActiveTab('BATTLE_PASS')}
            onOpenEventsModal={() => setShowEventsModal(true)}
            onOpenContractsModal={() => setShowContractsModal(true)}
            contractsBadgeCount={contractsBadgeCount}
            onHover={handleHover}
          />
        )}

        {activeTab === 'STORE' && (
          <WarfaceDiamondStoreModal
            activeWeapon={activeWeapon}
            playerXp={playerXp}
            playerCash={savedCash}
            syncState={syncState}
            onSelectWeapon={(wId) => {
              onSelectStartingWeapon(wId);
              syncEquippedWeaponToInventory(wId);
              syncProgressionFromLocal(playerXp, savedCash, wId);
            }}
            onOpenVipPass={() => setActiveTab('BATTLE_PASS')}
            onClose={() => setActiveTab('PLAY')}
          />
        )}

        {activeTab === 'INVENTORY' && (
          <InventoryLoadoutModal
            playerXp={playerXp}
            playerCash={savedCash}
            onSyncEquippedWeapon={(wId) => {
              onSelectStartingWeapon(wId);
              syncProgressionFromLocal(playerXp, savedCash, wId);
            }}
            onOpenWeaponGunsmith={() => setActiveTab('WEAPON')}
            onClose={() => setActiveTab('PLAY')}
          />
        )}

        {activeTab === 'WEAPON' && (
          <WeaponInspectionModal
            activeWeapon={activeWeapon}
            playerXp={playerXp}
            onSelectWeapon={(wId) => {
              onSelectStartingWeapon(wId);
              syncEquippedWeaponToInventory(wId);
              syncProgressionFromLocal(playerXp, savedCash, wId);
            }}
            onClose={() => setActiveTab('PLAY')}
            onStartTraining={handleLaunchTraining}
          />
        )}

        {activeTab === 'RANKS' && (
          <MainMenuRanksModal
            currentRank={currentRank}
            playerXp={playerXp}
            onClose={() => setActiveTab('PLAY')}
          />
        )}

        {activeTab === 'SETTINGS' && gameSettings && onUpdateGameSettings && (
          <GraphicsSettingsPanel
            settings={gameSettings}
            onUpdateSettings={onUpdateGameSettings}
            onResetDefaults={() => onResetGameSettings && onResetGameSettings()}
            onClose={() => setActiveTab('PLAY')}
            controlSettings={controlSettings}
            onUpdateControlSettings={onUpdateControlSettings}
            onRecalibrateGyro={onRecalibrateGyro}
          />
        )}

        {activeTab === 'BATTLE_PASS' && (
          <VipBattlePassModal
            playerXp={playerXp}
            syncState={syncState}
            onSelectWeapon={(wId) => {
              onSelectStartingWeapon(wId);
              syncEquippedWeaponToInventory(wId);
              syncProgressionFromLocal(playerXp, savedCash, wId);
            }}
            onClose={() => setActiveTab('PLAY')}
          />
        )}
      </main>

      <MainMenuOverlays
        showEventsModal={showEventsModal}
        onCloseEvents={() => setShowEventsModal(false)}
        showNewsModal={showNewsModal}
        onCloseNews={() => setShowNewsModal(false)}
        onLaunchDrill={(mode) => void handleLaunchDrill(mode)}
        onLaunchTraining={() => void handleLaunchTraining()}
        onOpenPrivateLobby={() => {
          setOnlineLobbyArena('DUST2_BOMB_5V5');
          setShowOnlineLobby(true);
        }}
      />

      <DailyContractsModal
        isOpen={showContractsModal}
        onClose={() => setShowContractsModal(false)}
      />

      {showProfileModal && (
        <PlayerProfileModal
          syncState={syncState}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      <OnlineLobbyModal
        isOpen={showOnlineLobby}
        onClose={() => setShowOnlineLobby(false)}
        selectedMapMode={onlineLobbyArena}
        onSelectMapMode={(mode) => setOnlineLobbyArena(mode)}
        onLaunchOnlineArena={(mode) => {
          setShowOnlineLobby(false);
          void handleLaunchDrill(mode);
        }}
      />

      <FriendsSocialModal
        isOpen={showFriendsModal}
        onClose={() => setShowFriendsModal(false)}
        myCallsign={syncState.profile.callsign}
        onOpenOnlineLobbyWithRoom={(mode) => {
          setShowFriendsModal(false);
          setOnlineLobbyArena(mode);
          setShowSquadRoom(true);
        }}
      />

      <DownloadCenterModal
        isOpen={showDownloadCenter}
        onClose={() => setShowDownloadCenter(false)}
      />

      <SquadReadyRoomModal
        isOpen={showSquadRoom}
        onMinimize={() => setShowSquadRoom(false)}
        onLeaveRoom={() => setShowSquadRoom(false)}
      />

      <ActiveSquadDockBar
        visible={Boolean(activeRoom) && !showSquadRoom && !showRankedScreen}
        onOpenSquadRoom={() => setShowSquadRoom(true)}
        onLeftRoom={() => setShowSquadRoom(false)}
      />

      {showRankedScreen && (
        <CompetitiveRankedScreen
          playerMmr={syncState.profile.mmr || 2450}
          activeWeapon={activeWeapon}
          initialArena={onlineLobbyArena}
          onBackToMainMenu={() => setShowRankedScreen(false)}
          onRankedMatchReady={(mode) => {
            setShowRankedScreen(false);
            void handleLaunchDrill(mode);
          }}
        />
      )}
    </div>
  );
};
