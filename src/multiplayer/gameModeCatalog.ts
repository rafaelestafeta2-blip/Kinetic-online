import { DrillMode } from '../types/game';

export type GameModeCategory = 'PLANT_BOMB' | 'TDM' | 'CAPTURE';

export interface ModeMapEntry {
  id: DrillMode;
  label: string;
  shortTag: string;
  rankedPool?: boolean;
}

export interface GameModeCategoryMeta {
  id: GameModeCategory;
  label: string;
  shortLabel: string;
  icon: string;
  subtitle: string;
  maps: ModeMapEntry[];
}

export const GAME_MODE_CATALOG: GameModeCategoryMeta[] = [
  {
    id: 'PLANT_BOMB',
    label: 'PLANTAR A BOMBA',
    shortLabel: 'BOMBA',
    icon: '💣',
    subtitle: 'Plante ou desarme a C4 nos alvos A ou B',
    maps: [
      { id: 'DUST2_BOMB_5V5', label: 'DE_DUST2', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'ASSAULT_BOMB_5V5', label: 'CS_ASSAULT', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'INDUSTRIA_BOMB_5V5', label: 'INDUSTRIA', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'HANGAR_BOMB_5V5', label: 'HANGAR', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'EASTERN_CITY_BOMB_5V5', label: 'EASTERN CITY', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'MIRAGE_ANUBIS_BOMB_5V5', label: 'MIRAGE ANUBIS', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'CSGO_ASSAULT_BOMB_5V5', label: 'CSGO ASSAULT HD', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'DE_DST_BOMB_5V5', label: 'DE_DST DESERT', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'MP_NUKED_BOMB_5V5', label: 'MP_NUKED TOWN', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'DE_SUPPLY_BOMB_5V5', label: 'DE_SUPPLY BASE', shortTag: 'BOMB 5V5', rankedPool: true },
      { id: 'YARD_BOMB_5V5', label: 'YARD', shortTag: 'BOMB 5V5', rankedPool: false },
    ],
  },
  {
    id: 'TDM',
    label: 'MATA-MATA',
    shortLabel: 'MATA-MATA',
    icon: '⚔',
    subtitle: 'Team Deathmatch · Primeiro time a 40 abates vence',
    maps: [
      { id: 'STATION_TDM_5V5', label: 'STATION ARENA', shortTag: 'TDM 5V5' },
    ],
  },
  {
    id: 'CAPTURE',
    label: 'CAPTURA DE BANDEIRA',
    shortLabel: 'CAPTURA',
    icon: '🚩',
    subtitle: 'Capture a bandeira inimiga e leve até a sua base',
    maps: [
      { id: 'STATION_CAPTURE_5V5', label: 'STATION ARENA', shortTag: 'CTF 5V5' },
    ],
  },
];

export function getGameModeCategoryForArena(mode: DrillMode): GameModeCategory {
  if (mode === 'STATION_TDM_5V5') return 'TDM';
  if (mode === 'STATION_CAPTURE_5V5') return 'CAPTURE';
  return 'PLANT_BOMB';
}

export function getGameModeMeta(category: GameModeCategory): GameModeCategoryMeta {
  return GAME_MODE_CATALOG.find((m) => m.id === category) || GAME_MODE_CATALOG[0];
}

export function getMapsForCategory(category: GameModeCategory): ModeMapEntry[] {
  return getGameModeMeta(category).maps;
}

export function getDefaultArenaForCategory(category: GameModeCategory): DrillMode {
  return getMapsForCategory(category)[0]?.id || 'DUST2_BOMB_5V5';
}

export function pickRandomMapForCategory(
  category: GameModeCategory,
  rankedOnly = false
): DrillMode {
  const all = getMapsForCategory(category);
  const pool = rankedOnly ? all.filter((m) => m.rankedPool) : all;
  const effective = pool.length > 0 ? pool : all;
  const idx = Math.floor(Math.random() * effective.length);
  return effective[idx]?.id || 'DUST2_BOMB_5V5';
}

export function getMapLabelForArena(mode: DrillMode): string {
  for (const cat of GAME_MODE_CATALOG) {
    const found = cat.maps.find((m) => m.id === mode);
    if (found) return found.label;
  }
  return 'DE_DUST2';
}
