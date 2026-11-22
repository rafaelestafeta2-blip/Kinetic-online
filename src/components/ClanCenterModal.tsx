import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  addMemberToClanByOwner,
  CLAN_DAILY_MISSIONS,
  CLAN_STORE_OFFERS,
  claimClanDailyMissionReward,
  ClanServiceState,
  computeClanLevelFromXp,
  createNewClan,
  getClanServiceState,
  joinExistingClanById,
  leaveOrDisbandClan,
  MAX_CLAN_MEMBERS,
  redeemClanStoreOffer,
  refreshClanLeaderboard,
  removeMemberFromClan,
  subscribeClanService,
  updateClanBranding,
} from '../firebase/clanService';
import {
  SocialInboxState,
  subscribeSocialInbox,
} from '../firebase/friendsSocialService';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import { getLocalEffectiveUid } from '../multiplayer/onlineRoomService';
import {
  CLAN_EMBLEM_CATALOG,
  ClanEmblemIcon,
  ClanEmblemId,
} from './ClanEmblemIcons';
import { WarfaceRankIcon } from './WarfaceRankIcon';

export type ClanCenterTab =
  | 'OVERVIEW'
  | 'MISSIONS'
  | 'RANK'
  | 'MEMBERS'
  | 'STORE';

interface ClanCenterModalProps {
  isOpen: boolean;
  initialTab?: ClanCenterTab;
  onClose: () => void;
}

export const ClanCenterModal: React.FC<ClanCenterModalProps> = ({
  isOpen,
  initialTab = 'OVERVIEW',
  onClose,
}) => {
  const [clanState, setClanState] = useState<ClanServiceState>(() =>
    getClanServiceState()
  );
  const [activeTab, setActiveTab] = useState<ClanCenterTab>(initialTab);
  const [inbox, setInbox] = useState<SocialInboxState>({
    uid: '',
    friends: {},
    requests: {},
    invites: {},
    updatedAtMs: 0,
  });

  // Create clan form state
  const [clanNameInput, setClanNameInput] = useState('');
  const [clanTagInput, setClanTagInput] = useState('');
  const [clanMottoInput, setClanMottoInput] = useState(
    'Honra, Tática e Supremacia Competitiva 5v5.'
  );
  const [selectedEmblem, setSelectedEmblem] =
    useState<ClanEmblemId>('alpha_wolf');
  const [joinClanIdInput, setJoinClanIdInput] = useState('');
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    const unsubClan = subscribeClanService((next) => setClanState(next));
    const unsubSocial = subscribeSocialInbox((next) => setInbox(next));
    void refreshClanLeaderboard();
    return () => {
      unsubClan();
      unsubSocial();
    };
  }, []);

  if (!isOpen) return null;

  const myClan = clanState.myClan;
  const localUid = getLocalEffectiveUid();
  const profile = getCloudSyncState().profile;
  const isOwner = Boolean(
    myClan &&
      (myClan.ownerUid === localUid ||
        myClan.ownerCallsign === profile.callsign)
  );
  const friendsList = Object.values(inbox.friends || {});

  const handleCreateClan = async (e: React.FormEvent) => {
    e.preventDefault();
    soundEngine.playMenuSelect();
    setBusy(true);
    setFeedback(null);
    const res = await createNewClan({
      name: clanNameInput,
      tag: clanTagInput || clanNameInput.slice(0, 4),
      emblemId: selectedEmblem,
      motto: clanMottoInput,
    });
    setBusy(false);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: `Clã "${clanNameInput.trim()}" fundado com sucesso! Você é o Líder.`,
      });
      setClanNameInput('');
      setClanTagInput('');
      setActiveTab('OVERVIEW');
    } else {
      setFeedback({
        type: 'err',
        text: res.error || 'Erro ao criar o clã.',
      });
    }
  };

  const handleJoinClan = async (targetId: string) => {
    soundEngine.playMenuSelect();
    setBusy(true);
    setFeedback(null);
    const res = await joinExistingClanById(targetId);
    setBusy(false);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: 'Você entrou no clã com sucesso!',
      });
      setJoinClanIdInput('');
      setActiveTab('OVERVIEW');
    } else {
      setFeedback({
        type: 'err',
        text: res.error || 'Não foi possível entrar no clã.',
      });
    }
  };

  const handleInviteFriendToClan = async (friend: {
    uid: string;
    callsign: string;
    rankLevel: number;
    avatarDataUrl?: string;
  }) => {
    soundEngine.playMenuSelect();
    setFeedback(null);
    const res = await addMemberToClanByOwner(friend);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: `${friend.callsign} agora faz parte do clã!`,
      });
    } else {
      setFeedback({
        type: 'err',
        text: res.error || 'Não foi possível recrutar o operador.',
      });
    }
  };

  const handleKickMember = async (targetUid: string, callsign: string) => {
    soundEngine.playMenuSelect();
    setFeedback(null);
    const res = await removeMemberFromClan(targetUid);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: `${callsign} foi removido do clã pelo Líder.`,
      });
    } else {
      setFeedback({
        type: 'err',
        text: res.error || 'Erro ao remover membro.',
      });
    }
  };

  const handleClaimMission = async (missionId: string) => {
    soundEngine.playMenuSelect();
    setFeedback(null);
    const res = await claimClanDailyMissionReward(missionId);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: 'Recompensa de Missão Diária do Clã recebida! (+XP do Clã, +Cash e +Moedas do Clã)',
      });
    } else {
      setFeedback({
        type: 'err',
        text: res.error || 'Ainda não concluída.',
      });
    }
  };

  const handleBuyClanStoreItem = (offerId: string) => {
    soundEngine.playMenuSelect();
    setFeedback(null);
    const res = redeemClanStoreOffer(offerId);
    if (res.ok) {
      setFeedback({
        type: 'ok',
        text: 'Item resgatado na Loja do Clã e adicionado à sua conta!',
      });
    } else {
      setFeedback({
        type: 'err',
        text: res.error || 'Não foi possível resgatar.',
      });
    }
  };

  const clanProgress = computeClanLevelFromXp(myClan?.clanXp || 0);
  const membersArray = myClan ? Object.values(myClan.members || {}) : [];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none pointer-events-auto font-sans"
    >
      <div className="w-full max-w-[1040px] h-[92dvh] max-h-[650px] rounded-2xl border border-red-500/50 bg-gradient-to-b from-[#13090d] via-[#0c0e16] to-[#07090f] text-white shadow-[0_24px_80px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col">
        {/* TOP HEADER */}
        <header className="px-4 py-2.5 bg-gradient-to-r from-[#240a10] via-[#131722] to-[#1b120c] border-b border-red-500/35 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <ClanEmblemIcon
              emblemId={myClan?.emblemId || selectedEmblem}
              className="w-9 h-9 sm:w-11 sm:h-11"
              showGlow
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-base sm:text-xl tracking-wider uppercase text-white truncate">
                  {myClan
                    ? `${myClan.name} [${myClan.tag}]`
                    : 'QUARTEL-GENERAL DE CLÃS'}
                </h2>
                {myClan && (
                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-400/50 font-mono font-black text-[10px] text-red-300 uppercase shrink-0">
                    CLÃ NÍVEL {clanProgress.level}
                  </span>
                )}
                {isOwner && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/60 font-mono font-black text-[10px] text-amber-300 uppercase shrink-0">
                    ♛ DONO DO CLÃ
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-xs font-mono text-slate-300 truncate">
                {myClan
                  ? `${myClan.motto} · ${membersArray.length}/${MAX_CLAN_MEMBERS} Operadores`
                  : 'Crie um Clã com nome único e brasão de elite (Máx. 7 Operadores por Clã)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="px-2.5 py-1 rounded-lg bg-black/60 border border-amber-400/45 flex items-center gap-1.5 font-mono">
              <span className="text-amber-400 text-xs">🛡️</span>
              <span className="text-xs font-black text-amber-300">
                {clanState.clanTokens}
              </span>
              <span className="text-[9px] text-slate-400 uppercase hidden sm:inline">
                MOEDAS DO CLÃ
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                onClose();
              }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-red-500/30 border border-white/20 hover:border-red-400 text-white font-bold text-sm flex items-center justify-center cursor-pointer transition-all"
            >
              ✕
            </button>
          </div>
        </header>

        {/* NAVIGATION TABS WHEN CLAN EXISTS */}
        {myClan && (
          <div className="grid grid-cols-5 border-b border-white/10 bg-[#0d111a] shrink-0">
            {(
              [
                { id: 'OVERVIEW', label: '🛡️ VISÃO GERAL' },
                { id: 'MISSIONS', label: '🏆 DESAFIOS DIÁRIOS' },
                { id: 'RANK', label: '📊 RANK DO CLÃ' },
                {
                  id: 'MEMBERS',
                  label: `👥 MEMBROS (${membersArray.length}/${MAX_CLAN_MEMBERS})`,
                },
                { id: 'STORE', label: '🛒 LOJA DO CLÃ' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setActiveTab(t.id);
                  setFeedback(null);
                }}
                className={`py-2.5 px-1 text-[10px] sm:text-xs font-display font-black uppercase tracking-wider border-b-2 cursor-pointer transition-all truncate ${
                  activeTab === t.id
                    ? 'border-red-500 text-white bg-gradient-to-t from-red-500/20 to-transparent'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* FEEDBACK BANNER */}
        {feedback && (
          <div
            className={`px-4 py-2 text-xs font-mono flex items-center justify-between shrink-0 border-b ${
              feedback.type === 'ok'
                ? 'bg-emerald-950/70 border-emerald-400/50 text-emerald-200'
                : 'bg-red-950/70 border-red-500/50 text-red-200'
            }`}
          >
            <span>{feedback.text}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-white/70 hover:text-white ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* BODY CONTENT */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          {!myClan ? (
            /* ==================== CREATE OR JOIN CLAN VIEW ==================== */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
              {/* LEFT: CREATE NEW CLAN WITH UNIQUE NAME & PRE-CONFIGURED EMBLEMS */}
              <form
                onSubmit={(e) => void handleCreateClan(e)}
                className="lg:col-span-7 rounded-2xl border border-red-500/40 bg-[#0e121b]/95 p-4 flex flex-col justify-between gap-3 shadow-xl"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div>
                      <h3 className="font-display font-black text-sm sm:text-base text-white uppercase tracking-wider">
                        FUNDAR NOVO CLÃ DE ELITE
                      </h3>
                      <p className="text-[10px] font-mono text-slate-400">
                        Nomes de clãs são únicos no servidor · Capacidade máxima de{' '}
                        {MAX_CLAN_MEMBERS} operadores.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-b from-red-950/80 to-black border border-red-500/45">
                      <ClanEmblemIcon
                        emblemId={selectedEmblem}
                        className="w-10 h-10"
                        showGlow
                      />
                      <div>
                        <div className="font-display font-black text-xs text-white uppercase">
                          {clanNameInput.trim() || 'SEU CLÃ'}
                        </div>
                        <div className="text-[9px] font-mono text-amber-300">
                          [{clanTagInput.trim() || 'TAG'}] · NV. 1
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-mono font-bold text-slate-300 uppercase mb-1">
                        NOME ÚNICO DO CLÃ (3 A 18 CARACTERES)
                      </label>
                      <input
                        type="text"
                        required
                        minLength={3}
                        maxLength={18}
                        value={clanNameInput}
                        onChange={(e) => setClanNameInput(e.target.value)}
                        placeholder="Ex: Tropa de Elite"
                        className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/20 focus:border-red-400 focus:outline-none text-sm font-display font-bold text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono font-bold text-slate-300 uppercase mb-1">
                        TAG (2 A 4 LETRAS)
                      </label>
                      <input
                        type="text"
                        maxLength={4}
                        value={clanTagInput}
                        onChange={(e) =>
                          setClanTagInput(
                            e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9]/g, '')
                              .slice(0, 4)
                          )
                        }
                        placeholder="TAG"
                        className="w-full px-3 py-2 rounded-xl bg-black/70 border border-white/20 focus:border-amber-400 focus:outline-none text-sm font-mono font-black text-amber-300 uppercase text-center tracking-widest"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-slate-300 uppercase mb-1">
                      LEMA DO CLÃ
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={clanMottoInput}
                      onChange={(e) => setClanMottoInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-black/70 border border-white/15 focus:border-red-400 focus:outline-none text-xs text-slate-200"
                    />
                  </div>

                  {/* PRE-CONFIGURED PREMIUM CLAN EMBLEMS SELECTOR */}
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-amber-300 uppercase mb-1.5">
                      SELECIONE O BRASÃO PREMIUM DO CLÃ (10 ÍCONES PRÉ-CONFIGURADOS)
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {CLAN_EMBLEM_CATALOG.map((emblem) => {
                        const active = selectedEmblem === emblem.id;
                        return (
                          <button
                            key={emblem.id}
                            type="button"
                            onClick={() => {
                              soundEngine.playMenuSelect();
                              setSelectedEmblem(emblem.id);
                            }}
                            className={`p-2 rounded-xl border flex flex-col items-center gap-1 cursor-pointer transition-all ${
                              active
                                ? 'bg-red-500/25 border-amber-400 shadow-[0_0_16px_rgba(239,68,68,0.45)] scale-[1.03]'
                                : 'bg-black/50 border-white/10 hover:border-white/30'
                            }`}
                          >
                            <ClanEmblemIcon
                              emblemId={emblem.id}
                              className="w-9 h-9"
                              showGlow={active}
                            />
                            <span className="text-[8px] font-display font-bold text-slate-200 uppercase truncate max-w-full">
                              {emblem.name.split(' ')[0]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || clanNameInput.trim().length < 3}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-amber-500 hover:brightness-110 disabled:opacity-40 text-white font-display font-black text-sm uppercase tracking-wider shadow-[0_0_25px_rgba(239,68,68,0.5)] cursor-pointer transition-all"
                >
                  {busy
                    ? 'REGISTRANDO NOME ÚNICO NO SERVIDOR...'
                    : '♛ CRIAR CLÃ OFICIAL AGORA »'}
                </button>
              </form>

              {/* RIGHT: JOIN EXISTING CLAN OR TOP CLANS */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="rounded-2xl border border-white/15 bg-[#0e121b]/95 p-4 space-y-2.5">
                  <h3 className="font-display font-black text-sm text-amber-300 uppercase tracking-wider">
                    ENTRAR EM UM CLÃ EXISTENTE
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    Digite o nome do clã de um amigo para se alistar (máx.{' '}
                    {MAX_CLAN_MEMBERS} membros):
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={joinClanIdInput}
                      onChange={(e) => setJoinClanIdInput(e.target.value)}
                      placeholder="Digite o nome exato do clã"
                      className="flex-1 px-3 py-2 rounded-xl bg-black/70 border border-white/20 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      disabled={busy || joinClanIdInput.trim().length < 3}
                      onClick={() => void handleJoinClan(joinClanIdInput)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-display font-black text-xs uppercase cursor-pointer"
                    >
                      ENTRAR
                    </button>
                  </div>
                </div>

                <div className="flex-1 rounded-2xl border border-white/15 bg-[#0e121b]/95 p-4 flex flex-col min-h-0">
                  <h3 className="font-display font-black text-xs text-slate-300 uppercase tracking-wider mb-2">
                    CLÃS REGISTRADOS NO SERVIDOR ({clanState.leaderboard.length})
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {clanState.leaderboard.length === 0 ? (
                      <div className="h-full min-h-[120px] flex flex-col items-center justify-center text-center p-4 rounded-xl bg-black/40 border border-dashed border-white/15">
                        <div className="font-display font-black text-xs text-amber-300 uppercase tracking-wider">
                          NENHUM CLÃ FUNDADO AINDA
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 mt-1 max-w-[240px]">
                          Seja o primeiro comandante a criar um clã oficial no servidor KINETIC e liderar o ranking global!
                        </p>
                      </div>
                    ) : (
                      clanState.leaderboard.map((c, idx) => {
                        const count = Math.max(
                          1,
                          c.memberUids?.length || Object.keys(c.members || {}).length
                        );
                        return (
                          <div
                            key={c.clanId}
                            className="p-2.5 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="font-mono font-black text-xs text-amber-400 w-4">
                                #{idx + 1}
                              </span>
                              <ClanEmblemIcon
                                emblemId={c.emblemId}
                                className="w-8 h-8"
                              />
                              <div className="min-w-0">
                                <div className="font-display font-black text-xs text-white truncate">
                                  {c.name}{' '}
                                  <span className="text-amber-300">[{c.tag}]</span>
                                </div>
                                <div className="text-[9px] font-mono text-slate-400">
                                  Nível {c.clanLevel} · {count}/{MAX_CLAN_MEMBERS} Membros · Líder:{' '}
                                  <span className="text-amber-200">{c.ownerCallsign} ♛</span>
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-red-300 shrink-0">
                              {c.clanXp.toLocaleString('pt-BR')} XP
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'OVERVIEW' ? (
            /* ==================== CLAN OVERVIEW TAB ==================== */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Crest & Level Progress Card matching reference */}
              <div className="lg:col-span-5 rounded-2xl border border-red-500/45 bg-gradient-to-b from-[#26090f]/95 via-[#120b10]/95 to-[#0b0d14]/95 p-5 flex flex-col items-center text-center shadow-[0_14px_40px_rgba(0,0,0,0.9)]">
                <ClanEmblemIcon
                  emblemId={myClan.emblemId}
                  className="w-24 h-24 sm:w-28 sm:h-28"
                  showGlow
                />
                <h3 className="mt-2 font-display font-black text-2xl tracking-wider text-white uppercase">
                  {myClan.name}
                </h3>
                <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-widest">
                  CLÃ NÍVEL {clanProgress.level} · TAG [{myClan.tag}]
                </div>

                {/* XP Progress Bar */}
                <div className="w-full mt-3">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-200 mb-1">
                    <span>XP DO CLÃ</span>
                    <span className="font-black text-amber-300">
                      {clanProgress.currentLevelXp.toLocaleString('pt-BR')} /{' '}
                      {clanProgress.nextLevelXp.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-black/80 border border-white/15 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-600 via-amber-500 to-yellow-300 transition-all duration-300"
                      style={{ width: `${clanProgress.progressPct}%` }}
                    />
                  </div>
                </div>

                <div className="w-full mt-4 pt-3 border-t border-white/10 grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 rounded-xl bg-black/45 border border-white/10">
                    <div className="text-[9px] text-slate-400">DONO DO CLÃ</div>
                    <div className="text-xs font-black text-amber-300 truncate">
                      {myClan.ownerCallsign} ♛
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-black/45 border border-white/10">
                    <div className="text-[9px] text-slate-400">INTEGRANTES</div>
                    <div className="text-xs font-black text-emerald-400">
                      {membersArray.length} / {MAX_CLAN_MEMBERS}
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-black/45 border border-white/10">
                    <div className="text-[9px] text-slate-400">BÔNUS ATIVO</div>
                    <div className="text-xs font-black text-sky-300">
                      +{clanProgress.level * 3}% XP/CASH
                    </div>
                  </div>
                </div>

                {/* Owner Emblem Switcher */}
                {isOwner && (
                  <div className="w-full mt-4 pt-3 border-t border-white/10 text-left">
                    <div className="text-[10px] font-mono font-bold text-amber-300 uppercase mb-1.5">
                      ♛ TROCAR BRASÃO DO CLÃ (EXCLUSIVO DONO)
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {CLAN_EMBLEM_CATALOG.map((em) => (
                        <button
                          key={em.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playMenuSelect();
                            void updateClanBranding({
                              emblemId: em.id,
                              motto: myClan.motto,
                            });
                          }}
                          className={`p-1.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                            myClan.emblemId === em.id
                              ? 'bg-red-500/25 border-amber-400'
                              : 'bg-black/40 border-white/10 hover:border-white/30'
                          }`}
                        >
                          <ClanEmblemIcon emblemId={em.id} className="w-7 h-7" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    void leaveOrDisbandClan().then((res) => {
                      if (!res.ok && res.error) {
                        setFeedback({ type: 'err', text: res.error });
                      }
                    });
                  }}
                  className="mt-4 w-full py-2 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/40 text-red-200 font-display font-bold text-xs uppercase tracking-wider cursor-pointer transition-all"
                >
                  {isOwner ? 'DISSOLVER / ENCERRAR CLÃ ✕' : 'SAIR DO CLÃ ✕'}
                </button>
              </div>

              {/* Right Quick Actions & Active Perks */}
              <div className="lg:col-span-7 flex flex-col gap-3">
                <div className="rounded-2xl border border-white/15 bg-[#0f141f]/95 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display font-black text-sm text-amber-300 uppercase tracking-wider">
                      🏆 MISSÕES DIÁRIAS DO CLÃ EM ANDAMENTO
                    </h4>
                    <button
                      type="button"
                      onClick={() => setActiveTab('MISSIONS')}
                      className="text-[10px] font-mono text-sky-300 hover:underline cursor-pointer uppercase"
                    >
                      VER TODAS »
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {CLAN_DAILY_MISSIONS.slice(0, 4).map((m) => {
                      const val = myClan.dailyState?.progress?.[m.id] || 0;
                      const pct = Math.min(100, Math.round((val / m.target) * 100));
                      return (
                        <div
                          key={m.id}
                          className="p-2.5 rounded-xl bg-black/55 border border-white/10 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display font-black text-xs text-white">
                              {m.icon} {m.title}
                            </span>
                            <span className="text-[10px] font-mono text-amber-300 font-bold">
                              {val}/{m.target}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-red-500 to-amber-400"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="text-[9px] font-mono text-slate-400">
                            +{m.rewardClanXp} XP Clã · +${m.rewardPlayerCash} Cash
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Members preview */}
                <div className="rounded-2xl border border-white/15 bg-[#0f141f]/95 p-4 flex-1">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="font-display font-black text-sm text-white uppercase tracking-wider">
                      👥 ESQUADRÃO DO CLÃ ({membersArray.length}/{MAX_CLAN_MEMBERS} MÁX.)
                    </h4>
                    <button
                      type="button"
                      onClick={() => setActiveTab('MEMBERS')}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 font-display font-bold text-[10px] uppercase cursor-pointer"
                    >
                      GERENCIAR MEMBROS »
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {membersArray.map((mem) => {
                      const isMemOwner = mem.uid === myClan.ownerUid || mem.role === 'LEADER';
                      return (
                        <div
                          key={mem.uid}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                            isMemOwner
                              ? 'bg-amber-500/10 border-amber-400/55'
                              : 'bg-black/45 border-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <WarfaceRankIcon
                              level={mem.rankLevel || 4}
                              className="w-5 h-5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-display font-black text-xs text-white truncate flex items-center gap-1">
                                <span>{mem.callsign}</span>
                                {isMemOwner && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 font-mono font-black text-[8px] uppercase">
                                    ♛ DONO
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] font-mono text-slate-400">
                                Contribuição: {mem.contributedXp || 0} XP
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'MISSIONS' ? (
            /* ==================== DAILY CLAN MISSIONS TAB ==================== */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-black/45 border border-white/10 rounded-xl p-3">
                <div>
                  <h3 className="font-display font-black text-sm sm:text-base text-white uppercase">
                    🏆 DESAFIOS DIÁRIOS DO CLÃ ({myClan.name})
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    Complete objetivos em partidas online reais para subir o Nível do Clã e ganhar Moedas do Clã + K-Money.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 font-mono font-bold text-[10px] uppercase tracking-wider">
                  SYNC ONLINE AUTOMÁTICO
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CLAN_DAILY_MISSIONS.map((m) => {
                  const currentVal = myClan.dailyState?.progress?.[m.id] || 0;
                  const completed = currentVal >= m.target;
                  const claimedList = myClan.dailyState?.claimedBy?.[m.id] || [];
                  const alreadyClaimed = claimedList.includes(localUid);
                  const pct = Math.min(100, Math.round((currentVal / m.target) * 100));

                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                        completed
                          ? 'bg-gradient-to-br from-[#1f1308] to-[#0d131d] border-amber-400/60'
                          : 'bg-[#0e131d]/95 border-white/12'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-black text-sm sm:text-base text-white uppercase">
                            {m.icon} {m.title}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-black/60 border border-white/15 font-mono font-black text-xs text-amber-300">
                            {currentVal} / {m.target}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{m.description}</p>

                        <div className="w-full h-2 rounded-full bg-black/70 border border-white/10 overflow-hidden mt-3">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                            +{m.rewardClanXp} XP CLÃ
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                            +${m.rewardPlayerCash}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                            +{m.rewardClanTokens} 🛡️
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={!completed || alreadyClaimed}
                          onClick={() => void handleClaimMission(m.id)}
                          className={`px-3.5 py-1.5 rounded-xl font-display font-black text-xs uppercase tracking-wider cursor-pointer transition-all ${
                            alreadyClaimed
                              ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 cursor-default'
                              : completed
                                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_16px_rgba(245,158,11,0.5)]'
                                : 'bg-white/5 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {alreadyClaimed
                            ? 'RESGATADO ✓'
                            : completed
                              ? 'RESGATAR »'
                              : 'EM PROGRESSO'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeTab === 'MEMBERS' ? (
            /* ==================== CLAN MEMBERS & OWNER MANAGEMENT (MAX 7) ==================== */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: 7 Member Roster with Owner Identification & Kick Action */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-black text-sm sm:text-base text-white uppercase">
                    👥 INTEGRANTES DO CLÃ ({membersArray.length}/{MAX_CLAN_MEMBERS} MÁXIMO)
                  </h3>
                  <span className="text-[10px] font-mono text-amber-300">
                    Líder/Dono: <strong>{myClan.ownerCallsign} ♛</strong>
                  </span>
                </div>

                <div className="space-y-2">
                  {membersArray.map((mem) => {
                    const isMemOwner =
                      mem.uid === myClan.ownerUid || mem.role === 'LEADER';
                    return (
                      <div
                        key={mem.uid}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          isMemOwner
                            ? 'bg-gradient-to-r from-amber-500/15 via-[#17130d] to-[#0e121b] border-amber-400/70 shadow-[0_0_18px_rgba(245,158,11,0.2)]'
                            : 'bg-[#0e131d] border-white/12'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-slate-900 border border-amber-400/50 overflow-hidden flex items-center justify-center shrink-0">
                            {mem.avatarDataUrl ? (
                              <img
                                src={mem.avatarDataUrl}
                                alt={mem.callsign}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ClanEmblemIcon
                                emblemId={myClan.emblemId}
                                className="w-7 h-7"
                              />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <WarfaceRankIcon
                                level={mem.rankLevel || 4}
                                className="w-4 h-4 shrink-0"
                              />
                              <span className="font-display font-black text-sm text-white truncate">
                                {mem.callsign}
                              </span>
                              {isMemOwner ? (
                                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-[9px] uppercase">
                                  ♛ DONO DO CLÃ
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 font-mono text-[9px] uppercase">
                                  MEMBRO OFICIAL
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              Patente Nv.{mem.rankLevel || 4} · {mem.mmr || 2450} MMR · XP Doado:{' '}
                              <strong className="text-amber-300">
                                {mem.contributedXp || 0} XP
                              </strong>
                            </div>
                          </div>
                        </div>

                        {isOwner && !isMemOwner && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleKickMember(mem.uid, mem.callsign)
                            }
                            className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-600 border border-red-400/50 text-red-200 hover:text-white font-display font-black text-[10px] uppercase tracking-wider cursor-pointer transition-all shrink-0"
                          >
                            EXPULSAR ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Owner Recruit Friends Panel (up to 7 members) */}
              <div className="lg:col-span-5 rounded-2xl border border-white/15 bg-[#0e131d]/95 p-4 flex flex-col justify-between gap-3">
                <div>
                  <h4 className="font-display font-black text-sm text-amber-300 uppercase tracking-wider">
                    ♛ RECRUTAR AMIGOS PARA O CLÃ
                  </h4>
                  <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {isOwner
                      ? `Você é o Dono do Clã. Convide amigos para preencher as ${MAX_CLAN_MEMBERS} vagas de elite:`
                      : 'Apenas o Dono do Clã pode convidar ou expulsar membros.'}
                  </p>

                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
                    {friendsList.length === 0 ? (
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-slate-400 text-center">
                        Adicione amigos no menu Social para recrutá-los diretamente ou peça para buscarem pelo nome único{' '}
                        <strong className="text-amber-300">{myClan.name}</strong>.
                      </div>
                    ) : (
                      friendsList.map((f) => {
                        const alreadyMember = Boolean(myClan.members?.[f.uid]);
                        const clanFull = membersArray.length >= MAX_CLAN_MEMBERS;
                        return (
                          <div
                            key={f.uid}
                            className="p-2.5 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <WarfaceRankIcon
                                level={f.rankLevel || 1}
                                className="w-4 h-4 shrink-0"
                              />
                              <span className="font-display font-black text-xs text-white truncate">
                                {f.callsign}
                              </span>
                            </div>

                            {alreadyMember ? (
                              <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase">
                                NO CLÃ ✓
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={!isOwner || clanFull}
                                onClick={() => void handleInviteFriendToClan(f)}
                                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-display font-black text-[10px] uppercase cursor-pointer"
                              >
                                {clanFull ? 'LOTADO (7/7)' : '+ CONVIDAR'}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[10px] font-mono text-amber-200">
                  Capacidade Oficial KINETIC: <strong>{membersArray.length} / {MAX_CLAN_MEMBERS}</strong> vagas ocupadas.
                </div>
              </div>
            </div>
          ) : activeTab === 'RANK' ? (
            /* ==================== CLAN GLOBAL RANKING TAB ==================== */
            <div className="space-y-2.5">
              <h3 className="font-display font-black text-sm sm:text-base text-white uppercase">
                📊 CLASSIFICAÇÃO GLOBAL DE CLÃS
              </h3>
              <div className="space-y-2">
                {clanState.leaderboard.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-black/45 border border-dashed border-white/15 text-center font-mono text-xs text-slate-400">
                    Nenhum clã ranqueado no servidor ainda.
                  </div>
                ) : (
                  clanState.leaderboard.map((c, idx) => {
                    const isMine = c.clanId === myClan.clanId;
                    const count = Math.max(
                      1,
                      c.memberUids?.length || Object.keys(c.members || {}).length
                    );
                    return (
                      <div
                        key={c.clanId}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                          isMine
                            ? 'bg-red-950/45 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                            : 'bg-[#0e131d] border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 text-center font-display font-black text-base text-amber-400">
                            #{idx + 1}
                          </span>
                          <ClanEmblemIcon emblemId={c.emblemId} className="w-10 h-10" />
                          <div className="min-w-0">
                            <div className="font-display font-black text-sm text-white flex items-center gap-1.5">
                              <span>{c.name}</span>
                              <span className="text-amber-300">[{c.tag}]</span>
                              {isMine && (
                                <span className="px-1.5 py-0.2 rounded bg-red-500 text-white font-mono text-[9px] uppercase">
                                  SEU CLÃ
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Líder: <strong className="text-amber-200">{c.ownerCallsign} ♛</strong> ·{' '}
                              {count}/{MAX_CLAN_MEMBERS} Membros
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          <div className="text-xs font-black text-amber-300">
                            CLÃ NÍVEL {c.clanLevel}
                          </div>
                          <div className="text-[10px] text-slate-300">
                            {c.clanXp.toLocaleString('pt-BR')} XP
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* ==================== CLAN STORE TAB ==================== */
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-black/45 border border-white/10 rounded-xl p-3">
                <div>
                  <h3 className="font-display font-black text-sm sm:text-base text-white uppercase">
                    🛒 ARSENAL & LOJA EXCLUSIVA DO CLÃ
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    Use suas Moedas do Clã (ganhas nas Missões Diárias do Clã) para desbloquear skins e pacotes táticos.
                  </p>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/50 font-mono text-xs font-black text-amber-300">
                  SALDO: {clanState.clanTokens} 🛡️
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {CLAN_STORE_OFFERS.map((offer) => {
                  const unlockedByLevel =
                    clanProgress.level >= offer.requiredClanLevel;
                  const alreadyOwned =
                    offer.rewardType === 'SKIN' &&
                    clanState.purchasedOfferIds.includes(offer.id);
                  return (
                    <div
                      key={offer.id}
                      className="p-4 rounded-2xl border border-white/15 bg-[#0e131d]/95 flex flex-col justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-400/40 font-mono font-black text-[9px] text-red-300 uppercase">
                            {offer.badgeText}
                          </span>
                          <span className="text-[10px] font-mono text-amber-300">
                            Req. Clã Nv.{offer.requiredClanLevel}
                          </span>
                        </div>
                        <h4 className="font-display font-black text-sm text-white uppercase mt-2">
                          {offer.name}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          {offer.subtitle}
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={!unlockedByLevel || alreadyOwned}
                        onClick={() => handleBuyClanStoreItem(offer.id)}
                        className={`w-full py-2 rounded-xl font-display font-black text-xs uppercase tracking-wider cursor-pointer transition-all ${
                          alreadyOwned
                            ? 'bg-emerald-500/20 border border-emerald-400/50 text-emerald-300'
                            : unlockedByLevel
                              ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:brightness-110 text-slate-950'
                              : 'bg-white/5 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {alreadyOwned
                          ? 'RESGATADO ✓'
                          : !unlockedByLevel
                            ? `BLOQUEADO (CLÃ NV.${offer.requiredClanLevel})`
                            : `RESGATAR POR ${offer.costClanTokens} 🛡️`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
