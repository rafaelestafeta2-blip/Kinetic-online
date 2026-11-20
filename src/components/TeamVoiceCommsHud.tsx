import React, { useEffect, useState } from 'react';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import {
  TACTICAL_QUICK_CALLOUTS,
  VoiceChatState,
  VoiceMicMode,
  voiceChatManager,
} from '../multiplayer/voiceChatManager';
import { getPlayerInventoryState } from '../progression/loadoutSystem';
import { bindTap } from './hudTapUtils';
import { WarfaceClassIcon } from './WarfaceClassIcons';

interface TeamVoiceCommsHudProps {
  variant?: 'IN_MATCH' | 'LOBBY';
}

const EqualizerBars: React.FC<{ level: number; active: boolean }> = ({
  level,
  active,
}) => {
  const b1 = active ? Math.max(25, Math.min(100, Math.round(level * 115))) : 18;
  const b2 = active ? Math.max(35, Math.min(100, Math.round(level * 145))) : 18;
  const b3 = active ? Math.max(22, Math.min(100, Math.round(level * 95))) : 18;
  const b4 = active ? Math.max(30, Math.min(100, Math.round(level * 130))) : 18;

  return (
    <div className="flex items-end gap-[2px] h-3 w-3.5 shrink-0">
      {[b1, b2, b3, b4].map((pct, i) => (
        <span
          key={i}
          className={`w-[2px] rounded-full transition-all duration-75 ${
            active
              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]'
              : 'bg-slate-600'
          }`}
          style={{ height: `${pct}%` }}
        />
      ))}
    </div>
  );
};

export const TeamVoiceCommsHud: React.FC<TeamVoiceCommsHudProps> = ({
  variant = 'IN_MATCH',
}) => {
  const [voiceState, setVoiceState] = useState<VoiceChatState>(() =>
    voiceChatManager.getState()
  );
  const [showCalloutWheel, setShowCalloutWheel] = useState(false);
  const [expandedPanel, setExpandedPanel] = useState(variant === 'LOBBY');

  useEffect(() => {
    const unsub = voiceChatManager.subscribe((next) => setVoiceState(next));
    return () => unsub();
  }, []);

  // PC Keyboard Shortcut: Hold [V] for Push-To-Talk, Press [B] for Tactical Radio Callouts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'KeyV' && !e.repeat) {
        void voiceChatManager.setPttHeld(true);
      } else if (e.code === 'KeyB' && !e.repeat && variant === 'IN_MATCH') {
        setShowCalloutWheel((prev) => !prev);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyV') {
        void voiceChatManager.setPttHeld(false);
      }
    };

    const onBlur = () => {
      void voiceChatManager.setPttHeld(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [variant]);

  const sync = getCloudSyncState();
  const inv = getPlayerInventoryState();
  const localCallsign = sync.profile.callsign || 'OPERADOR';
  const localClass = inv.selectedClass || 'FUZILEIRO';
  const peersList = Object.values(voiceState.peers);
  const speakingPeers = peersList.filter((p) => p.isSpeaking);

  const cycleMicMode = () => {
    const nextMode: VoiceMicMode =
      voiceState.micMode === 'MUTED'
        ? 'PTT'
        : voiceState.micMode === 'PTT'
          ? 'OPEN'
          : 'MUTED';
    void voiceChatManager.setMicMode(nextMode);
  };

  if (variant === 'LOBBY') {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-[#09131c]/95 via-[#0d1824]/95 to-[#09131c]/95 p-2.5 shadow-[0_0_20px_rgba(16,185,129,0.12)] text-white font-mono"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Radio Frequency & Active Local Mic */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                voiceState.isTransmitting
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_14px_rgba(16,185,129,0.55)]'
                  : voiceState.micMode === 'MUTED'
                    ? 'bg-red-950/50 border-red-500/40 text-red-400'
                    : 'bg-sky-950/60 border-sky-400/40 text-sky-300'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                {voiceState.micMode === 'MUTED' ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  </>
                ) : (
                  <>
                    <rect x="9" y="2" width="6" height="11" rx="3" />
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
                  </>
                )}
              </svg>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold tracking-widest text-emerald-300 uppercase truncate">
                  RÁDIO TÁTICO DE ESQUADRÃO · {voiceState.frequencyMhz}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-300 mt-0.5">
                <span className="font-bold text-white">{localCallsign}</span>
                <EqualizerBars
                  level={voiceState.localAudioLevel}
                  active={voiceState.isTransmitting}
                />
                <span className="text-[9px] text-amber-300">
                  {voiceState.isTransmitting
                    ? 'TRANSMITINDO VOZ...'
                    : voiceState.micMode === 'OPEN'
                      ? 'VOZ ABERTA (VAD ATIVO)'
                      : voiceState.micMode === 'PTT'
                        ? 'SEGURE [V] OU BOTÃO PTT PARA FALAR'
                        : 'MICROFONE MUTADO'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Mode Controls & Push-To-Talk Hold Button */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'MUTED', label: 'MUTADO' },
                { id: 'PTT', label: 'PTT [V]' },
                { id: 'OPEN', label: 'VOZ ABERTA' },
              ] as const
            ).map((m) => {
              const active = voiceState.micMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => void voiceChatManager.setMicMode(m.id)}
                  className={`px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all ${
                    active
                      ? m.id === 'MUTED'
                        ? 'bg-red-500/25 border-red-400 text-red-200'
                        : 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                      : 'bg-black/50 border-white/15 text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}

            <button
              type="button"
              onPointerDown={() => void voiceChatManager.setPttHeld(true)}
              onPointerUp={() => void voiceChatManager.setPttHeld(false)}
              onPointerLeave={() => void voiceChatManager.setPttHeld(false)}
              onPointerCancel={() => void voiceChatManager.setPttHeld(false)}
              className={`px-3 py-1 rounded-md border text-[10px] font-black uppercase tracking-wider cursor-pointer select-none transition-all ${
                voiceState.pttHeld
                  ? 'bg-emerald-500 text-slate-950 border-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.8)] scale-95'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/60 text-amber-200'
              }`}
            >
              🎙️ SEGURAR P/ FALAR
            </button>

            <button
              type="button"
              onClick={() => voiceChatManager.toggleTeamChannelMute()}
              title={
                voiceState.teamChannelMuted
                  ? 'Ativar Áudio do Esquadrão'
                  : 'Silenciar Recepção do Esquadrão'
              }
              className={`px-2 py-1 rounded-md border text-[10px] font-bold uppercase cursor-pointer ${
                voiceState.teamChannelMuted
                  ? 'bg-red-950/70 border-red-500/50 text-red-300'
                  : 'bg-black/50 border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              {voiceState.teamChannelMuted ? '🔇 CANAL MUDO' : '🔊 EQUIPE ON'}
            </button>
          </div>
        </div>

        {/* Active Squad Voice Roster */}
        {peersList.length > 0 && (
          <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
            <span className="text-[9px] text-slate-400 uppercase">
              ALIADOS NO CANAL ({peersList.length}):
            </span>
            {peersList.map((peer) => (
              <button
                key={peer.uid}
                type="button"
                onClick={() => voiceChatManager.togglePeerMute(peer.uid)}
                title={
                  peer.mutedByLocal
                    ? `Desmutar ${peer.callsign}`
                    : `Silenciar ${peer.callsign}`
                }
                className={`px-2 py-0.5 rounded border flex items-center gap-1.5 text-[10px] cursor-pointer transition-all ${
                  peer.mutedByLocal
                    ? 'bg-red-950/40 border-red-500/40 text-red-300 opacity-70'
                    : peer.isSpeaking
                      ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-[0_0_10px_rgba(16,185,129,0.35)]'
                      : 'bg-black/50 border-white/15 text-slate-200 hover:border-white/35'
                }`}
              >
                <WarfaceClassIcon
                  classId={peer.classId}
                  className="w-3 h-3"
                  color={peer.isSpeaking ? '#34d399' : '#94a3b8'}
                />
                <span className="font-bold truncate max-w-[96px]">
                  {peer.callsign}
                </span>
                <EqualizerBars
                  level={peer.audioLevel}
                  active={peer.isSpeaking && !peer.mutedByLocal}
                />
                {peer.mutedByLocal && (
                  <span className="text-[9px] text-red-400 font-black">🔇</span>
                )}
              </button>
            ))}
          </div>
        )}

        {voiceState.micPermissionError && (
          <div className="mt-1.5 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1">
            ⚠️ {voiceState.micPermissionError}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // IN-MATCH HUD OVERLAY (TACTICAL SQUAD RADIO + PTT TOUCH & CALLOUT WHEEL)
  // =========================================================================
  return (
    <>
      {/* 1. LEFT SQUAD RADIO SPEAKER STACK + COMPACT RADIO CONTROL PILL */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed left-3 top-14 z-35 flex flex-col gap-1.5 select-none pointer-events-auto font-mono"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Compact Radio Status Header Bar */}
        <div className="flex items-center gap-1 bg-[#070d15]/90 border border-sky-400/35 rounded-xl px-2 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.7)] backdrop-blur-sm">
          {/* Mic Mode Cycle Button */}
          <button
            type="button"
            {...bindTap(cycleMicMode)}
            title="Alternar Modo do Microfone: PTT [V] / VOZ ABERTA / MUTADO"
            className={`px-2 py-1 rounded-lg border flex items-center gap-1.5 text-[9px] font-bold uppercase cursor-pointer transition-all ${
              voiceState.isTransmitting
                ? 'bg-emerald-500 text-slate-950 border-emerald-200 font-black shadow-[0_0_12px_rgba(16,185,129,0.75)]'
                : voiceState.micMode === 'OPEN'
                  ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-300'
                  : voiceState.micMode === 'PTT'
                    ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                    : 'bg-red-950/60 border-red-500/45 text-red-300'
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
              {voiceState.micMode === 'MUTED' ? (
                <>
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                </>
              ) : (
                <>
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
                </>
              )}
            </svg>
            <span>
              {voiceState.micMode === 'OPEN'
                ? 'VOZ ON'
                : voiceState.micMode === 'PTT'
                  ? 'PTT [V]'
                  : 'MUDO'}
            </span>
          </button>

          {/* Dedicated Hold-To-Talk PTT Button for Mobile & Desktop */}
          <button
            type="button"
            onPointerDown={() => void voiceChatManager.setPttHeld(true)}
            onPointerUp={() => void voiceChatManager.setPttHeld(false)}
            onPointerLeave={() => void voiceChatManager.setPttHeld(false)}
            onPointerCancel={() => void voiceChatManager.setPttHeld(false)}
            title="Segure para transmitir voz para a equipe [Tecla V]"
            className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider cursor-pointer select-none transition-all flex items-center gap-1 ${
              voiceState.pttHeld || voiceState.isTransmitting
                ? 'bg-emerald-400 text-slate-950 border-white shadow-[0_0_16px_rgba(52,211,153,0.9)] scale-95'
                : 'bg-amber-500/20 hover:bg-amber-500/35 border-amber-400/60 text-amber-200'
            }`}
          >
            <span>🎙️</span>
            <span>FALAR</span>
          </button>

          {/* Tactical Radio Quick Callouts Toggle [B] */}
          <button
            type="button"
            {...bindTap(() => setShowCalloutWheel((prev) => !prev))}
            title="Comandos de Rádio Rápidos da Equipe [Tecla B]"
            className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase cursor-pointer transition-all ${
              showCalloutWheel
                ? 'bg-amber-500 text-slate-950 border-amber-200 font-black'
                : 'bg-white/10 hover:bg-white/20 border-white/15 text-slate-200'
            }`}
          >
            📻 [B]
          </button>

          {/* Expand / Collapse Squad Channel Roster */}
          <button
            type="button"
            {...bindTap(() => setExpandedPanel((prev) => !prev))}
            title="Mostrar/Ocultar Frequência e Operadores no Rádio"
            className="px-1.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-[9px] text-slate-300 cursor-pointer"
          >
            {expandedPanel ? '▲' : '▼'}
          </button>
        </div>

        {/* Local Operator Transmitting Indicator Card */}
        {(voiceState.isTransmitting || expandedPanel) && (
          <div
            className={`px-2.5 py-1.5 rounded-xl border backdrop-blur-sm flex items-center justify-between gap-2.5 transition-all max-w-[235px] ${
              voiceState.isTransmitting
                ? 'bg-emerald-950/85 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.45)]'
                : 'bg-[#070d15]/85 border-white/15'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <WarfaceClassIcon
                classId={localClass}
                className="w-3.5 h-3.5 shrink-0"
                color={voiceState.isTransmitting ? '#34d399' : '#38bdf8'}
              />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-white truncate leading-tight">
                  {localCallsign}{' '}
                  <span className="text-[8px] text-emerald-300">(VOCÊ)</span>
                </div>
                <div className="text-[8px] text-slate-400 truncate leading-none">
                  {voiceState.frequencyMhz}
                </div>
              </div>
            </div>
            <EqualizerBars
              level={voiceState.localAudioLevel}
              active={voiceState.isTransmitting}
            />
          </div>
        )}

        {/* Active Teammates Speaking / Connected Cards */}
        {(expandedPanel ? peersList : speakingPeers).map((peer) => (
          <div
            key={peer.uid}
            className={`px-2.5 py-1.5 rounded-xl border backdrop-blur-sm flex items-center justify-between gap-2 transition-all max-w-[235px] ${
              peer.isSpeaking && !peer.mutedByLocal
                ? 'bg-emerald-950/90 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.5)]'
                : 'bg-[#070d15]/85 border-white/15'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <WarfaceClassIcon
                classId={peer.classId}
                className="w-3.5 h-3.5 shrink-0"
                color={peer.isSpeaking ? '#34d399' : '#94a3b8'}
              />
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-white truncate leading-tight">
                  {peer.callsign}
                </div>
                <div className="text-[8px] text-emerald-300/90 truncate leading-none">
                  {peer.mutedByLocal
                    ? 'SILENCIADO'
                    : peer.isSpeaking
                      ? 'TRANSMITINDO NO RÁDIO'
                      : 'NA ESCUTA'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <EqualizerBars
                level={peer.audioLevel}
                active={peer.isSpeaking && !peer.mutedByLocal}
              />
              <button
                type="button"
                {...bindTap(() => voiceChatManager.togglePeerMute(peer.uid))}
                className={`px-1.5 py-0.5 rounded border text-[8px] font-bold cursor-pointer ${
                  peer.mutedByLocal
                    ? 'bg-red-500/25 border-red-400 text-red-200'
                    : 'bg-white/10 border-white/15 text-slate-300 hover:text-white'
                }`}
              >
                {peer.mutedByLocal ? '🔇' : '🔊'}
              </button>
            </div>
          </div>
        ))}

        {/* Tactical Radio Quick Callouts Popover [B] */}
        {showCalloutWheel && (
          <div className="mt-1 w-[250px] rounded-xl bg-[#070c14]/95 border border-amber-400/60 p-2 shadow-2xl space-y-1">
            <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-1">
              <span className="text-[9px] font-display font-black tracking-wider text-amber-300 uppercase">
                RÁDIO TÁTICO · CALLOUTS DE EQUIPE
              </span>
              <button
                type="button"
                {...bindTap(() => setShowCalloutWheel(false))}
                className="text-[10px] text-slate-400 hover:text-white px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            {TACTICAL_QUICK_CALLOUTS.map((c) => (
              <button
                key={c.id}
                type="button"
                {...bindTap(() => {
                  voiceChatManager.sendQuickCallout(c.id);
                  setShowCalloutWheel(false);
                })}
                className="w-full px-2 py-1.5 rounded-lg bg-white/[0.04] hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/60 flex items-center justify-between text-left cursor-pointer transition-all"
              >
                <span className="text-[9px] font-bold text-white">
                  {c.label}
                </span>
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black">
                  RÁDIO
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. ACTIVE RADIO CALLOUT TRANSMISSION BANNER */}
      {voiceState.recentCallout && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-35 pointer-events-none select-none font-mono">
          <div className="px-3.5 py-1.5 rounded-xl bg-[#06131c]/92 border border-emerald-400/75 shadow-[0_0_24px_rgba(16,185,129,0.45)] flex items-center gap-2.5">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[9px] uppercase">
              📻 RÁDIO
            </span>
            <WarfaceClassIcon
              classId={voiceState.recentCallout.senderClassId}
              className="w-3.5 h-3.5 shrink-0"
              color="#34d399"
            />
            <span className="text-[10px] font-black text-emerald-300 uppercase">
              {voiceState.recentCallout.senderCallsign}:
            </span>
            <span className="text-[10px] font-bold text-white">
              &ldquo;{voiceState.recentCallout.text}&rdquo;
            </span>
          </div>
        </div>
      )}
    </>
  );
};
