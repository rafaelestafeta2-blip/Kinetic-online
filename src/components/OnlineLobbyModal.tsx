import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { DrillMode } from '../types/game';
import { OnlineRoomState } from '../multiplayer/onlineTypes';
import {
  createMultiplayerRoom,
  joinRoomByCode,
  leaveActiveRoom,
  startMatchInActiveRoom,
  subscribeOnlineRoom,
  switchLocalPlayerTeam,
} from '../multiplayer/onlineRoomService';
import { TeamVoiceCommsHud } from './TeamVoiceCommsHud';
import { thumbForDrillMode } from './mapSelectThumbs';

interface OnlineLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMapMode: DrillMode;
  onSelectMapMode: (mode: DrillMode) => void;
  onLaunchOnlineArena: (mode: DrillMode) => void;
}

const PRIVATE_ROOM_MAPS: DrillMode[] = [
  'STATION_TDM_5V5',
  'DUST2_BOMB_5V5',
  'ASSAULT_BOMB_5V5',
  'INDUSTRIA_BOMB_5V5',
  'HANGAR_BOMB_5V5',
  'EASTERN_CITY_BOMB_5V5',
  'MIRAGE_ANUBIS_BOMB_5V5',
  'CSGO_ASSAULT_BOMB_5V5',
  'DE_DST_BOMB_5V5',
  'MP_NUKED_BOMB_5V5',
  'DE_SUPPLY_BOMB_5V5',
  'YARD_BOMB_5V5',
];

const MAP_LABELS: Record<string, { title: string; subtitle: string }> = {
  STATION_TDM_5V5: {
    title: 'STATION ARENA',
    subtitle: 'Estação Urbana • Mata-Mata 5v5 (Alvo 40 Abates)',
  },
  STATION_CAPTURE_5V5: {
    title: 'STATION ARENA',
    subtitle: 'Estação Urbana • Captura de Bandeira 5v5 (6 Rodadas)',
  },
  DUST2_BOMB_5V5: { title: 'DE_DUST2', subtitle: 'Deserto Clássico • Bomb A / B' },
  ASSAULT_BOMB_5V5: { title: 'CS_ASSAULT', subtitle: 'Galpão Industrial • Bomb A / B' },
  INDUSTRIA_BOMB_5V5: { title: 'INDUSTRIA', subtitle: 'Pátio Industrial • Bomb A / B' },
  HANGAR_BOMB_5V5: { title: 'HANGAR', subtitle: 'Hangar Militar • Bomb A / B' },
  EASTERN_CITY_BOMB_5V5: { title: 'EASTERN CITY', subtitle: 'Cidade Leste • Bomb A / B' },
  MIRAGE_ANUBIS_BOMB_5V5: { title: 'MIRAGE ANUBIS', subtitle: 'Fortaleza Deserto • Bomb A / B' },
  CSGO_ASSAULT_BOMB_5V5: { title: 'CSGO ASSAULT HD', subtitle: 'Complexo Industrial • Bomb A / B' },
  DE_DST_BOMB_5V5: { title: 'DE_DST DESERT', subtitle: 'Arena Desértica • Bomb A / B' },
  MP_NUKED_BOMB_5V5: { title: 'MP_NUKED TOWN', subtitle: 'Vila Nuclear • Bomb A / B' },
  DE_SUPPLY_BOMB_5V5: { title: 'DE_SUPPLY BASE', subtitle: 'Base de Suprimentos • Bomb A / B' },
  YARD_BOMB_5V5: { title: 'YARD TÁTICO', subtitle: 'Pátio de Contêineres • Bomb A / B' },
};

export const OnlineLobbyModal: React.FC<OnlineLobbyModalProps> = ({
  isOpen,
  onClose,
  selectedMapMode,
  onSelectMapMode,
  onLaunchOnlineArena,
}) => {
  const [activeRoom, setActiveRoom] = useState<OnlineRoomState | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showMapPickerModal, setShowMapPickerModal] = useState(false);

  const arenaMode: DrillMode = PRIVATE_ROOM_MAPS.includes(selectedMapMode)
    ? selectedMapMode
    : 'DUST2_BOMB_5V5';

  useEffect(() => {
    const unsub = subscribeOnlineRoom((room) => {
      setActiveRoom(room);
      if (room && room.status === 'PLAYING' && isOpen) {
        onLaunchOnlineArena(room.arenaMode);
      }
    });
    return () => unsub();
  }, [isOpen, onLaunchOnlineArena]);

  if (!isOpen) return null;

  const currentMapMode = activeRoom?.arenaMode || arenaMode;
  const currentMapMeta = MAP_LABELS[currentMapMode] || MAP_LABELS.DUST2_BOMB_5V5;

  const handleSelectMapInRoom = async (mode: DrillMode) => {
    soundEngine.playMenuSelect();
    onSelectMapMode(mode);
    setShowMapPickerModal(false);
    if (activeRoom) {
      activeRoom.arenaMode = mode;
      setActiveRoom({ ...activeRoom });
    }
  };

  const handleCreatePrivateRoom = async () => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      await createMultiplayerRoom(arenaMode, true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao criar sala privada.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const res = await joinRoomByCode(joinCodeInput);
      if (!res.ok) {
        setErrorMessage(res.error || 'Sala não encontrada.');
      } else if (res.room && res.room.status === 'PLAYING') {
        onLaunchOnlineArena(res.room.arenaMode);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sala não encontrada.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyCode = () => {
    if (!activeRoom) return;
    navigator.clipboard?.writeText(activeRoom.roomId).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleLeaveLobby = async () => {
    await leaveActiveRoom();
    setActiveRoom(null);
    setErrorMessage(null);
  };

  const handleStartMatchNow = async () => {
    if (!activeRoom) return;
    setIsBusy(true);
    try {
      activeRoom.arenaMode = currentMapMode;
      await startMatchInActiveRoom();
      onLaunchOnlineArena(currentMapMode);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Falha ao iniciar partida.');
    } finally {
      setIsBusy(false);
    }
  };

  const playersList = activeRoom ? Object.values(activeRoom.players) : [];
  const vanguardPlayers = playersList.filter((p) => p.team === 'VANGUARD');
  const blackthornPlayers = playersList.filter((p) => p.team === 'BLACKTHORN');

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 pointer-events-auto"
    >
      <div
        className="w-full max-w-[740px] rounded-xl border border-[#c89b3c]/50 bg-[#0d1118] text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        style={{ fontFamily: "'Rajdhani', sans-serif" }}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#1a2230] via-[#131924] to-[#1a2230] border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <div>
              <h2
                className="text-sm sm:text-base font-bold uppercase tracking-[0.16em] text-[#f0e6d2]"
                style={{ fontFamily: "'Chakra Petch', sans-serif" }}
              >
                SALAS PRIVADAS & CUSTOM GAMES (X1 / TREINO DE CLÃ)
              </h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                Crie uma Sala por Código ou Entre no Código de um Amigo • Sem Bots
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/15 border border-white/15 text-xs font-bold uppercase tracking-wider text-slate-300 cursor-pointer"
          >
            ✕ Fechar
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="px-3 py-2 rounded bg-red-950/80 border border-red-500/60 text-xs text-red-200 font-semibold flex items-center justify-between">
              <span>⚠️ {errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage(null)} className="text-[10px] underline ml-3 cursor-pointer">
                Ocultar
              </button>
            </div>
          )}

          {/* BARRA DO MAPA DA SALA + BOTÃO PARA ABRIR O MENU FOCADO DE ESCOLHA DE MAPA */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#121824] border border-amber-500/40 shadow-inner">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={thumbForDrillMode(currentMapMode)}
                alt={currentMapMeta.title}
                className="w-20 h-12 rounded border border-amber-400/50 object-cover shrink-0"
                draggable={false}
              />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                  MAPA SELECIONADO PARA A SALA
                </div>
                <div className="text-base font-extrabold uppercase tracking-wider text-white truncate">
                  {currentMapMeta.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {currentMapMeta.subtitle}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                setShowMapPickerModal(true);
              }}
              className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-[0_0_16px_rgba(245,158,11,0.35)] shrink-0 cursor-pointer transition-all"
            >
              ESCOLHER MAPA 🗺️
            </button>
          </div>

          {!activeRoom ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-lg border border-emerald-500/35 bg-gradient-to-b from-emerald-950/30 to-black/60 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                    ANFITRIÃO (HOST DA SALA)
                  </div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white mt-0.5">
                    CRIAR SALA PRIVADA
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    Gera um código exclusivo de 6 dígitos para convidar amigos, escolher o mapa na sala e tirar X1.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleCreatePrivateRoom()}
                  className="mt-3 w-full py-2.5 rounded bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-xs font-extrabold uppercase tracking-[0.16em] text-black shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? 'CRIANDO SALA...' : '+ CRIAR SALA PRIVADA'}
                </button>
              </div>

              <div className="p-3.5 rounded-lg border border-[#c89b3c]/40 bg-gradient-to-b from-[#231c10]/60 to-black/60 flex flex-col justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f59e0b]">
                    ENTRAR EM SALA EXISTENTE
                  </div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-white mt-0.5">
                    DIGITAR CÓDIGO DE 6 DÍGITOS
                  </h3>
                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                    Recebeu o código de um amigo? Digite abaixo para entrar direto no lobby dele.
                  </p>
                </div>
                <form onSubmit={handleJoinByCode} className="mt-3 flex gap-1.5">
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="EX: K9X4P2"
                    className="flex-1 px-2.5 py-2 rounded bg-black/70 border border-white/20 text-xs font-mono uppercase tracking-[0.25em] text-amber-300 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    ENTRAR
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded bg-black/60 border border-[#c89b3c]/40">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-slate-300">CÓDIGO DA SALA:</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/60 font-mono text-sm font-extrabold tracking-[0.25em] text-amber-300">
                      {activeRoom.roomId}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-wider text-slate-200 cursor-pointer"
                    >
                      {copiedCode ? '✓ COPIADO' : 'COPIAR'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void switchLocalPlayerTeam()}
                    className="px-2.5 py-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-[11px] font-bold uppercase tracking-wider text-sky-200 cursor-pointer"
                  >
                    ⇄ TROCAR DE TIME
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLeaveLobby()}
                    className="px-2.5 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-400/50 text-[11px] font-bold uppercase tracking-wider text-red-200 cursor-pointer"
                  >
                    SAIR DA SALA
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded border border-sky-500/40 bg-sky-950/20">
                  <div className="flex items-center justify-between border-b border-sky-400/25 pb-1.5 mb-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-sky-300">🛡️ VANGUARD (DEFESA)</span>
                    <span className="text-[11px] font-mono text-sky-200">{vanguardPlayers.length} / 5</span>
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const p = vanguardPlayers[idx];
                      return (
                        <div
                          key={idx}
                          className={`px-2.5 py-1.5 rounded text-xs flex items-center justify-between ${
                            p ? 'bg-sky-500/15 border border-sky-400/40 text-white font-bold' : 'bg-black/40 border border-white/5 text-slate-500 italic'
                          }`}
                        >
                          <span>{p ? `● ${p.callsign}` : 'Slot Aberto'}</span>
                          {p && <span className="text-[10px] text-sky-300 font-mono">{p.weaponId}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-2.5 rounded border border-amber-500/40 bg-amber-950/20">
                  <div className="flex items-center justify-between border-b border-amber-400/25 pb-1.5 mb-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">⚔️ BLACKTHORN (ATAQUE)</span>
                    <span className="text-[11px] font-mono text-amber-200">{blackthornPlayers.length} / 5</span>
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: 5 }).map((_, idx) => {
                      const p = blackthornPlayers[idx];
                      return (
                        <div
                          key={idx}
                          className={`px-2.5 py-1.5 rounded text-xs flex items-center justify-between ${
                            p ? 'bg-amber-500/15 border border-amber-400/40 text-white font-bold' : 'bg-black/40 border border-white/5 text-slate-500 italic'
                          }`}
                        >
                          <span>{p ? `● ${p.callsign}` : 'Slot Aberto'}</span>
                          {p && <span className="text-[10px] text-amber-300 font-mono">{p.weaponId}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RÁDIO DE VOZ DA EQUIPE NO LOBBY (WebRTC P2P + PTT [V] / VOZ ABERTA) */}
              <TeamVoiceCommsHud variant="LOBBY" />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  Operadores na sala: <strong className="text-white">{playersList.length}/10</strong> (Início Manual p/ Treino ou X1)
                </span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleStartMatchNow()}
                  className="px-6 py-2.5 rounded bg-gradient-to-r from-[#d97706] via-[#f59e0b] to-[#d97706] text-xs font-extrabold uppercase tracking-[0.18em] text-black shadow-[0_0_20px_rgba(245,158,11,0.45)] cursor-pointer disabled:opacity-50"
                >
                  ▶ INICIAR PARTIDA PRIVADA
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MENU FOCADO DE ESCOLHA DE MAPA DA SALA PRIVADA */}
      {showMapPickerModal && (
        <div
          onClick={() => setShowMapPickerModal(false)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[680px] rounded-2xl border-2 border-amber-400/60 bg-[#0b1018] p-4 sm:p-5 shadow-2xl flex flex-col max-h-[88vh]"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div>
                <h3 className="font-display font-black text-base sm:text-lg uppercase tracking-wider text-amber-300">
                  SELECIONAR MAPA DA SALA PRIVADA
                </h3>
                <p className="text-xs font-mono text-slate-400">
                  Escolha o cenário oficial 5v5 para a partida customizada
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMapPickerModal(false)}
                className="px-3 py-1 rounded bg-white/10 hover:bg-white/20 text-xs font-mono font-bold text-slate-200 cursor-pointer"
              >
                VOLTAR ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto pr-1">
              {PRIVATE_ROOM_MAPS.map((mode) => {
                const active = currentMapMode === mode;
                const info = MAP_LABELS[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => void handleSelectMapInRoom(mode)}
                    className={`group rounded-xl border text-left transition-all cursor-pointer overflow-hidden flex flex-col ${
                      active
                        ? 'bg-amber-500/20 border-2 border-amber-400 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                        : 'bg-black/50 border-white/15 text-slate-300 hover:border-amber-400/50 hover:text-white'
                    }`}
                  >
                    <div className="relative h-24 w-full overflow-hidden">
                      <img
                        src={thumbForDrillMode(mode)}
                        alt={info.title}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                        draggable={false}
                      />
                      {active && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-[9px] uppercase">
                          ATIVO ✓
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="font-display font-black text-xs sm:text-sm uppercase tracking-wider text-white">
                        {info.title}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                        {info.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
