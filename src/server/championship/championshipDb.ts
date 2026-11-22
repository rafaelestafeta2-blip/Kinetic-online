import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.join(process.cwd(), '.kinetic-data');
const DB_PATH = path.join(DATA_DIR, 'championships.db');

let dbInstance: DatabaseSync | null = null;

function computeDefaultSeasonDates(): {
  registrationOpensAt: string;
  rosterLockAt: string;
  startsAt: string;
  seasonLabel: string;
  slug: string;
} {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  // Inscrições abrem no dia 1 do mês atual às 00:00 UTC (já abertas para uso imediato)
  const regOpen = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  // Roster Lock padrão: 7 dias à frente às 23:59 UTC para o Admin ajustar ou testar quando quiser
  const rosterLock = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startsAt = new Date(rosterLock.getTime() + 2 * 60 * 60 * 1000);
  const monthStr = String(month + 1).padStart(2, '0');
  return {
    registrationOpensAt: regOpen.toISOString(),
    rosterLockAt: rosterLock.toISOString(),
    startsAt: startsAt.toISOString(),
    seasonLabel: `Temporada 1 · ${monthStr}/${year}`,
    slug: `kinetic-copa-clas-${year}-${monthStr}`,
  };
}

function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS championships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      season_label TEXT NOT NULL DEFAULT 'Temporada 1',
      status TEXT NOT NULL DEFAULT 'ANUNCIADO'
        CHECK (status IN ('ANUNCIADO', 'INSCRICOES_ABERTAS', 'ROSTER_LOCK', 'EM_ANDAMENTO', 'FINALIZADO')),
      entry_fee_cents INTEGER NOT NULL CHECK (entry_fee_cents >= 0),
      prize_pool_cents INTEGER NOT NULL CHECK (prize_pool_cents >= 0),
      max_clans INTEGER NOT NULL DEFAULT 16 CHECK (max_clans BETWEEN 2 AND 64),
      playoff_size INTEGER NOT NULL DEFAULT 4 CHECK (playoff_size IN (4, 8)),
      registration_opens_at TEXT NOT NULL,
      roster_lock_at TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      rules_summary TEXT NOT NULL DEFAULT '',
      champion_registration_id INTEGER NULL,
      created_by_uid TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_championships_status
      ON championships (status, registration_opens_at, roster_lock_at);

    CREATE TABLE IF NOT EXISTS championship_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      clan_id TEXT NOT NULL,
      clan_name TEXT NOT NULL,
      clan_tag TEXT NOT NULL,
      clan_emblem_id TEXT NOT NULL DEFAULT 'alpha_wolf',
      leader_uid TEXT NOT NULL,
      leader_callsign TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDENTE_PAGAMENTO'
        CHECK (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO', 'CANCELADO', 'DESCLASSIFICADO')),
      roster_locked INTEGER NOT NULL DEFAULT 0,
      confirmed_at TEXT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (championship_id, clan_id)
    );

    CREATE INDEX IF NOT EXISTS idx_champ_reg_lookup
      ON championship_registrations (championship_id, status);

    CREATE TABLE IF NOT EXISTS championship_rosters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
      player_uid TEXT NOT NULL,
      player_callsign TEXT NOT NULL,
      avatar_data_url TEXT NOT NULL DEFAULT '',
      slot_role TEXT NOT NULL CHECK (slot_role IN ('TITULAR', 'RESERVA')),
      locked_at TEXT NULL,
      UNIQUE (championship_id, player_uid)
    );

    CREATE INDEX IF NOT EXISTS idx_champ_rosters_reg
      ON championship_rosters (registration_id, slot_role);

    CREATE TABLE IF NOT EXISTS championship_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'STRIPE',
      stripe_session_id TEXT UNIQUE,
      external_event_id TEXT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'BRL',
      status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
      paid_at TEXT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (provider, external_event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_champ_payments_reg
      ON championship_payments (registration_id, status);

    CREATE TABLE IF NOT EXISTS championship_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      phase TEXT NOT NULL CHECK (phase IN ('ROUND_ROBIN', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL')),
      round_number INTEGER NOT NULL CHECK (round_number >= 1),
      bracket_slot TEXT NULL,
      clan_a_reg_id INTEGER NOT NULL REFERENCES championship_registrations(id),
      clan_b_reg_id INTEGER NOT NULL REFERENCES championship_registrations(id),
      arena_mode TEXT NOT NULL DEFAULT 'DUST2_BOMB_5V5',
      room_opens_at TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      wo_deadline_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'AGENDADO'
        CHECK (status IN ('AGENDADO', 'SALA_ABERTA', 'AO_VIVO', 'FINALIZADO', 'WO')),
      score_a INTEGER NOT NULL DEFAULT 0,
      score_b INTEGER NOT NULL DEFAULT 0,
      kills_a INTEGER NOT NULL DEFAULT 0,
      kills_b INTEGER NOT NULL DEFAULT 0,
      winner_reg_id INTEGER NULL REFERENCES championship_registrations(id),
      wo_clan_reg_id INTEGER NULL REFERENCES championship_registrations(id),
      private_room_code TEXT NULL,
      CHECK (clan_a_reg_id <> clan_b_reg_id)
    );

    CREATE INDEX IF NOT EXISTS idx_champ_matches_schedule
      ON championship_matches (championship_id, phase, round_number);

    CREATE INDEX IF NOT EXISTS idx_champ_matches_worker
      ON championship_matches (status, room_opens_at, wo_deadline_at);

    CREATE TABLE IF NOT EXISTS championship_match_lineups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES championship_matches(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
      player_uid TEXT NOT NULL,
      player_callsign TEXT NOT NULL,
      slot_role TEXT NOT NULL CHECK (slot_role IN ('TITULAR', 'RESERVA')),
      is_active_starter INTEGER NOT NULL DEFAULT 0,
      is_ready INTEGER NOT NULL DEFAULT 0,
      ready_at TEXT NULL,
      substituted_by_uid TEXT NULL,
      UNIQUE (match_id, player_uid)
    );

    CREATE INDEX IF NOT EXISTS idx_champ_lineups_match
      ON championship_match_lineups (match_id, registration_id, is_active_starter);

    CREATE TABLE IF NOT EXISTS championship_standings (
      championship_id INTEGER NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
      registration_id INTEGER NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
      played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      wo_losses INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0,
      rounds_for INTEGER NOT NULL DEFAULT 0,
      rounds_against INTEGER NOT NULL DEFAULT 0,
      round_diff INTEGER NOT NULL DEFAULT 0,
      total_kills INTEGER NOT NULL DEFAULT 0,
      total_deaths INTEGER NOT NULL DEFAULT 0,
      kill_diff INTEGER NOT NULL DEFAULT 0,
      rank_position INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (championship_id, registration_id)
    );

    CREATE TABLE IF NOT EXISTS championship_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      championship_id INTEGER NULL REFERENCES championships(id) ON DELETE SET NULL,
      actor_uid TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_champ_audit_lookup
      ON championship_audit_logs (championship_id, created_at DESC);

    -- Imutabilidade rigorosa da tabela de auditoria em nível de motor SQL
    CREATE TRIGGER IF NOT EXISTS trg_champ_audit_no_update
    BEFORE UPDATE ON championship_audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'championship_audit_logs is immutable (UPDATE forbidden)');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_champ_audit_no_delete
    BEFORE DELETE ON championship_audit_logs
    BEGIN
      SELECT RAISE(ABORT, 'championship_audit_logs is immutable (DELETE forbidden)');
    END;
  `);
}

function seedDefaultChampionshipIfEmpty(db: DatabaseSync): void {
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM championships')
    .get() as { cnt: number } | undefined;

  if (row && Number(row.cnt) > 0) return;

  const nowIso = new Date().toISOString();
  const dates = computeDefaultSeasonDates();
  const defaultRules = [
    '• Formato: Fase 1 Pontos Corridos (Round-Robin, todos contra todos) + Fase 2 Playoffs (Top 4 / Top 8).',
    '• Elenco: 5 titulares obrigatórios + até 2 reservas inscritos pelo Líder do clã antes do Roster Lock.',
    '• Pontuação: Vitória +3 pts · Empate +1 pt · Derrota 0 pt · W.O. -1 pt (adversário +3 pts).',
    '• Desempate: 1º Pontos · 2º Saldo de Rounds/Kills · 3º Confronto Direto · 4º Total de Abates.',
    '• Lobby & W.O.: Sala abre 30 min antes; substituições pelo Líder até 5 min antes; tolerância de W.O. de 5 min.',
  ].join('\n');

  const insertRes = db
    .prepare(
      `INSERT INTO championships (
        slug, title, season_label, status,
        entry_fee_cents, prize_pool_cents, max_clans, playoff_size,
        registration_opens_at, roster_lock_at, starts_at,
        rules_summary, created_by_uid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      dates.slug,
      'COPA KINETIC DE CLÃS 5v5',
      dates.seasonLabel,
      'INSCRICOES_ABERTAS',
      5000, // R$ 50,00 por clã
      100000, // R$ 1.000,00 de premiação
      16,
      4,
      dates.registrationOpensAt,
      dates.rosterLockAt,
      dates.startsAt,
      defaultRules,
      'system_bootstrap',
      nowIso,
      nowIso
    );

  const champId = Number(insertRes.lastInsertRowid);
  db.prepare(
    `INSERT INTO championship_audit_logs (
      championship_id, actor_uid, actor_role, action_type, entity_type, entity_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    champId,
    'system_bootstrap',
    'SYSTEM',
    'CHAMPIONSHIP_CREATED',
    'championship',
    String(champId),
    JSON.stringify({
      entryFeeCents: 5000,
      prizePoolCents: 100000,
      maxClans: 16,
      status: 'INSCRICOES_ABERTAS',
    }),
    nowIso
  );
}

export function getChampionshipDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  initializeSchema(db);
  seedDefaultChampionshipIfEmpty(db);
  dbInstance = db;
  return dbInstance;
}

export function withChampionshipTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getChampionshipDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure if already rolled back
    }
    throw err;
  }
}

export function appendAuditLog(
  db: DatabaseSync,
  params: {
    championshipId: number | null;
    actorUid: string;
    actorRole: 'SYSTEM' | 'ADMIN' | 'LIDER' | 'JOGADOR' | 'WEBHOOK';
    actionType: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
): void {
  db.prepare(
    `INSERT INTO championship_audit_logs (
      championship_id, actor_uid, actor_role, action_type, entity_type, entity_id, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.championshipId,
    params.actorUid.slice(0, 128),
    params.actorRole,
    params.actionType.slice(0, 64),
    params.entityType.slice(0, 48),
    params.entityId.slice(0, 128),
    JSON.stringify(params.payload ?? {}),
    new Date().toISOString()
  );
}
