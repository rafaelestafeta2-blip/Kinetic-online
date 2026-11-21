import React, { useEffect, useState } from 'react';
import {
  GrenadeType,
  HudState,
  OpticType,
  WeaponId,
} from '../types/game';
import { HudBottomWeaponDock } from './HudBottomWeaponDock';
import { HudTopRightControls } from './HudTopRightControls';
import { bindTap, WeaponSilhouette } from './hudTapUtils';
import { AllyNeedIndicators } from './AllyNeedIndicators';
import { LiveMatchScoreboardModal } from './LiveMatchScoreboardModal';
import { MedicReviveIndicators } from './MedicReviveIndicators';
import { TeamVoiceCommsHud } from './TeamVoiceCommsHud';
import { WarfaceKillfeed } from './WarfaceKillfeed';
import { YardBombHudBar } from './YardBombHudBar';

interface TacticalHudOverlayProps {
  hud: HudState;
  onSelectWeapon: (weaponId: WeaponId) => void;
  onToggleWeaponSlot: () => void;
  onInspectWeapon: () => void;
  onSelectOptic: (optic: OpticType) => void;
  onToggleCanted: () => void;
  onToggleSuppressor: () => void;
  onCycleCharm: () => void;
  onToggleLaser: () => void;
  onCycleFireMode: () => void;
  onResupply: () => void;
  onSupportHeld?: (held: boolean) => void;
  onThrowGrenade: (type: GrenadeType) => void;
  onToggleMute: () => void;
  onToggleDock: () => void;
  onToggleFullscreen: () => void;
  onPause: () => void;
  onPlantBomb?: () => void;
  onActivateStreak?: () => void;
  onReturnToMenu?: () => void;
  onReturnToSquadRoom?: () => void;
  onCycleSpectator?: (dir: -1 | 1) => void;
}

export const TacticalHudOverlay: React.FC<TacticalHudOverlayProps> = ({
  hud,
  onSelectWeapon,
  onToggleWeaponSlot,
  onInspectWeapon,
  onSelectOptic,
  onToggleCanted,
  onToggleSuppressor,
  onCycleCharm,
  onToggleLaser,
  onCycleFireMode,
  onResupply,
  onSupportHeld,
  onThrowGrenade,
  onToggleMute,
  onToggleDock,
  onToggleFullscreen,
  onPause,
  onPlantBomb,
  onActivateStreak,
  onReturnToMenu,
  onReturnToSquadRoom,
  onCycleSpectator,
}) => {
  const isSpectating = Boolean(hud.yardBomb?.isSpectating);
  const isMatchOver = hud.yardBomb?.roundState === 'MATCH_OVER';
  const hasTeamScoreboard = Boolean(
    hud.yardBomb &&
      (hud.drillMode === 'YARD_BOMB_5V5' ||
        hud.drillMode === 'DUST2_BOMB_5V5' ||
        hud.drillMode === 'ASSAULT_BOMB_5V5' ||
        hud.drillMode === 'INDUSTRIA_BOMB_5V5' ||
        hud.drillMode === 'HANGAR_BOMB_5V5' ||
        hud.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
        hud.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
        hud.drillMode === 'STATION_CAPTURE_5V5' ||
        hud.drillMode === 'STATION_TDM_5V5')
  );
  const [scoreboardOpen, setScoreboardOpen] = useState(false);

  useEffect(() => {
    if (!hasTeamScoreboard || isMatchOver) {
      setScoreboardOpen(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setScoreboardOpen(true);
      } else if (e.code === 'Escape') {
        setScoreboardOpen(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        setScoreboardOpen(false);
      }
    };
    const onBlur = () => setScoreboardOpen(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [hasTeamScoreboard, isMatchOver]);
  const hasOpticalSniperScope =
    hud.activeWeapon === 'SNIPER_AWP' ||
    (hud.activeWeapon === 'SNIPER_HEAVY' &&
      (hud.optic === 'iron' || hud.optic === 'lpvo')) ||
    ((hud.activeWeapon === 'SNIPER_BOLT' ||
      hud.activeWeapon === 'SNIPER_TACTICAL') &&
      hud.optic === 'lpvo');
  const isSniperScopeActive =
    !isSpectating &&
    !isMatchOver &&
    hasOpticalSniperScope &&
    !hud.cantedActive &&
    hud.adsAlpha > 0.78;

  const hipCrosshairOpacity =
    isSniperScopeActive || isSpectating || isMatchOver
      ? 0
      : Math.max(
          0,
          (1 - hud.adsAlpha * 1.35) * (hud.reloadPhase === 'IDLE' ? 1 : 0.25)
        );

  return (
    <>
      {/* SPAWNDBG moved to App.tsx (z-200 lime bar) — was easy to miss in HUD */}
      {/* Damage Vignette Flash & Critical Low Health Pulsing Blood Fringe */}
      {!isSpectating && (hud.damageFlashAlpha > 0.01 || (hud.health > 0 && hud.health < 35)) && (
        <div
          className={`fixed inset-0 pointer-events-none z-15 transition-opacity ${
            hud.health < 35 ? 'animate-pulse bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(220,38,38,0.38)_100%)]' : ''
          }`}
          style={{
            boxShadow: hud.damageFlashAlpha > 0.01
              ? `inset 0 0 ${Math.round(hud.damageFlashAlpha * 60 + 24)}px rgba(239, 68, 68, ${Math.min(0.95, hud.damageFlashAlpha)})`
              : 'inset 0 0 50px rgba(220, 38, 38, 0.45)',
            opacity: Math.max(hud.damageFlashAlpha, hud.health < 35 ? 0.85 : 0),
          }}
        />
      )}

      {/* PHOTOREALISTIC SNIPER SCOPE OPTICAL APERTURE */}
      {isSniperScopeActive && (
        <div
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-15 overflow-hidden transition-opacity duration-100"
          style={{
            opacity: Math.min(1, Math.max(0, (hud.adsAlpha - 0.35) / 0.45)),
          }}
        >
          <div className="w-[min(92vmin,640px)] h-[min(92vmin,640px)] rounded-full relative border-[4px] border-[#0f172a] shadow-[0_0_0_9999px_#000000] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,transparent_55%,rgba(0,0,0,0.92)_100%)] pointer-events-none" />
            <div className="absolute inset-1.5 rounded-full border border-amber-500/15 pointer-events-none" />

            <svg
              viewBox="0 0 400 400"
              className="w-full h-full pointer-events-none"
            >
              <line x1="0" y1="200" x2="110" y2="200" stroke="#090d16" strokeWidth="4" />
              <line x1="290" y1="200" x2="400" y2="200" stroke="#090d16" strokeWidth="4" />
              <line x1="200" y1="0" x2="200" y2="110" stroke="#090d16" strokeWidth="4" />
              <line x1="200" y1="290" x2="200" y2="400" stroke="#090d16" strokeWidth="4" />

              <line x1="110" y1="200" x2="290" y2="200" stroke="#0f172a" strokeWidth="1.6" />
              <line x1="200" y1="110" x2="200" y2="290" stroke="#0f172a" strokeWidth="1.6" />

              {[-60, -45, -30, -15, 15, 30, 45, 60].map((dx) => (
                <circle key={`h-${dx}`} cx={200 + dx} cy={200} r="1.6" fill="#0f172a" />
              ))}
              {[-60, -45, -30, -15].map((dy) => (
                <circle key={`v-${dy}`} cx={200} cy={200 + dy} r="1.6" fill="#0f172a" />
              ))}

              <line x1="194" y1="225" x2="206" y2="225" stroke="#0f172a" strokeWidth="1.4" />
              <line x1="190" y1="250" x2="210" y2="250" stroke="#0f172a" strokeWidth="1.5" />
              <line x1="186" y1="275" x2="214" y2="275" stroke="#0f172a" strokeWidth="1.5" />
              <line x1="182" y1="300" x2="218" y2="300" stroke="#0f172a" strokeWidth="1.5" />

              <circle cx="200" cy="200" r="2.2" fill="#ef4444" />
              <circle cx="200" cy="200" r="4.5" fill="#ef4444" opacity="0.35" />
            </svg>
          </div>
        </div>
      )}

      {/* Dynamic Center Crosshair & Ballistic Hitmarker */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-15">
        <svg
          width="44"
          height="44"
          viewBox="0 0 48 48"
          className="transition-opacity duration-75"
          style={{ opacity: hipCrosshairOpacity }}
        >
          <line x1="24" y1="7" x2="24" y2="15" stroke="#ffffff" strokeWidth="1.6" strokeOpacity="0.85" />
          <line x1="24" y1="33" x2="24" y2="41" stroke="#ffffff" strokeWidth="1.6" strokeOpacity="0.85" />
          <line x1="7" y1="24" x2="15" y2="24" stroke="#ffffff" strokeWidth="1.6" strokeOpacity="0.85" />
          <line x1="33" y1="24" x2="41" y2="24" stroke="#ffffff" strokeWidth="1.6" strokeOpacity="0.85" />
          <circle cx="24" cy="24" r="1.5" fill="#ffffff" />
        </svg>

        {hud.hitMarkerAlpha > 0.02 && (
          <svg
            width={hud.hitMarkerIsKill ? '48' : '36'}
            height={hud.hitMarkerIsKill ? '48' : '36'}
            viewBox="0 0 48 48"
            className="absolute transition-transform duration-75"
            style={{
              opacity: hud.hitMarkerAlpha,
              transform: hud.hitMarkerIsKill
                ? `scale(${(1 + hud.hitMarkerAlpha * 0.2).toFixed(3)})`
                : undefined,
              filter: hud.hitMarkerIsKill
                ? 'drop-shadow(0 0 8px rgba(239,68,68,0.9))'
                : undefined,
            }}
          >
            {/* Primary inner X */}
            <line
              x1="10"
              y1="10"
              x2="19"
              y2="19"
              stroke={
                hud.hitMarkerIsKill
                  ? '#ef4444'
                  : hud.hitMarkerIsCrit
                    ? '#ef4444'
                    : '#f8fafc'
              }
              strokeWidth={hud.hitMarkerIsKill ? '3.0' : '2.2'}
              strokeLinecap="round"
            />
            <line
              x1="38"
              y1="10"
              x2="29"
              y2="19"
              stroke={
                hud.hitMarkerIsKill
                  ? '#ef4444'
                  : hud.hitMarkerIsCrit
                    ? '#ef4444'
                    : '#f8fafc'
              }
              strokeWidth={hud.hitMarkerIsKill ? '3.0' : '2.2'}
              strokeLinecap="round"
            />
            <line
              x1="10"
              y1="38"
              x2="19"
              y2="29"
              stroke={
                hud.hitMarkerIsKill
                  ? '#ef4444'
                  : hud.hitMarkerIsCrit
                    ? '#ef4444'
                    : '#f8fafc'
              }
              strokeWidth={hud.hitMarkerIsKill ? '3.0' : '2.2'}
              strokeLinecap="round"
            />
            <line
              x1="38"
              y1="38"
              x2="29"
              y2="29"
              stroke={
                hud.hitMarkerIsKill
                  ? '#ef4444'
                  : hud.hitMarkerIsCrit
                    ? '#ef4444'
                    : '#f8fafc'
              }
              strokeWidth={hud.hitMarkerIsKill ? '3.0' : '2.2'}
              strokeLinecap="round"
            />
            {/* Warface-style double-X golden outer ticks on kill */}
            {hud.hitMarkerIsKill && (
              <>
                <line x1="4" y1="4" x2="10" y2="10" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
                <line x1="44" y1="4" x2="38" y2="10" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
                <line x1="4" y1="44" x2="10" y2="38" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
                <line x1="44" y1="44" x2="38" y2="38" stroke="#fbbf24" strokeWidth="2.4" strokeLinecap="round" />
              </>
            )}
          </svg>
        )}

        {!isSpectating && !isMatchOver && hud.killConfirmAlpha > 0.03 && hud.killConfirmLabel && (
          <div
            className="absolute translate-y-10 px-2.5 py-0.5 rounded bg-red-950/85 border border-red-400/70 shadow-[0_0_16px_rgba(239,68,68,0.6)] flex items-center gap-1.5"
            style={{ opacity: Math.min(1, hud.killConfirmAlpha) }}
          >
            <span className="text-amber-300 text-[11px] leading-none">☠</span>
            <span className="text-[10px] font-display font-black tracking-widest text-white uppercase">
              {hud.killConfirmLabel}
            </span>
          </div>
        )}
      </div>

      {/* WARFACE TACTICAL 5V5 KILLFEED (Canto superior direito abaixo do radar) */}
      <WarfaceKillfeed entries={hud.killfeed} />

      {/* TOP-CENTER: 5v5 BOMB / CAPTURE / TDM SCOREBOARD BAR */}
      {(hud.drillMode === 'YARD_BOMB_5V5' ||
        hud.drillMode === 'DUST2_BOMB_5V5' ||
        hud.drillMode === 'ASSAULT_BOMB_5V5' ||
        hud.drillMode === 'INDUSTRIA_BOMB_5V5' ||
        hud.drillMode === 'HANGAR_BOMB_5V5' ||
        hud.drillMode === 'EASTERN_CITY_BOMB_5V5' ||
        hud.drillMode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
        hud.drillMode === 'STATION_CAPTURE_5V5' ||
        hud.drillMode === 'STATION_TDM_5V5') &&
        hud.yardBomb && (
          <YardBombHudBar
            yardBomb={hud.yardBomb}
            onPlantBomb={() => onPlantBomb?.()}
            onReturnToMenu={onReturnToMenu}
            onReturnToSquadRoom={onReturnToSquadRoom}
            onCycleSpectator={onCycleSpectator}
          />
        )}

      {/* TOP-RIGHT: SQUARE MINIMAP + UTILITY BUTTONS + OPTICS POPOVER */}
      {!isMatchOver && (
        <HudTopRightControls
          hud={hud}
          onSelectOptic={onSelectOptic}
          onToggleCanted={onToggleCanted}
          onToggleSuppressor={onToggleSuppressor}
          onCycleCharm={onCycleCharm}
          onToggleLaser={onToggleLaser}
          onToggleMute={onToggleMute}
          onToggleDock={onToggleDock}
          onToggleFullscreen={onToggleFullscreen}
          onPause={onPause}
          showScoreboardButton={hasTeamScoreboard}
          scoreboardOpen={scoreboardOpen}
          onToggleScoreboard={() => setScoreboardOpen((prev) => !prev)}
        />
      )}

      {/* TOP-LEFT SQUAD VOICE RADIO & PUSH-TO-TALK [V] + QUICK CALLOUTS [B] */}
      {!isMatchOver && <TeamVoiceCommsHud variant="IN_MATCH" />}

      {/* LIVE TACTICAL SCOREBOARD (TAB ON PC / TOP-LEFT BUTTON ON MOBILE) */}
      <LiveMatchScoreboardModal
        hud={hud}
        open={scoreboardOpen && hasTeamScoreboard && !isMatchOver}
        onClose={() => setScoreboardOpen(false)}
      />

      {/* WALL WEAPON PICKUP ICON BUTTON */}
      {!isSpectating && hud.focusedWallWeapon && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed top-20 left-1/2 -translate-x-1/2 pointer-events-auto z-40 select-none"
        >
          <button
            type="button"
            {...bindTap(() => onSelectWeapon(hud.focusedWallWeapon!))}
            aria-label="Pegar arma"
            className="w-16 h-14 rounded-2xl bg-black/80 border-2 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(250,204,21,0.4)] flex flex-col items-center justify-center gap-0.5 active:scale-90 transition-transform cursor-pointer"
          >
            <WeaponSilhouette
              weaponId={hud.focusedWallWeapon}
              className="w-12 h-5"
            />
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white"
            >
              <path
                d="M12 19V5M12 5L6 11M12 5L18 11"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      )}

      {/* TACTICAL SCORESTREAK BANNER (UAV / PACOTE TÁTICO / UAV AVANÇADO + EMP) */}
      {!isSpectating && !isMatchOver && hud.streakBannerText && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 pointer-events-none z-35 select-none">
          <div className="bg-slate-950/90 border border-cyan-400/70 rounded-lg px-3.5 py-1.5 text-[10px] sm:text-xs font-display font-black tracking-widest text-cyan-200 uppercase shadow-[0_0_20px_rgba(34,211,238,0.35)] whitespace-nowrap">
            {hud.streakBannerText}
          </div>
        </div>
      )}

      {/* TACTICAL SCORESTREAK ACTIVATOR & ACTIVE TIMERS (VISIBLE ONLY WHEN READY OR ACTIVE) */}
      {!isSpectating &&
        !isMatchOver &&
        (hud.readyStreak !== 'NONE' ||
          hud.activeUavSec > 0 ||
          hud.activeEmpSec > 0) && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed left-3 top-1/2 -translate-y-1/2 z-35 flex flex-col gap-1.5 select-none pointer-events-auto"
          >
            {hud.readyStreak !== 'NONE' && (
              <button
                type="button"
                {...bindTap(() => onActivateStreak?.())}
                className="px-3 py-2 rounded-xl bg-slate-950/90 border-2 border-cyan-400 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.45)] flex items-center gap-2 active:scale-95 transition-transform cursor-pointer"
              >
                <span className="w-5 h-5 rounded bg-cyan-400 text-slate-950 font-mono font-black text-[11px] flex items-center justify-center shrink-0">
                  4
                </span>
                <div className="text-left leading-tight">
                  <div className="text-[10px] font-display font-black tracking-wider text-white uppercase">
                    {hud.readyStreak === 'UAV'
                      ? 'UAV TÁTICO'
                      : hud.readyStreak === 'ARMOR_PACK'
                        ? 'PACOTE TÁTICO'
                        : 'UAV AVANÇADO + EMP'}
                  </div>
                  <div className="text-[8px] font-mono text-cyan-300 uppercase">
                    ATIVAR SUPORTE
                  </div>
                </div>
              </button>
            )}

            {hud.activeUavSec > 0 && (
              <div className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-emerald-400/50 text-[10px] font-mono font-bold text-emerald-300 uppercase pointer-events-none">
                UAV ONLINE · {Math.ceil(hud.activeUavSec)}s
              </div>
            )}

            {hud.activeEmpSec > 0 && (
              <div className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-cyan-400/50 text-[10px] font-mono font-bold text-cyan-300 uppercase pointer-events-none">
                PULSO EMP · {Math.ceil(hud.activeEmpSec)}s
              </div>
            )}
          </div>
        )}

      {/* TACTICAL ACTION / RELOAD / ATTACHMENT STATUS FEEDBACK BANNER */}
      {!isSpectating && hud.reloadTypeLabel && (
        <div className="fixed bottom-18 left-1/2 -translate-x-1/2 pointer-events-none z-30 select-none font-mono">
          <div className="bg-black/80 border border-amber-400/50 rounded-lg px-3 py-1 text-[10px] sm:text-xs font-mono font-bold text-amber-300 tracking-wider uppercase shadow-lg whitespace-nowrap">
            {hud.reloadTypeLabel}
          </div>
        </div>
      )}

      <MedicReviveIndicators hud={hud} />
      <AllyNeedIndicators hud={hud} />

      {/* BOTTOM-CENTER: WEAPON SLOTS + GRENADE SLOTS + HP BAR (Hidden in Spectator Mode & Match Over) */}
      {!isSpectating && !isMatchOver && (
        <HudBottomWeaponDock
          hud={hud}
          onSelectWeapon={onSelectWeapon}
          onToggleWeaponSlot={onToggleWeaponSlot}
          onInspectWeapon={onInspectWeapon}
          onCycleFireMode={onCycleFireMode}
          onResupply={onResupply}
          onSupportHeld={onSupportHeld}
          onThrowGrenade={onThrowGrenade}
        />
      )}
    </>
  );
};
