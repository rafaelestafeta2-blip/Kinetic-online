import React, { useEffect, useState } from 'react';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import {
  getActiveOnlineRoom,
  isOnlineMatchActive,
} from '../multiplayer/onlineRoomService';
import {
  VoiceChatState,
  voiceChatManager,
} from '../multiplayer/voiceChatManager';
import { DrillMode, HudState, WeaponId } from '../types/game';
import { bindTap } from './hudTapUtils';

interface LiveMatchScoreboardModalProps {
  hud: HudState;
  open: boolean;
  onClose: () => void;
}

interface ScoreboardRow {
  id: string;
  callsign: string;
  subtitle: string;
  weaponLabel: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  score: number;
  isAlive: boolean;
  isLocal: boolean;
}

const SHORT_WEAPON_LABELS: Record<WeaponId, string> = {
  P50_PISTOL: 'DEAGLE .50',
  M1911_PISTOL: 'M1911',
  SMG_45: 'SMG .45',
  SMG_MP5: 'MP5 9MM',
  SHOTGUN_12: 'DRAKE-12',
  SHOTGUN_SPAS: 'SPAS-12',
  M4_CARBINE: 'M4A1',
  CARBINE_AR: 'CARABINA',
  S_MILITARY: 'SCAR-L',
  AK47_RIFLE: 'AK-47',
  AK12_RIFLE: 'AK-200',
  L49_LMG: 'LMG 100R',
  SNIPER_BOLT: 'KAR98K',
  SNIPER_TACTICAL: 'MK14 EBR',
  SNIPER_AWP: 'AWP .338',
  SNIPER_HEAVY: 'M200',
  RPG7_LAUNCHER: 'RPG-7',
  KNIFE_TACTICAL: 'FACA',
};

const ARENA_LABELS: Partial<Record<DrillMode, string>> = {
  YARD_BOMB_5V5: 'YARD // BOMBA 5v5',
  DUST2_BOMB_5V5: 'DUST II // BOMBA 5v5',
  ASSAULT_BOMB_5V5: 'ASSAULT // BOMBA 5v5',
  INDUSTRIA_BOMB_5V5: 'INDÚSTRIA // BOMBA 5v5',
  HANGAR_BOMB_5V5: 'HANGAR // BOMBA 5v5',
  EASTERN_CITY_BOMB_5V5: 'EASTERN CITY // BOMBA 5v5',
  MIRAGE_ANUBIS_BOMB_5V5: 'MIRAGE // BOMBA 5v5',
  STATION_CAPTURE_5V5: 'STATION // CAPTURAR BANDEIRA 5v5',
  STATION_TDM_5V5: 'STATION // MATA-MATA 5v5',
};

function sortRows(rows: ScoreboardRow[]): ScoreboardRow[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.kills !== a.kills) return b.kills - a.kills;
    return a.deaths - b.deaths;
  });
}

export const LiveMatchScoreboardModal: React.FC<LiveMatchScoreboardModalProps> = ({
  hud,
  open,
  onClose,
}) => {
  const [voiceState, setVoiceState] = useState<VoiceChatState>(() =>
    voiceChatManager.getState()
  );

  useEffect(() => {
    if (!open) return;
    const unsub = voiceChatManager.subscribe((next) => setVoiceState(next));
    return () => unsub();
  }, [open]);

  if (!open || !hud.yardBomb) return null;

  const yb = hud.yardBomb;
  const onlineActive = isOnlineMatchActive();
  const onlineRoom = onlineActive ? getActiveOnlineRoom() : null;
  const localUid = getCloudSyncState().profile.uid;

  let vanguardRows: ScoreboardRow[] = [];
  let blackthornRows: ScoreboardRow[] = [];

  if (onlineRoom && Object.keys(onlineRoom.players).length > 0) {
    const players = Object.values(onlineRoom.players);
    for (const p of players) {
      const row: ScoreboardRow = {
        id: p.uid,
        callsign: p.callsign || 'OPERADOR',
        subtitle: `NV.${p.rankLevel || 1}`,
        weaponLabel: SHORT_WEAPON_LABELS[p.weaponId] || p.weaponId,
        kills: p.kills || 0,
        deaths: p.deaths || 0,
        assists: p.assists || 0,
        headshots: p.headshots || 0,
        score: (p.kills || 0) * 100 + (p.assists || 0) * 35 + (p.headshots || 0) * 25,
        isAlive: !p.isDown,
        isLocal: p.uid === localUid,
      };
      if (p.team === 'VANGUARD') {
        vanguardRows.push(row);
      } else {
        blackthornRows.push(row);
      }
    }
    vanguardRows = sortRows(vanguardRows);
    blackthornRows = sortRows(blackthornRows);
  } else {
    const allyRadar = hud.radarTargets.filter((t) => t.isAlly);
    const enemyRadar = hud.radarTargets.filter((t) => !t.isAlly);
    let allyRadarIdx = 0;

    if (yb.squadStats && yb.squadStats.length > 0) {
      vanguardRows = sortRows(
        yb.squadStats.map((op, idx) => {
          let isAlive = true;
          if (op.isPlayer) {
            isAlive = hud.health > 0 && !yb.isSpectating;
          } else {
            const matched = allyRadar[allyRadarIdx++];
            isAlive = matched ? !matched.isDown : idx < yb.alliesAlive;
          }
          return {
            id: `${op.callsign}-${idx}`,
            callsign: op.callsign,
            subtitle: op.roleTitle,
            weaponLabel: SHORT_WEAPON_LABELS[op.weaponId] || op.weaponId,
            kills: op.kills,
            deaths: op.deaths,
            assists: op.assists,
            headshots: op.headshots,
            score: op.score,
            isAlive,
            isLocal: op.isPlayer,
          };
        })
      );
    }

    const enemySlots = Math.max(enemyRadar.length, 5);
    const enemyCallsigns = [
      'BLACKTHORN-01',
      'VIPER-02',
      'KRAKEN-03',
      'JACKAL-04',
      'SPECTRE-05',
    ];
    for (let i = 0; i < Math.min(enemySlots, 5); i++) {
      const target = enemyRadar[i];
      blackthornRows.push({
        id: target?.id || `bt-${i}`,
        callsign: enemyCallsigns[i] || `BLACKTHORN-0${i + 1}`,
        subtitle: 'UNIDADE TÁTICA',
        weaponLabel: 'ARSENAL BT',
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        score: 0,
        isAlive: target ? !target.isDown : i < yb.enemiesAlive,
        isLocal: false,
      });
    }
  }

  const modeBadge = yb.isTdmMode
    ? `META ${yb.tdmTargetKills || 40} KILLS`
    : yb.isCaptureMode
      ? 'CAPTURA 5v5'
      : `ROUND ${yb.currentRound}/${yb.maxRounds}`;

  const renderTeamTable = (
    title: string,
    score: number,
    aliveCount: number,
    rows: ScoreboardRow[],
    accent: 'vanguard' | 'blackthorn',
    showZeroPlaceholder: boolean
  ) => {
    const isVanguard = accent === 'vanguard';
    return (
      <div
        className={`rounded-xl border overflow-hidden flex flex-col ${
          isVanguard
            ? 'bg-sky-950/35 border-sky-400/35'
            : 'bg-red-950/35 border-red-400/35'
        }`}
      >
        <div
          className={`px-3 py-2 flex items-center justify-between border-b ${
            isVanguard
              ? 'bg-sky-950/75 border-sky-400/25'
              : 'bg-red-950/75 border-red-400/25'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isVanguard ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8]' : 'bg-red-400 shadow-[0_0_8px_#f87171]'
              }`}
            />
            <span
              className={`font-display font-black text-xs tracking-widest uppercase truncate ${
                isVanguard ? 'text-sky-300' : 'text-red-300'
              }`}
            >
              {title}
            </span>
            <span className="text-[9px] font-mono text-slate-400 uppercase shrink-0">
              · {aliveCount} VIVOS
            </span>
          </div>
          <span className="font-display font-black text-lg leading-none text-white tabular-nums">
            {score}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_72px_28px_28px_28px_28px_42px] gap-1 px-2.5 py-1.5 text-[9px] font-mono font-bold uppercase text-slate-400 border-b border-white/10 bg-black/30">
          <span>OPERADOR</span>
          <span className="truncate">ARMA</span>
          <span className="text-center">K</span>
          <span className="text-center">D</span>
          <span className="text-center">A</span>
          <span className="text-center">HS</span>
          <span className="text-right">PTS</span>
        </div>

        <div className="divide-y divide-white/5">
          {rows.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] font-mono text-slate-400">
              Aguardando operadores...
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-[1fr_72px_28px_28px_28px_28px_42px] gap-1 items-center px-2.5 py-1.5 text-[10px] font-mono ${
                  row.isLocal
                    ? 'bg-amber-500/15 text-amber-100'
                    : row.isAlive
                      ? 'text-slate-100'
                      : 'text-slate-500 bg-black/25'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      row.isAlive ? 'bg-emerald-400' : 'bg-slate-600'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="font-bold truncate leading-tight flex items-center gap-1">
                      <span className="truncate">{row.callsign}</span>
                      {row.isLocal && (
                        <span className="text-[8px] text-amber-300 font-black shrink-0">
                          (VOCÊ)
                        </span>
                      )}
                      {!row.isLocal && voiceState.peers[row.id] && (
                        <button
                          type="button"
                          {...bindTap(() => voiceChatManager.togglePeerMute(row.id))}
                          title={
                            voiceState.peers[row.id].mutedByLocal
                              ? `Desmutar voz de ${row.callsign}`
                              : `Silenciar voz de ${row.callsign}`
                          }
                          className={`px-1 py-0.2 rounded text-[8px] cursor-pointer shrink-0 ${
                            voiceState.peers[row.id].mutedByLocal
                              ? 'bg-red-500/30 text-red-300'
                              : voiceState.peers[row.id].isSpeaking
                                ? 'bg-emerald-500/30 text-emerald-300 animate-pulse'
                                : 'bg-white/10 text-slate-300'
                          }`}
                        >
                          {voiceState.peers[row.id].mutedByLocal ? '🔇' : '🎙️'}
                        </button>
                      )}
                    </div>
                    <div className="text-[8px] text-slate-400 truncate leading-none">
                      {row.isAlive ? row.subtitle : 'ABATIDO'}
                    </div>
                  </div>
                </div>
                <span className="text-[9px] text-slate-300 truncate">
                  {row.weaponLabel}
                </span>
                <span className="text-center font-bold tabular-nums">
                  {showZeroPlaceholder ? '—' : row.kills}
                </span>
                <span className="text-center tabular-nums text-slate-400">
                  {showZeroPlaceholder ? '—' : row.deaths}
                </span>
                <span className="text-center tabular-nums text-slate-400">
                  {showZeroPlaceholder ? '—' : row.assists}
                </span>
                <span className="text-center tabular-nums text-amber-300/90">
                  {showZeroPlaceholder ? '—' : row.headshots}
                </span>
                <span className="text-right font-bold tabular-nums text-white">
                  {showZeroPlaceholder ? '—' : row.score}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-2.5 sm:p-4 pointer-events-auto select-none"
    >
      <div className="w-full max-w-4xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#070b12]/95 border border-white/15 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Header */}
        <div className="px-3.5 sm:px-5 py-2.5 border-b border-white/10 bg-gradient-to-r from-sky-950/50 via-[#0b111c] to-red-950/50 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-xs sm:text-sm tracking-widest text-white uppercase truncate">
                PLACAR TÁTICO · {ARENA_LABELS[hud.drillMode] || 'OPERAÇÃO 5v5'}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 ${
                  onlineActive
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                    : 'bg-slate-700/60 text-slate-300 border border-white/15'
                }`}
              >
                {onlineActive ? 'ONLINE PvP' : 'TREINO IA'}
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
              {modeBadge} · SEGURE [TAB] NO PC OU TOQUE PARA FECHAR
            </div>
          </div>

          <button
            type="button"
            {...bindTap(onClose)}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-mono font-bold text-white uppercase cursor-pointer shrink-0 active:scale-95 transition-transform"
          >
            FECHAR ✕
          </button>
        </div>

        {/* Teams Grid */}
        <div className="p-3 sm:p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderTeamTable(
            'VANGUARD',
            yb.vanguardScore,
            yb.alliesAlive,
            vanguardRows,
            'vanguard',
            false
          )}
          {renderTeamTable(
            'BLACKTHORN',
            yb.blackthornScore,
            yb.enemiesAlive,
            blackthornRows,
            'blackthorn',
            !onlineActive
          )}
        </div>
      </div>
    </div>
  );
};
