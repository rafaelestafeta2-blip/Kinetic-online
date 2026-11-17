import React from 'react';
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
  onToggleCanted,
  onToggleSuppressor,
  onCycleCharm,
  onToggleLaser,
  onToggleMute,
  onToggleDock,
  onToggleFullscreen,
  onPause,
}) => {
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
        {/* Single Circular Gear Button (Opens Discreet Popover with Optics, Attachments, Mute, Fullscreen & Settings) */}
        <button
          type="button"
          {...bindTap(onToggleDock)}
          aria-label="Miras, Acessórios e Utilitários"
          title="Abrir/Fechar Miras, Acessórios, Som e Tela Cheia"
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

      {/* DISCREET POPOVER FOR OPTICS, ATTACHMENTS, AUDIO MUTE & FULLSCREEN */}
      {!hud.dockCollapsed && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="fixed top-13 right-32 z-40 pointer-events-auto select-none font-mono bg-[#0b1118]/95 border border-sky-400/50 rounded-2xl p-2 flex flex-col gap-1.5 shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between px-1 border-b border-white/10 pb-1">
            <span className="text-[9px] font-display font-black tracking-widest text-sky-300 uppercase">
              ACESSÓRIOS & SISTEMA
            </span>
            <button
              type="button"
              {...bindTap(onToggleDock)}
              className="text-[10px] font-bold text-slate-400 hover:text-white px-1 cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap max-w-[320px]">
            {/* Iron Sight Icon */}
            <button
              type="button"
              {...bindTap(() => onSelectOptic('iron'))}
              aria-label="Mira de ferro"
              title="Mira de Ferro Padrão"
              className={`w-9 h-9 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                hud.optic === 'iron' && !hud.cantedActive
                  ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 18H20M7 18V10M17 18V10M12 18V7"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            {/* Holo Sight Icon */}
            {(() => {
              const unlocked = isOpticUnlockedAtXp('holo', hud.playerXp);
              return (
                <button
                  type="button"
                  {...bindTap(() => onSelectOptic('holo'))}
                  aria-label="Mira Holográfica"
                  title="Mira Holográfica EOTech"
                  className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                    hud.optic === 'holo' && !hud.cantedActive
                      ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="4"
                      y="6"
                      width="16"
                      height="12"
                      rx="3"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <circle cx="12" cy="12" r="2" fill="currentColor" />
                  </svg>
                </button>
              );
            })()}

            {/* LPVO Scope Icon */}
            {(() => {
              const unlocked = isOpticUnlockedAtXp('lpvo', hud.playerXp);
              return (
                <button
                  type="button"
                  {...bindTap(() => onSelectOptic('lpvo'))}
                  aria-label="Luneta LPVO"
                  title="Luneta Tática LPVO 1-4x"
                  className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                    hud.optic === 'lpvo' && !hud.cantedActive
                      ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle
                      cx="12"
                      cy="12"
                      r="8"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M12 4V20M4 12H20"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              );
            })()}

            {/* Canted 45° Sight Icon */}
            {(() => {
              const unlocked = isAttachmentUnlockedAtXp('canted', hud.playerXp);
              return (
                <button
                  type="button"
                  {...bindTap(onToggleCanted)}
                  aria-label="Mira inclinada 45 graus"
                  title="Mira Inclinada 45° [V]"
                  className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                    hud.cantedActive
                      ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M6 18L18 6M14 6H18V10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              );
            })()}

            {/* Suppressor Icon */}
            {(() => {
              const unlocked = isAttachmentUnlockedAtXp(
                'suppressor',
                hud.playerXp
              );
              return (
                <button
                  type="button"
                  {...bindTap(onToggleSuppressor)}
                  aria-label="Supressor"
                  title="Supressor Acústico Tático [X]"
                  className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                    hud.suppressorAttached
                      ? 'bg-amber-500 text-slate-950 border-amber-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3"
                      y="9"
                      width="18"
                      height="6"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <line
                      x1="8"
                      y1="9"
                      x2="8"
                      y2="15"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="14"
                      y1="9"
                      x2="14"
                      y2="15"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              );
            })()}

            {/* Laser Icon */}
            {(() => {
              const unlocked = isAttachmentUnlockedAtXp('laser', hud.playerXp);
              return (
                <button
                  type="button"
                  {...bindTap(onToggleLaser)}
                  aria-label="Laser tático"
                  title="Laser Tático PEQ-15 Verde [L]"
                  className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                    hud.laserActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-200 font-bold'
                      : unlocked
                        ? 'bg-white/10 text-white border-white/15 hover:bg-white/20'
                        : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'
                  }`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="6" cy="12" r="3" fill="currentColor" />
                    <path
                      d="M9 12H22"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeDasharray="3 2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              );
            })()}

            {/* Weapon Charm Icon Button */}
            <button
              type="button"
              {...bindTap(onCycleCharm)}
              aria-label="Pingente da arma"
              title="Trocar Pingente 3D (Charm) [K]"
              className={`relative w-9 h-9 rounded-xl border flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                hud.weaponCharm && hud.weaponCharm !== 'NONE'
                  ? 'bg-purple-500 text-slate-950 border-purple-200 font-bold'
                  : 'bg-white/10 text-white border-white/15 hover:bg-white/20'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8L12 2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {/* Audio Mute Icon Button */}
            <button
              type="button"
              {...bindTap(onToggleMute)}
              aria-label="Alternar áudio"
              title={hud.muted ? 'Ativar Som [M]' : 'Silenciar Som [M]'}
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors active:scale-90 cursor-pointer ${
                hud.muted
                  ? 'bg-red-500/80 border-red-300 text-white'
                  : 'bg-white/10 border-white/15 text-white hover:bg-white/20'
              }`}
            >
              {hud.muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
                  <path
                    d="M23 9L17 15M17 9L23 15"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M11 5L6 9H2V15H6L11 19V5Z" fill="currentColor" />
                  <path
                    d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>

            {/* Fullscreen Icon Button */}
            <button
              type="button"
              {...bindTap(onToggleFullscreen)}
              aria-label="Tela cheia"
              title="Alternar Tela Cheia Horizontal"
              className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors active:scale-90 cursor-pointer ${
                hud.isFullscreen
                  ? 'bg-amber-500 text-slate-950 border-amber-200'
                  : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
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
