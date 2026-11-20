import { WeaponId } from '../types/game';

export type WeaponSkinCategory = 'PADRAO' | 'SKIN_EXCLUSIVA' | 'CAMUFLAGEM';
export type WeaponSkinRarity = 'PADRAO' | 'TATICO' | 'ESPECIAL' | 'ELITE';
export type CamoPatternType =
  | 'desert'
  | 'woodland'
  | 'urban_digital'
  | 'crimson'
  | 'carbon_gold'
  | 'anubis_gold'
  | 'cyber_cobalt'
  | 'emerald_viper'
  | 'arctic_frost'
  | 'aemondir_legion';

export interface WeaponSkinDefinition {
  id: string;
  name: string;
  shortName: string;
  category: WeaponSkinCategory;
  rarity: WeaponSkinRarity;
  description: string;
  /** undefined = universal across all weapons */
  weaponIds?: WeaponId[];
  /** Dedicated 3D GLB model replacement for exclusive weapon skins (e.g. Aemondir Bucky Shotgun) */
  modelOverrideUrl?: string;
  /** Dedicated 2K/HD albedo texture URL (e.g. automatic_shotgun skins 02..05) */
  textureUrl?: string;
  /** Procedural seamless tactical camo generator key */
  pattern?: CamoPatternType;
  /** 3-color tactical swatch for UI selector chips */
  swatchColors: [string, string, string];
  roughness?: number;
  metalness?: number;
  cashPrice: number;
  diamondPrice?: number;
}

export const WEAPON_SKIN_CATALOG: WeaponSkinDefinition[] = [
  {
    id: 'default',
    name: 'Padrão Fábrica',
    shortName: 'Fábrica',
    category: 'PADRAO',
    rarity: 'PADRAO',
    description: 'Acabamento militar original de fábrica sem pintura adicional.',
    swatchColors: ['#1f2937', '#334155', '#f59e0b'],
    cashPrice: 0,
  },
  // Skin Lendária 3D Aemondir Bucky Legion (Format1.rar - Pump Shotgun 12GA)
  {
    id: 'shotgun_aemondir_legion',
    name: 'Aemondir Bucky Legion',
    shortName: 'Aemondir',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ELITE',
    description:
      'Armadura dracônica Aemondir Legion com entalhes em bronze imperial, escamas carmesim, runas incandescentes e baioneta acoplada.',
    weaponIds: ['SHOTGUN_12'],
    modelOverrideUrl: '/models/weapons/shotgun_aemondir_lv1.glb',
    pattern: 'aemondir_legion',
    swatchColors: ['#dc2626', '#eab308', '#18181b'],
    roughness: 0.28,
    metalness: 0.78,
    cashPrice: 2200,
    diamondPrice: 350,
  },
  // 4 Skins Oficiais do pacote Automatic Shotgun (automatic_shotgun_02..05)
  {
    id: 'auto_shotgun_02',
    name: 'Verde Tático OD',
    shortName: 'Verde OD',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'TATICO',
    description:
      'Pintura militar Olive Drab fosca com marcações táticas em vermelho de combate.',
    weaponIds: ['SHOTGUN_SPAS'],
    textureUrl: '/models/weapons/skins/auto_shotgun_skin_02.jpg',
    swatchColors: ['#474339', '#393832', '#973027'],
    cashPrice: 0,
  },
  {
    id: 'auto_shotgun_03',
    name: 'Graffiti Neon Pop',
    shortName: 'Neon Pop',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ESPECIAL',
    description:
      'Edição especial Street Art com grafite ciano, magenta e amarelo sobre chassi escuro.',
    weaponIds: ['SHOTGUN_SPAS'],
    textureUrl: '/models/weapons/skins/auto_shotgun_skin_03.jpg',
    swatchColors: ['#22d3ee', '#ec4899', '#facc15'],
    cashPrice: 0,
  },
  {
    id: 'auto_shotgun_04',
    name: 'Camuflagem Floresta',
    shortName: 'Floresta',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'TATICO',
    description:
      'Padrão Woodland tradicional para operações em mata densa e emboscadas.',
    weaponIds: ['SHOTGUN_SPAS'],
    textureUrl: '/models/weapons/skins/auto_shotgun_skin_04.jpg',
    swatchColors: ['#5c7247', '#4a453d', '#262922'],
    cashPrice: 0,
  },
  {
    id: 'auto_shotgun_05',
    name: 'Camuflagem Urbana Ártica',
    shortName: 'Ártica',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ELITE',
    description:
      'Padrão geométrico branco, grafite e preto de alta definição para combate urbano.',
    weaponIds: ['SHOTGUN_SPAS'],
    textureUrl: '/models/weapons/skins/auto_shotgun_skin_05.jpg',
    swatchColors: ['#cbd5e1', '#535353', '#1e293b'],
    cashPrice: 0,
  },
  // 5 Camuflagens Táticas Universais (compatíveis com todas as armas)
  {
    id: 'camo_desert',
    name: 'Deserto Tático Sand',
    shortName: 'Deserto',
    category: 'CAMUFLAGEM',
    rarity: 'TATICO',
    description:
      'Camuflagem árida em tons de areia, ocre e marrom para mapas desérticos.',
    pattern: 'desert',
    swatchColors: ['#c2a878', '#8c724d', '#4a3d28'],
    roughness: 0.56,
    metalness: 0.25,
    cashPrice: 0,
  },
  {
    id: 'camo_woodland',
    name: 'Selva Ops Woodland',
    shortName: 'Selva Ops',
    category: 'CAMUFLAGEM',
    rarity: 'TATICO',
    description:
      'Camuflagem tática verde-oliva e terra para operações florestais e de selva.',
    pattern: 'woodland',
    swatchColors: ['#4d6b3c', '#5c4932', '#1e261b'],
    roughness: 0.54,
    metalness: 0.25,
    cashPrice: 0,
  },
  {
    id: 'camo_urban_digital',
    name: 'Digital Urbano',
    shortName: 'Digital',
    category: 'CAMUFLAGEM',
    rarity: 'TATICO',
    description:
      'Padrão pixelado cinza-aço e ardósia projetado para ambientes industriais e estações.',
    pattern: 'urban_digital',
    swatchColors: ['#94a3b8', '#475569', '#0f172a'],
    roughness: 0.48,
    metalness: 0.35,
    cashPrice: 0,
  },
  {
    id: 'camo_crimson_ops',
    name: 'Rubro Blackthorn',
    shortName: 'Rubro',
    category: 'CAMUFLAGEM',
    rarity: 'ESPECIAL',
    description:
      'Acabamento agressivo Blackthorn com faixas táticas vermelho-carmesim sobre aço grafite.',
    pattern: 'crimson',
    swatchColors: ['#b91c1c', '#27272a', '#ef4444'],
    roughness: 0.36,
    metalness: 0.55,
    cashPrice: 450,
    diamondPrice: 180,
  },
  {
    id: 'camo_carbon_gold',
    name: 'Carbono & Ouro Elite',
    shortName: 'Ouro Elite',
    category: 'CAMUFLAGEM',
    rarity: 'ELITE',
    description:
      'Trama de fibra de carbono anodizada com detalhes dourados metálicos de patente Elite.',
    pattern: 'carbon_gold',
    swatchColors: ['#18181b', '#eab308', '#52525b'],
    roughness: 0.28,
    metalness: 0.78,
    cashPrice: 850,
    diamondPrice: 280,
  },
  {
    id: 'camo_anubis_gold',
    name: 'Ouro Faraó Anubis',
    shortName: 'Anubis 24K',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ELITE',
    description:
      'Ligas de Ouro Imperial 24K com entalhes em azul lápis-lazúli e obsidiana real da coleção Warbox Anubis.',
    pattern: 'anubis_gold',
    swatchColors: ['#facc15', '#1d4ed8', '#0f172a'],
    roughness: 0.22,
    metalness: 0.88,
    cashPrice: 2400,
    diamondPrice: 360,
  },
  {
    id: 'camo_cyber_cobalt',
    name: 'Cobalto KINETIC Cyber',
    shortName: 'Cobalto',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ELITE',
    description:
      'Chassi em titânio escovado com circuitos táticos azul-cobalto anodizado de alta visibilidade.',
    pattern: 'cyber_cobalt',
    swatchColors: ['#38bdf8', '#1e3a8a', '#090d16'],
    roughness: 0.26,
    metalness: 0.76,
    cashPrice: 1950,
    diamondPrice: 320,
  },
  {
    id: 'camo_emerald_viper',
    name: 'Víbora Esmeralda',
    shortName: 'Esmeralda',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ESPECIAL',
    description:
      'Escamas táticas furtivas em preto ônix com veios metálicos verde-esmeralda da divisão Recon.',
    pattern: 'emerald_viper',
    swatchColors: ['#10b981', '#064e3b', '#18181b'],
    roughness: 0.32,
    metalness: 0.65,
    cashPrice: 1450,
    diamondPrice: 240,
  },
  {
    id: 'camo_arctic_frost',
    name: 'Geada Fantasma Ártica',
    shortName: 'Geada',
    category: 'SKIN_EXCLUSIVA',
    rarity: 'ESPECIAL',
    description:
      'Camuflagem invernal de operações especiais com fragmentos branco-gelo, prata e azul-glacial.',
    pattern: 'arctic_frost',
    swatchColors: ['#f8fafc', '#93c5fd', '#334155'],
    roughness: 0.38,
    metalness: 0.48,
    cashPrice: 1450,
    diamondPrice: 220,
  },
];

const SKIN_MAP = new Map<string, WeaponSkinDefinition>(
  WEAPON_SKIN_CATALOG.map((skin) => [skin.id, skin])
);

export function getSkinDefinition(skinId?: string | null): WeaponSkinDefinition {
  if (skinId && SKIN_MAP.has(skinId)) {
    return SKIN_MAP.get(skinId)!;
  }
  return WEAPON_SKIN_CATALOG[0];
}

export function getAvailableSkinsForWeapon(
  weaponId: WeaponId
): WeaponSkinDefinition[] {
  return WEAPON_SKIN_CATALOG.filter(
    (skin) => !skin.weaponIds || skin.weaponIds.includes(weaponId)
  );
}
