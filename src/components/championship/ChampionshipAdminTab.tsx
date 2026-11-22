import React, { useEffect, useState } from 'react';
import {
  adminConfirmClanPayment,
  adminExecuteRosterLock,
  adminFetchAuditLogs,
  adminOpenMatchRoom,
  adminRecordMatchResult,
  adminRunSchedulerNow,
  adminSaveChampionship,
  AuditLogRecord,
  ChampionshipOverviewData,
  ChampionshipStatus,
} from '../../services/championshipClient';
import {
  formatBrlFromCents,
  formatDateTimeBr,
  getMatchPhaseLabel,
  getMatchStatusMeta,
  getRegistrationStatusLabel,
} from './championshipFormatters';

interface ChampionshipAdminTabProps {
  data: ChampionshipOverviewData;
  onRefresh: () => Promise<void>;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export const ChampionshipAdminTab: React.FC<ChampionshipAdminTabProps> = ({
  data,
  onRefresh,
}) => {
  const { championship, registrations, matches } = data;
  const [title, setTitle] = useState(championship.title);
  const [seasonLabel, setSeasonLabel] = useState(championship.seasonLabel);
  const [status, setStatus] = useState<ChampionshipStatus>(championship.status);
  const [entryFeeReais, setEntryFeeReais] = useState(String((championship.entryFeeCents || 0) / 100));
  const [prizePoolReais, setPrizePoolReais] = useState(String((championship.prizePoolCents || 0) / 100));
  const [maxClans, setMaxClans] = useState(String(championship.maxClans));
  const [playoffSize, setPlayoffSize] = useState<4 | 8>(championship.playoffSize);
  const [regOpensLocal, setRegOpensLocal] = useState(() =>
    toDatetimeLocalValue(championship.registrationOpensAt)
  );
  const [rosterLockLocal, setRosterLockLocal] = useState(() =>
    toDatetimeLocalValue(championship.rosterLockAt)
  );
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    toDatetimeLocalValue(championship.startsAt)
  );
  const [rulesSummary, setRulesSummary] = useState(championship.rulesSummary);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [scoreInputs, setScoreInputs] = useState<
    Record<number, { scoreA: string; scoreB: string; killsA: string; killsB: string }>
  >({});

  useEffect(() => {
    setTitle(championship.title);
    setSeasonLabel(championship.seasonLabel);
    setStatus(championship.status);
    setEntryFeeReais(String((championship.entryFeeCents || 0) / 100));
    setPrizePoolReais(String((championship.prizePoolCents || 0) / 100));
    setMaxClans(String(championship.maxClans));
    setPlayoffSize(championship.playoffSize);
    setRegOpensLocal(toDatetimeLocalValue(championship.registrationOpensAt));
    setRosterLockLocal(toDatetimeLocalValue(championship.rosterLockAt));
    setStartsAtLocal(toDatetimeLocalValue(championship.startsAt));
    setRulesSummary(championship.rulesSummary);
  }, [championship]);

  const loadAuditLogs = async () => {
    try {
      const res = await adminFetchAuditLogs(championship.id);
      setAuditLogs(res.logs);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadAuditLogs();
  }, [championship.id, matches.length, registrations.length]);

  const runAction = async (key: string, fn: () => Promise<string>) => {
    setBusyAction(key);
    setFeedback(null);
    try {
      const msg = await fn();
      await onRefresh();
      await loadAuditLogs();
      setFeedback({ type: 'ok', text: msg });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao executar ação administrativa.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveConfig = (createNew: boolean) => {
    void runAction(createNew ? 'create' : 'save', async () => {
      const toIso = (val: string, fallback: string) =>
        val ? new Date(val).toISOString() : fallback;
      await adminSaveChampionship({
        championshipId: createNew ? undefined : championship.id,
        createNew,
        title: title.trim(),
        seasonLabel: seasonLabel.trim(),
        status,
        entryFeeCents: Math.max(0, Math.round(Number(entryFeeReais.replace(',', '.')) * 100)),
        prizePoolCents: Math.max(0, Math.round(Number(prizePoolReais.replace(',', '.')) * 100)),
        maxClans: Math.max(4, Math.min(32, Number(maxClans) || 16)),
        playoffSize,
        registrationOpensAt: toIso(regOpensLocal, championship.registrationOpensAt),
        rosterLockAt: toIso(rosterLockLocal, championship.rosterLockAt),
        startsAt: toIso(startsAtLocal, championship.startsAt),
        rulesSummary: rulesSummary.trim(),
      });
      return createNew
        ? 'Nova temporada criada e ativada com sucesso.'
        : 'Configurações do campeonato atualizadas e auditadas.';
    });
  };

  const getScoreDraft = (matchId: number, mScoreA: number, mScoreB: number, mKillsA: number, mKillsB: number) =>
    scoreInputs[matchId] || {
      scoreA: String(mScoreA),
      scoreB: String(mScoreB),
      killsA: String(mKillsA),
      killsB: String(mKillsB),
    };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`border px-3.5 py-2.5 text-xs ${
            feedback.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
              : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* 1. Tournament Settings Form */}
      <section className="border border-slate-800 bg-[#0B1325] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
              CONFIGURAÇÃO DO CAMPEONATO (ADMIN)
            </h3>
            <p className="text-[11px] text-slate-400">
              Defina taxa de inscrição, premiação em reais, datas automáticas e limite de clãs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('scheduler', async () => {
                  const res = await adminRunSchedulerNow();
                  return `Agendador executado (abertos: ${res.summary.openedChampionshipIds.length}, travados: ${res.summary.lockedChampionshipIds.length}, salas: ${res.summary.openedMatchIds.length}, W.O.: ${res.summary.woAppliedMatchIds.length}).`;
                })
              }
              className="px-3 py-1.5 border border-slate-700 hover:border-cyan-400 text-[11px] font-mono uppercase text-slate-200 cursor-pointer"
            >
              RODAR SCHEDULER
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                void runAction('rosterLock', async () => {
                  const res = await adminExecuteRosterLock(championship.id);
                  return `Roster Lock aplicado! ${res.confirmedClans} clãs travados e ${res.matchesGenerated} confrontos Round-Robin gerados.`;
                })
              }
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-[11px] uppercase tracking-wider cursor-pointer"
            >
              EXECUTAR ROSTER LOCK & GERAR TABELA
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-mono uppercase text-slate-400">TÍTULO DO TORNEIO</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">TEMPORADA</span>
            <input
              type="text"
              value={seasonLabel}
              onChange={(e) => setSeasonLabel(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">FASE ATUAL</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ChampionshipStatus)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white"
            >
              <option value="ANUNCIADO">ANUNCIADO</option>
              <option value="INSCRICOES_ABERTAS">INSCRICOES_ABERTAS</option>
              <option value="ROSTER_LOCK">ROSTER_LOCK</option>
              <option value="EM_ANDAMENTO">EM_ANDAMENTO</option>
              <option value="FINALIZADO">FINALIZADO</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">TAXA POR CLÃ (R$)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={entryFeeReais}
              onChange={(e) => setEntryFeeReais(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">PREMIAÇÃO TOTAL (R$)</span>
            <input
              type="number"
              min={0}
              step="50"
              value={prizePoolReais}
              onChange={(e) => setPrizePoolReais(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">MÁX. CLÃS</span>
            <input
              type="number"
              min={4}
              max={32}
              value={maxClans}
              onChange={(e) => setMaxClans(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">PLAYOFFS</span>
            <select
              value={playoffSize}
              onChange={(e) => setPlayoffSize(Number(e.target.value) === 8 ? 8 : 4)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            >
              <option value={4}>TOP 4 (SEMIS + FINAL)</option>
              <option value={8}>TOP 8 (QUARTAS + SEMIS + FINAL)</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">ABERTURA INSCRIÇÕES</span>
            <input
              type="datetime-local"
              value={regOpensLocal}
              onChange={(e) => setRegOpensLocal(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400">ROSTER LOCK</span>
            <input
              type="datetime-local"
              value={rosterLockLocal}
              onChange={(e) => setRosterLockLocal(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-mono uppercase text-slate-400">INÍCIO DA RODADA 1</span>
            <input
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white font-mono"
            />
          </label>

          <label className="space-y-1 sm:col-span-2 lg:col-span-4">
            <span className="text-[10px] font-mono uppercase text-slate-400">RESUMO DAS REGRAS</span>
            <textarea
              rows={2}
              value={rulesSummary}
              onChange={(e) => setRulesSummary(e.target.value)}
              className="w-full bg-[#060B17] border border-slate-700 px-2.5 py-2 text-white text-xs"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleSaveConfig(true)}
            className="px-3.5 py-2 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-950/40 font-mono text-xs uppercase cursor-pointer"
          >
            CRIAR NOVA TEMPORADA
          </button>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleSaveConfig(false)}
            className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
          >
            SALVAR ALTERAÇÕES
          </button>
        </div>
      </section>

      {/* 2. Registered Clans & Manual Payment Confirmation */}
      <section className="border border-slate-800 bg-[#0B1325] p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            CLÃS INSCRITOS ({registrations.length}/{championship.maxClans}) · TAXA{' '}
            {formatBrlFromCents(championship.entryFeeCents)}
          </h3>
        </div>

        {registrations.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum clã inscrito nesta temporada ainda.</p>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {registrations.map((reg) => (
              <div
                key={reg.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-display font-bold text-white">
                    [{reg.clanTag}] {reg.clanName}{' '}
                    <span className="font-mono text-[11px] text-slate-400">
                      (Líder: {reg.leaderCallsign} · {reg.roster.length} jogadores)
                    </span>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    Status:{' '}
                    <span
                      className={
                        reg.status === 'CONFIRMADO' ? 'text-emerald-400' : 'text-amber-300'
                      }
                    >
                      {getRegistrationStatusLabel(reg.status)}
                    </span>
                    {reg.rosterLocked ? ' · TRAVADO' : ''}
                  </p>
                </div>

                {reg.status !== 'CONFIRMADO' && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() =>
                      void runAction(`confirm_${reg.id}`, async () => {
                        await adminConfirmClanPayment(championship.id, reg.id);
                        return `Pagamento confirmado para [${reg.clanTag}] ${reg.clanName}.`;
                      })
                    }
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-[11px] uppercase cursor-pointer"
                  >
                    CONFIRMAR PAGAMENTO
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Match Operations (Open Room / Official Score / W.O.) */}
      {matches.length > 0 && (
        <section className="border border-slate-800 bg-[#0B1325] p-4 space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white border-b border-slate-800 pb-2">
            GESTÃO DE CONFRONTOS & PLACARES OFICIAIS ({matches.length})
          </h3>

          <div className="space-y-2.5">
            {matches.map((match) => {
              const draft = getScoreDraft(
                match.id,
                match.scoreA,
                match.scoreB,
                match.killsA,
                match.killsB
              );
              const meta = getMatchStatusMeta(match.status);
              return (
                <div
                  key={match.id}
                  className="border border-slate-800 bg-[#070D1C] p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-[210px]">
                    <p className="font-mono text-[10px] text-cyan-400">
                      #{match.id} · {getMatchPhaseLabel(match.phase, match.roundNumber)} ·{' '}
                      <span className={meta.textClass}>{meta.label}</span>
                    </p>
                    <p className="font-display font-bold text-white mt-0.5">
                      [{match.clanATag}] {match.clanAName} vs [{match.clanBTag}] {match.clanBName}
                    </p>
                    <p className="text-[10px] font-mono text-slate-400">
                      Início: {formatDateTimeBr(match.startsAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {match.status === 'AGENDADO' && (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          void runAction(`open_${match.id}`, async () => {
                            await adminOpenMatchRoom(match.id);
                            return `Sala aberta imediatamente para o confronto #${match.id}.`;
                          })
                        }
                        className="px-2.5 py-1.5 border border-cyan-500/60 text-cyan-300 hover:bg-cyan-950/40 font-mono text-[11px] uppercase cursor-pointer"
                      >
                        ABRIR SALA
                      </button>
                    )}

                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      <input
                        type="number"
                        min={0}
                        aria-label="Rounds Clã A"
                        value={draft.scoreA}
                        onChange={(e) =>
                          setScoreInputs((p) => ({
                            ...p,
                            [match.id]: { ...draft, scoreA: e.target.value },
                          }))
                        }
                        className="w-12 bg-[#0B1325] border border-slate-700 px-1.5 py-1 text-center text-white"
                      />
                      <span className="text-slate-500">:</span>
                      <input
                        type="number"
                        min={0}
                        aria-label="Rounds Clã B"
                        value={draft.scoreB}
                        onChange={(e) =>
                          setScoreInputs((p) => ({
                            ...p,
                            [match.id]: { ...draft, scoreB: e.target.value },
                          }))
                        }
                        className="w-12 bg-[#0B1325] border border-slate-700 px-1.5 py-1 text-center text-white"
                      />
                      <span className="text-slate-500 ml-1">K:</span>
                      <input
                        type="number"
                        min={0}
                        aria-label="Abates Clã A"
                        value={draft.killsA}
                        onChange={(e) =>
                          setScoreInputs((p) => ({
                            ...p,
                            [match.id]: { ...draft, killsA: e.target.value },
                          }))
                        }
                        className="w-12 bg-[#0B1325] border border-slate-700 px-1.5 py-1 text-center text-slate-300"
                      />
                      <span className="text-slate-500">/</span>
                      <input
                        type="number"
                        min={0}
                        aria-label="Abates Clã B"
                        value={draft.killsB}
                        onChange={(e) =>
                          setScoreInputs((p) => ({
                            ...p,
                            [match.id]: { ...draft, killsB: e.target.value },
                          }))
                        }
                        className="w-12 bg-[#0B1325] border border-slate-700 px-1.5 py-1 text-center text-slate-300"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void runAction(`score_${match.id}`, async () => {
                          await adminRecordMatchResult(match.id, {
                            scoreA: Number(draft.scoreA) || 0,
                            scoreB: Number(draft.scoreB) || 0,
                            killsA: Number(draft.killsA) || 0,
                            killsB: Number(draft.killsB) || 0,
                            woClanRegId: null,
                          });
                          return `Placar oficial salvo para o confronto #${match.id}.`;
                        })
                      }
                      className="px-2.5 py-1.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-black text-[11px] uppercase cursor-pointer"
                    >
                      SALVAR PLACAR
                    </button>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void runAction(`woA_${match.id}`, async () => {
                          await adminRecordMatchResult(match.id, {
                            scoreA: 0,
                            scoreB: 1,
                            killsA: 0,
                            killsB: 0,
                            woClanRegId: match.clanARegId,
                          });
                          return `W.O. aplicado em ${match.clanATag}.`;
                        })
                      }
                      className="px-2 py-1.5 border border-rose-500/50 text-rose-300 hover:bg-rose-950/40 font-mono text-[10px] uppercase cursor-pointer"
                    >
                      W.O. {match.clanATag}
                    </button>

                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() =>
                        void runAction(`woB_${match.id}`, async () => {
                          await adminRecordMatchResult(match.id, {
                            scoreA: 1,
                            scoreB: 0,
                            killsA: 0,
                            killsB: 0,
                            woClanRegId: match.clanBRegId,
                          });
                          return `W.O. aplicado em ${match.clanBTag}.`;
                        })
                      }
                      className="px-2 py-1.5 border border-rose-500/50 text-rose-300 hover:bg-rose-950/40 font-mono text-[10px] uppercase cursor-pointer"
                    >
                      W.O. {match.clanBTag}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Immutable Audit Log Table */}
      <section className="border border-slate-800 bg-[#0B1325] p-4 space-y-2.5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            LOGS DE AUDITORIA IMUTÁVEIS ({auditLogs.length})
          </h3>
          <button
            type="button"
            onClick={() => void loadAuditLogs()}
            className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 uppercase cursor-pointer"
          >
            ATUALIZAR
          </button>
        </div>

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/60 font-mono text-[11px]">
          {auditLogs.map((log) => (
            <div key={log.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-slate-500">#{log.id}</span>
                <span className="text-cyan-300 font-bold">{log.actionType}</span>
                <span className="text-amber-300">[{log.actorRole}]</span>
                <span className="text-slate-300 truncate max-w-[340px]">{log.payloadJson}</span>
              </div>
              <span className="text-slate-500 tabular-nums shrink-0">
                {formatDateTimeBr(log.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
