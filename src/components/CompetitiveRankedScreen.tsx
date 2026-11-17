import React, { useCallback, useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  getActiveOnlineRoom,
  leaveActiveRoom,
  quickMatchOrCreateRoom,
  startMatchInActiveRoom,
  subscribeOnlineRoom,
} from '../multiplayer/onlineRoomService';
import { OnlineRoomState } from '../multiplayer/onlineTypes';
import { getPlayerInventoryState } from '../progression/loadoutSystem';
import { DrillMode, WeaponId } from '../types/game';
import { CompetitiveRanksModal } from './CompetitiveRanksModal';
import { FactionFlagCanvas } from './FactionFlagCanvas';
import {
  createWarzoneBackdropCanvas,
  drawAnimatedWarzoneSkyLayer,
} from './FactionFlagTexture';
import {
  CompetitiveRankBadgeSvg,
  getCompetitiveRankProgression,
} from './RankedInsigniasSvg';
import { RankedLeftWidgets } from './RankedLeftWidgets';
import { RankedOperator3DCanvas } from './RankedOperator3DCanvas';
import { RankedRightWidgets } from './RankedRightWidgets';
import { thumbForDrillMode } from './mapSelectThumbs';

interface CompetitiveRankedScreenProps {
  playerMmr: number;
  activeWeapon: WeaponId;
  initialArena: DrillMode;
  onBackToMainMenu: () => void;
  onRankedMatchReady: (mode: DrillMode) => void;
}

const REQUIRED_RANKED_PLAYERS = 10;

const OFFICIAL_RANKED_MAP_POOL: Array<{
  id: DrillMode;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'DUST2_BOMB_5V5',
    title: 'DE_DUST2',
    subtitle: 'Deserto Clássico · Plant the Bomb 5v5 (Pontos A e B)',
  },
  {
    id: 'ASSAULT_BOMB_5V5',
    title: 'CS_ASSAULT',
    subtitle: 'Complexo Industrial Urbano · Plant the Bomb 5v5',
  },
  {
    id: 'INDUSTRIA_BOMB_5V5',
    title: 'INDUSTRIA',
    subtitle: 'Refinaria e Pátio Ferroviário · Plant the Bomb 5v5',
  },
  {
    id: 'HANGAR_BOMB_5V5',
    title: 'HANGAR',
    subtitle: 'Base Aérea Militar · Plant the Bomb 5v5',
  },
  {
    id: 'EASTERN_CITY_BOMB_5V5',
    title: 'EASTERN CITY',
    subtitle: 'Centro Urbano Leste · Plant the Bomb 5v5',
  },
  {
    id: 'MIRAGE_ANUBIS_BOMB_5V5',
    title: 'MIRAGE ANUBIS',
    subtitle: 'Fortaleza de Arenito · Plant the Bomb 5v5',
  },
  {
    id: 'STATION_CAPTURE_5V5',
    title: 'STATION ARENA',
    subtitle: 'Estação Ferroviária · Captura de Bandeira 5v5 (6 Rodadas)',
  },
];

function drawRandomRankedArena(): DrillMode {
  const idx = Math.floor(Math.random() * OFFICIAL_RANKED_MAP_POOL.length);
  return OFFICIAL_RANKED_MAP_POOL[idx].id;
}

export const CompetitiveRankedScreen: React.FC<CompetitiveRankedScreenProps> = ({
  playerMmr,
  activeWeapon,
  onBackToMainMenu,
  onRankedMatchReady,
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [roomState, setRoomState] = useState<OnlineRoomState | null>(() => getActiveOnlineRoom());
  const [rankPage, setRankPage] = useState<0 | 1>(0);
  const [showAllRanksModal, setShowAllRanksModal] = useState(false);
  const [drawnArena, setDrawnArena] = useState<DrillMode | null>(null);
  const [rouletteIndex, setRouletteIndex] = useState(0);
  const backdropRef = useRef<HTMLCanvasElement | null>(null);
  const sparksRef = useRef<HTMLCanvasElement | null>(null);
  const launchedRef = useRef(false);

  const displayMmr = playerMmr > 0 ? playerMmr : 2450;
  const { current, next, targetMmr, mmrRemaining, progressPct } =
    getCompetitiveRankProgression(displayMmr);

  const triggerDrawnMapRevealAndLaunch = useCallback(
    (finalArena: DrillMode) => {
      if (launchedRef.current) return;
      launchedRef.current = true;
      setIsSearching(false);
      soundEngine.playMenuSelect();
      setDrawnArena(finalArena);

      window.setTimeout(() => {
        onRankedMatchReady(finalArena);
      }, 2400);
    },
    [onRankedMatchReady]
  );

  // Animação visual de roleta enquanto está procurando na fila
  useEffect(() => {
    if (!isSearching || drawnArena) return;
    const id = window.setInterval(() => {
      setRouletteIndex((prev) => (prev + 1) % OFFICIAL_RANKED_MAP_POOL.length);
    }, 350);
    return () => window.clearInterval(id);
  }, [isSearching, drawnArena]);

  // Cenário Warzone azul (VANGUARD) + Helicópteros voando + Faíscas azuis/âmbar
  useEffect(() => {
    const bgCanvas = backdropRef.current;
    const sparkCanvas = sparksRef.current;
    const bgCtx = bgCanvas?.getContext('2d');
    const sparkCtx = sparkCanvas?.getContext('2d');
    if (!bgCanvas || !sparkCanvas || !bgCtx || !sparkCtx) return;

    let animId = 0;
    let w = Math.max(1, window.innerWidth);
    let h = Math.max(1, window.innerHeight);

    const paintBackdrop = () => {
      if (window.innerWidth <= 0 || window.innerHeight <= 0) return;
      w = window.innerWidth;
      h = window.innerHeight;
      bgCanvas.width = w;
      bgCanvas.height = h;
      sparkCanvas.width = w;
      sparkCanvas.height = h;
      const baked = createWarzoneBackdropCanvas(w, h, 'VANGUARD');
      if (baked.width > 0 && baked.height > 0) {
        bgCtx.drawImage(baked, 0, 0, w, h);
      }
    };
    paintBackdrop();
    window.addEventListener('resize', paintBackdrop);

    const sparks = Array.from({ length: 42 }, (_, idx) => ({
      x: Math.random() * w,
      y: h * (0.25 + Math.random() * 0.72),
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.4 - Math.random() * 0.75,
      r: 1.0 + Math.random() * 2.0,
      phase: Math.random() * Math.PI * 2,
      color: idx % 5 === 0 ? '251, 146, 60' : idx % 2 === 0 ? '56, 189, 248' : '99, 102, 241',
    }));

    const startTime = performance.now();
    const renderSparks = (now: number) => {
      if (document.hidden) return;
      animId = requestAnimationFrame(renderSparks);
      const timeSec = (now - startTime) * 0.001;
      sparkCtx.clearRect(0, 0, w, h);
      drawAnimatedWarzoneSkyLayer(sparkCtx, w, h, timeSec, 'VANGUARD');

      for (const s of sparks) {
        s.x += s.vx;
        s.y += s.vy;
        s.phase += 0.045;
        if (s.y < h * 0.06) {
          s.y = h * 0.94;
          s.x = Math.random() * w;
        }
        const alpha = 0.25 + 0.55 * Math.abs(Math.sin(s.phase));
        sparkCtx.beginPath();
        sparkCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        sparkCtx.fillStyle = `rgba(${s.color}, ${alpha.toFixed(2)})`;
        sparkCtx.fill();
      }
    };
    animId = requestAnimationFrame(renderSparks);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', paintBackdrop);
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeOnlineRoom((room) => {
      setRoomState(room);
      if (!room || launchedRef.current) return;
      const realCount = Object.keys(room.players || {}).length;
      if (
        room.queueType === 'RANKED' &&
        (room.status === 'PLAYING' || realCount >= REQUIRED_RANKED_PLAYERS)
      ) {
        const finalArena = room.arenaMode || drawRandomRankedArena();
        triggerDrawnMapRevealAndLaunch(finalArena);
      }
    });
    return () => unsub();
  }, [triggerDrawnMapRevealAndLaunch]);

  // Cronômetro real de busca Ranked
  useEffect(() => {
    if (!isSearching) {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSearching]);

  const handleToggleSearchRanked = async () => {
    soundEngine.playMenuSelect();
    if (isSearching) {
      setIsSearching(false);
      await leaveActiveRoom();
      return;
    }
    launchedRef.current = false;
    setDrawnArena(null);
    setIsSearching(true);
    const randomArena = drawRandomRankedArena();
    await quickMatchOrCreateRoom(randomArena, 'RANKED');
  };

  const handleConfirmPairAndDrawNow = async () => {
    soundEngine.playMenuSelect();
    const room = getActiveOnlineRoom();
    const chosen = room?.arenaMode || drawRandomRankedArena();
    const realCount = room ? Object.keys(room.players || {}).length : 0;
    if (room && realCount >= 2 && room.status !== 'PLAYING') {
      await startMatchInActiveRoom();
    } else if (room && realCount < 2) {
      await leaveActiveRoom();
    }
    triggerDrawnMapRevealAndLaunch(chosen);
  };

  const handleBackClick = async () => {
    soundEngine.playMenuSelect();
    if (isSearching) {
      setIsSearching(false);
      await leaveActiveRoom();
    }
    onBackToMainMenu();
  };

  const connectedPlayersCount = roomState ? Object.keys(roomState.players || {}).length : 0;
  const shownPlayersCount = isSearching ? Math.max(1, connectedPlayersCount) : 0;
  const mmrTolerance = Math.min(400, 150 + Math.floor(elapsedSec / 4) * 25);
  const drawnMeta = drawnArena
    ? OFFICIAL_RANKED_MAP_POOL.find((m) => m.id === drawnArena) || OFFICIAL_RANKED_MAP_POOL[0]
    : null;
  const cyclingMeta = OFFICIAL_RANKED_MAP_POOL[rouletteIndex % OFFICIAL_RANKED_MAP_POOL.length];

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] w-full bg-[#040914] text-white select-none overflow-hidden font-sans flex flex-col justify-between">
      {/* 1. FUNDO ISOLADO: Cenário Warzone Azul + Bandeira 3D VANGUARD + Faíscas */}
      <div className="absolute inset-0 z-0 isolate pointer-events-none overflow-hidden">
        <canvas ref={backdropRef} className="absolute inset-0 z-0 w-full h-full" />
        <FactionFlagCanvas team="VANGUARD" layoutMode="RANKED_CENTER" />
        <canvas ref={sparksRef} className="absolute inset-0 z-20 w-full h-full mix-blend-screen" />
        <div
          className="absolute inset-0 z-20"
          style={{
            background:
              'linear-gradient(90deg, rgba(4,9,20,0.72) 0%, rgba(4,9,20,0.08) 32%, rgba(4,9,20,0.08) 68%, rgba(4,9,20,0.72) 100%)',
          }}
        />
      </div>

      {/* 2. TOPO COMPACTO: VOLTAR AO MENU + VER TODAS AS PATENTES + SORTEIO AUTOMÁTICO OFICIAL */}
      <header className="relative z-30 flex items-center justify-between px-3 sm:px-6 pt-1.5 sm:pt-2.5 pb-1 shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleBackClick()}
            className="group flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-md bg-[#0a1529]/95 hover:bg-[#132544] border border-sky-400/45 hover:border-sky-300 text-slate-100 shadow-[0_0_16px_rgba(56,189,248,0.22)] transition-all cursor-pointer"
          >
            <span className="text-sky-400 font-bold text-xs group-hover:-translate-x-0.5 transition-transform">
              ←
            </span>
            <span className="font-display font-bold text-[10px] sm:text-xs tracking-wider uppercase">
              VOLTAR AO MENU
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuSelect();
              setShowAllRanksModal(true);
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-md bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-amber-500/20 hover:from-sky-500/35 hover:to-amber-500/35 border border-sky-400/50 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.25)] transition-all cursor-pointer"
          >
            <CompetitiveRankBadgeSvg tier={current.id} className="w-4 h-4" />
            <span className="font-display font-bold text-[10px] sm:text-xs tracking-wider uppercase">
              VER TODAS AS PATENTES
            </span>
          </button>
        </div>

        {/* Badge Oficial de Mapa Sorteado Aleatoriamente (Jogadores não escolhem mapa na Ranked) */}
        <div className="flex items-center gap-2 bg-[#091326]/95 border border-sky-400/45 rounded-md px-3 py-1 shadow-[0_0_16px_rgba(56,189,248,0.2)]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-wider text-sky-200">
            MAPA RANKED:{' '}
            <strong className="text-amber-300">
              {isSearching
                ? `SORTEANDO... [${cyclingMeta.title}]`
                : 'SORTEIO ALEATÓRIO NO PAREAMENTO'}
            </strong>
          </span>
          {isSearching && (
            <button
              type="button"
              onClick={() => void handleConfirmPairAndDrawNow()}
              className="ml-1 px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-[9px] sm:text-[10px] uppercase tracking-wider cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.6)]"
            >
              PAREAR AGORA »
            </button>
          )}
        </div>
      </header>

      {/* 3. CORPO PRINCIPAL */}
      <div className="relative z-20 flex-1 min-h-0 grid grid-cols-12 items-end px-3 sm:px-6 pb-2 sm:pb-3 gap-2 sm:gap-3 overflow-hidden">
        <RankedLeftWidgets
          currentRank={current}
          nextRank={next}
          displayMmr={displayMmr}
          targetMmr={targetMmr}
          mmrRemaining={mmrRemaining}
          progressPct={progressPct}
          onOpenAllRanks={() => setShowAllRanksModal(true)}
          isSearching={isSearching}
          elapsedSec={elapsedSec}
          shownPlayersCount={shownPlayersCount}
          requiredPlayers={REQUIRED_RANKED_PLAYERS}
          mmrTolerance={mmrTolerance}
        />

        {/* COLUNA CENTRAL: OPERADOR 3D (.GLB) DESTACADO NA FRENTE DA BANDEIRA AZUL 3D */}
        <div className="col-span-4 h-full min-h-0 relative flex flex-col items-center justify-end">
          <div className="w-full h-full relative z-20">
            <RankedOperator3DCanvas
              activeWeapon={activeWeapon}
              operatorClass={getPlayerInventoryState().selectedClass}
            />
          </div>
          <span className="pointer-events-none text-[8px] font-mono uppercase tracking-[0.2em] text-sky-300/65 pb-0.5">
            ARRASTE PARA GIRAR O OPERADOR 3D
          </span>
        </div>

        <RankedRightWidgets
          currentRank={current}
          nextRank={next}
          rankPage={rankPage}
          onChangeRankPage={setRankPage}
          onOpenAllRanks={() => setShowAllRanksModal(true)}
          isSearching={isSearching}
          shownPlayersCount={shownPlayersCount}
          requiredPlayers={REQUIRED_RANKED_PLAYERS}
          onToggleSearch={() => void handleToggleSearchRanked()}
        />
      </div>

      {/* 4. OVERLAY DE REVELAÇÃO DO MAPA SORTEADO ASSIM QUE OS JOGADORES SÃO PAREADOS */}
      {drawnMeta && (
        <div className="fixed inset-0 z-50 bg-black/92 backdrop-blur-lg flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl border-2 border-amber-400 bg-[#080f1d] overflow-hidden shadow-[0_0_60px_rgba(251,191,36,0.45)] flex flex-col">
            <div className="px-5 py-3 bg-gradient-to-r from-amber-500/25 via-sky-500/20 to-amber-500/25 border-b border-amber-400/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-display font-black text-xs sm:text-sm tracking-[0.2em] uppercase text-emerald-300">
                  JOGADORES PAREADOS · PARTIDA CONFIRMADA
                </span>
              </div>
              <span className="font-mono text-[10px] font-bold text-amber-300 uppercase">
                SORTEIO OFICIAL RANKED 5V5
              </span>
            </div>

            <div className="relative h-48 sm:h-56 w-full overflow-hidden">
              <img
                src={thumbForDrillMode(drawnMeta.id)}
                alt={drawnMeta.title}
                className="w-full h-full object-cover object-center scale-105 transition-transform duration-1000"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080f1d] via-[#080f1d]/30 to-transparent" />
              <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between gap-3">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-mono font-black text-[10px] uppercase tracking-widest mb-1">
                    MAPA SORTEADO
                  </span>
                  <h2 className="font-display font-black text-2xl sm:text-4xl text-white uppercase tracking-wider drop-shadow-lg">
                    {drawnMeta.title}
                  </h2>
                  <p className="font-mono text-xs text-slate-200">
                    {drawnMeta.subtitle}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 bg-[#050912] border-t border-white/10 flex items-center justify-between">
              <span className="font-mono text-xs text-sky-300">
                Iniciando carregamento do mapa para todos os operadores...
              </span>
              <span className="font-mono text-xs font-bold text-amber-400 animate-pulse">
                CARREGANDO »
              </span>
            </div>
          </div>
        </div>
      )}

      {showAllRanksModal && (
        <CompetitiveRanksModal
          playerMmr={displayMmr}
          onClose={() => setShowAllRanksModal(false)}
        />
      )}
    </div>
  );
};
