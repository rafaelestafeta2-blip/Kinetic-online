import React from 'react';
import {
  RegistrationRecord,
  StandingRecord,
} from '../../services/championshipClient';
import { ClanEmblemIcon, ClanEmblemId } from '../ClanEmblemIcons';

interface ChampionshipStandingsTabProps {
  standings: StandingRecord[];
  playoffSize: 4 | 8;
  myRegistration: RegistrationRecord | null;
}

export const ChampionshipStandingsTab: React.FC<ChampionshipStandingsTabProps> = ({
  standings,
  playoffSize,
  myRegistration,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border border-slate-800 bg-[#0B1325] px-4 py-3">
        <div>
          <h3 className="text-sm font-display font-black uppercase tracking-wide text-white">
            CLASSIFICAÇÃO GERAL · PONTOS CORRIDOS
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Os Top {playoffSize} clãs avançam para a fase mata-mata dos Playoffs.
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span className="flex items-center gap-1.5 text-cyan-300">
            <span className="w-2 h-2 bg-cyan-400 inline-block" />
            ZONA PLAYOFFS (TOP {playoffSize})
          </span>
        </div>
      </div>

      {standings.length === 0 ? (
        <div className="border border-slate-800 bg-[#0B1325] p-8 text-center">
          <p className="text-sm font-display font-bold text-slate-200 uppercase">
            TABELA AGUARDANDO CLÃS CONFIRMADOS
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Assim que os clãs confirmarem a inscrição, a classificação será exibida em tempo real.
          </p>
        </div>
      ) : (
        <div className="border border-slate-800 bg-[#0B1325] overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-800 bg-[#070D1C] text-[10px] font-mono uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-3 w-12 text-center">POS</th>
                <th className="py-2.5 px-3">CLÃ</th>
                <th className="py-2.5 px-2 text-center w-12">J</th>
                <th className="py-2.5 px-2 text-center w-12">V</th>
                <th className="py-2.5 px-2 text-center w-12">E</th>
                <th className="py-2.5 px-2 text-center w-12">D</th>
                <th className="py-2.5 px-2 text-center w-12">W.O.</th>
                <th className="py-2.5 px-2 text-center w-16">SALDO</th>
                <th className="py-2.5 px-2 text-center w-16">ABATES</th>
                <th className="py-2.5 px-3 text-right w-20 text-cyan-300">PTS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {standings.map((row, idx) => {
                const isMyClan = myRegistration?.id === row.registrationId;
                const isCutline = idx + 1 === playoffSize && idx + 1 < standings.length;
                return (
                  <tr
                    key={row.registrationId}
                    className={`${isMyClan ? 'bg-cyan-950/25' : 'hover:bg-slate-900/50'} ${
                      isCutline ? 'border-b-2 border-b-cyan-400/70' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono font-black tabular-nums relative">
                      {row.inPlayoffZone && (
                        <span className="absolute left-0 top-1 bottom-1 w-1 bg-cyan-400" />
                      )}
                      <span
                        className={
                          row.rankPosition === 1
                            ? 'text-amber-400'
                            : row.inPlayoffZone
                              ? 'text-cyan-300'
                              : 'text-slate-400'
                        }
                      >
                        #{row.rankPosition}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClanEmblemIcon
                          emblemId={row.clanEmblemId as ClanEmblemId}
                          className="w-7 h-7 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-display font-bold text-white truncate">
                            <span className="font-mono text-cyan-400 mr-1.5">[{row.clanTag}]</span>
                            {row.clanName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300">
                      {row.played}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-emerald-300">
                      {row.wins}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300">
                      {row.draws}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-400">
                      {row.losses}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-rose-400">
                      {row.woLosses}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-center font-mono font-semibold tabular-nums ${
                        row.roundDiff > 0
                          ? 'text-emerald-300'
                          : row.roundDiff < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                      }`}
                    >
                      {row.roundDiff > 0 ? `+${row.roundDiff}` : row.roundDiff}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-slate-300">
                      {row.totalKills}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm font-black tabular-nums text-white">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tie-breaker Legend */}
      <div className="border border-slate-800 bg-[#0B1325] px-4 py-2.5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>
          <strong className="text-slate-200 font-mono">DESEMPATE:</strong> 1º Pontos · 2º Saldo de
          Rounds/Kills · 3º Confronto Direto · 4º Total de Abates
        </span>
        <span className="font-mono text-slate-300">V = +3 · E = +1 · D = 0 · W.O. = -1</span>
      </div>
    </div>
  );
};
