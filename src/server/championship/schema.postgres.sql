-- =============================================================================
-- KINETIC // Tactical FPS — Campeonato Oficial de Clãs (PostgreSQL DDL)
-- Arquitetura relacional ACID com integridade referencial, idempotência de
-- pagamentos Stripe e trilha de auditoria imutável (append-only).
-- =============================================================================

CREATE TABLE IF NOT EXISTS championships (
  id BIGSERIAL PRIMARY KEY,
  slug VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(120) NOT NULL,
  season_label VARCHAR(48) NOT NULL DEFAULT 'Temporada 1',
  status VARCHAR(32) NOT NULL DEFAULT 'ANUNCIADO'
    CHECK (status IN ('ANUNCIADO', 'INSCRICOES_ABERTAS', 'ROSTER_LOCK', 'EM_ANDAMENTO', 'FINALIZADO')),
  entry_fee_cents INTEGER NOT NULL CHECK (entry_fee_cents >= 0),
  prize_pool_cents INTEGER NOT NULL CHECK (prize_pool_cents >= 0),
  max_clans INTEGER NOT NULL DEFAULT 16 CHECK (max_clans BETWEEN 2 AND 64),
  playoff_size INTEGER NOT NULL DEFAULT 4 CHECK (playoff_size IN (4, 8)),
  registration_opens_at TIMESTAMPTZ NOT NULL,
  roster_lock_at TIMESTAMPTZ NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  rules_summary TEXT NOT NULL DEFAULT '',
  champion_registration_id BIGINT NULL,
  created_by_uid VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_championships_status_dates
  ON championships (status, registration_opens_at, roster_lock_at);

CREATE TABLE IF NOT EXISTS championship_registrations (
  id BIGSERIAL PRIMARY KEY,
  championship_id BIGINT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  clan_id VARCHAR(64) NOT NULL,
  clan_name VARCHAR(64) NOT NULL,
  clan_tag VARCHAR(8) NOT NULL,
  clan_emblem_id VARCHAR(48) NOT NULL DEFAULT 'alpha_wolf',
  leader_uid VARCHAR(128) NOT NULL,
  leader_callsign VARCHAR(48) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDENTE_PAGAMENTO'
    CHECK (status IN ('PENDENTE_PAGAMENTO', 'CONFIRMADO', 'CANCELADO', 'DESCLASSIFICADO')),
  roster_locked BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (championship_id, clan_id)
);

CREATE INDEX IF NOT EXISTS idx_champ_reg_lookup
  ON championship_registrations (championship_id, status);

CREATE TABLE IF NOT EXISTS championship_rosters (
  id BIGSERIAL PRIMARY KEY,
  championship_id BIGINT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id BIGINT NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  player_uid VARCHAR(128) NOT NULL,
  player_callsign VARCHAR(48) NOT NULL,
  avatar_data_url TEXT NOT NULL DEFAULT '',
  slot_role VARCHAR(16) NOT NULL CHECK (slot_role IN ('TITULAR', 'RESERVA')),
  locked_at TIMESTAMPTZ NULL,
  -- Impede que o mesmo jogador represente 2 clãs no mesmo torneio
  UNIQUE (championship_id, player_uid)
);

CREATE INDEX IF NOT EXISTS idx_champ_rosters_reg
  ON championship_rosters (registration_id, slot_role);

CREATE TABLE IF NOT EXISTS championship_payments (
  id BIGSERIAL PRIMARY KEY,
  championship_id BIGINT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id BIGINT NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL DEFAULT 'STRIPE',
  stripe_session_id VARCHAR(128) UNIQUE,
  external_event_id VARCHAR(128),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'BRL',
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED')),
  paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotência criptográfica contra duplicidade de webhooks
  UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_champ_payments_reg
  ON championship_payments (registration_id, status);

CREATE TABLE IF NOT EXISTS championship_matches (
  id BIGSERIAL PRIMARY KEY,
  championship_id BIGINT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  phase VARCHAR(24) NOT NULL CHECK (phase IN ('ROUND_ROBIN', 'QUARTERFINAL', 'SEMIFINAL', 'FINAL')),
  round_number INTEGER NOT NULL CHECK (round_number >= 1),
  bracket_slot VARCHAR(32) NULL,
  clan_a_reg_id BIGINT NOT NULL REFERENCES championship_registrations(id),
  clan_b_reg_id BIGINT NOT NULL REFERENCES championship_registrations(id),
  arena_mode VARCHAR(48) NOT NULL DEFAULT 'DUST2_BOMB_5V5',
  room_opens_at TIMESTAMPTZ NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  wo_deadline_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'AGENDADO'
    CHECK (status IN ('AGENDADO', 'SALA_ABERTA', 'AO_VIVO', 'FINALIZADO', 'WO')),
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  kills_a INTEGER NOT NULL DEFAULT 0,
  kills_b INTEGER NOT NULL DEFAULT 0,
  winner_reg_id BIGINT NULL REFERENCES championship_registrations(id),
  wo_clan_reg_id BIGINT NULL REFERENCES championship_registrations(id),
  private_room_code VARCHAR(16) NULL,
  CHECK (clan_a_reg_id <> clan_b_reg_id)
);

CREATE INDEX IF NOT EXISTS idx_champ_matches_schedule
  ON championship_matches (championship_id, phase, round_number);

CREATE INDEX IF NOT EXISTS idx_champ_matches_worker
  ON championship_matches (status, room_opens_at, wo_deadline_at);

CREATE TABLE IF NOT EXISTS championship_match_lineups (
  id BIGSERIAL PRIMARY KEY,
  match_id BIGINT NOT NULL REFERENCES championship_matches(id) ON DELETE CASCADE,
  registration_id BIGINT NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  player_uid VARCHAR(128) NOT NULL,
  player_callsign VARCHAR(48) NOT NULL,
  slot_role VARCHAR(16) NOT NULL CHECK (slot_role IN ('TITULAR', 'RESERVA')),
  is_active_starter BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  ready_at TIMESTAMPTZ NULL,
  substituted_by_uid VARCHAR(128) NULL,
  UNIQUE (match_id, player_uid)
);

CREATE INDEX IF NOT EXISTS idx_champ_lineups_match
  ON championship_match_lineups (match_id, registration_id, is_active_starter);

CREATE TABLE IF NOT EXISTS championship_standings (
  championship_id BIGINT NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id BIGINT NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
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
  id BIGSERIAL PRIMARY KEY,
  championship_id BIGINT NULL REFERENCES championships(id) ON DELETE SET NULL,
  actor_uid VARCHAR(128) NOT NULL,
  actor_role VARCHAR(24) NOT NULL,
  action_type VARCHAR(64) NOT NULL,
  entity_type VARCHAR(48) NOT NULL,
  entity_id VARCHAR(128) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_champ_audit_lookup
  ON championship_audit_logs (championship_id, created_at DESC);

-- Proteção de imutabilidade em nível de banco para logs de auditoria
CREATE OR REPLACE FUNCTION deny_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'championship_audit_logs is append-only and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deny_audit_update ON championship_audit_logs;
CREATE TRIGGER trg_deny_audit_update
  BEFORE UPDATE OR DELETE ON championship_audit_logs
  FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
