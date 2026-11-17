import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  isWebSocketConnected,
  leaveActiveRoom,
  quickMatchOrCreateRoom,
  startMatchInActiveRoom,
  subscribeOnlineRoom,
} from '../multiplayer/onlineRoomService';
import { OnlineRoomState } from '../multiplayer/onlineTypes';
import { DrillMode } from '../types/game';
import { thumbForDrillMode } from './mapSelectThumbs';

interface WarfaceMatchmakingWidgetProps {
  selectedMode: DrillMode;
  onChangeMode: (mode: DrillMode) => void;
  onMatchReady: (mode: DrillMode) => void;
  onCancelSearch: () => void;
}

const REQUIRED_PUBLIC_PLAYERS = 10;

const CASUAL_MAP_POOL: Array<{
  id: DrillMode;
  title: string;
  subtitle: string;
}> = [
  { id: 'DUST2_BOMB_5V5', title: 'DE_DUST2', subtitle: 'Deserto Clássico • Bomb A / B' },
  { id: 'ASSAULT_BOMB_5V5', title: 'CS_ASSAULT', subtitle: 'Galpão Industrial • Bomb A / B' },
  { id: 'INDUSTRIA_BOMB_5V5', title: 'INDUSTRIA', subtitle: 'Refinaria • Bomb A / B' },
  { id: 'HANGAR_BOMB_5V5', title: 'HANGAR', subtitle: 'Base Aérea • Bomb A / B' },
  { id: 'EASTERN_CITY_BOMB_5V5', title: 'EASTERN CITY', subtitle: 'Cidade Leste • Bomb A / B' },
  { id: 'MIRAGE_ANUBIS_BOMB_5V5', title: 'MIRAGE ANUBIS', subtitle: 'Fortaleza Deserto • Bomb A / B' },
];

export const WarfaceMatchmakingWidget: React.FC<WarfaceMatchmakingWidgetProps> = ({
  selectedMode,
  onChangeMode,
  onMatchReady,
  onCancelSearch,
}) => {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [activeRoom, setActiveRoom] = useState<OnlineRoomState | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [matchFound, setMatchFound] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [showCasualMapModal, setShowCasualMapModal] = useState(false);
  const launchedRef = useRef(false);

  // Cronômetro da Sala Casual
  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Entra ou cria automaticamente uma sala pública para o mapa escolhido na Sala Casual
  useEffect(() => {
    let cancelled = false;
    setActiveRoom(null);
    setIsConnecting(true);
    setMatchFound(false);
    setQueueError(null);
    launchedRef.current = false;

    quickMatchOrCreateRoom(selectedMode)
      .then((room) => {
        if (cancelled) return;
        setActiveRoom(room);
        setIsConnecting(false);
        if (!room) {
          setQueueError(
            'Fila offline no momento. Você pode iniciar a partida com Bots táticos.'
          );
        }
      })
      .catch(() => {
        if (!cancelled) setIsConnecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedMode]);

  useEffect(() => {
    const unsub = subscribeOnlineRoom((room) => {
      setActiveRoom(room);
      if (!room || launchedRef.current) return;

      const realCount = Object.keys(room.players || {}).length;
      if (room.status === 'PLAYING' || realCount >= REQUIRED_PUBLIC_PLAYERS) {
        launchedRef.current = true;
        setMatchFound(true);
        soundEngine.playMenuSelect();
        if (room.status !== 'PLAYING') {
          void startMatchInActiveRoom();
        }
        window.setTimeout(() => {
          onMatchReady(room.arenaMode);
        }, 1200);
      }
    });
    return () => unsub();
  }, [onMatchReady]);

  const playersCount = activeRoom ? Object.keys(activeRoom.players || {}).length : 1;
  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');
  const currentMapMeta =
    CASUAL_MAP_POOL.find((m) => m.id === selectedMode) || CASUAL_MAP_POOL[0];

  const handleCancel = async () => {
    soundEngine.playMenuSelect();
    await leaveActiveRoom();
    onCancelSearch();
  };

  return (
    <>
      {/* SALA DA PARTIDA CASUAL 5V5 (COM SELETOR DE MAPA DENTRO DA SALA ANTES DE COMEÇAR) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 select-none font-sans pointer-events-auto"
      >
        <div className="w-full max-w-[540px] rounded-2xl border border-amber-400/50 bg-[#0b1018] text-white shadow-[0_12px_40px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col">
          {/* Header da Sala Casual */}
          <div className="px-4 py-3 bg-gradient-to-r from-[#182232] via-[#101722] to-[#182232] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative w-3.5 h-3.5 flex items-center justify-center shrink-0">
                <span
                  className={`absolute inset-0 rounded-full border-2 ${
                    matchFound
                      ? 'border-emerald-400 animate-ping'
                      : 'border-amber-400 border-t-transparent animate-spin'
                  }`}
                />
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    matchFound ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              </div>
              <div>
                <h3 className="font-display font-black text-sm sm:text-base uppercase tracking-wider text-amber-300 leading-none">
                  SALA DA PARTIDA CASUAL 5V5
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  Escolha o mapa da sala antes de iniciar · Tempo na fila {mins}:{secs}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCancel()}
              className="px-2.5 py-1 rounded bg-red-500/20 hover:bg-red-500/35 border border-red-400/40 text-xs font-mono font-bold text-red-200 cursor-pointer"
            >
              SAIR ✕
            </button>
          </div>

          {/* Corpo da Sala Casual: Card do Mapa + Botão Escolher Mapa + Jogadores */}
          <div className="p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#121926] border border-amber-400/40">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={thumbForDrillMode(currentMapMeta.id)}
                  alt={currentMapMeta.title}
                  className="w-24 h-14 rounded-lg border border-amber-400/50 object-cover shrink-0"
                  draggable={false}
                />
                <div className="min-w-0">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-amber-400">
                    MAPA DA SALA CASUAL
                  </span>
                  <div className="font-display font-black text-lg text-white uppercase tracking-wide truncate">
                    {currentMapMeta.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    {currentMapMeta.subtitle}
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={matchFound}
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setShowCasualMapModal(true);
                }}
                className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.4)] shrink-0 cursor-pointer transition-all"
              >
                TROCAR MAPA 🗺️
              </button>
            </div>

            {/* Barra de 10 Slots de Jogadores na Sala */}
            <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 uppercase">
                  OPERADORES NA SALA CASUAL:
                </span>
                <span className="font-black text-amber-300 tabular-nums">
                  {playersCount} / {REQUIRED_PUBLIC_PLAYERS}
                </span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: REQUIRED_PUBLIC_PLAYERS }).map((_, idx) => {
                  const filled = idx < playersCount;
                  return (
                    <div
                      key={idx}
                      className={`h-2 rounded-sm transition-all duration-300 ${
                        filled
                          ? matchFound
                            ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                            : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                          : 'bg-white/12'
                      }`}
                    />
                  );
                })}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {queueError
                  ? queueError
                  : isConnecting
                    ? 'Sincronizando sala pública...'
                    : matchFound
                      ? 'Partida pronta! Carregando mapa...'
                      : `${isWebSocketConnected() ? 'Servidor Online Ativo' : 'Modo Local'} · Aguardando jogadores ou inicie agora`}
              </div>
            </div>

            {/* Ações da Sala Casual */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleCancel()}
                className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-display font-bold uppercase tracking-wider text-slate-200 cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={async () => {
                  soundEngine.playMenuSelect();
                  const launchArena = activeRoom?.arenaMode || selectedMode;
                  if (activeRoom && Object.keys(activeRoom.players || {}).length >= 2) {
                    await startMatchInActiveRoom();
                  } else {
                    await leaveActiveRoom();
                  }
                  onMatchReady(launchArena);
                }}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-display font-black text-xs sm:text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.45)] cursor-pointer"
              >
                INICIAR PARTIDA AGORA »
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MENU FOCADO PARA ESCOLHER O MAPA DENTRO DA SALA CASUAL */}
      {showCasualMapModal && (
        <div
          onClick={() => setShowCasualMapModal(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 select-none pointer-events-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[640px] rounded-2xl border-2 border-amber-400/60 bg-[#0b1018] p-4 sm:p-5 shadow-2xl flex flex-col max-h-[88vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div>
                <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-wider text-amber-300">
                  ESCOLHER MAPA DA PARTIDA CASUAL
                </h3>
                <p className="text-xs font-mono text-slate-400">
                  Selecione o mapa em que deseja jogar a Partida Casual 5v5
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCasualMapModal(false)}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-mono font-bold text-slate-200 cursor-pointer"
              >
                VOLTAR ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto">
              {CASUAL_MAP_POOL.map((m) => {
                const active = selectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      onChangeMode(m.id);
                      setShowCasualMapModal(false);
                    }}
                    className={`group rounded-xl border text-left transition-all cursor-pointer overflow-hidden flex flex-col ${
                      active
                        ? 'bg-amber-500/20 border-2 border-amber-400 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                        : 'bg-black/50 border-white/15 text-slate-300 hover:border-amber-400/50 hover:text-white'
                    }`}
                  >
                    <div className="relative h-24 w-full overflow-hidden">
                      <img
                        src={thumbForDrillMode(m.id)}
                        alt={m.title}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        draggable={false}
                      />
                      {active && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-[9px] uppercase">
                          SELECIONADO ✓
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-white">
                        {m.title}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                        {m.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
