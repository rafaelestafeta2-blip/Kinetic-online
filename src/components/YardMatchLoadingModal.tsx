import React, { useEffect, useRef, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { BLACKTHORN_ROSTER, VANGUARD_ROSTER } from '../data/matchRoster';
import {
  getActivePlayerClanSummary,
  subscribeClanService,
} from '../firebase/clanService';
import {
  getCloudSyncState,
  getPlayerCallsign,
  subscribePlayerProfile,
} from '../firebase/playerCloudSync';
import {
  getActiveOnlineRoom,
  isOnlineMatchActive,
  publishLocalLoadProgress,
  subscribeOnlineRoom,
} from '../multiplayer/onlineRoomService';
import { OnlineRoomState } from '../multiplayer/onlineTypes';
import {
  getCallingCardById,
  getDeterministicFallbackCallingCard,
  getEquippedCallingCardId,
} from '../progression/callingCardsSystem';
import { getPlayerInventoryState } from '../progression/loadoutSystem';
import { DrillMode } from '../types/game';
import { isMapSpawnHarness } from '../three/mapModeUtils';
import { CallingCardArtBackdrop } from './CallingCardArtBackdrop';
import {
  ClanEmblemIcon,
  ClanEmblemId,
} from './ClanEmblemIcons';
import {
  BlackthornTeamEmblem,
  OperatorTacticalAvatar,
  VanguardTeamEmblem,
  WARFACE_CLASS_META,
  WarfaceClassIcon,
  WarfaceClassId,
} from './WarfaceClassIcons';
import { WarfaceRankIcon } from './WarfaceRankIcon';
import { TeamVoiceCommsHud } from './TeamVoiceCommsHud';
import { MAP_SELECT_THUMBS, thumbForDrillMode } from './mapSelectThumbs';

type LoadingRow = {
  callsign: string;
  title: string;
  classId: WarfaceClassId;
  isReady: boolean;
  isPlayer?: boolean;
  avatarDataUrl?: string;
  rankLevel: number;
  clanName?: string;
  clanEmblemId?: ClanEmblemId;
  callingCardId?: string;
};

const ModeHeaderEmblem: React.FC<{ mode: DrillMode }> = ({ mode }) => {
  const isTdm = mode === 'STATION_TDM_5V5';
  const isCapture = mode === 'STATION_CAPTURE_5V5';
  return (
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-gradient-to-b from-slate-700/80 via-slate-900/95 to-black border border-slate-400/50 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(255,255,255,0.12)]">
      <svg viewBox="0 0 32 32" className="w-5 h-5 sm:w-6 sm:h-6 text-slate-100" fill="none">
        {isTdm ? (
          <>
            <path d="M16 3L27 7.5V16.5C27 22.8 22.2 27.2 16 29C9.8 27.2 5 22.8 5 16.5V7.5L16 3Z" fill="rgba(255,255,255,0.08)" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 10L22 22M22 10L10 22" stroke="#f8fafc" strokeWidth="2.1" strokeLinecap="round" />
            <circle cx="16" cy="16" r="2.2" fill="#f59e0b" />
          </>
        ) : isCapture ? (
          <>
            <path d="M9 5V27" stroke="#f8fafc" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M10 6H24L20.5 11.5L24 17H10V6Z" fill="#f59e0b" fillOpacity="0.85" stroke="#fde68a" strokeWidth="1.3" />
          </>
        ) : (
          <>
            <rect x="7" y="10" width="18" height="13" rx="2.5" fill="rgba(255,255,255,0.08)" stroke="currentColor" strokeWidth="1.7" />
            <rect x="11" y="13.5" width="10" height="4" rx="1" fill="#f59e0b" />
            <path d="M12 10V7.5C12 6.4 12.9 5.5 14 5.5H18C19.1 5.5 20 6.4 20 7.5V10" stroke="#e2e8f0" strokeWidth="1.6" />
            <circle cx="16" cy="20" r="1.2" fill="#ef4444" />
          </>
        )}
      </svg>
    </div>
  );
};

const LoadingOperatorRow: React.FC<{
  op: LoadingRow;
  team: 'VANGUARD' | 'BLACKTHORN';
}> = ({ op, team }) => {
  const cardDef = op.callingCardId
    ? getCallingCardById(op.callingCardId)
    : getDeterministicFallbackCallingCard(op.callsign, team);
  const isVanguard = team === 'VANGUARD';

  return (
    <div
      className={`relative h-10 sm:h-12 rounded-[3px] overflow-hidden flex items-center justify-between border transition-all ${
        op.isReady
          ? 'border-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.28)]'
          : isVanguard
            ? 'border-sky-400/35'
            : 'border-red-500/35'
      }`}
    >
      {/* Premium customizable calling card artwork */}
      <CallingCardArtBackdrop card={cardDef} />

      {/* Left: Square Profile Avatar + Rank Corner Badge */}
      <div className="relative z-10 w-10 h-10 sm:w-12 sm:h-12 shrink-0 border-r border-white/15 bg-[#090d14] overflow-hidden">
        <OperatorTacticalAvatar
          team={team}
          classId={op.classId}
          photoUrl={op.avatarDataUrl}
        />
        <div
          className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded-sm bg-black/80 border border-amber-400/50 flex items-center justify-center shadow"
          title={`Patente Nível ${op.rankLevel}`}
        >
          <WarfaceRankIcon level={op.rankLevel} className="w-3 h-3" />
        </div>
      </div>

      {/* Center: Callsign + Discreet Class Icon + Clan Tag / Status */}
      <div className="relative z-10 flex-1 min-w-0 px-2 py-0.5 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`text-[10px] sm:text-xs font-display font-black tracking-wide truncate leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] ${
              op.isPlayer ? 'text-amber-300' : 'text-white'
            }`}
          >
            {op.callsign}
          </span>
          {/* Discreet class icon only (Fuzileiro / Médico / Engenheiro / Sniper) */}
          <span
            title={WARFACE_CLASS_META[op.classId]?.label}
            className="inline-flex items-center justify-center w-4 h-4 rounded-[2px] bg-black/55 border border-white/15 shrink-0 opacity-90"
          >
            <WarfaceClassIcon
              classId={op.classId}
              className="w-2.5 h-2.5 sm:w-3 sm:h-3"
              color={isVanguard ? '#bae6fd' : '#fecaca'}
            />
          </span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
          {op.clanName ? (
            <span className="text-[8px] sm:text-[9px] font-mono font-bold tracking-wider text-slate-300/95 truncate leading-none drop-shadow">
              [{op.clanName}]
            </span>
          ) : (
            <span
              className={`text-[8px] sm:text-[9px] font-mono uppercase tracking-wider truncate leading-none ${
                op.isReady ? 'text-emerald-300 font-bold' : 'text-slate-300/80'
              }`}
            >
              {op.title}
            </span>
          )}
          {op.clanName && (
            <span
              className={`text-[7px] sm:text-[8px] font-mono font-bold uppercase shrink-0 ${
                op.isReady ? 'text-emerald-300' : 'text-slate-400'
              }`}
            >
              · {op.isReady ? 'PRONTO' : op.title.replace('CARREGANDO ', '')}
            </span>
          )}
        </div>
      </div>

      {/* Right: Highlighted Clan Emblem (or subtle team crest when without clan) */}
      <div className="relative z-10 pr-2 pl-1 shrink-0 flex items-center justify-center">
        {op.clanName ? (
          <div
            title={`Clã ${op.clanName}`}
            className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
          >
            <ClanEmblemIcon
              emblemId={op.clanEmblemId || 'alpha_wolf'}
              className="w-7 h-7 sm:w-8 sm:h-8"
            />
          </div>
        ) : (
          <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center opacity-55">
            {isVanguard ? (
              <VanguardTeamEmblem className="w-5 h-5 sm:w-6 sm:h-6" />
            ) : (
              <BlackthornTeamEmblem className="w-5 h-5 sm:w-6 sm:h-6" />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface YardMatchLoadingModalProps {
  mode?: DrillMode;
  onPrepareMap?: (
    mode: DrillMode,
    onProgress: (pct: number, statusLabel: string) => void
  ) => Promise<void>;
  onComplete: () => void;
  /** Escape hatch when prepare hangs — return to menu. */
  onCancel?: () => void;
}

const TUTORIAL_STORAGE_KEY = 'kinetic_plant_bomb_tutorial_played';
const BRIEFING_DURATION_MS = 40000;
/** Soft UI countdown only — must NOT force-start match before GLB+collider ready. */
const ONLINE_BARRIER_TIMEOUT_MS = 45000;
/**
 * Soft wait for prepare. After this we settle: if prepare finishes soon, enter;
 * if still hung, abort (or force-enter TESTE MAPA) — never spin at 99% forever.
 */
const PREPARE_TIMEOUT_MS = 90000;
/** Industria/Hangar/Eastern/Mirage + operators are tens of MB on device storage. */
const HEAVY_MAP_PREPARE_TIMEOUT_MS = 180000;
/** TESTE MAPA must finish in seconds–low minutes; shorter hard deadline. */
const HARNESS_PREPARE_TIMEOUT_MS = 45000;
/** Extra wait when the file itself has not proven a floor yet. */
const PREPARE_DOWNLOAD_GRACE_MS = 45000;

export const YardMatchLoadingModal: React.FC<YardMatchLoadingModalProps> = ({
  mode = 'YARD_BOMB_5V5',
  onPrepareMap,
  onComplete,
  onCancel,
}) => {
  const [showRoster, setShowRoster] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isArenaReady, setIsArenaReady] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(40);
  const [isFirstTimeTutorial, setIsFirstTimeTutorial] = useState(false);
  const [statusText, setStatusText] = useState('INICIALIZANDO THREE.LOADINGMANAGER & DRACOLOADER...');
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomState | null>(null);
  const [profile, setProfile] = useState(() => getCloudSyncState().profile);
  const [localClan, setLocalClan] = useState(() => getActivePlayerClanSummary());

  const completedRef = useRef(false);
  const localMapReadyRef = useRef(false);
  const localReadyAtMsRef = useRef<number | null>(null);
  const lastBarrierPingMsRef = useRef(0);
  const lastProgressSentRef = useRef(-1);
  const onPrepareMapRef = useRef(onPrepareMap);
  onPrepareMapRef.current = onPrepareMap;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const mapCodeLabel =
    mode === 'DUST2_BOMB_5V5'
      ? 'DE_DUST2'
      : mode === 'INDUSTRIA_BOMB_5V5' || mode === 'MAP_TEST_INDUSTRIA'
        ? mode === 'MAP_TEST_INDUSTRIA'
          ? 'TESTE · INDUSTRIA'
          : 'INDUSTRIA'
        : mode === 'HANGAR_BOMB_5V5' || mode === 'MAP_TEST_HANGAR'
          ? mode === 'MAP_TEST_HANGAR'
            ? 'TESTE · HANGAR'
            : 'HANGAR'
          : mode === 'EASTERN_CITY_BOMB_5V5' || mode === 'MAP_TEST_EASTERN'
            ? mode === 'MAP_TEST_EASTERN'
              ? 'TESTE · EASTERN'
              : 'EASTERN CITY'
          : mode === 'MIRAGE_ANUBIS_BOMB_5V5' || mode === 'MAP_TEST_MIRAGE'
            ? mode === 'MAP_TEST_MIRAGE'
              ? 'TESTE · MIRAGE'
              : 'MIRAGE ANUBIS'
          : mode === 'CSGO_ASSAULT_BOMB_5V5'
            ? 'CSGO ASSAULT HD'
          : mode === 'DE_DST_BOMB_5V5'
            ? 'DE_DST DESERT'
          : mode === 'MP_NUKED_BOMB_5V5'
            ? 'MP_NUKED TOWN'
          : mode === 'DE_SUPPLY_BOMB_5V5'
            ? 'DE_SUPPLY BASE'
          : mode === 'YARD_V2_BOMB_5V5'
            ? 'YARD 2.0 HD'
          : mode === 'OBJECT_D17_BOMB_5V5'
            ? 'OBJECT D17 HD'
          : mode === 'STATION_CAPTURE_5V5' || mode === 'STATION_TDM_5V5'
            ? 'STATION ARENA'
          : mode === 'ASSAULT_BOMB_5V5'
          ? 'CS_ASSAULT'
          : mode === 'FREE_RANGE'
            ? 'ESTANDE DE TIRO'
            : mode === 'KILLHOUSE_BLITZ'
              ? 'KILLHOUSE CQB'
              : mode === 'TACTICAL_WAVE'
                ? 'CONTRA IA'
                : 'YARD';
  const bgScreenshot = thumbForDrillMode(
    mode === 'MAP_TEST_INDUSTRIA'
      ? 'INDUSTRIA_BOMB_5V5'
      : mode === 'MAP_TEST_HANGAR'
        ? 'HANGAR_BOMB_5V5'
        : mode === 'MAP_TEST_EASTERN'
          ? 'EASTERN_CITY_BOMB_5V5'
          : mode === 'MAP_TEST_MIRAGE'
            ? 'MIRAGE_ANUBIS_BOMB_5V5'
            : mode
  );
  const isOnline = isOnlineMatchActive();

  const finishLoading = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    soundEngine.stopPlantBombTutorial();
    soundEngine.stopMatchLoadingAmbient();
    onComplete();
  };

  useEffect(() => {
    const unsubRoom = subscribeOnlineRoom((room) => setOnlineRoom(room));
    const unsubProfile = subscribePlayerProfile((sync) => setProfile(sync.profile));
    const unsubClan = subscribeClanService(() => {
      setLocalClan(getActivePlayerClanSummary());
    });
    return () => {
      unsubRoom();
      unsubProfile();
      unsubClan();
    };
  }, []);

  // Barreira de sincronização online: libera a partida assim que TODOS os jogadores da sala chegarem a 100%
  // Se houver apenas o jogador local (ex: sala privada solo) ou a sala já tiver sido encerrada, libera imediatamente.
  useEffect(() => {
    if (!isOnline || !localMapReadyRef.current) return;
    const players = onlineRoom ? Object.values(onlineRoom.players || {}) : [];
    if (players.length <= 1) {
      setStatusText('ARENA 3D COMPILADA (100%) — INICIANDO!');
      const t = window.setTimeout(() => finishLoading(), 350);
      return () => window.clearTimeout(t);
    }
    const allReady = players.every(
      (p) =>
        p.isLoaded === true ||
        (p.loadProgress ?? 0) >= 100 ||
        p.connectionState === 'RECONNECTING'
    );
    if (allReady) {
      setStatusText('TODOS OS OPERADORES CONECTADOS E COMPILADOS (100%) — INICIANDO!');
      const t = window.setTimeout(() => finishLoading(), 450);
      return () => window.clearTimeout(t);
    }
  }, [isOnline, onlineRoom, isArenaReady]);

  useEffect(() => {
    let firstTime = false;
    try {
      firstTime = !isOnline && localStorage.getItem(TUTORIAL_STORAGE_KEY) !== 'true';
    } catch {}

    soundEngine.stopMenuMusic();
    soundEngine.playMatchLoadingAmbient();

    if (firstTime) {
      setIsFirstTimeTutorial(true);
      soundEngine.playPlantBombTutorial();
      try {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
      } catch {}
    }

    const revealTimer = window.setTimeout(() => setShowRoster(true), 500);
    let cancelled = false;
    const startTime = performance.now();

    if (isOnline) {
      publishLocalLoadProgress(5, false);
    }

    const harness = isMapSpawnHarness(mode);
    const heavyGlb =
      mode === 'INDUSTRIA_BOMB_5V5' ||
      mode === 'HANGAR_BOMB_5V5' ||
      mode === 'EASTERN_CITY_BOMB_5V5' ||
      mode === 'MIRAGE_ANUBIS_BOMB_5V5' ||
      mode === 'CSGO_ASSAULT_BOMB_5V5' ||
      mode === 'DE_DST_BOMB_5V5' ||
      mode === 'MP_NUKED_BOMB_5V5' ||
      mode === 'DE_SUPPLY_BOMB_5V5' ||
      mode === 'YARD_V2_BOMB_5V5' ||
      mode === 'OBJECT_D17_BOMB_5V5' ||
      mode === 'STATION_CAPTURE_5V5' ||
      mode === 'STATION_TDM_5V5' ||
      mode === 'FREE_RANGE' ||
      mode === 'MAP_TEST_INDUSTRIA' ||
      mode === 'MAP_TEST_HANGAR' ||
      mode === 'MAP_TEST_EASTERN' ||
      mode === 'MAP_TEST_MIRAGE';
    const prepareLimitMs = harness
      ? HARNESS_PREPARE_TIMEOUT_MS
      : heavyGlb
        ? HEAVY_MAP_PREPARE_TIMEOUT_MS
        : PREPARE_TIMEOUT_MS;
    let lastRealPct = 0;

    const abortToMenu = (msg: string) => {
      if (cancelled || completedRef.current) return;
      setStatusText(msg);
      setProgress((p) => Math.max(p, 99));
      localMapReadyRef.current = false;
      setIsArenaReady(false);
      // Never leave VS at 99% forever — clear after a beat if CANCELAR wired.
      window.setTimeout(() => {
        if (cancelled || completedRef.current) return;
        const cancelFn = onCancelRef.current;
        if (cancelFn) {
          completedRef.current = true;
          cancelFn();
        }
      }, 2500);
    };

    const runRealPreparation = async () => {
      const prepareFn = onPrepareMapRef.current;
      try {
        if (prepareFn) {
          const preparePromise = prepareFn(mode, (pct, label) => {
            if (cancelled) return;
            const clamped = Math.min(100, Math.max(0, Math.round(pct)));
            lastRealPct = Math.max(lastRealPct, clamped);
            setProgress((prev) => Math.max(prev, clamped));
            setStatusText(label);
            if (isOnline && clamped - lastProgressSentRef.current >= 20 && clamped < 100) {
              lastProgressSentRef.current = clamped;
              publishLocalLoadProgress(clamped, false);
            }
          });
          const timed = await Promise.race([
            preparePromise.then(() => 'ok' as const),
            new Promise<'timeout'>((resolve) => {
              window.setTimeout(() => resolve('timeout'), prepareLimitMs);
            }),
          ]);
          if (timed === 'timeout') {
            console.warn('Arena prepare soft-timeout:', mode, 'pct', lastRealPct);
            if (cancelled) return;
            // ≥70 means the GLB and the floor collider are already in the scene.
            // Warmups after that have their own limits, so wait them out instead
            // of dumping the player back to the menu at a fake 99%.
            if (lastRealPct >= 70) {
              setStatusText('PISO DO MAPA PRONTO — FINALIZANDO OPERADORES E GPU...');
              try {
                await preparePromise;
              } catch (err) {
                console.error('Erro ao preparar arena 3D:', err);
                if (!cancelled) {
                  abortToMenu(
                    'FALHA NO GLB/COLISOR — VOLTANDO AO MENU (NÃO INICIAR NO VOID)'
                  );
                }
                return;
              }
            } else {
              setStatusText(
                'MAPA AINDA BAIXANDO — MAIS UM POUCO ANTES DE VOLTAR AO MENU...'
              );
              const settled = await Promise.race([
                preparePromise.then(() => 'ok' as const),
                new Promise<'timeout'>((resolve) => {
                  window.setTimeout(() => resolve('timeout'), PREPARE_DOWNLOAD_GRACE_MS);
                }),
              ]);
              if (settled === 'timeout') {
                if (cancelled) return;
                abortToMenu(
                  harness
                    ? 'TIMEOUT TESTE MAPA — VOLTANDO AO MENU (TOQUE CANCELAR SE TRAVAR)'
                    : 'O MAPA NÃO TERMINOU DE BAIXAR — VOLTANDO AO MENU'
                );
                return;
              }
            }
          }
        }
        if (cancelled) return;
        localMapReadyRef.current = true;
        localReadyAtMsRef.current = performance.now();
        lastBarrierPingMsRef.current = performance.now();
        setProgress(100);
        setIsArenaReady(true);

        if (isOnline) {
          publishLocalLoadProgress(100, true, true);
          const currentRoom = getActiveOnlineRoom();
          const currentPlayerCount = currentRoom
            ? Object.keys(currentRoom.players || {}).length
            : 0;
          if (currentPlayerCount <= 1) {
            setStatusText('ARENA 3D COMPILADA (100%) — INICIANDO!');
            window.setTimeout(() => {
              if (!cancelled) finishLoading();
            }, 350);
          } else {
            setStatusText('AGUARDANDO TODOS OS JOGADORES DA SALA CARREGAREM OS RECURSOS 3D...');
          }
        } else if (!firstTime) {
          window.setTimeout(() => {
            if (!cancelled) finishLoading();
          }, 350);
        }
      } catch (err) {
        console.error('Erro ao preparar arena 3D:', err);
        if (!cancelled) {
          abortToMenu(
            'FALHA NO GLB/COLISOR — VOLTANDO AO MENU (NÃO INICIAR NO VOID)'
          );
        }
      }
    };

    void runRealPreparation();

    const tick = window.setInterval(() => {
      const nowPerf = performance.now();
      const elapsed = nowPerf - startTime;
      const remainingSec = Math.max(0, Math.ceil((BRIEFING_DURATION_MS - elapsed) / 1000));
      setSecondsLeft(remainingSec);

      // Heartbeat moves the bar while bytes are in flight, but it must not
      // pretend the match is at 99% and then kick back to the menu.
      if (!localMapReadyRef.current) {
        setProgress((prev) => {
          if (prev >= 99) return prev;
          const softCap = Math.min(96, Math.max(lastRealPct, 6) + 12);
          const soft = Math.min(softCap, Math.floor(elapsed / 900));
          return Math.max(prev, soft);
        });
      }

      if (
        !localMapReadyRef.current &&
        elapsed >= PREPARE_TIMEOUT_MS &&
        !completedRef.current
      ) {
        setStatusText(
          'AINDA EM WARMUP GPU/GRANADA… SE TRAVAR, TOQUE CANCELAR'
        );
      }

      if (isOnline && localMapReadyRef.current && !completedRef.current) {
        if (nowPerf - lastBarrierPingMsRef.current >= 1500) {
          lastBarrierPingMsRef.current = nowPerf;
          publishLocalLoadProgress(100, true, true);
        }
        const waitAfterReadyMs =
          localReadyAtMsRef.current !== null ? nowPerf - localReadyAtMsRef.current : 0;
        if (waitAfterReadyMs >= ONLINE_BARRIER_TIMEOUT_MS) {
          window.clearInterval(tick);
          finishLoading();
        }
      } else if (firstTime && localMapReadyRef.current && elapsed >= BRIEFING_DURATION_MS && !completedRef.current) {
        window.clearInterval(tick);
        finishLoading();
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(revealTimer);
      window.clearInterval(tick);
      soundEngine.stopPlantBombTutorial();
      soundEngine.stopMatchLoadingAmbient();
    };
  }, [mode, isOnline]);

  const onlinePlayers = onlineRoom ? Object.values(onlineRoom.players || {}) : [];
  const onlineReadyCount = onlinePlayers.filter((p) => p.isLoaded || (p.loadProgress ?? 0) >= 100).length;

  const playerSelectedClass = getPlayerInventoryState().selectedClass;
  const localCallingCardId = getEquippedCallingCardId();
  const localCallsign = profile.callsign || getPlayerCallsign();

  const modeHeaderTitle =
    mode === 'STATION_TDM_5V5'
      ? 'MATA-MATA EM EQUIPE'
      : mode === 'STATION_CAPTURE_5V5'
        ? 'CAPTURA DE BANDEIRA'
        : mode === 'FREE_RANGE'
          ? 'ESTANDE DE TIRO'
          : mode === 'KILLHOUSE_BLITZ'
            ? 'KILLHOUSE CQB'
            : mode === 'TACTICAL_WAVE'
              ? 'COMBATE CONTRA IA'
              : 'PLANTAR A BOMBA';

  const modeObjectiveSubtitle =
    mode === 'STATION_TDM_5V5'
      ? 'Elimine inimigos. Alcance a pontuação limite.'
      : mode === 'STATION_CAPTURE_5V5'
        ? 'Capture a bandeira inimiga e leve até a sua base.'
        : mode === 'FREE_RANGE'
          ? 'Calibre sua mira e teste armamentos no estande.'
          : 'Plante ou desarme a C4 nos alvos táticos A ou B.';

  const privateWithBots = Boolean(onlineRoom?.isPrivate && onlineRoom?.includeBots);

  const onlineVanguardHumans: LoadingRow[] = onlinePlayers
    .filter((p) => p.team === 'VANGUARD')
    .map((p) => {
      const isLocal = p.uid === profile.uid || p.callsign === localCallsign;
      const ready = Boolean(p.isLoaded || (p.loadProgress ?? 0) >= 100);
      const isReconnecting = !isLocal && p.connectionState === 'RECONNECTING';
      const realClanName = (isLocal ? localClan?.clanName : undefined) || p.clanName;
      const realClanEmblem = ((isLocal ? localClan?.clanEmblemId : undefined) ||
        p.clanEmblemId) as ClanEmblemId | undefined;
      return {
        callsign: p.callsign,
        title: isReconnecting ? 'RECONECTANDO...' : ready ? '✓ PRONTO' : `${p.loadProgress ?? 0}%`,
        classId: isLocal ? playerSelectedClass : (p.classId || 'FUZILEIRO'),
        isPlayer: isLocal,
        isReady: ready,
        avatarDataUrl: (isLocal ? profile.avatarDataUrl : undefined) || p.avatarDataUrl,
        rankLevel: p.rankLevel || (isLocal ? profile.rankLevel : 1),
        clanName: realClanName || undefined,
        clanEmblemId: realClanName ? realClanEmblem || 'alpha_wolf' : undefined,
        callingCardId: isLocal ? localCallingCardId : p.callingCardId,
      };
    });

  const onlineBlackthornHumans: LoadingRow[] = onlinePlayers
    .filter((p) => p.team === 'BLACKTHORN')
    .map((p) => {
      const isLocal = p.uid === profile.uid || p.callsign === localCallsign;
      const ready = Boolean(p.isLoaded || (p.loadProgress ?? 0) >= 100);
      const isReconnecting = !isLocal && p.connectionState === 'RECONNECTING';
      const realClanName = (isLocal ? localClan?.clanName : undefined) || p.clanName;
      const realClanEmblem = ((isLocal ? localClan?.clanEmblemId : undefined) ||
        p.clanEmblemId) as ClanEmblemId | undefined;
      return {
        callsign: p.callsign,
        title: isReconnecting ? 'RECONECTANDO...' : ready ? '✓ PRONTO' : `${p.loadProgress ?? 0}%`,
        classId: isLocal ? playerSelectedClass : (p.classId || 'ENGENHEIRO'),
        isPlayer: isLocal,
        isReady: ready,
        avatarDataUrl: (isLocal ? profile.avatarDataUrl : undefined) || p.avatarDataUrl,
        rankLevel: p.rankLevel || (isLocal ? profile.rankLevel : 1),
        clanName: realClanName || undefined,
        clanEmblemId: realClanName ? realClanEmblem || 'alpha_wolf' : undefined,
        callingCardId: isLocal ? localCallingCardId : p.callingCardId,
      };
    });

  const vanguardBotFillers: LoadingRow[] = privateWithBots
    ? VANGUARD_ROSTER.filter((op) => !op.isPlayer)
        .slice(0, Math.max(0, 5 - onlineVanguardHumans.length))
        .map((op, idx) => ({
          callsign: `[BOT] ${op.callsign}`,
          title: 'IA TÁTICA · PRONTO',
          classId: op.classId,
          isPlayer: false,
          isReady: true,
          rankLevel: 20 + idx * 8,
        }))
    : [];

  const blackthornBotFillers: LoadingRow[] = privateWithBots
    ? BLACKTHORN_ROSTER.slice(0, Math.max(0, 5 - onlineBlackthornHumans.length)).map(
        (op, idx) => ({
          callsign: `[BOT] ${op.callsign}`,
          title: 'IA TÁTICA · PRONTO',
          classId: op.classId,
          isPlayer: false,
          isReady: true,
          rankLevel: 22 + idx * 8,
        })
      )
    : [];

  const vanguardDisplay: LoadingRow[] = isOnline
    ? [...onlineVanguardHumans, ...vanguardBotFillers]
    : VANGUARD_ROSTER.map((op, idx) => ({
        callsign: op.isPlayer ? `${localCallsign}` : op.callsign,
        title: op.isPlayer ? 'PRONTO' : op.title,
        classId: op.isPlayer ? playerSelectedClass : op.classId,
        isPlayer: op.isPlayer,
        isReady: isArenaReady,
        avatarDataUrl: op.isPlayer ? profile.avatarDataUrl : undefined,
        rankLevel: op.isPlayer ? profile.rankLevel : 55 + idx * 12,
        clanName: op.isPlayer ? localClan?.clanName : undefined,
        clanEmblemId:
          op.isPlayer && localClan?.clanName ? localClan.clanEmblemId : undefined,
        callingCardId: op.isPlayer ? localCallingCardId : undefined,
      }));

  const blackthornDisplay: LoadingRow[] = isOnline
    ? [...onlineBlackthornHumans, ...blackthornBotFillers]
    : BLACKTHORN_ROSTER.map((op, idx) => ({
        ...op,
        isReady: isArenaReady,
        rankLevel: 48 + idx * 11,
      }));

  const clampedPct = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="fixed inset-0 z-50 h-[100dvh] max-h-[100dvh] bg-[#04060a] text-white select-none overflow-hidden flex flex-col justify-between font-sans">
      {/* Dark atmospheric blurred map backdrop */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#111927_0%,_#06090f_68%,_#020306_100%)]">
        <img
          src={bgScreenshot}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.dataset.fallbackApplied) {
              img.dataset.fallbackApplied = '1';
              img.src = MAP_SELECT_THUMBS.hangar;
            } else {
              img.style.display = 'none';
            }
          }}
          className="w-full h-full object-cover object-center scale-105 brightness-[0.22] blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#030509]/92 via-[#04070d]/72 to-[#030509]/96" />
      </div>

      {/* 1. TOP HEADER: Mode Emblem + Vertical Accent + Mode Title + Map Name + Subtitle */}
      <header className="relative z-10 shrink-0 px-3 sm:px-7 pt-2.5 sm:pt-4 pb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <ModeHeaderEmblem mode={mode} />
          <div className="w-[2px] h-9 sm:h-11 bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700/40 shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="text-[9px] sm:text-[11px] font-mono font-bold tracking-[0.22em] text-slate-300 uppercase truncate">
              {modeHeaderTitle}
            </div>
            <h1 className="text-base sm:text-2xl font-display font-black tracking-[0.1em] text-white uppercase truncate leading-none mt-0.5">
              {mapCodeLabel}
            </h1>
            <p className="text-[8px] sm:text-[10px] font-sans text-slate-400 truncate mt-0.5">
              {modeObjectiveSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isOnline && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[8px] sm:text-[9px] font-mono font-bold whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ONLINE {onlineReadyCount}/{onlinePlayers.length}
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={() => {
                completedRef.current = true;
                soundEngine.stopPlantBombTutorial();
                soundEngine.stopMatchLoadingAmbient();
                onCancel();
              }}
              className="px-2.5 py-1 rounded bg-red-950/75 hover:bg-red-900 border border-red-400/50 text-red-200 font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider cursor-pointer touch-manipulation"
            >
              CANCELAR
            </button>
          )}
        </div>
      </header>

      {/* 2. CENTER 3-COLUMN ROSTER & MAP POSTER (Blue Left | Center Map Poster | Red Right) */}
      <div
        className={`relative z-10 flex-1 min-h-0 px-3 sm:px-7 py-1.5 flex items-center justify-center transition-all duration-500 ${
          showRoster ? 'opacity-100 scale-100' : 'opacity-90 scale-[0.99]'
        }`}
      >
        <div className="w-full max-w-6xl h-full max-h-[340px] grid grid-cols-12 gap-2 sm:gap-4 items-center">
          {/* LEFT TEAM: VANGUARD (Blue Glow Frame) */}
          <div className="col-span-4 h-full flex flex-col justify-center min-h-0">
            <div className="rounded-[4px] border border-sky-400/40 bg-[#050a12]/80 p-1.5 sm:p-2 shadow-[0_0_26px_rgba(14,165,233,0.18)] flex flex-col gap-1 sm:gap-1.5 max-h-full overflow-y-auto">
              {vanguardDisplay.length > 0 ? (
                vanguardDisplay.map((op) => (
                  <LoadingOperatorRow
                    key={`vg-${op.callsign}`}
                    op={op}
                    team="VANGUARD"
                  />
                ))
              ) : (
                <div className="h-10 flex items-center justify-center font-mono text-[9px] text-sky-300/60 uppercase">
                  Aguardando Vanguard...
                </div>
              )}
            </div>
          </div>

          {/* CENTER: MAP POSTER CARD (Photo + Map Name) */}
          <div className="col-span-4 h-full flex items-center justify-center min-h-0 px-1 sm:px-3">
            <div className="relative w-full max-w-[230px] h-full max-h-[310px] rounded-[4px] overflow-hidden border border-white/20 bg-[#0a0f18] shadow-[0_14px_40px_rgba(0,0,0,0.85)] flex flex-col">
              <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                <img
                  src={bgScreenshot}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallbackApplied) {
                      img.dataset.fallbackApplied = '1';
                      img.src = MAP_SELECT_THUMBS.hangar;
                    } else {
                      img.style.display = 'none';
                    }
                  }}
                  className="w-full h-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080c14] via-transparent to-black/30" />
              </div>

              <div className="shrink-0 py-1.5 sm:py-2 px-2 bg-[#0a0d14]/95 border-t border-white/15 text-center">
                <div className="font-display font-black text-[11px] sm:text-sm tracking-[0.22em] text-slate-100 uppercase truncate">
                  {mapCodeLabel}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT TEAM: BLACKTHORN (Red Glow Frame) */}
          <div className="col-span-4 h-full flex flex-col justify-center min-h-0">
            <div className="rounded-[4px] border border-red-500/40 bg-[#120608]/80 p-1.5 sm:p-2 shadow-[0_0_26px_rgba(239,68,68,0.18)] flex flex-col gap-1 sm:gap-1.5 max-h-full overflow-y-auto">
              {blackthornDisplay.length > 0 ? (
                blackthornDisplay.map((op) => (
                  <LoadingOperatorRow
                    key={`bt-${op.callsign}`}
                    op={op}
                    team="BLACKTHORN"
                  />
                ))
              ) : (
                <div className="h-10 flex items-center justify-center font-mono text-[9px] text-red-300/60 uppercase">
                  Aguardando Blackthorn...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM LOADING BAR: Slim Golden Progress Bar + Percentage */}
      <footer className="relative z-10 shrink-0 px-4 sm:px-8 pb-2.5 sm:pb-4 pt-1 flex flex-col items-center gap-1.5">
        {isOnline && (
          <div className="w-full max-w-2xl">
            <TeamVoiceCommsHud variant="LOADING_COMPACT" />
          </div>
        )}

        <div className="w-full max-w-2xl flex flex-col items-center">
          <div className="flex items-center gap-2 text-[9px] sm:text-[10px] font-mono font-bold tracking-[0.26em] text-slate-200 uppercase mb-1">
            <span>CARREGANDO MAPA...</span>
            {isFirstTimeTutorial && (
              <span className="text-amber-400">· BRIEFING {secondsLeft}S</span>
            )}
          </div>

          <div className="w-full flex items-center gap-2.5">
            <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-200 shadow-[0_0_12px_rgba(251,191,36,0.75)] transition-all duration-150"
                style={{ width: `${clampedPct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] sm:text-xs font-bold text-slate-200 tabular-nums shrink-0 w-9 text-right">
              {clampedPct}%
            </span>
          </div>

          <div className="w-full text-center font-mono text-[8px] sm:text-[9px] text-slate-400/90 truncate mt-0.5">
            {statusText}
          </div>
        </div>
      </footer>
    </div>
  );
};
