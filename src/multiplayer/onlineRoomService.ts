import { collection, deleteField, doc, getDoc, getDocs, limit, onSnapshot, query, setDoc, Unsubscribe, updateDoc, where } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase/firebaseClient';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import { registerMatchProgressionGate } from '../progression/matchProgressionGate';
import { getEquippedWeaponSkinId, getPlayerInventoryState } from '../progression/loadoutSystem';
import { runtimeTelemetry } from '../telemetry/runtimeTelemetry';
import { DrillMode, WarfaceClassId, WeaponId } from '../types/game';
import { applyIncomingPlayerState } from './combatNetcode';
import {
  buildClassSupportEvent,
  ClassSupportNetKind,
  ClassSupportPacket,
  sendClassSupportWs,
} from './classSupportNetcode';
import {
  persistRoomMatchMeta,
  publishRoomCombatHit,
  publishRoomLoadProgress,
  publishRoomPlayerTransform,
  resetCombatNetcodeThrottle,
} from './onlineTelemetryPublisher';
import {
  getTeamSpawnForArena,
  MatchQueueType,
  OnlineGrenadeEvent,
  OnlineHitEvent,
  OnlinePlayerState,
  OnlineRoomState,
  OnlineRoundEvent,
  OnlineScorestreakEvent,
  OnlineTeam,
} from './onlineTypes';
import { pushPeerPose, resetPeerSnapshotBuffers } from './peerSnapshotBuffer';

export interface OnlineBombEvent {
  bombStatus: OnlineRoomState['bombStatus'];
  plantedSite: OnlineRoomState['plantedSite'];
  ts: number;
}

type RoomSubscriber = (room: OnlineRoomState | null) => void;
type HitSubscriber = (hit: OnlineHitEvent) => void;
type GrenadeSubscriber = (evt: OnlineGrenadeEvent) => void;
type ScorestreakSubscriber = (evt: OnlineScorestreakEvent) => void;
type ClassSupportSubscriber = (evt: ClassSupportPacket) => void;
type BombSubscriber = (evt: OnlineBombEvent) => void;
type RoundSubscriber = (evt: OnlineRoundEvent) => void;

const roomSubscribers = new Set<RoomSubscriber>();
const hitSubscribers = new Set<HitSubscriber>();
const grenadeSubscribers = new Set<GrenadeSubscriber>();
const scorestreakSubscribers = new Set<ScorestreakSubscriber>();
const classSupportSubscribers = new Set<ClassSupportSubscriber>();
const bombSubscribers = new Set<BombSubscriber>();
const roundSubscribers = new Set<RoundSubscriber>();
const processedHitIds = new Set<string>();
const processedGrenadeIds = new Set<string>();
const processedScorestreakIds = new Set<string>();
const processedClassSupportIds = new Set<string>();
const processedRoundEventIds = new Set<string>();

let activeRoom: OnlineRoomState | null = null;
let roomUnsub: Unsubscribe | null = null;
let wsClient: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsPingTimer: ReturnType<typeof setInterval> | null = null;
let wsReconnectAttempts = 0;
let intentionalWsClose = false;
let wsConnected = false;

function rememberRoundEventId(eventId: string): void {
  if (!eventId) return;
  processedRoundEventIds.add(eventId);
  if (processedRoundEventIds.size > 150) {
    const first = processedRoundEventIds.values().next().value;
    if (first) processedRoundEventIds.delete(first);
  }
}

function rememberGrenadeEventId(eventId: string): void {
  if (!eventId) return;
  processedGrenadeIds.add(eventId);
  if (processedGrenadeIds.size > 150) {
    const first = processedGrenadeIds.values().next().value;
    if (first) processedGrenadeIds.delete(first);
  }
}

function rememberScorestreakEventId(eventId: string): void {
  if (!eventId) return;
  processedScorestreakIds.add(eventId);
  if (processedScorestreakIds.size > 120) {
    const first = processedScorestreakIds.values().next().value;
    if (first) processedScorestreakIds.delete(first);
  }
}

export function isWebSocketConnected(): boolean {
  return wsConnected && wsClient !== null && wsClient.readyState === WebSocket.OPEN;
}

type VoiceWireHandler = (msg: Record<string, unknown>) => void;
let voiceWireHandler: VoiceWireHandler | null = null;

export function registerVoiceWireHandler(fn: VoiceWireHandler | null): void {
  voiceWireHandler = fn;
}

export function sendRawWsMessage(payload: Record<string, unknown>): boolean {
  if (!wsClient || wsClient.readyState !== WebSocket.OPEN) return false;
  try {
    wsClient.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function getLocalEffectiveUid(): string {
  return getEffectiveLocalUid();
}

function emitRoomState(): void {
  const snapshot = activeRoom ? { ...activeRoom, players: { ...activeRoom.players } } : null;
  roomSubscribers.forEach((fn) => fn(snapshot));
}

function rememberHitEventId(eventId: string): void {
  if (!eventId) return;
  processedHitIds.add(eventId);
  if (processedHitIds.size > 250) {
    const first = processedHitIds.values().next().value;
    if (first) processedHitIds.delete(first);
  }
}

function dispatchHitOnce(hit: OnlineHitEvent): void {
  if (!hit || !hit.eventId || processedHitIds.has(hit.eventId)) return;
  rememberHitEventId(hit.eventId);
  hitSubscribers.forEach((fn) => fn(hit));
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

let sessionFallbackUid = '';
function getEffectiveLocalUid(): string {
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  const syncUid = getCloudSyncState().profile.uid;
  if (syncUid && syncUid !== 'guest') return syncUid;
  if (!sessionFallbackUid) {
    try {
      sessionFallbackUid = localStorage.getItem('tactical_op_uid') || '';
      if (!sessionFallbackUid) {
        sessionFallbackUid = `op_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem('tactical_op_uid', sessionFallbackUid);
      }
    } catch {
      sessionFallbackUid = `op_${Math.random().toString(36).slice(2, 10)}`;
    }
  }
  return sessionFallbackUid;
}

function createInitialLocalPlayerState(arenaMode: DrillMode, team: OnlineTeam, slotIndex = 0): OnlinePlayerState {
  const sync = getCloudSyncState();
  const inv = getPlayerInventoryState();
  const uid = getEffectiveLocalUid();
  const spawn = getTeamSpawnForArena(arenaMode, team, slotIndex);
  const mmr = Number(sync.profile.mmr) > 0 ? Number(sync.profile.mmr) : 2450;
  return {
    uid, callsign: sync.profile.callsign || 'OPERADOR', team,
    rankLevel: sync.profile.rankLevel || 1, mmr,
    avatarDataUrl:
      sync.profile.avatarDataUrl && sync.profile.avatarDataUrl.length <= 65000
        ? sync.profile.avatarDataUrl
        : '',
    weaponId: sync.profile.activeWeapon || 'M4_CARBINE',
    weaponSkinId: getEquippedWeaponSkinId(sync.profile.activeWeapon || 'M4_CARBINE'),
    classId: inv.selectedClass || 'FUZILEIRO',
    x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw, pitch: 0,
    health: 100, armor: 100, isDown: false, isCrouching: false, isFiring: false,
    kills: 0, deaths: 0, assists: 0, headshots: 0, loadProgress: 0, isLoaded: false,
    lastShotAtMs: 0, updatedAtMs: Date.now(),
  };
}

function mergePreservingFresherPlayers(
  currentPlayers: Record<string, OnlinePlayerState>,
  incomingPlayers: Record<string, OnlinePlayerState>,
  isPlaying: boolean
): Record<string, OnlinePlayerState> {
  const merged: Record<string, OnlinePlayerState> = { ...currentPlayers };
  for (const [uid, remote] of Object.entries(incomingPlayers)) {
    if (!uid || !remote) continue;
    const existing = currentPlayers[uid];
    if (!existing) {
      merged[uid] = remote;
      continue;
    }
    const existingTs = existing.updatedAtMs || 0;
    const remoteTs = remote.updatedAtMs || 0;
    if (isPlaying || existingTs >= remoteTs) {
      // Preserve live WebSocket transform/vitals; accept newer lobby/load/classId metadata if any.
      merged[uid] = {
        ...remote,
        ...existing,
        classId: existing.classId || remote.classId || 'FUZILEIRO',
        loadProgress: Math.max(existing.loadProgress || 0, remote.loadProgress || 0),
        isLoaded: Boolean(existing.isLoaded || remote.isLoaded),
      };
    } else {
      merged[uid] = {
        ...existing,
        ...remote,
        classId: remote.classId || existing.classId || 'FUZILEIRO',
      };
    }
  }
  return merged;
}

function clearWsReconnectTimer(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
}

function clearWsPingTimer(): void {
  if (wsPingTimer) {
    clearInterval(wsPingTimer);
    wsPingTimer = null;
  }
}

function startWsPingTimer(ws: WebSocket): void {
  clearWsPingTimer();
  const sendPing = () => {
    if (wsClient !== ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify({ type: 'PING', clientTs: Date.now() }));
    } catch {
      // ignore transient ws write error
    }
  };
  sendPing();
  wsPingTimer = setInterval(sendPing, 10000);
}

function scheduleWsReconnect(): void {
  if (intentionalWsClose || !activeRoom || activeRoom.status === 'FINISHED') return;
  if (wsReconnectTimer) return;
  const delayMs = wsReconnectAttempts === 0 ? 1200 : wsReconnectAttempts === 1 ? 2500 : 5000;
  wsReconnectAttempts += 1;
  wsReconnectTimer = setTimeout(() => {
    wsReconnectTimer = null;
    if (intentionalWsClose || !activeRoom || activeRoom.status === 'FINISHED') return;
    const localPlayer =
      getLocalOnlinePlayerState() ||
      createInitialLocalPlayerState(activeRoom.arenaMode, 'VANGUARD', 0);
    connectWebSocketForRoom(activeRoom, localPlayer);
  }, delayMs);
}

function connectWebSocketForRoom(room: OnlineRoomState, player: OnlinePlayerState): void {
  if (typeof window === 'undefined') return;
  clearWsReconnectTimer();
  intentionalWsClose = false;
  wsConnected = false;

  try {
    if (wsClient) {
      const prev = wsClient;
      wsClient = null;
      prev.onclose = null;
      try {
        prev.close();
      } catch {}
    }
    const envWsUrl = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WS_SERVER_URL;
    let targetWsUrl = '';
    if (envWsUrl && envWsUrl.startsWith('ws')) {
      targetWsUrl = envWsUrl;
    } else {
      const host = window.location.host;
      if (!host) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      targetWsUrl = `${proto}//${host}/ws`;
    }
    const ws = new WebSocket(targetWsUrl);
    wsClient = ws;
    ws.onopen = async () => {
      if (wsClient !== ws) return;
      wsConnected = true;
      wsReconnectAttempts = 0;
      const liveRoom = activeRoom || room;
      const livePlayer = getLocalOnlinePlayerState() || player;
      const idToken = await auth.currentUser?.getIdToken().catch(() => null);
      if (ws.readyState !== WebSocket.OPEN) return;
      const queueType: MatchQueueType = liveRoom.queueType === 'RANKED' ? 'RANKED' : 'CASUAL';
      if (!liveRoom.isPrivate && liveRoom.status === 'WAITING') {
        ws.send(JSON.stringify({
          type: 'JOIN_QUEUE', uid: livePlayer.uid, idToken, queueType,
          arenaMode: liveRoom.arenaMode, mmr: livePlayer.mmr || 2450, player: livePlayer,
        }));
      }
      ws.send(JSON.stringify({
        type: 'JOIN_ROOM', roomId: liveRoom.roomId, uid: livePlayer.uid, idToken,
          queueType, arenaMode: liveRoom.arenaMode, isPrivate: liveRoom.isPrivate,
        mmr: livePlayer.mmr || 2450, player: livePlayer,
      }));
      startWsPingTimer(ws);
      if (liveRoom.status !== 'PLAYING') emitRoomState();
    };
    ws.onclose = () => {
      wsConnected = false;
      clearWsPingTimer();
      if (wsClient === ws) {
        wsClient = null;
      }
      scheduleWsReconnect();
    };
    ws.onerror = () => {
      wsConnected = false;
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type?: string;
          roomId?: string;
          uid?: string;
          senderUid?: string;
          arenaMode?: DrillMode;
          status?: 'WAITING' | 'PLAYING' | 'FINISHED';
          player?: OnlinePlayerState;
          players?: Record<string, OnlinePlayerState>;
          vanguardUids?: string[];
          blackthornUids?: string[];
          hit?: OnlineHitEvent;
          event?: OnlineRoundEvent;
          serverConfirmed?: boolean;
          bombStatus?: OnlineRoomState['bombStatus'];
          plantedSite?: OnlineRoomState['plantedSite'];
          clientTs?: number;
          ts?: number;
        };
        if (msg.type === 'PONG' && typeof msg.clientTs === 'number') {
          runtimeTelemetry.recordPingSample(Date.now() - msg.clientTs);
          return;
        }
        if (!activeRoom) return;
        const localUid = getEffectiveLocalUid();

        if (msg.type === 'PLAYER_STATE') {
          const wire = msg as {
            type?: string;
            uid?: string;
            player?: OnlinePlayerState;
            t?: import('./combatNetcode').CompactTransformWire['t'];
          };
          const uid = wire.player?.uid || wire.uid;
          if (!uid) return;
          const prevPlayer = activeRoom.players[uid];
          const prevLoaded = prevPlayer?.isLoaded;
          const prevProgress = prevPlayer?.loadProgress;
          const expanded = applyIncomingPlayerState(prevPlayer, {
            player: wire.player,
            t: wire.t,
            uid,
          });
          if (!expanded) return;
          activeRoom.players[uid] = expanded;
          if (uid !== localUid) {
            pushPeerPose(uid, {
              x: expanded.x,
              y: expanded.y,
              z: expanded.z,
              yaw: expanded.yaw,
              pitch: expanded.pitch,
              isCrouching: expanded.isCrouching,
              ts: Date.now(),
            });
          }
          const loadStateChanged =
            Boolean(wire.player) ||
            prevLoaded !== expanded.isLoaded ||
            prevProgress !== expanded.loadProgress;
          if (activeRoom.status !== 'PLAYING' || loadStateChanged) {
            emitRoomState();
          }
        } else if (msg.type === 'PLAYER_JOINED' && msg.player?.uid) {
          const joined = msg.player;
          if (!activeRoom.players[joined.uid]) {
            activeRoom.players[joined.uid] = joined;
          } else {
            activeRoom.players = mergePreservingFresherPlayers(
              activeRoom.players,
              { [joined.uid]: joined },
              activeRoom.status === 'PLAYING'
            );
          }
          emitRoomState();
        } else if (msg.type === 'PLAYER_LEFT' && msg.uid) {
          if (msg.uid !== localUid && activeRoom.players[msg.uid]) {
            delete activeRoom.players[msg.uid];
            emitRoomState();
          }
        } else if (msg.type === 'ROOM_SYNC_META' && msg.players) {
          activeRoom.players = mergePreservingFresherPlayers(
            activeRoom.players,
            msg.players,
            activeRoom.status === 'PLAYING'
          );
          if (msg.status === 'PLAYING' && activeRoom.status === 'WAITING') {
            activeRoom.status = 'PLAYING';
          } else if (msg.status === 'FINISHED') {
            activeRoom.status = 'FINISHED';
          }
          emitRoomState();
        } else if (msg.type === 'MATCH_START') {
          if (activeRoom.status !== 'PLAYING') {
            void startMatchInActiveRoom(true);
          }
        } else if (msg.type === 'COMBAT_HIT' && msg.hit) {
          const hit = msg.hit;
          // Skip room mutation + gameplay if we already applied this hit locally
          // (WebSocket echo back to the attacker).
          if (!processedHitIds.has(hit.eventId)) {
            const victim = activeRoom.players[hit.targetUid];
            if (victim && !victim.isDown) {
              const nextHp = Math.max(0, victim.health - hit.damage);
              victim.health = nextHp;
              victim.isDown = hit.lethal || nextHp <= 0;
              if (hit.lethal) {
                victim.deaths = (victim.deaths || 0) + 1;
                const atk = activeRoom.players[hit.attackerUid];
                if (atk) {
                  atk.kills = (atk.kills || 0) + 1;
                  if (hit.isHeadshot) atk.headshots = (atk.headshots || 0) + 1;
                }
              }
            }
            activeRoom.lastHitEvent = hit;
          }
          dispatchHitOnce(hit);
        } else if (msg.type === 'GRENADE_THROW') {
          const grenadeMsg = msg as unknown as {
            grenade?: OnlineGrenadeEvent;
            senderUid?: string;
          };
          const evt = grenadeMsg.grenade;
          if (
            evt &&
            evt.eventId &&
            evt.senderUid !== localUid &&
            !processedGrenadeIds.has(evt.eventId)
          ) {
            rememberGrenadeEventId(evt.eventId);
            grenadeSubscribers.forEach((fn) => fn(evt));
          }
        } else if (msg.type === 'SCORESTREAK_EVENT') {
          const streakMsg = msg as unknown as {
            event?: OnlineScorestreakEvent;
            senderUid?: string;
          };
          const evt = streakMsg.event;
          if (
            evt &&
            evt.eventId &&
            (evt.streak === 'UAV' || evt.streak === 'ADVANCED_UAV') &&
            evt.senderUid !== localUid &&
            !processedScorestreakIds.has(evt.eventId)
          ) {
            rememberScorestreakEventId(evt.eventId);
            scorestreakSubscribers.forEach((fn) => fn(evt));
          }
        } else if (msg.type === 'BOMB_EVENT') {
          if (msg.bombStatus) activeRoom.bombStatus = msg.bombStatus;
          if (msg.plantedSite) activeRoom.plantedSite = msg.plantedSite;
          activeRoom.updatedAtMs = Date.now();
          if (msg.senderUid !== localUid && msg.bombStatus) {
            const bombEvt: OnlineBombEvent = {
              bombStatus: msg.bombStatus,
              plantedSite: msg.plantedSite || 'NONE',
              ts: msg.ts || Date.now(),
            };
            bombSubscribers.forEach((fn) => fn(bombEvt));
          }
        } else if (msg.type === 'ROUND_EVENT' && msg.event) {
          const evt = msg.event;
          if (!evt.eventId || processedRoundEventIds.has(evt.eventId)) return;
          rememberRoundEventId(evt.eventId);
          if (typeof evt.vanguardScore === 'number') {
            activeRoom.vanguardScore = Math.max(activeRoom.vanguardScore, evt.vanguardScore);
          }
          if (typeof evt.blackthornScore === 'number') {
            activeRoom.blackthornScore = Math.max(activeRoom.blackthornScore, evt.blackthornScore);
          }
          if (evt.kind === 'NEXT_ROUND') {
            activeRoom.currentRound = Math.max(activeRoom.currentRound, evt.roundNumber);
            activeRoom.bombStatus = 'CARRIED';
            activeRoom.plantedSite = 'NONE';
            resetPeerSnapshotBuffers();
            Object.values(activeRoom.players).forEach((p) => {
              const slotIdx = Math.max(0, Object.keys(activeRoom!.players).indexOf(p.uid));
              const sp = getTeamSpawnForArena(activeRoom!.arenaMode, p.team, slotIdx);
              p.health = 100;
              p.armor = 100;
              p.isDown = false;
              p.x = sp.x;
              p.y = sp.y;
              p.z = sp.z;
              p.yaw = sp.yaw;
              p.updatedAtMs = Date.now();
            });
          }
          activeRoom.lastRoundEvent = evt;
          activeRoom.updatedAtMs = Date.now();
          if (msg.senderUid !== localUid) {
            roundSubscribers.forEach((fn) => fn(evt));
          }
        } else if (msg.type === 'CLASS_SUPPORT') {
          const evt = msg as unknown as ClassSupportPacket;
          if (!evt?.eventId || processedClassSupportIds.has(evt.eventId)) return;
          processedClassSupportIds.add(evt.eventId);
          if (processedClassSupportIds.size > 200) {
            const first = processedClassSupportIds.values().next().value;
            if (first) processedClassSupportIds.delete(first);
          }
          // Optimistic vitals only on APPLY (or revive). START/CANCEL are channel sync.
          const phase = evt.phase || 'APPLY';
          const target = activeRoom.players[evt.targetUid];
          if (phase === 'APPLY' || evt.kind === 'REVIVE') {
            if (target && evt.kind === 'REVIVE') {
              target.isDown = false;
              target.health = Math.max(target.health, Math.round(evt.amount || 55));
              target.updatedAtMs = evt.ts || Date.now();
            } else if (target && evt.kind === 'HEAL' && !target.isDown) {
              target.health = Math.min(
                100,
                target.health + Math.max(0, Math.round(evt.amount || 45))
              );
              target.updatedAtMs = evt.ts || Date.now();
            } else if (target && evt.kind === 'ARMOR' && !target.isDown) {
              target.armor = Math.min(
                100,
                (target.armor || 0) + Math.max(0, Math.round(evt.amount || 40))
              );
              target.updatedAtMs = evt.ts || Date.now();
            }
          }
          classSupportSubscribers.forEach((fn) => fn(evt));
        } else if (msg.type === 'SERVER_MATCH_READY' && msg.serverConfirmed) {
          if (msg.roomId) activeRoom.roomId = msg.roomId;
          if (msg.arenaMode) activeRoom.arenaMode = msg.arenaMode;
          if (msg.players) {
            activeRoom.players = mergePreservingFresherPlayers(
              activeRoom.players,
              msg.players,
              true
            );
          }
          if (Array.isArray(msg.vanguardUids) || Array.isArray(msg.blackthornUids)) {
            const vgSet = new Set(msg.vanguardUids || []);
            const btSet = new Set(msg.blackthornUids || []);
            const arena = activeRoom.arenaMode;
            let vgSlot = 0;
            let btSlot = 0;
            Object.values(activeRoom.players).forEach((p) => {
              const nextTeam: OnlineTeam = vgSet.has(p.uid)
                ? 'VANGUARD'
                : btSet.has(p.uid)
                  ? 'BLACKTHORN'
                  : p.team;
              const slot = nextTeam === 'VANGUARD' ? vgSlot++ : btSlot++;
              const sp = getTeamSpawnForArena(arena, nextTeam, slot);
              p.team = nextTeam;
              p.x = sp.x;
              p.y = sp.y;
              p.z = sp.z;
              p.yaw = sp.yaw;
              p.updatedAtMs = Date.now();
            });
          }
          activeRoom.status = 'PLAYING';
          resetCombatNetcodeThrottle();
          emitRoomState();
          void startMatchInActiveRoom(true);
        }
      } catch {}
    };
  } catch {}
}

function attachRoomSnapshotListener(roomId: string): void {
  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }
  if (!auth.currentUser) return;
  const roomRef = doc(db, 'rooms', roomId);
  roomUnsub = onSnapshot(
    roomRef,
    (snap) => {
      if (!snap.exists()) {
        activeRoom = null;
        emitRoomState();
        return;
      }
      const data = snap.data() as OnlineRoomState;
      let shouldNotifySubscribers = false;
      if (!activeRoom || activeRoom.roomId !== data.roomId) {
        activeRoom = data;
        shouldNotifySubscribers = true;
      } else {
        const prevStatus = activeRoom.status;
        const prevPlayers = activeRoom.players || {};
        const isPlaying = activeRoom.status === 'PLAYING' || data.status === 'PLAYING';
        const mergedStatus: OnlineRoomState['status'] =
          activeRoom.status === 'FINISHED' || data.status === 'FINISHED'
            ? 'FINISHED'
            : activeRoom.status === 'PLAYING' || data.status === 'PLAYING'
              ? 'PLAYING'
              : 'WAITING';
        const prevRound = activeRoom.currentRound || 1;
        const nextRound = isPlaying
          ? Math.max(prevRound, data.currentRound || 1)
          : data.currentRound || 1;
        const mergedVg = isPlaying
          ? Math.max(activeRoom.vanguardScore || 0, data.vanguardScore || 0)
          : data.vanguardScore || 0;
        const mergedBt = isPlaying
          ? Math.max(activeRoom.blackthornScore || 0, data.blackthornScore || 0)
          : data.blackthornScore || 0;

        const mergedPlayers = mergePreservingFresherPlayers(
          prevPlayers,
          data.players || {},
          isPlaying
        );

        // Notify subscribers if status, player roster, or any player's loadProgress/isLoaded changed
        if (
          prevStatus !== mergedStatus ||
          Object.keys(prevPlayers).length !== Object.keys(mergedPlayers).length
        ) {
          shouldNotifySubscribers = true;
        } else {
          for (const [uid, p] of Object.entries(mergedPlayers)) {
            const oldP = prevPlayers[uid];
            if (
              !oldP ||
              oldP.isLoaded !== p.isLoaded ||
              oldP.loadProgress !== p.loadProgress ||
              oldP.team !== p.team
            ) {
              shouldNotifySubscribers = true;
              break;
            }
          }
        }

        activeRoom = {
          ...activeRoom,
          hostUid: data.hostUid,
          averageMmr: data.averageMmr ?? activeRoom.averageMmr,
          status: mergedStatus,
          currentRound: nextRound,
          vanguardScore: mergedVg,
          blackthornScore: mergedBt,
          bombStatus:
            isPlaying && activeRoom.bombStatus !== 'CARRIED' && data.bombStatus === 'CARRIED' && nextRound <= prevRound
              ? activeRoom.bombStatus
              : data.bombStatus || activeRoom.bombStatus,
          plantedSite:
            isPlaying && activeRoom.bombStatus === 'PLANTED' && data.bombStatus === 'CARRIED' && nextRound <= prevRound
              ? activeRoom.plantedSite
              : data.plantedSite || activeRoom.plantedSite,
          players: mergedPlayers,
          updatedAtMs: Math.max(activeRoom.updatedAtMs || 0, data.updatedAtMs || 0),
        };
      }
      if (data.lastHitEvent) dispatchHitOnce(data.lastHitEvent);
      if (activeRoom.status !== 'PLAYING' || shouldNotifySubscribers) {
        emitRoomState();
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`)
  );
}

function pickBalancedTeam(players: Record<string, OnlinePlayerState>): OnlineTeam {
  let vgCount = 0;
  let btCount = 0;
  Object.values(players).forEach((p) => (p.team === 'VANGUARD' ? vgCount++ : btCount++));
  return vgCount <= btCount ? 'VANGUARD' : 'BLACKTHORN';
}

export async function createMultiplayerRoom(
  arenaMode: DrillMode,
  isPrivate: boolean,
  queueType: MatchQueueType = 'CASUAL'
): Promise<OnlineRoomState | null> {
  await leaveActiveRoom();
  const uid = getEffectiveLocalUid();
  const roomId = generateRoomCode();
  const localPlayer = createInitialLocalPlayerState(arenaMode, 'VANGUARD', 0);
  const newRoom: OnlineRoomState = {
    roomId, hostUid: uid, arenaMode, isPrivate, queueType,
    averageMmr: localPlayer.mmr || 2450, status: 'WAITING',
    currentRound: 1, vanguardScore: 0, blackthornScore: 0,
    bombStatus: 'CARRIED', plantedSite: 'NONE',
    players: { [uid]: localPlayer },
    updatedAtMs: Date.now(), createdAt: new Date().toISOString(),
  };

  activeRoom = newRoom;
  resetCombatNetcodeThrottle();
  resetPeerSnapshotBuffers();
  connectWebSocketForRoom(newRoom, localPlayer);
  emitRoomState();

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'rooms', roomId), newRoom);
      attachRoomSnapshotListener(roomId);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${roomId}`);
      // Rules reject unknown arenaMode. A local ghost room hides bots and
      // leaves the queue stuck at 1/10 because nobody can join.
      await leaveActiveRoom();
      return null;
    }
  }
  return newRoom;
}

export async function joinRoomByCode(rawCode: string): Promise<{ ok: boolean; error?: string; room?: OnlineRoomState }> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'Faça login com sua Conta Google primeiro.' };
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) return { ok: false, error: 'Digite um código válido (6 caracteres).' };

  await leaveActiveRoom();
  const roomRef = doc(db, 'rooms', code);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return { ok: false, error: `Sala "${code}" não encontrada.` };
    const data = snap.data() as OnlineRoomState;
    const existingPlayers = data.players || {};
    const playerCount = Object.keys(existingPlayers).length;
    if (playerCount >= 10 && !existingPlayers[user.uid]) {
      return { ok: false, error: 'Esta sala 5v5 já está cheia (10/10 jogadores).' };
    }

    const assignedTeam = existingPlayers[user.uid]?.team || pickBalancedTeam(existingPlayers);
    const localPlayer = createInitialLocalPlayerState(data.arenaMode, assignedTeam, playerCount);
    const allPlayers = { ...existingPlayers, [user.uid]: localPlayer };
    const avgMmr = Math.round(
      Object.values(allPlayers).reduce((acc, p) => acc + (Number(p.mmr) || 1000), 0) /
        Math.max(1, Object.keys(allPlayers).length)
    );

    await updateDoc(roomRef, { [`players.${user.uid}`]: localPlayer, averageMmr: avgMmr, updatedAtMs: Date.now() });
    activeRoom = { ...data, averageMmr: avgMmr, players: allPlayers };
    resetPeerSnapshotBuffers();
    attachRoomSnapshotListener(code);
    connectWebSocketForRoom(activeRoom, localPlayer);
    emitRoomState();
    return { ok: true, room: activeRoom };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rooms/${code}`);
    return { ok: false, error: 'Erro ao entrar na sala online.' };
  }
}

export async function quickMatchOrCreateRoom(
  arenaMode: DrillMode,
  queueType: MatchQueueType = 'CASUAL'
): Promise<OnlineRoomState | null> {
  const user = auth.currentUser;
  const localMmr = Number(getCloudSyncState().profile.mmr) || 2450;

  if (user) {
    try {
      const q = query(collection(db, 'rooms'), where('isPrivate', '==', false), limit(15));
      const snap = await getDocs(q);
      const nowMs = Date.now();
      for (const docSnap of snap.docs) {
        const r = docSnap.data() as OnlineRoomState;
        const roomQueue: MatchQueueType = r.queueType === 'RANKED' ? 'RANKED' : 'CASUAL';
        const count = Object.keys(r.players || {}).length;
        const isFresh = nowMs - (r.updatedAtMs || 0) < 1000 * 60 * 5;
        const roomAvgMmr = Number(r.averageMmr) || 2450;
        const mmrOk = queueType === 'CASUAL' || Math.abs(localMmr - roomAvgMmr) <= 300;

        if (r.arenaMode === arenaMode && roomQueue === queueType && r.status === 'WAITING' && count > 0 && count < 10 && isFresh && mmrOk) {
          const joined = await joinRoomByCode(r.roomId);
          if (joined.ok && joined.room) return joined.room;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'rooms');
    }
  }
  return createMultiplayerRoom(arenaMode, false, queueType);
}

export async function switchLocalPlayerTeam(): Promise<void> {
  if (!activeRoom) return;
  const uid = getEffectiveLocalUid();
  const me = activeRoom.players[uid];
  if (!me) return;
  const nextTeam: OnlineTeam = me.team === 'VANGUARD' ? 'BLACKTHORN' : 'VANGUARD';
  const spawn = getTeamSpawnForArena(activeRoom.arenaMode, nextTeam, 0);
  const updated: OnlinePlayerState = { ...me, team: nextTeam, x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw, updatedAtMs: Date.now() };
  activeRoom.players[uid] = updated;
  emitRoomState();
  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, 'rooms', activeRoom.roomId), { [`players.${uid}`]: updated, updatedAtMs: Date.now() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${activeRoom.roomId}`);
    }
  }
}

export async function startMatchInActiveRoom(serverConfirmed = false): Promise<boolean> {
  if (!activeRoom) return false;
  const playerCount = Object.keys(activeRoom.players || {}).length;
  if (activeRoom.queueType === 'RANKED' && !serverConfirmed && playerCount < 10) {
    if (wsClient && wsClient.readyState === WebSocket.OPEN) {
      wsClient.send(JSON.stringify({ type: 'MATCH_START', roomId: activeRoom.roomId, queueType: 'RANKED' }));
    }
    return false;
  }
  if (!serverConfirmed && wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify({
      type: 'MATCH_START',
      roomId: activeRoom.roomId,
      queueType: activeRoom.queueType || 'CASUAL',
    }));
  }
  const inv = getPlayerInventoryState();
  const localUid = getEffectiveLocalUid();
  const resetPlayers: Record<string, OnlinePlayerState> = {};
  Object.values(activeRoom.players).forEach((p) => {
    resetPlayers[p.uid] = {
      ...p,
      classId: p.uid === localUid ? inv.selectedClass || p.classId || 'FUZILEIRO' : p.classId || 'FUZILEIRO',
      loadProgress: 0,
      isLoaded: false,
      updatedAtMs: Date.now(),
    };
  });
  activeRoom.players = resetPlayers;
  activeRoom.status = 'PLAYING';
  resetCombatNetcodeThrottle();
  resetPeerSnapshotBuffers();
  emitRoomState();
  if (auth.currentUser) {
    try {
      await updateDoc(doc(db, 'rooms', activeRoom.roomId), { status: 'PLAYING', players: resetPlayers, updatedAtMs: Date.now() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${activeRoom.roomId}`);
    }
  }
  return true;
}

export function publishLocalLoadProgress(
  progressPct: number,
  isLoaded: boolean,
  forceBroadcast = false
): void {
  publishRoomLoadProgress(
    activeRoom,
    wsClient,
    emitRoomState,
    progressPct,
    isLoaded,
    getEffectiveLocalUid(),
    forceBroadcast
  );
}

export function publishLocalPlayerTransform(params: {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  weaponId: WeaponId;
  weaponSkinId?: string;
  classId?: WarfaceClassId;
  health: number;
  isDown: boolean;
  isCrouching: boolean;
  isFiring: boolean;
}): void {
  publishRoomPlayerTransform(activeRoom, wsClient, params, getEffectiveLocalUid());
}

export function publishGrenadeThrow(
  grenadeType: 'FRAG' | 'SMOKE',
  origin: [number, number, number],
  velocity: [number, number, number]
): void {
  if (!activeRoom) return;
  const uid = getEffectiveLocalUid();
  const me = activeRoom.players[uid];
  if (!me) return;
  const nowMs = Date.now();
  const grenade: OnlineGrenadeEvent = {
    eventId: `grn_${uid}_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    senderUid: uid,
    senderCallsign: me.callsign || 'OPERADOR',
    senderTeam: me.team,
    grenadeType,
    origin: [
      Number(origin[0].toFixed(2)),
      Number(origin[1].toFixed(2)),
      Number(origin[2].toFixed(2)),
    ],
    velocity: [
      Number(velocity[0].toFixed(2)),
      Number(velocity[1].toFixed(2)),
      Number(velocity[2].toFixed(2)),
    ],
    ts: nowMs,
  };
  rememberGrenadeEventId(grenade.eventId);
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(
      JSON.stringify({
        type: 'GRENADE_THROW',
        roomId: activeRoom.roomId,
        grenade,
        ts: nowMs,
      })
    );
  }
}

export function publishScorestreakEvent(
  streak: 'UAV' | 'ADVANCED_UAV',
  durationSec: number
): void {
  if (!activeRoom) return;
  const uid = getEffectiveLocalUid();
  const me = activeRoom.players[uid];
  if (!me) return;
  const nowMs = Date.now();
  const event: OnlineScorestreakEvent = {
    eventId: `stk_${uid}_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    senderUid: uid,
    senderCallsign: me.callsign || 'OPERADOR',
    senderTeam: me.team,
    streak,
    durationSec: Math.max(10, Math.min(24, Math.round(durationSec))),
    ts: nowMs,
  };
  rememberScorestreakEventId(event.eventId);
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(
      JSON.stringify({
        type: 'SCORESTREAK_EVENT',
        roomId: activeRoom.roomId,
        event,
        ts: nowMs,
      })
    );
  }
}

export function publishCombatHit(targetUid: string, damage: number, isHeadshot: boolean, weaponId: WeaponId | 'GRENADE'): void {
  const hit = publishRoomCombatHit(
    activeRoom,
    wsClient,
    targetUid,
    damage,
    isHeadshot,
    weaponId,
    getEffectiveLocalUid()
  );
  // Prevent WS echo from double-applying damage/score on the attacker client.
  if (hit?.eventId) rememberHitEventId(hit.eventId);
}

export function publishBombStateChange(bombStatus: 'CARRIED' | 'PLANTED' | 'DEFUSED' | 'DETONATED', plantedSite: 'NONE' | 'A' | 'B'): void {
  if (!activeRoom) return;
  activeRoom.bombStatus = bombStatus;
  activeRoom.plantedSite = plantedSite;
  activeRoom.updatedAtMs = Date.now();
  // Prefer WS for bomb events; Firestore only for durable meta.
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(
      JSON.stringify({
        type: 'BOMB_EVENT',
        roomId: activeRoom.roomId,
        bombStatus,
        plantedSite,
        ts: Date.now(),
      })
    );
  }
  persistRoomMatchMeta(activeRoom);
}

export function publishRoundEvent(
  payload: Omit<OnlineRoundEvent, 'eventId' | 'ts'>
): void {
  if (!activeRoom) return;
  const nowMs = Date.now();
  const event: OnlineRoundEvent = {
    ...payload,
    eventId: `rnd_${payload.kind}_${payload.roundNumber}_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
    ts: nowMs,
  };
  rememberRoundEventId(event.eventId);

  if (typeof event.vanguardScore === 'number') {
    activeRoom.vanguardScore = Math.max(activeRoom.vanguardScore, event.vanguardScore);
  }
  if (typeof event.blackthornScore === 'number') {
    activeRoom.blackthornScore = Math.max(activeRoom.blackthornScore, event.blackthornScore);
  }
  if (event.kind === 'NEXT_ROUND') {
    activeRoom.currentRound = Math.max(activeRoom.currentRound, event.roundNumber);
    activeRoom.bombStatus = 'CARRIED';
    activeRoom.plantedSite = 'NONE';
    resetPeerSnapshotBuffers();
  }
  activeRoom.lastRoundEvent = event;
  activeRoom.updatedAtMs = nowMs;

  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(
      JSON.stringify({
        type: 'ROUND_EVENT',
        roomId: activeRoom.roomId,
        event,
        ts: nowMs,
      })
    );
  }
  persistRoomMatchMeta(activeRoom);
}

export function resetLocalOnlinePlayerForNextRound(arenaMode?: DrillMode): void {
  if (!activeRoom) return;
  const uid = getEffectiveLocalUid();
  const me = activeRoom.players[uid];
  if (!me) return;
  const inv = getPlayerInventoryState();
  const mode = arenaMode || activeRoom.arenaMode;
  const teamMembers = Object.values(activeRoom.players)
    .filter((p) => p.team === me.team)
    .sort((a, b) => a.uid.localeCompare(b.uid));
  const slotIdx = Math.max(0, teamMembers.findIndex((p) => p.uid === uid));
  const spawn = getTeamSpawnForArena(mode, me.team, slotIdx);
  const updated: OnlinePlayerState = {
    ...me,
    classId: inv.selectedClass || me.classId || 'FUZILEIRO',
    health: 100,
    armor: 100,
    isDown: false,
    isCrouching: false,
    isFiring: false,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    yaw: spawn.yaw,
    pitch: 0,
    updatedAtMs: Date.now(),
  };
  activeRoom.players[uid] = updated;
  resetPeerSnapshotBuffers();
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(
      JSON.stringify({
        type: 'PLAYER_STATE',
        roomId: activeRoom.roomId,
        uid,
        player: updated,
      })
    );
  }
}

export function publishClassSupportEvent(
  targetUid: string,
  kind: ClassSupportNetKind,
  amount?: number,
  phase: import('./classSupportNetcode').ClassSupportPhase = 'APPLY'
): void {
  if (!activeRoom) return;
  const fromUid = getEffectiveLocalUid();
  if (!fromUid) return;
  const packet = buildClassSupportEvent(
    activeRoom.roomId,
    fromUid,
    targetUid,
    kind,
    amount,
    phase
  );
  processedClassSupportIds.add(packet.eventId);
  // Apply optimistic vitals only when the channel completes (or revive).
  const applyNow = phase === 'APPLY' || kind === 'REVIVE';
  const target = activeRoom.players[targetUid];
  if (applyNow && target && kind === 'REVIVE') {
    target.isDown = false;
    target.health = Math.max(target.health, Math.round(amount || 55));
  } else if (applyNow && target && kind === 'HEAL') {
    target.health = Math.min(100, target.health + Math.max(0, Math.round(amount || 45)));
  } else if (applyNow && target && kind === 'ARMOR') {
    target.armor = Math.min(
      100,
      (target.armor || 0) + Math.max(0, Math.round(amount || 40))
    );
  }
  sendClassSupportWs(wsClient, packet);
}

export async function leaveActiveRoom(): Promise<void> {
  intentionalWsClose = true;
  wsConnected = false;
  wsReconnectAttempts = 0;
  clearWsReconnectTimer();

  if (roomUnsub) {
    roomUnsub();
    roomUnsub = null;
  }
  if (wsClient) {
    try {
      if (wsClient.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
      }
      wsClient.onclose = null;
      wsClient.close();
    } catch {}
    wsClient = null;
  }
  const user = auth.currentUser;
  const prevRoom = activeRoom;
  activeRoom = null;
  resetCombatNetcodeThrottle();
  resetPeerSnapshotBuffers();
  emitRoomState();

  if (user && prevRoom) {
    try {
      await updateDoc(doc(db, 'rooms', prevRoom.roomId), { [`players.${user.uid}`]: deleteField(), updatedAtMs: Date.now() });
    } catch {}
  }
}

export function getActiveOnlineRoom(): OnlineRoomState | null {
  return activeRoom;
}

export function getLocalOnlinePlayerState(): OnlinePlayerState | null {
  const uid = getEffectiveLocalUid();
  if (!uid || !activeRoom) return null;
  return activeRoom.players[uid] || null;
}

export function isOnlineMatchActive(): boolean {
  return activeRoom !== null;
}

/** True when all players currently registered in the active online room have finished loading. */
export function areAllOnlinePlayersLoaded(): boolean {
  if (!activeRoom) return true;
  const players = Object.values(activeRoom.players || {});
  if (players.length === 0) return true;
  return players.every((p) => Boolean(p.isLoaded));
}

/** Other human players currently in the active online room (excludes local). */
export function countOtherHumanPlayersInRoom(): number {
  const local = getLocalOnlinePlayerState();
  if (!activeRoom || !local) return 0;
  let n = 0;
  for (const uid of Object.keys(activeRoom.players)) {
    if (uid && uid !== local.uid) n += 1;
  }
  return n;
}

/**
 * XP / cash / rank unlocks / combat profile telemetry may only come from
 * real online matches with at least one other human. Bot / offline / solo
 * practice modes grant none.
 */
export function canGrantMatchProgressionRewards(): boolean {
  return isOnlineMatchActive() && countOtherHumanPlayersInRoom() >= 1;
}

registerMatchProgressionGate(canGrantMatchProgressionRewards);

export function subscribeOnlineRoom(fn: RoomSubscriber): () => void {
  roomSubscribers.add(fn);
  fn(activeRoom);
  return () => roomSubscribers.delete(fn);
}

export function subscribeOnlineClassSupport(
  fn: ClassSupportSubscriber
): () => void {
  classSupportSubscribers.add(fn);
  return () => classSupportSubscribers.delete(fn);
}

export function subscribeOnlineHitEvents(fn: HitSubscriber): () => void {
  hitSubscribers.add(fn);
  return () => hitSubscribers.delete(fn);
}

export function subscribeOnlineGrenadeEvents(fn: GrenadeSubscriber): () => void {
  grenadeSubscribers.add(fn);
  return () => grenadeSubscribers.delete(fn);
}

export function subscribeOnlineScorestreakEvents(
  fn: ScorestreakSubscriber
): () => void {
  scorestreakSubscribers.add(fn);
  return () => scorestreakSubscribers.delete(fn);
}

export function subscribeOnlineBombEvents(fn: BombSubscriber): () => void {
  bombSubscribers.add(fn);
  return () => bombSubscribers.delete(fn);
}

export function subscribeOnlineRoundEvents(fn: RoundSubscriber): () => void {
  roundSubscribers.add(fn);
  return () => roundSubscribers.delete(fn);
}

