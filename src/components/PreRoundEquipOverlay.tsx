import React from 'react';
import { areAllOnlinePlayersLoaded, isOnlineMatchActive } from '../multiplayer/onlineRoomService';
import { YardBombHudInfo } from '../types/game';

interface PreRoundEquipOverlayProps {
  yardBomb: YardBombHudInfo;
}

/** Warface-style pre-round equip freeze (~7s) before combat starts. */
export const PreRoundEquipOverlay: React.FC<PreRoundEquipOverlayProps> = ({
  yardBomb,
}) => {
  const sec = Math.max(0, Math.ceil(yardBomb.equipTimerSec || 0));
  const waitingPeers =
    isOnlineMatchActive() && yardBomb.currentRound <= 1 && !areAllOnlinePlayersLoaded();

  return (
    <div className="fixed inset-0 z-40 pointer-events-none select-none flex flex-col items-center justify-start pt-12 sm:pt-16 px-3">
      <div className="relative z-10 flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl border border-amber-400/40 bg-[#0a1220]/88 backdrop-blur-xs shadow-[0_0_32px_rgba(245,158,11,0.22)] max-w-sm w-full">
        <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.3em] text-amber-300/90 uppercase">
          {waitingPeers ? 'Sincronizando Jogadores Online' : 'Fase de Equipamento'}
        </div>
        <div className="font-display font-black text-3xl sm:text-5xl tabular-nums text-white leading-none drop-shadow-[0_0_16px_rgba(251,191,36,0.55)]">
          {sec}s
        </div>
        <div className="text-xs sm:text-sm font-display font-black tracking-wider text-sky-200 uppercase">
          Rodada {yardBomb.currentRound} · {waitingPeers ? 'Aguardando Sala Carregar' : 'Prepare-se'}
        </div>
        <div className="w-40 h-1.5 rounded-full bg-slate-800 overflow-hidden border border-white/10 mt-0.5">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-sky-400 transition-[width] duration-200"
            style={{ width: `${Math.min(100, (sec / 7) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
