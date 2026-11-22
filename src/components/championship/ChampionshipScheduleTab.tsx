import React, { useMemo, useState } from 'react';
import {
  MatchPhase,
  MatchRecord,
  RegistrationRecord,
} from '../../services/championshipClient';
import { ClanEmblemIcon, ClanEmblemId } from '../ClanEmblemIcons';
import {
  formatArenaDisplayName,
  formatDateTimeBr,
  getMatchPhaseLabel,
  getMatchStatusMeta,
} from './championshipFormatters';

interface ChampionshipScheduleTabProps {
  matches: MatchRecord[];
  myRegistration: RegistrationRecord | null;
  serverNowMs: number;
  lobbyBusy: boolean;
  onEnterMatchLobby: (match: MatchRecord) => void;
}

export const ChampionshipScheduleTab: React.FC<ChampionshipScheduleTabProps> = ({
  matches,
  myRegistration,
  serverNowMs,
  lobbyBusy,
  onEnterMatchLobby,
}) => {
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'MY_CLAN'>('ALL');
  const [phaseFilter, setPhaseFilter] = useState<'ALL' | 'ROUND_ROBIN' | 'PLAYOFFS'>('ALL');

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (scopeFilter === 'MY_CLAN') {
        if (!myRegistration) return false;
        if (m.clanARegId !== myRegistration.id && m.clanBRegId !== myRegistration.id) {
          return false;
        }
      }
      if (phaseFilter === 'ROUND_ROBIN' && m.phase !== 'ROUND_ROBIN') return false;
      if (phaseFilter === 'PLAYOFFS' && m.phase === 'ROUND_ROBIN') return false;
      return true;
    });
  }, [matches, scopeFilter, phaseFilter, myRegistration]);

  const groupedByRound = useMemo(() => {
    const groups = new Map<string, { title: string; phase: MatchPhase; items: MatchRecord[] }>();
    for (const match of filteredMatches) {
      const key = `${match.phase}_${match.roundNumber}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(match);
      } else {
        groups.set(key, {
          title: getMatchPhaseLabel(match.phase, match.roundNumber),
          phase: match.phase,
          items: [match],
        });
      }
    }
    return Array.from(groups.entries()).map(([key, val]) => ({ key, ...val }));
  }, [filteredMatches]);

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-800 bg-[#0B1325] px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScopeFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-mono uppercase cursor-pointer transition-colors ${
              scopeFilter === 'ALL'
                ? 'bg-cyan-400 text-slate-950 font-bold'
                : 'bg-[#070D1C] text-slate-300 hover:text-white border border-slate-800'
            }`}
          >
            TODOS OS JOGOS ({matches.length})
          </button>
          <button
            type="button"
            disabled={!myRegistration}
            onClick={() => setScopeFilter('MY_CLAN')}
            className={`px-3 py-1.5 text-xs font-mono uppercase transition-colors ${
              !myRegistration
                ? 'bg-[#070D1C] text-slate-600 border border-slate-800 cursor-not-allowed'
                : scopeFilter === 'MY_CLAN'
                  ? 'bg-cyan-400 text-slate-950 font-bold cursor-pointer'
                  : 'bg-[#070D1C] text-slate-300 hover:text-white border border-slate-800 cursor-pointer'
            }`}
          >
            MEU CLÃ
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {(['ALL', 'ROUND_ROBIN', 'PLAYOFFS'] as const).map((phaseOpt) => (
            <button
              key={phaseOpt}
              type="button"
              onClick={() => setPhaseFilter(phaseOpt)}
              className={`px-2.5 py-1 text-[11px] font-mono uppercase cursor-pointer ${
                phaseFilter === phaseOpt
                  ? 'border border-amber-400/60 bg-amber-950/40 text-amber-300 font-bold'
                  : 'border border-slate-800 bg-[#070D1C] text-slate-400 hover:text-slate-200'
              }`}
            >
              {phaseOpt === 'ALL'
                ? 'TODAS FASES'
                : phaseOpt === 'ROUND_ROBIN'
                  ? 'PONTOS CORRIDOS'
                  : 'PLAYOFFS'}
            </button>
          ))}
        </div>
      </div>

      {groupedByRound.length === 0 ? (
        <div className="border border-slate-800 bg-[#0B1325] p-8 text-center">
          <p className="text-sm font-display font-bold text-slate-200 uppercase">
            NENHUM CONFRONTO DISPONÍVEL AINDA
          </p>
          <p className="text-xs text-slate-400 mt-1">
            As rodadas são geradas automaticamente após o Roster Lock com todos os clãs confirmados.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByRound.map((group) => (
            <section key={group.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-mono font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {group.title}
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {group.items.length} confronto{group.items.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="divide-y divide-slate-800/80 border border-slate-800 bg-[#0B1325]">
                {group.items.map((match) => {
                  const statusMeta = getMatchStatusMeta(match.status);
                  const isMyMatch = Boolean(
                    myRegistration &&
                      (match.clanARegId === myRegistration.id ||
                        match.clanBRegId === myRegistration.id)
                  );
                  const isRoomOpen =
                    match.status === 'SALA_ABERTA' ||
                    match.status === 'AO_VIVO' ||
                    (match.status === 'AGENDADO' &&
                      new Date(match.roomOpensAt).getTime() <= serverNowMs);
                  const showScore = match.status === 'FINALIZADO' || match.status === 'WO';

                  return (
                    <div
                      key={match.id}
                      className={`px-3.5 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                        isMyMatch ? 'bg-cyan-950/15' : ''
                      }`}
                    >
                      {/* Schedule & Status */}
                      <div className="flex items-center gap-3 min-w-[170px]">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${statusMeta.dotClass}`} />
                        <div>
                          <p className={`text-[11px] font-mono font-bold ${statusMeta.textClass}`}>
                            {statusMeta.label}
                            {match.bracketSlot ? ` · ${match.bracketSlot}` : ''}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                            {formatDateTimeBr(match.startsAt)}
                          </p>
                        </div>
                      </div>

                      {/* Teams & Score */}
                      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex items-center justify-end gap-2 min-w-0 text-right">
                          <span
                            className={`text-xs sm:text-sm font-display font-bold truncate ${
                              match.winnerRegId === match.clanARegId
                                ? 'text-emerald-300'
                                : match.woClanRegId === match.clanARegId
                                  ? 'text-rose-400 line-through'
                                  : 'text-white'
                            }`}
                          >
                            [{match.clanATag}] {match.clanAName}
                          </span>
                          <ClanEmblemIcon
                            emblemId={match.clanAEmblemId as ClanEmblemId}
                            className="w-6 h-6 shrink-0"
                          />
                        </div>

                        <div className="px-3 py-1 bg-[#070D1C] border border-slate-800 font-mono text-sm font-black tabular-nums text-center min-w-[74px]">
                          {showScore ? (
                            <span className="text-white">
                              {match.scoreA} <span className="text-slate-500">:</span> {match.scoreB}
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">VS</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 min-w-0">
                          <ClanEmblemIcon
                            emblemId={match.clanBEmblemId as ClanEmblemId}
                            className="w-6 h-6 shrink-0"
                          />
                          <span
                            className={`text-xs sm:text-sm font-display font-bold truncate ${
                              match.winnerRegId === match.clanBRegId
                                ? 'text-emerald-300'
                                : match.woClanRegId === match.clanBRegId
                                  ? 'text-rose-400 line-through'
                                  : 'text-white'
                            }`}
                          >
                            [{match.clanBTag}] {match.clanBName}
                          </span>
                        </div>
                      </div>

                      {/* Arena + Action */}
                      <div className="flex items-center justify-between lg:justify-end gap-3 min-w-[190px]">
                        <span className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                          {formatArenaDisplayName(match.arenaMode).split('·')[0].trim()}
                        </span>

                        {isRoomOpen && isMyMatch ? (
                          <button
                            type="button"
                            disabled={lobbyBusy}
                            onClick={() => onEnterMatchLobby(match)}
                            className="px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-black text-[11px] uppercase tracking-wider cursor-pointer shrink-0"
                          >
                            ENTRAR NA SALA
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-slate-500 tabular-nums shrink-0">
                            Sala: {formatDateTimeBr(match.roomOpensAt).split(',')[1] || formatDateTimeBr(match.roomOpensAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
