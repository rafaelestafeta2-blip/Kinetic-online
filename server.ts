import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';
import {
  fetchPlayerMmrFromFirebase,
  getAllowedMmrTolerance,
  getMatchmakingPoolKey,
  isPlayerMmrCompatibleWithRoom,
  normalizeQueueType,
  QueuedPlayerEntry,
  ServerQueueType,
  tryFindBalancedMatch,
} from './src/server/matchmakingEngine';
import {
  clearRoomCombatAuthority,
  IncomingHitLike,
  issueMatchRewardReceipt,
  recordServerPlayerPose,
  validateCombatHit,
} from './src/server/combatAuthority';
import {
  broadcastToRoom,
  evaluateAndConfirmRankedRoomIfFull,
  matchmakingQueue,
  purgeStaleRooms,
  recalculateRoomAverageMmr,
  removeClientFromQueue,
  removeClientFromRoom,
  roomMetaMap,
  roomsMap,
  WsClientMeta,
} from './src/server/roomSessionManager';

const PORT = Number(process.env.PORT) || 3000;

async function startServer(): Promise<void> {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      activeRooms: roomsMap.size,
      playersInQueue: matchmakingQueue.size,
      ts: Date.now(),
    });
  });

  const OTA_MANIFEST = {
    version: process.env.KINETIC_OTA_VERSION?.trim() || '2.5.0-R2',
    assetRevision:
      process.env.KINETIC_ASSET_REVISION?.trim() || '2026.11.20-v18',
    cdnBaseUrl: process.env.VITE_ASSET_CDN_URL?.trim() || '',
    publishedAt: '2026-11-20T18:30:00.000Z',
    patchTitle: 'ATUALIZAÇÃO 2.5 · LOJA PREMIUM, AEMONDIR & V18 SPECTRE',
    patchNotes: [
      'Nova Loja Premium com Vitrine 3D, Baús Warface e Passe VIP',
      'Primeira Skin 3D de Shotgun: Aemondir Bucky Legion com baioneta',
      'Nova Arma de Engenheiro: V18 Spectre Silenciada + Chat de Voz da Equipe',
      'Assets 3D servidos via Cloudflare R2 CDN com barra de download',
    ],
    criticalAssets: [
      '/models/characters/vanguard_rifleman.glb',
      '/models/characters/pro_rifle_pack.glb',
      '/models/weapons/v18_engineer_smg.glb',
      '/models/weapons/shotgun_aemondir_lv1.glb',
    ],
  };

  app.get('/api/ota/manifest', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(OTA_MANIFEST);
  });

  const SERVER_DIAMOND_PACKS: Record<
    string,
    { id: string; sku: string; diamonds: number; bonusDiamonds: number; priceBrlCents: number; name: string }
  > = {
    pack_400: {
      id: 'pack_400',
      sku: 'kinetic_diamonds_400',
      diamonds: 400,
      bonusDiamonds: 0,
      priceBrlCents: 990,
      name: '400 Diamantes · KINETIC FPS',
    },
    pack_800: {
      id: 'pack_800',
      sku: 'kinetic_diamonds_800',
      diamonds: 800,
      bonusDiamonds: 80,
      priceBrlCents: 1990,
      name: '880 Diamantes (Passe VIP) · KINETIC FPS',
    },
    pack_1800: {
      id: 'pack_1800',
      sku: 'kinetic_diamonds_1800',
      diamonds: 1800,
      bonusDiamonds: 250,
      priceBrlCents: 3990,
      name: '2.050 Diamantes · KINETIC FPS',
    },
    pack_4000: {
      id: 'pack_4000',
      sku: 'kinetic_diamonds_4000',
      diamonds: 4000,
      bonusDiamonds: 800,
      priceBrlCents: 7990,
      name: '4.800 Diamantes · KINETIC FPS',
    },
  };

  app.get('/api/billing/packs', (_req, res) => {
    res.json({
      currency: 'BRL',
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      packs: Object.values(SERVER_DIAMOND_PACKS),
    });
  });

  app.post('/api/billing/checkout', async (req, res) => {
    const body = req.body as { uid?: string; packId?: string; platform?: string } | undefined;
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : '';
    const packId = typeof body?.packId === 'string' ? body.packId.trim() : '';
    const pack = SERVER_DIAMOND_PACKS[packId];

    if (!uid || !/^[a-zA-Z0-9_-]{6,128}$/.test(uid)) {
      res.status(400).json({ ok: false, error: 'Conta Google autenticada obrigatória para comprar Diamantes.' });
      return;
    }
    if (!pack) {
      res.status(400).json({ ok: false, error: 'Pacote de Diamantes inválido.' });
      return;
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeKey) {
      res.status(503).json({
        ok: false,
        configured: false,
        sku: pack.sku,
        error:
          'Gateway de pagamento real (Stripe Web / Google Play Billing Android) pronto para conexão. Configure STRIPE_SECRET_KEY no servidor ou publique os SKUs no Google Play Console para liberar compras em R$.',
      });
      return;
    }

    try {
      const origin =
        process.env.PUBLIC_APP_URL?.trim() ||
        `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const totalDiamonds = pack.diamonds + pack.bonusDiamonds;
      const params = new URLSearchParams();
      params.set('mode', 'payment');
      params.set('client_reference_id', uid);
      params.set('success_url', `${origin}/?billing=success&pack=${pack.id}`);
      params.set('cancel_url', `${origin}/?billing=cancel`);
      params.set('line_items[0][quantity]', '1');
      params.set('line_items[0][price_data][currency]', 'brl');
      params.set('line_items[0][price_data][unit_amount]', String(pack.priceBrlCents));
      params.set('line_items[0][price_data][product_data][name]', pack.name);
      params.set('metadata[uid]', uid);
      params.set('metadata[packId]', pack.id);
      params.set('metadata[sku]', pack.sku);
      params.set('metadata[totalDiamonds]', String(totalDiamonds));

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const data = (await stripeRes.json()) as { url?: string; error?: { message?: string } };
      if (!stripeRes.ok || !data.url) {
        res.status(502).json({
          ok: false,
          error: data.error?.message || 'Erro ao criar sessão de pagamento.',
        });
        return;
      }
      res.json({ ok: true, checkoutUrl: data.url, sku: pack.sku });
    } catch {
      res.status(500).json({ ok: false, error: 'Falha de comunicação com o gateway de pagamento.' });
    }
  });

  const telemetryBuffer: Array<Record<string, unknown>> = [];
  const MAX_TELEMETRY_BUFFER = 200;

  app.post('/api/telemetry', (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      res.sendStatus(400);
      return;
    }
    const sanitized = {
      sessionId: String(body.sessionId || '').slice(0, 48),
      platform: body.platform === 'android_capacitor' ? 'android_capacitor' : 'web',
      gpuRenderer: String(body.gpuRenderer || 'unknown').slice(0, 120),
      drillMode: String(body.drillMode || 'FREE_RANGE').slice(0, 40),
      qualityPreset: String(body.qualityPreset || 'BALANCED_60').slice(0, 24),
      avgFps: Number(body.avgFps) || 0,
      p95FrameMs: Number(body.p95FrameMs) || 0,
      p99FrameMs: Number(body.p99FrameMs) || 0,
      hitchCount: Math.max(0, Math.round(Number(body.hitchCount) || 0)),
      totalFrames: Math.max(0, Math.round(Number(body.totalFrames) || 0)),
      matchLoadMs: body.matchLoadMs !== null && Number.isFinite(Number(body.matchLoadMs))
        ? Math.round(Number(body.matchLoadMs))
        : null,
      pingMs: body.pingMs !== null && Number.isFinite(Number(body.pingMs))
        ? Math.round(Number(body.pingMs))
        : null,
      webglContextLostCount: Math.max(0, Math.round(Number(body.webglContextLostCount) || 0)),
      lastError: body.lastError ? String(body.lastError).slice(0, 180) : null,
      ts: Date.now(),
    };
    telemetryBuffer.push(sanitized);
    if (telemetryBuffer.length > MAX_TELEMETRY_BUFFER) {
      telemetryBuffer.shift();
    }
    res.sendStatus(204);
  });

  app.get('/api/telemetry/summary', (_req, res) => {
    const count = telemetryBuffer.length;
    if (count === 0) {
      res.json({ count: 0, avgFps: 0, p95FrameMs: 0, p99FrameMs: 0, webglContextLosses: 0, recentErrors: [] });
      return;
    }
    let fpsSum = 0;
    let p95Sum = 0;
    let p99Sum = 0;
    let loadSum = 0;
    let loadCount = 0;
    let pingSum = 0;
    let pingCount = 0;
    let hitches = 0;
    let contextLosses = 0;
    const recentErrors: string[] = [];

    for (let i = 0; i < count; i++) {
      const s = telemetryBuffer[i];
      fpsSum += Number(s.avgFps || 0);
      p95Sum += Number(s.p95FrameMs || 0);
      p99Sum += Number(s.p99FrameMs || 0);
      hitches += Number(s.hitchCount || 0);
      contextLosses += Number(s.webglContextLostCount || 0);
      if (typeof s.matchLoadMs === 'number') {
        loadSum += s.matchLoadMs;
        loadCount += 1;
      }
      if (typeof s.pingMs === 'number') {
        pingSum += s.pingMs;
        pingCount += 1;
      }
      if (typeof s.lastError === 'string' && s.lastError && recentErrors.length < 10) {
        recentErrors.push(s.lastError);
      }
    }

    res.json({
      count,
      avgFps: Math.round(fpsSum / count),
      p95FrameMs: Number((p95Sum / count).toFixed(1)),
      p99FrameMs: Number((p99Sum / count).toFixed(1)),
      avgMatchLoadMs: loadCount > 0 ? Math.round(loadSum / loadCount) : null,
      avgPingMs: pingCount > 0 ? Math.round(pingSum / pingCount) : null,
      totalHitches: hitches,
      webglContextLosses: contextLosses,
      recentErrors,
    });
  });

  app.post('/api/match/verify-reward', (req, res) => {
    const { roomId, uid, claimedXp, claimedCash } = req.body as {
      roomId?: string;
      uid?: string;
      claimedXp?: number;
      claimedCash?: number;
    };
    if (!roomId || !uid) {
      res.status(400).json({ ok: false, reason: 'missing_room_or_uid' });
      return;
    }
    const receipt = issueMatchRewardReceipt({
      roomId: String(roomId).toUpperCase().slice(0, 12),
      uid: String(uid).slice(0, 128),
      claimedXp: Number(claimedXp) || 0,
      claimedCash: Number(claimedCash) || 0,
    });
    res.json({ ok: true, ...receipt });
  });

  app.post('/api/matchmaking/check-mmr', async (req, res) => {
    const { uid, idToken, fallbackMmr, queueType } = req.body as {
      uid?: string;
      idToken?: string;
      fallbackMmr?: number;
      queueType?: string;
    };
    const normalizedQueue = normalizeQueueType(queueType);
    const verifiedMmr = await fetchPlayerMmrFromFirebase(
      String(uid || ''),
      idToken,
      Number(fallbackMmr) || 1000
    );
    res.json({
      ok: true,
      queueType: normalizedQueue,
      mmr: verifiedMmr,
      baseTolerance: getAllowedMmrTolerance(Date.now()),
    });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const scorestreakCooldownByUid = new Map<string, number>();
  const squadChatCooldownByUid = new Map<string, number>();
  const ALLOWED_SQUAD_ARENAS = new Set([
    'DUST2_BOMB_5V5',
    'ASSAULT_BOMB_5V5',
    'YARD_BOMB_5V5',
    'INDUSTRIA_BOMB_5V5',
    'HANGAR_BOMB_5V5',
    'EASTERN_CITY_BOMB_5V5',
    'MIRAGE_ANUBIS_BOMB_5V5',
    'STATION_TDM_5V5',
    'STATION_CAPTURE_5V5',
  ]);

  wss.on('connection', (ws) => {
    const clientMeta: WsClientMeta = {
      ws,
      roomId: null,
      uid: null,
      callsign: 'OPERADOR',
      queueType: 'CASUAL',
      arenaMode: 'DUST2_BOMB_5V5',
      mmr: 1000,
      enqueuedAtMs: Date.now(),
    };

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type?: string;
          roomId?: string;
          uid?: string;
          idToken?: string;
          queueType?: string;
          arenaMode?: string;
          isPrivate?: boolean;
          mmr?: number;
          player?: { callsign?: string; mmr?: number; [key: string]: unknown };
          [key: string]: unknown;
        };

        if (!msg || typeof msg.type !== 'string') return;

        if (msg.type === 'PING') {
          ws.send(
            JSON.stringify({
              type: 'PONG',
              clientTs: typeof msg.clientTs === 'number' ? msg.clientTs : Date.now(),
              serverTs: Date.now(),
            })
          );
          return;
        }

        // 1. Entrada na fila de Matchmaking ('CASUAL' ou 'RANKED')
        if (msg.type === 'JOIN_QUEUE' && msg.uid) {
          const uid = String(msg.uid).slice(0, 128);
          const queueType = normalizeQueueType(msg.queueType);
          const arenaMode = String(msg.arenaMode || 'DUST2_BOMB_5V5');
          const verifiedMmr = await fetchPlayerMmrFromFirebase(
            uid,
            typeof msg.idToken === 'string' ? msg.idToken : null,
            Number(msg.mmr ?? msg.player?.mmr) || 1000
          );

          clientMeta.uid = uid;
          clientMeta.callsign = String(msg.player?.callsign || 'OPERADOR').slice(0, 32);
          clientMeta.queueType = queueType;
          clientMeta.arenaMode = arenaMode;
          clientMeta.mmr = verifiedMmr;
          clientMeta.enqueuedAtMs = Date.now();
          matchmakingQueue.set(uid, clientMeta);

          ws.send(
            JSON.stringify({
              type: 'QUEUE_JOINED',
              uid,
              queueType,
              arenaMode,
              mmr: verifiedMmr,
              toleranceMmr: getAllowedMmrTolerance(clientMeta.enqueuedAtMs),
              ts: Date.now(),
            })
          );
          return;
        }

        if (msg.type === 'LEAVE_QUEUE') {
          removeClientFromQueue(clientMeta);
          return;
        }

        // 2. Entrada em Sala (verifica Tipo de Fila e compatibilidade de MMR no Modo Ranked)
        if (msg.type === 'JOIN_ROOM' && msg.roomId && msg.uid) {
          removeClientFromRoom(clientMeta);
          const roomId = String(msg.roomId).toUpperCase().slice(0, 12);
          const uid = String(msg.uid).slice(0, 128);
          const queueType = normalizeQueueType(msg.queueType);
          const arenaMode = String(msg.arenaMode || 'DUST2_BOMB_5V5');
          const isPrivate = Boolean(msg.isPrivate);

          const verifiedMmr = await fetchPlayerMmrFromFirebase(
            uid,
            typeof msg.idToken === 'string' ? msg.idToken : null,
            Number(msg.mmr ?? msg.player?.mmr) || 1000
          );

          const enrichedPlayer = msg.player
            ? { ...msg.player, uid, mmr: verifiedMmr }
            : { uid, mmr: verifiedMmr };

          let meta = roomMetaMap.get(roomId);
          if (!meta) {
            meta = {
              roomId,
              hostUid: uid,
              queueType,
              arenaMode,
              isPrivate,
              createdAtMs: Date.now(),
              averageMmr: verifiedMmr,
              serverConfirmedStart: false,
              status: 'WAITING',
              isSearchingMatch: false,
              searchStartedAtMs: null,
              readyByUid: new Map([[uid, false]]),
              chatHistory: [],
              memberMmrs: new Map([[uid, verifiedMmr]]),
              memberPlayers: new Map([[uid, { ...enrichedPlayer, isReady: false }]]),
            };
            roomMetaMap.set(roomId, meta);
          } else {
            if (
              meta.queueType === 'RANKED' &&
              !meta.isPrivate &&
              meta.memberMmrs.size > 0 &&
              !meta.memberMmrs.has(uid)
            ) {
              const isCompatible = isPlayerMmrCompatibleWithRoom(
                verifiedMmr,
                meta.averageMmr,
                meta.createdAtMs
              );
              if (!isCompatible) {
                ws.send(
                  JSON.stringify({
                    type: 'RANKED_MMR_MISMATCH',
                    roomId,
                    playerMmr: verifiedMmr,
                    roomAverageMmr: meta.averageMmr,
                    reason: 'Diferença de MMR acima do limite permitido para esta partida Ranked.',
                    ts: Date.now(),
                  })
                );
                return;
              }
            }
            const existingReady = meta.readyByUid.get(uid) ?? false;
            meta.readyByUid.set(uid, existingReady);
            meta.memberMmrs.set(uid, verifiedMmr);
            meta.memberPlayers.set(uid, { ...enrichedPlayer, isReady: existingReady });
            if (!meta.hostUid) meta.hostUid = uid;
            recalculateRoomAverageMmr(meta);
          }

          clientMeta.roomId = roomId;
          clientMeta.uid = uid;
          clientMeta.callsign = String(msg.player?.callsign || 'OPERADOR').slice(0, 32);
          clientMeta.queueType = meta.queueType;
          clientMeta.arenaMode = meta.arenaMode;
          clientMeta.mmr = verifiedMmr;

          let set = roomsMap.get(roomId);
          if (!set) {
            set = new Set();
            roomsMap.set(roomId, set);
          }
          set.add(clientMeta);

          const memberPlayerForBroadcast = meta.memberPlayers.get(uid) || enrichedPlayer;
          broadcastToRoom(
            roomId,
            {
              type: 'PLAYER_JOINED',
              roomId,
              uid: clientMeta.uid,
              hostUid: meta.hostUid,
              queueType: meta.queueType,
              arenaMode: meta.arenaMode,
              averageMmr: meta.averageMmr,
              player: memberPlayerForBroadcast,
              ts: Date.now(),
            },
            clientMeta.uid
          );

          const playersSnapshot: Record<string, Record<string, unknown>> = {};
          meta.memberPlayers.forEach((pObj, memberUid) => {
            playersSnapshot[memberUid] = {
              ...pObj,
              isReady: Boolean(meta!.readyByUid.get(memberUid)),
            };
          });

          ws.send(
            JSON.stringify({
              type: 'ROOM_SYNC_META',
              roomId,
              hostUid: meta.hostUid,
              queueType: meta.queueType,
              arenaMode: meta.arenaMode,
              status: meta.status,
              isSearchingMatch: meta.isSearchingMatch,
              searchStartedAtMs: meta.searchStartedAtMs,
              averageMmr: meta.averageMmr,
              playerMmr: verifiedMmr,
              playersCount: set.size,
              players: playersSnapshot,
              chatHistory: meta.chatHistory,
              ts: Date.now(),
            })
          );

          evaluateAndConfirmRankedRoomIfFull(roomId);
          return;
        }

        if (msg.type === 'LEAVE_ROOM') {
          removeClientFromQueue(clientMeta);
          removeClientFromRoom(clientMeta);
          return;
        }

        // 2B. Sala de Esquadrão (Chat de Texto em Tempo Real, Pronto ✓, Busca de Partida e Retorno à Sala)
        if (clientMeta.roomId && clientMeta.uid && msg.type === 'SQUAD_CHAT') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!meta) return;
          const nowMs = Date.now();
          const lastMsgAt = squadChatCooldownByUid.get(clientMeta.uid) || 0;
          if (nowMs - lastMsgAt < 400) return;
          squadChatCooldownByUid.set(clientMeta.uid, nowMs);
          if (squadChatCooldownByUid.size > 600) {
            const firstKey = squadChatCooldownByUid.keys().next().value;
            if (firstKey) squadChatCooldownByUid.delete(firstKey);
          }

          const rawText = typeof msg.text === 'string' ? msg.text : '';
          const cleanText = rawText.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 180);
          if (!cleanText) return;

          const senderMember = meta.memberPlayers.get(clientMeta.uid);
          const senderCallsign = String(
            senderMember?.callsign || clientMeta.callsign || 'OPERADOR'
          ).slice(0, 24);
          const senderClassId = String(
            senderMember?.classId || 'FUZILEIRO'
          ).slice(0, 24);

          const chatEntry = {
            id: `chat_${clientMeta.uid}_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
            senderUid: clientMeta.uid,
            senderCallsign,
            senderClassId,
            text: cleanText,
            ts: nowMs,
          };
          meta.chatHistory.push(chatEntry);
          if (meta.chatHistory.length > 40) {
            meta.chatHistory.shift();
          }

          broadcastToRoom(clientMeta.roomId, {
            type: 'SQUAD_CHAT',
            roomId: clientMeta.roomId,
            message: chatEntry,
            ts: nowMs,
          });
          return;
        }

        if (clientMeta.roomId && clientMeta.uid && msg.type === 'PLAYER_READY') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!meta) return;
          const isReady = Boolean(msg.isReady);
          meta.readyByUid.set(clientMeta.uid, isReady);
          const member = meta.memberPlayers.get(clientMeta.uid);
          if (member) {
            meta.memberPlayers.set(clientMeta.uid, { ...member, isReady });
          }
          broadcastToRoom(clientMeta.roomId, {
            type: 'PLAYER_READY',
            roomId: clientMeta.roomId,
            uid: clientMeta.uid,
            isReady,
            ts: Date.now(),
          });
          return;
        }

        if (clientMeta.roomId && clientMeta.uid && msg.type === 'SQUAD_CONFIG_UPDATE') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!meta || (meta.hostUid && meta.hostUid !== clientMeta.uid)) return;
          const nextArena =
            typeof msg.arenaMode === 'string' && ALLOWED_SQUAD_ARENAS.has(msg.arenaMode)
              ? msg.arenaMode
              : meta.arenaMode;
          const nextQueue = msg.queueType ? normalizeQueueType(msg.queueType) : meta.queueType;
          const nextPrivate =
            typeof msg.isPrivate === 'boolean' ? msg.isPrivate : meta.isPrivate;
          meta.arenaMode = nextArena;
          meta.queueType = nextQueue;
          meta.isPrivate = nextPrivate;
          meta.isSearchingMatch = false;
          meta.searchStartedAtMs = null;

          const members = roomsMap.get(clientMeta.roomId);
          members?.forEach((c) => {
            c.arenaMode = nextArena;
            c.queueType = nextQueue;
            removeClientFromQueue(c);
          });

          broadcastToRoom(clientMeta.roomId, {
            type: 'SQUAD_CONFIG_UPDATE',
            roomId: clientMeta.roomId,
            arenaMode: nextArena,
            queueType: nextQueue,
            isPrivate: nextPrivate,
            isSearchingMatch: false,
            ts: Date.now(),
          });
          return;
        }

        if (clientMeta.roomId && clientMeta.uid && msg.type === 'SQUAD_QUEUE_START') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!meta || (meta.hostUid && meta.hostUid !== clientMeta.uid)) return;
          if (typeof msg.arenaMode === 'string' && ALLOWED_SQUAD_ARENAS.has(msg.arenaMode)) {
            meta.arenaMode = msg.arenaMode;
          }
          if (msg.queueType) {
            meta.queueType = normalizeQueueType(msg.queueType);
          }
          const nowMs = Date.now();
          meta.isSearchingMatch = true;
          meta.searchStartedAtMs = nowMs;

          const members = roomsMap.get(clientMeta.roomId);
          if (members && !meta.isPrivate) {
            members.forEach((c) => {
              if (!c.uid) return;
              c.arenaMode = meta.arenaMode;
              c.queueType = meta.queueType;
              c.enqueuedAtMs = nowMs;
              matchmakingQueue.set(c.uid, c);
            });
          }

          broadcastToRoom(clientMeta.roomId, {
            type: 'SQUAD_QUEUE_STATE',
            roomId: clientMeta.roomId,
            isSearchingMatch: true,
            searchStartedAtMs: nowMs,
            arenaMode: meta.arenaMode,
            queueType: meta.queueType,
            ts: nowMs,
          });
          return;
        }

        if (clientMeta.roomId && clientMeta.uid && msg.type === 'SQUAD_QUEUE_CANCEL') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!meta) return;
          meta.isSearchingMatch = false;
          meta.searchStartedAtMs = null;
          const members = roomsMap.get(clientMeta.roomId);
          members?.forEach((c) => removeClientFromQueue(c));

          broadcastToRoom(clientMeta.roomId, {
            type: 'SQUAD_QUEUE_STATE',
            roomId: clientMeta.roomId,
            isSearchingMatch: false,
            searchStartedAtMs: null,
            arenaMode: meta.arenaMode,
            queueType: meta.queueType,
            ts: Date.now(),
          });
          return;
        }

        if (clientMeta.roomId && clientMeta.uid && msg.type === 'RETURN_TO_ROOM') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!meta) return;
          meta.status = 'WAITING';
          meta.serverConfirmedStart = false;
          meta.isSearchingMatch = false;
          meta.searchStartedAtMs = null;
          meta.readyByUid.forEach((_val, mUid) => {
            meta.readyByUid.set(mUid, false);
          });
          meta.memberPlayers.forEach((pObj, mUid) => {
            meta.memberPlayers.set(mUid, {
              ...pObj,
              isReady: false,
              isLoaded: false,
              loadProgress: 0,
              health: 100,
              armor: 100,
              isDown: false,
            });
          });
          clearRoomCombatAuthority(clientMeta.roomId);
          const members = roomsMap.get(clientMeta.roomId);
          members?.forEach((c) => removeClientFromQueue(c));

          broadcastToRoom(clientMeta.roomId, {
            type: 'ROOM_RETURNED_TO_LOBBY',
            roomId: clientMeta.roomId,
            status: 'WAITING',
            ts: Date.now(),
          });
          return;
        }

        // 3. Bloqueio de Início Manual na Fila Ranked
        if (clientMeta.roomId && msg.type === 'MATCH_START') {
          const meta = roomMetaMap.get(clientMeta.roomId);
          const effectiveQueue = meta?.queueType || normalizeQueueType(msg.queueType);

          if (effectiveQueue === 'RANKED' && !meta?.serverConfirmedStart) {
            ws.send(
              JSON.stringify({
                type: 'MATCH_START_BLOCKED',
                roomId: clientMeta.roomId,
                queueType: 'RANKED',
                reason:
                  'Início manual bloqueado na fila Ranked. O servidor iniciará a partida automaticamente ao confirmar 10 jogadores com MMR equilibrado.',
                ts: Date.now(),
              })
            );
            return;
          }
          if (meta) {
            meta.status = 'PLAYING';
            meta.isSearchingMatch = false;
            meta.searchStartedAtMs = null;
            const members = roomsMap.get(clientMeta.roomId);
            members?.forEach((c) => removeClientFromQueue(c));
          }
        }

        if (
          clientMeta.roomId &&
          (msg.type === 'PLAYER_STATE' ||
            msg.type === 'COMBAT_HIT' ||
            msg.type === 'GRENADE_THROW' ||
            msg.type === 'SCORESTREAK_EVENT' ||
            msg.type === 'BOMB_EVENT' ||
            msg.type === 'CLASS_SUPPORT' ||
            msg.type === 'ROUND_EVENT' ||
            msg.type === 'MATCH_START')
        ) {
          if (msg.type === 'PLAYER_STATE') {
            const uid = String(msg.uid || clientMeta.uid || '');
            const t = Array.isArray(msg.t) ? msg.t : null;
            const player = msg.player as
              | {
                  x?: number;
                  y?: number;
                  z?: number;
                  yaw?: number;
                  loadProgress?: number;
                  isLoaded?: boolean;
                  classId?: string;
                  weaponId?: string;
                }
              | undefined;
            if (uid && t && t.length >= 4) {
              recordServerPlayerPose(
                clientMeta.roomId,
                uid,
                Number(t[0]),
                Number(t[1]),
                Number(t[2]),
                Number(t[3])
              );
              const meta = roomMetaMap.get(clientMeta.roomId);
              const existingMember = meta?.memberPlayers.get(uid);
              if (meta && existingMember) {
                meta.memberPlayers.set(uid, {
                  ...existingMember,
                  x: Number(t[0]),
                  y: Number(t[1]),
                  z: Number(t[2]),
                  yaw: Number(t[3]),
                  weaponId: t[5] ?? existingMember.weaponId,
                  classId: t[11] ?? existingMember.classId,
                  isLoaded: true,
                  loadProgress: 100,
                });
              }
            } else if (uid && player) {
              recordServerPlayerPose(
                clientMeta.roomId,
                uid,
                Number(player.x || 0),
                Number(player.y || 0),
                Number(player.z || 0),
                Number(player.yaw || 0)
              );
              const meta = roomMetaMap.get(clientMeta.roomId);
              if (meta) {
                const prev = meta.memberPlayers.get(uid) || {};
                meta.memberPlayers.set(uid, { ...prev, ...player, uid });
              }
            }
          }

          if (msg.type === 'SCORESTREAK_EVENT') {
            const rawEvt = (msg.event || {}) as Record<string, unknown>;
            const streak =
              rawEvt.streak === 'ADVANCED_UAV'
                ? 'ADVANCED_UAV'
                : rawEvt.streak === 'UAV'
                  ? 'UAV'
                  : null;
            if (!streak || !clientMeta.uid) return;
            const nowMs = Date.now();
            const lastStreakAt = scorestreakCooldownByUid.get(clientMeta.uid) || 0;
            if (nowMs - lastStreakAt < 8000) return;
            scorestreakCooldownByUid.set(clientMeta.uid, nowMs);
            if (scorestreakCooldownByUid.size > 500) {
              const firstKey = scorestreakCooldownByUid.keys().next().value;
              if (firstKey) scorestreakCooldownByUid.delete(firstKey);
            }

            const meta = roomMetaMap.get(clientMeta.roomId);
            const member = meta?.memberPlayers.get(clientMeta.uid);
            const serverTeam =
              member?.team === 'BLACKTHORN'
                ? 'BLACKTHORN'
                : member?.team === 'VANGUARD'
                  ? 'VANGUARD'
                  : rawEvt.senderTeam === 'BLACKTHORN'
                    ? 'BLACKTHORN'
                    : 'VANGUARD';
            const serverCallsign = String(
              member?.callsign || rawEvt.senderCallsign || clientMeta.callsign || 'OPERADOR'
            ).slice(0, 24);
            const durationSec = Math.max(
              10,
              Math.min(24, Math.round(Number(rawEvt.durationSec) || (streak === 'ADVANCED_UAV' ? 22 : 18)))
            );
            const eventId = String(
              rawEvt.eventId || `stk_${clientMeta.uid}_${nowMs}`
            ).slice(0, 64);

            broadcastToRoom(
              clientMeta.roomId,
              {
                type: 'SCORESTREAK_EVENT',
                roomId: clientMeta.roomId,
                senderUid: clientMeta.uid,
                event: {
                  eventId,
                  senderUid: clientMeta.uid,
                  senderCallsign: serverCallsign,
                  senderTeam: serverTeam,
                  streak,
                  durationSec,
                  ts: nowMs,
                },
                ts: nowMs,
              },
              clientMeta.uid
            );
            return;
          }

          if (msg.type === 'COMBAT_HIT') {
            const verdict = validateCombatHit(
              clientMeta.roomId,
              clientMeta.uid,
              (msg.hit || {}) as IncomingHitLike
            );
            if (!verdict.ok) return;
            broadcastToRoom(
              clientMeta.roomId,
              {
                ...msg,
                hit: verdict.sanitized || msg.hit,
                roomId: clientMeta.roomId,
                senderUid: clientMeta.uid,
                serverValidated: true,
                ts: Date.now(),
              },
              null
            );
            return;
          }

          broadcastToRoom(
            clientMeta.roomId,
            {
              ...msg,
              roomId: clientMeta.roomId,
              senderUid: clientMeta.uid,
              ts: Date.now(),
            },
            msg.type === 'PLAYER_STATE' || msg.type === 'GRENADE_THROW'
              ? clientMeta.uid
              : null
          );
          return;
        }

        // 4. Rádio Tático WebRTC de Equipe (VOICE_SIGNAL / VOICE_STATE) — Isolado por Equipe (VANGUARD / BLACKTHORN)
        if (
          clientMeta.roomId &&
          clientMeta.uid &&
          (msg.type === 'VOICE_SIGNAL' || msg.type === 'VOICE_STATE')
        ) {
          const roomMembers = roomsMap.get(clientMeta.roomId);
          const meta = roomMetaMap.get(clientMeta.roomId);
          if (!roomMembers) return;

          const senderMember = meta?.memberPlayers.get(clientMeta.uid);
          const senderTeam =
            senderMember?.team === 'BLACKTHORN'
              ? 'BLACKTHORN'
              : senderMember?.team === 'VANGUARD'
                ? 'VANGUARD'
                : msg.team === 'BLACKTHORN'
                  ? 'BLACKTHORN'
                  : 'VANGUARD';
          const senderCallsign = String(
            senderMember?.callsign || msg.callsign || clientMeta.callsign || 'OPERADOR'
          ).slice(0, 24);
          const senderClassId = String(
            senderMember?.classId || msg.classId || 'FUZILEIRO'
          ).slice(0, 24);

          if (msg.type === 'VOICE_SIGNAL') {
            const targetUid =
              typeof msg.targetUid === 'string' ? msg.targetUid.slice(0, 128) : '';
            if (!targetUid || targetUid === clientMeta.uid) return;
            const targetMember = meta?.memberPlayers.get(targetUid);
            // Bloqueia escuta cruzada entre equipes adversárias no servidor
            if (
              targetMember?.team &&
              senderMember?.team &&
              targetMember.team !== senderMember.team
            ) {
              return;
            }
            const packet = JSON.stringify({
              type: 'VOICE_SIGNAL',
              roomId: clientMeta.roomId,
              senderUid: clientMeta.uid,
              senderCallsign,
              senderTeam,
              senderClassId,
              targetUid,
              signalType: msg.signalType,
              sdp: msg.sdp,
              candidate: msg.candidate,
              ts: Date.now(),
            });
            roomMembers.forEach((peer) => {
              if (peer.uid === targetUid && peer.ws.readyState === 1) {
                peer.ws.send(packet);
              }
            });
            return;
          }

          if (msg.type === 'VOICE_STATE') {
            const packet = JSON.stringify({
              type: 'VOICE_STATE',
              roomId: clientMeta.roomId,
              senderUid: clientMeta.uid,
              senderCallsign,
              senderTeam,
              senderClassId,
              micMode: msg.micMode === 'OPEN' || msg.micMode === 'PTT' ? msg.micMode : 'MUTED',
              isSpeaking: Boolean(msg.isSpeaking),
              audioLevel: Math.max(0, Math.min(1, Number(msg.audioLevel) || 0)),
              quickCallout:
                typeof msg.quickCallout === 'string'
                  ? msg.quickCallout.slice(0, 64)
                  : undefined,
              ts: Date.now(),
            });
            roomMembers.forEach((peer) => {
              if (!peer.uid || peer.uid === clientMeta.uid) return;
              const peerMember = meta?.memberPlayers.get(peer.uid);
              if (
                peerMember?.team &&
                senderMember?.team &&
                peerMember.team !== senderMember.team
              ) {
                return;
              }
              if (peer.ws.readyState === 1) {
                peer.ws.send(packet);
              }
            });
            return;
          }
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      removeClientFromQueue(clientMeta);
      removeClientFromRoom(clientMeta);
    });
  });

  const runMatchmakingSweep = (): void => {
    const staleRooms: string[] = [];
    roomMetaMap.forEach((meta, rid) => {
      const m = roomsMap.get(rid);
      if ((!m || m.size === 0) && Date.now() - meta.createdAtMs > 1000 * 60 * 30) {
        staleRooms.push(rid);
      }
    });
    purgeStaleRooms();
    staleRooms.forEach((rid) => clearRoomCombatAuthority(rid));
    if (matchmakingQueue.size < 2) return;

    const buckets = new Map<string, QueuedPlayerEntry[]>();
    matchmakingQueue.forEach((client) => {
      if (!client.uid || client.ws.readyState !== 1) return;
      const poolKey = getMatchmakingPoolKey(client.arenaMode);
      const key = `${client.queueType}::${poolKey}`;
      const list = buckets.get(key) || [];
      list.push({
        uid: client.uid,
        callsign: client.callsign,
        arenaMode: client.arenaMode,
        queueType: client.queueType,
        mmr: client.mmr,
        enqueuedAtMs: client.enqueuedAtMs,
        roomId: client.roomId,
      });
      buckets.set(key, list);
    });

    buckets.forEach((entries, key) => {
      const [queueTypeRaw, poolKey] = key.split('::');
      const queueType: ServerQueueType = queueTypeRaw === 'RANKED' ? 'RANKED' : 'CASUAL';
      const roomId = `MM${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const allocation = tryFindBalancedMatch(entries, queueType, poolKey, roomId);
      if (!allocation) return;

      const drawnArenaMode = allocation.arenaMode;
      const memberMmrs = new Map<string, number>();
      const memberPlayers = new Map<string, Record<string, unknown>>();
      const matchedClients = new Set<WsClientMeta>();

      allocation.players.forEach((entry) => {
        const client = matchmakingQueue.get(entry.uid);
        if (!client) return;
        const prevRoomMeta = client.roomId ? roomMetaMap.get(client.roomId) : undefined;
        const prevPlayerSnapshot = prevRoomMeta?.memberPlayers.get(entry.uid);

        matchmakingQueue.delete(entry.uid);
        removeClientFromRoom(client);
        client.roomId = roomId;
        client.arenaMode = drawnArenaMode;
        client.queueType = queueType;
        matchedClients.add(client);
        memberMmrs.set(entry.uid, entry.mmr);

        const team = allocation.vanguardUids.includes(entry.uid) ? 'VANGUARD' : 'BLACKTHORN';
        memberPlayers.set(entry.uid, {
          ...(prevPlayerSnapshot || {}),
          uid: entry.uid,
          callsign: entry.callsign,
          team,
          mmr: entry.mmr,
          isReady: true,
          isLoaded: false,
          loadProgress: 0,
        });
      });

      if (matchedClients.size < 2) return;

      roomsMap.set(roomId, matchedClients);
      roomMetaMap.set(roomId, {
        roomId,
        hostUid: allocation.players[0]?.uid ?? null,
        queueType,
        arenaMode: drawnArenaMode,
        isPrivate: false,
        createdAtMs: Date.now(),
        averageMmr: allocation.averageMmr,
        serverConfirmedStart: true,
        status: 'PLAYING',
        isSearchingMatch: false,
        searchStartedAtMs: null,
        readyByUid: new Map(),
        chatHistory: [],
        memberMmrs,
        memberPlayers,
      });

      broadcastToRoom(roomId, {
        type: 'SERVER_MATCH_READY',
        roomId,
        queueType,
        arenaMode: drawnArenaMode,
        averageMmr: allocation.averageMmr,
        vanguardUids: allocation.vanguardUids,
        blackthornUids: allocation.blackthornUids,
        players: Object.fromEntries(memberPlayers),
        serverConfirmed: true,
        ts: Date.now(),
      });
    });
  };

  setInterval(runMatchmakingSweep, 2000);

  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      if (/^\/(models|sound|assets)\//.test(req.path)) {
        const publicFile = path.join(process.cwd(), 'public', decodeURIComponent(req.path));
        if (!fs.existsSync(publicFile)) {
          res.status(404).type('text/plain').send('Asset not found');
          return;
        }
      }
      next();
    });
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      if (/^\/(models|sound|assets)\//.test(req.path)) {
        res.status(404).type('text/plain').send('Asset not found');
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[KINETIC Server] HTTP + WebSocket active on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
