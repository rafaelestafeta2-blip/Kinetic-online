import { WarfaceClassId } from '../components/WarfaceClassIcons';
import { OpticType, WeaponId } from '../types/game';
import {
  getRankForXp,
  isOpticUnlockedAtXp,
  isWeaponUnlockedAtXp,
  loadSavedPlayerCash,
  loadSavedPlayerXp,
  spendPlayerCash,
} from './ranks';
import { getSkinDefinition } from './weaponSkins';
import {
  computeGunsmithModifiersForLoadout,
  GunsmithCombatModifiers,
  GunsmithSlotId,
  NEUTRAL_GUNSMITH_MODIFIERS,
  normalizeGunsmithLoadout,
  WeaponGunsmithLoadout,
  weaponSupportsGunsmith,
} from './gunsmithSystem';

export type EquipmentSlotId =
  | 'primaryWeapon'
  | 'secondaryWeapon'
  | 'meleeWeapon'
  | 'grenadePack'
  | 'helmet'
  | 'vest'
  | 'gloves'
  | 'boots';

export interface GearItemDefinition {
  id: string;
  slot: Exclude<EquipmentSlotId, 'primaryWeapon' | 'secondaryWeapon' | 'meleeWeapon'>;
  name: string;
  code: string;
  rarity: 'PADRAO' | 'TATICO' | 'ELITE';
  description: string;
  perkLabel: string;
  unlockLevel: number;
  cashPrice: number; // 0 = liberado inicialmente no nível 1
  classes?: WarfaceClassId[]; // undefined = todas as classes
  stats: {
    armorBonus?: number;
    healthBonus?: number;
    headshotReductionPct?: number;
    reloadSpeedBonusPct?: number;
    sprintSpeedBonusPct?: number;
    adsSpeedBonusPct?: number;
    fragCount?: number;
    smokeCount?: number;
  };
}

export interface ClassLoadoutConfig {
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  meleeWeapon: WeaponId;
  grenadePack: string;
  helmet: string;
  vest: string;
  gloves: string;
  boots: string;
}

export interface ScopeCatalogItem {
  id: OpticType;
  name: string;
  shortLabel: string;
  code: string;
  modelUrl: string | null;
  unlockLevel: number;
  magnification: string;
  reticleLabel: string;
  reticleColorHex: string;
  description: string;
  compatibleWeapons: WeaponId[];
}

export const SCOPE_PACK_CATALOG: Record<OpticType, ScopeCatalogItem> = {
  iron: {
    id: 'iron',
    name: 'Mira Nativa / Ferro',
    shortLabel: 'FERRO',
    code: 'IRON-STD',
    modelUrl: null,
    unlockLevel: 1,
    magnification: '1.0x',
    reticleLabel: 'Alça e Massa / Lente Nativa',
    reticleColorHex: '#94a3b8',
    description:
      'Configuração original da arma sem mira adicional acoplada no trilho superior, garantindo saque rápido e visada limpa.',
    compatibleWeapons: [
      'P50_PISTOL',
      'M1911_PISTOL',
      'SMG_45',
      'SMG_MP5',
      'SHOTGUN_12',
      'SHOTGUN_SPAS',
      'M4_CARBINE',
      'CARBINE_AR',
      'S_MILITARY',
      'AK47_RIFLE',
      'AK12_RIFLE',
      'L49_LMG',
      'SNIPER_TACTICAL',
      'SNIPER_BOLT',
      'SNIPER_AWP',
      'SNIPER_HEAVY',
      'RPG7_LAUNCHER',
    ],
  },
  red_dot: {
    id: 'red_dot',
    name: 'Aimpoint Micro Red Dot',
    shortLabel: 'RED DOT',
    code: 'AIMPOINT-T1',
    modelUrl: '/models/accessories/scopes/Scope_Aimpoint_RedDot.glb',
    unlockLevel: 1,
    magnification: '1.15x',
    reticleLabel: 'Chevron Vermelho Luminoso',
    reticleColorHex: '#ef4444',
    description:
      'Micro colimador tubular 3D (HOLO_POINT) em alumínio anodizado com retículo chevron vermelho de aquisição instantânea para CQB.',
    compatibleWeapons: [
      'P50_PISTOL',
      'M1911_PISTOL',
      'SMG_45',
      'SMG_MP5',
      'SHOTGUN_12',
      'SHOTGUN_SPAS',
      'M4_CARBINE',
      'CARBINE_AR',
      'S_MILITARY',
      'AK47_RIFLE',
      'AK12_RIFLE',
      'L49_LMG',
    ],
  },
  kolimator: {
    id: 'kolimator',
    name: 'Kolimator Kobra Reflex',
    shortLabel: 'KOLIMATOR',
    code: 'EKP-8-18',
    modelUrl: '/models/accessories/scopes/Scope_Kolimator_Reflex.glb',
    unlockLevel: 2,
    magnification: '1.2x',
    reticleLabel: 'Ponto Colimador Verde',
    reticleColorHex: '#22c55e',
    description:
      'Mira reflex tática russa 3D (Kolimator) com janela colimadora e ponto laser verde de alto contraste, perfeita para AK-47, AK-12, SMGs e escopetas.',
    compatibleWeapons: [
      'AK47_RIFLE',
      'AK12_RIFLE',
      'M4_CARBINE',
      'CARBINE_AR',
      'S_MILITARY',
      'SMG_45',
      'SMG_MP5',
      'SHOTGUN_12',
      'SHOTGUN_SPAS',
      'L49_LMG',
    ],
  },
  holo: {
    id: 'holo',
    name: 'EOTech XPS2 Holográfica',
    shortLabel: 'EOTECH',
    code: 'EOTECH-XPS2',
    modelUrl: '/models/accessories/scopes/Scope_EoTech_Holo.glb',
    unlockLevel: 4,
    magnification: '1.35x',
    reticleLabel: 'Círculo 68 MOA + Ponto 1 MOA',
    reticleColorHex: '#f87171',
    description:
      'Visor holográfico militar 3D (EoTech XPS2) com janela panorâmica retangular e retículo holográfico vermelho de 68 MOA para controle de rajada.',
    compatibleWeapons: [
      'M4_CARBINE',
      'CARBINE_AR',
      'S_MILITARY',
      'AK12_RIFLE',
      'AK47_RIFLE',
      'SMG_45',
      'SMG_MP5',
      'SHOTGUN_SPAS',
      'SHOTGUN_12',
      'L49_LMG',
    ],
  },
  lpvo: {
    id: 'lpvo',
    name: 'Luneta Tática Scope 1-4x',
    shortLabel: 'SCOPE 4X',
    code: 'LPVO-1-4X',
    modelUrl: '/models/accessories/scopes/Scope_Tactical_LPVO.glb',
    unlockLevel: 1,
    magnification: '1.5x – 6.0x',
    reticleLabel: 'Crosshair Mil-Dot Iluminado',
    reticleColorHex: '#38bdf8',
    description:
      'Luneta variável de precisão 3D (SCOPE) em montagem dupla Picatinny com tubo óptico vazado e retículo balístico iluminado para média e longa distância.',
    compatibleWeapons: [
      'SNIPER_TACTICAL',
      'SNIPER_BOLT',
      'SNIPER_AWP',
      'SNIPER_HEAVY',
      'M4_CARBINE',
      'CARBINE_AR',
      'S_MILITARY',
      'AK12_RIFLE',
      'AK47_RIFLE',
      'L49_LMG',
      'SMG_MP5',
    ],
  },
};

export interface PlayerInventoryState {
  selectedClass: WarfaceClassId;
  purchasedGearIds: string[];
  purchasedWeaponIds: WeaponId[];
  purchasedSkinIds: string[];
  equippedWeaponSkins: Partial<Record<WeaponId, string>>;
  equippedWeaponOptics: Partial<Record<WeaponId, OpticType>>;
  equippedWeaponGunsmith?: Partial<Record<WeaponId, WeaponGunsmithLoadout>>;
  classLoadouts: Record<WarfaceClassId, ClassLoadoutConfig>;
}

export interface WarfaceClassCombatMeta {
  classId: WarfaceClassId;
  allowedPrimaries: WeaponId[];
  allowedWeaponRuleLabel: string;
  defaultPrimary: WeaponId;
  passiveTitle: string;
  passiveDesc: string;
  specialSlotTitle: string;
  specialSlotDesc: string;
  baseArmor: number;
  baseHealthBonus: number;
  characterModelLabel: string;
}

export const WARFACE_CLASS_LOADOUT_META: Record<
  WarfaceClassId,
  WarfaceClassCombatMeta
> = {
  FUZILEIRO: {
    classId: 'FUZILEIRO',
    allowedPrimaries: [
      'M4_CARBINE',
      'AK12_RIFLE',
      'S_MILITARY',
      'AK47_RIFLE',
      'CARBINE_AR',
    ],
    allowedWeaponRuleLabel: 'EXCLUSIVO FUZILEIRO · APENAS RIFLES DE ASSALTO',
    defaultPrimary: 'M4_CARBINE',
    passiveTitle: 'ASSALTO VANGUARD',
    passiveDesc: 'Fuzis de Assalto 5.56/5.45/7.62 + 20% controle de rajada.',
    specialSlotTitle: 'Caixa de Munição',
    specialSlotDesc: 'Recarrega pentes de fuzil para todo o esquadrão.',
    baseArmor: 15,
    baseHealthBonus: 0,
    characterModelLabel: 'VANGUARD FUZILEIRO (.GLB)',
  },
  MEDICO: {
    classId: 'MEDICO',
    allowedPrimaries: ['SHOTGUN_12', 'SHOTGUN_SPAS'],
    allowedWeaponRuleLabel: 'EXCLUSIVO MÉDICO · APENAS ESCOPETAS 12 CURTO ALCANCE',
    defaultPrimary: 'SHOTGUN_12',
    passiveTitle: 'COMBATE CQB & SOCORRO',
    passiveDesc: 'Escopetas Calibre 12 de curto alcance + 15 HP máximo base.',
    specialSlotTitle: 'Kit Médico Tático',
    specialSlotDesc: 'Restaura PV em combate fechado após brechas CQB.',
    baseArmor: 10,
    baseHealthBonus: 15,
    characterModelLabel: 'OPERADOR MÉDICO VANGUARD (.GLB)',
  },
  ENGENHEIRO: {
    classId: 'ENGENHEIRO',
    allowedPrimaries: ['SMG_45', 'SMG_MP5', 'RPG7_LAUNCHER'],
    allowedWeaponRuleLabel: 'ENGENHEIRO · SMGs & LANÇADOR ANTITANQUE RPG-7',
    defaultPrimary: 'SMG_45',
    passiveTitle: 'ESPECIALISTA SMG & ARMAMENTO PESADO',
    passiveDesc: 'Submetralhadoras e Lançador RPG-7V + 25 Colete Balístico base.',
    specialSlotTitle: 'Kit Blindagem AP',
    specialSlotDesc: 'Reparo rápido de colete balístico e plantio C4 ágil.',
    baseArmor: 25,
    baseHealthBonus: 0,
    characterModelLabel: 'VANGUARD ENGENHEIRO (.GLB)',
  },
  FRANCO_ATIRADOR: {
    classId: 'FRANCO_ATIRADOR',
    allowedPrimaries: ['SNIPER_TACTICAL', 'SNIPER_BOLT', 'SNIPER_AWP', 'SNIPER_HEAVY'],
    allowedWeaponRuleLabel: 'EXCLUSIVO SNIPER · APENAS FUZIS SNIPER',
    defaultPrimary: 'SNIPER_AWP',
    passiveTitle: 'RECONHECIMENTO DE PRECISÃO',
    passiveDesc: 'Fuzis de Precisão longo alcance + estabilização de mira.',
    specialSlotTitle: 'Sensor Balístico',
    specialSlotDesc: 'Telemetria avançada de alcance para tiros letais.',
    baseArmor: 5,
    baseHealthBonus: 0,
    characterModelLabel: 'VANGUARD SNIPER (.GLB)',
  },
};

export interface WeaponCatalogItem {
  id: WeaponId;
  name: string;
  caliber: string;
  category: string;
  exclusiveLabel: string;
  attachmentSlots: string;
  description: string;
  firepower: number;
  accuracy: number;
  mobility: number;
  damageStat: number;
  damagePct: number;
  rangeLabel: string;
  rangePct: number;
  rpmLabel: string;
  rpmPct: number;
  aimAcc: number;
  hipAcc: number;
  clipLabel: string;
  clipPct: number;
  cashPrice: number;
}

export const WEAPON_INVENTORY_CATALOG: Record<WeaponId, WeaponCatalogItem> = {
  M4_CARBINE: {
    id: 'M4_CARBINE',
    name: 'MX16A4 / M4 TÁTICA',
    caliber: '5.56x45mm NATO',
    category: 'Fuzil de Assalto',
    exclusiveLabel: 'Fuzileiro · Rifle',
    attachmentSlots: 'Cano, Trilho, Mira',
    description:
      'Carabina de assalto modular MX16A4 com trilho quad-rail Picatinny, recuo dócil e precisão consistente a média distância.',
    firepower: 85,
    accuracy: 84,
    mobility: 78,
    damageStat: 82,
    damagePct: 72,
    rangeLabel: '75m',
    rangePct: 68,
    rpmLabel: '770',
    rpmPct: 77,
    aimAcc: 84,
    hipAcc: 64,
    clipLabel: '30 / 120',
    clipPct: 65,
    cashPrice: 0,
  },
  AK12_RIFLE: {
    id: 'AK12_RIFLE',
    name: 'AK-200 TÁTICA',
    caliber: '5.45x39mm',
    category: 'Fuzil de Assalto',
    exclusiveLabel: 'Fuzileiro · Rifle',
    attachmentSlots: 'Cano, Mira Integrada',
    description:
      'Fuzil russo AK-200 com trilho Picatinny superior completo, carregador translúcido tático e alto poder de parada.',
    firepower: 88,
    accuracy: 86,
    mobility: 74,
    damageStat: 86,
    damagePct: 78,
    rangeLabel: '85m',
    rangePct: 74,
    rpmLabel: '700',
    rpmPct: 70,
    aimAcc: 86,
    hipAcc: 60,
    clipLabel: '30 / 120',
    clipPct: 65,
    cashPrice: 0,
  },
  S_MILITARY: {
    id: 'S_MILITARY',
    name: 'SCAR-L S-MILITARY',
    caliber: '5.56x45mm NATO',
    category: 'Fuzil de Assalto',
    exclusiveLabel: 'Fuzileiro · Rifle',
    attachmentSlots: 'Cano, Trilho, Mira',
    description:
      'Rifle modular S-Military 5.56x45mm com trilho superior completo, coronha ajustável e visor holográfico tático.',
    firepower: 87,
    accuracy: 87,
    mobility: 79,
    damageStat: 84,
    damagePct: 75,
    rangeLabel: '80m',
    rangePct: 72,
    rpmLabel: '750',
    rpmPct: 75,
    aimAcc: 87,
    hipAcc: 65,
    clipLabel: '30 / 120',
    clipPct: 65,
    cashPrice: 0,
  },
  AK47_RIFLE: {
    id: 'AK47_RIFLE',
    name: 'AK-47 COMANDO',
    caliber: '7.62x39mm Soviet',
    category: 'Fuzil de Assalto',
    exclusiveLabel: 'Fuzileiro · Rifle',
    attachmentSlots: 'Cano, Trilho, Mira',
    description:
      'Plataforma clássica em calibre 7.62mm com altíssimo dano por projétil e penetração em blindagens leves.',
    firepower: 96,
    accuracy: 72,
    mobility: 70,
    damageStat: 94,
    damagePct: 86,
    rangeLabel: '80m',
    rangePct: 70,
    rpmLabel: '630',
    rpmPct: 63,
    aimAcc: 74,
    hipAcc: 54,
    clipLabel: '30 / 120',
    clipPct: 65,
    cashPrice: 0,
  },
  CARBINE_AR: {
    id: 'CARBINE_AR',
    name: 'HK416 CARABINA',
    caliber: '5.56x45mm NATO',
    category: 'Rifle Tático',
    exclusiveLabel: 'Fuzileiro · Rifle',
    attachmentSlots: 'Cano, Trilho, Mira',
    description:
      'Rifle de pistão a gás focado em engajamentos de precisão com estabilidade superior em rajadas curtas.',
    firepower: 82,
    accuracy: 88,
    mobility: 84,
    damageStat: 80,
    damagePct: 70,
    rangeLabel: '85m',
    rangePct: 75,
    rpmLabel: '770',
    rpmPct: 77,
    aimAcc: 88,
    hipAcc: 68,
    clipLabel: '30 / 120',
    clipPct: 65,
    cashPrice: 950,
  },
  SHOTGUN_12: {
    id: 'SHOTGUN_12',
    name: 'DRAKE-12 BREACHER',
    caliber: 'Calibre 12 Buckshot',
    category: 'Escopeta 12 Curto Alcance',
    exclusiveLabel: 'Médico · Calibre 12',
    attachmentSlots: 'Cano, Mira Ghost-Ring',
    description:
      'Escopeta tática Drake-12 Pump-Action 12GA de curto alcance. Dispara 8 bagos de chumbo 00-Buckshot letais até 12m.',
    firepower: 100,
    accuracy: 62,
    mobility: 84,
    damageStat: 680,
    damagePct: 98,
    rangeLabel: '12m',
    rangePct: 26,
    rpmLabel: '88',
    rpmPct: 24,
    aimAcc: 64,
    hipAcc: 52,
    clipLabel: '6 / 24',
    clipPct: 28,
    cashPrice: 0,
  },
  SHOTGUN_SPAS: {
    id: 'SHOTGUN_SPAS',
    name: 'SPAS-12 TÁTICA 12GA',
    caliber: 'Calibre 12 Magnum',
    category: 'Escopeta 12 Curto Alcance',
    exclusiveLabel: 'Médico · Calibre 12',
    attachmentSlots: 'Cano, Trilho Superior',
    description:
      'Escopeta semiautomática de combate aproximado com tubo estendido para 8 cartuchos e cadência rápida em corredores.',
    firepower: 96,
    accuracy: 64,
    mobility: 80,
    damageStat: 640,
    damagePct: 93,
    rangeLabel: '14m',
    rangePct: 30,
    rpmLabel: '188',
    rpmPct: 45,
    aimAcc: 66,
    hipAcc: 55,
    clipLabel: '8 / 32',
    clipPct: 35,
    cashPrice: 1100,
  },
  SMG_45: {
    id: 'SMG_45',
    name: 'V18 SPECTRE SILENCIADA',
    caliber: '9x19mm Subsonic',
    category: 'SMG Engenheiro Silenciada',
    exclusiveLabel: 'Engenheiro · SMG V18',
    attachmentSlots: 'Supressor Integral, Mira Holo',
    description:
      'Nova submetralhadora tática V18 de Engenheiro com silenciador acústico integral, mira holográfica embutida e cadência de 900 RPM para domínio em CQB.',
    firepower: 84,
    accuracy: 86,
    mobility: 94,
    damageStat: 74,
    damagePct: 64,
    rangeLabel: '42m',
    rangePct: 50,
    rpmLabel: '900',
    rpmPct: 94,
    aimAcc: 86,
    hipAcc: 88,
    clipLabel: '32 / 128',
    clipPct: 70,
    cashPrice: 0,
  },
  SMG_MP5: {
    id: 'SMG_MP5',
    name: 'MPS5 TÁTICA 9MM',
    caliber: '9x19mm Parabellum',
    category: 'Submetralhadora SMG',
    exclusiveLabel: 'Engenheiro · SMG',
    attachmentSlots: 'Cano, Trilho, Mira',
    description:
      'Submetralhadora MPS5 de forças especiais com carregador translúcido, excelente controle de recuo e precisão móvel.',
    firepower: 74,
    accuracy: 85,
    mobility: 92,
    damageStat: 65,
    damagePct: 55,
    rangeLabel: '42m',
    rangePct: 48,
    rpmLabel: '830',
    rpmPct: 86,
    aimAcc: 84,
    hipAcc: 82,
    clipLabel: '30 / 120',
    clipPct: 65,
    cashPrice: 950,
  },
  RPG7_LAUNCHER: {
    id: 'RPG7_LAUNCHER',
    name: 'RPG-7V LANÇADOR',
    caliber: 'PG-7V HEAT 85mm',
    category: 'Lançador Pesado',
    exclusiveLabel: 'Engenheiro · Explosivo',
    attachmentSlots: 'Ogiva PG-7V, Mira Óptica',
    description:
      'Lançador antitanque portátil RPG-7V com ogiva explosiva de alto impacto em área e destruição instantânea.',
    firepower: 100,
    accuracy: 78,
    mobility: 52,
    damageStat: 220,
    damagePct: 100,
    rangeLabel: '120m',
    rangePct: 90,
    rpmLabel: '24',
    rpmPct: 12,
    aimAcc: 80,
    hipAcc: 48,
    clipLabel: '1 / 4',
    clipPct: 15,
    cashPrice: 1200,
  },
  L49_LMG: {
    id: 'L49_LMG',
    name: 'LMG PESADA 100R',
    caliber: '5.56x45mm SAW',
    category: 'Metralhadora Leve',
    exclusiveLabel: 'Arsenal Pesado',
    attachmentSlots: 'Cano, Mira',
    description:
      'Metralhadora leve com tambor de 100 munições para fogo de supressão contínuo.',
    firepower: 92,
    accuracy: 74,
    mobility: 55,
    damageStat: 84,
    damagePct: 75,
    rangeLabel: '85m',
    rangePct: 74,
    rpmLabel: '850',
    rpmPct: 85,
    aimAcc: 72,
    hipAcc: 46,
    clipLabel: '100 / 300',
    clipPct: 100,
    cashPrice: 1800,
  },
  SNIPER_TACTICAL: {
    id: 'SNIPER_TACTICAL',
    name: 'MK14 EBR TÁTICA',
    caliber: '7.62x51mm NATO',
    category: 'Fuzil Sniper DMR',
    exclusiveLabel: 'Sniper · Precisão',
    attachmentSlots: 'Cano, Mira Ferro / LPVO',
    description:
      'Fuzil de precisão MK14 Enhanced Battle Rifle 7.62mm com chassi tático, mira de ferro aberta ou luneta LPVO.',
    firepower: 95,
    accuracy: 96,
    mobility: 68,
    damageStat: 240,
    damagePct: 94,
    rangeLabel: '135m',
    rangePct: 92,
    rpmLabel: '55',
    rpmPct: 22,
    aimAcc: 98,
    hipAcc: 38,
    clipLabel: '10 / 40',
    clipPct: 42,
    cashPrice: 0,
  },
  SNIPER_BOLT: {
    id: 'SNIPER_BOLT',
    name: 'KAR98K PRECISÃO',
    caliber: '7.92x57mm / .338',
    category: 'Fuzil Sniper Ferrolho',
    exclusiveLabel: 'Sniper · Ferrolho',
    attachmentSlots: 'Cano, Ferro / Luneta LPVO',
    description:
      'Fuzil de ferrolho Kar98k com coronha em nogueira, mira metálica aberta ou luneta LPVO de alto alcance.',
    firepower: 100,
    accuracy: 99,
    mobility: 60,
    damageStat: 340,
    damagePct: 100,
    rangeLabel: '150m',
    rangePct: 100,
    rpmLabel: '45',
    rpmPct: 18,
    aimAcc: 100,
    hipAcc: 32,
    clipLabel: '5 / 20',
    clipPct: 25,
    cashPrice: 1400,
  },
  SNIPER_AWP: {
    id: 'SNIPER_AWP',
    name: 'AWP-M .338 LUNETA',
    caliber: '.338 Lapua Magnum',
    category: 'Fuzil Sniper Ferrolho',
    exclusiveLabel: 'Sniper · Luneta 6x',
    attachmentSlots: 'Luneta Óptica Nativa, Cano',
    description:
      'Fuzil de precisão AWP-M calibre .338 Lapua com luneta tática de longo alcance embutida e abate letal em um disparo.',
    firepower: 100,
    accuracy: 100,
    mobility: 58,
    damageStat: 360,
    damagePct: 100,
    rangeLabel: '180m',
    rangePct: 100,
    rpmLabel: '42',
    rpmPct: 16,
    aimAcc: 100,
    hipAcc: 28,
    clipLabel: '5 / 20',
    clipPct: 25,
    cashPrice: 0,
  },
  SNIPER_HEAVY: {
    id: 'SNIPER_HEAVY',
    name: 'M200 INTERVENTION',
    caliber: '.408 CheyTac',
    category: 'Fuzil Sniper Pesado',
    exclusiveLabel: 'Sniper · Anti-Material',
    attachmentSlots: 'Luneta Balística Nativa',
    description:
      'Sniper pesada de longo alcance calibre .408 CheyTac com luneta óptica integrada de altíssima penetração de blindagem.',
    firepower: 100,
    accuracy: 100,
    mobility: 52,
    damageStat: 410,
    damagePct: 100,
    rangeLabel: '200m',
    rangePct: 100,
    rpmLabel: '38',
    rpmPct: 14,
    aimAcc: 100,
    hipAcc: 24,
    clipLabel: '5 / 20',
    clipPct: 25,
    cashPrice: 1900,
  },
  P50_PISTOL: {
    id: 'P50_PISTOL',
    name: 'DESERT EAGLE .50AE',
    caliber: '.50 Action Express',
    category: 'Pistola Secundária',
    exclusiveLabel: 'Todas as Classes',
    attachmentSlots: 'Cano, Red Dot, Laser',
    description:
      'Pistola pesada DGL50 calibre .50 AE cromada com altíssimo impacto por disparo.',
    firepower: 76,
    accuracy: 80,
    mobility: 92,
    damageStat: 74,
    damagePct: 62,
    rangeLabel: '30m',
    rangePct: 40,
    rpmLabel: '280',
    rpmPct: 36,
    aimAcc: 82,
    hipAcc: 70,
    clipLabel: '7 / 35',
    clipPct: 36,
    cashPrice: 0,
  },
  M1911_PISTOL: {
    id: 'M1911_PISTOL',
    name: 'COLT M1911 .45',
    caliber: '.45 ACP',
    category: 'Pistola Secundária',
    exclusiveLabel: 'Todas as Classes',
    attachmentSlots: 'Cano, Red Dot, Laser',
    description:
      'Pistola clássica Colt M1911 em aço oxidado com talas de madeira, recuo equilibrado e saque instantâneo.',
    firepower: 70,
    accuracy: 85,
    mobility: 96,
    damageStat: 64,
    damagePct: 54,
    rangeLabel: '26m',
    rangePct: 36,
    rpmLabel: '360',
    rpmPct: 45,
    aimAcc: 85,
    hipAcc: 78,
    clipLabel: '8 / 32',
    clipPct: 40,
    cashPrice: 0,
  },
  KNIFE_TACTICAL: {
    id: 'KNIFE_TACTICAL',
    name: 'FACA TÁTICA COMBATE',
    caliber: 'Aço Carbono',
    category: 'Corpo a Corpo',
    exclusiveLabel: 'Todas as Classes',
    attachmentSlots: 'Lâmina Fixa',
    description:
      'Lâmina tática silenciosa para abates imediatos em alcance corpo a corpo.',
    firepower: 90,
    accuracy: 100,
    mobility: 100,
    damageStat: 130,
    damagePct: 88,
    rangeLabel: '2.4m',
    rangePct: 12,
    rpmLabel: '115',
    rpmPct: 32,
    aimAcc: 100,
    hipAcc: 100,
    clipLabel: '∞',
    clipPct: 100,
    cashPrice: 0,
  },
};

export const GEAR_INVENTORY_CATALOG: GearItemDefinition[] = [
  // CAPACETES
  {
    id: 'helm_vanguard_std',
    slot: 'helmet',
    name: 'Capacete Vanguard ACH',
    code: 'HELM-01',
    rarity: 'PADRAO',
    description: 'Capacete balístico leve emitido pelo comando Vanguard.',
    perkLabel: '+10% Proteção Cabeça',
    unlockLevel: 1,
    cashPrice: 0,
    stats: { headshotReductionPct: 10 },
  },
  {
    id: 'helm_ops_core',
    slot: 'helmet',
    name: 'Capacete Ops-Core Carbon',
    code: 'HELM-02',
    rarity: 'TATICO',
    description: 'Casco composto com suporte NVG e absorção lateral.',
    perkLabel: '+20% Proteção Cabeça · +5% ADS',
    unlockLevel: 3,
    cashPrice: 650,
    stats: { headshotReductionPct: 20, adsSpeedBonusPct: 5 },
  },
  {
    id: 'helm_warlord',
    slot: 'helmet',
    name: 'Capacete Warlord Blindado',
    code: 'HELM-03',
    rarity: 'ELITE',
    description: 'Proteção craniana de titânio anti-calibre pesado.',
    perkLabel: '+35% Proteção Cabeça · +10 AP',
    unlockLevel: 8,
    cashPrice: 1450,
    stats: { headshotReductionPct: 35, armorBonus: 10 },
  },

  // COLETES
  {
    id: 'vest_vanguard_std',
    slot: 'vest',
    name: 'Colete Vanguard Plate Carrier',
    code: 'VEST-01',
    rarity: 'PADRAO',
    description: 'Placa frontal leve nível IIIA para mobilidade tática.',
    perkLabel: '+15 Colete Balístico',
    unlockLevel: 1,
    cashPrice: 0,
    stats: { armorBonus: 15 },
  },
  {
    id: 'vest_corvus_heavy',
    slot: 'vest',
    name: 'Colete Corvus Kevlar',
    code: 'VEST-02',
    rarity: 'TATICO',
    description: 'Blindagem reforçada multi-camada com bolsos modulares.',
    perkLabel: '+30 Colete Balístico',
    unlockLevel: 3,
    cashPrice: 800,
    stats: { armorBonus: 30 },
  },
  {
    id: 'vest_warlord_titan',
    slot: 'vest',
    name: 'Colete Warlord Titan IV',
    code: 'VEST-03',
    rarity: 'ELITE',
    description: 'Blindagem de assalto pesado usada em operaçõesRanked.',
    perkLabel: '+45 Colete · +10 HP Máx',
    unlockLevel: 9,
    cashPrice: 1850,
    stats: { armorBonus: 45, healthBonus: 10 },
  },

  // LUVAS
  {
    id: 'gloves_oakley_std',
    slot: 'gloves',
    name: 'Luvas Táticas Vanguard',
    code: 'GLV-01',
    rarity: 'PADRAO',
    description: 'Aderência antiderrapante para manejo seguro de fuzil.',
    perkLabel: '+5% Troca de Carregador',
    unlockLevel: 1,
    cashPrice: 0,
    stats: { reloadSpeedBonusPct: 5 },
  },
  {
    id: 'gloves_kevlar_pro',
    slot: 'gloves',
    name: 'Luvas Kevlar Quick-Mag',
    code: 'GLV-02',
    rarity: 'TATICO',
    description: 'Costura anatômica projetada para recargas sob pressão.',
    perkLabel: '+15% Vel. Recarga',
    unlockLevel: 4,
    cashPrice: 550,
    stats: { reloadSpeedBonusPct: 15 },
  },
  {
    id: 'gloves_carbon_elite',
    slot: 'gloves',
    name: 'Luvas Carbono S.F.',
    code: 'GLV-03',
    rarity: 'ELITE',
    description: 'Proteção articulada e controle fino de gatilho e mira.',
    perkLabel: '+20% Vel. Recarga · +12% ADS',
    unlockLevel: 10,
    cashPrice: 1200,
    stats: { reloadSpeedBonusPct: 20, adsSpeedBonusPct: 12 },
  },

  // BOTAS
  {
    id: 'boots_combat_std',
    slot: 'boots',
    name: 'Coturno Militar Vanguard',
    code: 'BOOT-01',
    rarity: 'PADRAO',
    description: 'Sola de tração mista para asfalto e terreno urbano.',
    perkLabel: '+3% Sprint',
    unlockLevel: 1,
    cashPrice: 0,
    stats: { sprintSpeedBonusPct: 3 },
  },
  {
    id: 'boots_light_sprint',
    slot: 'boots',
    name: 'Botas Corrida Leve',
    code: 'BOOT-02',
    rarity: 'TATICO',
    description: 'Entressola amortecida para rotação rápida entre bomb sites.',
    perkLabel: '+8% Velocidade Sprint',
    unlockLevel: 4,
    cashPrice: 600,
    stats: { sprintSpeedBonusPct: 8 },
  },
  {
    id: 'boots_atlas_stealth',
    slot: 'boots',
    name: 'Botas Atlas Recon',
    code: 'BOOT-03',
    rarity: 'ELITE',
    description: 'Calçado de infiltração leve com máxima resposta de arrancada.',
    perkLabel: '+12% Velocidade Sprint',
    unlockLevel: 11,
    cashPrice: 1350,
    stats: { sprintSpeedBonusPct: 12 },
  },

  // GRANADAS
  {
    id: 'nade_std_3_3',
    slot: 'grenadePack',
    name: 'Kit Padrão M67 + M18',
    code: 'ORD-01',
    rarity: 'PADRAO',
    description: 'Equilíbrio entre dano explosivo e cobertura tática de fumaça.',
    perkLabel: '3x Frag M67 · 3x Fumaça M18',
    unlockLevel: 1,
    cashPrice: 0,
    stats: { fragCount: 3, smokeCount: 3 },
  },
  {
    id: 'nade_breacher_4_2',
    slot: 'grenadePack',
    name: 'Kit Breacher Explosivo',
    code: 'ORD-02',
    rarity: 'TATICO',
    description: 'Prioriza granadas de fragmentação para limpar cantos e bombs.',
    perkLabel: '4x Frag M67 · 2x Fumaça M18',
    unlockLevel: 3,
    cashPrice: 500,
    stats: { fragCount: 4, smokeCount: 2 },
  },
  {
    id: 'nade_smoke_2_4',
    slot: 'grenadePack',
    name: 'Kit Cortina Tática',
    code: 'ORD-03',
    rarity: 'TATICO',
    description: 'Foco em bloqueio de visão de Snipers com fumaça densa.',
    perkLabel: '2x Frag M67 · 4x Fumaça M18',
    unlockLevel: 3,
    cashPrice: 500,
    stats: { fragCount: 2, smokeCount: 4 },
  },
];

const LOADOUT_STORAGE_KEY = 'kinetic_warface_inventory_v1';

function createDefaultInventory(): PlayerInventoryState {
  return {
    selectedClass: 'FUZILEIRO',
    purchasedGearIds: [
      'helm_vanguard_std',
      'vest_vanguard_std',
      'gloves_oakley_std',
      'boots_combat_std',
      'nade_std_3_3',
    ],
    purchasedWeaponIds: [
      'M4_CARBINE',
      'AK12_RIFLE',
      'S_MILITARY',
      'AK47_RIFLE',
      'SHOTGUN_12',
      'SMG_45',
      'SNIPER_TACTICAL',
      'SNIPER_AWP',
      'P50_PISTOL',
      'M1911_PISTOL',
      'KNIFE_TACTICAL',
    ],
    purchasedSkinIds: [
      'default',
      'auto_shotgun_02',
      'auto_shotgun_03',
      'auto_shotgun_04',
      'auto_shotgun_05',
      'camo_desert',
      'camo_woodland',
      'camo_urban_digital',
    ],
    equippedWeaponSkins: {},
    equippedWeaponOptics: {
      M4_CARBINE: 'red_dot',
      CARBINE_AR: 'red_dot',
      AK12_RIFLE: 'red_dot',
      S_MILITARY: 'iron',
      AK47_RIFLE: 'iron',
      SMG_45: 'red_dot',
      SMG_MP5: 'red_dot',
      RPG7_LAUNCHER: 'iron',
      SHOTGUN_12: 'iron',
      SHOTGUN_SPAS: 'red_dot',
      L49_LMG: 'red_dot',
      SNIPER_TACTICAL: 'iron',
      SNIPER_BOLT: 'iron',
      SNIPER_AWP: 'lpvo',
      SNIPER_HEAVY: 'lpvo',
      P50_PISTOL: 'iron',
      M1911_PISTOL: 'iron',
    },
    equippedWeaponGunsmith: {},
    classLoadouts: {
      FUZILEIRO: {
        primaryWeapon: 'M4_CARBINE',
        secondaryWeapon: 'P50_PISTOL',
        meleeWeapon: 'KNIFE_TACTICAL',
        grenadePack: 'nade_std_3_3',
        helmet: 'helm_vanguard_std',
        vest: 'vest_vanguard_std',
        gloves: 'gloves_oakley_std',
        boots: 'boots_combat_std',
      },
      MEDICO: {
        primaryWeapon: 'SHOTGUN_12',
        secondaryWeapon: 'P50_PISTOL',
        meleeWeapon: 'KNIFE_TACTICAL',
        grenadePack: 'nade_smoke_2_4',
        helmet: 'helm_vanguard_std',
        vest: 'vest_vanguard_std',
        gloves: 'gloves_oakley_std',
        boots: 'boots_combat_std',
      },
      ENGENHEIRO: {
        primaryWeapon: 'SMG_45',
        secondaryWeapon: 'P50_PISTOL',
        meleeWeapon: 'KNIFE_TACTICAL',
        grenadePack: 'nade_std_3_3',
        helmet: 'helm_vanguard_std',
        vest: 'vest_vanguard_std',
        gloves: 'gloves_oakley_std',
        boots: 'boots_combat_std',
      },
      FRANCO_ATIRADOR: {
        primaryWeapon: 'SNIPER_TACTICAL',
        secondaryWeapon: 'P50_PISTOL',
        meleeWeapon: 'KNIFE_TACTICAL',
        grenadePack: 'nade_smoke_2_4',
        helmet: 'helm_vanguard_std',
        vest: 'vest_vanguard_std',
        gloves: 'gloves_oakley_std',
        boots: 'boots_combat_std',
      },
    },
  };
}

function loadInventoryState(): PlayerInventoryState {
  const def = createDefaultInventory();
  try {
    const raw = localStorage.getItem(LOADOUT_STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<PlayerInventoryState>;
    const selectedClass: WarfaceClassId =
      parsed.selectedClass && WARFACE_CLASS_LOADOUT_META[parsed.selectedClass]
        ? parsed.selectedClass
        : def.selectedClass;
    const classLoadouts = { ...def.classLoadouts };
    (['FUZILEIRO', 'MEDICO', 'ENGENHEIRO', 'FRANCO_ATIRADOR'] as WarfaceClassId[]).forEach(
      (cId) => {
        if (parsed.classLoadouts?.[cId]) {
          const merged = {
            ...def.classLoadouts[cId],
            ...parsed.classLoadouts[cId],
          };
          // Enforce strict Warface class weapon exclusivity on any legacy saved state
          if (
            !WARFACE_CLASS_LOADOUT_META[cId].allowedPrimaries.includes(
              merged.primaryWeapon
            )
          ) {
            merged.primaryWeapon = WARFACE_CLASS_LOADOUT_META[cId].defaultPrimary;
          }
          classLoadouts[cId] = merged;
        }
      }
    );
    return {
      selectedClass,
      purchasedGearIds: Array.from(
        new Set([...def.purchasedGearIds, ...(parsed.purchasedGearIds || [])])
      ),
      purchasedWeaponIds: Array.from(
        new Set([...def.purchasedWeaponIds, ...(parsed.purchasedWeaponIds || [])])
      ) as WeaponId[],
      purchasedSkinIds: Array.from(
        new Set([...def.purchasedSkinIds, ...(parsed.purchasedSkinIds || [])])
      ),
      equippedWeaponSkins: { ...(parsed.equippedWeaponSkins || {}) },
      equippedWeaponOptics: {
        ...def.equippedWeaponOptics,
        ...(parsed.equippedWeaponOptics || {}),
      },
      equippedWeaponGunsmith: { ...(parsed.equippedWeaponGunsmith || {}) },
      classLoadouts,
    };
  } catch {
    return def;
  }
}

export interface CloudLoadoutSnapshot {
  activeWeapon: WeaponId;
  purchasedWeaponIds?: WeaponId[];
  purchasedSkinIds?: string[];
  purchasedGearIds?: string[];
  selectedClass?: WarfaceClassId;
  classLoadouts?: Partial<Record<WarfaceClassId, ClassLoadoutConfig>>;
  equippedWeaponOptics: Partial<Record<WeaponId, OpticType>>;
  equippedWeaponSkins: Partial<Record<WeaponId, string>>;
  equippedWeaponGunsmith: Partial<Record<WeaponId, WeaponGunsmithLoadout>>;
}

let currentInventory: PlayerInventoryState = loadInventoryState();
const gunsmithModCache = new Map<WeaponId, GunsmithCombatModifiers>();
const listeners = new Set<(state: PlayerInventoryState) => void>();
let isApplyingRemoteLoadout = false;
let cloudLoadoutHook: ((snapshot: CloudLoadoutSnapshot) => void) | null = null;

export function registerCloudLoadoutHook(
  cb: (snapshot: CloudLoadoutSnapshot) => void
): void {
  cloudLoadoutHook = cb;
}

export function getCloudLoadoutSnapshot(): CloudLoadoutSnapshot {
  const optics: Partial<Record<WeaponId, OpticType>> = {};
  const skins: Partial<Record<WeaponId, string>> = {};
  const gunsmith: Partial<Record<WeaponId, WeaponGunsmithLoadout>> = {};
  const purchasedWeaponIds: WeaponId[] = currentInventory.purchasedWeaponIds.filter(
    (w) => w in WEAPON_INVENTORY_CATALOG
  );
  const purchasedSkinSet = new Set<string>(
    (currentInventory.purchasedSkinIds || []).filter(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 48
    )
  );
  for (const equippedSkin of Object.values(currentInventory.equippedWeaponSkins || {})) {
    if (typeof equippedSkin === 'string' && equippedSkin.length > 0 && equippedSkin.length <= 48) {
      purchasedSkinSet.add(equippedSkin);
    }
  }
  const purchasedSkinIds = Array.from(purchasedSkinSet).slice(0, 60);

  const validGearIds = new Set(GEAR_INVENTORY_CATALOG.map((g) => g.id));
  const purchasedGearIds = Array.from(
    new Set(
      (currentInventory.purchasedGearIds || []).filter(
        (id) => typeof id === 'string' && validGearIds.has(id)
      )
    )
  ).slice(0, 40);

  const activeClassLoadout =
    currentInventory.classLoadouts[currentInventory.selectedClass] ||
    currentInventory.classLoadouts.FUZILEIRO;
  const activeWeapon: WeaponId = activeClassLoadout.primaryWeapon || 'M4_CARBINE';

  const classLoadouts: Partial<Record<WarfaceClassId, ClassLoadoutConfig>> = {
    FUZILEIRO: { ...currentInventory.classLoadouts.FUZILEIRO },
    MEDICO: { ...currentInventory.classLoadouts.MEDICO },
    ENGENHEIRO: { ...currentInventory.classLoadouts.ENGENHEIRO },
    FRANCO_ATIRADOR: { ...currentInventory.classLoadouts.FRANCO_ATIRADOR },
  };

  let optCount = 0;
  for (const [k, v] of Object.entries(currentInventory.equippedWeaponOptics || {})) {
    if (optCount >= 25) break;
    if (v && k in WEAPON_INVENTORY_CATALOG && v in SCOPE_PACK_CATALOG) {
      optics[k as WeaponId] = v;
      optCount++;
    }
  }

  let skinCount = 0;
  for (const [k, v] of Object.entries(currentInventory.equippedWeaponSkins || {})) {
    if (skinCount >= 25) break;
    if (typeof v === 'string' && v.length > 0 && k in WEAPON_INVENTORY_CATALOG) {
      skins[k as WeaponId] = v.slice(0, 48);
      skinCount++;
    }
  }

  let gunCount = 0;
  for (const [k, v] of Object.entries(currentInventory.equippedWeaponGunsmith || {})) {
    if (gunCount >= 25) break;
    if (v && typeof v === 'object' && k in WEAPON_INVENTORY_CATALOG) {
      const normalized = normalizeGunsmithLoadout(v);
      gunsmith[k as WeaponId] = {
        barrel: normalized.barrel,
        underbarrel: normalized.underbarrel,
        magazine: normalized.magazine,
        stock: normalized.stock,
      };
      gunCount++;
    }
  }

  return {
    activeWeapon,
    purchasedWeaponIds,
    purchasedSkinIds,
    purchasedGearIds,
    selectedClass: currentInventory.selectedClass,
    classLoadouts,
    equippedWeaponOptics: optics,
    equippedWeaponSkins: skins,
    equippedWeaponGunsmith: gunsmith,
  };
}

export function applyCloudLoadoutSnapshot(
  snapshot?:
    | (Partial<CloudLoadoutSnapshot> & {
        unlockedWeapons?: WeaponId[];
        unlockedWeaponSkins?: string[];
        unlockedGearIds?: string[];
      })
    | null
): void {
  if (!snapshot) return;
  let changed = false;

  const remoteWeapons = [
    ...(Array.isArray(snapshot.purchasedWeaponIds) ? snapshot.purchasedWeaponIds : []),
    ...(Array.isArray(snapshot.unlockedWeapons) ? snapshot.unlockedWeapons : []),
  ];
  if (remoteWeapons.length > 0) {
    const mergedSet = new Set<WeaponId>(currentInventory.purchasedWeaponIds);
    for (const w of remoteWeapons) {
      if (w in WEAPON_INVENTORY_CATALOG && !mergedSet.has(w)) {
        mergedSet.add(w);
        changed = true;
      }
    }
    if (mergedSet.size !== currentInventory.purchasedWeaponIds.length) {
      currentInventory.purchasedWeaponIds = Array.from(mergedSet);
    }
  }

  const remoteSkins = [
    ...(Array.isArray(snapshot.purchasedSkinIds) ? snapshot.purchasedSkinIds : []),
    ...(Array.isArray(snapshot.unlockedWeaponSkins) ? snapshot.unlockedWeaponSkins : []),
    ...(snapshot.equippedWeaponSkins && typeof snapshot.equippedWeaponSkins === 'object'
      ? Object.values(snapshot.equippedWeaponSkins).filter(
          (v): v is string => typeof v === 'string' && v.length > 0
        )
      : []),
  ];
  if (remoteSkins.length > 0) {
    const mergedSkinsSet = new Set<string>(currentInventory.purchasedSkinIds);
    for (const s of remoteSkins) {
      if (typeof s === 'string' && s.length > 0 && s.length <= 48 && !mergedSkinsSet.has(s)) {
        mergedSkinsSet.add(s);
        changed = true;
      }
    }
    if (mergedSkinsSet.size !== currentInventory.purchasedSkinIds.length) {
      currentInventory.purchasedSkinIds = Array.from(mergedSkinsSet);
    }
  }

  const validGearIds = new Set(GEAR_INVENTORY_CATALOG.map((g) => g.id));
  const remoteGear = [
    ...(Array.isArray(snapshot.purchasedGearIds) ? snapshot.purchasedGearIds : []),
    ...(Array.isArray(snapshot.unlockedGearIds) ? snapshot.unlockedGearIds : []),
  ];
  if (remoteGear.length > 0) {
    const mergedGearSet = new Set<string>(currentInventory.purchasedGearIds);
    for (const g of remoteGear) {
      if (typeof g === 'string' && validGearIds.has(g) && !mergedGearSet.has(g)) {
        mergedGearSet.add(g);
        changed = true;
      }
    }
    if (mergedGearSet.size !== currentInventory.purchasedGearIds.length) {
      currentInventory.purchasedGearIds = Array.from(mergedGearSet);
    }
  }

  if (
    snapshot.selectedClass &&
    snapshot.selectedClass in WARFACE_CLASS_LOADOUT_META &&
    currentInventory.selectedClass !== snapshot.selectedClass
  ) {
    currentInventory.selectedClass = snapshot.selectedClass;
    changed = true;
  }

  if (snapshot.classLoadouts && typeof snapshot.classLoadouts === 'object') {
    const nextClassLoadouts = { ...currentInventory.classLoadouts };
    (['FUZILEIRO', 'MEDICO', 'ENGENHEIRO', 'FRANCO_ATIRADOR'] as WarfaceClassId[]).forEach(
      (cId) => {
        const remoteCfg = snapshot.classLoadouts?.[cId];
        if (!remoteCfg || typeof remoteCfg !== 'object') return;
        const prev = nextClassLoadouts[cId];
        const merged: ClassLoadoutConfig = { ...prev };
        if (
          remoteCfg.primaryWeapon &&
          WARFACE_CLASS_LOADOUT_META[cId].allowedPrimaries.includes(remoteCfg.primaryWeapon)
        ) {
          merged.primaryWeapon = remoteCfg.primaryWeapon;
        }
        if (remoteCfg.secondaryWeapon && remoteCfg.secondaryWeapon in WEAPON_INVENTORY_CATALOG) {
          merged.secondaryWeapon = remoteCfg.secondaryWeapon;
        }
        if (remoteCfg.meleeWeapon && remoteCfg.meleeWeapon in WEAPON_INVENTORY_CATALOG) {
          merged.meleeWeapon = remoteCfg.meleeWeapon;
        }
        if (remoteCfg.grenadePack && validGearIds.has(remoteCfg.grenadePack)) {
          merged.grenadePack = remoteCfg.grenadePack;
        }
        if (remoteCfg.helmet && validGearIds.has(remoteCfg.helmet)) {
          merged.helmet = remoteCfg.helmet;
        }
        if (remoteCfg.vest && validGearIds.has(remoteCfg.vest)) {
          merged.vest = remoteCfg.vest;
        }
        if (remoteCfg.gloves && validGearIds.has(remoteCfg.gloves)) {
          merged.gloves = remoteCfg.gloves;
        }
        if (remoteCfg.boots && validGearIds.has(remoteCfg.boots)) {
          merged.boots = remoteCfg.boots;
        }
        if (
          prev.primaryWeapon !== merged.primaryWeapon ||
          prev.secondaryWeapon !== merged.secondaryWeapon ||
          prev.meleeWeapon !== merged.meleeWeapon ||
          prev.grenadePack !== merged.grenadePack ||
          prev.helmet !== merged.helmet ||
          prev.vest !== merged.vest ||
          prev.gloves !== merged.gloves ||
          prev.boots !== merged.boots
        ) {
          nextClassLoadouts[cId] = merged;
          changed = true;
        }
      }
    );
    currentInventory.classLoadouts = nextClassLoadouts;
  } else if (
    snapshot.activeWeapon &&
    snapshot.activeWeapon in WEAPON_INVENTORY_CATALOG &&
    snapshot.activeWeapon !== 'P50_PISTOL' &&
    snapshot.activeWeapon !== 'M1911_PISTOL' &&
    snapshot.activeWeapon !== 'KNIFE_TACTICAL'
  ) {
    const inferredClass = inferWarfaceClassForWeapon(snapshot.activeWeapon);
    if (currentInventory.classLoadouts[inferredClass].primaryWeapon !== snapshot.activeWeapon) {
      currentInventory.classLoadouts[inferredClass] = {
        ...currentInventory.classLoadouts[inferredClass],
        primaryWeapon: snapshot.activeWeapon,
      };
      changed = true;
    }
  }

  if (snapshot.equippedWeaponOptics && typeof snapshot.equippedWeaponOptics === 'object') {
    const nextOptics = { ...currentInventory.equippedWeaponOptics };
    for (const [k, v] of Object.entries(snapshot.equippedWeaponOptics)) {
      if (k in WEAPON_INVENTORY_CATALOG && v && v in SCOPE_PACK_CATALOG) {
        const wId = k as WeaponId;
        if (nextOptics[wId] !== v) {
          nextOptics[wId] = v;
          changed = true;
        }
      }
    }
    currentInventory.equippedWeaponOptics = nextOptics;
  }

  if (snapshot.equippedWeaponSkins && typeof snapshot.equippedWeaponSkins === 'object') {
    const nextSkins = { ...currentInventory.equippedWeaponSkins };
    for (const [k, v] of Object.entries(snapshot.equippedWeaponSkins)) {
      if (k in WEAPON_INVENTORY_CATALOG && typeof v === 'string' && v.length > 0) {
        const wId = k as WeaponId;
        if (nextSkins[wId] !== v) {
          nextSkins[wId] = v.slice(0, 48);
          changed = true;
        }
      }
    }
    currentInventory.equippedWeaponSkins = nextSkins;
  }

  if (snapshot.equippedWeaponGunsmith && typeof snapshot.equippedWeaponGunsmith === 'object') {
    const nextGunsmith = { ...(currentInventory.equippedWeaponGunsmith || {}) };
    for (const [k, v] of Object.entries(snapshot.equippedWeaponGunsmith)) {
      if (k in WEAPON_INVENTORY_CATALOG && v && typeof v === 'object') {
        const wId = k as WeaponId;
        const norm = normalizeGunsmithLoadout(v);
        const prev = nextGunsmith[wId];
        if (
          !prev ||
          prev.barrel !== norm.barrel ||
          prev.underbarrel !== norm.underbarrel ||
          prev.magazine !== norm.magazine ||
          prev.stock !== norm.stock
        ) {
          nextGunsmith[wId] = norm;
          changed = true;
        }
      }
    }
    currentInventory.equippedWeaponGunsmith = nextGunsmith;
  }

  if (!changed) return;
  isApplyingRemoteLoadout = true;
  try {
    saveAndEmit();
  } finally {
    isApplyingRemoteLoadout = false;
  }
}

function saveAndEmit(): void {
  gunsmithModCache.clear();
  try {
    localStorage.setItem(LOADOUT_STORAGE_KEY, JSON.stringify(currentInventory));
  } catch {
    // ignore storage errors
  }
  const snap = getPlayerInventoryState();
  listeners.forEach((fn) => fn(snap));
  if (!isApplyingRemoteLoadout && cloudLoadoutHook) {
    cloudLoadoutHook(getCloudLoadoutSnapshot());
  }
}

export function getPlayerInventoryState(): PlayerInventoryState {
  return {
    selectedClass: currentInventory.selectedClass,
    purchasedGearIds: [...currentInventory.purchasedGearIds],
    purchasedWeaponIds: [...currentInventory.purchasedWeaponIds],
    purchasedSkinIds: [...currentInventory.purchasedSkinIds],
    equippedWeaponSkins: { ...currentInventory.equippedWeaponSkins },
    equippedWeaponOptics: { ...currentInventory.equippedWeaponOptics },
    equippedWeaponGunsmith: { ...(currentInventory.equippedWeaponGunsmith || {}) },
    classLoadouts: {
      FUZILEIRO: { ...currentInventory.classLoadouts.FUZILEIRO },
      MEDICO: { ...currentInventory.classLoadouts.MEDICO },
      ENGENHEIRO: { ...currentInventory.classLoadouts.ENGENHEIRO },
      FRANCO_ATIRADOR: { ...currentInventory.classLoadouts.FRANCO_ATIRADOR },
    },
  };
}

export function subscribePlayerInventory(
  listener: (state: PlayerInventoryState) => void
): () => void {
  listeners.add(listener);
  listener(getPlayerInventoryState());
  return () => {
    listeners.delete(listener);
  };
}

export function isWeaponOwnedInInventory(
  weaponId: WeaponId,
  playerXp = loadSavedPlayerXp()
): boolean {
  if (
    WEAPON_INVENTORY_CATALOG[weaponId]?.cashPrice === 0 ||
    isWeaponUnlockedAtXp(weaponId, playerXp) ||
    currentInventory.purchasedWeaponIds.includes(weaponId)
  ) {
    return true;
  }
  return false;
}

export function isGearOwnedInInventory(
  gearId: string,
  playerXp = loadSavedPlayerXp()
): boolean {
  const item = GEAR_INVENTORY_CATALOG.find((g) => g.id === gearId);
  if (!item) return false;
  const rank = getRankForXp(playerXp);
  if (item.cashPrice === 0 || rank.level >= item.unlockLevel) return true;
  return currentInventory.purchasedGearIds.includes(gearId);
}

export function purchaseWeaponWithCash(weaponId: WeaponId): boolean {
  const spec = WEAPON_INVENTORY_CATALOG[weaponId];
  if (!spec) return false;
  if (isWeaponOwnedInInventory(weaponId)) return true;
  if (loadSavedPlayerCash() < spec.cashPrice) return false;
  if (!spendPlayerCash(spec.cashPrice)) return false;
  currentInventory.purchasedWeaponIds = Array.from(
    new Set([...currentInventory.purchasedWeaponIds, weaponId])
  );
  saveAndEmit();
  return true;
}

export function purchaseGearWithCash(gearId: string): boolean {
  const item = GEAR_INVENTORY_CATALOG.find((g) => g.id === gearId);
  if (!item) return false;
  if (isGearOwnedInInventory(gearId)) return true;
  if (loadSavedPlayerCash() < item.cashPrice) return false;
  if (!spendPlayerCash(item.cashPrice)) return false;
  currentInventory.purchasedGearIds = Array.from(
    new Set([...currentInventory.purchasedGearIds, gearId])
  );
  saveAndEmit();
  return true;
}

export function isWeaponSkinOwned(skinId: string): boolean {
  const skin = getSkinDefinition(skinId);
  if (skin.cashPrice <= 0 || skin.id === 'default') return true;
  return currentInventory.purchasedSkinIds.includes(skin.id);
}

export function getEquippedWeaponSkinId(weaponId: WeaponId): string {
  const raw = currentInventory.equippedWeaponSkins[weaponId];
  if (!raw) return 'default';
  const skin = getSkinDefinition(raw);
  if (skin.weaponIds && !skin.weaponIds.includes(weaponId)) return 'default';
  return skin.id;
}

export function purchaseWeaponSkinWithCash(skinId: string): boolean {
  const skin = getSkinDefinition(skinId);
  if (isWeaponSkinOwned(skin.id)) return true;
  if (loadSavedPlayerCash() < skin.cashPrice) return false;
  if (!spendPlayerCash(skin.cashPrice)) return false;
  currentInventory.purchasedSkinIds = Array.from(
    new Set([...currentInventory.purchasedSkinIds, skin.id])
  );
  saveAndEmit();
  return true;
}

export function equipWeaponSkin(weaponId: WeaponId, skinId: string): boolean {
  const skin = getSkinDefinition(skinId);
  if (skin.weaponIds && !skin.weaponIds.includes(weaponId)) return false;
  if (!isWeaponSkinOwned(skin.id)) return false;
  currentInventory.equippedWeaponSkins = {
    ...currentInventory.equippedWeaponSkins,
    [weaponId]: skin.id,
  };
  saveAndEmit();
  return true;
}

export function grantVipWeaponAndSkin(weaponId: WeaponId, skinId: string): void {
  const skin = getSkinDefinition(skinId);
  currentInventory.purchasedWeaponIds = Array.from(
    new Set([...currentInventory.purchasedWeaponIds, weaponId])
  );
  if (skin.id !== 'default') {
    currentInventory.purchasedSkinIds = Array.from(
      new Set([...currentInventory.purchasedSkinIds, skin.id])
    );
    if (!skin.weaponIds || skin.weaponIds.includes(weaponId)) {
      currentInventory.equippedWeaponSkins = {
        ...currentInventory.equippedWeaponSkins,
        [weaponId]: skin.id,
      };
    }
  }
  saveAndEmit();
}

export function grantWeaponSkinDirect(
  skinId: string,
  applyToWeaponId?: WeaponId
): void {
  const skin = getSkinDefinition(skinId);
  if (skin.id === 'default') return;
  currentInventory.purchasedSkinIds = Array.from(
    new Set([...currentInventory.purchasedSkinIds, skin.id])
  );
  if (
    applyToWeaponId &&
    (!skin.weaponIds || skin.weaponIds.includes(applyToWeaponId))
  ) {
    currentInventory.equippedWeaponSkins = {
      ...currentInventory.equippedWeaponSkins,
      [applyToWeaponId]: skin.id,
    };
  }
  saveAndEmit();
}

export const SCOPE_PACK_ORDER: OpticType[] = [
  'iron',
  'red_dot',
  'kolimator',
  'holo',
  'lpvo',
];

export function isOpticCompatibleWithWeapon(
  weaponId: WeaponId,
  optic: OpticType
): boolean {
  if (weaponId === 'KNIFE_TACTICAL') return optic === 'iron';
  const spec = SCOPE_PACK_CATALOG[optic];
  if (!spec) return false;
  return spec.compatibleWeapons.includes(weaponId);
}

export function getCompatibleOpticsForWeapon(
  weaponId: WeaponId
): ScopeCatalogItem[] {
  return SCOPE_PACK_ORDER.filter((o) =>
    isOpticCompatibleWithWeapon(weaponId, o)
  ).map((o) => SCOPE_PACK_CATALOG[o]);
}

export function getDefaultOpticForWeapon(
  weaponId: WeaponId,
  playerXp = loadSavedPlayerXp()
): OpticType {
  if (
    weaponId === 'KNIFE_TACTICAL' ||
    weaponId === 'P50_PISTOL' ||
    weaponId === 'M1911_PISTOL' ||
    weaponId === 'RPG7_LAUNCHER'
  ) {
    return 'iron';
  }
  if (weaponId === 'SNIPER_AWP' || weaponId === 'SNIPER_HEAVY') {
    return 'lpvo';
  }
  if (weaponId === 'SNIPER_BOLT' || weaponId === 'SNIPER_TACTICAL') {
    return 'iron';
  }
  if (weaponId === 'AK47_RIFLE') {
    return isOpticUnlockedAtXp('kolimator', playerXp) ? 'kolimator' : 'iron';
  }
  if (weaponId === 'SHOTGUN_12' || weaponId === 'S_MILITARY') {
    return 'iron';
  }
  return 'red_dot';
}

export function getEquippedWeaponOptic(
  weaponId: WeaponId,
  playerXp = loadSavedPlayerXp()
): OpticType {
  if (weaponId === 'KNIFE_TACTICAL') return 'iron';
  const saved = currentInventory.equippedWeaponOptics?.[weaponId];
  if (
    saved &&
    isOpticCompatibleWithWeapon(weaponId, saved) &&
    isOpticUnlockedAtXp(saved, playerXp)
  ) {
    return saved;
  }
  return getDefaultOpticForWeapon(weaponId, playerXp);
}

export function equipWeaponOptic(
  weaponId: WeaponId,
  optic: OpticType,
  playerXp = loadSavedPlayerXp()
): boolean {
  if (!isOpticCompatibleWithWeapon(weaponId, optic)) return false;
  if (!isOpticUnlockedAtXp(optic, playerXp)) return false;
  currentInventory.equippedWeaponOptics = {
    ...(currentInventory.equippedWeaponOptics || {}),
    [weaponId]: optic,
  };
  saveAndEmit();
  return true;
}

export function getEquippedWeaponGunsmith(
  weaponId: WeaponId
): WeaponGunsmithLoadout {
  return normalizeGunsmithLoadout(
    currentInventory.equippedWeaponGunsmith?.[weaponId]
  );
}

export function setWeaponGunsmithAttachment(
  weaponId: WeaponId,
  slot: GunsmithSlotId,
  attachmentId: string
): WeaponGunsmithLoadout {
  const next = normalizeGunsmithLoadout({
    ...getEquippedWeaponGunsmith(weaponId),
    [slot]: attachmentId,
  });
  currentInventory.equippedWeaponGunsmith = {
    ...(currentInventory.equippedWeaponGunsmith || {}),
    [weaponId]: next,
  };
  saveAndEmit();
  return next;
}

export function getWeaponGunsmithModifiers(
  weaponId: WeaponId
): GunsmithCombatModifiers {
  if (!weaponSupportsGunsmith(weaponId)) {
    return NEUTRAL_GUNSMITH_MODIFIERS;
  }
  const cached = gunsmithModCache.get(weaponId);
  if (cached) return cached;
  const computed = computeGunsmithModifiersForLoadout(
    weaponId,
    currentInventory.equippedWeaponGunsmith?.[weaponId]
  );
  gunsmithModCache.set(weaponId, computed);
  return computed;
}

export function inferWarfaceClassForWeapon(weaponId: WeaponId): WarfaceClassId {
  if (
    weaponId === 'SNIPER_BOLT' ||
    weaponId === 'SNIPER_TACTICAL' ||
    weaponId === 'SNIPER_AWP' ||
    weaponId === 'SNIPER_HEAVY'
  ) {
    return 'FRANCO_ATIRADOR';
  }
  if (weaponId === 'SHOTGUN_12' || weaponId === 'SHOTGUN_SPAS') {
    return 'MEDICO';
  }
  if (
    weaponId === 'SMG_45' ||
    weaponId === 'SMG_MP5' ||
    weaponId === 'RPG7_LAUNCHER'
  ) {
    return 'ENGENHEIRO';
  }
  return 'FUZILEIRO';
}

export function setSelectedWarfaceClass(classId: WarfaceClassId): WeaponId {
  currentInventory.selectedClass = classId;
  saveAndEmit();
  return currentInventory.classLoadouts[classId].primaryWeapon;
}

export function equipClassSlotItem(
  classId: WarfaceClassId,
  slot: EquipmentSlotId,
  itemId: string
): void {
  const cfg = { ...currentInventory.classLoadouts[classId] };
  if (slot === 'primaryWeapon') {
    const wId = itemId as WeaponId;
    if (!WARFACE_CLASS_LOADOUT_META[classId].allowedPrimaries.includes(wId)) return;
    cfg.primaryWeapon = wId;
  } else if (slot === 'secondaryWeapon') {
    cfg.secondaryWeapon = itemId as WeaponId;
  } else if (slot === 'meleeWeapon') {
    cfg.meleeWeapon = itemId as WeaponId;
  } else if (slot === 'grenadePack') {
    cfg.grenadePack = itemId;
  } else if (slot === 'helmet') {
    cfg.helmet = itemId;
  } else if (slot === 'vest') {
    cfg.vest = itemId;
  } else if (slot === 'gloves') {
    cfg.gloves = itemId;
  } else if (slot === 'boots') {
    cfg.boots = itemId;
  }
  currentInventory.classLoadouts[classId] = cfg;
  saveAndEmit();
}

export function syncEquippedWeaponToInventory(weaponId: WeaponId): void {
  if (
    weaponId === 'P50_PISTOL' ||
    weaponId === 'M1911_PISTOL' ||
    weaponId === 'KNIFE_TACTICAL'
  ) {
    return;
  }
  const activeCfg = currentInventory.classLoadouts[currentInventory.selectedClass];
  if (
    WARFACE_CLASS_LOADOUT_META[currentInventory.selectedClass].allowedPrimaries.includes(
      weaponId
    )
  ) {
    activeCfg.primaryWeapon = weaponId;
    saveAndEmit();
    return;
  }
  const targetClass = inferWarfaceClassForWeapon(weaponId);
  currentInventory.selectedClass = targetClass;
  currentInventory.classLoadouts[targetClass].primaryWeapon = weaponId;
  saveAndEmit();
}

export interface ClassCombatModifiers {
  classId: WarfaceClassId;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  meleeWeapon: WeaponId;
  totalMaxHealth: number;
  armorBonus: number;
  headshotReductionPct: number;
  reloadSpeedMult: number;
  sprintSpeedMult: number;
  adsSpeedMult: number;
  fragCount: number;
  smokeCount: number;
  helmetName: string;
  vestName: string;
  glovesName: string;
  bootsName: string;
}

export function getClassCombatModifiers(
  classId: WarfaceClassId = currentInventory.selectedClass
): ClassCombatModifiers {
  const cfg = currentInventory.classLoadouts[classId];
  const classMeta = WARFACE_CLASS_LOADOUT_META[classId];

  const findGear = (id: string) =>
    GEAR_INVENTORY_CATALOG.find((g) => g.id === id);

  const helm = findGear(cfg.helmet);
  const vest = findGear(cfg.vest);
  const gloves = findGear(cfg.gloves);
  const boots = findGear(cfg.boots);
  const nade = findGear(cfg.grenadePack);

  const armorBonus =
    classMeta.baseArmor +
    (vest?.stats.armorBonus || 0) +
    (helm?.stats.armorBonus || 0);
  const healthBonus =
    classMeta.baseHealthBonus + (vest?.stats.healthBonus || 0);
  const headshotReductionPct = helm?.stats.headshotReductionPct || 0;
  const reloadBonusPct = gloves?.stats.reloadSpeedBonusPct || 0;
  const sprintBonusPct = boots?.stats.sprintSpeedBonusPct || 0;
  const adsBonusPct =
    (helm?.stats.adsSpeedBonusPct || 0) + (gloves?.stats.adsSpeedBonusPct || 0);

  return {
    classId,
    primaryWeapon: cfg.primaryWeapon,
    secondaryWeapon: cfg.secondaryWeapon,
    meleeWeapon: cfg.meleeWeapon,
    // Armor is a separate vest pool (engineer repairs) — not folded into HP.
    totalMaxHealth: 100 + healthBonus,
    armorBonus,
    headshotReductionPct,
    reloadSpeedMult: 1 + reloadBonusPct / 100,
    sprintSpeedMult: 1 + sprintBonusPct / 100,
    adsSpeedMult: 1 + adsBonusPct / 100,
    fragCount: nade?.stats.fragCount ?? 3,
    smokeCount: nade?.stats.smokeCount ?? 3,
    helmetName: helm?.name || 'Capacete Vanguard',
    vestName: vest?.name || 'Colete Vanguard',
    glovesName: gloves?.name || 'Luvas Táticas',
    bootsName: boots?.name || 'Coturno Vanguard',
  };
}
