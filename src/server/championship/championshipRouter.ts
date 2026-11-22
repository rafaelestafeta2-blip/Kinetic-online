import express, { NextFunction, Request, Response } from 'express';
import {
  VerifiedAuthUser,
  verifyBearerFirebaseUser,
} from './authAndClanGuard';
import {
  adminConfirmRegistrationPayment,
  adminOpenMatchRoomNow,
  ChampionshipError,
  createStripeCheckoutForRegistration,
  executeRosterLockAndGenerateMatches,
  getActiveChampionshipOverview,
  getAuditLogsForChampionship,
  getMatchesForChampionship,
  getMatchLobbySnapshot,
  getPlayerRosterLockStatus,
  getStandingsForChampionship,
  issueMatchLobbyToken,
  processStripeWebhookEvent,
  recordOfficialMatchResult,
  registerClanForChampionship,
  runChampionshipSchedulerTick,
  substituteMatchStarter,
  upsertChampionshipByAdmin,
} from './championshipService';
import { broadcastChampionshipLobbyState } from './championshipWsHub';
import { ChampionshipStatus, MatchPhase } from './types';

interface AuthedRequest extends Request {
  authUser?: VerifiedAuthUser | null;
}

async function attachOptionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  req.authUser = await verifyBearerFirebaseUser(req.headers.authorization);
  next();
}

async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await verifyBearerFirebaseUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({
      ok: false,
      code: 'UNAUTHORIZED',
      error: 'Faça login com sua Conta Google para realizar esta ação.',
    });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.authUser?.isAdmin) {
    res.status(403).json({
      ok: false,
      code: 'ADMIN_ONLY',
      error: 'Acesso restrito ao organizador oficial do campeonato.',
    });
    return;
  }
  next();
}

function sendError(res: Response, err: unknown): void {
  if (err instanceof ChampionshipError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      error: err.message,
    });
    return;
  }
  console.error('[Championship API Error]', err);
  res.status(500).json({
    ok: false,
    code: 'INTERNAL_ERROR',
    error: 'Erro interno ao processar operação do campeonato.',
  });
}

/**
 * Raw-body Stripe Webhook handler (must be mounted BEFORE express.json() in server.ts).
 */
export function handleStripeChampionshipWebhook(req: Request, res: Response): void {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const sigHeader = req.headers['stripe-signature'];
    const result = processStripeWebhookEvent(
      rawBody,
      typeof sigHeader === 'string' ? sigHeader : undefined
    );
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
}

export function createChampionshipRouter(): express.Router {
  const router = express.Router();

  // 1. Visão geral do campeonato ativo
  router.get('/active', attachOptionalAuth, (req: AuthedRequest, res) => {
    try {
      const overview = getActiveChampionshipOverview(req.authUser ?? null);
      res.json({ ok: true, ...overview });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 2. Verificar se jogador está com elenco travado (guard para tela de Clã)
  router.get('/roster-lock-status', requireAuth, (req: AuthedRequest, res) => {
    try {
      const lock = getPlayerRosterLockStatus(req.authUser!.uid);
      res.json({ ok: true, ...lock });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 3. Partidas do campeonato
  router.get('/:id/matches', attachOptionalAuth, (req: AuthedRequest, res) => {
    try {
      const champId = Number(req.params.id);
      if (!Number.isFinite(champId) || champId <= 0) {
        throw new ChampionshipError(400, 'INVALID_ID', 'ID de campeonato inválido.');
      }
      const phaseRaw = typeof req.query.phase === 'string' ? req.query.phase : undefined;
      const validPhases = new Set<MatchPhase>(['ROUND_ROBIN', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL']);
      const phase = phaseRaw && validPhases.has(phaseRaw as MatchPhase) ? (phaseRaw as MatchPhase) : undefined;
      const matches = getMatchesForChampionship(champId, { phase });
      res.json({ ok: true, serverNowMs: Date.now(), matches });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 4. Classificação (Standings)
  router.get('/:id/standings', (req, res) => {
    try {
      const champId = Number(req.params.id);
      if (!Number.isFinite(champId) || champId <= 0) {
        throw new ChampionshipError(400, 'INVALID_ID', 'ID de campeonato inválido.');
      }
      const standings = getStandingsForChampionship(champId);
      res.json({ ok: true, standings });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 5. Inscrição de Clã (Exclusivo para Líder verificado no Firestore)
  router.post('/:id/register', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const champId = Number(req.params.id);
      const body = req.body as {
        clanId?: string;
        starterUids?: string[];
        reserveUids?: string[];
      };
      if (!Number.isFinite(champId) || champId <= 0) {
        throw new ChampionshipError(400, 'INVALID_ID', 'ID de campeonato inválido.');
      }
      const registration = await registerClanForChampionship(champId, req.authUser!, {
        clanId: String(body?.clanId || ''),
        starterUids: Array.isArray(body?.starterUids) ? body.starterUids : [],
        reserveUids: Array.isArray(body?.reserveUids) ? body.reserveUids : [],
      });
      res.json({ ok: true, registration });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 6. Gerar Checkout Stripe para a taxa de inscrição
  router.post('/:id/checkout', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const champId = Number(req.params.id);
      if (!Number.isFinite(champId) || champId <= 0) {
        throw new ChampionshipError(400, 'INVALID_ID', 'ID de campeonato inválido.');
      }
      const origin =
        process.env.PUBLIC_APP_URL?.trim() ||
        `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
      const result = await createStripeCheckoutForRegistration(champId, req.authUser!, origin);
      res.json({ ok: true, ...result });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 7. Solicitar Token HMAC temporário para entrar no Lobby Privado da Partida
  router.post('/matches/:matchId/join-token', requireAuth, (req: AuthedRequest, res) => {
    try {
      const matchId = Number(req.params.matchId);
      if (!Number.isFinite(matchId) || matchId <= 0) {
        throw new ChampionshipError(400, 'INVALID_MATCH_ID', 'ID de partida inválido.');
      }
      const result = issueMatchLobbyToken(matchId, req.authUser!);
      res.json({ ok: true, ...result });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 8. Substituição de Titular por Reserva (Líder, até 5 min antes)
  router.post('/matches/:matchId/substitute', requireAuth, (req: AuthedRequest, res) => {
    try {
      const matchId = Number(req.params.matchId);
      const body = req.body as { starterOutUid?: string; reserveInUid?: string };
      if (!Number.isFinite(matchId) || matchId <= 0) {
        throw new ChampionshipError(400, 'INVALID_MATCH_ID', 'ID de partida inválido.');
      }
      const lobby = substituteMatchStarter(matchId, req.authUser!, {
        starterOutUid: String(body?.starterOutUid || ''),
        reserveInUid: String(body?.reserveInUid || ''),
      });
      broadcastChampionshipLobbyState(matchId);
      res.json({ ok: true, lobby });
    } catch (err) {
      sendError(res, err);
    }
  });

  // 9. Consulta de snapshot do lobby (autenticado)
  router.get('/matches/:matchId/lobby', requireAuth, (req: AuthedRequest, res) => {
    try {
      const matchId = Number(req.params.matchId);
      if (!Number.isFinite(matchId) || matchId <= 0) {
        throw new ChampionshipError(400, 'INVALID_MATCH_ID', 'ID de partida inválido.');
      }
      const lobby = getMatchLobbySnapshot(matchId);
      res.json({ ok: true, lobby });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ==================== ROTAS DO PAINEL ADMIN (ORGANIZADOR) ====================

  router.post('/admin/championship', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    try {
      const body = req.body as {
        championshipId?: number;
        createNew?: boolean;
        title?: string;
        seasonLabel?: string;
        entryFeeCents?: number;
        prizePoolCents?: number;
        maxClans?: number;
        playoffSize?: 4 | 8;
        registrationOpensAt?: string;
        rosterLockAt?: string;
        startsAt?: string;
        rulesSummary?: string;
        status?: ChampionshipStatus;
      };
      const champ = upsertChampionshipByAdmin(req.authUser!, {
        championshipId: body.championshipId ? Number(body.championshipId) : undefined,
        createNew: Boolean(body.createNew),
        title: String(body.title || ''),
        seasonLabel: String(body.seasonLabel || 'Temporada 1'),
        entryFeeCents: Number(body.entryFeeCents ?? 5000),
        prizePoolCents: Number(body.prizePoolCents ?? 100000),
        maxClans: Number(body.maxClans ?? 16),
        playoffSize: Number(body.playoffSize) === 8 ? 8 : 4,
        registrationOpensAt: String(body.registrationOpensAt || new Date().toISOString()),
        rosterLockAt: String(body.rosterLockAt || new Date(Date.now() + 7 * 86400_000).toISOString()),
        startsAt: String(body.startsAt || new Date(Date.now() + 7 * 86400_000 + 7200_000).toISOString()),
        rulesSummary: String(body.rulesSummary || ''),
        status: body.status,
      });
      res.json({ ok: true, championship: champ });
    } catch (err) {
      sendError(res, err);
    }
  });

  router.post(
    '/admin/:id/confirm-payment/:registrationId',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      try {
        const champId = Number(req.params.id);
        const regId = Number(req.params.registrationId);
        const registration = adminConfirmRegistrationPayment(champId, regId, req.authUser!);
        res.json({ ok: true, registration });
      } catch (err) {
        sendError(res, err);
      }
    }
  );

  router.post(
    '/admin/:id/roster-lock',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      try {
        const champId = Number(req.params.id);
        const result = executeRosterLockAndGenerateMatches(
          champId,
          req.authUser!.uid,
          'ADMIN'
        );
        res.json({ ok: true, ...result });
      } catch (err) {
        sendError(res, err);
      }
    }
  );

  router.post(
    '/admin/matches/:matchId/open-room',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      try {
        const matchId = Number(req.params.matchId);
        const match = adminOpenMatchRoomNow(matchId, req.authUser!);
        broadcastChampionshipLobbyState(matchId);
        res.json({ ok: true, match });
      } catch (err) {
        sendError(res, err);
      }
    }
  );

  router.post(
    '/admin/matches/:matchId/result',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      try {
        const matchId = Number(req.params.matchId);
        const body = req.body as {
          scoreA?: number;
          scoreB?: number;
          killsA?: number;
          killsB?: number;
          woClanRegId?: number | null;
        };
        const match = recordOfficialMatchResult(matchId, req.authUser!.uid, 'ADMIN', {
          scoreA: Number(body?.scoreA ?? 0),
          scoreB: Number(body?.scoreB ?? 0),
          killsA: Number(body?.killsA ?? 0),
          killsB: Number(body?.killsB ?? 0),
          woClanRegId: body?.woClanRegId ? Number(body.woClanRegId) : null,
        });
        broadcastChampionshipLobbyState(matchId);
        res.json({ ok: true, match });
      } catch (err) {
        sendError(res, err);
      }
    }
  );

  router.get(
    '/admin/:id/audit-logs',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      try {
        const champId = Number(req.params.id);
        const logs = getAuditLogsForChampionship(champId, 100);
        res.json({ ok: true, logs });
      } catch (err) {
        sendError(res, err);
      }
    }
  );

  router.post('/admin/run-scheduler', requireAuth, requireAdmin, (_req, res) => {
    try {
      const summary = runChampionshipSchedulerTick();
      res.json({ ok: true, summary });
    } catch (err) {
      sendError(res, err);
    }
  });

  return router;
}
