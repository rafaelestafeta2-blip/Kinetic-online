import { WeaponId } from '../types/game';

export type GunsmithSlotId = 'barrel' | 'underbarrel' | 'magazine' | 'stock';

export interface GunsmithAttachmentSpec {
  id: string;
  slot: GunsmithSlotId;
  shortLabel: string;
  name: string;
  perkSummary: string;
  recoilPitchMult: number;
  recoilYawMult: number;
  adsSpeedMult: number;
  rangeMult: number;
  magCapacityMult: number;
  reloadSpeedMult: number;
  moveSpeedMult: number;
  hipSpreadMult: number;
  accuracyDelta: number;
  mobilityDelta: number;
}

export type WeaponGunsmithLoadout = Record<GunsmithSlotId, string>;

export interface GunsmithCombatModifiers {
  readonly recoilPitchMult: number;
  readonly recoilYawMult: number;
  readonly adsSpeedMult: number;
  readonly rangeMult: number;
  readonly magCapacityMult: number;
  readonly reloadSpeedMult: number;
  readonly moveSpeedMult: number;
  readonly hipSpreadMult: number;
  readonly accuracyDelta: number;
  readonly mobilityDelta: number;
  readonly rangeDeltaPct: number;
}

export const GUNSMITH_SLOT_META: Array<{
  id: GunsmithSlotId;
  label: string;
}> = [
  { id: 'barrel', label: 'CANO / BOCA' },
  { id: 'underbarrel', label: 'EMPUNHADURA' },
  { id: 'magazine', label: 'CARREGADOR' },
  { id: 'stock', label: 'CORONHA' },
];

export const DEFAULT_GUNSMITH_LOADOUT: Readonly<WeaponGunsmithLoadout> =
  Object.freeze({
    barrel: 'barrel_std',
    underbarrel: 'under_std',
    magazine: 'mag_std',
    stock: 'stock_std',
  });

export const NEUTRAL_GUNSMITH_MODIFIERS: Readonly<GunsmithCombatModifiers> =
  Object.freeze({
    recoilPitchMult: 1,
    recoilYawMult: 1,
    adsSpeedMult: 1,
    rangeMult: 1,
    magCapacityMult: 1,
    reloadSpeedMult: 1,
    moveSpeedMult: 1,
    hipSpreadMult: 1,
    accuracyDelta: 0,
    mobilityDelta: 0,
    rangeDeltaPct: 0,
  });

export const GUNSMITH_ATTACHMENTS_BY_SLOT: Record<
  GunsmithSlotId,
  readonly GunsmithAttachmentSpec[]
> = {
  barrel: [
    {
      id: 'barrel_std',
      slot: 'barrel',
      shortLabel: 'PADRÃO',
      name: 'Cano Militar Padrão',
      perkSummary: 'Equilíbrio original de fábrica',
      recoilPitchMult: 1,
      recoilYawMult: 1,
      adsSpeedMult: 1,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1,
      hipSpreadMult: 1,
      accuracyDelta: 0,
      mobilityDelta: 0,
    },
    {
      id: 'barrel_heavy',
      slot: 'barrel',
      shortLabel: 'PESADO',
      name: 'Cano Match Pesado + Freio',
      perkSummary: '+18% Alcance · -12% Recuo · -6% ADS',
      recoilPitchMult: 0.88,
      recoilYawMult: 0.9,
      adsSpeedMult: 0.94,
      rangeMult: 1.18,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 0.98,
      hipSpreadMult: 0.94,
      accuracyDelta: 6,
      mobilityDelta: -3,
    },
    {
      id: 'barrel_cqb',
      slot: 'barrel',
      shortLabel: 'CURTO CQB',
      name: 'Cano Tático Curto CQB',
      perkSummary: '+14% ADS · +5% Mobilidade · -10% Alcance',
      recoilPitchMult: 1.05,
      recoilYawMult: 1.04,
      adsSpeedMult: 1.14,
      rangeMult: 0.9,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1.05,
      hipSpreadMult: 0.86,
      accuracyDelta: -3,
      mobilityDelta: 6,
    },
  ],
  underbarrel: [
    {
      id: 'under_std',
      slot: 'underbarrel',
      shortLabel: 'PADRÃO',
      name: 'Guarda-Mão Limpo',
      perkSummary: 'Sem peso extra no trilho inferior',
      recoilPitchMult: 1,
      recoilYawMult: 1,
      adsSpeedMult: 1,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1,
      hipSpreadMult: 1,
      accuracyDelta: 0,
      mobilityDelta: 0,
    },
    {
      id: 'under_vertical',
      slot: 'underbarrel',
      shortLabel: 'VERTICAL',
      name: 'Empunhadura Vertical Tática',
      perkSummary: '-22% Recuo Vertical · -4% Vel. ADS',
      recoilPitchMult: 0.78,
      recoilYawMult: 0.94,
      adsSpeedMult: 0.96,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 0.99,
      hipSpreadMult: 0.9,
      accuracyDelta: 7,
      mobilityDelta: -2,
    },
    {
      id: 'under_angled',
      slot: 'underbarrel',
      shortLabel: 'ANGULADA',
      name: 'Empunhadura Angulada AFG',
      perkSummary: '-14% Recuo Lateral · +10% Vel. ADS',
      recoilPitchMult: 0.95,
      recoilYawMult: 0.86,
      adsSpeedMult: 1.1,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1.02,
      hipSpreadMult: 0.92,
      accuracyDelta: 3,
      mobilityDelta: 4,
    },
  ],
  magazine: [
    {
      id: 'mag_std',
      slot: 'magazine',
      shortLabel: 'PADRÃO',
      name: 'Carregador Padrão',
      perkSummary: 'Capacidade e recarga padrão',
      recoilPitchMult: 1,
      recoilYawMult: 1,
      adsSpeedMult: 1,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1,
      hipSpreadMult: 1,
      accuracyDelta: 0,
      mobilityDelta: 0,
    },
    {
      id: 'mag_extended',
      slot: 'magazine',
      shortLabel: 'ESTENDIDO',
      name: 'Carregador Estendido (+25%)',
      perkSummary: '+25% Munição/Pente · -10% Vel. Recarga',
      recoilPitchMult: 1,
      recoilYawMult: 1,
      adsSpeedMult: 0.96,
      rangeMult: 1,
      magCapacityMult: 1.25,
      reloadSpeedMult: 0.9,
      moveSpeedMult: 0.97,
      hipSpreadMult: 1,
      accuracyDelta: 0,
      mobilityDelta: -3,
    },
    {
      id: 'mag_fast',
      slot: 'magazine',
      shortLabel: 'RÁPIDO',
      name: 'Carregador Rápido Magpul',
      perkSummary: '+22% Vel. Recarga · +6% Vel. ADS',
      recoilPitchMult: 1,
      recoilYawMult: 1,
      adsSpeedMult: 1.06,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1.22,
      moveSpeedMult: 1.02,
      hipSpreadMult: 1,
      accuracyDelta: 0,
      mobilityDelta: 3,
    },
  ],
  stock: [
    {
      id: 'stock_std',
      slot: 'stock',
      shortLabel: 'PADRÃO',
      name: 'Coronha Padrão',
      perkSummary: 'Apoio balanceado de ombro',
      recoilPitchMult: 1,
      recoilYawMult: 1,
      adsSpeedMult: 1,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1,
      hipSpreadMult: 1,
      accuracyDelta: 0,
      mobilityDelta: 0,
    },
    {
      id: 'stock_tactical',
      slot: 'stock',
      shortLabel: 'TÁTICA',
      name: 'Coronha Fixa de Precisão',
      perkSummary: '-14% Recuo Total · +8% Estabilidade',
      recoilPitchMult: 0.86,
      recoilYawMult: 0.86,
      adsSpeedMult: 0.95,
      rangeMult: 1.04,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 0.98,
      hipSpreadMult: 0.9,
      accuracyDelta: 6,
      mobilityDelta: -2,
    },
    {
      id: 'stock_skeleton',
      slot: 'stock',
      shortLabel: 'ESQUELETO',
      name: 'Coronha Esqueleto Ultraleve',
      perkSummary: '+12% Vel. ADS · +6% Velocidade · +8% Recuo',
      recoilPitchMult: 1.08,
      recoilYawMult: 1.08,
      adsSpeedMult: 1.12,
      rangeMult: 1,
      magCapacityMult: 1,
      reloadSpeedMult: 1,
      moveSpeedMult: 1.06,
      hipSpreadMult: 0.88,
      accuracyDelta: -3,
      mobilityDelta: 7,
    },
  ],
};

export function weaponSupportsGunsmith(weaponId: WeaponId): boolean {
  return weaponId !== 'KNIFE_TACTICAL' && weaponId !== 'RPG7_LAUNCHER';
}

export function getGunsmithAttachmentSpec(
  slot: GunsmithSlotId,
  attachmentId: string | undefined
): GunsmithAttachmentSpec {
  const list = GUNSMITH_ATTACHMENTS_BY_SLOT[slot];
  if (attachmentId) {
    const found = list.find((a) => a.id === attachmentId);
    if (found) return found;
  }
  return list[0];
}

export function normalizeGunsmithLoadout(
  raw?: Partial<WeaponGunsmithLoadout>
): WeaponGunsmithLoadout {
  return {
    barrel: getGunsmithAttachmentSpec('barrel', raw?.barrel).id,
    underbarrel: getGunsmithAttachmentSpec('underbarrel', raw?.underbarrel).id,
    magazine: getGunsmithAttachmentSpec('magazine', raw?.magazine).id,
    stock: getGunsmithAttachmentSpec('stock', raw?.stock).id,
  };
}

export function computeGunsmithModifiersForLoadout(
  weaponId: WeaponId,
  loadout?: Partial<WeaponGunsmithLoadout>
): GunsmithCombatModifiers {
  if (!weaponSupportsGunsmith(weaponId)) {
    return NEUTRAL_GUNSMITH_MODIFIERS;
  }
  const barrel = getGunsmithAttachmentSpec('barrel', loadout?.barrel);
  const under = getGunsmithAttachmentSpec('underbarrel', loadout?.underbarrel);
  const mag = getGunsmithAttachmentSpec('magazine', loadout?.magazine);
  const stock = getGunsmithAttachmentSpec('stock', loadout?.stock);

  const rangeMult = barrel.rangeMult * under.rangeMult * mag.rangeMult * stock.rangeMult;
  return Object.freeze({
    recoilPitchMult: Math.max(
      0.55,
      Math.min(1.25, barrel.recoilPitchMult * under.recoilPitchMult * mag.recoilPitchMult * stock.recoilPitchMult)
    ),
    recoilYawMult: Math.max(
      0.55,
      Math.min(1.25, barrel.recoilYawMult * under.recoilYawMult * mag.recoilYawMult * stock.recoilYawMult)
    ),
    adsSpeedMult: Math.max(
      0.75,
      Math.min(1.42, barrel.adsSpeedMult * under.adsSpeedMult * mag.adsSpeedMult * stock.adsSpeedMult)
    ),
    rangeMult: Math.max(0.82, Math.min(1.3, rangeMult)),
    magCapacityMult: Math.max(1, Math.min(1.35, mag.magCapacityMult)),
    reloadSpeedMult: Math.max(0.82, Math.min(1.35, mag.reloadSpeedMult)),
    moveSpeedMult: Math.max(
      0.92,
      Math.min(1.12, barrel.moveSpeedMult * under.moveSpeedMult * mag.moveSpeedMult * stock.moveSpeedMult)
    ),
    hipSpreadMult: Math.max(
      0.68,
      Math.min(1.15, barrel.hipSpreadMult * under.hipSpreadMult * mag.hipSpreadMult * stock.hipSpreadMult)
    ),
    accuracyDelta:
      barrel.accuracyDelta + under.accuracyDelta + mag.accuracyDelta + stock.accuracyDelta,
    mobilityDelta:
      barrel.mobilityDelta + under.mobilityDelta + mag.mobilityDelta + stock.mobilityDelta,
    rangeDeltaPct: Math.round((rangeMult - 1) * 100),
  });
}

export function computeEffectiveMagCapacity(
  weaponId: WeaponId,
  baseCapacity: number,
  mods: GunsmithCombatModifiers
): number {
  if (baseCapacity <= 1 || !weaponSupportsGunsmith(weaponId)) {
    return baseCapacity;
  }
  return Math.max(baseCapacity, Math.round(baseCapacity * mods.magCapacityMult));
}
