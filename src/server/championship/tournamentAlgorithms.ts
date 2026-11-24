import { MatchPhase, StandingRecord } from './types';

export const CHAMPIONSHIP_MAP_POOL = [
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
] as const;

export interface RoundRobinClanSeed {
  registrationId: number;
  clanName: string;
}

export interface GeneratedFixture {
  phase: MatchPhase;
  roundNumber: number;
  bracketSlot: string | null;
  clanARegId: number;
  clanBRegId: number;
  arenaMode: string;
  roomOpensAt: string;
  startsAt: string;
  woDeadlineAt: string;
}

/**
 * Generates a complete Round-Robin schedule using the Circle Method (Berger Tables).
 * - Every confirmed clan plays every other confirmed clan exactly once.
 * - Handles odd numbers of clans cleanly by inserting a BYE slot.
 * - Alternates Vanguard/Blackthorn sides across rounds for fairness.
 * - Schedules room opening 30 min prior to start and W.O. deadline 5 min after start.
 */
export function generateRoundRobinSchedule(
  clans: RoundRobinClanSeed[],
  firstMatchStartsAtIso: string,
  options?: {
    roomOpenLeadMinutes?: number;
    woToleranceMinutes?: number;
    roundSpacingMinutes?: number;
    matchSlotOffsetMinutes?: number;
  }
): GeneratedFixture[] {
  if (clans.length < 2) return [];

  const roomOpenLeadMs = (options?.roomOpenLeadMinutes ?? 30) * 60 * 1000;
  const woToleranceMs = (options?.woToleranceMinutes ?? 5) * 60 * 1000;
  const roundSpacingMs = (options?.roundSpacingMinutes ?? 90) * 60 * 1000;
  const matchSlotOffsetMs = (options?.matchSlotOffsetMinutes ?? 0) * 60 * 1000;

  const baseStartMs = Date.parse(firstMatchStartsAtIso) || Date.now() + 35 * 60 * 1000;
  const ring: Array<RoundRobinClanSeed | null> = [...clans];
  if (ring.length % 2 !== 0) {
    ring.push(null); // BYE
  }

  const n = ring.length;
  const totalRounds = n - 1;
  const half = n / 2;
  const fixtures: GeneratedFixture[] = [];

  for (let roundIdx = 0; roundIdx < totalRounds; roundIdx++) {
    const roundNumber = roundIdx + 1;
    const arenaMode = CHAMPIONSHIP_MAP_POOL[roundIdx % CHAMPIONSHIP_MAP_POOL.length];
    const roundStartBaseMs = baseStartMs + roundIdx * roundSpacingMs;

    let slotInRound = 0;
    for (let i = 0; i < half; i++) {
      const home = ring[i];
      const away = ring[n - 1 - i];
      if (!home || !away) continue; // BYE round

      // Alternate home/away sides on even rounds so no clan plays only one side
      const clanA = roundIdx % 2 === 0 ? home : away;
      const clanB = roundIdx % 2 === 0 ? away : home;

      const matchStartMs = roundStartBaseMs + slotInRound * matchSlotOffsetMs;
      const roomOpenMs = matchStartMs - roomOpenLeadMs;
      const woDeadlineMs = matchStartMs + woToleranceMs;

      fixtures.push({
        phase: 'ROUND_ROBIN',
        roundNumber,
        bracketSlot: `R${roundNumber}-M${slotInRound + 1}`,
        clanARegId: clanA.registrationId,
        clanBRegId: clanB.registrationId,
        arenaMode,
        roomOpensAt: new Date(roomOpenMs).toISOString(),
        startsAt: new Date(matchStartMs).toISOString(),
        woDeadlineAt: new Date(woDeadlineMs).toISOString(),
      });
      slotInRound++;
    }

    // Rotate all elements except index 0 (classic Berger / Circle Method rotation)
    const last = ring.pop()!;
    ring.splice(1, 0, last);
  }

  return fixtures;
}

export interface StandingClanMeta {
  registrationId: number;
  clanId: string;
  clanName: string;
  clanTag: string;
  clanEmblemId: string;
}

export interface CompletedRoundRobinMatch {
  clanARegId: number;
  clanBRegId: number;
  status: 'FINALIZADO' | 'WO';
  scoreA: number;
  scoreB: number;
  killsA: number;
  killsB: number;
  winnerRegId: number | null;
  woClanRegId: number | null;
}

/**
 * Computes official Round-Robin Standings following KINETIC's exact scoring and
 * 4-level tie-breaker rules:
 * - Points: Win = +3, Draw = +1, Loss = 0, W.O. = -1 (Opponent = +3).
 * - Tie-breakers:
 *   1. Points (DESC)
 *   2. Round Differential (DESC), then Kill Differential (DESC)
 *   3. Head-to-Head (mini-league points & round diff among tied clans)
 *   4. Total Kills (DESC)
 */
export function computeStandingsWithTieBreakers(
  clans: StandingClanMeta[],
  completedMatches: CompletedRoundRobinMatch[],
  playoffSize: 4 | 8
): StandingRecord[] {
  const map = new Map<number, StandingRecord>();
  for (const clan of clans) {
    map.set(clan.registrationId, {
      registrationId: clan.registrationId,
      clanId: clan.clanId,
      clanName: clan.clanName,
      clanTag: clan.clanTag,
      clanEmblemId: clan.clanEmblemId,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      woLosses: 0,
      points: 0,
      roundsFor: 0,
      roundsAgainst: 0,
      roundDiff: 0,
      totalKills: 0,
      totalDeaths: 0,
      killDiff: 0,
      rankPosition: 1,
      inPlayoffZone: false,
    });
  }

  for (const m of completedMatches) {
    const a = map.get(m.clanARegId);
    const b = map.get(m.clanBRegId);
    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;
    a.roundsFor += m.scoreA;
    a.roundsAgainst += m.scoreB;
    b.roundsFor += m.scoreB;
    b.roundsAgainst += m.scoreA;
    a.totalKills += m.killsA;
    a.totalDeaths += m.killsB;
    b.totalKills += m.killsB;
    b.totalDeaths += m.killsA;

    if (m.status === 'WO') {
      if (m.woClanRegId === m.clanARegId) {
        a.woLosses += 1;
        a.losses += 1;
        a.points -= 1;
        b.wins += 1;
        b.points += 3;
      } else if (m.woClanRegId === m.clanBRegId) {
        b.woLosses += 1;
        b.losses += 1;
        b.points -= 1;
        a.wins += 1;
        a.points += 3;
      } else {
        // Double W.O.: both clans absent (-1 pt each)
        a.woLosses += 1;
        a.losses += 1;
        a.points -= 1;
        b.woLosses += 1;
        b.losses += 1;
        b.points -= 1;
      }
    } else if (m.scoreA > m.scoreB || m.winnerRegId === m.clanARegId) {
      a.wins += 1;
      a.points += 3;
      b.losses += 1;
    } else if (m.scoreB > m.scoreA || m.winnerRegId === m.clanBRegId) {
      b.wins += 1;
      b.points += 3;
      a.losses += 1;
    } else {
      a.draws += 1;
      b.draws += 1;
      a.points += 1;
      b.points += 1;
    }
  }

  const list = Array.from(map.values()).map((row) => ({
    ...row,
    roundDiff: row.roundsFor - row.roundsAgainst,
    killDiff: row.totalKills - row.totalDeaths,
  }));

  // Precompute pairwise Head-to-Head lookup for tie-breaker #3
  const computeHeadToHeadScore = (regA: number, regB: number): number => {
    let ptsA = 0;
    let ptsB = 0;
    let diffA = 0;
    for (const m of completedMatches) {
      const isDirect =
        (m.clanARegId === regA && m.clanBRegId === regB) ||
        (m.clanARegId === regB && m.clanBRegId === regA);
      if (!isDirect) continue;
      const aIsClanA = m.clanARegId === regA;
      const sA = aIsClanA ? m.scoreA : m.scoreB;
      const sB = aIsClanA ? m.scoreB : m.scoreA;
      diffA += sA - sB;
      if (m.winnerRegId === regA || sA > sB) ptsA += 3;
      else if (m.winnerRegId === regB || sB > sA) ptsB += 3;
      else {
        ptsA += 1;
        ptsB += 1;
      }
    }
    if (ptsA !== ptsB) return ptsB - ptsA;
    return -diffA;
  };

  list.sort((a, b) => {
    // 1º Pontos
    if (b.points !== a.points) return b.points - a.points;
    // 2º Saldo de Rounds (e em seguida Saldo de Kills)
    if (b.roundDiff !== a.roundDiff) return b.roundDiff - a.roundDiff;
    if (b.killDiff !== a.killDiff) return b.killDiff - a.killDiff;
    // 3º Confronto Direto
    const h2h = computeHeadToHeadScore(a.registrationId, b.registrationId);
    if (h2h !== 0) return h2h;
    // 4º Total de Abates
    if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills;
    // Desempate determinístico final por nome do clã
    return a.clanName.localeCompare(b.clanName);
  });

  const effectiveCut = Math.min(playoffSize, list.length >= 4 ? playoffSize : Math.min(2, list.length));
  return list.map((row, idx) => ({
    ...row,
    rankPosition: idx + 1,
    inPlayoffZone: idx < effectiveCut,
  }));
}

/**
 * Generates initial Playoff knockout fixtures (Top 4 Semifinals or Top 8 Quarterfinals)
 * seeded strictly from official Round-Robin standings.
 */
export function generatePlayoffStageFixtures(
  standings: StandingRecord[],
  playoffSize: 4 | 8,
  startIso: string
): GeneratedFixture[] {
  const baseStartMs = Date.parse(startIso) || Date.now() + 60 * 60 * 1000;
  const roomLeadMs = 30 * 60 * 1000;
  const woToleranceMs = 5 * 60 * 1000;

  const makeFixture = (
    phase: MatchPhase,
    roundNumber: number,
    slot: string,
    seedA: StandingRecord,
    seedB: StandingRecord,
    offsetIndex: number
  ): GeneratedFixture => {
    const startMs = baseStartMs + offsetIndex * 15 * 60 * 1000;
    return {
      phase,
      roundNumber,
      bracketSlot: slot,
      clanARegId: seedA.registrationId,
      clanBRegId: seedB.registrationId,
      arenaMode: CHAMPIONSHIP_MAP_POOL[offsetIndex % CHAMPIONSHIP_MAP_POOL.length],
      roomOpensAt: new Date(startMs - roomLeadMs).toISOString(),
      startsAt: new Date(startMs).toISOString(),
      woDeadlineAt: new Date(startMs + woToleranceMs).toISOString(),
    };
  };

  if (playoffSize === 8 && standings.length >= 8) {
    // Classic seeded Quarterfinals: 1v8, 4v5, 2v7, 3v6
    return [
      makeFixture('QUARTERFINAL', 1, 'QF1', standings[0], standings[7], 0),
      makeFixture('QUARTERFINAL', 1, 'QF2', standings[3], standings[4], 1),
      makeFixture('QUARTERFINAL', 1, 'QF3', standings[1], standings[6], 2),
      makeFixture('QUARTERFINAL', 1, 'QF4', standings[2], standings[5], 3),
    ];
  }

  if (standings.length >= 4) {
    // Top 4 Semifinals: 1v4, 2v3
    return [
      makeFixture('SEMIFINAL', 1, 'SF1', standings[0], standings[3], 0),
      makeFixture('SEMIFINAL', 1, 'SF2', standings[1], standings[2], 1),
    ];
  }

  if (standings.length >= 2) {
    // Direct Grand Final when 2–3 clans participated
    return [makeFixture('FINAL', 1, 'GF', standings[0], standings[1], 0)];
  }

  return [];
}
