import React from 'react';
import { soundEngine } from '../audio/soundEngine';
import { DrillMode } from '../types/game';
import {
  WARFACE_CLASS_META,
  WarfaceClassIcon,
  WarfaceClassId,
} from './WarfaceClassIcons';
import {
  CompetitiveRankBadgeSvg,
  CompetitiveRankTier,
} from './RankedInsigniasSvg';

export type MainMenuPlayModeId =
  | 'TDM'
  | 'CAPTURE'
  | 'RANKED'
  | 'CASUAL'
  | 'PRIVATE_ROOM'
  | 'RANGE'
  | 'KILLHOUSE'
  | 'VS_AI';

export const PLAY_MODE_OPTIONS: Array<{
  id: MainMenuPlayModeId;
  label: string;
  subtitle: string;
  badge: string;
  arena?: DrillMode;
}> = [
  {
    id: 'TDM',
    label: 'MATA-MATA 5V5 · STATION ARENA',
    subtitle: 'Team Deathmatch · Respawn Imediato · Alvo 40 Abates',
    badge: 'NOVO MODO',
    arena: 'STATION_TDM_5V5',
  },
  {
    id: 'RANKED',
    label: 'RANKED 5V5 COMPETITIVO',
    subtitle: 'Fila Oficial · Mapa Sorteado Aleatoriamente no Pareamento',
    badge: 'SORTEIO DE MAPA',
    arena: 'DUST2_BOMB_5V5',
  },
  {
    id: 'CASUAL',
    label: 'PARTIDA CASUAL 5V5',
    subtitle: 'Sala de Partida · Escolha o Mapa Dentro da Sala Antes de Iniciar',
    badge: 'ESCOLHER NA SALA',
    arena: 'STATION_TDM_5V5',
  },
  {
    id: 'PRIVATE_ROOM',
    label: 'SALA PRIVADA (X1 / CLÃ)',
    subtitle: 'Crie ou Entre por Código · Menu Focado de Escolha de Mapa na Sala',
    badge: 'CÓDIGO 6 DÍGITOS',
    arena: 'STATION_TDM_5V5',
  },
  {
    id: 'RANGE',
    label: 'ESTANDE DE TIRO',
    subtitle: 'Treino Livre de Armas, Recuo e Balística',
    badge: 'TREINO SOLO',
  },
  {
    id: 'KILLHOUSE',
    label: 'KILLHOUSE CQB',
    subtitle: 'Circuito Tático Cronometrado de Curto Alcance',
    badge: 'CONTRARRELÓGIO',
    arena: 'KILLHOUSE_BLITZ',
  },
  {
    id: 'VS_AI',
    label: 'CONTRA IA · PATRULHAS',
    subtitle: 'Combate Tático Offline Contra Esquadrões IA',
    badge: 'OFFLINE',
    arena: 'TACTICAL_WAVE',
  },
];

interface MainMenuRightWidgetsProps {
  currentRank: CompetitiveRankTier;
  nextRank: CompetitiveRankTier | null;
  playerMmr: number;
  progressPct: number;
  selectedPlayMode: MainMenuPlayModeId;
  onCyclePlayMode: (next: MainMenuPlayModeId) => void;
  onLaunchSelectedMode: () => void;
  onStartMapTest?: (mode: DrillMode) => void;
  onOpenRankedScreen: () => void;
  onOpenRanksModal: () => void;
  onOpenInventory: () => void;
  selectedClass: WarfaceClassId;
  weaponName: string;
  onHover: () => void;
}

const CHAMFER_CLIP =
  'polygon(8px 0%, calc(100% - 8px) 0%, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0% calc(100% - 8px), 0% 8px)';

export const MainMenuRightWidgets: React.FC<MainMenuRightWidgetsProps> = ({
  currentRank,
  nextRank,
  playerMmr,
  progressPct,
  selectedPlayMode,
  onCyclePlayMode,
  onLaunchSelectedMode,
  onOpenRankedScreen,
  onOpenRanksModal,
  onOpenInventory,
  selectedClass,
  weaponName,
  onHover,
}) => {
  const activeModeMeta =
    PLAY_MODE_OPTIONS.find((m) => m.id === selectedPlayMode) || PLAY_MODE_OPTIONS[0];
  const classMeta = WARFACE_CLASS_META[selectedClass];

  const handleNextMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playMenuSelect();
    const idx = PLAY_MODE_OPTIONS.findIndex((m) => m.id === selectedPlayMode);
    const nextIdx = (idx + 1) % PLAY_MODE_OPTIONS.length;
    onCyclePlayMode(PLAY_MODE_OPTIONS[nextIdx].id);
  };

  const displayPct = Math.max(3, Math.round(progressPct));

  return (
    <div className="h-full max-h-full min-h-0 flex flex-col items-end justify-between gap-2 w-[236px] sm:w-[264px] lg:w-[320px] shrink-0 pointer-events-auto py-1">
      {/* BLOCO SUPERIOR: TEMPORADA 1 + PATENTE RANKED */}
      <div className="w-full flex flex-col gap-1.5 lg:gap-2 shrink-0">
        {/* 1. CARD TEMPORADA 1: A NOVA ERA */}
        <div
          onClick={() => {
            soundEngine.playMenuSelect();
            onOpenRankedScreen();
          }}
          onMouseEnter={onHover}
          style={{ clipPath: CHAMFER_CLIP }}
          className="relative overflow-hidden bg-gradient-to-r from-[#24070b]/95 via-[#14070a]/95 to-[#2b090e]/95 border border-red-500/80 hover:border-red-400 px-3 py-2 lg:px-3.5 lg:py-2.5 shadow-[0_0_22px_rgba(239,68,68,0.32)] cursor-pointer transition-all group backdrop-blur-md shrink-0 max-h-[380px]:hidden"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display font-black text-xs lg:text-base tracking-wider uppercase text-white leading-tight">
                TEMPORADA 1
                <span className="block text-red-500 group-hover:text-red-400">
                  A NOVA ERA
                </span>
              </div>
              <div className="flex items-center gap-1 text-[9px] lg:text-[10px] font-mono text-amber-400 font-semibold mt-0.5">
                <span>🕒</span>
                <span>Restante: 29d 15h</span>
              </div>
            </div>
            <CompetitiveRankBadgeSvg
              tier="LEGEND"
              className="w-9 h-9 lg:w-13 lg:h-13 shrink-0 drop-shadow-[0_0_14px_rgba(251,191,36,0.65)]"
            />
          </div>
        </div>

        {/* 2. CARD PATENTE RANKED + CLASSE E ARMA EQUIPADA */}
        <div
          style={{ clipPath: CHAMFER_CLIP }}
          className="bg-[#0b0e15]/92 border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.8)] overflow-hidden backdrop-blur-md shrink-0"
        >
          <div className="px-2.5 py-1 lg:px-3 lg:py-1.5 border-b border-white/10 bg-[#11151f]/90 flex items-center justify-between">
            <span className="font-display font-extrabold text-[9px] lg:text-[11px] tracking-wider uppercase text-white">
              PATENTE RANKED
            </span>
            <span className="font-mono font-bold text-[9px] lg:text-xs text-amber-400 tabular-nums">
              {playerMmr.toLocaleString('pt-BR')} MMR
            </span>
          </div>

          <div className="px-2.5 py-1.5 lg:px-3 lg:py-2 flex items-center gap-2 lg:gap-3">
            <CompetitiveRankBadgeSvg
              tier={currentRank.id}
              className="w-9 h-9 lg:w-12 lg:h-12 shrink-0 drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px] lg:text-sm font-display font-black text-white uppercase leading-none">
                <span className="truncate">{currentRank.name}</span>
                <span className="font-mono text-amber-400 text-[9px] lg:text-xs tabular-nums">
                  {displayPct}%
                </span>
              </div>
              <div className="w-full h-1 lg:h-1.5 bg-black/85 border border-white/10 rounded-full overflow-hidden my-1">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-300"
                  style={{ width: `${Math.max(6, displayPct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-1 leading-none">
                <span className="text-[8px] lg:text-[10px] font-mono text-slate-400 truncate">
                  {nextRank ? `Próx. ${nextRank.shortName}` : 'Patente Máxima'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    onOpenRanksModal();
                  }}
                  className="text-[8px] lg:text-[10px] font-mono font-bold uppercase text-red-400 hover:text-red-300 cursor-pointer shrink-0"
                >
                  DETALHES &gt;
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuSelect();
              onOpenInventory();
            }}
            className="w-full px-2.5 py-1.5 lg:px-3 bg-black/55 hover:bg-red-950/35 border-t border-white/10 flex items-center justify-between gap-2 text-[9px] lg:text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <WarfaceClassIcon classId={selectedClass} className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
              <span className="truncate">
                <strong className="text-white">{classMeta.label}</strong>
                <span className="text-slate-400 mx-1">·</span>
                <strong className="text-amber-400">{weaponName}</strong>
              </span>
            </span>
            <span className="text-[8px] lg:text-[9px] text-amber-300 font-bold shrink-0">CLASSES &gt;</span>
          </button>
        </div>
      </div>

      {/* BLOCO INFERIOR LIMPO: SELETOR DE MODO (SEM FOTOS DE MAPAS) + BOTÃO INICIAR SEMPRE VISÍVEL */}
      <div className="w-full flex flex-col gap-2 shrink-0 mt-auto">
        {/* 3. Seletor Limpo de Modo de Jogo */}
        <div
          style={{ clipPath: CHAMFER_CLIP }}
          className="w-full bg-[#11151f]/95 border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.85)] overflow-hidden backdrop-blur-md"
        >
          <div
            onClick={handleNextMode}
            onMouseEnter={onHover}
            title="Clique para alternar o Modo de Jogo"
            className="px-3 py-1.5 lg:py-2 bg-gradient-to-r from-[#28080d] via-[#18070a] to-[#24080c] border-b border-red-500/40 flex items-center justify-between gap-2 cursor-pointer group"
          >
            <span className="font-display font-extrabold text-[10px] lg:text-xs tracking-wider uppercase text-amber-400 truncate flex items-center gap-1.5">
              <span className="text-amber-300 text-xs">✦</span>
              <span>{activeModeMeta.label}</span>
            </span>
            <span className="text-[8px] lg:text-[10px] font-mono font-bold text-slate-200 group-hover:text-white uppercase shrink-0">
              MODO ↻
            </span>
          </div>

          {/* Pílulas rápidas dos modos principais */}
          <div className="p-2 flex flex-col gap-1.5">
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { id: 'TDM', short: 'MATA-MATA' },
                  { id: 'RANKED', short: 'RANKED' },
                  { id: 'CASUAL', short: 'CASUAL' },
                  { id: 'PRIVATE_ROOM', short: 'PRIVADA' },
                ] as const
              ).map((m) => {
                const isSelected = selectedPlayMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      onCyclePlayMode(m.id);
                    }}
                    className={`py-1 px-1 rounded text-[8px] lg:text-[9px] font-display font-black uppercase tracking-wider border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-red-600/90 border-amber-300 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                        : 'bg-black/50 border-white/12 text-slate-400 hover:text-white hover:border-white/30'
                    }`}
                  >
                    {m.short}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5 px-0.5">
              <span className="text-[9px] lg:text-[10px] font-mono text-slate-300 truncate">
                {activeModeMeta.subtitle}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[8px] font-mono font-bold text-amber-300 uppercase shrink-0">
                {activeModeMeta.badge}
              </span>
            </div>
          </div>
        </div>

        {/* 4. BOTÃO PRINCIPAL INICIAR >> (SEMPRE VISÍVEL E DESTACADO) */}
        <button
          type="button"
          onMouseEnter={onHover}
          onClick={() => {
            soundEngine.playMenuSelect();
            onLaunchSelectedMode();
          }}
          style={{ clipPath: CHAMFER_CLIP }}
          className="relative w-full py-2.5 lg:py-3.5 px-4 lg:px-5 border-2 border-red-500 bg-gradient-to-r from-[#4c080d]/95 via-[#8f1119]/95 to-[#580910]/95 shadow-[0_0_30px_rgba(239,68,68,0.65)] hover:brightness-115 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 lg:gap-3 group shrink-0"
        >
          <span className="font-display font-black text-xl lg:text-3xl tracking-[0.12em] italic uppercase text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            INICIAR
          </span>
          <span className="font-display font-black text-xl lg:text-3xl text-red-300 group-hover:translate-x-1 transition-transform drop-shadow-[0_0_10px_rgba(248,113,113,0.95)]">
            »
          </span>
        </button>
      </div>
    </div>
  );
};
