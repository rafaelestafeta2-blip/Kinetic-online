import React from 'react';
import {
  getCompatibleOpticsForWeapon,
  SCOPE_PACK_CATALOG,
} from '../progression/loadoutSystem';
import {
  isAttachmentUnlockedAtXp,
  isOpticUnlockedAtXp,
} from '../progression/ranks';
import { HudState, OpticType } from '../types/game';
import { bindTap } from './hudTapUtils';
import { MinimapRadar } from './MinimapRadar';

interface HudTopRightControlsProps {
  hud: HudState;
  onSelectOptic: (optic: OpticType) => void;
  onToggleCanted: () => void;
  onToggleSuppressor: () => void;
  onCycleCharm: () => void;
  onToggleLaser: () => void;
  onToggleMute: () => void;
  onToggleDock: () => void;
  onToggleFullscreen: () => void;
  onPause: () => void;
}

export const HudTopRightControls: React.FC<HudTopRightControlsProps> = ({
  hud,
  onSelectOptic,
  onToggleSuppressor,
  onCycleCharm,
  onToggleLaser,
  onToggleMute,
  onToggleDock,
  onToggleFullscreen,
  onPause,
}) => {
  const compatibleScopes = getCompatibleOpticsForWeapon(hud.activeWeapon);
  const activeScopeSpec = SCOPE_PACK_CATALOG[hud.optic] || SCOPE_PACK_CATALOG.iron;

  return (
    <>
      {/* TOP-LEFT: CIRCULAR PAUSE BUTTON (||) MATCHING REFERENCE SCREENSHOT */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed top-2.5 left-3 z-40 pointer-events-auto select-none"
        style={{ touchAction: 'manipulation' }}
      >
        <button
          type="button"
          {...bindTap(onPause)}
          aria-label="Pausa e Configurações"
          title="Pausa e Configurações [ESC]"
          className="w-10 h-10 rounded-full bg-[#2c251e]/75 hover:bg-[#3a3128]/90 border border-white/30 text-white shadow-[0_4px_14px_rgba(0,0,0,0.65)] flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </button>
      </div>

      {/* TOP-RIGHT: SINGLE GEAR BUTTON + ROUNDED SQUARE MINIMAP MATCHING REFERENCE SCREENSHOT */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed top-2 right-2.5 flex items-start gap-2 z-40 pointer-events-auto select-none font-mono"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Single Circular Gear Button (Opens 3D Scope Pack & Tactical Accessories Popover) */}
        <button
          type="button"
          {...bindTap(onToggleDock)}
          aria-label="Miras 3D, Acessórios e Utilitários"
          title="Abrir/Fechar Miras 3D (Scope Pack), Acessórios, Som e Tela Cheia"
          className={`mt-1 w-9 h-9 rounded-full border flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-[0_4px_14px_rgba(0,0,0,0.65)] ${
            !hud.dockCollapsed
              ? 'bg-sky-500 border-white text-slate-950 shadow-[0_0_14px_rgba(56,189,248,0.7)]'
              : 'bg-[#102033]/85 border-sky-400/40 text-white hover:bg-[#162d47]'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2.2" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              stroke="currentColor"
              strokeWidth="1.9"
            />
          </svg>
        </button>

        {/* Square Rounded Minimap */}
        <MinimapRadar
          playerX={hud.playerPos?.x || 0}
          playerZ={hud.playerPos?.z || 0}
          playerYaw={hud.playerYaw || 0}
          drillMode={hud.drillMode}
          yardBomb={hud.yardBomb}
          targets={hud.radarTargets}
        />
      </div>

      {/* 3D WEAPON SCOPE PACK & TACTICAL ACCESSORIES POPOVER */}
      {!hud.dockCollapsed && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed top-13 right-28 z-40 pointer-events-auto select-none font-mono bg-[#080e16]/95 border border-sky-400/50 rounded-xl p-2.5 flex flex-col gap-2 shadow-2xl w-[310px]"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex flex-col">
              <span className="text-[10px] font-display font-black tracking-widest text-sky-300 uppercase">
                WEAPON SCOPE PACK 3D (.GLB)
              </span>
              <span className="text-[8px] text-slate-400">
                ATIVA: {activeScopeSpec.name.toUpperCase()} ({activeScopeSpec.magnification})
              </span>
            </div>
            <button
              type="button"
              {...bindTap(onToggleDock)}
              className="text-[11px] font-bold text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-white/5 cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* 3D SCOPES GRID (UNLOCKED BY PLAYER LEVEL) */}
          <div className="grid grid-cols-5 gap-1">
            {compatibleScopes.map((scope) => {
              const unlocked = isOpticUnlockedAtXp(scope.id, hud.playerXp);
              const isSelected = hud.optic === scope.id && !hud.cantedActive;
              return (
                <button
                  key={scope.id}
                  type="button"
                  {...bindTap(() => {
                    if (unlocked) {
                      onSelectOptic(scope.id);
                    }
                  })}
                  title={
                    unlocked
                      ? `${scope.name} (${scope.magnification}) — ${scope.reticleLabel}`
                      : `Bloqueado: Requer Nível ${scope.unlockLevel}`
                  }
                  className={`relative rounded-lg border px-1 py-1.5 flex flex-col items-center justify-between gap-0.5 transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 border-amber-200 font-black shadow-[0_0_10px_rgba(245,158,11,0.5)] cursor-pointer'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20 cursor-pointer active:scale-95'
                        : 'bg-slate-900/80 text-slate-500 border-white/10 opacity-70 cursor-not-allowed'
                  }`}
                >
                  {/* Scope Silhouette SVG */}
                  {scope.id === 'iron' && (
                    <svg width="16" height="14" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 18H20M7 18V10M17 18V10M12 18V7"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                  {scope.id === 'red_dot' && (
                    <svg width="16" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
                      <path d="M9 19H15M10 17L9 19M14 17L15 19" stroke="currentColor" strokeWidth="2" />
                      <path d="M10.5 12L12 9.5L13.5 12" stroke={isSelected ? '#0f172a' : '#ef4444'} strokeWidth="2" />
                    </svg>
                  )}
                  {scope.id === 'kolimator' && (
                    <svg width="16" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M6 17H18V14L16 7H8L6 14V17Z" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="11.5" r="2" fill={isSelected ? '#0f172a' : '#22c55e'} />
                    </svg>
                  )}
                  {scope.id === 'holo' && (
                    <svg width="16" height="14" viewBox="0 0 24 24" fill="none">
                      <rect x="4" y="5" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="11" r="3.2" stroke={isSelected ? '#0f172a' : '#f87171'} strokeWidth="1.5" />
                      <circle cx="12" cy="11" r="1" fill="currentColor" />
                    </svg>
                  )}
                  {scope.id === 'lpvo' && (
                    <svg width="16" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M2 10H6L8 8H16L18 10H22V14H18L16 16H8L6 14H2V10Z" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8 16V19M16 16V19" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  )}

                  <span className="text-[7.5px] leading-tight tracking-tighter uppercase font-bold truncate max-w-full">
                    {scope.shortLabel}
                  </span>
                  <span
                    className={`text-[7px] leading-none px-1 py-0.5 rounded ${
                      isSelected
                        ? 'bg-slate-950/25 text-slate-950 font-black'
                        : unlocked
                          ? 'bg-sky-500/20 text-sky-300'
                          : 'bg-amber-500/20 text-amber-300 font-bold'
                    }`}
                  >
                    {unlocked ? scope.magnification : `NV.${scope.unlockLevel}`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* TACTICAL 3D BARREL, AN/PEQ-15 LASER & SYSTEM CONTROLS */}
          <div className="flex items-center justify-between gap-1 pt-1 border-t border-white/10">
            {/* Silencer / Muzzle 3D */}
            {(() => {
              const unlocked = isAttachmentUnlockedAtXp('suppressor', hud.playerXp);
              return (
                <button
                  type="button"
                  {...bindTap(onToggleSuppressor)}
                  title="Alternar Silenciador 3D (SILENCER PACK / SL01 / Freio de Boca) [X]"
                  className={`flex-1 h-8 rounded-lg border px-1.5 flex items-center justify-center gap-1 cursor-pointer transition-transform active:scale-95 ${
                    hud.muzzleDevice !== 'NONE'
                      ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="9" width="18" height="6" rx="2" stroke="currentColor" strokeWidth="2" />
                    <line x1="8" y1="9" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="14" y1="9" x2="14" y2="15" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span className="text-[8px] font-bold uppercase truncate">
                    {hud.muzzleDevice === 'NONE'
                      ? 'CANO 3D'
                      : hud.muzzleDevice === 'SILENCER_PACK'
                        ? 'SILENC. 3D'
                        : hud.muzzleDevice.replace('_LONG', '').replace('_SHORT', '')}
                  </span>
                </button>
              );
            })()}

            {/* AN/PEQ-15 Laser Module 3D */}
            {(() => {
              const unlocked = isAttachmentUnlockedAtXp('laser', hud.playerXp);
              return (
                <button
                  type="button"
                  {...bindTap(onToggleLaser)}
                  title="Módulo Laser 3D AN/PEQ-15 [L]"
                  className={`flex-1 h-8 rounded-lg border px-1.5 flex items-center justify-center gap-1 cursor-pointer transition-transform active:scale-95 ${
                    hud.laserActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-400 border-white/10'
                  }`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="8" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 12H22" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3 2" strokeLinecap="round" />
                  </svg>
                  <span className="text-[8px] font-bold uppercase">
                    PEQ-15 3D
                  </span>
                </button>
              );
            })()}

            {/* Weapon Charm 3D */}
            <button
              type="button"
              {...bindTap(onCycleCharm)}
              title="Trocar Pingente 3D (Charm) [K]"
              className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-transform active:scale-95 ${
                hud.weaponCharm && hud.weaponCharm !== 'NONE'
                  ? 'bg-purple-500 text-slate-950 border-purple-200 font-bold'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Audio Mute */}
            <button
              type="button"
              {...bindTap(onToggleMute)}
              title={hud.muted ? 'Ativar Som [M]' : 'Silenciar Som [M]'}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors active:scale-95 cursor-pointer ${
                hud.muted
                  ? 'bg-red-500/80 border-red-300 text-white'
                  : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
              }`}
            >
              {hud.muted ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
                  <path d="M23 9L17 15M17 9L23 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              )}
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              {...bindTap(onToggleFullscreen)}
              title="Alternar Tela Cheia"
              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors active:scale-95 cursor-pointer ${
                hud.isFullscreen
                  ? 'bg-amber-500 text-slate-950 border-amber-200'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
