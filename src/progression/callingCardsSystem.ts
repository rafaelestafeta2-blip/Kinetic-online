import { PlayerCloudProfile } from '../firebase/playerProfileModel';
import { getDailyContractDefinitions } from './dailyContractsSystem';

export type CallingCardRarity =
  | 'COMUM'
  | 'TATICO'
  | 'RARO'
  | 'EPICO'
  | 'LENDARIO'
  | 'MITICO';

export type CallingCardPattern =
  | 'steel_beam'
  | 'crimson_slash'
  | 'arctic_hex'
  | 'cobalt_lightning'
  | 'ruby_vortex'
  | 'emerald_radar'
  | 'lunar_wolf'
  | 'cyber_circuit'
  | 'imperial_gold'
  | 'viper_scales'
  | 'solar_flare'
  | 'mythic_wings';

export interface CallingCardDefinition {
  id: string;
  name: string;
  rarity: CallingCardRarity;
  description: string;
  unlockLabel: string;
  pattern: CallingCardPattern;
  bgStyle: string;
  accentHex: string;
  secondaryHex: string;
  borderHex: string;
  isUnlocked: (profile: PlayerCloudProfile) => boolean;
  getProgressText?: (profile: PlayerCloudProfile) => string;
}

function countCompletedMissions(profile: PlayerCloudProfile): number {
  const dc = profile.dailyContracts;
  const achCount = Array.isArray(profile.unlockedAchievements)
    ? profile.unlockedAchievements.length
    : 0;
  if (!dc) return achCount;
  const defs = getDailyContractDefinitions(dc.dayKey || '');
  const completedToday = defs.filter(
    (def) =>
      (Array.isArray(dc.claimedIds) && dc.claimedIds.includes(def.id)) ||
      (dc[def.metric] || 0) >= def.target
  ).length;
  const claimedCount = Array.isArray(dc.claimedIds) ? dc.claimedIds.length : 0;
  return Math.max(completedToday, claimedCount) + achCount;
}

export const CALLING_CARD_CATALOG: CallingCardDefinition[] = [
  {
    id: 'obsidian_vanguard',
    name: 'Vanguarda Obsidiana',
    rarity: 'COMUM',
    description: 'Faixa tática padrão de aço escovado com feixe azul de combate.',
    unlockLabel: 'Liberada no Nível 1',
    pattern: 'steel_beam',
    bgStyle:
      'radial-gradient(ellipse at 78% 50%, rgba(56,189,248,0.42) 0%, rgba(14,116,144,0.22) 38%, rgba(7,12,22,0.96) 80%)',
    accentHex: '#38bdf8',
    secondaryHex: '#0ea5e9',
    borderHex: 'rgba(56,189,248,0.45)',
    isUnlocked: () => true,
  },
  {
    id: 'crimson_strike',
    name: 'Golpe Carmesim',
    rarity: 'COMUM',
    description: 'Corte diagonal carmesim sobre fibra de carbono negra.',
    unlockLabel: 'Liberada no Nível 1',
    pattern: 'crimson_slash',
    bgStyle:
      'radial-gradient(ellipse at 76% 48%, rgba(239,68,68,0.46) 0%, rgba(153,27,27,0.25) 42%, rgba(14,6,9,0.96) 82%)',
    accentHex: '#f87171',
    secondaryHex: '#dc2626',
    borderHex: 'rgba(239,68,68,0.45)',
    isUnlocked: () => true,
  },
  {
    id: 'arctic_ghost',
    name: 'Tempestade Ártica',
    rarity: 'TATICO',
    description: 'Malha hexagonal congelada de reconhecimento polar.',
    unlockLabel: 'Alcance o Nível 2',
    pattern: 'arctic_hex',
    bgStyle:
      'radial-gradient(ellipse at 75% 45%, rgba(125,211,252,0.46) 0%, rgba(30,58,138,0.28) 44%, rgba(6,13,24,0.96) 84%)',
    accentHex: '#7dd3fc',
    secondaryHex: '#e0f2fe',
    borderHex: 'rgba(125,211,252,0.5)',
    isUnlocked: (p) => (p.rankLevel || 1) >= 2,
    getProgressText: (p) => `Nível ${p.rankLevel || 1}/2`,
  },
  {
    id: 'cobalt_surge',
    name: 'Relâmpago Cobalto',
    rarity: 'TATICO',
    description: 'Descarga elétrica azul de alta tensão sobre chassi escuro.',
    unlockLabel: 'Alcance o Nível 3',
    pattern: 'cobalt_lightning',
    bgStyle:
      'radial-gradient(ellipse at 72% 52%, rgba(37,99,235,0.56) 0%, rgba(14,165,233,0.28) 40%, rgba(5,10,22,0.96) 82%)',
    accentHex: '#60a5fa',
    secondaryHex: '#38bdf8',
    borderHex: 'rgba(96,165,250,0.55)',
    isUnlocked: (p) => (p.rankLevel || 1) >= 3,
    getProgressText: (p) => `Nível ${p.rankLevel || 1}/3`,
  },
  {
    id: 'blood_fury',
    name: 'Fúria Rubi',
    rarity: 'RARO',
    description: 'Vórtice incandescente rubi reservado a operadores veteranos.',
    unlockLabel: 'Alcance o Nível 4',
    pattern: 'ruby_vortex',
    bgStyle:
      'radial-gradient(ellipse at 76% 50%, rgba(225,29,72,0.55) 0%, rgba(127,29,29,0.32) 42%, rgba(15,5,8,0.97) 82%)',
    accentHex: '#fb7185',
    secondaryHex: '#ef4444',
    borderHex: 'rgba(244,63,94,0.55)',
    isUnlocked: (p) => (p.rankLevel || 1) >= 4,
    getProgressText: (p) => `Nível ${p.rankLevel || 1}/4`,
  },
  {
    id: 'mission_operator',
    name: 'Agente de Contratos',
    rarity: 'RARO',
    description: 'Radar tático esmeralda concedido por cumprir missões de campo.',
    unlockLabel: 'Complete 1 Missão Diária ou 1 Partida Online',
    pattern: 'emerald_radar',
    bgStyle:
      'radial-gradient(ellipse at 75% 50%, rgba(16,185,129,0.48) 0%, rgba(6,78,59,0.28) 44%, rgba(5,14,12,0.97) 82%)',
    accentHex: '#34d399',
    secondaryHex: '#10b981',
    borderHex: 'rgba(52,211,153,0.55)',
    isUnlocked: (p) =>
      countCompletedMissions(p) >= 1 || (p.matchesPlayed || 0) >= 1,
    getProgressText: (p) =>
      `Missões ${Math.min(1, countCompletedMissions(p))}/1 · Partidas ${Math.min(1, p.matchesPlayed || 0)}/1`,
  },
  {
    id: 'iron_wolf',
    name: 'Lobo da Névoa',
    rarity: 'EPICO',
    description: 'Marcas de garra prateadas em neblina lunar de operações furtivas.',
    unlockLabel: 'Nível 6 ou 15 Abates Online',
    pattern: 'lunar_wolf',
    bgStyle:
      'radial-gradient(ellipse at 74% 48%, rgba(148,163,184,0.44) 0%, rgba(51,65,85,0.28) 44%, rgba(8,10,16,0.97) 82%)',
    accentHex: '#e2e8f0',
    secondaryHex: '#94a3b8',
    borderHex: 'rgba(203,213,225,0.5)',
    isUnlocked: (p) => (p.rankLevel || 1) >= 6 || (p.totalKills || 0) >= 15,
    getProgressText: (p) =>
      `Nv.${p.rankLevel || 1}/6 · Abates ${Math.min(15, p.totalKills || 0)}/15`,
  },
  {
    id: 'cyber_circuit',
    name: 'Circuito Neural',
    rarity: 'EPICO',
    description: 'Trilhas cibernéticas neon para especialistas em precisão letal.',
    unlockLabel: 'Nível 8 ou 5 Headshots Online',
    pattern: 'cyber_circuit',
    bgStyle:
      'radial-gradient(ellipse at 76% 50%, rgba(168,85,247,0.5) 0%, rgba(6,182,212,0.28) 44%, rgba(9,7,20,0.97) 82%)',
    accentHex: '#22d3ee',
    secondaryHex: '#c084fc',
    borderHex: 'rgba(192,132,252,0.55)',
    isUnlocked: (p) => (p.rankLevel || 1) >= 8 || (p.totalHeadshots || 0) >= 5,
    getProgressText: (p) =>
      `Nv.${p.rankLevel || 1}/8 · HS ${Math.min(5, p.totalHeadshots || 0)}/5`,
  },
  {
    id: 'desert_emperor',
    name: 'Imperador Dourado',
    rarity: 'EPICO',
    description: 'Ouro imperial escovado com partículas incandescentes de vitória.',
    unlockLabel: 'Nível 10 ou 3 Vitórias Online',
    pattern: 'imperial_gold',
    bgStyle:
      'radial-gradient(ellipse at 76% 50%, rgba(245,158,11,0.54) 0%, rgba(146,64,14,0.3) 42%, rgba(14,10,5,0.97) 82%)',
    accentHex: '#fbbf24',
    secondaryHex: '#f59e0b',
    borderHex: 'rgba(251,191,36,0.6)',
    isUnlocked: (p) => (p.rankLevel || 1) >= 10 || (p.matchesWon || 0) >= 3,
    getProgressText: (p) =>
      `Nv.${p.rankLevel || 1}/10 · Vitórias ${Math.min(3, p.matchesWon || 0)}/3`,
  },
  {
    id: 'viper_venom',
    name: 'Víbora Esmeralda',
    rarity: 'LENDARIO',
    description: 'Escamas venenosas com relâmpagos esmeralda de comando de elite.',
    unlockLabel: 'Nível 14, 3 Missões ou 50 Abates',
    pattern: 'viper_scales',
    bgStyle:
      'radial-gradient(ellipse at 76% 48%, rgba(34,197,94,0.56) 0%, rgba(21,128,61,0.3) 42%, rgba(4,14,8,0.97) 82%)',
    accentHex: '#4ade80',
    secondaryHex: '#bef264',
    borderHex: 'rgba(74,222,128,0.6)',
    isUnlocked: (p) =>
      (p.rankLevel || 1) >= 14 ||
      countCompletedMissions(p) >= 3 ||
      (p.totalKills || 0) >= 50,
    getProgressText: (p) =>
      `Nv.${p.rankLevel || 1}/14 · Missões ${Math.min(3, countCompletedMissions(p))}/3 · Abates ${Math.min(50, p.totalKills || 0)}/50`,
  },
  {
    id: 'solar_supernova',
    name: 'Supernova Solar',
    rarity: 'LENDARIO',
    description: 'Explosão de plasma solar para especialistas em demolição e vitórias.',
    unlockLabel: 'Nível 20, 10 Vitórias ou 5 Bombas Plantadas',
    pattern: 'solar_flare',
    bgStyle:
      'radial-gradient(ellipse at 74% 50%, rgba(249,115,22,0.62) 0%, rgba(220,38,38,0.34) 42%, rgba(16,7,4,0.97) 84%)',
    accentHex: '#fb923c',
    secondaryHex: '#fde047',
    borderHex: 'rgba(251,146,60,0.65)',
    isUnlocked: (p) =>
      (p.rankLevel || 1) >= 20 ||
      (p.matchesWon || 0) >= 10 ||
      (p.bombsPlanted || 0) >= 5,
    getProgressText: (p) =>
      `Nv.${p.rankLevel || 1}/20 · Vitórias ${Math.min(10, p.matchesWon || 0)}/10 · C4 ${Math.min(5, p.bombsPlanted || 0)}/5`,
  },
  {
    id: 'mythic_dragon',
    name: 'Dragão Mítico',
    rarity: 'MITICO',
    description: 'Asas incandescentes de ouro e fogo reservadas às lendas do KINETIC.',
    unlockLabel: 'Nível 30, 150 Abates ou 25 Headshots',
    pattern: 'mythic_wings',
    bgStyle:
      'radial-gradient(ellipse at 74% 48%, rgba(234,179,8,0.62) 0%, rgba(185,28,28,0.4) 44%, rgba(14,5,5,0.98) 84%)',
    accentHex: '#fde047',
    secondaryHex: '#f43f5e',
    borderHex: 'rgba(253,224,71,0.72)',
    isUnlocked: (p) =>
      (p.rankLevel || 1) >= 30 ||
      (p.totalKills || 0) >= 150 ||
      (p.totalHeadshots || 0) >= 25,
    getProgressText: (p) =>
      `Nv.${p.rankLevel || 1}/30 · Abates ${Math.min(150, p.totalKills || 0)}/150 · HS ${Math.min(25, p.totalHeadshots || 0)}/25`,
  },
];

export const CALLING_CARD_RARITY_META: Record<
  CallingCardRarity,
  { label: string; textClass: string; badgeClass: string }
> = {
  COMUM: {
    label: 'COMUM',
    textClass: 'text-slate-300',
    badgeClass: 'bg-slate-800/90 border-slate-500/50 text-slate-200',
  },
  TATICO: {
    label: 'TÁTICO',
    textClass: 'text-sky-300',
    badgeClass: 'bg-sky-950/90 border-sky-400/50 text-sky-200',
  },
  RARO: {
    label: 'RARO',
    textClass: 'text-emerald-300',
    badgeClass: 'bg-emerald-950/90 border-emerald-400/50 text-emerald-200',
  },
  EPICO: {
    label: 'ÉPICO',
    textClass: 'text-purple-300',
    badgeClass: 'bg-purple-950/90 border-purple-400/50 text-purple-200',
  },
  LENDARIO: {
    label: 'LENDÁRIO',
    textClass: 'text-amber-300',
    badgeClass: 'bg-amber-950/90 border-amber-400/60 text-amber-200',
  },
  MITICO: {
    label: 'MÍTICO',
    textClass: 'text-rose-300',
    badgeClass: 'bg-rose-950/90 border-yellow-400/70 text-yellow-200',
  },
};

const STORAGE_KEY = 'kinetic_equipped_calling_card_v1';
const listeners = new Set<(cardId: string) => void>();

function readStoredCallingCardId(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && CALLING_CARD_CATALOG.some((c) => c.id === raw)) {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return 'obsidian_vanguard';
}

let equippedCallingCardId = readStoredCallingCardId();

export function getEquippedCallingCardId(): string {
  return equippedCallingCardId;
}

export function getCallingCardById(cardId?: string | null): CallingCardDefinition {
  if (cardId) {
    const found = CALLING_CARD_CATALOG.find((c) => c.id === cardId);
    if (found) return found;
  }
  return CALLING_CARD_CATALOG[0];
}

export function getDeterministicFallbackCallingCard(
  callsign: string,
  team: 'VANGUARD' | 'BLACKTHORN'
): CallingCardDefinition {
  const pool =
    team === 'VANGUARD'
      ? ['obsidian_vanguard', 'cobalt_surge', 'arctic_ghost', 'cyber_circuit', 'iron_wolf']
      : ['crimson_strike', 'blood_fury', 'solar_supernova', 'desert_emperor', 'mythic_dragon'];
  let hash = 0;
  for (let i = 0; i < callsign.length; i++) {
    hash = (hash * 31 + callsign.charCodeAt(i)) >>> 0;
  }
  return getCallingCardById(pool[hash % pool.length]);
}

export function setEquippedCallingCardId(
  cardId: string,
  profile: PlayerCloudProfile
): boolean {
  const card = CALLING_CARD_CATALOG.find((c) => c.id === cardId);
  if (!card) return false;
  if (!card.isUnlocked(profile)) return false;
  equippedCallingCardId = card.id;
  try {
    localStorage.setItem(STORAGE_KEY, card.id);
  } catch {
    // ignore storage errors
  }
  listeners.forEach((fn) => fn(card.id));
  return true;
}

export function subscribeEquippedCallingCard(
  listener: (cardId: string) => void
): () => void {
  listeners.add(listener);
  listener(equippedCallingCardId);
  return () => {
    listeners.delete(listener);
  };
}
