import React, { useMemo, useState } from 'react';
import {
  ChampionshipLobbySnapshot,
  ChampionshipOverviewData,
  MatchRecord,
  substituteChampionshipStarter,
} from '../../services/championshipClient';
import { ClanEmblemIcon, ClanEmblemId } from '../ClanEmblemIcons';
import {
  formatArenaDisplayName,
  formatBrlFromCents,
  formatCountdownParts,
  formatDateTimeBr,
  formatTimeBr,
  getChampionshipStatusLabel,
  getMatchPhaseLabel,
  getMatchStatusMeta,
} from './championshipFormatters';

interface ChampionshipOverviewTabProps {
  data: ChampionshipOverviewData;
  serverNowMs: number;
  currentUid: string | null;
  activeLobby: ChampionshipLobbySnapshot | null;
  lobbyConnected: boolean;
  lobbyBusy: boolean;
  lobbyError: string | null;
  onEnterMatchLobby: (match: MatchRecord) => void;
  onLeaveMatchLobby: () => void;
  onToggleReady: (ready: boolean) => void;
  onUpdateLobbySnapshot: (lobby: ChampionshipLobbySnapshot) => void;
  onGoToRegistration: () => void;
  onLaunchPrivateRoom: (roomCode: string, arenaMode: string) => void;
}

export const ChampionshipOverviewTab: React.FC<ChampionshipOverviewTabProps> = ({
  data,
  serverNowMs,
  currentUid,
  activeLobby,
  lobbyConnected,
  lobbyBusy,
  lobbyError,
  onEnterMatchLobby,
  onLeaveMatchLobby,
  onToggleReady,
  onUpdateLobbySnapshot,
  onGoToRegistration,
  onLaunchPrivateRoom,
}) => {
  const { championship, myRegistration, nextMatch, confirmedCount, pendingCount } = data;
  const [subStarterOut, setSubStarterOut] = useState('');
  const [subReserveIn, setSubReserveIn] = useState('');
  const [subBusy, setSubBusy] = useState(false);
  const [subFeedback, setSubFeedback] = useState<string | null>(null);

  // Target countdown depends on tournament phase or next match
  const countdownTarget = useMemo(() => {
    if (nextMatch) {
      const opensMs = new Date(nextMatch.roomOpensAt).getTime();
      if (nextMatch.status === 'AGENDADO' && opensMs > serverNowMs) {
        return { label: 'ABERTURA DA SALA EM', iso: nextMatch.roomOpensAt };
      }
      if (nextMatch.status === 'SALA_ABERTA') {
        return { label: 'INÍCIO DA PARTIDA EM', iso: nextMatch.startsAt };
      }
      if (nextMatch.status === 'AO_VIVO') {
        return { label: 'CONFRONTO AO VIVO', iso: null };
      }
    }
    if (championship.status === 'ANUNCIADO') {
      return { label: 'ABERTURA DAS INSCRIÇÕES EM', iso: championship.registrationOpensAt };
    }
    if (championship.status === 'INSCRICOES_ABERTAS') {
      return { label: 'TRAVA DE ELENCO (ROSTER LOCK) EM', iso: championship.rosterLockAt };
    }
    if (championship.status === 'ROSTER_LOCK') {
      return { label: 'INÍCIO DA RODADA 1 EM', iso: championship.startsAt };
    }
    return { label: 'TEMPORADA ENCERRADA', iso: null };
  }, [championship, nextMatch, serverNowMs]);

  const countdown = formatCountdownParts(countdownTarget.iso, serverNowMs);

  const isUserInNextMatch = Boolean(
    nextMatch &&
      myRegistration &&
      (nextMatch.clanARegId === myRegistration.id || nextMatch.clanBRegId === myRegistration.id)
  );

  const nextMatchRoomIsOpen = Boolean(
    nextMatch &&
      (nextMatch.status === 'SALA_ABERTA' ||
        nextMatch.status === 'AO_VIVO' ||
        new Date(nextMatch.roomOpensAt).getTime() <= serverNowMs)
  );

  // Lobby derivations when inside the live private match lobby
  const myLobbyLineup = useMemo(() => {
    if (!activeLobby || !currentUid) return null;
    const inA = activeLobby.clanALineup.some((p) => p.playerUid === currentUid);
    if (inA) return { side: 'A' as const, lineup: activeLobby.clanALineup, regId: activeLobby.match.clanARegId };
    const inB = activeLobby.clanBLineup.some((p) => p.playerUid === currentUid);
    if (inB) return { side: 'B' as const, lineup: activeLobby.clanBLineup, regId: activeLobby.match.clanBRegId };
    return null;
  }, [activeLobby, currentUid]);

  const myLobbyEntry = useMemo(() => {
    if (!myLobbyLineup || !currentUid) return null;
    return myLobbyLineup.lineup.find((p) => p.playerUid === currentUid) || null;
  }, [myLobbyLineup, currentUid]);

  const isMyClanLeaderInLobby = Boolean(
    myRegistration &&
      currentUid &&
      myRegistration.leaderUid === currentUid &&
      myLobbyLineup &&
      myLobbyLineup.regId === myRegistration.id
  );

  const activeStartersForSub = useMemo(
    () => (myLobbyLineup ? myLobbyLineup.lineup.filter((p) => p.isActiveStarter) : []),
    [myLobbyLineup]
  );

  const availableReservesForSub = useMemo(
    () => (myLobbyLineup ? myLobbyLineup.lineup.filter((p) => !p.isActiveStarter) : []),
    [myLobbyLineup]
  );

  const handleConfirmSubstitution = async () => {
    if (!activeLobby || !subStarterOut || !subReserveIn) return;
    setSubBusy(true);
    setSubFeedback(null);
    try {
      const res = await substituteChampionshipStarter(
        activeLobby.match.id,
        subStarterOut,
        subReserveIn
      );
      onUpdateLobbySnapshot(res.lobby);
      setSubStarterOut('');
      setSubReserveIn('');
      setSubFeedback('Substituição registrada e auditada no servidor.');
    } catch (err) {
      setSubFeedback(err instanceof Error ? err.message : 'Erro ao substituir jogador.');
    } finally {
      setSubBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Champion Banner when Tournament Finished */}
      {championship.status === 'FINALIZADO' && championship.championClanName && (
        <div className="border border-amber-400/50 bg-[#0D162B] px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-400">
              CAMPEÃO OFICIAL · {championship.seasonLabel}
            </p>
            <h3 className="text-xl sm:text-2xl font-display font-black text-white tracking-wide mt-0.5">
              {championship.championClanName}
            </h3>
            <p className="text-xs text-slate-300 mt-1">
              Premiação total de{' '}
              <span className="font-mono font-bold text-amber-300">
                {formatBrlFromCents(championship.prizePoolCents)}
              </span>{' '}
              liberada para validação com o Líder campeão.
            </p>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
              PREMIAÇÃO OFICIAL
            </p>
            <p className="text-2xl font-mono font-black text-amber-400 tabular-nums">
              {formatBrlFromCents(championship.prizePoolCents)}
            </p>
          </div>
        </div>
      )}

      {/* LIVE PRIVATE MATCH LOBBY (when player enters an open match room) */}
      {activeLobby && (
        <section className="border border-cyan-500/50 bg-[#091224] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-cyan-300">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    lobbyConnected ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>
                  LOBBY PRIVADO · {getMatchPhaseLabel(activeLobby.match.phase, activeLobby.match.roundNumber)}
                </span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-300">
                  {formatArenaDisplayName(activeLobby.match.arenaMode)}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-display font-black text-white mt-1">
                [{activeLobby.match.clanATag}] {activeLobby.match.clanAName}{' '}
                <span className="text-cyan-400 mx-1">VS</span> [{activeLobby.match.clanBTag}]{' '}
                {activeLobby.match.clanBName}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {activeLobby.match.privateRoomCode && (
                <button
                  type="button"
                  onClick={() =>
                    onLaunchPrivateRoom(
                      activeLobby.match.privateRoomCode!,
                      activeLobby.match.arenaMode
                    )
                  }
                  className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
                >
                  ENTRAR NA ARENA ({activeLobby.match.privateRoomCode})
                </button>
              )}
              <button
                type="button"
                onClick={onLeaveMatchLobby}
                className="px-3 py-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-xs font-mono uppercase cursor-pointer"
              >
                SAIR DO LOBBY
              </button>
            </div>
          </div>

          {lobbyError && (
            <div className="border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {lobbyError}
            </div>
          )}

          {/* Ready Check Grid: Clan A vs Clan B */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                name: activeLobby.match.clanAName,
                tag: activeLobby.match.clanATag,
                emblem: activeLobby.match.clanAEmblemId,
                lineup: activeLobby.clanALineup,
                readyCount: activeLobby.clanAReadyCount,
                accent: 'text-cyan-300',
              },
              {
                name: activeLobby.match.clanBName,
                tag: activeLobby.match.clanBTag,
                emblem: activeLobby.match.clanBEmblemId,
                lineup: activeLobby.clanBLineup,
                readyCount: activeLobby.clanBReadyCount,
                accent: 'text-amber-300',
              },
            ].map((side) => (
              <div
                key={side.tag + side.name}
                className="border border-slate-800 bg-[#0D162B] p-3 space-y-2.5"
              >
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ClanEmblemIcon
                      emblemId={side.emblem as ClanEmblemId}
                      className="w-7 h-7 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-display font-bold text-white truncate">
                        [{side.tag}] {side.name}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold tabular-nums ${
                      side.readyCount >= 5 ? 'text-emerald-400' : side.accent
                    }`}
                  >
                    PRONTOS {side.readyCount}/5
                  </span>
                </div>

                <div className="divide-y divide-slate-800/70">
                  {side.lineup.map((player) => {
                    const isOnline = activeLobby.connectedUids.includes(player.playerUid);
                    return (
                      <div
                        key={player.playerUid}
                        className="py-1.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isOnline ? 'bg-cyan-400' : 'bg-slate-600'
                            }`}
                          />
                          <span className="text-slate-100 font-medium truncate">
                            {player.playerCallsign}
                          </span>
                          <span className="text-[10px] font-mono uppercase text-slate-400">
                            {player.isActiveStarter ? 'TITULAR' : 'RESERVA'}
                          </span>
                        </div>
                        <span
                          className={`font-mono text-[11px] font-bold uppercase ${
                            !player.isActiveStarter
                              ? 'text-slate-500'
                              : player.isReady
                                ? 'text-emerald-400'
                                : 'text-amber-300'
                          }`}
                        >
                          {!player.isActiveStarter
                            ? 'BANCO'
                            : player.isReady
                              ? 'PRONTO'
                              : 'AGUARDANDO'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Ready Action + Leader Substitution */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1 border-t border-slate-800">
            <div className="text-xs text-slate-300 space-y-0.5">
              <p>
                Início oficial:{' '}
                <span className="font-mono text-white">
                  {formatTimeBr(activeLobby.match.startsAt)}
                </span>{' '}
                · Tolerância W.O.:{' '}
                <span className="font-mono text-rose-300">
                  {formatTimeBr(activeLobby.match.woDeadlineAt)}
                </span>
              </p>
              <p className="text-[11px] text-slate-400">
                Quando os dois clãs atingirem 5/5 titulares prontos, a sala 5v5 privada abre automaticamente.
              </p>
            </div>

            {myLobbyEntry?.isActiveStarter && (
              <button
                type="button"
                onClick={() => onToggleReady(!myLobbyEntry.isReady)}
                className={`px-5 py-2.5 font-display font-black text-xs uppercase tracking-wider cursor-pointer transition-colors ${
                  myLobbyEntry.isReady
                    ? 'bg-slate-800 border border-slate-600 text-slate-200 hover:bg-slate-700'
                    : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950'
                }`}
              >
                {myLobbyEntry.isReady ? 'CANCELAR PRONTO' : 'CONFIRMAR PRONTO'}
              </button>
            )}
          </div>

          {/* Leader Substitution Panel (visible up to -5 min before startsAt) */}
          {isMyClanLeaderInLobby && availableReservesForSub.length > 0 && (
            <div className="border border-amber-500/30 bg-[#0D162B] p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                  SUBSTITUIÇÃO DE EMERGÊNCIA (LÍDER · ATÉ 5 MIN ANTES DO INÍCIO)
                </p>
                <span className="text-[11px] font-mono text-slate-400">
                  {activeLobby.canSubstituteNow && serverNowMs < activeLobby.substitutionCutoffMs
                    ? `Limite: ${formatTimeBr(new Date(activeLobby.substitutionCutoffMs).toISOString())}`
                    : 'JANELA ENCERRADA'}
                </span>
              </div>

              {activeLobby.canSubstituteNow && serverNowMs < activeLobby.substitutionCutoffMs && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={subStarterOut}
                    onChange={(e) => setSubStarterOut(e.target.value)}
                    className="bg-[#060B17] border border-slate-700 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="">Sai (Titular)...</option>
                    {activeStartersForSub.map((p) => (
                      <option key={p.playerUid} value={p.playerUid}>
                        {p.playerCallsign}
                      </option>
                    ))}
                  </select>
                  <select
                    value={subReserveIn}
                    onChange={(e) => setSubReserveIn(e.target.value)}
                    className="bg-[#060B17] border border-slate-700 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="">Entra (Reserva)...</option>
                    {availableReservesForSub.map((p) => (
                      <option key={p.playerUid} value={p.playerUid}>
                        {p.playerCallsign}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={subBusy || !subStarterOut || !subReserveIn}
                    onClick={() => void handleConfirmSubstitution()}
                    className="px-3 py-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
                  >
                    {subBusy ? 'TROCANDO...' : 'APLICAR TROCA'}
                  </button>
                </div>
              )}

              {subFeedback && <p className="text-xs text-cyan-300">{subFeedback}</p>}
            </div>
          )}
        </section>
      )}

      {/* MAIN HERO: NEXT MATCH / COUNTDOWN CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 border border-slate-800 bg-[#0B1325] p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-400">
                {championship.seasonLabel} · {getChampionshipStatusLabel(championship.status)}
              </p>
              <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight mt-1">
                {championship.title}
              </h2>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                {countdownTarget.label}
              </p>
              <p className="text-2xl sm:text-3xl font-mono font-black text-cyan-300 tabular-nums mt-0.5">
                {countdownTarget.iso ? countdown.label : 'AO VIVO'}
              </p>
            </div>
          </div>

          {nextMatch ? (
            <div className="border border-slate-800 bg-[#070D1C] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                <span>
                  {getMatchPhaseLabel(nextMatch.phase, nextMatch.roundNumber)} ·{' '}
                  {formatArenaDisplayName(nextMatch.arenaMode)}
                </span>
                <span className={getMatchStatusMeta(nextMatch.status).textClass}>
                  {getMatchStatusMeta(nextMatch.status).label}
                </span>
              </div>

              <div className="grid grid-cols-3 items-center gap-2 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ClanEmblemIcon
                    emblemId={nextMatch.clanAEmblemId as ClanEmblemId}
                    className="w-9 h-9 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-cyan-400">[{nextMatch.clanATag}]</p>
                    <p className="text-sm sm:text-base font-display font-bold text-white truncate">
                      {nextMatch.clanAName}
                    </p>
                  </div>
                </div>

                <div className="text-center">
                  <span className="font-mono text-lg sm:text-xl font-black text-slate-400">
                    VS
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2.5 min-w-0 text-right">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-amber-400">[{nextMatch.clanBTag}]</p>
                    <p className="text-sm sm:text-base font-display font-bold text-white truncate">
                      {nextMatch.clanBName}
                    </p>
                  </div>
                  <ClanEmblemIcon
                    emblemId={nextMatch.clanBEmblemId as ClanEmblemId}
                    className="w-9 h-9 shrink-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <p className="text-[10px] font-mono uppercase text-slate-500">ABERTURA DA SALA</p>
                  <p className="font-mono font-semibold text-slate-200 tabular-nums">
                    {formatDateTimeBr(nextMatch.roomOpensAt)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase text-slate-500">INÍCIO DA PARTIDA</p>
                  <p className="font-mono font-semibold text-white tabular-nums">
                    {formatDateTimeBr(nextMatch.startsAt)}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1 flex sm:justify-end items-center">
                  <button
                    type="button"
                    disabled={!nextMatchRoomIsOpen || !isUserInNextMatch || lobbyBusy}
                    onClick={() => onEnterMatchLobby(nextMatch)}
                    className={`w-full sm:w-auto px-4 py-2 font-display font-black text-xs uppercase tracking-wider transition-colors ${
                      nextMatchRoomIsOpen && isUserInNextMatch
                        ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 cursor-pointer'
                        : 'bg-slate-800/90 text-slate-400 border border-slate-700 cursor-not-allowed'
                    }`}
                  >
                    {lobbyBusy
                      ? 'VALIDANDO TOKEN...'
                      : !nextMatchRoomIsOpen
                        ? 'AGUARDANDO SALA'
                        : isUserInNextMatch
                          ? 'ENTRAR NO LOBBY'
                          : 'RESTRITO AOS CLÃS'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-slate-800 bg-[#070D1C] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-display font-bold text-white uppercase">
                  {championship.status === 'INSCRICOES_ABERTAS'
                    ? 'INSCRIÇÕES ABERTAS PARA CLÃS OFICIAIS'
                    : championship.status === 'ANUNCIADO'
                      ? 'TEMPORADA ANUNCIADA · PREPARE SEU ELENCO'
                      : 'AGUARDANDO DEFINIÇÃO DA PRÓXIMA RODADA'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  A tabela Round-Robin será gerada automaticamente no Roster Lock em{' '}
                  <span className="font-mono text-slate-200">
                    {formatDateTimeBr(championship.rosterLockAt)}
                  </span>
                  .
                </p>
              </div>
              {championship.status === 'INSCRICOES_ABERTAS' && (
                <button
                  type="button"
                  onClick={onGoToRegistration}
                  className="px-4 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider shrink-0 cursor-pointer"
                >
                  {myRegistration ? 'VER MINHA INSCRIÇÃO' : 'INSCREVER MEU CLÃ'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* KEY TOURNAMENT METRICS COLUMN */}
        <div className="lg:col-span-4 border border-slate-800 bg-[#0B1325] p-4 flex flex-col justify-between gap-3">
          <div className="space-y-3">
            <div className="border-b border-slate-800 pb-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                PREMIAÇÃO TOTAL
              </p>
              <p className="text-2xl font-mono font-black text-amber-400 tabular-nums mt-0.5">
                {formatBrlFromCents(championship.prizePoolCents)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 border-b border-slate-800 pb-2.5">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  TAXA / CLÃ
                </p>
                <p className="text-base font-mono font-bold text-white tabular-nums mt-0.5">
                  {formatBrlFromCents(championship.entryFeeCents)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  VAGAS CONFIRMADAS
                </p>
                <p className="text-base font-mono font-bold text-cyan-300 tabular-nums mt-0.5">
                  {confirmedCount} / {championship.maxClans}
                </p>
                {pendingCount > 0 && (
                  <p className="text-[10px] text-amber-300 font-mono">
                    +{pendingCount} aguardando pagamento
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500">ROSTER LOCK</p>
                <p className="font-mono text-slate-200 tabular-nums">
                  {formatDateTimeBr(championship.rosterLockAt)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase text-slate-500">PLAYOFFS</p>
                <p className="font-mono text-slate-200">TOP {championship.playoffSize} MATA-MATA</p>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            {championship.rulesSummary}
          </div>
        </div>
      </div>

      {/* SCORING & FORMAT SUMMARY BAR */}
      <div className="border border-slate-800 bg-[#0B1325] px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-[10px] font-mono uppercase text-slate-500">FASE 1 · PONTOS CORRIDOS</p>
          <p className="text-slate-200 font-semibold mt-0.5">Todos contra todos (Round-Robin)</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase text-slate-500">PONTUAÇÃO OFICIAL</p>
          <p className="font-mono text-slate-200 mt-0.5">V +3 · E +1 · D 0 · W.O. -1</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase text-slate-500">SALA & READY CHECK</p>
          <p className="text-slate-200 mt-0.5">Abre 30 min antes · W.O. após +5 min</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase text-slate-500">ELENCO TRAVADO</p>
          <p className="text-slate-200 mt-0.5">5 Titulares + até 2 Reservas</p>
        </div>
      </div>
    </div>
  );
};
