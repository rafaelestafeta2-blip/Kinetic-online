import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  leaveActiveRoom,
  subscribeOnlineRoom,
} from '../multiplayer/onlineRoomService';
import { OnlineRoomState } from '../multiplayer/onlineTypes';
import {
  VoiceChatState,
  VoiceMicMode,
  voiceChatManager,
} from '../multiplayer/voiceChatManager';

interface ActiveSquadDockBarProps {
  visible: boolean;
  onOpenSquadRoom: () => void;
  onLeftRoom?: () => void;
}

export const ActiveSquadDockBar: React.FC<ActiveSquadDockBarProps> = ({
  visible,
  onOpenSquadRoom,
  onLeftRoom,
}) => {
  const [room, setRoom] = useState<OnlineRoomState | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceChatState>(() =>
    voiceChatManager.getState()
  );
  const [searchSec, setSearchSec] = useState(0);

  useEffect(() => {
    const unsubRoom = subscribeOnlineRoom((next) => setRoom(next));
    const unsubVoice = voiceChatManager.subscribe((next) => setVoiceState(next));
    return () => {
      unsubRoom();
      unsubVoice();
    };
  }, []);

  useEffect(() => {
    if (!room?.isSearchingMatch) {
      setSearchSec(0);
      return;
    }
    const startMs = room.searchStartedAtMs || Date.now();
    const tick = () => {
      setSearchSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [room?.isSearchingMatch, room?.searchStartedAtMs]);

  if (!visible || !room) return null;

  const players = Object.values(room.players || {});
  const readyCount = players.filter(
    (p) => p.uid === room.hostUid || p.isReady
  ).length;
  const mins = String(Math.floor(searchSec / 60)).padStart(2, '0');
  const secs = String(searchSec % 60).padStart(2, '0');

  const cycleMic = () => {
    const next: VoiceMicMode =
      voiceState.micMode === 'MUTED'
        ? 'OPEN'
        : voiceState.micMode === 'OPEN'
          ? 'PTT'
          : 'MUTED';
    void voiceChatManager.setMicMode(next);
  };

  const handleLeave = async () => {
    soundEngine.playMenuSelect();
    await leaveActiveRoom();
    onLeftRoom?.();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-45 pointer-events-auto select-none max-w-[96vw]"
    >
      <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 rounded-2xl bg-[#09101c]/95 border border-amber-400/55 shadow-[0_8px_32px_rgba(0,0,0,0.85)] backdrop-blur-md">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              room.isSearchingMatch
                ? 'bg-amber-400 animate-ping'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-display font-black uppercase tracking-wider text-white">
              <span className="text-amber-300">SALA {room.roomId}</span>
              <span className="text-slate-500">·</span>
              <span>
                {players.length}/5 ({readyCount} PRONTOS)
              </span>
            </div>
            <div className="text-[9px] font-mono text-slate-300 truncate">
              {room.isSearchingMatch
                ? `BUSCANDO PARTIDA · ${mins}:${secs}`
                : 'Navegação livre no menu · Voz ativa na sala'}
            </div>
          </div>
        </div>

        {/* Quick Mic Toggle while browsing Menu/Store/Inventory */}
        <button
          type="button"
          onClick={cycleMic}
          title="Alternar Microfone da Sala (Voz Aberta / PTT / Mudo)"
          className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold uppercase cursor-pointer shrink-0 transition-all ${
            voiceState.isTransmitting
              ? 'bg-emerald-500 text-slate-950 border-emerald-200'
              : voiceState.micMode === 'OPEN'
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                : voiceState.micMode === 'PTT'
                  ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                  : 'bg-red-950/70 border-red-500/50 text-red-300'
          }`}
        >
          {voiceState.micMode === 'OPEN'
            ? '🎙️ VOZ ON'
            : voiceState.micMode === 'PTT'
              ? '🎙️ PTT'
              : '🔇 MUDO'}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuSelect();
            onOpenSquadRoom();
          }}
          className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
        >
          ABRIR SALA
        </button>

        <button
          type="button"
          onClick={() => void handleLeave()}
          title="Sair da Sala de Esquadrão e desconectar microfone"
          className="px-2 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/35 border border-red-400/45 text-red-200 font-display font-bold text-[10px] uppercase cursor-pointer shrink-0"
        >
          SAIR ✕
        </button>
      </div>
    </div>
  );
};
