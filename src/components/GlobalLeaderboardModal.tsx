import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  fetchGlobalLeaderboard,
  getMetricGapToAbove,
  LeaderboardPlayerEntry,
  LeaderboardSortKey,
  sortLeaderboardEntries,
} from '../firebase/leaderboardService';
import {
  sendFriendRequestByCallsign,
  SocialInboxState,
  subscribeSocialInbox,
} from '../firebase/friendsSocialService';
import { auth } from '../firebase/firebaseClient';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import { getCompetitiveRankProgression } from '../progression/competitiveRanks';
import { WeaponId } from '../types/game';
import { CompetitiveRankBadgeSvg } from './RankedInsigniasSvg';
import {
  OperatorTacticalAvatar,
  WARFACE_CLASS_META,
  WarfaceClassIcon,
  WarfaceClassId,
} from './WarfaceClassIcons';
import { WarfaceRankIcon } from './WarfaceRankIcon';

interface GlobalLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSort?: LeaderboardSortKey;
}

const SORT_TABS: Array<{
  id: LeaderboardSortKey;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'OVERALL',
    label: 'Geral (MMR)',
    shortLabel: 'MMR',
    description: 'Classificação competitiva por Elo / MMR',
  },
  {
    id: 'KD',
    label: 'K/D Ratio',
    shortLabel: 'K/D',
    description: 'Eficiência de abates por morte',
  },
  {
    id: 'KILLS',
    label: 'Abates',
    shortLabel: 'Abates',
    description: 'Total acumulado de eliminações online',
  },
  {
    id: 'LEVEL',
    label: 'Nível / XP',
    shortLabel: 'Nível',
    description: 'Progressão de patente militar (1–70)',
  },
  {
    id: 'WINS',
    label: 'Vitórias',
    shortLabel: 'Vitórias',
    description: 'Partidas vencidas e taxa de vitória',
  },
  {
    id: 'HEADSHOTS',
    label: 'Headshots',
    shortLabel: 'HS',
    description: 'Precisão letal em tiros na cabeça',
  },
];

const CLASS_FILTERS: Array<{ id: 'ALL' | WarfaceClassId; label: string }> = [
  { id: 'ALL', label: 'Todas as Classes' },
  { id: 'FUZILEIRO', label: 'Fuzileiro' },
  { id: 'MEDICO', label: 'Médico' },
  { id: 'ENGENHEIRO', label: 'Engenheiro' },
  { id: 'FRANCO_ATIRADOR', label: 'Franco-Atirador' },
];

const WEAPON_LABELS: Record<WeaponId, string> = {
  P50_PISTOL: 'Desert Eagle .50AE',
  M1911_PISTOL: 'Colt M1911A1',
  M4_CARBINE: 'MX16A4 / M4',
  SMG_45: 'V18 Spectre',
  SMG_MP5: 'MPS5 9mm',
  SHOTGUN_12: 'Drake-12',
  SHOTGUN_SPAS: 'SPAS-12',
  AK47_RIFLE: 'AK-47 Comando',
  AK12_RIFLE: 'AK-200 Tática',
  S_MILITARY: 'SCAR-L S-Military',
  CARBINE_AR: 'Carabina Tática',
  L49_LMG: 'LMG L49 100R',
  SNIPER_TACTICAL: 'MK14 EBR',
  SNIPER_BOLT: 'Kar98k',
  SNIPER_AWP: 'AWP-M .338',
  SNIPER_HEAVY: 'M200 Intervention',
  RPG7_LAUNCHER: 'RPG-7V',
  KNIFE_TACTICAL: 'Faca Tática',
};

function formatPrimaryMetric(
  entry: LeaderboardPlayerEntry,
  sortKey: LeaderboardSortKey
): { value: string; unit: string } {
  switch (sortKey) {
    case 'OVERALL':
      return { value: entry.mmr.toLocaleString('pt-BR'), unit: 'MMR' };
    case 'KD':
      return { value: entry.kdRatio.toFixed(2), unit: 'K/D' };
    case 'KILLS':
      return { value: entry.totalKills.toLocaleString('pt-BR'), unit: 'ABATES' };
    case 'LEVEL':
      return { value: `NÍV. ${entry.rankLevel}`, unit: `${entry.playerXp.toLocaleString('pt-BR')} XP` };
    case 'WINS':
      return {
        value: entry.matchesWon.toLocaleString('pt-BR'),
        unit: `${entry.winRatePct.toFixed(0)}% WR`,
      };
    case 'HEADSHOTS':
      return {
        value: entry.totalHeadshots.toLocaleString('pt-BR'),
        unit: `${entry.headshotPct.toFixed(0)}% HS`,
      };
  }
}

export const GlobalLeaderboardModal: React.FC<GlobalLeaderboardModalProps> = ({
  isOpen,
  onClose,
  initialSort = 'OVERALL',
}) => {
  const [sortKey, setSortKey] = useState<LeaderboardSortKey>(initialSort);
  const [classFilter, setClassFilter] = useState<'ALL' | WarfaceClassId>('ALL');
  const [onlyActive, setOnlyActive] = useState(false);
  const [minKillsForKd, setMinKillsForKd] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [entries, setEntries] = useState<LeaderboardPlayerEntry[]>([]);
  const [dataSource, setDataSource] = useState<'cloud' | 'local-only'>('cloud');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number>(0);

  const [inspectedEntry, setInspectedEntry] = useState<LeaderboardPlayerEntry | null>(null);
  const [socialInbox, setSocialInbox] = useState<SocialInboxState | null>(null);
  const [friendActionState, setFriendActionState] = useState<{
    uid: string;
    loading: boolean;
    feedback: string | null;
    ok?: boolean;
  } | null>(null);

  const currentUid = auth.currentUser?.uid || getCloudSyncState().profile.uid;

  const loadLeaderboard = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    const res = await fetchGlobalLeaderboard(forceRefresh);
    setEntries(res.entries);
    setDataSource(res.source);
    setLastUpdatedMs(res.fetchedAtMs);
    if (res.error) {
      setErrorMsg(res.error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSortKey(initialSort);
    void loadLeaderboard(false);
    const unsubSocial = subscribeSocialInbox((inbox) => setSocialInbox(inbox));
    return () => {
      unsubSocial();
    };
  }, [isOpen, initialSort, loadLeaderboard]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectedEntry) {
          setInspectedEntry(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, inspectedEntry, onClose]);

  const rankedList = useMemo(() => {
    const filtered = entries.filter((item) => {
      if (classFilter !== 'ALL' && item.selectedClass !== classFilter) {
        return false;
      }
      if (onlyActive && item.matchesPlayed <= 0 && item.totalKills <= 0) {
        return false;
      }
      if (sortKey === 'KD' && minKillsForKd && item.totalKills < 10) {
        return false;
      }
      return true;
    });
    return sortLeaderboardEntries(filtered, sortKey);
  }, [entries, classFilter, onlyActive, sortKey, minKillsForKd]);

  const displayedRows = useMemo(() => {
    const cleanSearch = searchQuery.trim().toLowerCase();
    const withRank = rankedList.map((entry, idx) => ({
      entry,
      rank: idx + 1,
    }));
    if (!cleanSearch) return withRank;
    return withRank.filter(
      ({ entry }) =>
        entry.callsign.toLowerCase().includes(cleanSearch) ||
        entry.rankTitle.toLowerCase().includes(cleanSearch) ||
        (entry.clanId && entry.clanId.toLowerCase().includes(cleanSearch))
    );
  }, [rankedList, searchQuery]);

  const myRankIndex = useMemo(
    () => rankedList.findIndex((e) => e.uid === currentUid),
    [rankedList, currentUid]
  );
  const myEntry = myRankIndex >= 0 ? rankedList[myRankIndex] : null;
  const entryAboveMe = myRankIndex > 0 ? rankedList[myRankIndex - 1] : null;

  const topThree = useMemo(() => {
    if (searchQuery.trim().length > 0) return [];
    return displayedRows.slice(0, 3);
  }, [displayedRows, searchQuery]);

  const handleAddFriend = async (target: LeaderboardPlayerEntry) => {
    soundEngine.playMenuSelect();
    setFriendActionState({ uid: target.uid, loading: true, feedback: null });
    const result = await sendFriendRequestByCallsign(target.callsign);
    setFriendActionState({
      uid: target.uid,
      loading: false,
      feedback: result.message,
      ok: result.ok,
    });
  };

  if (!isOpen) return null;

  const updatedLabel = lastUpdatedMs
    ? new Date(lastUpdatedMs).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--';

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/82 backdrop-blur-md flex items-center justify-center p-1.5 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-6xl h-[94dvh] max-h-[94dvh] bg-[#070a11] border border-white/15 rounded-xl shadow-[0_24px_80px_rgba(0,0,0,0.88)] flex flex-col overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. CABEÇALHO PRINCIPAL */}
        <header className="px-3 sm:px-5 py-2.5 bg-[#0b101b] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/25 via-red-600/20 to-slate-900 border border-amber-400/40 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-400" fill="currentColor">
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-black text-sm sm:text-lg tracking-wider uppercase text-white truncate">
                  RANKING GERAL
                </h2>
                <span className="text-[10px] font-mono text-amber-300/90 uppercase tracking-wider hidden sm:inline">
                  · Temporada 1
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 truncate">
                {rankedList.length.toLocaleString('pt-BR')}{' '}
                {rankedList.length === 1 ? 'operador' : 'operadores'} classificados · Atualizado às{' '}
                {updatedLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Busca por Callsign */}
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar Callsign..."
                className="w-32 sm:w-48 pl-7 pr-6 py-1.5 rounded-md bg-[#060910] border border-white/15 focus:border-red-500/70 focus:outline-none text-[11px] font-mono text-white placeholder:text-slate-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
                  aria-label="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                void loadLeaderboard(true);
              }}
              disabled={isLoading}
              className="px-2.5 py-1.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isLoading ? 'Sync...' : 'Atualizar'}
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                onClose();
              }}
              className="px-2.5 py-1.5 rounded-md bg-red-500/15 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Fechar ✕
            </button>
          </div>
        </header>

        {/* 2. BARRA DE FILTROS E CATEGORIAS */}
        <div className="px-3 sm:px-5 py-2 bg-[#090d16] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {/* Abas de ordenação principal */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {SORT_TABS.map((tab) => {
              const active = sortKey === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.description}
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setSortKey(tab.id);
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer border ${
                    active
                      ? 'bg-red-600/25 border-red-500/80 text-white shadow-[0_0_14px_rgba(239,68,68,0.22)]'
                      : 'bg-transparent border-transparent text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'
                  }`}
                >
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Filtros secundários */}
          <div className="flex items-center gap-2">
            <select
              value={classFilter}
              onChange={(e) => {
                soundEngine.playMenuSelect();
                setClassFilter(e.target.value as 'ALL' | WarfaceClassId);
              }}
              aria-label="Filtrar por classe"
              className="px-2 py-1 rounded-md bg-[#060910] border border-white/15 text-[10px] sm:text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-400/60 cursor-pointer"
            >
              {CLASS_FILTERS.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0b101b]">
                  {c.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                setOnlyActive((prev) => !prev);
              }}
              className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                onlyActive
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#060910] border-white/15 text-slate-400 hover:text-slate-200'
              }`}
              title="Exibir apenas operadores com pelo menos 1 abate ou partida online"
            >
              Ativos
            </button>

            {sortKey === 'KD' && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setMinKillsForKd((prev) => !prev);
                }}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  minKillsForKd
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-[#060910] border-white/15 text-slate-400 hover:text-slate-200'
                }`}
                title="Exigir no mínimo 10 abates para qualificar no ranking de K/D"
              >
                ≥10 Abates
              </button>
            )}
          </div>
        </div>

        {/* 3. CORPO ROLÁVEL (PODIUM + TABELA) */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-3 space-y-3">
          {/* Aviso de conta visitante / offline */}
          {(dataSource === 'local-only' || errorMsg) && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-400/30 flex items-center justify-between gap-3 text-[11px] font-mono text-amber-200">
              <span>
                {errorMsg ||
                  'Modo visitante: faça login com sua Conta Google no Perfil para sincronizar e visualizar todos os operadores globais da nuvem.'}
              </span>
              {auth.currentUser && (
                <button
                  type="button"
                  onClick={() => void loadLeaderboard(true)}
                  className="px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/35 text-amber-100 uppercase font-bold text-[10px] shrink-0 cursor-pointer"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          {/* TOP 3 PÓDIO COMPACTO */}
          {!isLoading && topThree.length > 0 && (
            <section aria-label="Pódio Top 3" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {topThree.map(({ entry, rank }) => {
                const { current: tier } = getCompetitiveRankProgression(entry.mmr);
                const primary = formatPrimaryMetric(entry, sortKey);
                const isMe = entry.uid === currentUid;
                const medalStyles =
                  rank === 1
                    ? {
                        border: 'border-amber-400/55',
                        accentBar: 'bg-amber-400',
                        rankColor: 'text-amber-300',
                        bg: 'bg-gradient-to-br from-amber-500/[0.11] via-[#0c1220] to-[#080c15]',
                      }
                    : rank === 2
                      ? {
                          border: 'border-slate-300/40',
                          accentBar: 'bg-slate-300',
                          rankColor: 'text-slate-200',
                          bg: 'bg-gradient-to-br from-slate-300/[0.08] via-[#0c1220] to-[#080c15]',
                        }
                      : {
                          border: 'border-orange-500/45',
                          accentBar: 'bg-orange-400',
                          rankColor: 'text-orange-300',
                          bg: 'bg-gradient-to-br from-orange-500/[0.09] via-[#0c1220] to-[#080c15]',
                        };

                return (
                  <button
                    key={entry.uid}
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      setFriendActionState(null);
                      setInspectedEntry(entry);
                    }}
                    className={`relative text-left rounded-lg border ${medalStyles.border} ${medalStyles.bg} p-2.5 sm:p-3 hover:border-white/40 transition-all cursor-pointer overflow-hidden group`}
                  >
                    <div className={`absolute top-0 left-0 right-0 h-[2px] ${medalStyles.accentBar}`} />

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`font-display font-black text-lg sm:text-xl tabular-nums leading-none ${medalStyles.rankColor}`}
                        >
                          #{rank}
                        </span>

                        <div className="relative w-10 h-10 rounded-md overflow-hidden border border-white/20 bg-slate-900 shrink-0">
                          <OperatorTacticalAvatar
                            team="VANGUARD"
                            classId={entry.selectedClass}
                            photoUrl={entry.avatarDataUrl || undefined}
                          />
                          {entry.isOnlineRecently && (
                            <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#070a11]" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
                              {entry.callsign}
                            </span>
                            {entry.isVip && (
                              <span
                                className="text-[9px] font-mono font-black text-amber-300 uppercase"
                                title="Passe VIP Ativo"
                              >
                                ★
                              </span>
                            )}
                            {isMe && (
                              <span className="text-[9px] font-mono font-bold text-red-300 uppercase">
                                (VOCÊ)
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                            <WarfaceRankIcon level={entry.rankLevel} className="w-3.5 h-3.5" />
                            <span className="truncate">
                              Nív. {entry.rankLevel} · {tier.name}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-1.5">
                        <div>
                          <div className="font-mono font-black text-sm sm:text-base text-white tabular-nums leading-tight">
                            {primary.value}
                          </div>
                          <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400">
                            {primary.unit}
                          </div>
                        </div>
                        <CompetitiveRankBadgeSvg tier={tier.id} className="w-8 h-8" />
                      </div>
                    </div>

                    <div className="mt-2 pt-2 border-t border-white/[0.08] flex items-center justify-between text-[10px] font-mono text-slate-300 tabular-nums">
                      <span>
                        K/D <strong className="text-white">{entry.kdRatio.toFixed(2)}</strong>
                      </span>
                      <span>
                        {entry.totalKills.toLocaleString('pt-BR')}/{entry.totalDeaths.toLocaleString('pt-BR')}
                      </span>
                      <span>HS {entry.headshotPct.toFixed(0)}%</span>
                      <span>{entry.matchesWon}V</span>
                    </div>
                  </button>
                );
              })}
            </section>
          )}

          {/* TABELA COMPETITIVA DE ALTA DENSIDADE */}
          <div className="rounded-lg border border-white/10 bg-[#0a0f1a] overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-2.5">
                {Array.from({ length: 7 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-11 rounded bg-white/[0.04] animate-pulse"
                  />
                ))}
              </div>
            ) : displayedRows.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-2">
                <p className="font-display font-bold text-sm uppercase tracking-wider text-slate-300">
                  Nenhum operador encontrado
                </p>
                <p className="text-xs font-mono text-slate-500">
                  Ajuste a busca ou os filtros de classe/atividade para exibir mais jogadores.
                </p>
                {(searchQuery || classFilter !== 'ALL' || onlyActive || minKillsForKd) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setClassFilter('ALL');
                      setOnlyActive(false);
                      setMinKillsForKd(false);
                    }}
                    className="mt-2 px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-[11px] font-mono font-bold uppercase text-white cursor-pointer"
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead className="bg-[#0e1524] border-b border-white/10 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-2.5 pl-3 pr-2 w-12 text-center">#</th>
                      <th className="py-2.5 px-2 min-w-[180px]">Operador</th>
                      <th
                        className={`py-2.5 px-2 text-right whitespace-nowrap ${
                          sortKey === 'OVERALL' ? 'text-amber-300' : ''
                        }`}
                      >
                        Elo / MMR
                      </th>
                      <th
                        className={`py-2.5 px-2 text-right whitespace-nowrap ${
                          sortKey === 'LEVEL' ? 'text-amber-300' : ''
                        }`}
                      >
                        Nível
                      </th>
                      <th
                        className={`py-2.5 px-2 text-right whitespace-nowrap ${
                          sortKey === 'KD' ? 'text-amber-300' : ''
                        }`}
                      >
                        K/D
                      </th>
                      <th
                        className={`py-2.5 px-2 text-right whitespace-nowrap ${
                          sortKey === 'KILLS' ? 'text-amber-300' : ''
                        }`}
                      >
                        Abates / Mortes
                      </th>
                      <th
                        className={`py-2.5 px-2 text-right whitespace-nowrap ${
                          sortKey === 'HEADSHOTS' ? 'text-amber-300' : ''
                        }`}
                      >
                        Headshots
                      </th>
                      <th
                        className={`py-2.5 pl-2 pr-3 text-right whitespace-nowrap ${
                          sortKey === 'WINS' ? 'text-amber-300' : ''
                        }`}
                      >
                        Vitórias
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-xs font-mono">
                    {displayedRows.map(({ entry, rank }) => {
                      const isMe = entry.uid === currentUid;
                      const { current: tier } = getCompetitiveRankProgression(entry.mmr);
                      const rankTextClass =
                        rank === 1
                          ? 'text-amber-300 font-black'
                          : rank === 2
                            ? 'text-slate-200 font-black'
                            : rank === 3
                              ? 'text-orange-300 font-black'
                              : 'text-slate-400 font-bold';

                      const kdTextClass =
                        entry.kdRatio >= 2
                          ? 'text-emerald-300 font-bold'
                          : entry.kdRatio >= 1
                            ? 'text-slate-100 font-bold'
                            : entry.totalKills === 0 && entry.totalDeaths === 0
                              ? 'text-slate-500'
                              : 'text-rose-300';

                      return (
                        <tr
                          key={entry.uid}
                          onClick={() => {
                            soundEngine.playMenuSelect();
                            setFriendActionState(null);
                            setInspectedEntry(entry);
                          }}
                          className={`transition-colors cursor-pointer ${
                            isMe
                              ? 'bg-red-500/[0.11] hover:bg-red-500/[0.17]'
                              : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          {/* Posição */}
                          <td
                            className={`py-2 pl-3 pr-2 text-center tabular-nums ${rankTextClass} ${
                              isMe ? 'border-l-2 border-l-red-500' : ''
                            }`}
                          >
                            {rank}
                          </td>

                          {/* Operador */}
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative w-8 h-8 rounded overflow-hidden border border-white/15 bg-slate-900 shrink-0">
                                <OperatorTacticalAvatar
                                  team="VANGUARD"
                                  classId={entry.selectedClass}
                                  photoUrl={entry.avatarDataUrl || undefined}
                                />
                                {entry.isOnlineRecently && (
                                  <span
                                    className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-[#070a11]"
                                    title="Ativo recentemente"
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-display font-bold text-xs text-white truncate max-w-[150px] sm:max-w-[220px]">
                                    {entry.callsign}
                                  </span>
                                  {entry.isVip && (
                                    <span
                                      className="text-[10px] text-amber-300"
                                      title="Passe VIP"
                                    >
                                      ★
                                    </span>
                                  )}
                                  {isMe && (
                                    <span className="text-[9px] font-mono font-bold text-red-300 uppercase">
                                      VOCÊ
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                  <WarfaceClassIcon
                                    classId={entry.selectedClass}
                                    className="w-3 h-3 shrink-0"
                                  />
                                  <span className="truncate max-w-[140px]">
                                    {entry.rankTitle}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Elo / MMR */}
                          <td
                            className={`py-2 px-2 text-right tabular-nums ${
                              sortKey === 'OVERALL' ? 'bg-amber-400/[0.04]' : ''
                            }`}
                          >
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <div>
                                <div className="font-bold text-white leading-tight">
                                  {entry.mmr.toLocaleString('pt-BR')}
                                </div>
                                <div
                                  className="text-[9px] uppercase tracking-wider"
                                  style={{ color: tier.accentHex }}
                                >
                                  {tier.name}
                                </div>
                              </div>
                              <CompetitiveRankBadgeSvg tier={tier.id} className="w-6 h-6" />
                            </div>
                          </td>

                          {/* Nível / XP */}
                          <td
                            className={`py-2 px-2 text-right tabular-nums ${
                              sortKey === 'LEVEL' ? 'bg-amber-400/[0.04]' : ''
                            }`}
                          >
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <div>
                                <div className="font-bold text-slate-100 leading-tight">
                                  Nív. {entry.rankLevel}
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  {entry.playerXp.toLocaleString('pt-BR')} XP
                                </div>
                              </div>
                              <WarfaceRankIcon level={entry.rankLevel} className="w-5 h-5" />
                            </div>
                          </td>

                          {/* K/D */}
                          <td
                            className={`py-2 px-2 text-right tabular-nums ${kdTextClass} ${
                              sortKey === 'KD' ? 'bg-amber-400/[0.04]' : ''
                            }`}
                          >
                            {entry.kdRatio.toFixed(2)}
                          </td>

                          {/* Abates / Mortes */}
                          <td
                            className={`py-2 px-2 text-right tabular-nums ${
                              sortKey === 'KILLS' ? 'bg-amber-400/[0.04]' : ''
                            }`}
                          >
                            <span className="text-white font-bold">
                              {entry.totalKills.toLocaleString('pt-BR')}
                            </span>
                            <span className="text-slate-500 mx-1">/</span>
                            <span className="text-slate-400">
                              {entry.totalDeaths.toLocaleString('pt-BR')}
                            </span>
                          </td>

                          {/* Headshots */}
                          <td
                            className={`py-2 px-2 text-right tabular-nums ${
                              sortKey === 'HEADSHOTS' ? 'bg-amber-400/[0.04]' : ''
                            }`}
                          >
                            <div className="text-slate-100 font-bold leading-tight">
                              {entry.totalHeadshots.toLocaleString('pt-BR')}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {entry.headshotPct.toFixed(0)}% HS
                            </div>
                          </td>

                          {/* Vitórias */}
                          <td
                            className={`py-2 pl-2 pr-3 text-right tabular-nums ${
                              sortKey === 'WINS' ? 'bg-amber-400/[0.04]' : ''
                            }`}
                          >
                            <div className="text-slate-100 font-bold leading-tight">
                              {entry.matchesWon.toLocaleString('pt-BR')}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {entry.winRatePct.toFixed(0)}% ({entry.matchesPlayed}J)
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* 4. RODAPÉ FIXO: SUA POSIÇÃO NO RANKING */}
        <footer className="px-3 sm:px-5 py-2.5 bg-[#0c1220] border-t border-white/15 flex flex-wrap items-center justify-between gap-2 shrink-0">
          {myEntry ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                    Sua Posição
                  </span>
                  <span className="font-display font-black text-base sm:text-lg text-amber-300 tabular-nums">
                    #{myRankIndex + 1}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                    / {rankedList.length}
                  </span>
                </div>

                <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-white/10 text-[11px] font-mono text-slate-300 tabular-nums">
                  <span>
                    MMR <strong className="text-white">{myEntry.mmr.toLocaleString('pt-BR')}</strong>
                  </span>
                  <span>
                    K/D <strong className="text-white">{myEntry.kdRatio.toFixed(2)}</strong>
                  </span>
                  <span>
                    Abates <strong className="text-white">{myEntry.totalKills.toLocaleString('pt-BR')}</strong>
                  </span>
                  <span>
                    Nív. <strong className="text-white">{myEntry.rankLevel}</strong>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-mono">
                {entryAboveMe ? (
                  <span className="text-slate-300">
                    Para superar <strong className="text-white">#{myRankIndex} {entryAboveMe.callsign}</strong>:{' '}
                    <strong className="text-amber-300">
                      {getMetricGapToAbove(entryAboveMe, myEntry, sortKey)}
                    </strong>
                  </span>
                ) : (
                  <span className="text-amber-300 font-bold uppercase tracking-wider">
                    ★ #1 Líder da Categoria
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    setFriendActionState(null);
                    setInspectedEntry(myEntry);
                  }}
                  className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-mono font-bold uppercase text-white cursor-pointer"
                >
                  Meu Dossiê
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>
                Seu perfil está fora dos filtros atuais ({classFilter !== 'ALL' ? WARFACE_CLASS_META[classFilter].label : 'Filtros ativos'}).
              </span>
              <button
                type="button"
                onClick={() => {
                  setClassFilter('ALL');
                  setOnlyActive(false);
                  setMinKillsForKd(false);
                  setSearchQuery('');
                }}
                className="text-amber-300 hover:underline uppercase font-bold cursor-pointer"
              >
                Mostrar minha posição
              </button>
            </div>
          )}
        </footer>
      </div>

      {/* 5. SUB-MODAL: DOSSIÊ COMPLETO DO OPERADOR */}
      {inspectedEntry && (
        <div
          className="fixed inset-0 z-[85] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3"
          onClick={() => setInspectedEntry(null)}
        >
          {(() => {
            const { current: tier, next, mmrRemaining, progressPct } =
              getCompetitiveRankProgression(inspectedEntry.mmr);
            const isSelf = inspectedEntry.uid === currentUid;
            const isAlreadyFriend = Boolean(socialInbox?.friends?.[inspectedEntry.uid]);
            const classMeta = WARFACE_CLASS_META[inspectedEntry.selectedClass];
            const weaponLabel =
              WEAPON_LABELS[inspectedEntry.activeWeapon] || inspectedEntry.activeWeapon;
            const actionFeedback =
              friendActionState?.uid === inspectedEntry.uid ? friendActionState : null;

            return (
              <div
                className="w-full max-w-xl bg-[#090e19] border border-white/20 rounded-xl shadow-[0_24px_70px_rgba(0,0,0,0.9)] overflow-hidden text-slate-100"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header do Dossiê */}
                <div className="px-4 py-3 bg-[#0e1627] border-b border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-white/20 bg-slate-900 shrink-0">
                      <OperatorTacticalAvatar
                        team="VANGUARD"
                        classId={inspectedEntry.selectedClass}
                        photoUrl={inspectedEntry.avatarDataUrl || undefined}
                      />
                      {inspectedEntry.isOnlineRecently && (
                        <span className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#0e1627]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-black text-base text-white truncate">
                          {inspectedEntry.callsign}
                        </h3>
                        {inspectedEntry.isVip && (
                          <span className="text-[10px] font-mono font-bold text-amber-300 uppercase">
                            ★ VIP
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
                        <WarfaceRankIcon level={inspectedEntry.rankLevel} className="w-4 h-4" />
                        <span>
                          Nív. {inspectedEntry.rankLevel} · {inspectedEntry.rankTitle}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectedEntry(null)}
                    className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-mono font-bold text-slate-200 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Elo & Equipamento */}
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-lg bg-[#0d1424] border border-white/10 flex items-center gap-3">
                      <CompetitiveRankBadgeSvg tier={tier.id} className="w-11 h-11" />
                      <div className="min-w-0 flex-1">
                        <div
                          className="font-display font-black text-xs uppercase tracking-wider"
                          style={{ color: tier.accentHex }}
                        >
                          {tier.name}
                        </div>
                        <div className="font-mono font-bold text-sm text-white tabular-nums">
                          {inspectedEntry.mmr.toLocaleString('pt-BR')} MMR
                        </div>
                        <div className="mt-1 w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-400"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="mt-0.5 text-[9px] font-mono text-slate-400">
                          {next
                            ? `Faltam ${mmrRemaining} MMR para ${next.name}`
                            : 'Patente máxima da temporada'}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0d1424] border border-white/10 flex flex-col justify-center gap-1.5 text-[11px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Classe Principal</span>
                        <span className="inline-flex items-center gap-1.5 text-white font-bold">
                          <WarfaceClassIcon
                            classId={inspectedEntry.selectedClass}
                            className="w-4 h-4"
                          />
                          {classMeta.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Arma Equipada</span>
                        <span className="text-amber-200 font-bold truncate max-w-[155px]">
                          {weaponLabel}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">XP Militar</span>
                        <span className="text-slate-200 font-bold tabular-nums">
                          {inspectedEntry.playerXp.toLocaleString('pt-BR')} XP
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Grade de Estatísticas de Combate */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                    {[
                      {
                        label: 'K/D Ratio',
                        value: inspectedEntry.kdRatio.toFixed(2),
                        sub: `KDA ${inspectedEntry.kdaRatio.toFixed(2)}`,
                        accent: 'text-emerald-300',
                      },
                      {
                        label: 'Abates',
                        value: inspectedEntry.totalKills.toLocaleString('pt-BR'),
                        sub: `${inspectedEntry.totalDeaths.toLocaleString('pt-BR')} mortes`,
                        accent: 'text-white',
                      },
                      {
                        label: 'Headshots',
                        value: inspectedEntry.totalHeadshots.toLocaleString('pt-BR'),
                        sub: `${inspectedEntry.headshotPct.toFixed(1)}% precisão`,
                        accent: 'text-amber-300',
                      },
                      {
                        label: 'Vitórias',
                        value: inspectedEntry.matchesWon.toLocaleString('pt-BR'),
                        sub: `${inspectedEntry.winRatePct.toFixed(0)}% em ${inspectedEntry.matchesPlayed}J`,
                        accent: 'text-sky-300',
                      },
                      {
                        label: 'Assistências',
                        value: inspectedEntry.totalAssists.toLocaleString('pt-BR'),
                        sub: 'Suporte tático',
                        accent: 'text-slate-200',
                      },
                      {
                        label: 'Bombas C4',
                        value: inspectedEntry.bombsPlanted.toLocaleString('pt-BR'),
                        sub: 'Objetivos',
                        accent: 'text-slate-200',
                      },
                      {
                        label: 'Partidas',
                        value: inspectedEntry.matchesPlayed.toLocaleString('pt-BR'),
                        sub: 'Online oficial',
                        accent: 'text-slate-200',
                      },
                      {
                        label: 'Status',
                        value: inspectedEntry.isOnlineRecently ? 'ONLINE' : 'OFFLINE',
                        sub: inspectedEntry.clanId ? `Clã: ${inspectedEntry.clanId}` : 'Sem clã',
                        accent: inspectedEntry.isOnlineRecently
                          ? 'text-emerald-400'
                          : 'text-slate-400',
                      },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="p-2.5 rounded-lg bg-[#070b13] border border-white/[0.08]"
                      >
                        <div className="text-[9px] uppercase tracking-wider text-slate-400">
                          {stat.label}
                        </div>
                        <div className={`text-sm font-black tabular-nums mt-0.5 ${stat.accent}`}>
                          {stat.value}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate mt-0.5">
                          {stat.sub}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ação social */}
                  {!isSelf && (
                    <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-mono">
                        {actionFeedback?.feedback ? (
                          <span
                            className={
                              actionFeedback.ok ? 'text-emerald-300' : 'text-amber-300'
                            }
                          >
                            {actionFeedback.feedback}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {isAlreadyFriend
                              ? 'Este operador já faz parte da sua lista de amigos.'
                              : 'Envie um pedido de amizade para montar esquadrão 5v5.'}
                          </span>
                        )}
                      </div>

                      {!isAlreadyFriend && (
                        <button
                          type="button"
                          disabled={actionFeedback?.loading}
                          onClick={() => void handleAddFriend(inspectedEntry)}
                          className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 text-[11px] font-mono font-bold uppercase tracking-wider text-white transition-colors cursor-pointer"
                        >
                          {actionFeedback?.loading ? 'Enviando...' : '+ Adicionar Amigo'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
