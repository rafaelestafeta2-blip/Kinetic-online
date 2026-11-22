import React, { useEffect, useMemo, useState } from 'react';
import {
  ClanDocument,
  getClanServiceState,
  subscribeClanService,
} from '../../firebase/clanService';
import {
  ChampionshipOverviewData,
  createChampionshipCheckout,
  registerClanInChampionship,
} from '../../services/championshipClient';
import { ClanEmblemIcon, ClanEmblemId } from '../ClanEmblemIcons';
import {
  formatBrlFromCents,
  formatDateTimeBr,
  getRegistrationStatusLabel,
} from './championshipFormatters';

interface ChampionshipRegistrationTabProps {
  data: ChampionshipOverviewData;
  currentUid: string | null;
  onRefresh: () => Promise<void>;
  onOpenClanCenter?: () => void;
}

export const ChampionshipRegistrationTab: React.FC<ChampionshipRegistrationTabProps> = ({
  data,
  currentUid,
  onRefresh,
  onOpenClanCenter,
}) => {
  const { championship, myRegistration, stripeConfigured } = data;
  const [myClan, setMyClan] = useState<ClanDocument | null>(() => getClanServiceState().myClan);
  const [slotByUid, setSlotByUid] = useState<Record<string, 'NONE' | 'TITULAR' | 'RESERVA'>>({});
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    return subscribeClanService((state) => {
      setMyClan(state.myClan);
    });
  }, []);

  // Pre-populate selection from existing registration when loaded
  useEffect(() => {
    if (!myRegistration) return;
    const next: Record<string, 'NONE' | 'TITULAR' | 'RESERVA'> = {};
    for (const member of myRegistration.roster) {
      next[member.playerUid] = member.slotRole;
    }
    setSlotByUid(next);
  }, [myRegistration]);

  const clanMembersList = useMemo(() => {
    if (!myClan?.members) return [];
    return Object.values(myClan.members).sort((a, b) => {
      if (a.uid === myClan.ownerUid) return -1;
      if (b.uid === myClan.ownerUid) return 1;
      return (b.mmr || 0) - (a.mmr || 0);
    });
  }, [myClan]);

  const isLeader = Boolean(myClan && currentUid && myClan.ownerUid === currentUid);

  const selectedStarters = useMemo(
    () => Object.entries(slotByUid).filter(([, role]) => role === 'TITULAR').map(([uid]) => uid),
    [slotByUid]
  );
  const selectedReserves = useMemo(
    () => Object.entries(slotByUid).filter(([, role]) => role === 'RESERVA').map(([uid]) => uid),
    [slotByUid]
  );

  const canEditRoster =
    isLeader &&
    championship.status === 'INSCRICOES_ABERTAS' &&
    !myRegistration?.rosterLocked;

  const setMemberRole = (uid: string, role: 'NONE' | 'TITULAR' | 'RESERVA') => {
    if (!canEditRoster) return;
    setFeedback(null);
    setSlotByUid((prev) => {
      const current = prev[uid] || 'NONE';
      if (current === role) {
        return { ...prev, [uid]: 'NONE' };
      }
      if (role === 'TITULAR') {
        const currentStarters = Object.values(prev).filter((r) => r === 'TITULAR').length;
        if (currentStarters >= 5) {
          setFeedback({
            type: 'err',
            text: 'Você já selecionou os 5 titulares. Remova um titular antes de trocar.',
          });
          return prev;
        }
      }
      if (role === 'RESERVA') {
        const currentReserves = Object.values(prev).filter((r) => r === 'RESERVA').length;
        if (currentReserves >= 2) {
          setFeedback({
            type: 'err',
            text: 'Limite máximo de 2 jogadores reservas por clã.',
          });
          return prev;
        }
      }
      return { ...prev, [uid]: role };
    });
  };

  const handleSaveRegistration = async () => {
    if (!myClan || !isLeader) return;
    if (selectedStarters.length !== 5) {
      setFeedback({
        type: 'err',
        text: `Selecione exatamente 5 titulares (atual: ${selectedStarters.length}/5).`,
      });
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      await registerClanInChampionship(championship.id, {
        clanId: myClan.clanId,
        starterUids: selectedStarters,
        reserveUids: selectedReserves,
      });
      await onRefresh();
      setFeedback({
        type: 'ok',
        text:
          championship.entryFeeCents > 0
            ? 'Elenco validado no servidor! Finalize o pagamento da taxa para confirmar a vaga.'
            : 'Clã inscrito e confirmado oficialmente no campeonato!',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao registrar clã.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStartStripeCheckout = async () => {
    setPaying(true);
    setFeedback(null);
    try {
      const res = await createChampionshipCheckout(championship.id);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Não foi possível iniciar o checkout Stripe.',
      });
    } finally {
      setPaying(false);
    }
  };

  if (!currentUid) {
    return (
      <div className="border border-slate-800 bg-[#0B1325] p-6 text-center space-y-2">
        <p className="text-sm font-display font-bold text-white uppercase">
          AUTENTICAÇÃO NECESSÁRIA
        </p>
        <p className="text-xs text-slate-400">
          Faça login com sua Conta Google para consultar seu elenco ou inscrever seu clã no campeonato.
        </p>
      </div>
    );
  }

  if (!myClan && !myRegistration) {
    return (
      <div className="border border-slate-800 bg-[#0B1325] p-6 text-center space-y-3">
        <p className="text-sm font-display font-bold text-white uppercase">
          VOCÊ AINDA NÃO PERTENCE A UM CLÃ
        </p>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Crie ou entre em um Clã Tático com pelo menos 5 membros. Apenas o Líder do clã pode
          realizar a inscrição oficial e selecionar os 5 titulares + até 2 reservas.
        </p>
        {onOpenClanCenter && (
          <button
            type="button"
            onClick={onOpenClanCenter}
            className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
          >
            ABRIR CENTRAL DE CLÃS
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Clan Status Banner */}
      <div className="border border-slate-800 bg-[#0B1325] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ClanEmblemIcon
            emblemId={(myClan?.emblemId || myRegistration?.clanEmblemId || 'alpha_wolf') as ClanEmblemId}
            className="w-11 h-11 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
              {isLeader ? 'SEU CLÃ · CARGO: LÍDER' : 'SEU CLÃ · CARGO: MEMBRO'}
            </p>
            <h3 className="text-base sm:text-lg font-display font-black text-white truncate">
              [{myClan?.tag || myRegistration?.clanTag}] {myClan?.name || myRegistration?.clanName}
            </h3>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-[10px] font-mono uppercase text-slate-400">STATUS DA INSCRIÇÃO</p>
          <p
            className={`text-sm font-mono font-black ${
              myRegistration?.status === 'CONFIRMADO'
                ? 'text-emerald-400'
                : myRegistration?.status === 'PENDENTE_PAGAMENTO'
                  ? 'text-amber-300'
                  : 'text-slate-300'
            }`}
          >
            {myRegistration
              ? getRegistrationStatusLabel(myRegistration.status)
              : 'NÃO INSCRITO'}
          </p>
          {myRegistration?.rosterLocked && (
            <p className="text-[10px] font-mono text-amber-400 uppercase mt-0.5">
              ELENCO TRAVADO (ROSTER LOCK ATIVO)
            </p>
          )}
        </div>
      </div>

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

      {/* Payment Box when Registration is Pending */}
      {myRegistration && myRegistration.status === 'PENDENTE_PAGAMENTO' && (
        <div className="border border-amber-500/50 bg-[#10182C] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-mono font-bold uppercase text-amber-300">
              TAXA DE INSCRIÇÃO PENDENTE · {formatBrlFromCents(championship.entryFeeCents)}
            </p>
            <p className="text-xs text-slate-300 mt-1">
              A vaga do clã só muda para <strong className="text-white">CONFIRMADO</strong> após a
              validação criptográfica do pagamento via webhook do servidor.
            </p>
            {!stripeConfigured && (
              <p className="text-[11px] font-mono text-amber-400/90 mt-1">
                Stripe não configurado neste ambiente — o organizador pode confirmar o pagamento no
                Painel Admin após o comprovante.
              </p>
            )}
          </div>

          {isLeader && (
            <button
              type="button"
              disabled={paying || !stripeConfigured}
              onClick={() => void handleStartStripeCheckout()}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-display font-black text-xs uppercase tracking-wider shrink-0 cursor-pointer"
            >
              {paying
                ? 'ABRINDO CHECKOUT...'
                : `PAGAR TAXA (${formatBrlFromCents(championship.entryFeeCents)})`}
            </button>
          )}
        </div>
      )}

      {/* Roster Selector (Leader) or Read-Only Roster (Members / Locked) */}
      <div className="border border-slate-800 bg-[#0B1325] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              ELENCO OFICIAL DO CAMPEONATO (5 TITULARES + ATÉ 2 RESERVAS)
            </h4>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {canEditRoster
                ? `Selecione os membros reais do clã antes do Roster Lock (${formatDateTimeBr(
                    championship.rosterLockAt
                  )}).`
                : !isLeader
                  ? 'Apenas o Líder do clã pode escalar ou alterar o elenco inscrito.'
                  : 'Elenco bloqueado para alterações nesta fase do torneio.'}
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
            <span
              className={selectedStarters.length === 5 ? 'text-emerald-400 font-bold' : 'text-cyan-300'}
            >
              TITULARES: {selectedStarters.length}/5
            </span>
            <span className="text-amber-300">RESERVAS: {selectedReserves.length}/2</span>
          </div>
        </div>

        {canEditRoster ? (
          <>
            {clanMembersList.length < 5 && (
              <div className="border border-amber-500/40 bg-amber-950/25 px-3 py-2 text-xs text-amber-200">
                Seu clã possui atualmente <strong>{clanMembersList.length}</strong> membro(s). Recrute
                pelo menos <strong>5 membros</strong> na Central de Clãs para completar os titulares.
              </div>
            )}

            <div className="divide-y divide-slate-800/70">
              {clanMembersList.map((member) => {
                const role = slotByUid[member.uid] || 'NONE';
                return (
                  <div
                    key={member.uid}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-display font-bold text-white truncate">
                        {member.callsign}
                        {member.uid === myClan?.ownerUid && (
                          <span className="ml-2 text-[10px] font-mono text-amber-400">LÍDER</span>
                        )}
                      </p>
                      <p className="text-[11px] font-mono text-slate-400 tabular-nums">
                        NV {member.rankLevel || 1} · MMR {member.mmr || 2450}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setMemberRole(member.uid, 'TITULAR')}
                        className={`px-3 py-1.5 text-[11px] font-mono uppercase cursor-pointer border ${
                          role === 'TITULAR'
                            ? 'bg-cyan-400 text-slate-950 border-cyan-300 font-bold'
                            : 'bg-[#070D1C] text-slate-300 border-slate-700 hover:border-cyan-400/50'
                        }`}
                      >
                        TITULAR
                      </button>
                      <button
                        type="button"
                        onClick={() => setMemberRole(member.uid, 'RESERVA')}
                        className={`px-3 py-1.5 text-[11px] font-mono uppercase cursor-pointer border ${
                          role === 'RESERVA'
                            ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                            : 'bg-[#070D1C] text-slate-300 border-slate-700 hover:border-amber-400/50'
                        }`}
                      >
                        RESERVA
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400">
                Após o Roster Lock, jogadores inscritos não poderão sair do clã ou atuar por outro time.
              </p>
              <button
                type="button"
                disabled={saving || selectedStarters.length !== 5}
                onClick={() => void handleSaveRegistration()}
                className="px-5 py-2.5 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 font-display font-black text-xs uppercase tracking-wider cursor-pointer"
              >
                {saving
                  ? 'VALIDANDO NO SERVIDOR...'
                  : myRegistration
                    ? 'ATUALIZAR ELENCO'
                    : 'INSCREVER CLÃ NO CAMPEONATO'}
              </button>
            </div>
          </>
        ) : myRegistration ? (
          <div className="divide-y divide-slate-800/70">
            {myRegistration.roster.map((member) => (
              <div
                key={member.playerUid}
                className="py-2 flex items-center justify-between text-xs"
              >
                <span className="font-display font-bold text-white">{member.playerCallsign}</span>
                <span
                  className={`font-mono text-[11px] font-bold ${
                    member.slotRole === 'TITULAR' ? 'text-cyan-300' : 'text-amber-300'
                  }`}
                >
                  {member.slotRole}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 py-2">
            Aguarde o Líder do seu clã ({myClan?.ownerCallsign}) realizar a inscrição durante o
            período aberto.
          </p>
        )}
      </div>
    </div>
  );
};
