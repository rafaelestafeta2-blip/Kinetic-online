import React, { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../../firebase/firebaseClient';
import {
  ChampionshipLobbySnapshot,
  ChampionshipLobbyWsHandle,
  ChampionshipOverviewData,
  connectChampionshipLobbyWs,
  fetchActiveChampionship,
  MatchRecord,
  requestMatchLobbyToken,
} from '../../services/championshipClient';
import { DrillMode } from '../../types/game';
import { ChampionshipAdminTab } from './ChampionshipAdminTab';
import {
  getChampionshipStatusColor,
  getChampionshipStatusLabel,
} from './championshipFormatters';
import { ChampionshipOverviewTab } from './ChampionshipOverviewTab';
import { ChampionshipRegistrationTab } from './ChampionshipRegistrationTab';
import { ChampionshipScheduleTab } from './ChampionshipScheduleTab';
import { ChampionshipStandingsTab } from './ChampionshipStandingsTab';

type ChampionshipTabId = 'OVERVIEW' | 'SCHEDULE' | 'STANDINGS' | 'REGISTRATION' | 'ADMIN';

interface ChampionshipHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenClanCenter?: () => void;
  onLaunchChampionshipMatch?: (roomCode: string, arenaMode: DrillMode) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ChampionshipModalErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Erro inesperado na tela do campeonato.',
    };
  }

  componentDidCatch(error: unknown): void {
    console.error('[ChampionshipHubModal] Render error caught:', error);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 bg-[#050914]/95 flex items-center justify-center p-4 text-white">
          <div className="max-w-md w-full border border-rose-500/50 bg-[#0B1325] p-5 space-y-4">
            <h2 className="text-sm font-display font-black uppercase tracking-wider text-rose-300">
              ERRO AO ABRIR O CAMPEONATO
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">{this.state.message}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="px-3.5 py-2 border border-cyan-500/50 text-cyan-300 font-mono text-xs uppercase cursor-pointer"
              >
                TENTAR NOVAMENTE
              </button>
              <button
                type="button"
                onClick={this.props.onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-display font-bold text-xs uppercase cursor-pointer"
              >
                FECHAR
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ChampionshipHubModalInner: React.FC<ChampionshipHubModalProps> = ({
  isOpen,
  onClose,
  onOpenClanCenter,
  onLaunchChampionshipMatch,
}) => {
  const [activeTab, setActiveTab] = useState<ChampionshipTabId>('OVERVIEW');
  const [data, setData] = useState<ChampionshipOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic server clock anchor: immune to local phone clock errors or manual time tampering
  const clockAnchorRef = useRef<{ serverMs: number; perfMs: number } | null>(null);
  const [syncedServerNowMs, setSyncedServerNowMs] = useState<number>(() => Date.now());
  const [paymentBanner, setPaymentBanner] = useState<string | null>(null);

  const syncServerClock = useCallback((serverMs: number, rttMs = 0) => {
    if (!Number.isFinite(serverMs) || serverMs <= 0) return;
    const perfNow = typeof performance !== 'undefined' ? performance.now() : 0;
    const compensatedServerMs = Math.round(serverMs + Math.max(0, rttMs) / 2);
    clockAnchorRef.current = { serverMs: compensatedServerMs, perfMs: perfNow };
    setSyncedServerNowMs(compensatedServerMs);
  }, []);

  // Private Match Lobby WebSocket State
  const [activeLobby, setActiveLobby] = useState<ChampionshipLobbySnapshot | null>(null);
  const [lobbyConnected, setLobbyConnected] = useState(false);
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const lobbyWsRef = useRef<ChampionshipLobbyWsHandle | null>(null);

  const currentUid = auth.currentUser?.uid || null;

  const disconnectLobby = useCallback(() => {
    lobbyWsRef.current?.disconnect();
    lobbyWsRef.current = null;
    setActiveLobby(null);
    setLobbyConnected(false);
    setLobbyError(null);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const overview = await fetchActiveChampionship();
      setData(overview);
      syncServerClock(overview.serverNowMs, overview.measuredRttMs || 0);
      if (!overview.isAdmin) {
        setActiveTab((prev) => (prev === 'ADMIN' ? 'OVERVIEW' : prev));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar dados do Campeonato de Clãs.'
      );
    } finally {
      setLoading(false);
    }
  }, [syncServerClock]);

  useEffect(() => {
    if (!isOpen) {
      disconnectLobby();
      return;
    }
    void loadData();

    // Detect Stripe return parameters cleanly
    try {
      const params = new URLSearchParams(window.location.search);
      const payStatus = params.get('championship_payment');
      if (payStatus === 'success') {
        setPaymentBanner(
          'Pagamento enviado ao Stripe! Assim que o webhook confirmar a transação, o status do clã mudará para CONFIRMADO.'
        );
        params.delete('championship_payment');
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
      } else if (payStatus === 'cancelled') {
        setPaymentBanner('Checkout cancelado. Você pode retomar o pagamento na aba Inscrição.');
        params.delete('championship_payment');
        const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
      }
    } catch {
      // ignore
    }

    const tickTimer = setInterval(() => {
      const anchor = clockAnchorRef.current;
      if (anchor && typeof performance !== 'undefined') {
        setSyncedServerNowMs(anchor.serverMs + Math.floor(performance.now() - anchor.perfMs));
      } else {
        setSyncedServerNowMs(Date.now());
      }
    }, 1000);
    const refreshTimer = setInterval(() => {
      void loadData();
    }, 30_000);

    return () => {
      clearInterval(tickTimer);
      clearInterval(refreshTimer);
      disconnectLobby();
    };
  }, [isOpen, loadData, disconnectLobby]);

  const handleLaunchRoom = useCallback(
    (roomCode: string, arenaMode: string) => {
      disconnectLobby();
      onLaunchChampionshipMatch?.(roomCode, (arenaMode as DrillMode) || 'DUST2_BOMB_5V5');
    },
    [disconnectLobby, onLaunchChampionshipMatch]
  );

  const handleEnterMatchLobby = useCallback(
    async (match: MatchRecord) => {
      setLobbyBusy(true);
      setLobbyError(null);
      try {
        const res = await requestMatchLobbyToken(match.id);
        disconnectLobby();
        setActiveLobby(res.lobby);
        syncServerClock(res.lobby.serverNowMs, 0);
        setActiveTab('OVERVIEW');

        lobbyWsRef.current = connectChampionshipLobbyWs(res.token, {
          onLobbyState: (lobby) => {
            setActiveLobby(lobby);
            syncServerClock(lobby.serverNowMs, 0);
          },
          onServerTimeSync: (serverTs, rttMs) => {
            syncServerClock(serverTs, rttMs);
          },
          onMatchLaunch: ({ privateRoomCode, arenaMode }) => {
            handleLaunchRoom(privateRoomCode, arenaMode);
          },
          onWoApplied: () => {
            setLobbyError('W.O. automático aplicado pelo servidor nesta partida.');
            void loadData();
          },
          onError: (message) => {
            setLobbyError(message);
          },
          onConnectionChange: (connected) => {
            setLobbyConnected(connected);
          },
        });
      } catch (err) {
        setLobbyError(
          err instanceof Error
            ? err.message
            : 'Não foi possível validar o token de entrada no lobby.'
        );
      } finally {
        setLobbyBusy(false);
      }
    },
    [disconnectLobby, handleLaunchRoom, loadData, syncServerClock]
  );

  if (!isOpen) return null;

  const syncedNowMs = syncedServerNowMs;

  const tabs: Array<{ id: ChampionshipTabId; label: string }> = [
    { id: 'OVERVIEW', label: 'VISÃO GERAL' },
    { id: 'SCHEDULE', label: 'TABELA DE JOGOS' },
    { id: 'STANDINGS', label: 'CLASSIFICAÇÃO' },
    { id: 'REGISTRATION', label: 'INSCRIÇÃO & ELENCO' },
    ...(data?.isAdmin ? [{ id: 'ADMIN' as const, label: 'PAINEL ADMIN' }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#050914]/95 backdrop-blur-md flex flex-col overflow-hidden text-white">
      {/* Top Header Bar */}
      <header className="shrink-0 border-b border-slate-800 bg-[#060B17] px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 bg-cyan-950/70 border border-cyan-500/50 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-400" fill="currentColor">
              <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-display font-black uppercase tracking-wider text-white truncate">
                CAMPEONATO DE CLÃS · KINETIC
              </h1>
              {data?.championship && (
                <span
                  className={`hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono uppercase border ${getChampionshipStatusColor(
                    data.championship.status
                  )}`}
                >
                  {getChampionshipStatusLabel(data.championship.status)}
                </span>
              )}
            </div>
            <p className="text-[11px] font-mono text-slate-400 truncate">
              LIGA OFICIAL 5V5 · PONTOS CORRIDOS + PLAYOFFS · SERVIDOR AUTORITATIVO
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadData()}
            className="px-3 py-1.5 border border-slate-700 hover:border-cyan-400/60 text-slate-300 hover:text-white font-mono text-xs uppercase cursor-pointer"
          >
            {loading ? 'ATUALIZANDO...' : 'ATUALIZAR'}
          </button>
          <button
            type="button"
            onClick={() => {
              disconnectLobby();
              onClose();
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-display font-bold text-xs uppercase cursor-pointer"
          >
            FECHAR
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="shrink-0 border-b border-slate-800 bg-[#080F1E] px-4 sm:px-6 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-xs font-display font-extrabold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                active
                  ? tab.id === 'ADMIN'
                    ? 'border-amber-400 text-amber-300'
                    : 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Main Scrollable Viewport */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto space-y-4">
          {paymentBanner && (
            <div className="border border-cyan-500/40 bg-cyan-950/30 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-cyan-200">
              <span>{paymentBanner}</span>
              <button
                type="button"
                onClick={() => setPaymentBanner(null)}
                className="font-mono text-cyan-300 hover:text-white cursor-pointer"
              >
                OK
              </button>
            </div>
          )}

          {error && (
            <div className="border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void loadData()}
                className="px-3 py-1 bg-rose-500/20 border border-rose-400/50 font-mono uppercase cursor-pointer"
              >
                TENTAR NOVAMENTE
              </button>
            </div>
          )}

          {!data && loading && (
            <div className="border border-slate-800 bg-[#0B1325] p-10 text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-cyan-300">
                SINCRONIZANDO DADOS OFICIAIS DO CAMPEONATO...
              </p>
            </div>
          )}

          {data?.championship && activeTab === 'OVERVIEW' && (
            <ChampionshipOverviewTab
              data={data}
              serverNowMs={syncedNowMs}
              currentUid={currentUid}
              activeLobby={activeLobby}
              lobbyConnected={lobbyConnected}
              lobbyBusy={lobbyBusy}
              lobbyError={lobbyError}
              onEnterMatchLobby={(match) => void handleEnterMatchLobby(match)}
              onLeaveMatchLobby={disconnectLobby}
              onToggleReady={(ready) => lobbyWsRef.current?.toggleReady(ready)}
              onUpdateLobbySnapshot={(lobby) => setActiveLobby(lobby)}
              onGoToRegistration={() => setActiveTab('REGISTRATION')}
              onLaunchPrivateRoom={handleLaunchRoom}
            />
          )}

          {data?.championship && activeTab === 'SCHEDULE' && (
            <ChampionshipScheduleTab
              matches={data.matches}
              myRegistration={data.myRegistration}
              serverNowMs={syncedNowMs}
              lobbyBusy={lobbyBusy}
              onEnterMatchLobby={(match) => void handleEnterMatchLobby(match)}
            />
          )}

          {data?.championship && activeTab === 'STANDINGS' && (
            <ChampionshipStandingsTab
              standings={data.standings}
              playoffSize={data.championship.playoffSize}
              myRegistration={data.myRegistration}
            />
          )}

          {data?.championship && activeTab === 'REGISTRATION' && (
            <ChampionshipRegistrationTab
              data={data}
              currentUid={currentUid}
              onRefresh={loadData}
              onOpenClanCenter={() => {
                onClose();
                onOpenClanCenter?.();
              }}
            />
          )}

          {data?.championship && data.isAdmin && activeTab === 'ADMIN' && (
            <ChampionshipAdminTab data={data} onRefresh={loadData} />
          )}
        </div>
      </div>
    </div>
  );
};

export const ChampionshipHubModal: React.FC<ChampionshipHubModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <ChampionshipModalErrorBoundary onClose={props.onClose}>
      <ChampionshipHubModalInner {...props} />
    </ChampionshipModalErrorBoundary>
  );
};
