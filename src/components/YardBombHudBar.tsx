import React from 'react';
import { getLocalOnlinePlayerState, isOnlineMatchActive } from '../multiplayer/onlineRoomService';
import { YardBombHudInfo } from '../types/game';
import { bindTap } from './hudTapUtils';
import { PostMatchSummaryOverlay } from './PostMatchSummaryOverlay';
import { PreRoundEquipOverlay } from './PreRoundEquipOverlay';
import { BlackthornTeamEmblem, VanguardTeamEmblem } from './WarfaceClassIcons';

interface YardBombHudBarProps {
  yardBomb: YardBombHudInfo;
  onPlantBomb: () => void;
  onReturnToMenu?: () => void;
  onReturnToSquadRoom?: () => void;
  onCycleSpectator?: (dir: -1 | 1) => void;
}

export const YardBombHudBar: React.FC<YardBombHudBarProps> = ({
  yardBomb,
  onPlantBomb,
  onReturnToMenu,
  onReturnToSquadRoom,
  onCycleSpectator,
}) => {
  if (yardBomb.roundState === 'MATCH_OVER') {
    return (
      <PostMatchSummaryOverlay
        yardBomb={yardBomb}
        onCloseToMenu={onReturnToMenu}
        onReturnToSquadRoom={onReturnToSquadRoom}
      />
    );
  }

  if (yardBomb.roundState === 'EQUIP') {
    return (
      <>
        <PreRoundEquipOverlay yardBomb={yardBomb} />
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-45 pointer-events-none select-none">
          <div className="flex items-center gap-2 bg-[#070b12]/92 border border-amber-400/40 rounded-xl px-3 py-1 shadow-xl font-mono text-[10px] text-amber-200">
            {yardBomb.isTdmMode
              ? `EQUIP · MATA-MATA · ALVO ${yardBomb.tdmTargetKills || 40} ABATES`
              : `EQUIP · RODADA ${yardBomb.currentRound}/${yardBomb.maxRounds} · ${yardBomb.vanguardScore}–${yardBomb.blackthornScore}`}
          </div>
        </div>
      </>
    );
  }

  const isPlanted = yardBomb.bombStatus === 'PLANTED';
  const activeSeconds = isPlanted
    ? Math.ceil(yardBomb.c4TimerSec)
    : Math.ceil(yardBomb.roundTimerSec);
  const mins = Math.floor(activeSeconds / 60);
  const secs = activeSeconds % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <>
      {/* TOP-CENTER: ANGLED 3-SECTION VANGUARD vs BLACKTHORN SCOREBOARD MATCHING REFERENCE SCREENSHOT */}
      <div className="fixed top-1.5 left-1/2 -translate-x-1/2 z-25 pointer-events-none select-none flex items-stretch gap-1 font-display drop-shadow-[0_6px_18px_rgba(0,0,0,0.8)]">
        {/* Left Wing: VANGUARD (Blue Angled Trapezoid) */}
        <div
          className="flex items-center gap-2 sm:gap-2.5 pl-3 pr-4 py-1 bg-gradient-to-r from-[#06294d]/95 via-[#073461]/92 to-[#041d38]/95 border-t border-b border-sky-400/70"
          style={{
            clipPath: 'polygon(0% 0%, 93% 0%, 100% 100%, 6% 100%)',
          }}
        >
          <VanguardTeamEmblem className="w-5 h-5 shrink-0 text-sky-400" />
          <span className="text-[10px] sm:text-xs font-display font-black text-sky-300 tracking-wider uppercase">
            VANGUARD
          </span>
          {yardBomb.isTdmMode ? (
            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/35 text-[8px] font-mono font-bold text-sky-200 uppercase">
              ABATES
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={`ally-${i}`}
                  className={`w-2.5 h-2.5 rounded-full ${
                    i < yardBomb.alliesAlive
                      ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]'
                      : 'bg-slate-800/90 border border-white/15'
                  }`}
                />
              ))}
            </div>
          )}
          <span className="ml-1 text-lg sm:text-xl font-display font-black text-cyan-300 tabular-nums leading-none">
            {yardBomb.vanguardScore}
          </span>
        </div>

        {/* Center Wing: RODADA / MATA-MATA + TIMER (Dark Metallic Inverted Trapezoid) */}
        <div
          className={`flex flex-col items-center justify-center px-5 py-0.5 border-t border-b ${
            isPlanted
              ? 'bg-gradient-to-b from-red-900/95 to-red-950/95 border-red-400 animate-pulse'
              : 'bg-gradient-to-b from-[#1a222d]/95 to-[#0d1218]/95 border-slate-500/60'
          }`}
          style={{
            clipPath: 'polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%)',
          }}
        >
          <span className="text-[8px] sm:text-[9px] font-display font-bold text-slate-300 tracking-widest uppercase leading-none">
            {yardBomb.isTdmMode
              ? `MATA-MATA · ALVO ${yardBomb.tdmTargetKills || 40}`
              : yardBomb.isCaptureMode
                ? `CAPTURA · R${yardBomb.currentRound}/${yardBomb.maxRounds}`
                : isPlanted
                  ? `BOMBA C4 [${yardBomb.plantedSite}]`
                  : 'RODADA'}
          </span>
          <span className="text-sm sm:text-base font-display font-black text-white tabular-nums leading-tight">
            {timeStr}
          </span>
        </div>

        {/* Right Wing: BLACKTHORN (Red Angled Trapezoid) */}
        <div
          className="flex items-center gap-2 sm:gap-2.5 pl-4 pr-3 py-1 bg-gradient-to-l from-[#4d070e]/95 via-[#3b060c]/92 to-[#280408]/95 border-t border-b border-red-500/70"
          style={{
            clipPath: 'polygon(7% 0%, 100% 0%, 94% 100%, 0% 100%)',
          }}
        >
          <span className="mr-1 text-lg sm:text-xl font-display font-black text-red-500 tabular-nums leading-none">
            {yardBomb.blackthornScore}
          </span>
          {yardBomb.isTdmMode ? (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-400/35 text-[8px] font-mono font-bold text-red-200 uppercase">
              ABATES
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={`enemy-${i}`}
                  className={`w-2.5 h-2.5 rounded-full ${
                    i < yardBomb.enemiesAlive
                      ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]'
                      : 'bg-slate-800/90 border border-white/15'
                  }`}
                />
              ))}
            </div>
          )}
          <span className="text-[10px] sm:text-xs font-display font-black text-red-500 tracking-wider uppercase">
            BLACKTHORN
          </span>
          <BlackthornTeamEmblem className="w-5 h-5 shrink-0 text-red-500" />
        </div>
      </div>

      {/* BARRA DE STATUS DAS 2 BANDEIRAS (MODO CAPTURA 5V5 ESTILO WARFACE) */}
      {yardBomb.isCaptureMode && yardBomb.roundState === 'PLAYING' && (
        <div className="fixed top-11 left-1/2 -translate-x-1/2 z-25 pointer-events-none select-none flex items-center gap-2 font-mono">
          {/* Vanguard Flag Status */}
          <div
            className={`px-2.5 py-0.5 rounded-md border text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg ${
              yardBomb.vanguardFlagStatus === 'CARRIED'
                ? 'bg-red-950/95 border-red-400 text-red-200 animate-pulse shadow-[0_0_14px_rgba(239,68,68,0.7)]'
                : yardBomb.vanguardFlagStatus === 'DROPPED'
                  ? 'bg-amber-950/95 border-amber-400 text-amber-200 animate-pulse'
                  : 'bg-[#061c36]/90 border-sky-400/50 text-sky-200'
            }`}
          >
            <span className="text-cyan-400 text-xs leading-none">⚑</span>
            <span>
              {yardBomb.vanguardFlagStatus === 'CARRIED'
                ? `NOSSA BANDEIRA: ROUBADA (${yardBomb.vanguardFlagCarrier || 'INIMIGO'})`
                : yardBomb.vanguardFlagStatus === 'DROPPED'
                  ? 'NOSSA BANDEIRA: DROPADA NO CHÃO (PASSE POR CIMA!)'
                  : 'NOSSA BANDEIRA: NA BASE'}
            </span>
          </div>

          {/* Blackthorn Flag Status */}
          <div
            className={`px-2.5 py-0.5 rounded-md border text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg ${
              yardBomb.blackthornFlagStatus === 'CARRIED'
                ? 'bg-emerald-950/95 border-emerald-400 text-emerald-200 animate-pulse shadow-[0_0_14px_rgba(16,185,129,0.7)]'
                : yardBomb.blackthornFlagStatus === 'DROPPED'
                  ? 'bg-amber-950/95 border-amber-400 text-amber-200 animate-pulse'
                  : 'bg-[#2a070c]/90 border-red-500/50 text-red-200'
            }`}
          >
            <span className="text-red-400 text-xs leading-none">⚑</span>
            <span>
              {yardBomb.blackthornFlagStatus === 'CARRIED'
                ? `BANDEIRA INIMIGA: EM POSSE (${yardBomb.blackthornFlagCarrier || 'ALIADO'})`
                : yardBomb.blackthornFlagStatus === 'DROPPED'
                  ? 'BANDEIRA INIMIGA: DROPADA NO CHÃO!'
                  : 'BANDEIRA INIMIGA: NA BASE'}
            </span>
          </div>
        </div>
      )}

      {/* ALERTA TÁTICO PREMIUM QUANDO O TIME INIMIGO CAPTURA A BANDEIRA OU EVENTO DE BANDEIRA */}
      {yardBomb.isCaptureMode &&
        yardBomb.roundState === 'PLAYING' &&
        yardBomb.captureAlertText &&
        Date.now() < (yardBomb.captureAlertUntilMs || 0) && (
          <div className="fixed top-19 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none w-[min(92vw,520px)]">
            <div
              className={`px-4 py-2 rounded-xl border-2 text-center shadow-2xl flex items-center justify-center gap-2.5 ${
                yardBomb.captureAlertTeam === 'BLACKTHORN'
                  ? 'bg-gradient-to-r from-red-950/95 via-red-900/95 to-red-950/95 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.75)]'
                  : 'bg-gradient-to-r from-sky-950/95 via-cyan-900/95 to-sky-950/95 border-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.75)]'
              }`}
            >
              <span className="text-lg sm:text-xl leading-none animate-bounce">⚑</span>
              <div className="flex flex-col">
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.22em] text-amber-300">
                  {yardBomb.captureAlertTeam === 'BLACKTHORN'
                    ? 'ALERTA DE DEFESA · BASE VANGUARD'
                    : 'OPERAÇÃO DE CAPTURA · VANGUARD'}
                </span>
                <span className="text-xs sm:text-sm font-display font-black uppercase tracking-wider text-white drop-shadow">
                  {yardBomb.captureAlertText}
                </span>
              </div>
            </div>
          </div>
        )}

      {/* MODO ESPECTADOR TÁTICO 5V5 (Acompanhando aliados vivos até o fim da rodada) */}
      {yardBomb.roundState === 'PLAYING' && yardBomb.isSpectating && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none font-mono w-[min(92vw,440px)]"
        >
          <div className="bg-[#070b12]/92 border-2 border-sky-400/60 rounded-2xl p-3 shadow-[0_0_30px_rgba(14,165,233,0.35)] flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] border-b border-white/10 pb-1.5">
              <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-400/50 text-red-300 font-bold uppercase tracking-wider">
                VOCÊ FOI ELIMINADO
              </span>
              <span className="text-amber-300 font-bold uppercase tracking-wider">
                RENASCIMENTO NA PRÓXIMA RODADA
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                {...bindTap(() => onCycleSpectator?.(-1))}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-sky-400/40 text-sky-200 font-display font-black text-xs tracking-wider uppercase active:scale-95 transition-transform cursor-pointer"
              >
                ◄ ANTERIOR [Q]
              </button>

              <div className="flex flex-col items-center text-center flex-1 min-w-0">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest">
                  CÂMERA DE ESPECTADOR (ALIADO VIVO)
                </span>
                <span className="text-sm font-display font-black text-sky-300 truncate">
                  {yardBomb.spectatedCallsign || 'VANGUARD-02'}
                </span>
                <div className="w-full max-w-[140px] h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1 border border-white/10">
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{
                      width: `${Math.max(0, Math.min(100, yardBomb.spectatedHealth ?? 100))}%`,
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                {...bindTap(() => onCycleSpectator?.(1))}
                className="px-3 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-sky-400/40 text-sky-200 font-display font-black text-xs tracking-wider uppercase active:scale-95 transition-transform cursor-pointer"
              >
                PRÓXIMO [E] ►
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE PLANT / DEFUSE C4 BUTTON WHEN INSIDE BOMB SITE A OR B */}
      {(() => {
        if (
          yardBomb.isCaptureMode ||
          yardBomb.roundState !== 'PLAYING' ||
          yardBomb.isSpectating ||
          !yardBomb.nearSite
        ) {
          return null;
        }
        const isOnlineDefender =
          isOnlineMatchActive() && getLocalOnlinePlayerState()?.team === 'BLACKTHORN';
        const canPlant = !isOnlineDefender && yardBomb.bombStatus !== 'PLANTED';
        const canDefuse =
          isOnlineDefender &&
          yardBomb.bombStatus === 'PLANTED' &&
          yardBomb.plantedSite === yardBomb.nearSite;

        if (!canPlant && !canDefuse) return null;

        const isActiveProgress = yardBomb.plantProgress > 0;

        return (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none font-mono"
          >
            <button
              type="button"
              {...bindTap(onPlantBomb)}
              className={`relative overflow-hidden px-4 py-2 rounded-xl border-2 text-white font-display font-black text-xs sm:text-sm tracking-wider uppercase active:scale-95 transition-transform cursor-pointer flex items-center gap-2 ${
                canDefuse
                  ? 'bg-sky-600/95 hover:bg-sky-500 border-cyan-300 shadow-[0_0_25px_rgba(56,189,248,0.8)]'
                  : 'bg-red-600/95 hover:bg-red-500 border-amber-300 shadow-[0_0_25px_rgba(239,68,68,0.8)]'
              }`}
            >
              {isActiveProgress && (
                <div
                  className={`absolute inset-y-0 left-0 pointer-events-none transition-all ${
                    canDefuse ? 'bg-cyan-300/40' : 'bg-amber-400/40'
                  }`}
                  style={{ width: `${Math.round(yardBomb.plantProgress * 100)}%` }}
                />
              )}
              <span className="relative z-10">
                {canDefuse
                  ? isActiveProgress
                    ? `DESARMANDO C4 NO PONTO ${yardBomb.nearSite} (${Math.round(
                        yardBomb.plantProgress * 100
                      )}%)...`
                    : `DESARMAR BOMBA C4 — PONTO ${yardBomb.nearSite} [E / TOQUE]`
                  : yardBomb.bombStatus === 'PLANTING'
                    ? `PLANTANDO BOMBA C4 NO PONTO ${yardBomb.nearSite} (${Math.round(
                        yardBomb.plantProgress * 100
                      )}%)...`
                    : `PLANTAR BOMBA C4 — PONTO ${yardBomb.nearSite} [E / TOQUE]`}
              </span>
            </button>
          </div>
        );
      })()}

      {/* ALERTA DE ZONA DE PERIGO AMPLA (22M) E STATUS DE ABRIGO ATRÁS DE COBERTURA */}
      {isPlanted &&
        !yardBomb.isCaptureMode &&
        !yardBomb.isTdmMode &&
        yardBomb.roundState === 'PLAYING' &&
        (yardBomb.dangerZoneInRadius || yardBomb.dangerZoneCritical) && (
          <div className="fixed top-12 left-1/2 -translate-x-1/2 z-35 pointer-events-none select-none w-[min(92vw,470px)] font-mono">
            {yardBomb.dangerZoneInRadius && !yardBomb.dangerZoneBehindCover ? (
              <div
                className={`px-3.5 py-1.5 rounded-xl border-2 bg-[#240508]/95 text-center shadow-[0_0_24px_rgba(239,68,68,0.65)] ${
                  yardBomb.dangerZoneCritical
                    ? 'border-red-400 animate-pulse'
                    : 'border-red-500/80'
                }`}
              >
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-amber-300">
                  <span>
                    ⚠ ZONA DE PERIGO C4 [{yardBomb.plantedSite}] ·{' '}
                    {Math.round(yardBomb.dangerZoneDistanceM ?? 0)}M /{' '}
                    {yardBomb.dangerZoneLethalRadiusM ?? 22}M
                  </span>
                  <span className="text-red-300 tabular-nums">
                    T-{Math.max(0, yardBomb.c4TimerSec).toFixed(1)}S
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs font-display font-black uppercase tracking-wider text-white mt-0.5">
                  EXPOSTO À ONDA DE CHOQUE — FUJA OU PROCURE COBERTURA SÓLIDA!
                </div>
              </div>
            ) : yardBomb.dangerZoneInRadius && yardBomb.dangerZoneBehindCover ? (
              <div className="px-3.5 py-1.5 rounded-xl border-2 border-cyan-400/80 bg-[#051c2c]/95 text-center shadow-[0_0_20px_rgba(34,211,238,0.45)]">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-cyan-300">
                  <span>
                    🛡 ABRIGO SÓLIDO DETECTADO ·{' '}
                    {Math.round(yardBomb.dangerZoneDistanceM ?? 0)}M /{' '}
                    {yardBomb.dangerZoneLethalRadiusM ?? 22}M
                  </span>
                  <span className="text-amber-300 tabular-nums">
                    T-{Math.max(0, yardBomb.c4TimerSec).toFixed(1)}S
                  </span>
                </div>
                <div className="text-[11px] sm:text-xs font-display font-black uppercase tracking-wider text-sky-100 mt-0.5">
                  PROTEGIDO ATRÁS DE COBERTURA — DANO LETAL DO C4 BLOQUEADO
                </div>
              </div>
            ) : (
              <div className="px-3.5 py-1 rounded-xl border border-emerald-400/70 bg-[#041f17]/95 text-center shadow-lg">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                  <span>
                    ✓ FORA DO RAIO LETAL ({Math.round(yardBomb.dangerZoneDistanceM ?? 25)}M /{' '}
                    {yardBomb.dangerZoneLethalRadiusM ?? 22}M)
                  </span>
                  <span className="text-amber-300 tabular-nums">
                    DETONAÇÃO EM {Math.max(0, yardBomb.c4TimerSec).toFixed(1)}S
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

      {/* CÂMERA LENTA CINEMATOGRÁFICA DE DETONAÇÃO DO C4 (Visão limpa da onda de choque e corpos arremessados) */}
      {yardBomb.roundState === 'ROUND_OVER' && yardBomb.blastCineActive && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none select-none w-[min(92vw,480px)]">
          <div className="px-4 py-2 rounded-xl border border-amber-400/70 bg-[#070b12]/92 text-center shadow-[0_0_30px_rgba(245,158,11,0.35)]">
            <div className="text-[9px] font-mono font-bold tracking-[0.22em] text-amber-400 uppercase">
              DETONAÇÃO C4 NO PONTO {yardBomb.plantedSite || 'A'} · CÂMERA LENTA (0.28X)
            </div>
            <div className="text-xs sm:text-sm font-display font-black tracking-wider text-white uppercase mt-0.5">
              {yardBomb.roundWinReason}
            </div>
          </div>
        </div>
      )}

      {/* BANNER DE FIM DE RODADA (Exibido após a câmera lenta da explosão encerrar) */}
      {yardBomb.roundState === 'ROUND_OVER' && !yardBomb.blastCineActive && (
        <div className="fixed inset-0 z-45 pointer-events-none flex items-center justify-center p-4 select-none">
          <div
            className={`max-w-lg w-full rounded-2xl border-2 p-5 text-center shadow-2xl bg-[#070b12]/95 ${
              yardBomb.roundWinner === 'VANGUARD'
                ? 'border-sky-400 shadow-[0_0_40px_rgba(56,189,248,0.35)]'
                : 'border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.35)]'
            }`}
          >
            <div className="flex justify-center mb-2">
              {yardBomb.roundWinner === 'VANGUARD' ? (
                <VanguardTeamEmblem className="w-12 h-12" />
              ) : (
                <BlackthornTeamEmblem className="w-12 h-12" />
              )}
            </div>
            <div className="text-xs font-mono font-bold tracking-[0.2em] text-amber-400 uppercase">
              FIM DA RODADA {yardBomb.currentRound} DE {yardBomb.maxRounds}
            </div>
            <h2
              className={`text-xl sm:text-2xl font-display font-black tracking-wider uppercase mt-1 ${
                yardBomb.roundWinner === 'VANGUARD' ? 'text-sky-300' : 'text-red-400'
              }`}
            >
              VITÓRIA DA RODADA: {yardBomb.roundWinner}
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-1">
              {yardBomb.roundWinReason}
            </p>

            <div className="my-3 py-2 px-4 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center gap-6 font-display font-black text-lg tabular-nums">
              <span className="text-sky-300">
                VANGUARD {yardBomb.vanguardScore}
              </span>
              <span className="text-slate-500 text-xs">VS</span>
              <span className="text-red-400">
                {yardBomb.blackthornScore} BLACKTHORN
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-slate-300 pt-1">
              <span className="text-emerald-400 font-bold">
                Recompensa: +{yardBomb.lastRoundXp} XP · +${yardBomb.lastRoundCash}
              </span>
              <span className="text-amber-300 tabular-nums">
                Próxima rodada em {Math.ceil(yardBomb.roundTransitionSec)}s...
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
