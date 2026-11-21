import React, { useEffect, useMemo, useRef, useState } from 'react';
import squadHangarBgUrl from '../assets/images/squad_room_hangar_bg_1795215265768.jpg';
import { soundEngine } from '../audio/soundEngine';
import {
  ClanServiceState,
  MAX_CLAN_MEMBERS,
  computeClanLevelFromXp,
  getClanServiceState,
  subscribeClanService,
} from '../firebase/clanService';
import {
  sendPartyInviteToFriend,
  SocialInboxState,
  subscribeFriendsOnlineStatus,
  subscribeSocialInbox,
} from '../firebase/friendsSocialService';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import {
  cancelSquadMatchSearch,
  getLocalEffectiveUid,
  isWebSocketConnected,
  joinRoomByCode,
  leaveActiveRoom,
  sendSquadChatMessage,
  setLocalPlayerReady,
  startMatchInActiveRoom,
  startSquadMatchSearch,
  subscribeOnlineRoom,
  subscribeSquadChat,
  switchLocalPlayerTeam,
  updateSquadRoomConfig,
} from '../multiplayer/onlineRoomService';
import {
  MatchQueueType,
  OnlinePlayerState,
  OnlineRoomState,
  SquadChatMessage,
} from '../multiplayer/onlineTypes';
import { VoiceChatState, voiceChatManager } from '../multiplayer/voiceChatManager';
import {
  getEquippedWeaponSkinId,
  getPlayerInventoryState,
} from '../progression/loadoutSystem';
import { getOperatorOwnershipState } from '../progression/operatorSkinsSystem';
import { DrillMode, WeaponId } from '../types/game';
import { ClanCenterTab } from './ClanCenterModal';
import { ClanEmblemIcon, ClanEmblemId } from './ClanEmblemIcons';
import {
  SquadFormation3DCanvas,
  SquadFormationMemberSpec,
} from './SquadFormation3DCanvas';
import { OperatorTacticalAvatar, WarfaceClassId } from './WarfaceClassIcons';
import { WarfaceRankIcon } from './WarfaceRankIcon';

interface SquadReadyRoomModalProps {
  isOpen: boolean;
  onMinimize: () => void;
  onLeaveRoom: () => void;
  onOpenClanModal?: (tab: ClanCenterTab) => void;
}

const PRIVATE_ROOM_MAPS: Array<{
  id: DrillMode;
  label: string;
  modeTag: string;
}> = [
  { id: 'DUST2_BOMB_5V5', label: 'DE_DUST2', modeTag: 'BOMB 5V5' },
  { id: 'STATION_TDM_5V5', label: 'STATION ARENA', modeTag: 'TDM 5V5' },
  { id: 'ASSAULT_BOMB_5V5', label: 'CS_ASSAULT', modeTag: 'BOMB 5V5' },
  { id: 'INDUSTRIA_BOMB_5V5', label: 'INDUSTRIA', modeTag: 'BOMB 5V5' },
  { id: 'HANGAR_BOMB_5V5', label: 'HANGAR', modeTag: 'BOMB 5V5' },
  { id: 'EASTERN_CITY_BOMB_5V5', label: 'EASTERN CITY', modeTag: 'BOMB 5V5' },
  { id: 'MIRAGE_ANUBIS_BOMB_5V5', label: 'MIRAGE ANUBIS', modeTag: 'BOMB 5V5' },
  { id: 'STATION_CAPTURE_5V5', label: 'STATION CTF', modeTag: 'CTF 5V5' },
];

const DEFAULT_SQUAD_WEAPONS: WeaponId[] = [
  'M4_CARBINE',
  'AK12_RIFLE',
  'CARBINE_AR',
  'S_MILITARY',
  'SMG_MP5',
];

const DEFAULT_SQUAD_SKINS: string[] = [
  'crimson_pulse',
  'cyber_cobalt',
  'cyber_cobalt',
  'gold_imperial',
  'default',
];

const DEFAULT_SQUAD_OP_SKINS: string[] = [
  'op_crimson_warden',
  'op_ghost_arctic',
  'op_cobalt_specter',
  'op_aurum_general',
  'op_emerald_viper',
];

function getCompetitiveTierLabel(mmr = 2450): string {
  if (mmr >= 3200) return 'ELITE I';
  if (mmr >= 2850) return 'DIAMANTE I';
  if (mmr >= 2600) return 'PLATINA II';
  if (mmr >= 2350) return 'OURO II';
  if (mmr >= 2100) return 'OURO III';
  if (mmr >= 1800) return 'PRATA I';
  return 'BRONZE I';
}

export const SquadReadyRoomModal: React.FC<SquadReadyRoomModalProps> = ({
  isOpen,
  onMinimize,
  onLeaveRoom,
  onOpenClanModal,
}) => {
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [clanState, setClanState] = useState<ClanServiceState>(() =>
    getClanServiceState()
  );
  const [chatMessages, setChatMessages] = useState<SquadChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [rightTab, setRightTab] = useState<'FRIENDS' | 'JOIN'>('FRIENDS');
  const [inbox, setInbox] = useState<SocialInboxState>({
    uid: '',
    friends: {},
    requests: {},
    invites: {},
    updatedAtMs: 0,
  });
  const [friendsOnlineMap, setFriendsOnlineMap] = useState<Record<string, boolean>>({});
  const [voiceState, setVoiceState] = useState<VoiceChatState>(() =>
    voiceChatManager.getState()
  );
  const [invitedUids, setInvitedUids] = useState<Record<string, boolean>>({});
  const [copiedCode, setCopiedCode] = useState(false);
  const [showRoomInfoPopover, setShowRoomInfoPopover] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinFeedback, setJoinFeedback] = useState<string | null>(null);
  const [joiningCode, setJoiningCode] = useState(false);
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  const [showPrivateMapPicker, setShowPrivateMapPicker] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubRoom = subscribeOnlineRoom((next) => setRoom(next));
    const unsubClan = subscribeClanService((next) => setClanState(next));
    const unsubChat = subscribeSquadChat((msgs) => setChatMessages(msgs));
    const unsubSocial = subscribeSocialInbox((next) => setInbox(next));
    const unsubVoice = voiceChatManager.subscribe((next) => setVoiceState(next));
    return () => {
      unsubRoom();
      unsubClan();
      unsubChat();
      unsubSocial();
      unsubVoice();
    };
  }, []);

  // Subscribe to real friend presence so offline friends never appear online by mistake
  const friendUidsKey = useMemo(
    () => Object.keys(inbox.friends || {}).sort().join(','),
    [inbox.friends]
  );

  useEffect(() => {
    const uids = friendUidsKey ? friendUidsKey.split(',').filter(Boolean) : [];
    const unsubPresence = subscribeFriendsOnlineStatus(uids, (nextMap) => {
      setFriendsOnlineMap(nextMap);
    });
    return () => unsubPresence();
  }, [friendUidsKey]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isOpen]);

  useEffect(() => {
    if (!room?.isSearchingMatch) {
      setSearchElapsedSec(0);
      return;
    }
    const baseMs = room.searchStartedAtMs || Date.now();
    const update = () => {
      setSearchElapsedSec(Math.max(0, Math.floor((Date.now() - baseMs) / 1000)));
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [room?.isSearchingMatch, room?.searchStartedAtMs]);

  const localUid = getLocalEffectiveUid();
  const profile = getCloudSyncState().profile;
  const inv = getPlayerInventoryState();
  const localPrimaryWeapon =
    inv.classLoadouts[inv.selectedClass]?.primaryWeapon || 'M4_CARBINE';
  const localWeaponSkin = getEquippedWeaponSkinId(localPrimaryWeapon);
  const localOperatorSkin = getOperatorOwnershipState().activeOperatorId;

  const activeClan = clanState.myClan;
  const clanLevelInfo = activeClan
    ? computeClanLevelFromXp(activeClan.clanXp)
    : null;
  const displayClanMembersCount = activeClan
    ? Math.max(1, activeClan.memberUids?.length || Object.keys(activeClan.members || {}).length)
    : 0;

  const playersList = useMemo<OnlinePlayerState[]>(() => {
    if (!room?.players) return [];
    const list = Object.values(room.players);
    return list.sort((a, b) => {
      if (a.uid === room.hostUid) return -1;
      if (b.uid === room.hostUid) return 1;
      return a.callsign.localeCompare(b.callsign);
    });
  }, [room]);

  const formationMembers = useMemo<SquadFormationMemberSpec[]>(() => {
    const actualSpecs: SquadFormationMemberSpec[] = playersList.map((p, idx) => {
      const isLocal = p.uid === localUid;
      const wId = isLocal
        ? localPrimaryWeapon
        : p.weaponId || DEFAULT_SQUAD_WEAPONS[idx % DEFAULT_SQUAD_WEAPONS.length];
      return {
        uid: p.uid,
        callsign: p.callsign,
        classId: (p.classId || (isLocal ? inv.selectedClass : 'FUZILEIRO')) as WarfaceClassId,
        weaponId: wId,
        weaponSkinId: isLocal
          ? localWeaponSkin
          : p.weaponSkinId || DEFAULT_SQUAD_SKINS[idx % DEFAULT_SQUAD_SKINS.length],
        operatorSkinId: isLocal
          ? localOperatorSkin
          : DEFAULT_SQUAD_OP_SKINS[idx % DEFAULT_SQUAD_OP_SKINS.length],
        isLeader: p.uid === room?.hostUid,
      };
    });

    // If playersList hasn't hydrated yet on initial frame, only render the local player
    if (actualSpecs.length === 0) {
      actualSpecs.push({
        uid: localUid,
        callsign: profile.callsign || 'OPERADOR',
        classId: inv.selectedClass || 'FUZILEIRO',
        weaponId: localPrimaryWeapon,
        weaponSkinId: localWeaponSkin,
        operatorSkinId: localOperatorSkin,
        isLeader: true,
      });
    }

    return actualSpecs.slice(0, 5);
  }, [
    playersList,
    localUid,
    profile.callsign,
    localPrimaryWeapon,
    localWeaponSkin,
    localOperatorSkin,
    inv.selectedClass,
    room?.hostUid,
  ]);

  if (!isOpen || !room) return null;

  const isHost = room.hostUid === localUid;
  const localPlayer = room.players[localUid];
  const localIsReady = Boolean(localPlayer?.isReady);
  const nonHostPlayers = playersList.filter((p) => p.uid !== room.hostUid);
  const unreadyNonHosts = nonHostPlayers.filter((p) => !p.isReady);
  const allSquadReady = unreadyNonHosts.length === 0;
  const isSearching = Boolean(room.isSearchingMatch);
  const queueType: MatchQueueType = room.queueType === 'RANKED' ? 'RANKED' : 'CASUAL';
  const currentPrivateMapMeta =
    PRIVATE_ROOM_MAPS.find((m) => m.id === room.arenaMode) || PRIVATE_ROOM_MAPS[0];
  const friendsList = Object.values(inbox.friends || {});
  const wsOnline = isWebSocketConnected();

  const searchMins = String(Math.floor(searchElapsedSec / 60)).padStart(2, '0');
  const searchSecs = String(searchElapsedSec % 60).padStart(2, '0');

  const localMmr = localPlayer?.mmr || profile.mmr || 2450;
  const rankTierTitle = getCompetitiveTierLabel(localMmr);

  const modeDisplayLabel = room.isPrivate
    ? 'SALA PRIVADA'
    : queueType === 'RANKED'
      ? 'RANQUEADA'
      : room.arenaMode === 'STATION_TDM_5V5'
        ? 'MATA-MATA'
        : 'CLÁSSICA';

  const matchSubtitleLabel = room.isPrivate
    ? currentPrivateMapMeta.label
    : room.arenaMode === 'STATION_TDM_5V5'
      ? 'STATION ARENA'
      : 'MAPA SORTEADO';

  const handleOpenClanTab = (tab: ClanCenterTab) => {
    soundEngine.playMenuSelect();
    onOpenClanModal?.(tab);
  };

  const handleCopyCode = () => {
    soundEngine.playMenuSelect();
    try {
      void navigator.clipboard?.writeText(room.roomId);
    } catch {
      // ignore clipboard restriction in iframe
    }
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const ok = sendSquadChatMessage(chatInput);
    if (ok) {
      setChatInput('');
    }
  };

  const handleQuickChatCallout = (msg: string) => {
    soundEngine.playMenuSelect();
    sendSquadChatMessage(msg);
  };

  const handleInviteFriend = async (friendUid: string) => {
    soundEngine.playMenuSelect();
    const ok = await sendPartyInviteToFriend(friendUid, room.roomId, room.arenaMode);
    if (ok) {
      setInvitedUids((prev) => ({ ...prev, [friendUid]: true }));
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setJoiningCode(true);
    setJoinFeedback(null);
    const res = await joinRoomByCode(joinCodeInput);
    setJoiningCode(false);
    if (res.ok) {
      setJoinCodeInput('');
      setRightTab('FRIENDS');
      setJoinFeedback(null);
    } else {
      setJoinFeedback(res.error || 'Não foi possível entrar na sala.');
    }
  };

  const handleToggleMic = async () => {
    soundEngine.playMenuSelect();
    if (voiceState.micMode === 'MUTED') {
      await voiceChatManager.setMicMode('OPEN');
    } else {
      await voiceChatManager.setMicMode('MUTED');
    }
  };

  const handleToggleSpeaker = () => {
    soundEngine.playMenuSelect();
    voiceChatManager.toggleTeamChannelMute();
  };

  const handleHostStartSearch = () => {
    if (!allSquadReady) return;
    soundEngine.playMenuSelect();
    if (room.isPrivate) {
      void startMatchInActiveRoom();
      return;
    }
    startSquadMatchSearch();
  };

  const handleLeave = async () => {
    soundEngine.playMenuSelect();
    await leaveActiveRoom();
    onLeaveRoom();
  };

  const bottomCardSlots = [0, 1, 2, 3];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-x-0 bottom-0 top-9 lg:top-12 z-50 bg-[#07090f] select-none pointer-events-auto font-sans overflow-hidden"
    >
      {/* 1. HANGAR SUNSET BACKDROP */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src={squadHangarBgUrl}
          alt="Hangar Tático"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center scale-[1.01] brightness-95 contrast-105"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-transparent to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/50" />
      </div>

      {/* 2. CENTER 3D SQUAD V-FORMATION (.GLB CHARACTERS WALKING INTO FORMATION) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <SquadFormation3DCanvas members={formationMembers} />
      </div>

      {/* 3. MINIMALIST CORNER-ANCHORED HUD OVERLAY (CENTER 100% CLEAN OVER 3D OPERATOR) */}
      <div className="relative z-20 w-full h-full flex flex-col justify-between p-1.5 sm:p-2.5 lg:p-3.5 pointer-events-none">
        {/* TOP BAR: TOP-LEFT BACK/TITLE + TOP-RIGHT RANK BADGE (CENTER COMPLETELY CLEAR) */}
        <div className="flex items-center justify-between gap-2 shrink-0">
          {/* Top-Left Corner: Minimalist Back Button + Room Title & Mode */}
          <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                onMinimize();
              }}
              title="Minimizar Sala e Voltar ao Menu"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#10131b]/90 hover:bg-[#191f2c] border border-amber-400/35 hover:border-amber-400 text-amber-400 flex items-center justify-center shadow-md cursor-pointer transition-all active:scale-95"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 19l-7-7 7-7"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-display font-black text-xs sm:text-sm lg:text-base tracking-wider text-white uppercase leading-none">
                  SALA DE PARTIDA
                </h1>
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  title="Sair da sala"
                  className="px-1.5 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-[8px] font-mono font-bold text-red-200 uppercase cursor-pointer"
                >
                  SAIR ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-300 leading-none mt-0.5">
                <span className="font-bold uppercase">{modeDisplayLabel} · 5V5</span>
                <span>·</span>
                <span className={wsOnline ? 'text-emerald-400' : 'text-amber-300'}>
                  #{room.roomId}
                </span>
              </div>
            </div>
          </div>

          {/* Top-Right Corner: Compact Rank Plaque (kept away from center 3D operator face) */}
          <div className="relative pointer-events-auto">
            <div className="px-2.5 sm:px-3 py-1 rounded-lg bg-[#14110e]/90 border border-amber-400/45 shadow-md flex items-center gap-2">
              <WarfaceRankIcon
                level={localPlayer?.rankLevel || profile.rankLevel || 4}
                className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
              />
              <div className="leading-none">
                <div className="font-display font-black text-[10px] sm:text-xs tracking-wider text-white uppercase">
                  {rankTierTitle}
                </div>
                <div className="font-mono text-[8px] text-amber-300/90 uppercase">
                  {modeDisplayLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setShowRoomInfoPopover((prev) => !prev);
                }}
                title="Código da Sala & MMR"
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white/10 hover:bg-amber-500/30 border border-white/20 text-slate-200 font-serif italic font-bold text-[10px] flex items-center justify-center cursor-pointer"
              >
                i
              </button>
            </div>

            {showRoomInfoPopover && (
              <div className="absolute top-full right-0 mt-1.5 w-56 p-2.5 rounded-lg bg-[#0d111a]/98 border border-amber-400/50 shadow-2xl text-[10px] font-mono text-slate-200 z-40">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/10">
                  <span className="text-amber-300 font-bold">CÓDIGO DA SALA</span>
                  <span className="font-black text-white tracking-widest">
                    {room.roomId}
                  </span>
                </div>
                <div className="text-slate-400 mb-2">
                  MMR do Esquadrão: <strong className="text-amber-300">{localMmr}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="w-full py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-[10px] uppercase cursor-pointer"
                >
                  {copiedCode ? 'CÓDIGO COPIADO ✓' : 'COPIAR CÓDIGO'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE AREA: LEFT (COMPACT CLAN + LIVE CHAT BOX) & RIGHT (COMPACT FRIENDS LIST) */}
        <div className="flex-1 min-h-0 flex items-stretch justify-between gap-2 my-1 overflow-hidden">
          {/* LEFT CORNER COLUMN: COMPACT CLAN BAR + LIVE VISIBLE CHAT DA SALA (REPLACES REMOVED MAP PHOTO) */}
          <div className="w-[155px] sm:w-[190px] lg:w-[215px] flex flex-col justify-between gap-1.5 pointer-events-auto min-h-0">
            {/* 1. Real Clan Badge (only shows a clan if player genuinely created/joined one) */}
            {activeClan && clanLevelInfo ? (
              <div className="rounded-lg border border-red-500/35 bg-gradient-to-b from-[#240a0f]/90 to-[#0e0b10]/90 p-1.5 sm:p-2 shadow-lg shrink-0">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ClanEmblemIcon
                      emblemId={activeClan.emblemId}
                      className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
                    />
                    <div className="min-w-0 leading-tight">
                      <div className="font-display font-black text-[10px] sm:text-xs text-white uppercase truncate">
                        {activeClan.name}
                      </div>
                      <div className="text-[8px] font-mono text-amber-300">
                        CLÃ NV. {clanLevelInfo.level} · {displayClanMembersCount}/{MAX_CLAN_MEMBERS}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenClanTab('OVERVIEW')}
                    className="px-1.5 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-[8px] font-display font-black text-red-200 uppercase shrink-0 cursor-pointer"
                  >
                    CLÃ
                  </button>
                </div>

                {/* Thin Clan XP bar */}
                <div className="w-full h-1 rounded-full bg-black/70 overflow-hidden mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-300"
                    style={{ width: `${clanLevelInfo.progressPct}%` }}
                  />
                </div>

                {/* 4 Compact Clan Quick Buttons in a 2x2 grid */}
                <div className="grid grid-cols-2 gap-1 mt-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenClanTab('MISSIONS')}
                    className="px-1.5 py-1 rounded bg-black/50 hover:bg-white/10 border border-white/10 text-[8px] sm:text-[9px] font-display font-bold text-slate-200 hover:text-amber-300 truncate text-left cursor-pointer"
                  >
                    🏆 Desafios
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenClanTab('RANK')}
                    className="px-1.5 py-1 rounded bg-black/50 hover:bg-white/10 border border-white/10 text-[8px] sm:text-[9px] font-display font-bold text-slate-200 hover:text-amber-300 truncate text-left cursor-pointer"
                  >
                    📊 Rank
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenClanTab('MEMBERS')}
                    className="px-1.5 py-1 rounded bg-black/50 hover:bg-white/10 border border-white/10 text-[8px] sm:text-[9px] font-display font-bold text-slate-200 hover:text-amber-300 truncate text-left cursor-pointer"
                  >
                    👥 Membros
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenClanTab('STORE')}
                    className="px-1.5 py-1 rounded bg-black/50 hover:bg-white/10 border border-white/10 text-[8px] sm:text-[9px] font-display font-bold text-slate-200 hover:text-amber-300 truncate text-left cursor-pointer"
                  >
                    🛒 Loja
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-white/15 bg-[#0e121b]/90 p-2 shadow-lg shrink-0">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="min-w-0 leading-tight">
                    <div className="font-display font-black text-[10px] sm:text-xs text-white uppercase tracking-wide">
                      SEM CLÃ ATIVO
                    </div>
                    <div className="text-[8px] font-mono text-slate-400 truncate mt-0.5">
                      Funde seu clã (máx. {MAX_CLAN_MEMBERS})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenClanTab('OVERVIEW')}
                    className="px-2 py-1 rounded bg-gradient-to-r from-red-600 to-amber-500 hover:brightness-110 text-white font-display font-black text-[8px] uppercase tracking-wider shrink-0 cursor-pointer shadow"
                  >
                    CRIAR / ENTRAR
                  </button>
                </div>
              </div>
            )}

            {/* 2. Map Rule Strip: ONLY Private Rooms can pick a map; Ranked & Classic draw automatically */}
            {room.isPrivate ? (
              <div className="relative rounded-lg border border-amber-400/35 bg-[#0e131d]/90 px-2 py-1 flex items-center justify-between gap-1 shrink-0">
                <div className="min-w-0">
                  <div className="text-[7px] font-mono text-amber-300 uppercase">
                    SALA PRIVADA · MAPA
                  </div>
                  <div className="font-display font-black text-[10px] text-white uppercase truncate">
                    {currentPrivateMapMeta.label}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      void switchLocalPlayerTeam();
                    }}
                    title="Alternar Time (Vanguard / Blackthorn)"
                    className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-[8px] font-display font-bold text-sky-200 uppercase cursor-pointer"
                  >
                    TIME ⇄
                  </button>
                  {isHost && !isSearching && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        setShowPrivateMapPicker((prev) => !prev);
                      }}
                      className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[8px] font-display font-bold text-amber-200 uppercase cursor-pointer"
                    >
                      MAPA ▾
                    </button>
                  )}
                </div>

                {showPrivateMapPicker && isHost && (
                  <div className="absolute left-0 top-full mt-1 w-48 rounded-lg bg-[#0b0f18]/98 border border-amber-400/55 p-1.5 shadow-2xl z-40 grid grid-cols-1 gap-1 max-h-40 overflow-y-auto">
                    {PRIVATE_ROOM_MAPS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playMenuSelect();
                          updateSquadRoomConfig(m.id, queueType, true);
                          setShowPrivateMapPicker(false);
                        }}
                        className={`px-2 py-1 rounded text-left text-[9px] font-display font-bold uppercase flex items-center justify-between cursor-pointer ${
                          room.arenaMode === m.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-white/5 text-slate-200 hover:bg-white/10'
                        }`}
                      >
                        <span className="truncate">{m.label}</span>
                        <span className="text-[7px] font-mono opacity-80">
                          {m.modeTag}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* 3. LIVE VISIBLE SQUAD CHAT BOX (In the exact spot where the map card was removed) */}
            <div className="flex-1 min-h-[78px] rounded-lg border border-white/15 bg-[#0b0f18]/88 backdrop-blur-sm flex flex-col overflow-hidden shadow-lg">
              <div className="px-2 py-1 border-b border-white/10 bg-black/40 flex items-center justify-between shrink-0">
                <span className="text-[8px] sm:text-[9px] font-mono font-bold text-amber-300 uppercase tracking-wider">
                  💬 CHAT DA SALA
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleQuickChatCallout('Bora partida galera? Dá pronto!')
                  }
                  className="text-[8px] font-mono text-slate-400 hover:text-amber-300 cursor-pointer"
                  title="Enviar chamada rápida"
                >
                  + RÁPIDO
                </button>
              </div>

              <div
                ref={chatScrollRef}
                className="flex-1 min-h-0 overflow-y-auto px-2 py-1 space-y-1 text-[9px] sm:text-[10px]"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-slate-400/80 font-sans text-[9px] leading-snug py-1">
                    Converse com o esquadrão aqui antes da partida...
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id} className="leading-tight break-words">
                      <span className="font-bold text-amber-300">
                        {m.senderCallsign}:{' '}
                      </span>
                      <span className="text-slate-100">{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleSendChat}
                className="h-6 sm:h-7 border-t border-white/10 bg-black/60 px-1.5 flex items-center gap-1 shrink-0"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escrever no chat..."
                  className="flex-1 min-w-0 bg-transparent text-[9px] sm:text-[10px] text-white placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-1.5 py-0.5 rounded bg-amber-500/25 hover:bg-amber-500 text-amber-200 hover:text-slate-950 font-display font-black text-[8px] uppercase cursor-pointer"
                >
                  ENVIAR
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT CORNER COLUMN: COMPACT FRIENDS LIST WITH ACCURATE ONLINE/OFFLINE STATUS */}
          <div className="w-[155px] sm:w-[195px] lg:w-[220px] flex flex-col justify-between gap-1.5 pointer-events-auto min-h-0">
            <div className="flex-1 min-h-0 rounded-lg border border-white/15 bg-[#0b0f18]/88 backdrop-blur-sm shadow-lg flex flex-col overflow-hidden">
              {/* Compact Tabs: AMIGOS | CÓDIGO */}
              <div className="grid grid-cols-2 border-b border-white/10 shrink-0 bg-[#101520]/90">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setRightTab('FRIENDS');
                  }}
                  className={`py-1.5 text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wider border-b-2 cursor-pointer whitespace-nowrap ${
                    rightTab === 'FRIENDS'
                      ? 'border-amber-400 text-white bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  AMIGOS ({friendsList.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setRightTab('JOIN');
                  }}
                  className={`py-1.5 text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wider border-b-2 cursor-pointer whitespace-nowrap ${
                    rightTab === 'JOIN'
                      ? 'border-amber-400 text-white bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  CÓDIGO
                </button>
              </div>

              {rightTab === 'FRIENDS' ? (
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.06] px-2 py-1">
                  {friendsList.length === 0 ? (
                    <div className="py-3 text-center text-[9px] text-slate-400">
                      Nenhum amigo adicionado ainda.
                    </div>
                  ) : (
                    friendsList.map((f) => {
                      const alreadyInRoom = Boolean(room.players[f.uid]);
                      const isFriendOnline =
                        alreadyInRoom || Boolean(friendsOnlineMap[f.uid]);
                      const invited = Boolean(invitedUids[f.uid]);

                      return (
                        <div
                          key={f.uid}
                          className="py-1.5 flex items-center justify-between gap-1.5"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="relative w-6 h-6 sm:w-7 sm:h-7 rounded-md overflow-hidden border border-white/20 bg-slate-900 shrink-0">
                              {f.avatarDataUrl ? (
                                <img
                                  src={f.avatarDataUrl}
                                  alt={f.callsign}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center font-display font-black text-[10px] text-amber-300">
                                  {f.callsign.slice(0, 2)}
                                </div>
                              )}
                              <span
                                className={`absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full ring-1 ring-black ${
                                  isFriendOnline ? 'bg-emerald-400' : 'bg-slate-500'
                                }`}
                              />
                            </div>
                            <div className="min-w-0 leading-tight">
                              <div className="font-display font-black text-[10px] sm:text-[11px] text-white truncate">
                                {f.callsign}
                              </div>
                              <div
                                className={`text-[8px] font-sans font-semibold ${
                                  alreadyInRoom
                                    ? 'text-emerald-400'
                                    : isFriendOnline
                                      ? 'text-emerald-400'
                                      : 'text-slate-400'
                                }`}
                              >
                                {alreadyInRoom
                                  ? 'Na Sala'
                                  : isFriendOnline
                                    ? 'Online'
                                    : 'Offline'}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {alreadyInRoom || invited ? (
                              <span className="text-emerald-400 font-bold text-[10px] px-1">
                                ✓
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleInviteFriend(f.uid)}
                                title={`Convidar ${f.callsign}`}
                                className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500 border border-amber-400/45 text-amber-200 hover:text-slate-950 font-display font-black text-[8px] uppercase cursor-pointer"
                              >
                                + CONVIDAR
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-0 p-2 flex flex-col justify-center gap-1.5">
                  <div className="text-[9px] font-mono text-slate-300 leading-tight">
                    Código da sala do amigo:
                  </div>
                  <form
                    onSubmit={(e) => void handleJoinByCode(e)}
                    className="space-y-1.5"
                  >
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) =>
                        setJoinCodeInput(
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, '')
                            .slice(0, 8)
                        )
                      }
                      placeholder="EX: K7P4M2"
                      className="w-full px-2 py-1 rounded bg-black/75 border border-amber-400/50 text-center font-mono font-black text-xs tracking-widest text-amber-300 uppercase focus:outline-none"
                    />
                    {joinFeedback && (
                      <div className="text-[8px] font-mono text-red-300 bg-red-950/60 border border-red-500/40 rounded px-1.5 py-0.5">
                        {joinFeedback}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={joiningCode || joinCodeInput.length < 4}
                      className="w-full py-1 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-display font-black text-[9px] uppercase cursor-pointer"
                    >
                      {joiningCode ? 'ENTRANDO...' : 'ENTRAR »'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Minimalist Copy Invite Code button */}
            <button
              type="button"
              onClick={handleCopyCode}
              className="w-full py-1.5 px-2 rounded-lg bg-[#10141e]/92 hover:bg-[#171d2b] border border-amber-400/35 text-white font-display font-black text-[9px] sm:text-[10px] uppercase tracking-wider shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <span>
                {copiedCode
                  ? `CÓDIGO #${room.roomId} COPIADO ✓`
                  : `CONVIDAR (#${room.roomId})`}
              </span>
            </button>
          </div>
        </div>

        {/* BOTTOM BAR: COMPACT MIC/SPEAKER CORNER + 4 SLIM OPERATOR CARDS + COMPACT INICIAR BUTTON */}
        <div className="flex items-end justify-between gap-2 shrink-0">
          {/* Bottom-Left Corner: Minimalist Mic & Speaker Toggles */}
          <div className="flex items-center gap-1.5 pointer-events-auto shrink-0">
            <button
              type="button"
              onClick={() => void handleToggleMic()}
              title={
                voiceState.micMode === 'MUTED'
                  ? 'Ativar Microfone na Sala e Partida'
                  : 'Silenciar Microfone'
              }
              className={`h-8 sm:h-9 px-2.5 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all shadow-md ${
                voiceState.micMode !== 'MUTED'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300'
                  : 'bg-[#10141d]/92 border-white/15 text-slate-300 hover:border-white/35'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <rect
                  x="9"
                  y="3"
                  width="6"
                  height="11"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M5 10v1a7 7 0 0014 0v-1M12 18v3M8 21h8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <span className="font-mono font-bold text-[8px] sm:text-[9px] uppercase">
                {voiceState.micMode !== 'MUTED' ? 'MIC ON' : 'MIC'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleSpeaker}
              title={
                voiceState.teamChannelMuted
                  ? 'Ativar Voz do Esquadrão'
                  : 'Silenciar Voz do Esquadrão'
              }
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg border flex items-center justify-center cursor-pointer transition-all shadow-md ${
                voiceState.teamChannelMuted
                  ? 'bg-red-500/20 border-red-400/60 text-red-300'
                  : 'bg-[#10141d]/92 border-white/15 text-slate-200 hover:border-white/35'
              }`}
            >
              {voiceState.teamChannelMuted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Bottom-Center: Real Squad Members + Empty "+ Convidar" Slots */}
          <div className="flex-1 min-w-0 flex items-center justify-center gap-1 sm:gap-2 pointer-events-auto overflow-x-auto">
            {bottomCardSlots.map((slotIdx) => {
              const realMember = playersList[slotIdx];
              if (!realMember) {
                return (
                  <button
                    key={`empty-slot-${slotIdx}`}
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      setRightTab('FRIENDS');
                      handleCopyCode();
                    }}
                    title="Convidar amigo para este espaço do esquadrão"
                    className="min-w-[82px] sm:min-w-[104px] lg:min-w-[118px] h-9 sm:h-11 rounded-lg px-2 py-1 flex items-center justify-center gap-1.5 bg-[#0c1018]/75 hover:bg-[#141b28]/90 border border-dashed border-white/20 hover:border-amber-400/60 text-slate-400 hover:text-amber-300 transition-all cursor-pointer shrink-0"
                  >
                    <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border border-current flex items-center justify-center text-xs leading-none">
                      +
                    </span>
                    <span className="font-display font-bold text-[8px] sm:text-[10px] uppercase tracking-wider truncate">
                      Convidar
                    </span>
                  </button>
                );
              }

              const isSlotLeader = realMember.uid === room.hostUid;
              const isSlotLocal = realMember.uid === localUid;
              const isSlotReady = isSlotLeader || Boolean(realMember.isReady);
              const memberClanName =
                (isSlotLocal ? activeClan?.name : undefined) || realMember.clanName;
              const memberClanEmblem = ((isSlotLocal ? activeClan?.emblemId : undefined) ||
                realMember.clanEmblemId ||
                'alpha_wolf') as ClanEmblemId;
              const peerVoice = voiceState.peers[realMember.uid];
              const isSpeaking = isSlotLocal
                ? voiceState.isTransmitting
                : Boolean(peerVoice?.isSpeaking && !peerVoice?.mutedByLocal);

              return (
                <div
                  key={realMember.uid}
                  className={`relative min-w-[92px] sm:min-w-[118px] lg:min-w-[134px] h-9 sm:h-11 rounded-lg px-1.5 py-1 flex items-center gap-1.5 bg-[#121620]/92 border transition-all shadow-md shrink-0 ${
                    isSpeaking
                      ? 'border-emerald-400 ring-1 ring-emerald-400/40'
                      : isSlotLeader
                        ? 'border-amber-400/80'
                        : 'border-white/15'
                  }`}
                >
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded overflow-hidden border border-amber-400/45 bg-slate-900 shrink-0">
                    <OperatorTacticalAvatar
                      team={realMember.team || 'VANGUARD'}
                      classId={(realMember.classId || 'FUZILEIRO') as WarfaceClassId}
                      photoUrl={
                        (isSlotLocal ? profile.avatarDataUrl : undefined) ||
                        realMember.avatarDataUrl
                      }
                    />
                  </div>

                  <div className="min-w-0 flex-1 leading-none">
                    <div className="flex items-center gap-0.5 min-w-0">
                      <span className="font-display font-black text-[9px] sm:text-[11px] text-white truncate">
                        {realMember.callsign}
                      </span>
                      {isSlotLeader && (
                        <span className="text-amber-400 text-[8px] shrink-0">
                          ♛
                        </span>
                      )}
                    </div>
                    {memberClanName ? (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <ClanEmblemIcon
                          emblemId={memberClanEmblem}
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0"
                        />
                        <span className="font-display font-bold text-[8px] sm:text-[9px] text-[#ff4444] truncate">
                          {memberClanName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <WarfaceRankIcon
                          level={realMember.rankLevel || 1}
                          className="w-2.5 h-2.5 shrink-0"
                        />
                        <span className="font-mono text-[8px] text-amber-200/80 truncate">
                          {isSlotReady ? 'Pronto' : 'Aguardando'}
                        </span>
                      </div>
                    )}
                  </div>

                  {isSlotReady && (
                    <span className="text-emerald-400 font-black text-[9px] shrink-0">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom-Right Corner: Compact Golden INICIAR Button */}
          <div className="w-[140px] sm:w-[180px] lg:w-[205px] pointer-events-auto shrink-0">
            {!isHost ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setLocalPlayerReady(!localIsReady);
                }}
                className={`w-full h-9 sm:h-11 rounded-lg border px-2.5 flex flex-col items-center justify-center cursor-pointer transition-all shadow-lg ${
                  localIsReady
                    ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 border-emerald-200 text-slate-950'
                    : 'bg-gradient-to-b from-[#ffcf4b] via-[#f59e0b] to-[#d97706] border-amber-200 text-slate-950'
                }`}
              >
                <span className="font-display font-black text-xs sm:text-sm uppercase tracking-wider leading-none">
                  {localIsReady ? 'PRONTO ✓' : 'DAR PRONTO »'}
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono font-bold text-slate-900 uppercase truncate max-w-full">
                  {modeDisplayLabel} · {matchSubtitleLabel}
                </span>
              </button>
            ) : isSearching ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  cancelSquadMatchSearch();
                }}
                className="w-full h-9 sm:h-11 rounded-lg bg-gradient-to-b from-red-600 to-red-800 border border-red-300/80 px-2 flex flex-col items-center justify-center cursor-pointer shadow-lg"
              >
                <span className="font-display font-black text-[10px] sm:text-xs text-white uppercase tracking-wider leading-none">
                  BUSCANDO {searchMins}:{searchSecs} ✕
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono text-amber-200 uppercase truncate max-w-full mt-0.5">
                  {modeDisplayLabel} · {matchSubtitleLabel}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!allSquadReady}
                onClick={handleHostStartSearch}
                className="w-full h-9 sm:h-11 rounded-lg bg-gradient-to-b from-[#ffd859] via-[#f5a623] to-[#d47a08] hover:brightness-105 active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed border border-[#ffe89e] px-2.5 flex items-center justify-between shadow-[0_6px_20px_rgba(245,158,11,0.45)] cursor-pointer transition-all"
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-[#18130a] border border-amber-300/60 flex items-center justify-center shrink-0">
                  <WarfaceRankIcon
                    level={localPlayer?.rankLevel || profile.rankLevel || 4}
                    className="w-4 h-4 sm:w-5 sm:h-5"
                  />
                </div>
                <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1 leading-none">
                  <span className="font-display font-black text-xs sm:text-base tracking-wider text-[#110d06] uppercase">
                    {!allSquadReady ? 'AGUARDANDO' : 'INICIAR »'}
                  </span>
                  <span className="mt-0.5 text-[7px] sm:text-[8px] font-mono font-bold text-[#2b1c04] uppercase truncate max-w-full">
                    {modeDisplayLabel} · {matchSubtitleLabel}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
