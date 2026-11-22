export type ChampionshipStatus =
  | 'ANUNCIADO'
  | 'INSCRICOES_ABERTAS'
  | 'ROSTER_LOCK'
  | 'EM_ANDAMENTO'
  | 'FINALIZADO';

export type RegistrationStatus =
  | 'PENDENTE_PAGAMENTO'
  | 'CONFIRMADO'
  | 'CANCELADO'
  | 'DESCLASSIFICADO';

export type RosterSlotRole = 'TITULAR' | 'RESERVA';

export type MatchPhase = 'ROUND_ROBIN' | 'QUARTERFINAL' | 'SEMIFINAL' | 'FINAL';

export type MatchStatus =
  | 'AGENDADO'
  | 'SALA_ABERTA'
  | 'AO_VIVO'
  | 'FINALIZADO'
  | 'WO';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface ChampionshipRecord {
  id: number;
  slug: string;
  title: string;
  seasonLabel: string;
  status: ChampionshipStatus;
  entryFeeCents: number;
  prizePoolCents: number;
  maxClans: number;
  playoffSize: 4 | 8;
  registrationOpensAt: string;
  rosterLockAt: string;
  startsAt: string;
  rulesSummary: string;
  championRegistrationId: number | null;
  championClanName: string | null;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface RosterMemberRecord {
  id: number;
  championshipId: number;
  registrationId: number;
  playerUid: string;
  playerCallsign: string;
  avatarDataUrl: string;
  slotRole: RosterSlotRole;
  lockedAt: string | null;
}

export interface RegistrationRecord {
  id: number;
  championshipId: number;
  clanId: string;
  clanName: string;
  clanTag: string;
  clanEmblemId: string;
  leaderUid: string;
  leaderCallsign: string;
  status: RegistrationStatus;
  rosterLocked: boolean;
  confirmedAt: string | null;
  createdAt: string;
  roster: RosterMemberRecord[];
}

export interface MatchLineupPlayer {
  id: number;
  matchId: number;
  registrationId: number;
  playerUid: string;
  playerCallsign: string;
  slotRole: RosterSlotRole;
  isActiveStarter: boolean;
  isReady: boolean;
  readyAt: string | null;
  substitutedByUid: string | null;
}

export interface MatchRecord {
  id: number;
  championshipId: number;
  phase: MatchPhase;
  roundNumber: number;
  bracketSlot: string | null;
  clanARegId: number;
  clanBRegId: number;
  clanAName: string;
  clanATag: string;
  clanAEmblemId: string;
  clanBName: string;
  clanBTag: string;
  clanBEmblemId: string;
  arenaMode: string;
  roomOpensAt: string;
  startsAt: string;
  woDeadlineAt: string;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  killsA: number;
  killsB: number;
  winnerRegId: number | null;
  woClanRegId: number | null;
  privateRoomCode: string | null;
}

export interface StandingRecord {
  registrationId: number;
  clanId: string;
  clanName: string;
  clanTag: string;
  clanEmblemId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  woLosses: number;
  points: number;
  roundsFor: number;
  roundsAgainst: number;
  roundDiff: number;
  totalKills: number;
  totalDeaths: number;
  killDiff: number;
  rankPosition: number;
  inPlayoffZone: boolean;
}

export interface PaymentRecord {
  id: number;
  championshipId: number;
  registrationId: number;
  provider: 'STRIPE' | 'ADMIN_MANUAL';
  stripeSessionId: string | null;
  externalEventId: string | null;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  paidAt: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  championshipId: number | null;
  actorUid: string;
  actorRole: 'SYSTEM' | 'ADMIN' | 'LIDER' | 'JOGADOR' | 'WEBHOOK';
  actionType: string;
  entityType: string;
  entityId: string;
  payloadJson: string;
  createdAt: string;
}

export interface SignedMatchLobbyTokenPayload {
  matchId: number;
  championshipId: number;
  uid: string;
  callsign: string;
  clanId: string;
  registrationId: number;
  slotRole: RosterSlotRole;
  isLeader: boolean;
  nonce: string;
  iat: number;
  exp: number;
}

export interface ChampionshipLobbySnapshot {
  match: MatchRecord;
  serverNowMs: number;
  substitutionCutoffMs: number;
  canSubstituteNow: boolean;
  clanALineup: MatchLineupPlayer[];
  clanBLineup: MatchLineupPlayer[];
  clanAReadyCount: number;
  clanBReadyCount: number;
  connectedUids: string[];
}
