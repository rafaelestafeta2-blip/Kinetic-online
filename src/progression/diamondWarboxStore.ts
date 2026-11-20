import { WeaponId } from '../types/game';

export type WarboxRewardRarity = 'COMUM' | 'ESPECIAL' | 'ELITE' | 'LENDARIO';
export type WarboxRewardKind = 'WEAPON_BUNDLE' | 'OPERATOR' | 'SKIN' | 'CURRENCY';

export interface WarboxDropItem {
  id: string;
  label: string;
  subLabel: string;
  rarity: WarboxRewardRarity;
  kind: WarboxRewardKind;
  chancePct: number; // Exact percentage (sum of items in a box === 100)
  weaponId?: WeaponId;
  skinId?: string;
  operatorId?: string;
  cashAmount?: number;
  xpAmount?: number;
  duplicateCashCompensation: number;
  duplicateXpCompensation: number;
}

export interface WarfaceWarboxDefinition {
  id: string;
  name: string;
  code: string;
  subtitle: string;
  themeAccent: 'GOLD' | 'CRIMSON' | 'CYAN' | 'EMERALD';
  price1xDiamonds: number;
  price5xDiamonds: number;
  featuredWeaponId: WeaponId;
  featuredSkinId: string;
  featuredOperatorId?: string;
  guaranteeEveryOpens: number;
  drops: WarboxDropItem[];
}

export interface DiamondWeaponDirectOffer {
  id: string;
  weaponId: WeaponId;
  weaponName: string;
  editionTitle: string;
  category: string;
  caliber: string;
  skinId: string;
  skinName: string;
  rarity: 'ELITE' | 'LENDARIO';
  diamondPrice: number;
  bonusCash: number;
  highlightDesc: string;
}

export const WARBOX_CATALOG: WarfaceWarboxDefinition[] = [
  {
    id: 'box_imperial_gold',
    name: 'CAIXA IMPERIAL OURO ANUBIS',
    code: 'WBX-ANUBIS-24K',
    subtitle: 'Sniper Anti-Material M200 Ouro + Comandante Aurum 24K',
    themeAccent: 'GOLD',
    price1xDiamonds: 120,
    price5xDiamonds: 540,
    featuredWeaponId: 'SNIPER_HEAVY',
    featuredSkinId: 'camo_anubis_gold',
    featuredOperatorId: 'op_aurum_commander',
    guaranteeEveryOpens: 10,
    drops: [
      {
        id: 'drop_m200_anubis',
        label: 'M200 INTERVENTION · OURO ANUBIS',
        subLabel: 'Arma Permanente + Skin Ouro Faraó 24K',
        rarity: 'LENDARIO',
        kind: 'WEAPON_BUNDLE',
        chancePct: 1.5,
        weaponId: 'SNIPER_HEAVY',
        skinId: 'camo_anubis_gold',
        duplicateCashCompensation: 3500,
        duplicateXpCompensation: 1200,
      },
      {
        id: 'drop_op_aurum',
        label: 'OPERADOR COMANDANTE AURUM',
        subLabel: 'Traje 3D Lendário Carbono & Ouro 24K',
        rarity: 'LENDARIO',
        kind: 'OPERATOR',
        chancePct: 2.5,
        operatorId: 'op_aurum_commander',
        duplicateCashCompensation: 3000,
        duplicateXpCompensation: 1000,
      },
      {
        id: 'drop_lmg_gold',
        label: 'LMG PESADA 100R · OURO ELITE',
        subLabel: 'Metralhadora 100 Tiros + Skin Carbono & Ouro',
        rarity: 'ELITE',
        kind: 'WEAPON_BUNDLE',
        chancePct: 4.5,
        weaponId: 'L49_LMG',
        skinId: 'camo_carbon_gold',
        duplicateCashCompensation: 2200,
        duplicateXpCompensation: 750,
      },
      {
        id: 'drop_skin_anubis',
        label: 'SKIN OURO FARAÓ ANUBIS',
        subLabel: 'Pintura Universal 24K para Todas as Armas',
        rarity: 'ELITE',
        kind: 'SKIN',
        chancePct: 9.5,
        skinId: 'camo_anubis_gold',
        duplicateCashCompensation: 1500,
        duplicateXpCompensation: 500,
      },
      {
        id: 'drop_hk416_gold',
        label: 'HK416 CARABINA · CARBONO & OURO',
        subLabel: 'Fuzil Tático Permanente + Skin Ouro Elite',
        rarity: 'ELITE',
        kind: 'WEAPON_BUNDLE',
        chancePct: 12.0,
        weaponId: 'CARBINE_AR',
        skinId: 'camo_carbon_gold',
        duplicateCashCompensation: 1600,
        duplicateXpCompensation: 550,
      },
      {
        id: 'drop_skin_carbon_gold',
        label: 'SKIN CARBONO & OURO ELITE',
        subLabel: 'Camuflagem Universal Metálica',
        rarity: 'ESPECIAL',
        kind: 'SKIN',
        chancePct: 18.0,
        skinId: 'camo_carbon_gold',
        duplicateCashCompensation: 1100,
        duplicateXpCompensation: 400,
      },
      {
        id: 'drop_cash_imperial_large',
        label: '+2.500 K-MONEY + 800 XP',
        subLabel: 'Reserva Financeira Imperial',
        rarity: 'ESPECIAL',
        kind: 'CURRENCY',
        chancePct: 24.0,
        cashAmount: 2500,
        xpAmount: 800,
        duplicateCashCompensation: 2500,
        duplicateXpCompensation: 800,
      },
      {
        id: 'drop_cash_imperial_std',
        label: '+1.200 K-MONEY + 400 XP',
        subLabel: 'Suprimento Tático de Combate',
        rarity: 'COMUM',
        kind: 'CURRENCY',
        chancePct: 28.0,
        cashAmount: 1200,
        xpAmount: 400,
        duplicateCashCompensation: 1200,
        duplicateXpCompensation: 400,
      },
    ],
  },
  {
    id: 'box_blackwood_ops',
    name: 'CAIXA BLACKWOOD OPERAÇÕES SECRETAS',
    code: 'WBX-BLKWD-X9',
    subtitle: 'Lançador RPG-7V + Operador Spectre Blackwood + SPAS-12',
    themeAccent: 'CRIMSON',
    price1xDiamonds: 100,
    price5xDiamonds: 450,
    featuredWeaponId: 'RPG7_LAUNCHER',
    featuredSkinId: 'camo_crimson_ops',
    featuredOperatorId: 'op_blackwood_spectre',
    guaranteeEveryOpens: 10,
    drops: [
      {
        id: 'drop_rpg7_crimson',
        label: 'RPG-7V LANÇADOR · RUBRO BLACKTHORN',
        subLabel: 'Lançador Explosivo Permanente + Skin Rubro',
        rarity: 'LENDARIO',
        kind: 'WEAPON_BUNDLE',
        chancePct: 2.0,
        weaponId: 'RPG7_LAUNCHER',
        skinId: 'camo_crimson_ops',
        duplicateCashCompensation: 3200,
        duplicateXpCompensation: 1100,
      },
      {
        id: 'drop_op_spectre',
        label: 'OPERADOR SPECTRE BLACKWOOD',
        subLabel: 'Traje 3D Elite Obsidiana & Carmesim',
        rarity: 'ELITE',
        kind: 'OPERATOR',
        chancePct: 3.5,
        operatorId: 'op_blackwood_spectre',
        duplicateCashCompensation: 2600,
        duplicateXpCompensation: 900,
      },
      {
        id: 'drop_spas12_crimson',
        label: 'SPAS-12 TÁTICA · GRAFFITI NEON POP',
        subLabel: 'Escopeta Semiauto 12GA + Skin Exclusiva Street Art',
        rarity: 'ELITE',
        kind: 'WEAPON_BUNDLE',
        chancePct: 6.5,
        weaponId: 'SHOTGUN_SPAS',
        skinId: 'auto_shotgun_03',
        duplicateCashCompensation: 2000,
        duplicateXpCompensation: 700,
      },
      {
        id: 'drop_op_viper',
        label: 'OPERADOR VÍBORA RECON',
        subLabel: 'Traje 3D Operações Noturnas Esmeralda',
        rarity: 'ESPECIAL',
        kind: 'OPERATOR',
        chancePct: 10.0,
        operatorId: 'op_viper_recon',
        duplicateCashCompensation: 1800,
        duplicateXpCompensation: 600,
      },
      {
        id: 'drop_skin_crimson',
        label: 'SKIN RUBRO BLACKTHORN',
        subLabel: 'Camuflagem Universal Carmesim & Grafite',
        rarity: 'ESPECIAL',
        kind: 'SKIN',
        chancePct: 15.0,
        skinId: 'camo_crimson_ops',
        duplicateCashCompensation: 1100,
        duplicateXpCompensation: 400,
      },
      {
        id: 'drop_skin_viper',
        label: 'SKIN VÍBORA ESMERALDA',
        subLabel: 'Camuflagem Universal Ônix & Esmeralda',
        rarity: 'ESPECIAL',
        kind: 'SKIN',
        chancePct: 17.0,
        skinId: 'camo_emerald_viper',
        duplicateCashCompensation: 1100,
        duplicateXpCompensation: 400,
      },
      {
        id: 'drop_cash_blk_large',
        label: '+2.000 K-MONEY + 650 XP',
        subLabel: 'Cofre Tático Blackwood',
        rarity: 'ESPECIAL',
        kind: 'CURRENCY',
        chancePct: 22.0,
        cashAmount: 2000,
        xpAmount: 650,
        duplicateCashCompensation: 2000,
        duplicateXpCompensation: 650,
      },
      {
        id: 'drop_cash_blk_std',
        label: '+1.000 K-MONEY + 350 XP',
        subLabel: 'Suprimento de Incursão',
        rarity: 'COMUM',
        kind: 'CURRENCY',
        chancePct: 24.0,
        cashAmount: 1000,
        xpAmount: 350,
        duplicateCashCompensation: 1000,
        duplicateXpCompensation: 350,
      },
    ],
  },
  {
    id: 'box_arctic_phantom',
    name: 'CAIXA PHANTOM DIVISÃO ÁRTICA',
    code: 'WBX-PHANTOM-01',
    subtitle: 'Sniper Kar98k Geada + Operador Phantom Ártico + MPS5 Cobalto',
    themeAccent: 'CYAN',
    price1xDiamonds: 90,
    price5xDiamonds: 400,
    featuredWeaponId: 'SNIPER_BOLT',
    featuredSkinId: 'camo_cyber_cobalt',
    featuredOperatorId: 'op_ghost_arctic',
    guaranteeEveryOpens: 10,
    drops: [
      {
        id: 'drop_kar98_frost',
        label: 'KAR98K PRECISÃO · GEADA ÁRTICA',
        subLabel: 'Sniper Ferrolho Permanente + Skin Geada Fantasma',
        rarity: 'LENDARIO',
        kind: 'WEAPON_BUNDLE',
        chancePct: 2.5,
        weaponId: 'SNIPER_BOLT',
        skinId: 'camo_arctic_frost',
        duplicateCashCompensation: 3000,
        duplicateXpCompensation: 1000,
      },
      {
        id: 'drop_op_ghost_arctic',
        label: 'OPERADOR PHANTOM ÁRTICO',
        subLabel: 'Traje 3D Elite Forças Especiais Alpinas',
        rarity: 'ELITE',
        kind: 'OPERATOR',
        chancePct: 4.0,
        operatorId: 'op_ghost_arctic',
        duplicateCashCompensation: 2500,
        duplicateXpCompensation: 850,
      },
      {
        id: 'drop_mp5_cobalt',
        label: 'MPS5 TÁTICA 9MM · COBALTO CYBER',
        subLabel: 'Submetralhadora Permanente + Skin Cobalto KINETIC',
        rarity: 'ELITE',
        kind: 'WEAPON_BUNDLE',
        chancePct: 7.5,
        weaponId: 'SMG_MP5',
        skinId: 'camo_cyber_cobalt',
        duplicateCashCompensation: 1900,
        duplicateXpCompensation: 650,
      },
      {
        id: 'drop_op_cobalt',
        label: 'OPERADOR KINETIC COBALTO',
        subLabel: 'Traje 3D Especial Liga Azul-Cobalto',
        rarity: 'ESPECIAL',
        kind: 'OPERATOR',
        chancePct: 11.0,
        operatorId: 'op_cobalt_strike',
        duplicateCashCompensation: 1700,
        duplicateXpCompensation: 550,
      },
      {
        id: 'drop_skin_cobalt',
        label: 'SKIN COBALTO KINETIC CYBER',
        subLabel: 'Pintura Universal Titânio & Azul-Cobalto',
        rarity: 'ELITE',
        kind: 'SKIN',
        chancePct: 14.0,
        skinId: 'camo_cyber_cobalt',
        duplicateCashCompensation: 1300,
        duplicateXpCompensation: 450,
      },
      {
        id: 'drop_skin_frost',
        label: 'SKIN GEADA FANTASMA ÁRTICA',
        subLabel: 'Camuflagem Universal Invernal',
        rarity: 'ESPECIAL',
        kind: 'SKIN',
        chancePct: 17.0,
        skinId: 'camo_arctic_frost',
        duplicateCashCompensation: 1100,
        duplicateXpCompensation: 380,
      },
      {
        id: 'drop_cash_arctic_large',
        label: '+1.800 K-MONEY + 550 XP',
        subLabel: 'Reserva Operacional Phantom',
        rarity: 'ESPECIAL',
        kind: 'CURRENCY',
        chancePct: 21.0,
        cashAmount: 1800,
        xpAmount: 550,
        duplicateCashCompensation: 1800,
        duplicateXpCompensation: 550,
      },
      {
        id: 'drop_cash_arctic_std',
        label: '+950 K-MONEY + 300 XP',
        subLabel: 'Suprimento Polar',
        rarity: 'COMUM',
        kind: 'CURRENCY',
        chancePct: 23.0,
        cashAmount: 950,
        xpAmount: 300,
        duplicateCashCompensation: 950,
        duplicateXpCompensation: 300,
      },
    ],
  },
];

export const DIAMOND_EXCLUSIVE_WEAPON_OFFERS: DiamondWeaponDirectOffer[] = [
  {
    id: 'offer_shotgun_aemondir',
    weaponId: 'SHOTGUN_12',
    weaponName: 'SHOTGUN AEMONDIR BUCKY 12GA',
    editionTitle: 'EDIÇÃO LENDÁRIA LEGION DRACÔNICA',
    category: 'Escopeta Pump 12GA',
    caliber: 'Calibre 12 Buckshot',
    skinId: 'shotgun_aemondir_legion',
    skinName: 'Aemondir Bucky Legion',
    rarity: 'LENDARIO',
    diamondPrice: 350,
    bonusCash: 1500,
    highlightDesc:
      'Skin 3D Exclusiva Aemondir Bucky Legion com chassi dracônico em bronze imperial, escamas carmesim, runas incandescentes e baioneta acoplada + 1.500 K-Money.',
  },
  {
    id: 'offer_v18_spectre_eng',
    weaponId: 'SMG_45',
    weaponName: 'V18 SPECTRE SILENCIADA (ENGENHEIRO)',
    editionTitle: 'EDIÇÃO OPERAÇÕES SECRETAS V18',
    category: 'SMG Engenheiro Silenciada',
    caliber: '9x19mm Subsonic',
    skinId: 'camo_crimson_ops',
    skinName: 'Rubro Blackthorn',
    rarity: 'LENDARIO',
    diamondPrice: 420,
    bonusCash: 1200,
    highlightDesc:
      'Nova arma tática V18 de Engenheiro com silenciador acústico integral, mira holográfica embutida e pintura Rubro Blackthorn.',
  },
  {
    id: 'offer_m200_anubis',
    weaponId: 'SNIPER_HEAVY',
    weaponName: 'M200 INTERVENTION .408',
    editionTitle: 'EDIÇÃO LENDÁRIA ANUBIS 24K',
    category: 'Sniper Anti-Material',
    caliber: '.408 CheyTac',
    skinId: 'camo_anubis_gold',
    skinName: 'Ouro Faraó Anubis',
    rarity: 'LENDARIO',
    diamondPrice: 780,
    bonusCash: 1500,
    highlightDesc:
      'Desbloqueio permanente imediato da M200 Intervention independentemente de patente + pintura Ouro Faraó Anubis 24K + 1.500 K-Money.',
  },
  {
    id: 'offer_lmg_gold',
    weaponId: 'L49_LMG',
    weaponName: 'LMG PESADA 100R SAW',
    editionTitle: 'EDIÇÃO ELITE SUPRESSÃO OURO',
    category: 'Metralhadora Leve',
    caliber: '5.56x45mm SAW',
    skinId: 'camo_carbon_gold',
    skinName: 'Carbono & Ouro Elite',
    rarity: 'ELITE',
    diamondPrice: 640,
    bonusCash: 1200,
    highlightDesc:
      'Tambor de 100 munições liberado permanentemente + acabamento Carbono & Ouro Elite + 1.200 K-Money.',
  },
  {
    id: 'offer_rpg7_blackthorn',
    weaponId: 'RPG7_LAUNCHER',
    weaponName: 'RPG-7V LANÇA-FOGUETES',
    editionTitle: 'EDIÇÃO DEMOLIÇÃO BLACKTHORN',
    category: 'Lançador Pesado',
    caliber: '85mm PG-7V HEAT',
    skinId: 'camo_crimson_ops',
    skinName: 'Rubro Blackthorn',
    rarity: 'LENDARIO',
    diamondPrice: 690,
    bonusCash: 1200,
    highlightDesc:
      'Lançador antitanque portátil liberado permanentemente para Engenheiro + pintura Rubro Blackthorn.',
  },
  {
    id: 'offer_spas12_arctic',
    weaponId: 'SHOTGUN_SPAS',
    weaponName: 'SPAS-12 TÁTICA 12GA',
    editionTitle: 'EDIÇÃO BREACHER ÁRTICA 2K',
    category: 'Escopeta Semiautomática',
    caliber: 'Calibre 12 Magnum',
    skinId: 'auto_shotgun_05',
    skinName: 'Camuflagem Urbana Ártica',
    rarity: 'ELITE',
    diamondPrice: 520,
    bonusCash: 1000,
    highlightDesc:
      'Escopeta semiautomática de alta cadência para Médico + textura dedicada 2K Urbana Ártica.',
  },
  {
    id: 'offer_kar98_frost',
    weaponId: 'SNIPER_BOLT',
    weaponName: 'KAR98K PRECISÃO',
    editionTitle: 'EDIÇÃO ATIRADOR FANTASMA',
    category: 'Fuzil de Precisão',
    caliber: '7.92x57mm Mauser',
    skinId: 'camo_arctic_frost',
    skinName: 'Geada Fantasma Ártica',
    rarity: 'ELITE',
    diamondPrice: 540,
    bonusCash: 1000,
    highlightDesc:
      'Fuzil sniper de ferrolho rápido liberado permanentemente + camuflagem Geada Fantasma Ártica.',
  },
  {
    id: 'offer_hk416_cobalt',
    weaponId: 'CARBINE_AR',
    weaponName: 'HK416 CARABINA TÁTICA',
    editionTitle: 'EDIÇÃO KINETIC COBALTO',
    category: 'Fuzil de Assalto',
    caliber: '5.56x45mm NATO',
    skinId: 'camo_cyber_cobalt',
    skinName: 'Cobalto KINETIC Cyber',
    rarity: 'ELITE',
    diamondPrice: 480,
    bonusCash: 900,
    highlightDesc:
      'Carabina de alta estabilidade para Fuzileiro liberada permanentemente + acabamento Cobalto Cyber.',
  },
];

const PITY_STORAGE_KEY = 'kinetic_warbox_pity_v1';

export type WarboxPityMap = Record<string, number>;

export function loadWarboxPityMap(): WarboxPityMap {
  try {
    const raw = localStorage.getItem(PITY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: WarboxPityMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveWarboxPityMap(map: WarboxPityMap): void {
  try {
    localStorage.setItem(PITY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function sampleSingleDrop(
  box: WarfaceWarboxDefinition,
  forceHighTier: boolean
): WarboxDropItem {
  const pool = forceHighTier
    ? box.drops.filter((d) => d.rarity === 'LENDARIO' || d.rarity === 'ELITE')
    : box.drops;

  const totalWeight = pool.reduce((acc, item) => acc + item.chancePct, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].chancePct;
    if (r <= 0) {
      return pool[i];
    }
  }
  return pool[pool.length - 1];
}

export function rollWarboxDrops(
  boxId: string,
  count: 1 | 5
): {
  box: WarfaceWarboxDefinition;
  results: Array<{ item: WarboxDropItem; wasGuaranteedPity: boolean }>;
  nextPityCount: number;
} {
  const box = WARBOX_CATALOG.find((b) => b.id === boxId) || WARBOX_CATALOG[0];
  const pityMap = loadWarboxPityMap();
  let currentPity = Math.max(0, Math.floor(pityMap[box.id] || 0));

  const results: Array<{ item: WarboxDropItem; wasGuaranteedPity: boolean }> = [];
  for (let i = 0; i < count; i++) {
    currentPity += 1;
    const forceHigh = currentPity >= box.guaranteeEveryOpens;
    const item = sampleSingleDrop(box, forceHigh);
    const isHigh = item.rarity === 'LENDARIO' || item.rarity === 'ELITE';
    const wasGuaranteedPity = forceHigh;
    if (isHigh) {
      currentPity = 0;
    }
    results.push({ item, wasGuaranteedPity });
  }

  pityMap[box.id] = currentPity;
  saveWarboxPityMap(pityMap);

  return {
    box,
    results,
    nextPityCount: currentPity,
  };
}
