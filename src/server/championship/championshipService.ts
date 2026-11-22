import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  appendAuditLog,
  getChampionshipDb,
  withChampionshipTransaction,
} from './championshipDb';
import {
  fetchVerifiedClanFromFirestore,
  signMatchLobbyToken,
  VerifiedAuthUser,
  verifyStripeWebhookSignature,
} from './authAndClanGuard';
import {
  CHAMPIONSHIP_MAP_POOL,
  CompletedRoundRobinMatch,
  computeStandingsWithTieBreakers,
  generatePlayoffStageFixtures,
  generateRoundRobinSchedule,
  StandingClanMeta,
} from './tournamentAlgorithms';
import {
  AuditLogRecord,
  ChampionshipLobbySnapshot,
  ChampionshipRecord,
  ChampionshipStatus,
  MatchLineupPlayer,
  MatchPhase,
  MatchRecord,
  MatchStatus,
  RegistrationRecord,
  RegistrationStatus,
  RosterMemberRecord,
  RosterSlotRole,
  StandingRecord,
} from './types';

export class ChampionshipError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SUBSTITUTION_CUTOFF_MS = 5 * 60 * 1000; // 5 minutos antes do início

function mapChampionshipRow(
  row: Record<string, unknown>,
  championClanName: string | null = null
): ChampionshipRecord {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    seasonLabel: String(row.season_label),
    status: String(row.status) as ChampionshipStatus,
    entryFeeCents: Number(row.entry_fee_cents),
    prizePoolCents: Number(row.prize_pool_cents),
    maxClans: Number(row.max_clans),
    playoffSize: Number(row.playoff_size) === 8 ? 8 : 4,
    registrationOpensAt: String(row.registration_opens_at),
    rosterLockAt: String(row.roster_lock_at),
    startsAt: String(row.starts_at),
    rulesSummary: String(row.rules_summary || ''),
    championRegistrationId:
      row.champion_registration_id !== null && row.champion_registration_id !== undefined
        ? Number(row.champion_registration_id)
        : null,
    championClanName,
    createdByUid: String(row.created_by_uid),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function getChampionClanName(
  db: DatabaseSync,
  championRegId: number | null
): string | null {
  if (!championRegId) return null;
  const reg = db
    .prepare('SELECT clan_name FROM championship_registrations WHERE id = ?')
    .get(championRegId) as { clan_name?: string } | undefined;
  return reg?.clan_name ? String(reg.clan_name) : null;
}

export function getActiveChampionship(db = getChampionshipDb()): ChampionshipRecord {
  const row = db
    .prepare('SELECT * FROM championships ORDER BY id DESC LIMIT 1')
    .get() as Record<string, unknown> | undefined;
  if (!row) {
    throw new ChampionshipError(404, 'NO_CHAMPIONSHIP', 'Nenhum campeonato ativo encontrado.');
  }
  const champRegId =
    row.champion_registration_id !== null && row.champion_registration_id !== undefined
      ? Number(row.champion_registration_id)
      : null;
  return mapChampionshipRow(row, getChampionClanName(db, champRegId));
}

export function getChampionshipById(
  championshipId: number,
  db = getChampionshipDb()
): ChampionshipRecord {
  const row = db
    .prepare('SELECT * FROM championships WHERE id = ?')
    .get(championshipId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new ChampionshipError(404, 'CHAMPIONSHIP_NOT_FOUND', 'Campeonato não encontrado.');
  }
  const champRegId =
    row.champion_registration_id !== null && row.champion_registration_id !== undefined
      ? Number(row.champion_registration_id)
      : null;
  return mapChampionshipRow(row, getChampionClanName(db, champRegId));
}

export function getRegistrationsForChampionship(
  championshipId: number,
  db = getChampionshipDb()
): RegistrationRecord[] {
  const regs = db
    .prepare(
      `SELECT * FROM championship_registrations
       WHERE championship_id = ?
       ORDER BY CASE WHEN status = 'CONFIRMADO' THEN 0 ELSE 1 END, created_at ASC`
    )
    .all(championshipId) as Array<Record<string, unknown>>;

  const rosters = db
    .prepare(
      `SELECT * FROM championship_rosters
       WHERE championship_id = ?
       ORDER BY CASE WHEN slot_role = 'TITULAR' THEN 0 ELSE 1 END, id ASC`
    )
    .all(championshipId) as Array<Record<string, unknown>>;

  const rosterByReg = new Map<number, RosterMemberRecord[]>();
  for (const r of rosters) {
    const regId = Number(r.registration_id);
    const list = rosterByReg.get(regId) || [];
    list.push({
      id: Number(r.id),
      championshipId: Number(r.championship_id),
      registrationId: regId,
      playerUid: String(r.player_uid),
      playerCallsign: String(r.player_callsign),
      avatarDataUrl: String(r.avatar_data_url || ''),
      slotRole: String(r.slot_role) as RosterSlotRole,
      lockedAt: r.locked_at ? String(r.locked_at) : null,
    });
    rosterByReg.set(regId, list);
  }

  return regs.map((r) => {
    const id = Number(r.id);
    return {
      id,
      championshipId: Number(r.championship_id),
      clanId: String(r.clan_id),
      clanName: String(r.clan_name),
      clanTag: String(r.clan_tag),
      clanEmblemId: String(r.clan_emblem_id || 'alpha_wolf'),
      leaderUid: String(r.leader_uid),
      leaderCallsign: String(r.leader_callsign),
      status: String(r.status) as RegistrationStatus,
      rosterLocked: Boolean(Number(r.roster_locked)),
      confirmedAt: r.confirmed_at ? String(r.confirmed_at) : null,
      createdAt: String(r.created_at),
      roster: rosterByReg.get(id) || [],
    };
  });
}

export function getMatchesForChampionship(
  championshipId: number,
  filter?: { registrationId?: number; phase?: MatchPhase },
  db = getChampionshipDb()
): MatchRecord[] {
  const rows = db
    .prepare(
      `SELECT
         m.*,
         ra.clan_name AS clan_a_name, ra.clan_tag AS clan_a_tag, ra.clan_emblem_id AS clan_a_emblem,
         rb.clan_name AS clan_b_name, rb.clan_tag AS clan_b_tag, rb.clan_emblem_id AS clan_b_emblem
       FROM championship_matches m
       JOIN championship_registrations ra ON ra.id = m.clan_a_reg_id
       JOIN championship_registrations rb ON rb.id = m.clan_b_reg_id
       WHERE m.championship_id = ?
       ORDER BY
         CASE m.phase
           WHEN 'ROUND_ROBIN' THEN 0
           WHEN 'QUARTERFINAL' THEN 1
           WHEN 'SEMIFINAL' THEN 2
           WHEN 'FINAL' THEN 3
         END ASC,
         m.round_number ASC,
         m.starts_at ASC,
         m.id ASC`
    )
    .all(championshipId) as Array<Record<string, unknown>>;

  const mapped: MatchRecord[] = rows.map((r) => ({
    id: Number(r.id),
    championshipId: Number(r.championship_id),
    phase: String(r.phase) as MatchPhase,
    roundNumber: Number(r.round_number),
    bracketSlot: r.bracket_slot ? String(r.bracket_slot) : null,
    clanARegId: Number(r.clan_a_reg_id),
    clanBRegId: Number(r.clan_b_reg_id),
    clanAName: String(r.clan_a_name),
    clanATag: String(r.clan_a_tag),
    clanAEmblemId: String(r.clan_a_emblem || 'alpha_wolf'),
    clanBName: String(r.clan_b_name),
    clanBTag: String(r.clan_b_tag),
    clanBEmblemId: String(r.clan_b_emblem || 'alpha_wolf'),
    arenaMode: String(r.arena_mode),
    roomOpensAt: String(r.room_opens_at),
    startsAt: String(r.starts_at),
    woDeadlineAt: String(r.wo_deadline_at),
    status: String(r.status) as MatchStatus,
    scoreA: Number(r.score_a || 0),
    scoreB: Number(r.score_b || 0),
    killsA: Number(r.kills_a || 0),
    killsB: Number(r.kills_b || 0),
    winnerRegId: r.winner_reg_id !== null && r.winner_reg_id !== undefined ? Number(r.winner_reg_id) : null,
    woClanRegId: r.wo_clan_reg_id !== null && r.wo_clan_reg_id !== undefined ? Number(r.wo_clan_reg_id) : null,
    privateRoomCode: r.private_room_code ? String(r.private_room_code) : null,
  }));

  return mapped.filter((m) => {
    if (filter?.phase && m.phase !== filter.phase) return false;
    if (
      filter?.registrationId &&
      m.clanARegId !== filter.registrationId &&
      m.clanBRegId !== filter.registrationId
    ) {
      return false;
    }
    return true;
  });
}

export function recalculateAndPersistStandings(
  db: DatabaseSync,
  championshipId: number
): StandingRecord[] {
  const champ = getChampionshipById(championshipId, db);
  const confirmedRows = db
    .prepare(
      `SELECT id, clan_id, clan_name, clan_tag, clan_emblem_id
       FROM championship_registrations
       WHERE championship_id = ? AND status = 'CONFIRMADO'`
    )
    .all(championshipId) as Array<Record<string, unknown>>;

  const clanMetas: StandingClanMeta[] = confirmedRows.map((r) => ({
    registrationId: Number(r.id),
    clanId: String(r.clan_id),
    clanName: String(r.clan_name),
    clanTag: String(r.clan_tag),
    clanEmblemId: String(r.clan_emblem_id || 'alpha_wolf'),
  }));

  const rrMatches = db
    .prepare(
      `SELECT clan_a_reg_id, clan_b_reg_id, status, score_a, score_b, kills_a, kills_b, winner_reg_id, wo_clan_reg_id
       FROM championship_matches
       WHERE championship_id = ? AND phase = 'ROUND_ROBIN' AND status IN ('FINALIZADO', 'WO')`
    )
    .all(championshipId) as Array<Record<string, unknown>>;

  const completed: CompletedRoundRobinMatch[] = rrMatches.map((m) => ({
    clanARegId: Number(m.clan_a_reg_id),
    clanBRegId: Number(m.clan_b_reg_id),
    status: String(m.status) as 'FINALIZADO' | 'WO',
    scoreA: Number(m.score_a || 0),
    scoreB: Number(m.score_b || 0),
    killsA: Number(m.kills_a || 0),
    killsB: Number(m.kills_b || 0),
    winnerRegId:
      m.winner_reg_id !== null && m.winner_reg_id !== undefined ? Number(m.winner_reg_id) : null,
    woClanRegId:
      m.wo_clan_reg_id !== null && m.wo_clan_reg_id !== undefined ? Number(m.wo_clan_reg_id) : null,
  }));

  const standings = computeStandingsWithTieBreakers(clanMetas, completed, champ.playoffSize);

  db.prepare('DELETE FROM championship_standings WHERE championship_id = ?').run(championshipId);
  const insertStmt = db.prepare(
    `INSERT INTO championship_standings (
      championship_id, registration_id, played, wins, draws, losses, wo_losses,
      points, rounds_for, rounds_against, round_diff, total_kills, total_deaths, kill_diff, rank_position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const s of standings) {
    insertStmt.run(
      championshipId,
      s.registrationId,
      s.played,
      s.wins,
      s.draws,
      s.losses,
      s.woLosses,
      s.points,
      s.roundsFor,
      s.roundsAgainst,
      s.roundDiff,
      s.totalKills,
      s.totalDeaths,
      s.killDiff,
      s.rankPosition
    );
  }

  return standings;
}

export function getStandingsForChampionship(
  championshipId: number,
  db = getChampionshipDb()
): StandingRecord[] {
  const champ = getChampionshipById(championshipId, db);
  const rows = db
    .prepare(
      `SELECT
         s.*,
         r.clan_id, r.clan_name, r.clan_tag, r.clan_emblem_id
       FROM championship_standings s
       JOIN championship_registrations r ON r.id = s.registration_id
       WHERE s.championship_id = ?
       ORDER BY s.rank_position ASC`
    )
    .all(championshipId) as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    return recalculateAndPersistStandings(db, championshipId);
  }

  const effectiveCut = Math.min(
    champ.playoffSize,
    rows.length >= 4 ? champ.playoffSize : Math.min(2, rows.length)
  );

  return rows.map((r, idx) => ({
    registrationId: Number(r.registration_id),
    clanId: String(r.clan_id),
    clanName: String(r.clan_name),
    clanTag: String(r.clan_tag),
    clanEmblemId: String(r.clan_emblem_id || 'alpha_wolf'),
    played: Number(r.played),
    wins: Number(r.wins),
    draws: Number(r.draws),
    losses: Number(r.losses),
    woLosses: Number(r.wo_losses),
    points: Number(r.points),
    roundsFor: Number(r.rounds_for),
    roundsAgainst: Number(r.rounds_against),
    roundDiff: Number(r.round_diff),
    totalKills: Number(r.total_kills),
    totalDeaths: Number(r.total_deaths),
    killDiff: Number(r.kill_diff),
    rankPosition: Number(r.rank_position),
    inPlayoffZone: idx < effectiveCut,
  }));
}

export function getAuditLogsForChampionship(
  championshipId: number,
  limitRows = 80,
  db = getChampionshipDb()
): AuditLogRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM championship_audit_logs
       WHERE championship_id = ? OR championship_id IS NULL
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(championshipId, Math.max(1, Math.min(200, limitRows))) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    championshipId:
      r.championship_id !== null && r.championship_id !== undefined
        ? Number(r.championship_id)
        : null,
    actorUid: String(r.actor_uid),
    actorRole: String(r.actor_role) as AuditLogRecord['actorRole'],
    actionType: String(r.action_type),
    entityType: String(r.entity_type),
    entityId: String(r.entity_id),
    payloadJson: String(r.payload_json || '{}'),
    createdAt: String(r.created_at),
  }));
}

export function getActiveChampionshipOverview(authUser: VerifiedAuthUser | null): {
  serverNowMs: number;
  isAdmin: boolean;
  stripeConfigured: boolean;
  championship: ChampionshipRecord;
  confirmedCount: number;
  pendingCount: number;
  registrations: RegistrationRecord[];
  myRegistration: RegistrationRecord | null;
  nextMatch: MatchRecord | null;
  matches: MatchRecord[];
  standings: StandingRecord[];
} {
  const db = getChampionshipDb();
  const championship = getActiveChampionship(db);
  const registrations = getRegistrationsForChampionship(championship.id, db);
  const matches = getMatchesForChampionship(championship.id, undefined, db);
  const standings = getStandingsForChampionship(championship.id, db);

  const confirmedCount = registrations.filter((r) => r.status === 'CONFIRMADO').length;
  const pendingCount = registrations.filter((r) => r.status === 'PENDENTE_PAGAMENTO').length;

  let myRegistration: RegistrationRecord | null = null;
  if (authUser) {
    myRegistration =
      registrations.find(
        (reg) =>
          reg.leaderUid === authUser.uid ||
          reg.roster.some((m) => m.playerUid === authUser.uid)
      ) || null;
  }

  // Next match prioritizes the player's own clan upcoming/open/live match, otherwise next global match
  const upcomingStatuses = new Set<MatchStatus>(['AO_VIVO', 'SALA_ABERTA', 'AGENDADO']);
  const myUpcoming = myRegistration
    ? matches.find(
        (m) =>
          upcomingStatuses.has(m.status) &&
          (m.clanARegId === myRegistration!.id || m.clanBRegId === myRegistration!.id)
      ) || null
    : null;
  const anyUpcoming = matches.find((m) => upcomingStatuses.has(m.status)) || null;

  return {
    serverNowMs: Date.now(),
    isAdmin: Boolean(authUser?.isAdmin),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    championship,
    confirmedCount,
    pendingCount,
    registrations,
    myRegistration,
    nextMatch: myUpcoming || anyUpcoming,
    matches,
    standings,
  };
}

/**
 * Authoritative Clan Registration:
 * 1. Verifies championship is open (`INSCRICOES_ABERTAS`).
 * 2. Fetches the live Clan document from Cloud Firestore using the caller's Firebase ID Token.
 * 3. Confirms caller is strictly the Clan Leader (`ownerUid === authUser.uid`).
 * 4. Confirms exactly 5 starters + 0..2 reserves, all unique and genuine members of that clan.
 * 5. Enforces DB-level uniqueness preventing any player from joining two clans in the same tournament.
 */
export async function registerClanForChampionship(
  championshipId: number,
  authUser: VerifiedAuthUser,
  params: {
    clanId: string;
    starterUids: string[];
    reserveUids: string[];
  }
): Promise<RegistrationRecord> {
  const clan = await fetchVerifiedClanFromFirestore(params.clanId, authUser.rawIdToken);
  if (!clan) {
    throw new ChampionshipError(
      404,
      'CLAN_NOT_FOUND',
      'Clã não encontrado no Firestore ou sem permissão de leitura.'
    );
  }
  if (clan.ownerUid !== authUser.uid) {
    throw new ChampionshipError(
      403,
      'LEADER_ONLY',
      'Apenas o Líder oficial do clã pode inscrever o elenco no campeonato.'
    );
  }

  const starterUids = Array.from(new Set((params.starterUids || []).map((s) => String(s).trim()).filter(Boolean)));
  const reserveUids = Array.from(new Set((params.reserveUids || []).map((s) => String(s).trim()).filter(Boolean)));

  if (starterUids.length !== 5) {
    throw new ChampionshipError(
      400,
      'INVALID_STARTERS_COUNT',
      `Selecione exatamente 5 jogadores titulares (selecionados: ${starterUids.length}).`
    );
  }
  if (reserveUids.length > 2) {
    throw new ChampionshipError(
      400,
      'INVALID_RESERVES_COUNT',
      'É permitido inscrever no máximo 2 jogadores reservas.'
    );
  }

  const allSelectedUids = [...starterUids, ...reserveUids];
  if (new Set(allSelectedUids).size !== allSelectedUids.length) {
    throw new ChampionshipError(
      400,
      'DUPLICATE_ROSTER_MEMBER',
      'Um mesmo jogador não pode ser titular e reserva ao mesmo tempo.'
    );
  }

  for (const uid of allSelectedUids) {
    if (!clan.memberUids.includes(uid) && !clan.members[uid]) {
      throw new ChampionshipError(
        400,
        'PLAYER_NOT_IN_CLAN',
        `O jogador (${uid}) não pertence atualmente ao clã ${clan.name}.`
      );
    }
  }

  return withChampionshipTransaction((db) => {
    const champ = getChampionshipById(championshipId, db);
    if (champ.status !== 'INSCRICOES_ABERTAS') {
      throw new ChampionshipError(
        409,
        'REGISTRATIONS_CLOSED',
        `As inscrições não estão abertas (fase atual: ${champ.status}).`
      );
    }

    const existingReg = db
      .prepare(
        'SELECT * FROM championship_registrations WHERE championship_id = ? AND clan_id = ?'
      )
      .get(championshipId, clan.clanId) as Record<string, unknown> | undefined;

    if (existingReg && Number(existingReg.roster_locked) === 1) {
      throw new ChampionshipError(
        409,
        'ROSTER_LOCKED',
        'O elenco deste clã já foi travado após o Roster Lock.'
      );
    }

    if (!existingReg) {
      const confirmedCntRow = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM championship_registrations
           WHERE championship_id = ? AND status IN ('CONFIRMADO', 'PENDENTE_PAGAMENTO')`
        )
        .get(championshipId) as { cnt: number };
      if (Number(confirmedCntRow.cnt) >= champ.maxClans) {
        throw new ChampionshipError(
          409,
          'CHAMPIONSHIP_FULL',
          `Limite máximo de ${champ.maxClans} clãs atingido para esta temporada.`
        );
      }
    }

    // Check if any selected player is already locked/registered under ANOTHER clan
    const existingRegId = existingReg ? Number(existingReg.id) : -1;
    for (const uid of allSelectedUids) {
      const conflict = db
        .prepare(
          `SELECT r.registration_id, reg.clan_name
           FROM championship_rosters r
           JOIN championship_registrations reg ON reg.id = r.registration_id
           WHERE r.championship_id = ? AND r.player_uid = ? AND r.registration_id <> ?`
        )
        .get(championshipId, uid, existingRegId) as
        | { registration_id: number; clan_name: string }
        | undefined;
      if (conflict) {
        const callsign = clan.members[uid]?.callsign || uid;
        throw new ChampionshipError(
          409,
          'PLAYER_ALREADY_REGISTERED',
          `O jogador ${callsign} já está inscrito pelo clã "${conflict.clan_name}" neste campeonato.`
        );
      }
    }

    const nowIso = new Date().toISOString();
    let registrationId = existingRegId;

    if (!existingReg) {
      const initialStatus: RegistrationStatus =
        champ.entryFeeCents === 0 ? 'CONFIRMADO' : 'PENDENTE_PAGAMENTO';
      const insertReg = db
        .prepare(
          `INSERT INTO championship_registrations (
            championship_id, clan_id, clan_name, clan_tag, clan_emblem_id,
            leader_uid, leader_callsign, status, roster_locked, confirmed_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          championshipId,
          clan.clanId,
          clan.name,
          clan.tag,
          clan.emblemId,
          clan.ownerUid,
          clan.ownerCallsign,
          initialStatus,
          initialStatus === 'CONFIRMADO' ? nowIso : null,
          nowIso
        );
      registrationId = Number(insertReg.lastInsertRowid);
    } else {
      db.prepare(
        `UPDATE championship_registrations
         SET clan_name = ?, clan_tag = ?, clan_emblem_id = ?, leader_callsign = ?
         WHERE id = ?`
      ).run(clan.name, clan.tag, clan.emblemId, clan.ownerCallsign, registrationId);
    }

    // Replace roster members atomically
    db.prepare('DELETE FROM championship_rosters WHERE registration_id = ?').run(registrationId);
    const insertRoster = db.prepare(
      `INSERT INTO championship_rosters (
        championship_id, registration_id, player_uid, player_callsign, avatar_data_url, slot_role, locked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL)`
    );

    for (const uid of starterUids) {
      const m = clan.members[uid];
      insertRoster.run(
        championshipId,
        registrationId,
        uid,
        m?.callsign || 'TITULAR',
        m?.avatarDataUrl || '',
        'TITULAR'
      );
    }
    for (const uid of reserveUids) {
      const m = clan.members[uid];
      insertRoster.run(
        championshipId,
        registrationId,
        uid,
        m?.callsign || 'RESERVA',
        m?.avatarDataUrl || '',
        'RESERVA'
      );
    }

    appendAuditLog(db, {
      championshipId,
      actorUid: authUser.uid,
      actorRole: 'LIDER',
      actionType: existingReg ? 'ROSTER_UPDATED' : 'CLAN_REGISTERED',
      entityType: 'registration',
      entityId: String(registrationId),
      payload: {
        clanId: clan.clanId,
        clanName: clan.name,
        starters: starterUids,
        reserves: reserveUids,
      },
    });

    const allRegs = getRegistrationsForChampionship(championshipId, db);
    const saved = allRegs.find((r) => r.id === registrationId);
    if (!saved) {
      throw new ChampionshipError(500, 'REGISTRATION_SAVE_ERROR', 'Falha ao salvar inscrição.');
    }
    return saved;
  });
}

/**
 * Creates a real Stripe Checkout session for the Clan's tournament entry fee.
 * Registration remains `PENDENTE_PAGAMENTO` until the signed Stripe webhook confirms payment.
 */
export async function createStripeCheckoutForRegistration(
  championshipId: number,
  authUser: VerifiedAuthUser,
  originUrl: string
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const db = getChampionshipDb();
  const champ = getChampionshipById(championshipId, db);
  if (champ.status !== 'INSCRICOES_ABERTAS') {
    throw new ChampionshipError(
      409,
      'REGISTRATIONS_CLOSED',
      'Pagamentos só podem ser iniciados enquanto as inscrições estiverem abertas.'
    );
  }

  const regRow = db
    .prepare(
      `SELECT * FROM championship_registrations
       WHERE championship_id = ? AND leader_uid = ?`
    )
    .get(championshipId, authUser.uid) as Record<string, unknown> | undefined;

  if (!regRow) {
    throw new ChampionshipError(
      404,
      'REGISTRATION_NOT_FOUND',
      'Inscreva primeiro os 5 titulares do seu clã antes de gerar o pagamento.'
    );
  }
  if (String(regRow.status) === 'CONFIRMADO') {
    throw new ChampionshipError(
      409,
      'ALREADY_CONFIRMED',
      'A inscrição deste clã já está paga e confirmada!'
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) {
    throw new ChampionshipError(
      503,
      'STRIPE_NOT_CONFIGURED',
      'Gateway Stripe pronto no servidor. Configure STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET nas variáveis de ambiente para liberar o checkout em R$ (ou use a confirmação manual auditada no Painel Admin para testes).'
    );
  }

  const registrationId = Number(regRow.id);
  const clanName = String(regRow.clan_name);
  const clanId = String(regRow.clan_id);

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('client_reference_id', `${championshipId}:${registrationId}`);
  params.set(
    'success_url',
    `${originUrl}/?championship_payment=success&cid=${championshipId}`
  );
  params.set(
    'cancel_url',
    `${originUrl}/?championship_payment=cancel&cid=${championshipId}`
  );
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'brl');
  params.set('line_items[0][price_data][unit_amount]', String(champ.entryFeeCents));
  params.set(
    'line_items[0][price_data][product_data][name]',
    `Inscrição Campeonato KINETIC · ${clanName} (${champ.seasonLabel})`
  );
  params.set('metadata[type]', 'championship_entry');
  params.set('metadata[championshipId]', String(championshipId));
  params.set('metadata[registrationId]', String(registrationId));
  params.set('metadata[clanId]', clanId);
  params.set('metadata[leaderUid]', authUser.uid);

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const stripeData = (await stripeRes.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!stripeRes.ok || !stripeData.id || !stripeData.url) {
    throw new ChampionshipError(
      502,
      'STRIPE_SESSION_FAILED',
      stripeData.error?.message || 'Erro ao criar sessão de checkout na Stripe.'
    );
  }

  withChampionshipTransaction((txDb) => {
    txDb
      .prepare(
        `INSERT OR IGNORE INTO championship_payments (
          championship_id, registration_id, provider, stripe_session_id,
          external_event_id, amount_cents, currency, status, paid_at, created_at
        ) VALUES (?, ?, 'STRIPE', ?, NULL, ?, 'BRL', 'PENDING', NULL, ?)`
      )
      .run(
        championshipId,
        registrationId,
        stripeData.id!,
        champ.entryFeeCents,
        new Date().toISOString()
      );

    appendAuditLog(txDb, {
      championshipId,
      actorUid: authUser.uid,
      actorRole: 'LIDER',
      actionType: 'CHECKOUT_CREATED',
      entityType: 'payment',
      entityId: stripeData.id!,
      payload: { registrationId, clanId, amountCents: champ.entryFeeCents },
    });
  });

  return { checkoutUrl: stripeData.url, sessionId: stripeData.id };
}

/**
 * Authoritative & Idempotent Stripe Webhook Handler.
 * Validates raw-body HMAC-SHA256 signature and ensures duplicate webhooks are ignored safely.
 */
export function processStripeWebhookEvent(
  rawBody: Buffer,
  signatureHeader: string | undefined
): { received: boolean; duplicate?: boolean; confirmedRegistrationId?: number } {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new ChampionshipError(
      503,
      'WEBHOOK_SECRET_NOT_CONFIGURED',
      'STRIPE_WEBHOOK_SECRET não configurado no servidor.'
    );
  }

  const check = verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
  if (!check.valid) {
    throw new ChampionshipError(
      400,
      'INVALID_WEBHOOK_SIGNATURE',
      `Assinatura Stripe inválida (${check.reason || 'unknown'}).`
    );
  }

  const event = JSON.parse(rawBody.toString('utf8')) as {
    id?: string;
    type?: string;
    data?: {
      object?: {
        id?: string;
        payment_status?: string;
        amount_total?: number;
        metadata?: Record<string, string>;
      };
    };
  };

  if (!event.id || !event.type) {
    throw new ChampionshipError(400, 'MALFORMED_EVENT', 'Payload de evento Stripe inválido.');
  }

  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  ) {
    return { received: true };
  }

  const session = event.data?.object;
  if (!session || session.metadata?.type !== 'championship_entry') {
    return { received: true };
  }
  if (session.payment_status && session.payment_status !== 'paid') {
    return { received: true };
  }

  const championshipId = Number(session.metadata.championshipId);
  const registrationId = Number(session.metadata.registrationId);
  if (!Number.isFinite(championshipId) || !Number.isFinite(registrationId)) {
    throw new ChampionshipError(400, 'MISSING_METADATA', 'Metadados do campeonato ausentes.');
  }

  return withChampionshipTransaction((db) => {
    // Idempotency guard: check if this exact Stripe event ID was already processed
    const existingEvent = db
      .prepare(
        `SELECT id FROM championship_payments
         WHERE provider = 'STRIPE' AND external_event_id = ?`
      )
      .get(event.id!) as { id: number } | undefined;

    if (existingEvent) {
      return { received: true, duplicate: true, confirmedRegistrationId: registrationId };
    }

    const nowIso = new Date().toISOString();
    const sessionId = session.id || `evt_${event.id}`;
    const existingPayment = db
      .prepare('SELECT id FROM championship_payments WHERE stripe_session_id = ?')
      .get(sessionId) as { id: number } | undefined;

    if (existingPayment) {
      db.prepare(
        `UPDATE championship_payments
         SET external_event_id = ?, status = 'PAID', paid_at = ?
         WHERE id = ?`
      ).run(event.id!, nowIso, existingPayment.id);
    } else {
      db.prepare(
        `INSERT INTO championship_payments (
          championship_id, registration_id, provider, stripe_session_id,
          external_event_id, amount_cents, currency, status, paid_at, created_at
        ) VALUES (?, ?, 'STRIPE', ?, ?, ?, 'BRL', 'PAID', ?, ?)`
      ).run(
        championshipId,
        registrationId,
        sessionId,
        event.id!,
        Number(session.amount_total || 0),
        nowIso,
        nowIso
      );
    }

    db.prepare(
      `UPDATE championship_registrations
       SET status = 'CONFIRMADO', confirmed_at = ?
       WHERE id = ? AND championship_id = ?`
    ).run(nowIso, registrationId, championshipId);

    recalculateAndPersistStandings(db, championshipId);

    appendAuditLog(db, {
      championshipId,
      actorUid: 'stripe_webhook',
      actorRole: 'WEBHOOK',
      actionType: 'PAYMENT_CONFIRMED',
      entityType: 'registration',
      entityId: String(registrationId),
      payload: {
        stripeEventId: event.id,
        stripeSessionId: sessionId,
        amountCents: Number(session.amount_total || 0),
      },
    });

    return { received: true, duplicate: false, confirmedRegistrationId: registrationId };
  });
}

function seedMatchLineupsFromRoster(
  db: DatabaseSync,
  matchId: number,
  clanARegId: number,
  clanBRegId: number
): void {
  const rosterRows = db
    .prepare(
      `SELECT registration_id, player_uid, player_callsign, slot_role
       FROM championship_rosters
       WHERE registration_id IN (?, ?)`
    )
    .all(clanARegId, clanBRegId) as Array<Record<string, unknown>>;

  const insertLineup = db.prepare(
    `INSERT OR IGNORE INTO championship_match_lineups (
      match_id, registration_id, player_uid, player_callsign, slot_role,
      is_active_starter, is_ready, ready_at, substituted_by_uid
    ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, NULL)`
  );

  for (const r of rosterRows) {
    const isStarter = String(r.slot_role) === 'TITULAR' ? 1 : 0;
    insertLineup.run(
      matchId,
      Number(r.registration_id),
      String(r.player_uid),
      String(r.player_callsign),
      String(r.slot_role),
      isStarter
    );
  }
}

/**
 * Executes ROSTER_LOCK: freezes all confirmed rosters, generates the complete Round-Robin
 * schedule via Berger/Circle Method, seeds per-match lineups & standings, and transitions
 * the championship into EM_ANDAMENTO.
 */
export function executeRosterLockAndGenerateMatches(
  championshipId: number,
  actorUid: string,
  actorRole: 'SYSTEM' | 'ADMIN'
): { matchesGenerated: number; confirmedClans: number } {
  return withChampionshipTransaction((db) => {
    const champ = getChampionshipById(championshipId, db);
    const confirmedRegs = db
      .prepare(
        `SELECT id, clan_name FROM championship_registrations
         WHERE championship_id = ? AND status = 'CONFIRMADO'
         ORDER BY id ASC`
      )
      .all(championshipId) as Array<{ id: number; clan_name: string }>;

    if (confirmedRegs.length < 2) {
      throw new ChampionshipError(
        409,
        'NOT_ENOUGH_CLANS',
        'São necessários pelo menos 2 clãs confirmados para travar elencos e gerar a tabela Round-Robin.'
      );
    }

    const nowIso = new Date().toISOString();

    // 1. Trava os elencos de todos os clãs confirmados (ROSTER_LOCK)
    db.prepare(
      `UPDATE championship_registrations
       SET roster_locked = 1
       WHERE championship_id = ? AND status = 'CONFIRMADO'`
    ).run(championshipId);

    db.prepare(
      `UPDATE championship_rosters
       SET locked_at = ?
       WHERE championship_id = ? AND registration_id IN (
         SELECT id FROM championship_registrations
         WHERE championship_id = ? AND status = 'CONFIRMADO'
       )`
    ).run(nowIso, championshipId, championshipId);

    // Cancela inscrições que não pagaram até o Roster Lock
    db.prepare(
      `UPDATE championship_registrations
       SET status = 'CANCELADO'
       WHERE championship_id = ? AND status = 'PENDENTE_PAGAMENTO'`
    ).run(championshipId);

    // 2. Gera confrontos Round-Robin apenas se ainda não existirem
    const existingMatchesRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM championship_matches
         WHERE championship_id = ? AND phase = 'ROUND_ROBIN'`
      )
      .get(championshipId) as { cnt: number };

    let matchesGenerated = Number(existingMatchesRow.cnt);

    if (matchesGenerated === 0) {
      const startAnchorIso =
        Date.parse(champ.startsAt) > Date.now()
          ? champ.startsAt
          : new Date(Date.now() + 35 * 60 * 1000).toISOString();

      const fixtures = generateRoundRobinSchedule(
        confirmedRegs.map((r) => ({ registrationId: Number(r.id), clanName: String(r.clan_name) })),
        startAnchorIso
      );

      const insertMatch = db.prepare(
        `INSERT INTO championship_matches (
          championship_id, phase, round_number, bracket_slot,
          clan_a_reg_id, clan_b_reg_id, arena_mode,
          room_opens_at, starts_at, wo_deadline_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO')`
      );

      for (const fx of fixtures) {
        const res = insertMatch.run(
          championshipId,
          fx.phase,
          fx.roundNumber,
          fx.bracketSlot,
          fx.clanARegId,
          fx.clanBRegId,
          fx.arenaMode,
          fx.roomOpensAt,
          fx.startsAt,
          fx.woDeadlineAt
        );
        const matchId = Number(res.lastInsertRowid);
        seedMatchLineupsFromRoster(db, matchId, fx.clanARegId, fx.clanBRegId);
      }
      matchesGenerated = fixtures.length;
    }

    // 3. Ajusta tamanho automático dos Playoffs (Top 8 acima de 8 clãs, Top 4 até 8 clãs)
    const effectivePlayoffSize = confirmedRegs.length >= 9 ? 8 : 4;

    db.prepare(
      `UPDATE championships
       SET status = 'EM_ANDAMENTO', playoff_size = ?, updated_at = ?
       WHERE id = ?`
    ).run(effectivePlayoffSize, nowIso, championshipId);

    recalculateAndPersistStandings(db, championshipId);

    appendAuditLog(db, {
      championshipId,
      actorUid,
      actorRole,
      actionType: 'ROSTER_LOCK_AND_SCHEDULE_GENERATED',
      entityType: 'championship',
      entityId: String(championshipId),
      payload: {
        confirmedClans: confirmedRegs.length,
        matchesGenerated,
        playoffSize: effectivePlayoffSize,
      },
    });

    return { matchesGenerated, confirmedClans: confirmedRegs.length };
  });
}

export function getMatchLobbySnapshot(
  matchId: number,
  connectedUids: string[] = [],
  db = getChampionshipDb()
): ChampionshipLobbySnapshot {
  const matchRow = db
    .prepare('SELECT championship_id FROM championship_matches WHERE id = ?')
    .get(matchId) as { championship_id: number } | undefined;
  if (!matchRow) {
    throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
  }

  const allMatches = getMatchesForChampionship(Number(matchRow.championship_id), undefined, db);
  const match = allMatches.find((m) => m.id === matchId);
  if (!match) {
    throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
  }

  const lineupRows = db
    .prepare(
      `SELECT * FROM championship_match_lineups
       WHERE match_id = ?
       ORDER BY is_active_starter DESC, id ASC`
    )
    .all(matchId) as Array<Record<string, unknown>>;

  const mapPlayer = (r: Record<string, unknown>): MatchLineupPlayer => ({
    id: Number(r.id),
    matchId: Number(r.match_id),
    registrationId: Number(r.registration_id),
    playerUid: String(r.player_uid),
    playerCallsign: String(r.player_callsign),
    slotRole: String(r.slot_role) as RosterSlotRole,
    isActiveStarter: Boolean(Number(r.is_active_starter)),
    isReady: Boolean(Number(r.is_ready)),
    readyAt: r.ready_at ? String(r.ready_at) : null,
    substitutedByUid: r.substituted_by_uid ? String(r.substituted_by_uid) : null,
  });

  const clanALineup = lineupRows
    .filter((r) => Number(r.registration_id) === match.clanARegId)
    .map(mapPlayer);
  const clanBLineup = lineupRows
    .filter((r) => Number(r.registration_id) === match.clanBRegId)
    .map(mapPlayer);

  const serverNowMs = Date.now();
  const startsAtMs = Date.parse(match.startsAt) || serverNowMs;
  const substitutionCutoffMs = startsAtMs - SUBSTITUTION_CUTOFF_MS;

  return {
    match,
    serverNowMs,
    substitutionCutoffMs,
    canSubstituteNow:
      (match.status === 'SALA_ABERTA' || match.status === 'AGENDADO') &&
      serverNowMs <= substitutionCutoffMs,
    clanALineup,
    clanBLineup,
    clanAReadyCount: clanALineup.filter((p) => p.isActiveStarter && p.isReady).length,
    clanBReadyCount: clanBLineup.filter((p) => p.isActiveStarter && p.isReady).length,
    connectedUids,
  };
}

/**
 * Issues a single-player temporary HMAC token to enter a private match lobby.
 * Rejects anyone outside the two locked rosters and rejects entry before `room_opens_at`.
 */
export function issueMatchLobbyToken(
  matchId: number,
  authUser: VerifiedAuthUser
): {
  token: string;
  expiresInSec: number;
  lobby: ChampionshipLobbySnapshot;
} {
  const db = getChampionshipDb();
  const match = db
    .prepare('SELECT * FROM championship_matches WHERE id = ?')
    .get(matchId) as Record<string, unknown> | undefined;

  if (!match) {
    throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
  }

  const nowMs = Date.now();
  const roomOpensMs = Date.parse(String(match.room_opens_at));
  const status = String(match.status) as MatchStatus;

  if (status === 'FINALIZADO' || status === 'WO') {
    throw new ChampionshipError(409, 'MATCH_ALREADY_CLOSED', 'Esta partida já foi encerrada.');
  }
  if (status === 'AGENDADO' && nowMs < roomOpensMs) {
    throw new ChampionshipError(
      403,
      'ROOM_NOT_OPEN_YET',
      'A sala privada ainda está bloqueada. Aguarde o horário oficial de abertura.'
    );
  }

  // Auto-promote AGENDADO -> SALA_ABERTA if we crossed roomOpensMs between scheduler ticks
  if (status === 'AGENDADO' && nowMs >= roomOpensMs) {
    withChampionshipTransaction((txDb) => {
      txDb
        .prepare("UPDATE championship_matches SET status = 'SALA_ABERTA' WHERE id = ? AND status = 'AGENDADO'")
        .run(matchId);
      appendAuditLog(txDb, {
        championshipId: Number(match.championship_id),
        actorUid: 'system_scheduler',
        actorRole: 'SYSTEM',
        actionType: 'ROOM_OPENED',
        entityType: 'match',
        entityId: String(matchId),
      });
    });
  }

  const clanARegId = Number(match.clan_a_reg_id);
  const clanBRegId = Number(match.clan_b_reg_id);

  // Verify caller is in the locked roster of clan A or clan B (or is organizer Admin)
  const rosterEntry = db
    .prepare(
      `SELECT r.*, reg.clan_id, reg.leader_uid
       FROM championship_rosters r
       JOIN championship_registrations reg ON reg.id = r.registration_id
       WHERE r.registration_id IN (?, ?) AND r.player_uid = ?`
    )
    .get(clanARegId, clanBRegId, authUser.uid) as Record<string, unknown> | undefined;

  if (!rosterEntry) {
    throw new ChampionshipError(
      403,
      'NOT_IN_MATCH_ROSTER',
      'Acesso negado: apenas titulares e reservas inscritos nos dois clãs podem entrar nesta sala.'
    );
  }

  const ttlSeconds = 300;
  const token = signMatchLobbyToken(
    {
      matchId,
      championshipId: Number(match.championship_id),
      uid: authUser.uid,
      callsign: String(rosterEntry.player_callsign),
      clanId: String(rosterEntry.clan_id),
      registrationId: Number(rosterEntry.registration_id),
      slotRole: String(rosterEntry.slot_role) as RosterSlotRole,
      isLeader: String(rosterEntry.leader_uid) === authUser.uid,
    },
    ttlSeconds
  );

  return {
    token,
    expiresInSec: ttlSeconds,
    lobby: getMatchLobbySnapshot(matchId, [], db),
  };
}

/**
 * Leader Substitution: swaps 1 active starter for 1 registered reserve up to 5 minutes before match start.
 */
export function substituteMatchStarter(
  matchId: number,
  authUser: VerifiedAuthUser,
  params: { starterOutUid: string; reserveInUid: string }
): ChampionshipLobbySnapshot {
  return withChampionshipTransaction((db) => {
    const match = db
      .prepare('SELECT * FROM championship_matches WHERE id = ?')
      .get(matchId) as Record<string, unknown> | undefined;

    if (!match) {
      throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
    }

    const status = String(match.status) as MatchStatus;
    if (status !== 'SALA_ABERTA' && status !== 'AGENDADO') {
      throw new ChampionshipError(
        409,
        'SUBSTITUTION_CLOSED',
        'Não é possível substituir jogadores após o início ou encerramento da partida.'
      );
    }

    const startsAtMs = Date.parse(String(match.starts_at));
    if (Date.now() > startsAtMs - SUBSTITUTION_CUTOFF_MS) {
      throw new ChampionshipError(
        409,
        'SUBSTITUTION_WINDOW_EXPIRED',
        'O prazo limite de substituição (5 minutos antes da partida) já foi encerrado.'
      );
    }

    // Confirm caller is leader of Clan A or Clan B
    const leaderReg = db
      .prepare(
        `SELECT * FROM championship_registrations
         WHERE id IN (?, ?) AND leader_uid = ?`
      )
      .get(Number(match.clan_a_reg_id), Number(match.clan_b_reg_id), authUser.uid) as
      | Record<string, unknown>
      | undefined;

    if (!leaderReg) {
      throw new ChampionshipError(
        403,
        'LEADER_ONLY',
        'Apenas o Líder de um dos clãs do confronto pode realizar substituições.'
      );
    }

    const regId = Number(leaderReg.id);
    const outRow = db
      .prepare(
        `SELECT * FROM championship_match_lineups
         WHERE match_id = ? AND registration_id = ? AND player_uid = ? AND is_active_starter = 1`
      )
      .get(matchId, regId, params.starterOutUid) as Record<string, unknown> | undefined;

    const inRow = db
      .prepare(
        `SELECT * FROM championship_match_lineups
         WHERE match_id = ? AND registration_id = ? AND player_uid = ? AND is_active_starter = 0`
      )
      .get(matchId, regId, params.reserveInUid) as Record<string, unknown> | undefined;

    if (!outRow || !inRow) {
      throw new ChampionshipError(
        400,
        'INVALID_SUBSTITUTION_PAIR',
        'Escolha um titular ativo para sair e um reserva inscrito do seu clã para entrar.'
      );
    }

    db.prepare(
      `UPDATE championship_match_lineups
       SET is_active_starter = 0, is_ready = 0, ready_at = NULL, substituted_by_uid = ?
       WHERE id = ?`
    ).run(authUser.uid, Number(outRow.id));

    db.prepare(
      `UPDATE championship_match_lineups
       SET is_active_starter = 1, is_ready = 0, ready_at = NULL, substituted_by_uid = ?
       WHERE id = ?`
    ).run(authUser.uid, Number(inRow.id));

    appendAuditLog(db, {
      championshipId: Number(match.championship_id),
      actorUid: authUser.uid,
      actorRole: 'LIDER',
      actionType: 'ROSTER_SUBSTITUTION',
      entityType: 'match',
      entityId: String(matchId),
      payload: {
        registrationId: regId,
        starterOutUid: params.starterOutUid,
        starterOutCallsign: String(outRow.player_callsign),
        reserveInUid: params.reserveInUid,
        reserveInCallsign: String(inRow.player_callsign),
      },
    });

    return getMatchLobbySnapshot(matchId, [], db);
  });
}

/**
 * Toggles a starter's Ready state inside a match lobby.
 * When both clans reach 5/5 active starters ready, generates a private room code and moves match to AO_VIVO.
 */
export function setMatchPlayerReady(
  matchId: number,
  playerUid: string,
  ready: boolean,
  connectedUids: string[] = []
): {
  lobby: ChampionshipLobbySnapshot;
  launchedRoomCode: string | null;
} {
  return withChampionshipTransaction((db) => {
    const match = db
      .prepare('SELECT * FROM championship_matches WHERE id = ?')
      .get(matchId) as Record<string, unknown> | undefined;

    if (!match) {
      throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
    }

    const status = String(match.status) as MatchStatus;
    if (status !== 'SALA_ABERTA' && status !== 'AO_VIVO') {
      throw new ChampionshipError(409, 'ROOM_NOT_OPEN', 'A sala não está aberta para Ready Check.');
    }

    const lineup = db
      .prepare(
        `SELECT * FROM championship_match_lineups
         WHERE match_id = ? AND player_uid = ?`
      )
      .get(matchId, playerUid) as Record<string, unknown> | undefined;

    if (!lineup) {
      throw new ChampionshipError(403, 'NOT_IN_LINEUP', 'Jogador não pertence a esta partida.');
    }
    if (Number(lineup.is_active_starter) !== 1) {
      throw new ChampionshipError(
        403,
        'RESERVE_CANNOT_READY',
        'Você está inscrito como Reserva nesta partida. O Líder precisa colocá-lo como Titular para confirmar Pronto.'
      );
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE championship_match_lineups
       SET is_ready = ?, ready_at = ?
       WHERE id = ?`
    ).run(ready ? 1 : 0, ready ? nowIso : null, Number(lineup.id));

    const lobby = getMatchLobbySnapshot(matchId, connectedUids, db);
    let launchedRoomCode: string | null = lobby.match.privateRoomCode;

    if (
      lobby.match.status === 'SALA_ABERTA' &&
      lobby.clanAReadyCount >= 5 &&
      lobby.clanBReadyCount >= 5
    ) {
      launchedRoomCode = `CP${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      db.prepare(
        `UPDATE championship_matches
         SET status = 'AO_VIVO', private_room_code = ?
         WHERE id = ?`
      ).run(launchedRoomCode, matchId);

      appendAuditLog(db, {
        championshipId: lobby.match.championshipId,
        actorUid: 'system_lobby',
        actorRole: 'SYSTEM',
        actionType: 'MATCH_STARTED',
        entityType: 'match',
        entityId: String(matchId),
        payload: {
          privateRoomCode: launchedRoomCode,
          arenaMode: lobby.match.arenaMode,
        },
      });
    }

    return {
      lobby: getMatchLobbySnapshot(matchId, connectedUids, db),
      launchedRoomCode:
        launchedRoomCode && lobby.clanAReadyCount >= 5 && lobby.clanBReadyCount >= 5
          ? launchedRoomCode
          : null,
    };
  });
}

function maybeAdvancePlayoffsOrFinalize(
  db: DatabaseSync,
  championshipId: number,
  actorUid: string,
  actorRole: 'SYSTEM' | 'ADMIN'
): void {
  const champ = getChampionshipById(championshipId, db);
  if (champ.status === 'FINALIZADO') return;

  const allMatches = getMatchesForChampionship(championshipId, undefined, db);
  const rrMatches = allMatches.filter((m) => m.phase === 'ROUND_ROBIN');
  const rrDone =
    rrMatches.length > 0 &&
    rrMatches.every((m) => m.status === 'FINALIZADO' || m.status === 'WO');

  if (!rrDone) return;

  const playoffMatches = allMatches.filter((m) => m.phase !== 'ROUND_ROBIN');

  // 1. If Round-Robin just finished and Playoffs haven't been created yet -> create Top 4 / Top 8 bracket
  if (playoffMatches.length === 0) {
    const standings = recalculateAndPersistStandings(db, championshipId);
    const startIso = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    const fixtures = generatePlayoffStageFixtures(standings, champ.playoffSize, startIso);
    const insertMatch = db.prepare(
      `INSERT INTO championship_matches (
        championship_id, phase, round_number, bracket_slot,
        clan_a_reg_id, clan_b_reg_id, arena_mode,
        room_opens_at, starts_at, wo_deadline_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO')`
    );

    for (const fx of fixtures) {
      const res = insertMatch.run(
        championshipId,
        fx.phase,
        fx.roundNumber,
        fx.bracketSlot,
        fx.clanARegId,
        fx.clanBRegId,
        fx.arenaMode,
        fx.roomOpensAt,
        fx.startsAt,
        fx.woDeadlineAt
      );
      seedMatchLineupsFromRoster(db, Number(res.lastInsertRowid), fx.clanARegId, fx.clanBRegId);
    }

    appendAuditLog(db, {
      championshipId,
      actorUid,
      actorRole,
      actionType: 'PLAYOFFS_GENERATED',
      entityType: 'championship',
      entityId: String(championshipId),
      payload: { fixturesCount: fixtures.length, playoffSize: champ.playoffSize },
    });
    return;
  }

  // 2. Advance Quarterfinals -> Semifinals
  const qfMatches = playoffMatches.filter((m) => m.phase === 'QUARTERFINAL');
  const sfMatches = playoffMatches.filter((m) => m.phase === 'SEMIFINAL');
  const finalMatches = playoffMatches.filter((m) => m.phase === 'FINAL');

  const insertBracketMatch = (
    phase: MatchPhase,
    slot: string,
    regA: number,
    regB: number,
    mapIdx: number
  ) => {
    const startMs = Date.now() + 45 * 60 * 1000 + mapIdx * 15 * 60 * 1000;
    const res = db
      .prepare(
        `INSERT INTO championship_matches (
          championship_id, phase, round_number, bracket_slot,
          clan_a_reg_id, clan_b_reg_id, arena_mode,
          room_opens_at, starts_at, wo_deadline_at, status
        ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'AGENDADO')`
      )
      .run(
        championshipId,
        phase,
        slot,
        regA,
        regB,
        CHAMPIONSHIP_MAP_POOL[mapIdx % CHAMPIONSHIP_MAP_POOL.length],
        new Date(startMs - 30 * 60 * 1000).toISOString(),
        new Date(startMs).toISOString(),
        new Date(startMs + 5 * 60 * 1000).toISOString()
      );
    seedMatchLineupsFromRoster(db, Number(res.lastInsertRowid), regA, regB);
  };

  if (
    qfMatches.length === 4 &&
    sfMatches.length === 0 &&
    qfMatches.every((m) => (m.status === 'FINALIZADO' || m.status === 'WO') && m.winnerRegId)
  ) {
    const bySlot = new Map(qfMatches.map((m) => [m.bracketSlot, m.winnerRegId!]));
    const w1 = bySlot.get('QF1');
    const w2 = bySlot.get('QF2');
    const w3 = bySlot.get('QF3');
    const w4 = bySlot.get('QF4');
    if (w1 && w2 && w3 && w4) {
      insertBracketMatch('SEMIFINAL', 'SF1', w1, w2, 0);
      insertBracketMatch('SEMIFINAL', 'SF2', w3, w4, 1);
      appendAuditLog(db, {
        championshipId,
        actorUid,
        actorRole,
        actionType: 'SEMIFINALS_GENERATED',
        entityType: 'championship',
        entityId: String(championshipId),
      });
    }
    return;
  }

  // 3. Advance Semifinals -> Grand Final
  if (
    sfMatches.length === 2 &&
    finalMatches.length === 0 &&
    sfMatches.every((m) => (m.status === 'FINALIZADO' || m.status === 'WO') && m.winnerRegId)
  ) {
    const w1 = sfMatches[0].winnerRegId!;
    const w2 = sfMatches[1].winnerRegId!;
    if (w1 !== w2) {
      insertBracketMatch('FINAL', 'GF', w1, w2, 5);
      appendAuditLog(db, {
        championshipId,
        actorUid,
        actorRole,
        actionType: 'GRAND_FINAL_GENERATED',
        entityType: 'championship',
        entityId: String(championshipId),
      });
    }
    return;
  }

  // 4. Grand Final completed -> Crown Champion & Finalize Championship
  if (
    finalMatches.length === 1 &&
    (finalMatches[0].status === 'FINALIZADO' || finalMatches[0].status === 'WO') &&
    finalMatches[0].winnerRegId
  ) {
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE championships
       SET status = 'FINALIZADO', champion_registration_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(finalMatches[0].winnerRegId, nowIso, championshipId);

    appendAuditLog(db, {
      championshipId,
      actorUid,
      actorRole,
      actionType: 'CHAMPIONSHIP_FINALIZED',
      entityType: 'championship',
      entityId: String(championshipId),
      payload: { championRegistrationId: finalMatches[0].winnerRegId },
    });
  }
}

export function recordOfficialMatchResult(
  matchId: number,
  actorUid: string,
  actorRole: 'ADMIN' | 'SYSTEM',
  params: {
    scoreA: number;
    scoreB: number;
    killsA: number;
    killsB: number;
    woClanRegId?: number | null;
  }
): MatchRecord {
  return withChampionshipTransaction((db) => {
    const match = db
      .prepare('SELECT * FROM championship_matches WHERE id = ?')
      .get(matchId) as Record<string, unknown> | undefined;
    if (!match) {
      throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
    }

    const champId = Number(match.championship_id);
    const clanARegId = Number(match.clan_a_reg_id);
    const clanBRegId = Number(match.clan_b_reg_id);
    const phase = String(match.phase) as MatchPhase;

    const scoreA = Math.max(0, Math.min(99, Math.floor(Number(params.scoreA) || 0)));
    const scoreB = Math.max(0, Math.min(99, Math.floor(Number(params.scoreB) || 0)));
    const killsA = Math.max(0, Math.min(999, Math.floor(Number(params.killsA) || 0)));
    const killsB = Math.max(0, Math.min(999, Math.floor(Number(params.killsB) || 0)));

    let status: MatchStatus = 'FINALIZADO';
    let winnerRegId: number | null = null;
    let woClanRegId: number | null = null;

    if (params.woClanRegId === clanARegId || params.woClanRegId === clanBRegId) {
      status = 'WO';
      woClanRegId = params.woClanRegId;
      winnerRegId = woClanRegId === clanARegId ? clanBRegId : clanARegId;
    } else if (scoreA > scoreB) {
      winnerRegId = clanARegId;
    } else if (scoreB > scoreA) {
      winnerRegId = clanBRegId;
    } else if (phase !== 'ROUND_ROBIN') {
      throw new ChampionshipError(
        400,
        'PLAYOFF_NO_DRAW',
        'Partidas de Playoffs (mata-mata) não podem terminar empatadas.'
      );
    }

    db.prepare(
      `UPDATE championship_matches
       SET status = ?, score_a = ?, score_b = ?, kills_a = ?, kills_b = ?,
           winner_reg_id = ?, wo_clan_reg_id = ?
       WHERE id = ?`
    ).run(
      status,
      status === 'WO' ? (winnerRegId === clanARegId ? 8 : 0) : scoreA,
      status === 'WO' ? (winnerRegId === clanBRegId ? 8 : 0) : scoreB,
      killsA,
      killsB,
      winnerRegId,
      woClanRegId,
      matchId
    );

    if (phase === 'ROUND_ROBIN') {
      recalculateAndPersistStandings(db, champId);
    }

    appendAuditLog(db, {
      championshipId: champId,
      actorUid,
      actorRole,
      actionType: status === 'WO' ? 'WO_RECORDED' : 'SCORE_RECORDED',
      entityType: 'match',
      entityId: String(matchId),
      payload: { scoreA, scoreB, killsA, killsB, winnerRegId, woClanRegId },
    });

    maybeAdvancePlayoffsOrFinalize(db, champId, actorUid, actorRole);

    const updated = getMatchesForChampionship(champId, undefined, db).find(
      (m) => m.id === matchId
    );
    if (!updated) {
      throw new ChampionshipError(500, 'MATCH_READ_ERROR', 'Erro ao ler partida atualizada.');
    }
    return updated;
  });
}

/**
 * Organizer Admin Actions (audited):
 * - Create or update championship settings (fee, prize pool, dates, max clans, rules)
 * - Manual payment confirmation (e.g., Pix/testing outside Stripe)
 * - Open match room immediately
 */
export function upsertChampionshipByAdmin(
  adminUser: VerifiedAuthUser,
  payload: {
    championshipId?: number;
    createNew?: boolean;
    title: string;
    seasonLabel: string;
    entryFeeCents: number;
    prizePoolCents: number;
    maxClans: number;
    playoffSize: 4 | 8;
    registrationOpensAt: string;
    rosterLockAt: string;
    startsAt: string;
    rulesSummary: string;
    status?: ChampionshipStatus;
  }
): ChampionshipRecord {
  const title = String(payload.title || '').trim().slice(0, 120);
  const seasonLabel = String(payload.seasonLabel || 'Temporada 1').trim().slice(0, 48);
  const entryFeeCents = Math.max(0, Math.min(5000000, Math.round(Number(payload.entryFeeCents) || 0)));
  const prizePoolCents = Math.max(0, Math.min(50000000, Math.round(Number(payload.prizePoolCents) || 0)));
  const maxClans = Math.max(2, Math.min(64, Math.floor(Number(payload.maxClans) || 16)));
  const playoffSize: 4 | 8 = Number(payload.playoffSize) === 8 ? 8 : 4;

  if (title.length < 3) {
    throw new ChampionshipError(400, 'INVALID_TITLE', 'Título do campeonato deve ter ao menos 3 caracteres.');
  }

  return withChampionshipTransaction((db) => {
    const nowIso = new Date().toISOString();
    if (payload.createNew || !payload.championshipId) {
      const slug = `kinetic-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const status: ChampionshipStatus = payload.status || 'ANUNCIADO';
      const res = db
        .prepare(
          `INSERT INTO championships (
            slug, title, season_label, status,
            entry_fee_cents, prize_pool_cents, max_clans, playoff_size,
            registration_opens_at, roster_lock_at, starts_at,
            rules_summary, created_by_uid, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          slug,
          title,
          seasonLabel,
          status,
          entryFeeCents,
          prizePoolCents,
          maxClans,
          playoffSize,
          payload.registrationOpensAt,
          payload.rosterLockAt,
          payload.startsAt,
          String(payload.rulesSummary || '').slice(0, 2000),
          adminUser.uid,
          nowIso,
          nowIso
        );
      const newId = Number(res.lastInsertRowid);
      appendAuditLog(db, {
        championshipId: newId,
        actorUid: adminUser.uid,
        actorRole: 'ADMIN',
        actionType: 'ADMIN_CREATE_CHAMPIONSHIP',
        entityType: 'championship',
        entityId: String(newId),
        payload: { title, entryFeeCents, prizePoolCents, maxClans, status },
      });
      return getChampionshipById(newId, db);
    }

    const existing = getChampionshipById(payload.championshipId, db);
    const nextStatus = payload.status || existing.status;

    db.prepare(
      `UPDATE championships
       SET title = ?, season_label = ?, status = ?,
           entry_fee_cents = ?, prize_pool_cents = ?, max_clans = ?, playoff_size = ?,
           registration_opens_at = ?, roster_lock_at = ?, starts_at = ?,
           rules_summary = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      title,
      seasonLabel,
      nextStatus,
      entryFeeCents,
      prizePoolCents,
      maxClans,
      playoffSize,
      payload.registrationOpensAt,
      payload.rosterLockAt,
      payload.startsAt,
      String(payload.rulesSummary || '').slice(0, 2000),
      nowIso,
      existing.id
    );

    appendAuditLog(db, {
      championshipId: existing.id,
      actorUid: adminUser.uid,
      actorRole: 'ADMIN',
      actionType: 'ADMIN_UPDATE_CHAMPIONSHIP',
      entityType: 'championship',
      entityId: String(existing.id),
      payload: { title, entryFeeCents, prizePoolCents, maxClans, status: nextStatus },
    });

    return getChampionshipById(existing.id, db);
  });
}

export function adminConfirmRegistrationPayment(
  championshipId: number,
  registrationId: number,
  adminUser: VerifiedAuthUser
): RegistrationRecord {
  return withChampionshipTransaction((db) => {
    const champ = getChampionshipById(championshipId, db);
    const reg = db
      .prepare(
        'SELECT * FROM championship_registrations WHERE id = ? AND championship_id = ?'
      )
      .get(registrationId, championshipId) as Record<string, unknown> | undefined;

    if (!reg) {
      throw new ChampionshipError(404, 'REGISTRATION_NOT_FOUND', 'Inscrição não encontrada.');
    }

    const nowIso = new Date().toISOString();
    const manualEventId = `admin_confirm_${registrationId}_${Date.now()}`;

    db.prepare(
      `INSERT INTO championship_payments (
        championship_id, registration_id, provider, stripe_session_id,
        external_event_id, amount_cents, currency, status, paid_at, created_at
      ) VALUES (?, ?, 'ADMIN_MANUAL', NULL, ?, ?, 'BRL', 'PAID', ?, ?)`
    ).run(championshipId, registrationId, manualEventId, champ.entryFeeCents, nowIso, nowIso);

    db.prepare(
      `UPDATE championship_registrations
       SET status = 'CONFIRMADO', confirmed_at = ?
       WHERE id = ?`
    ).run(nowIso, registrationId);

    recalculateAndPersistStandings(db, championshipId);

    appendAuditLog(db, {
      championshipId,
      actorUid: adminUser.uid,
      actorRole: 'ADMIN',
      actionType: 'ADMIN_MANUAL_PAYMENT_CONFIRM',
      entityType: 'registration',
      entityId: String(registrationId),
      payload: { clanName: String(reg.clan_name), amountCents: champ.entryFeeCents },
    });

    const updated = getRegistrationsForChampionship(championshipId, db).find(
      (r) => r.id === registrationId
    );
    if (!updated) {
      throw new ChampionshipError(500, 'REG_READ_ERROR', 'Erro ao ler inscrição.');
    }
    return updated;
  });
}

export function adminOpenMatchRoomNow(
  matchId: number,
  adminUser: VerifiedAuthUser
): MatchRecord {
  return withChampionshipTransaction((db) => {
    const match = db
      .prepare('SELECT * FROM championship_matches WHERE id = ?')
      .get(matchId) as Record<string, unknown> | undefined;
    if (!match) {
      throw new ChampionshipError(404, 'MATCH_NOT_FOUND', 'Partida não encontrada.');
    }

    const nowMs = Date.now();
    const startsAtIso = new Date(nowMs + 10 * 60 * 1000).toISOString();
    const woDeadlineIso = new Date(nowMs + 15 * 60 * 1000).toISOString();

    db.prepare(
      `UPDATE championship_matches
       SET status = 'SALA_ABERTA', room_opens_at = ?, starts_at = ?, wo_deadline_at = ?
       WHERE id = ?`
    ).run(new Date(nowMs).toISOString(), startsAtIso, woDeadlineIso, matchId);

    appendAuditLog(db, {
      championshipId: Number(match.championship_id),
      actorUid: adminUser.uid,
      actorRole: 'ADMIN',
      actionType: 'ADMIN_OPEN_MATCH_ROOM',
      entityType: 'match',
      entityId: String(matchId),
      payload: { startsAtIso, woDeadlineIso },
    });

    const updated = getMatchesForChampionship(Number(match.championship_id), undefined, db).find(
      (m) => m.id === matchId
    );
    if (!updated) {
      throw new ChampionshipError(500, 'MATCH_READ_ERROR', 'Erro ao ler partida.');
    }
    return updated;
  });
}

export function getPlayerRosterLockStatus(uid: string): {
  locked: boolean;
  championshipTitle?: string;
  clanName?: string;
} {
  if (!uid) return { locked: false };
  const db = getChampionshipDb();
  const row = db
    .prepare(
      `SELECT c.title, reg.clan_name
       FROM championship_rosters r
       JOIN championship_registrations reg ON reg.id = r.registration_id
       JOIN championships c ON c.id = r.championship_id
       WHERE r.player_uid = ?
         AND reg.roster_locked = 1
         AND c.status IN ('ROSTER_LOCK', 'EM_ANDAMENTO')
       LIMIT 1`
    )
    .get(uid) as { title?: string; clan_name?: string } | undefined;

  if (!row) return { locked: false };
  return {
    locked: true,
    championshipTitle: String(row.title || 'Campeonato KINETIC'),
    clanName: String(row.clan_name || ''),
  };
}

export interface SchedulerTickSummary {
  openedChampionshipIds: number[];
  lockedChampionshipIds: number[];
  openedMatchIds: number[];
  woAppliedMatchIds: number[];
}

/**
 * Authoritative Background Lifecycle Worker (runs every 15s on server):
 * 1. Opens registrations automatically at `registration_opens_at` (Day 1 at 00:00).
 * 2. Locks rosters & generates Round-Robin matches at `roster_lock_at`.
 * 3. Opens private match lobbies at `room_opens_at` (-30 min before start).
 * 4. Applies automatic W.O. at `wo_deadline_at` (+5 min tolerance) when < 5 starters are ready.
 */
export function runChampionshipSchedulerTick(): SchedulerTickSummary {
  const summary: SchedulerTickSummary = {
    openedChampionshipIds: [],
    lockedChampionshipIds: [],
    openedMatchIds: [],
    woAppliedMatchIds: [],
  };

  const db = getChampionshipDb();
  const nowIso = new Date().toISOString();

  // 1. ANUNCIADO -> INSCRICOES_ABERTAS
  const toOpen = db
    .prepare(
      `SELECT id FROM championships
       WHERE status = 'ANUNCIADO' AND registration_opens_at <= ?`
    )
    .all(nowIso) as Array<{ id: number }>;

  for (const row of toOpen) {
    withChampionshipTransaction((txDb) => {
      txDb
        .prepare("UPDATE championships SET status = 'INSCRICOES_ABERTAS', updated_at = ? WHERE id = ? AND status = 'ANUNCIADO'")
        .run(nowIso, Number(row.id));
      appendAuditLog(txDb, {
        championshipId: Number(row.id),
        actorUid: 'system_scheduler',
        actorRole: 'SYSTEM',
        actionType: 'AUTO_OPEN_REGISTRATIONS',
        entityType: 'championship',
        entityId: String(row.id),
      });
    });
    summary.openedChampionshipIds.push(Number(row.id));
  }

  // 2. INSCRICOES_ABERTAS -> ROSTER_LOCK + Round-Robin
  const toLock = db
    .prepare(
      `SELECT id FROM championships
       WHERE status = 'INSCRICOES_ABERTAS' AND roster_lock_at <= ?`
    )
    .all(nowIso) as Array<{ id: number }>;

  for (const row of toLock) {
    const confirmedCnt = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM championship_registrations
         WHERE championship_id = ? AND status = 'CONFIRMADO'`
      )
      .get(Number(row.id)) as { cnt: number };
    if (Number(confirmedCnt.cnt) >= 2) {
      try {
        executeRosterLockAndGenerateMatches(Number(row.id), 'system_scheduler', 'SYSTEM');
        summary.lockedChampionshipIds.push(Number(row.id));
      } catch {
        // ignore if already transitioned concurrently
      }
    }
  }

  // 3. AGENDADO -> SALA_ABERTA at `room_opens_at`
  const matchesToOpen = db
    .prepare(
      `SELECT id, championship_id FROM championship_matches
       WHERE status = 'AGENDADO' AND room_opens_at <= ?`
    )
    .all(nowIso) as Array<{ id: number; championship_id: number }>;

  for (const m of matchesToOpen) {
    withChampionshipTransaction((txDb) => {
      txDb
        .prepare("UPDATE championship_matches SET status = 'SALA_ABERTA' WHERE id = ? AND status = 'AGENDADO'")
        .run(Number(m.id));
      appendAuditLog(txDb, {
        championshipId: Number(m.championship_id),
        actorUid: 'system_scheduler',
        actorRole: 'SYSTEM',
        actionType: 'AUTO_ROOM_OPENED',
        entityType: 'match',
        entityId: String(m.id),
      });
    });
    summary.openedMatchIds.push(Number(m.id));
  }

  // 4. SALA_ABERTA -> AUTO W.O. after `wo_deadline_at` (+5 min tolerance)
  const overdueMatches = db
    .prepare(
      `SELECT id, championship_id, clan_a_reg_id, clan_b_reg_id
       FROM championship_matches
       WHERE status = 'SALA_ABERTA' AND wo_deadline_at <= ?`
    )
    .all(nowIso) as Array<{
    id: number;
    championship_id: number;
    clan_a_reg_id: number;
    clan_b_reg_id: number;
  }>;

  for (const m of overdueMatches) {
    const matchId = Number(m.id);
    const snap = getMatchLobbySnapshot(matchId, [], db);
    const aReady = snap.clanAReadyCount >= 5;
    const bReady = snap.clanBReadyCount >= 5;

    if (aReady && bReady) {
      // Both ready -> force launch AO_VIVO
      const roomCode = `CP${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      withChampionshipTransaction((txDb) => {
        txDb
          .prepare("UPDATE championship_matches SET status = 'AO_VIVO', private_room_code = ? WHERE id = ?")
          .run(roomCode, matchId);
      });
      continue;
    }

    withChampionshipTransaction((txDb) => {
      const clanARegId = Number(m.clan_a_reg_id);
      const clanBRegId = Number(m.clan_b_reg_id);

      let winnerRegId: number | null = null;
      let woClanRegId: number | null = null;
      let scoreA = 0;
      let scoreB = 0;

      if (aReady && !bReady) {
        winnerRegId = clanARegId;
        woClanRegId = clanBRegId;
        scoreA = 8;
        scoreB = 0;
      } else if (!aReady && bReady) {
        winnerRegId = clanBRegId;
        woClanRegId = clanARegId;
        scoreA = 0;
        scoreB = 8;
      } else {
        // Double W.O. (neither clan brought 5 ready starters)
        winnerRegId = null;
        woClanRegId = null;
        scoreA = 0;
        scoreB = 0;
      }

      txDb
        .prepare(
          `UPDATE championship_matches
           SET status = 'WO', score_a = ?, score_b = ?, winner_reg_id = ?, wo_clan_reg_id = ?
           WHERE id = ? AND status = 'SALA_ABERTA'`
        )
        .run(scoreA, scoreB, winnerRegId, woClanRegId, matchId);

      recalculateAndPersistStandings(txDb, Number(m.championship_id));

      appendAuditLog(txDb, {
        championshipId: Number(m.championship_id),
        actorUid: 'system_scheduler',
        actorRole: 'SYSTEM',
        actionType: 'AUTO_WO_APPLIED',
        entityType: 'match',
        entityId: String(matchId),
        payload: {
          clanAReadyCount: snap.clanAReadyCount,
          clanBReadyCount: snap.clanBReadyCount,
          winnerRegId,
          woClanRegId,
        },
      });

      maybeAdvancePlayoffsOrFinalize(txDb, Number(m.championship_id), 'system_scheduler', 'SYSTEM');
    });
    summary.woAppliedMatchIds.push(matchId);
  }

  return summary;
}
