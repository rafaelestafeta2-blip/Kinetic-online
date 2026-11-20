import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { DrillMode } from '../types/game';
import { thumbForDrillMode } from './mapSelectThumbs';
import { TeamVoiceCommsHud } from './TeamVoiceCommsHud';
import {
  OperatorTacticalAvatar,
  WARFACE_CLASS_META,
  WarfaceClassIcon,
} from './WarfaceClassIcons';
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
}> = [
  { id: 'STATION_TDM_5V5', label: 'STATION ARENA', modeTag: 'MATA-MATA 5V5' },
  { id: 'DUST2_BOMB_5V5', label: 'DE_DUST2', modeTag: 'BOMB 5V5' },
  { id: 'ASSAULT_BOMB_5V5', label: 'CS_ASSAULT', modeTag: 'BOMB 5V5' },
  { id: 'INDUSTRIA_BOMB_5V5', label: 'INDUSTRIA', modeTag: 'BOMB 5V5' },
  { id: 'HANGAR_BOMB_5V5', label: 'HANGAR', modeTag: 'BOMB 5V5' },
  { id: 'EASTERN_CITY_BOMB_5V5', label: 'EASTERN CITY', modeTag: 'BOMB 5V5' },
  { id: 'MIRAGE_ANUBIS_BOMB_5V5', label: 'MIRAGE ANUBIS', modeTag: 'BOMB 5V5' },
  { id: 'STATION_CAPTURE_5V5', label: 'STATION CTF', modeTag: 'CAPTURA 5V5' },
];

const MAX_SQUAD_SLOTS = 5;

export const SquadReadyRoomModal: React.FC<SquadReadyRoomModalProps> = ({
  isOpen,
  onMinimize,
  onLeaveRoom,
}) => {
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [chatMessages, setChatMessages] = useState<SquadChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [rightTab, setRightTab] = useState<'CHAT' | 'INVITE' | 'JOIN'>('CHAT');
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
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinFeedback, setJoinFeedback] = useState<string | null>(null);
  const [joiningCode, setJoiningCode] = useState(false);
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  const [showMapPicker, setShowMapPicker] = useState(false);
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

  // Auto-scroll squad chat to newest message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, rightTab, isOpen]);

  // Search timer while squad is searching for match
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

  const playersList = useMemo<OnlinePlayerState[]>(() => {
    if (!room?.players) return [];
    const list = Object.values(room.players);
    return list.sort((a, b) => {
      if (a.uid === room.hostUid) return -1;
      if (b.uid === room.hostUid) return 1;
      return a.callsign.localeCompare(b.callsign);
    });
  }, [room]);

  if (!isOpen || !room) return null;

  const isHost = room.hostUid === localUid;
  const localPlayer = room.players[localUid];
  const localIsReady = Boolean(localPlayer?.isReady);
  const nonHostPlayers = playersList.filter((p) => p.uid !== room.hostUid);
  const unreadyNonHosts = nonHostPlayers.filter((p) => !p.isReady);
  const readyCount = playersList.filter(
    (p) => p.uid === room.hostUid || p.isReady
  ).length;
  const allSquadReady = unreadyNonHosts.length === 0;
  const isSearching = Boolean(room.isSearchingMatch);
  const queueType: MatchQueueType = room.queueType === 'RANKED' ? 'RANKED' : 'CASUAL';
  const currentMapMeta =
    SQUAD_MAPS.find((m) => m.id === room.arenaMode) || SQUAD_MAPS[0];
  const friendsList = Object.values(inbox.friends || {});
  const wsOnline = isWebSocketConnected();

  const searchMins = String(Math.floor(searchElapsedSec / 60)).padStart(2, '0');
  const searchSecs = String(searchElapsedSec % 60).padStart(2, '0');

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
      setRightTab('CHAT');
      setJoinFeedback(null);
    } else {
      setJoinFeedback(res.error || 'Não foi possível entrar na sala.');
    }
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

  const modeBadgeLabel = room.isPrivate
    ? 'SALA PRIVADA'
    : queueType === 'RANKED'
      ? 'RANKED 5V5'
      : room.arenaMode === 'STATION_TDM_5V5'
        ? 'MATA-MATA 5V5'
        : 'CASUAL 5V5';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 bg-black/82 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none pointer-events-auto font-sans"
    >
      <div className="w-full max-w-[1040px] h-[94dvh] max-h-[640px] rounded-2xl border border-amber-400/45 bg-gradient-to-b from-[#0d1420] via-[#090e17] to-[#070a11] text-white shadow-[0_20px_70px_rgba(0,0,0,0.92)] overflow-hidden flex flex-col">
        {/* TOP HEADER */}
        <header className="px-3 sm:px-4 py-2 bg-gradient-to-r from-[#181f2e] via-[#101622] to-[#1a141c] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span
              className={`px-2 py-0.5 rounded font-display font-black text-[10px] sm:text-xs uppercase tracking-wider border ${
                queueType === 'RANKED'
                  ? 'bg-red-500/20 border-red-400/60 text-red-300'
                  : room.isPrivate
                    ? 'bg-purple-500/20 border-purple-400/60 text-purple-200'
                    : 'bg-amber-500/20 border-amber-400/60 text-amber-300'
              }`}
            >
              {modeBadgeLabel}
            </span>

            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/55 border border-white/15 font-mono">
              <span className="text-[9px] sm:text-[10px] text-slate-400 uppercase">
                SALA
              </span>
              <span className="text-xs sm:text-sm font-black tracking-[0.2em] text-amber-300">
                {room.roomId}
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/35 text-[9px] font-bold text-amber-200 uppercase cursor-pointer"
              >
                {copiedCode ? 'COPIADO ✓' : 'COPIAR'}
              </button>
            </div>

            <span
              className={`hidden md:inline-flex items-center gap-1 text-[10px] font-mono ${
                wsOnline ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  wsOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {wsOnline ? 'SERVIDOR ONLINE' : 'SINCRONIZANDO...'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                onMinimize();
              }}
              title="Fechar janela e navegar livremente no Menu, Loja ou Inventário sem sair da sala"
              className="px-2.5 sm:px-3 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 font-display font-bold text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              ▾ NAVEGAR NO MENU
            </button>
            <button
              type="button"
              onClick={() => void handleLeave()}
              className="px-2.5 sm:px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-400/50 text-red-200 font-display font-bold text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer transition-all"
            >
              SAIR DA SALA ✕
            </button>
          </div>
        </header>

        {/* BODY: LEFT SQUAD + VOICE / RIGHT CHAT + INVITES */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* LEFT COLUMN: MAP/MODE BAR + 5 SQUAD SLOTS + VOICE RADIO */}
          <div className="md:col-span-7 flex flex-col min-h-0 p-2.5 sm:p-3 gap-2.5 overflow-y-auto border-b md:border-b-0 md:border-r border-white/10">
            {/* Map & Queue Config Strip */}
            <div className="rounded-xl border border-white/15 bg-[#101826]/90 p-2 flex items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={thumbForDrillMode(currentMapMeta.id)}
                  alt={currentMapMeta.label}
                  className="w-16 h-10 sm:w-20 sm:h-11 rounded-lg border border-amber-400/40 object-cover shrink-0"
                  draggable={false}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-400">
                      {currentMapMeta.modeTag}
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      · MMR MÉDIO {room.averageMmr || profile.mmr || 2450}
                    </span>
                  </div>
                  <div className="font-display font-black text-sm sm:text-base uppercase tracking-wider text-white truncate leading-tight">
                    {currentMapMeta.label}
                  </div>
                </div>
              </div>

              {isHost && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {!room.isPrivate && (
                    <div className="hidden sm:flex items-center rounded-lg bg-black/55 border border-white/10 p-0.5">
                      {(
                        [
                          { id: 'CASUAL', label: 'CASUAL' },
                          { id: 'RANKED', label: 'RANKED' },
                        ] as const
                      ).map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          disabled={isSearching}
                          onClick={() => {
                            soundEngine.playMenuSelect();
                            updateSquadRoomConfig(room.arenaMode, q.id);
                          }}
                          className={`px-2 py-0.5 rounded text-[9px] font-display font-black uppercase cursor-pointer transition-all ${
                            queueType === q.id
                              ? q.id === 'RANKED'
                                ? 'bg-red-500 text-white'
                                : 'bg-amber-400 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isSearching}
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      setShowMapPicker((prev) => !prev);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-amber-200 font-display font-bold text-[10px] uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  >
                    {showMapPicker ? 'FECHAR MAPAS' : 'MAPA ▾'}
                  </button>
                </div>
              )}
            </div>

            {/* Inline Quick Map Picker for Host */}
            {showMapPicker && isHost && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 rounded-xl bg-black/60 border border-amber-400/35 shrink-0">
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
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-[#0c121d] border-white/10 text-slate-300 hover:border-white/30'
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

            {/* 5-Slot Squad Roster */}
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-300">
                  ESQUADRÃO DE OPERAÇÕES ({playersList.length}/{MAX_SQUAD_SLOTS})
                </span>
                <div className="flex items-center gap-2">
                  {room.isPrivate && (
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        void switchLocalPlayerTeam();
                      }}
                      className="text-[9px] font-mono font-bold text-sky-300 hover:text-sky-200 underline cursor-pointer uppercase"
                    >
                      Trocar Time ({localPlayer?.team || 'VANGUARD'})
                    </button>
                  )}
                  <span className="text-[10px] font-mono font-bold text-emerald-400">
                    {readyCount}/{playersList.length} PRONTOS
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5">
                {Array.from({ length: Math.max(MAX_SQUAD_SLOTS, playersList.length) }).map(
                  (_, slotIdx) => {
                    const member = playersList[slotIdx];
                    if (!member) {
                      return (
                        <button
                          key={`empty-${slotIdx}`}
                          type="button"
                          onClick={() => {
                            soundEngine.playMenuSelect();
                            setRightTab('INVITE');
                          }}
                          className="h-12 rounded-xl border border-dashed border-white/15 bg-white/[0.02] hover:bg-amber-500/10 hover:border-amber-400/45 px-3 flex items-center justify-between transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 text-slate-500 group-hover:text-amber-300">
                            <span className="w-7 h-7 rounded-lg border border-dashed border-white/20 group-hover:border-amber-400/60 flex items-center justify-center font-mono text-sm font-bold">
                              +
                            </span>
                            <span className="font-display font-bold text-xs uppercase tracking-wider">
                              VAGA DISPONÍVEL · CONVIDAR AMIGO
                            </span>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 group-hover:text-amber-200 uppercase">
                            CONVIDAR »
                          </span>
                        </button>
                      );
                    }

                    const isMemberHost = member.uid === room.hostUid;
                    const isLocal = member.uid === localUid;
                    const isMemberReady = isMemberHost || Boolean(member.isReady);
                    const peerVoice = voiceState.peers[member.uid];
                    const isSpeaking = isLocal
                      ? voiceState.isTransmitting
                      : Boolean(peerVoice?.isSpeaking && !peerVoice?.mutedByLocal);
                    const memberClass = member.classId || 'FUZILEIRO';

                    return (
                      <div
                        key={member.uid}
                        className={`h-12 rounded-xl border px-2.5 flex items-center justify-between gap-2 transition-all ${
                          isSpeaking
                            ? 'bg-emerald-950/45 border-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.3)]'
                            : isLocal
                              ? 'bg-[#121c2c] border-sky-400/50'
                              : 'bg-[#0e1522] border-white/12'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg overflow-hidden border shrink-0 relative ${
                              isSpeaking
                                ? 'border-emerald-400 ring-2 ring-emerald-400/40'
                                : member.team === 'BLACKTHORN'
                                  ? 'border-red-500/60'
                                  : 'border-sky-400/50'
                            }`}
                          >
                            <OperatorTacticalAvatar
                              team={member.team}
                              classId={memberClass}
                              photoUrl={
                                (isLocal ? profile.avatarDataUrl : undefined) ||
                                member.avatarDataUrl
                              }
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <WarfaceRankIcon
                                level={member.rankLevel || 1}
                                className="w-3.5 h-3.5 shrink-0"
                              />
                              <span className="font-display font-black text-xs sm:text-sm text-white truncate">
                                {member.callsign}
                              </span>
                              {isLocal && (
                                <span className="text-[9px] font-mono text-sky-300 font-bold shrink-0">
                                  (VOCÊ)
                                </span>
                              )}
                              {isMemberHost && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-400/50 text-[8px] font-mono font-black text-amber-300 uppercase shrink-0">
                                  ★ LÍDER
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400">
                              <WarfaceClassIcon
                                classId={memberClass}
                                className="w-3 h-3 shrink-0"
                              />
                              <span>{WARFACE_CLASS_META[memberClass].label}</span>
                              <span>·</span>
                              <span className="text-amber-300/90">
                                {member.mmr || 2450} MMR
                              </span>
                              {isSpeaking && (
                                <span className="text-emerald-400 font-bold animate-pulse">
                                  · 🎙️ FALANDO
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wider ${
                              isMemberReady
                                ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300'
                                : 'bg-amber-500/15 border-amber-400/45 text-amber-200'
                            }`}
                          >
                            {isMemberHost
                              ? 'LÍDER ✓'
                              : isMemberReady
                                ? 'PRONTO ✓'
                                : 'AGUARDANDO'}
                          </span>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>

            {/* Embedded Live Voice Radio (stays connected across Menu -> Loading -> Match) */}
            <div className="shrink-0">
              <TeamVoiceCommsHud variant="LOBBY" />
            </div>
          </div>

          {/* RIGHT COLUMN: SQUAD TEXT CHAT / FRIENDS INVITE / JOIN BY CODE */}
          <div className="md:col-span-5 flex flex-col min-h-0 bg-[#080c14]">
            <div className="grid grid-cols-3 border-b border-white/10 shrink-0">
              {(
                [
                  { id: 'CHAT', label: `CHAT (${chatMessages.length})` },
                  { id: 'INVITE', label: `AMIGOS (${friendsList.length})` },
                  { id: 'JOIN', label: 'ENTRAR CÓDIGO' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setRightTab(t.id);
                  }}
                  className={`py-2 text-[10px] sm:text-[11px] font-display font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
                    rightTab === t.id
                      ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {rightTab === 'CHAT' && (
              <div className="flex-1 min-h-0 flex flex-col">
                <div
                  ref={chatScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-1.5"
                >
                  {chatMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 text-slate-500 font-mono text-[11px]">
                      <span>💬 Chat do Esquadrão ativo.</span>
                      <span className="mt-1 text-[10px] text-slate-500">
                        Combine estratégias, mapa ou avise quando estiver pronto.
                      </span>
                    </div>
                  ) : (
                    chatMessages.map((m) => {
                      const isMine = m.senderUid === localUid;
                      const timeLabel = new Date(m.ts).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      return (
                        <div
                          key={m.id}
                          className={`rounded-lg px-2.5 py-1.5 border text-xs ${
                            isMine
                              ? 'bg-sky-500/15 border-sky-400/35 ml-4'
                              : 'bg-white/[0.04] border-white/10 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-[9px] font-mono mb-0.5">
                            <span className="flex items-center gap-1 font-bold text-amber-300 truncate">
                              <WarfaceClassIcon
                                classId={m.senderClassId || 'FUZILEIRO'}
                                className="w-3 h-3 shrink-0"
                              />
                              <span>{m.senderCallsign}</span>
                            </span>
                            <span className="text-slate-500 shrink-0">{timeLabel}</span>
                          </div>
                          <p className="text-slate-100 text-[11px] sm:text-xs break-words leading-snug">
                            {m.text}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={handleSendChat}
                  className="p-2 border-t border-white/10 flex items-center gap-1.5 bg-[#0b101a] shrink-0"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    maxLength={180}
                    placeholder="Mensagem para o esquadrão..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 focus:border-amber-400/70 focus:outline-none text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-[11px] uppercase tracking-wider cursor-pointer shrink-0"
                  >
                    ENVIAR
                  </button>
                </form>
              </div>
            )}

            {rightTab === 'INVITE' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-400/30 text-[10px] font-mono text-amber-200 flex items-center justify-between gap-2">
                  <span>
                    Código da sala: <strong className="text-white">{room.roomId}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold uppercase cursor-pointer"
                  >
                    {copiedCode ? 'COPIADO ✓' : 'COPIAR'}
                  </button>
                </div>

                {friendsList.length === 0 ? (
                  <div className="text-center py-8 px-3 text-xs font-mono text-slate-400">
                    Nenhum amigo adicionado ainda. Adicione amigos no ícone Social no topo do menu ou compartilhe o código{' '}
                    <strong className="text-amber-300">{room.roomId}</strong>.
                  </div>
                ) : (
                  friendsList.map((f) => {
                    const alreadyInRoom = Boolean(room.players[f.uid]);
                    const invited = Boolean(invitedUids[f.uid]);
                    return (
                      <div
                        key={f.uid}
                        className="p-2 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-amber-400/40 overflow-hidden flex items-center justify-center shrink-0">
                            {f.avatarDataUrl ? (
                              <img
                                src={f.avatarDataUrl}
                                alt={f.callsign}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-bold text-amber-300">
                                {f.callsign.slice(0, 2)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-display font-black text-white truncate">
                              {f.callsign}
                            </div>
                            <div className="flex items-center gap-1 text-[9px] font-mono text-slate-400">
                              <WarfaceRankIcon
                                level={f.rankLevel || 1}
                                className="w-3 h-3"
                              />
                              <span>Nív. {f.rankLevel || 1}</span>
                            </div>
                          </div>
                        </div>

                        {alreadyInRoom ? (
                          <span className="px-2 py-1 rounded bg-emerald-500/20 border border-emerald-400/50 text-[9px] font-mono font-bold text-emerald-300 uppercase shrink-0">
                            NA SALA ✓
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={invited}
                            onClick={() => void handleInviteFriend(f.uid)}
                            className={`px-2.5 py-1 rounded-lg font-display font-black text-[10px] uppercase tracking-wider cursor-pointer shrink-0 ${
                              invited
                                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            }`}
                          >
                            {invited ? 'CONVIDADO ✓' : '+ CONVIDAR'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {rightTab === 'JOIN' && (
              <div className="flex-1 min-h-0 p-3 flex flex-col justify-center gap-3">
                <div className="text-xs font-mono text-slate-300">
                  Recebeu um código de sala de um amigo? Digite os 6 caracteres abaixo para entrar no esquadrão dele:
                </div>
                <form onSubmit={(e) => void handleJoinByCode(e)} className="space-y-2.5">
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) =>
                      setJoinCodeInput(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
                      )
                    }
                    placeholder="EX: K7P4M2"
                    className="w-full px-3 py-2.5 rounded-xl bg-black/70 border border-amber-400/50 text-center font-mono font-black text-lg tracking-[0.3em] text-amber-300 uppercase focus:outline-none focus:border-amber-300"
                  />
                  {joinFeedback && (
                    <div className="text-[11px] font-mono text-red-300 bg-red-950/50 border border-red-500/40 rounded-lg px-2.5 py-1.5">
                      {joinFeedback}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={joiningCode || joinCodeInput.length < 4}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
                  >
                    {joiningCode ? 'ENTRANDO NA SALA...' : 'ENTRAR NA SALA DO AMIGO »'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM FOOTER: READY / SEARCH MATCH / IMMEDIATE START */}
        <footer className="px-3 sm:px-4 py-2.5 bg-[#0c121e] border-t border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 font-mono text-[10px] sm:text-xs">
            {isSearching ? (
              <span className="flex items-center gap-2 text-amber-300 font-bold">
                <span className="w-2.5 h-2.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
                <span>
                  BUSCANDO PARTIDA {queueType} · {searchMins}:{searchSecs}
                </span>
              </span>
            ) : !allSquadReady ? (
              <span className="text-amber-300">
                ⏳ Aguardando {unreadyNonHosts.length} amigo(s) clicar em PRONTO...
              </span>
            ) : (
              <span className="text-emerald-300">
                ✓ Esquadrão pronto · Voz contínua ativa até a partida
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isHost ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setLocalPlayerReady(!localIsReady);
                }}
                className={`px-5 py-2 rounded-xl font-display font-black text-xs sm:text-sm uppercase tracking-wider cursor-pointer transition-all ${
                  localIsReady
                    ? 'bg-slate-800 hover:bg-slate-700 border border-emerald-400/60 text-emerald-300'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.45)]'
                }`}
              >
                {localIsReady ? 'PRONTO ✓ (CANCELAR)' : 'DAR PRONTO ✓'}
              </button>
            ) : isSearching ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    cancelSquadMatchSearch();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/35 border border-red-400/50 text-red-200 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  CANCELAR BUSCA
                </button>
                {queueType !== 'RANKED' && (
                  <button
                    type="button"
                    onClick={() => void handleHostLaunchImmediate()}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-display font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.45)] cursor-pointer"
                  >
                    ENTRAR AGORA »
                  </button>
                )}
              </>
            ) : (
              <>
                {!room.isPrivate && queueType !== 'RANKED' && (
                  <button
                    type="button"
                    disabled={!allSquadReady}
                    onClick={() => void handleHostLaunchImmediate()}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/18 disabled:opacity-40 border border-white/20 text-slate-100 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    INICIAR DIRETO
                  </button>
                )}
                <button
                  type="button"
                  disabled={!allSquadReady}
                  onClick={handleHostStartSearch}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_24px_rgba(239,68,68,0.5)] cursor-pointer"
                >
                  {room.isPrivate ? 'INICIAR PARTIDA »' : 'BUSCAR PARTIDA »'}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
