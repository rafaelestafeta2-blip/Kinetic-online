import React, { useEffect, useMemo, useRef, useState } from 'react';
import squadHangarBgUrl from '../assets/images/squad_room_hangar_bg_1795215265768.jpg';
import { soundEngine } from '../audio/soundEngine';
import {
  sendPartyInviteToFriend,
  SocialInboxState,
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
import { thumbForDrillMode } from './mapSelectThumbs';
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
}

const SQUAD_MAPS: Array<{
  id: DrillMode;
  label: string;
  modeTag: string;
  shortSubtitle: string;
}> = [
  {
    id: 'DUST2_BOMB_5V5',
    label: 'DE_DUST2',
    modeTag: 'BOMB 5V5',
    shortSubtitle: 'DEFUSAL · 5V5',
  },
  {
    id: 'STATION_TDM_5V5',
    label: 'STATION ARENA',
    modeTag: 'MATA-MATA 5V5',
    shortSubtitle: 'TDM · 5V5',
  },
  {
    id: 'ASSAULT_BOMB_5V5',
    label: 'CS_ASSAULT',
    modeTag: 'BOMB 5V5',
    shortSubtitle: 'DEFUSAL · 5V5',
  },
  {
    id: 'INDUSTRIA_BOMB_5V5',
    label: 'INDUSTRIA',
    modeTag: 'BOMB 5V5',
    shortSubtitle: 'DEFUSAL · 5V5',
  },
  {
    id: 'HANGAR_BOMB_5V5',
    label: 'HANGAR',
    modeTag: 'BOMB 5V5',
    shortSubtitle: 'DEFUSAL · 5V5',
  },
  {
    id: 'EASTERN_CITY_BOMB_5V5',
    label: 'EASTERN CITY',
    modeTag: 'BOMB 5V5',
    shortSubtitle: 'DEFUSAL · 5V5',
  },
  {
    id: 'MIRAGE_ANUBIS_BOMB_5V5',
    label: 'MIRAGE ANUBIS',
    modeTag: 'BOMB 5V5',
    shortSubtitle: 'DEFUSAL · 5V5',
  },
  {
    id: 'STATION_CAPTURE_5V5',
    label: 'STATION CTF',
    modeTag: 'CAPTURA 5V5',
    shortSubtitle: 'CTF · 5V5',
  },
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
}) => {
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<SquadChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatExpanded, setChatExpanded] = useState(false);
  const [rightTab, setRightTab] = useState<'FRIENDS' | 'JOIN'>('FRIENDS');
  const [inbox, setInbox] = useState<SocialInboxState>({
    uid: '',
    friends: {},
    requests: {},
    invites: {},
    updatedAtMs: 0,
  });
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
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsubRoom = subscribeOnlineRoom((next) => {
      setRoom(next);
    });
    const unsubChat = subscribeSquadChat((msgs) => setChatMessages(msgs));
    const unsubSocial = subscribeSocialInbox((next) => setInbox(next));
    const unsubVoice = voiceChatManager.subscribe((next) => setVoiceState(next));
    return () => {
      unsubRoom();
      unsubChat();
      unsubSocial();
      unsubVoice();
    };
  }, []);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatExpanded, isOpen]);

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

  const playersList = useMemo<OnlinePlayerState[]>(() => {
    if (!room?.players) return [];
    const list = Object.values(room.players);
    return list.sort((a, b) => {
      if (a.uid === room.hostUid) return -1;
      if (b.uid === room.hostUid) return 1;
      return a.callsign.localeCompare(b.callsign);
    });
  }, [room]);

  // Build 3D formation members: shows actual players in the room, or when solo/waiting fills the tactical V-formation preview slots so the 4 operators in formation are always visible like the reference
  const formationMembers = useMemo<SquadFormationMemberSpec[]>(() => {
    const actualSpecs: SquadFormationMemberSpec[] = playersList.map((p, idx) => {
      const isLocal = p.uid === localUid;
      const wId = isLocal
        ? localPrimaryWeapon
        : DEFAULT_SQUAD_WEAPONS[idx % DEFAULT_SQUAD_WEAPONS.length];
      return {
        uid: p.uid,
        callsign: p.callsign,
        classId: (p.classId || (isLocal ? inv.selectedClass : 'FUZILEIRO')) as WarfaceClassId,
        weaponId: wId,
        weaponSkinId: isLocal
          ? localWeaponSkin
          : DEFAULT_SQUAD_SKINS[idx % DEFAULT_SQUAD_SKINS.length],
        operatorSkinId: isLocal
          ? localOperatorSkin
          : DEFAULT_SQUAD_OP_SKINS[idx % DEFAULT_SQUAD_OP_SKINS.length],
        isLeader: p.uid === room?.hostUid,
      };
    });

    // Ensure the 4-operator tactical V-formation is populated on stage matching the reference image
    const fallbackCallsigns = ['RAFA', 'LUCASZIN', 'BRABO77', 'GABRIEL'];
    const fallbackClasses: WarfaceClassId[] = [
      'FUZILEIRO',
      'ENGENHEIRO',
      'MEDICO',
      'FRANCO_ATIRADOR',
    ];
    while (actualSpecs.length < 4) {
      const slotIdx = actualSpecs.length;
      actualSpecs.push({
        uid: `squad-guard-slot-${slotIdx}`,
        callsign: fallbackCallsigns[slotIdx] || `OPERADOR ${slotIdx + 1}`,
        classId: fallbackClasses[slotIdx % fallbackClasses.length],
        weaponId: DEFAULT_SQUAD_WEAPONS[slotIdx % DEFAULT_SQUAD_WEAPONS.length],
        weaponSkinId: DEFAULT_SQUAD_SKINS[slotIdx % DEFAULT_SQUAD_SKINS.length],
        operatorSkinId:
          DEFAULT_SQUAD_OP_SKINS[slotIdx % DEFAULT_SQUAD_OP_SKINS.length],
        isLeader: false,
      });
    }
    return actualSpecs.slice(0, 5);
  }, [
    playersList,
    localUid,
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
  const currentMapMeta =
    SQUAD_MAPS.find((m) => m.id === room.arenaMode) || SQUAD_MAPS[0];
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
        : 'CASUAL';

  const latestChat =
    chatMessages.length > 0 ? chatMessages[chatMessages.length - 1] : null;

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

  const handleHostLaunchImmediate = async () => {
    if (queueType === 'RANKED' && !room.isPrivate) return;
    soundEngine.playMenuSelect();
    cancelSquadMatchSearch();
    await startMatchInActiveRoom(false);
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
      {/* 1. HANGAR SUNSET BACKDROP + GOLDEN VIGNETTE */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <img
          src={squadHangarBgUrl}
          alt="Hangar Tático"
          className="w-full h-full object-cover object-center scale-[1.02] brightness-95 contrast-105"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/85" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/55" />
      </div>

      {/* 2. CENTER 3D SQUAD V-FORMATION (.GLB CHARACTERS WALKING INTO FORMATION) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <SquadFormation3DCanvas members={formationMembers} />
      </div>

      {/* 3. FOREGROUND TACTICAL HUD OVERLAY MATCHING REFERENCE IMAGE 1:1 */}
      <div className="relative z-20 w-full h-full flex flex-col justify-between p-2.5 sm:p-4 lg:p-5 pointer-events-none">
        {/* TOP ROW: LEFT BACK/TITLE + CENTER RANK BANNER + RIGHT SPACER */}
        <div className="flex items-start justify-between gap-2">
          {/* Top-Left: `<` Back/Minimize Button + SALA DE PARTIDA + RANQUEADA · 5v5 */}
          <div className="flex items-center gap-2.5 sm:gap-3 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                onMinimize();
              }}
              title="Voltar ao Menu Principal (Continua na sala com voz ativa)"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg bg-[#11141c]/90 hover:bg-[#1b202d] border border-amber-400/35 hover:border-amber-400 text-amber-400 flex items-center justify-center shadow-[0_4px_18px_rgba(0,0,0,0.85)] cursor-pointer transition-all active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 19l-7-7 7-7"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-base sm:text-xl lg:text-2xl tracking-wider text-white uppercase leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                  SALA DE PARTIDA
                </h1>
                <button
                  type="button"
                  onClick={() => void handleLeave()}
                  title="Sair definitivamente da sala"
                  className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/35 border border-red-400/45 text-[9px] font-mono font-bold text-red-200 uppercase cursor-pointer transition-all"
                >
                  SAIR ✕
                </button>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-display font-bold text-[11px] sm:text-xs tracking-widest text-slate-300 uppercase">
                  {modeDisplayLabel} · 5v5
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[9px] font-mono ${
                    wsOnline ? 'text-emerald-400' : 'text-amber-300'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      wsOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                    }`}
                  />
                  #{room.roomId}
                </span>
              </div>
            </div>
          </div>

          {/* Top-Center: Chamfered Gold Rank Plaque (OURO II / RANQUEADA + info `i`) */}
          <div className="relative pointer-events-auto">
            <div className="min-w-[190px] sm:min-w-[260px] lg:min-w-[290px] px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-[#1a1510]/95 via-[#251d13]/95 to-[#14110e]/95 border border-amber-400/50 shadow-[0_10px_30px_rgba(0,0,0,0.85)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-b from-amber-400/25 to-amber-700/20 border border-amber-400/60 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] shrink-0">
                  <WarfaceRankIcon
                    level={localPlayer?.rankLevel || profile.rankLevel || 4}
                    className="w-6 h-6 sm:w-7 sm:h-7"
                  />
                </div>
                <div>
                  <div className="font-display font-black text-xs sm:text-sm lg:text-base tracking-wider text-white uppercase leading-tight">
                    {rankTierTitle}
                  </div>
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-widest text-amber-300/90 uppercase">
                    {modeDisplayLabel}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setShowRoomInfoPopover((prev) => !prev);
                }}
                title="Código da Sala & Informações Ranked"
                className="w-6 h-6 rounded-full bg-white/10 hover:bg-amber-500/30 border border-white/20 hover:border-amber-300 text-slate-200 font-serif italic font-bold text-xs flex items-center justify-center cursor-pointer transition-all"
              >
                i
              </button>
            </div>

            {showRoomInfoPopover && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 p-3 rounded-xl bg-[#0d111a]/98 border border-amber-400/50 shadow-2xl text-xs font-mono text-slate-200 z-40">
                <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
                  <span className="text-amber-300 font-bold uppercase">
                    CÓDIGO DA SALA
                  </span>
                  <span className="font-black text-white tracking-widest">
                    {room.roomId}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mb-2">
                  MMR Médio do Esquadrão:{' '}
                  <strong className="text-amber-300">{localMmr} MMR</strong>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-[10px] uppercase tracking-wider cursor-pointer"
                  >
                    {copiedCode ? 'CÓDIGO COPIADO ✓' : 'COPIAR CÓDIGO'}
                  </button>
                  {room.isPrivate && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        void switchLocalPlayerTeam();
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-200 font-display font-bold text-[10px] uppercase cursor-pointer"
                    >
                      TIME
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right alignment spacer so the rank plaque stays centered */}
          <div className="hidden lg:block w-[240px]" />
        </div>

        {/* MIDDLE AREA: LEFT MAP/MODE CARDS & RIGHT FRIENDS/CODE SIDEBAR */}
        <div className="flex-1 min-h-0 flex items-center justify-between gap-3 my-1.5 sm:my-2">
          {/* LEFT COLUMN: MAP PREVIEW CARD + MODE SELECTOR CARD */}
          <div className="flex flex-col gap-2 sm:gap-2.5 w-[170px] sm:w-[225px] lg:w-[245px] pointer-events-auto self-start mt-1 sm:mt-3">
            {/* Map Card */}
            <div className="relative rounded-xl overflow-hidden border border-white/15 bg-[#10141d]/92 shadow-[0_12px_30px_rgba(0,0,0,0.85)] group">
              <button
                type="button"
                disabled={!isHost || isSearching}
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setShowMapPicker((prev) => !prev);
                  setShowModePicker(false);
                }}
                className="w-full text-left cursor-pointer disabled:cursor-default"
              >
                <div className="relative h-16 sm:h-24 w-full overflow-hidden">
                  <img
                    src={thumbForDrillMode(currentMapMeta.id)}
                    alt={currentMapMeta.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0c0f16] via-black/20 to-transparent" />
                  {/* Red Tactical Diamond Badge on right edge matching reference */}
                  <div className="absolute bottom-1.5 right-2.5 w-6 h-6 rotate-45 rounded-sm bg-gradient-to-br from-red-500 to-red-800 border border-red-300/80 shadow-[0_0_12px_rgba(239,68,68,0.65)] flex items-center justify-center">
                    <span className="-rotate-45 text-[9px] font-black text-white">
                      💣
                    </span>
                  </div>
                </div>
                <div className="px-3 py-2 bg-gradient-to-r from-[#11151f] via-[#171b26] to-[#231216]">
                  <div className="flex items-center justify-between">
                    <span className="font-display font-black text-xs sm:text-sm lg:text-base tracking-wider text-white uppercase">
                      {currentMapMeta.label}
                    </span>
                    {isHost && !isSearching && (
                      <span className="text-[10px] font-mono text-amber-300">
                        ▾
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-mono tracking-widest text-slate-400 uppercase">
                    {currentMapMeta.shortSubtitle}
                  </div>
                </div>
              </button>
            </div>

            {/* Map Picker Popover for Host */}
            {showMapPicker && isHost && (
              <div className="rounded-xl bg-[#0b0f18]/98 border border-amber-400/50 p-2 shadow-2xl grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto z-30">
                {SQUAD_MAPS.map((m) => {
                  const selected = room.arenaMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        updateSquadRoomConfig(m.id, queueType);
                        setShowMapPicker(false);
                      }}
                      className={`p-1.5 rounded-lg border text-left cursor-pointer transition-all ${
                        selected
                          ? 'bg-amber-500/25 border-amber-400 text-white'
                          : 'bg-black/50 border-white/10 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="font-display font-black text-[10px] uppercase truncate">
                        {m.label}
                      </div>
                      <div className="text-[8px] font-mono text-amber-300/80 truncate">
                        {m.modeTag}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mode Selector Card (`MODO` / `RANQUEADA >`) */}
            <div className="rounded-xl border border-white/15 bg-[#10141d]/92 shadow-[0_12px_30px_rgba(0,0,0,0.85)] overflow-hidden">
              <div className="px-3 pt-1.5 pb-1 border-b border-white/10 flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest">
                <span className="text-slate-400">MAPA</span>
                <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-bold">
                  MODO
                </span>
              </div>
              <button
                type="button"
                disabled={!isHost || isSearching}
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setShowModePicker((prev) => !prev);
                  setShowMapPicker(false);
                }}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-white/[0.04] transition-all cursor-pointer disabled:cursor-default"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/50 flex items-center justify-center shrink-0">
                    <WarfaceRankIcon
                      level={localPlayer?.rankLevel || profile.rankLevel || 4}
                      className="w-5 h-5"
                    />
                  </div>
                  <span className="font-display font-black text-xs sm:text-sm tracking-wider text-white uppercase">
                    {modeDisplayLabel}
                  </span>
                </div>
                <span className="text-slate-400 font-mono text-sm">›</span>
              </button>

              {showModePicker && isHost && !room.isPrivate && (
                <div className="p-1.5 bg-black/70 border-t border-white/10 grid grid-cols-2 gap-1">
                  {(
                    [
                      { id: 'RANKED', label: 'RANQUEADA' },
                      { id: 'CASUAL', label: 'CASUAL 5V5' },
                    ] as const
                  ).map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        updateSquadRoomConfig(room.arenaMode, q.id);
                        setShowModePicker(false);
                      }}
                      className={`py-1.5 rounded-lg font-display font-black text-[10px] uppercase cursor-pointer ${
                        queueType === q.id
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR: AMIGOS (N) | ENTRAR CÓDIGO + CONVIDAR AMIGOS */}
          <div className="w-[210px] sm:w-[265px] lg:w-[290px] h-full max-h-[340px] sm:max-h-[410px] flex flex-col justify-between gap-2 pointer-events-auto self-start">
            <div className="flex-1 min-h-0 rounded-xl border border-white/15 bg-[#0c1018]/92 backdrop-blur-md shadow-[0_14px_35px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden">
              {/* Tabs: AMIGOS (N) | ENTRAR CÓDIGO */}
              <div className="grid grid-cols-2 border-b border-white/10 shrink-0 bg-[#111622]/90">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setRightTab('FRIENDS');
                  }}
                  className={`py-2.5 text-[10px] sm:text-xs font-display font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
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
                  className={`py-2.5 text-[10px] sm:text-xs font-display font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                    rightTab === 'JOIN'
                      ? 'border-amber-400 text-white bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ENTRAR CÓDIGO
                </button>
              </div>

              {rightTab === 'FRIENDS' ? (
                <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.06] px-2.5 py-1.5">
                  {friendsList.map((f) => {
                    const alreadyInRoom = Boolean(room.players[f.uid]);
                    const invited = Boolean(invitedUids[f.uid]);
                    return (
                      <div
                        key={f.uid}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden border border-amber-400/45 bg-slate-900 shrink-0">
                            {f.avatarDataUrl ? (
                              <img
                                src={f.avatarDataUrl}
                                alt={f.callsign}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-display font-black text-xs text-amber-300">
                                {f.callsign.slice(0, 2)}
                              </div>
                            )}
                            <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-black" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-display font-black text-xs text-white truncate flex items-center gap-1">
                              <span>{f.callsign}</span>
                              <span className="text-amber-300 text-[10px]">♛</span>
                            </div>
                            <div className="text-[10px] font-sans font-semibold text-emerald-400 leading-tight">
                              Online
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {alreadyInRoom || invited ? (
                            <span className="text-emerald-400 font-bold text-xs px-1.5">
                              ✓
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleInviteFriend(f.uid)}
                              title={`Convidar ${f.callsign} para a sala`}
                              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500 border border-amber-400/50 text-amber-200 hover:text-slate-950 font-display font-black text-[9px] uppercase cursor-pointer transition-all"
                            >
                              + CONVIDAR
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleInviteFriend(f.uid)}
                            className="text-slate-400 hover:text-white px-1 cursor-pointer"
                            title="Reenviar convite"
                          >
                            •••
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty "+ Convidar amigo" slots matching reference */}
                  {Array.from({
                    length: Math.max(1, 3 - Math.min(2, friendsList.length)),
                  }).map((_, idx) => (
                    <button
                      key={`invite-slot-${idx}`}
                      type="button"
                      onClick={handleCopyCode}
                      className="w-full py-2.5 flex items-center gap-2.5 text-left text-slate-400 hover:text-amber-300 transition-colors cursor-pointer group"
                    >
                      <span className="w-8 h-8 rounded-full border border-white/15 group-hover:border-amber-400/60 bg-white/[0.03] flex items-center justify-center text-base font-light">
                        +
                      </span>
                      <span className="text-xs font-sans text-slate-400 group-hover:text-white">
                        {copiedCode
                          ? `Código #${room.roomId} copiado!`
                          : 'Convidar amigo'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex-1 min-h-0 p-3 flex flex-col justify-center gap-2.5">
                  <div className="text-[11px] font-mono text-slate-300 leading-snug">
                    Digite o código da sala do seu amigo para entrar no esquadrão:
                  </div>
                  <form
                    onSubmit={(e) => void handleJoinByCode(e)}
                    className="space-y-2"
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
                      className="w-full px-3 py-2 rounded-lg bg-black/75 border border-amber-400/50 text-center font-mono font-black text-base tracking-[0.25em] text-amber-300 uppercase focus:outline-none focus:border-amber-300"
                    />
                    {joinFeedback && (
                      <div className="text-[10px] font-mono text-red-300 bg-red-950/60 border border-red-500/40 rounded px-2 py-1">
                        {joinFeedback}
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={joiningCode || joinCodeInput.length < 4}
                      className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
                    >
                      {joiningCode ? 'ENTRANDO...' : 'ENTRAR NA SALA »'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* CONVIDAR AMIGOS button above INICIAR */}
            <button
              type="button"
              onClick={handleCopyCode}
              className="w-full py-2.5 px-3 rounded-xl bg-[#10141e]/95 hover:bg-[#171d2b] border border-amber-400/35 hover:border-amber-400 text-white font-display font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_8px_24px_rgba(0,0,0,0.85)] flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
              </svg>
              <span>
                {copiedCode
                  ? `SALA #${room.roomId} COPIADA ✓`
                  : 'CONVIDAR AMIGOS'}
              </span>
            </button>
          </div>
        </div>

        {/* BOTTOM ROW: LEFT CHAT & MIC CLUSTER + CENTER 4 OPERATOR CARDS + RIGHT GOLDEN INICIAR CTA */}
        <div className="flex items-end justify-between gap-2 sm:gap-3">
          {/* Bottom-Left: Chat Bar + 3 Tactical Square Buttons (Mic, Speaker, Quick Radio/Code) */}
          <div className="w-[185px] sm:w-[245px] lg:w-[270px] flex flex-col gap-2 pointer-events-auto shrink-0">
            {/* Expandable Chat Drawer when clicked */}
            {chatExpanded && (
              <div className="rounded-xl bg-[#0b0f18]/96 border border-amber-400/45 p-2.5 shadow-2xl flex flex-col gap-2 max-h-44">
                <div className="flex items-center justify-between border-b border-white/10 pb-1">
                  <span className="text-[10px] font-mono font-bold text-amber-300 uppercase">
                    CHAT DO ESQUADRÃO (#{room.roomId})
                  </span>
                  <button
                    type="button"
                    onClick={() => setChatExpanded(false)}
                    className="text-xs text-slate-400 hover:text-white px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <div
                  ref={chatScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 text-[11px]"
                >
                  {chatMessages.length === 0 ? (
                    <div className="text-slate-500 font-mono text-[10px] py-2">
                      Nenhuma mensagem ainda. Envie um aviso para o esquadrão!
                    </div>
                  ) : (
                    chatMessages.map((m) => (
                      <div key={m.id} className="leading-snug">
                        <span className="font-bold text-amber-300">
                          {m.senderCallsign}:{' '}
                        </span>
                        <span className="text-slate-100">{m.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Chat Pill Bar matching reference (`💬 LUCASZIN: bora rankeada galera? 😊`) */}
            <form
              onSubmit={handleSendChat}
              onClick={() => setChatExpanded(true)}
              className="h-9 sm:h-10 rounded-xl bg-[#10141d]/95 border border-white/15 hover:border-amber-400/45 px-2.5 flex items-center justify-between gap-2 shadow-[0_6px_20px_rgba(0,0,0,0.85)]"
            >
              <span className="text-slate-300 shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                </svg>
              </span>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={
                  latestChat
                    ? `${latestChat.senderCallsign}: ${latestChat.text}`
                    : `${localPlayer?.callsign || 'RAFA'}: bora rankeada galera?`
                }
                className="flex-1 min-w-0 bg-transparent text-[11px] sm:text-xs text-slate-200 placeholder:text-slate-300 focus:outline-none truncate"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (chatInput.trim()) {
                    sendSquadChatMessage(chatInput);
                    setChatInput('');
                  } else {
                    handleQuickChatCallout('Bora rankeada galera? Pronto!');
                  }
                }}
                title="Enviar mensagem rápida"
                className="text-slate-300 hover:text-amber-300 shrink-0 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M8.5 14.5s1.5 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </form>

            {/* 3 Square Tactical Buttons: Mic, Speaker, Radio/Room Code */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleToggleMic()}
                title={
                  voiceState.micMode === 'MUTED'
                    ? 'Ativar Microfone na Sala e na Partida'
                    : 'Silenciar Microfone'
                }
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                  voiceState.micMode !== 'MUTED'
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.35)]'
                    : 'bg-[#10141d]/95 border-white/15 text-slate-300 hover:border-white/35'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
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
              </button>

              <button
                type="button"
                onClick={handleToggleSpeaker}
                title={
                  voiceState.teamChannelMuted
                    ? 'Ativar Áudio de Voz do Esquadrão'
                    : 'Silenciar Áudio de Voz do Esquadrão'
                }
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                  voiceState.teamChannelMuted
                    ? 'bg-red-500/20 border-red-400/60 text-red-300'
                    : 'bg-[#10141d]/95 border-white/15 text-slate-200 hover:border-white/35'
                }`}
              >
                {voiceState.teamChannelMuted ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={() => setChatExpanded((prev) => !prev)}
                title="Abrir Histórico de Rádio & Chat Tático"
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center cursor-pointer transition-all shadow-lg ${
                  chatExpanded
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300'
                    : 'bg-[#10141d]/95 border-white/15 text-slate-200 hover:border-white/35'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="5"
                    width="18"
                    height="14"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <circle cx="8.5" cy="12" r="1.5" fill="currentColor" />
                  <circle cx="15.5" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          {/* Bottom-Center: 4 Chamfered Operator Cards aligned under the 3D Squad Formation */}
          <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 sm:gap-2.5 pointer-events-auto overflow-x-auto py-0.5">
            {bottomCardSlots.map((slotIdx) => {
              const realMember = playersList[slotIdx];
              const formationSpec = formationMembers[slotIdx];
              const isSlotLeader =
                realMember
                  ? realMember.uid === room.hostUid
                  : slotIdx === 0;
              const isSlotLocal = realMember
                ? realMember.uid === localUid
                : slotIdx === 0;
              const isSlotReady = realMember
                ? isSlotLeader || Boolean(realMember.isReady)
                : true;
              const callsign =
                realMember?.callsign || formationSpec?.callsign || `OPERADOR ${slotIdx + 1}`;
              const memberMmr = realMember?.mmr || localMmr;
              const tierLabel = getCompetitiveTierLabel(memberMmr);
              const rankLevel = realMember?.rankLevel || profile.rankLevel || 4;
              const peerVoice = realMember ? voiceState.peers[realMember.uid] : undefined;
              const isSpeaking = isSlotLocal
                ? voiceState.isTransmitting
                : Boolean(peerVoice?.isSpeaking && !peerVoice?.mutedByLocal);

              return (
                <div
                  key={realMember?.uid || `card-slot-${slotIdx}`}
                  onClick={() => {
                    if (!realMember) {
                      soundEngine.playMenuSelect();
                      setRightTab('FRIENDS');
                    }
                  }}
                  className={`relative min-w-[115px] sm:min-w-[138px] lg:min-w-[152px] h-12 sm:h-14 rounded-xl px-2 py-1.5 flex items-center gap-2 bg-gradient-to-b from-[#161a24]/95 to-[#0c0f16]/95 border transition-all shadow-[0_8px_22px_rgba(0,0,0,0.85)] ${
                    isSpeaking
                      ? 'border-emerald-400 ring-2 ring-emerald-400/35'
                      : isSlotLeader
                        ? 'border-amber-400/90 shadow-[0_0_16px_rgba(245,158,11,0.28)]'
                        : 'border-white/15 hover:border-amber-400/45 cursor-pointer'
                  }`}
                >
                  {/* Gold corner accent */}
                  <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-amber-400 rounded-tl-lg pointer-events-none" />

                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg overflow-hidden border border-amber-400/50 bg-slate-900 shrink-0">
                    <OperatorTacticalAvatar
                      team={realMember?.team || 'VANGUARD'}
                      classId={
                        (realMember?.classId ||
                          formationSpec?.classId ||
                          'FUZILEIRO') as WarfaceClassId
                      }
                      photoUrl={
                        (isSlotLocal ? profile.avatarDataUrl : undefined) ||
                        realMember?.avatarDataUrl
                      }
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-display font-black text-[11px] sm:text-xs text-white uppercase truncate">
                        {callsign}
                      </span>
                      {isSlotLeader && (
                        <span className="text-amber-400 text-[10px] shrink-0">
                          ♛
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <WarfaceRankIcon
                        level={rankLevel}
                        className="w-3 h-3 shrink-0"
                      />
                      <span className="font-mono font-bold text-[9px] sm:text-[10px] text-amber-200/90 uppercase truncate">
                        {realMember ? tierLabel : 'CONVIDAR +'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom-right green checkmark */}
                  {isSlotReady && (
                    <span className="absolute bottom-1 right-1.5 text-emerald-400 font-black text-[11px]">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom-Right: Large Golden-Amber INICIAR >> Button matching reference */}
          <div className="w-[195px] sm:w-[265px] lg:w-[290px] pointer-events-auto shrink-0">
            {!isHost ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setLocalPlayerReady(!localIsReady);
                }}
                className={`w-full h-14 sm:h-16 rounded-xl border-2 px-4 flex flex-col items-center justify-center cursor-pointer transition-all shadow-[0_10px_30px_rgba(0,0,0,0.9)] ${
                  localIsReady
                    ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 border-emerald-200 text-slate-950'
                    : 'bg-gradient-to-b from-[#ffcf4b] via-[#f59e0b] to-[#d97706] border-amber-200 text-slate-950'
                }`}
              >
                <span className="font-display font-black text-base sm:text-xl uppercase tracking-wider leading-none">
                  {localIsReady ? 'PRONTO ✓' : 'DAR PRONTO »'}
                </span>
                <span className="mt-1 px-2.5 py-0.5 rounded bg-black/80 text-amber-300 font-mono font-bold text-[9px] uppercase tracking-widest">
                  {modeDisplayLabel} · {currentMapMeta.label}
                </span>
              </button>
            ) : isSearching ? (
              <div className="flex flex-col gap-1.5">
                {queueType !== 'RANKED' && (
                  <button
                    type="button"
                    onClick={() => void handleHostLaunchImmediate()}
                    className="w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-[11px] uppercase tracking-wider cursor-pointer shadow-lg"
                  >
                    ENTRAR NA PARTIDA AGORA »
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    cancelSquadMatchSearch();
                  }}
                  className="w-full h-14 sm:h-16 rounded-xl bg-gradient-to-b from-red-600 to-red-800 hover:brightness-110 border-2 border-red-300/80 px-3 flex flex-col items-center justify-center cursor-pointer shadow-[0_10px_30px_rgba(239,68,68,0.5)]"
                >
                  <span className="font-display font-black text-sm sm:text-base text-white uppercase tracking-wider leading-none">
                    BUSCANDO {searchMins}:{searchSecs} (CANCELAR)
                  </span>
                  <span className="mt-1 px-2.5 py-0.5 rounded bg-black/80 text-amber-300 font-mono font-bold text-[9px] uppercase tracking-widest">
                    {modeDisplayLabel} · {currentMapMeta.label}
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!allSquadReady}
                onClick={handleHostStartSearch}
                className="relative w-full h-14 sm:h-16 rounded-xl bg-gradient-to-b from-[#ffd859] via-[#f5a623] to-[#d47a08] hover:brightness-105 active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed border-2 border-[#ffe89e] px-3 sm:px-4 flex items-center justify-between shadow-[0_10px_35px_rgba(245,158,11,0.55)] cursor-pointer transition-all"
              >
                {/* Left dark shield with gold crown emblem */}
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-[#18130a] border border-amber-300/60 flex items-center justify-center text-amber-400 shadow-inner shrink-0">
                  <span className="text-base sm:text-lg leading-none">♛</span>
                </div>

                {/* Center INICIAR + dark inner pill RANQUEADA · DE_DUST2 */}
                <div className="flex flex-col items-center justify-center min-w-0 flex-1 px-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-display font-black text-lg sm:text-2xl tracking-wider text-[#110d06] uppercase leading-none">
                      {!allSquadReady ? 'AGUARDANDO...' : 'INICIAR'}
                    </span>
                    <span className="font-display font-black text-base sm:text-xl text-[#7c4a03] leading-none">
                      »»
                    </span>
                  </div>
                  <div className="mt-1 px-2.5 py-0.5 rounded-md bg-[#16130d]/95 border border-amber-400/35 text-[8px] sm:text-[9px] font-mono font-bold text-amber-200 uppercase tracking-widest truncate max-w-full">
                    {modeDisplayLabel} · {currentMapMeta.label}
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
