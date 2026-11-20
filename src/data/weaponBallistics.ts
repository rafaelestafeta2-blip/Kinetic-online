import { WeaponId } from '../types/game';

export interface WeaponBallisticsDef {
  /** Base damage per shot (or per pellet when pelletCount > 1) within effectiveRange. */
  baseDamage: number;
  /** Minimum damage floor at/beyond falloffEnd (before headshot multiplier). */
  minDamage: number;
  /** Distance in meters before damage begins dropping off. */
  effectiveRange: number;
  /** Distance in meters where damage finishes dropping to minDamage. */
  falloffEnd: number;
  /** Maximum ballistic raycast reach in meters. */
  maxRange: number;
  /** Damage multiplier on HEAD hits (Warface-style head lethality vs low shotgun head mult). */
  headMult: number;
  /** Armor damage absorbed when hitting an armored vest before shattering. */
  armorDamage: number;
  /** Steepness exponent for falloff curve (1.0 = linear, >1.0 = steeper early drop like buckshot). */
  falloffExponent: number;
  /** True for high-caliber sniper rounds that punch directly through body armor. */
  armorPiercing: boolean;
  /** Number of projectiles per trigger pull (8 buckshot pellets for 12GA shotguns, 1 otherwise). */
  pelletCount: number;
  /** Hip-fire pellet spread cone radius (radians-ish). */
  pelletSpreadHip: number;
  /** ADS pellet spread cone radius. */
  pelletSpreadAds: number;
  /** Nominal muzzle velocity (m/s) for shot telemetry. */
  muzzleVelocity: number;
}

const BALLISTICS: Record<WeaponId, WeaponBallisticsDef> = {
  // === ESCOPETAS 12GA (Médico) — Letais corpo a corpo (<=5-7m), queda severa após 12m ===
  SHOTGUN_12: {
    baseDamage: 24, // 8x24 = 192 até 5m
    minDamage: 2,   // 8x2 = 16 max a 13m+ (com spread, apenas ~4-8 de dano longe)
    effectiveRange: 5,
    falloffEnd: 13,
    maxRange: 20,
    headMult: 1.25,
    armorDamage: 12,
    falloffExponent: 1.45,
    armorPiercing: false,
    pelletCount: 8,
    pelletSpreadHip: 0.074,
    pelletSpreadAds: 0.056,
    muzzleVelocity: 395,
  },
  SHOTGUN_SPAS: {
    baseDamage: 20, // 8x20 = 160 até 5m (cadência semi-automática maior)
    minDamage: 2,
    effectiveRange: 5,
    falloffEnd: 13.5,
    maxRange: 21,
    headMult: 1.25,
    armorDamage: 10,
    falloffExponent: 1.4,
    armorPiercing: false,
    pelletCount: 8,
    pelletSpreadHip: 0.08,
    pelletSpreadAds: 0.06,
    muzzleVelocity: 385,
  },

  // === PISTOLA SECUNDÁRIA (.45 ACP) — Forte perto até 14m, cai bastante após 25m ===
  P50_PISTOL: {
    baseDamage: 42,
    minDamage: 18,
    effectiveRange: 14,
    falloffEnd: 36,
    maxRange: 65,
    headMult: 2.4,
    armorDamage: 22,
    falloffExponent: 1.1,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 425,
  },
  M1911_PISTOL: {
    baseDamage: 48,
    minDamage: 20,
    effectiveRange: 14,
    falloffEnd: 38,
    maxRange: 68,
    headMult: 2.45,
    armorDamage: 24,
    falloffExponent: 1.1,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 260,
  },

  // === SUBMETRALHADORAS (Engenheiro) — Curto/Médio alcance, alta cadência ===
  SMG_45: {
    baseDamage: 30,
    minDamage: 14,
    effectiveRange: 14,
    falloffEnd: 38,
    maxRange: 80,
    headMult: 2.5,
    armorDamage: 20,
    falloffExponent: 1.1,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 330,
  },
  SMG_MP5: {
    baseDamage: 29,
    minDamage: 15,
    effectiveRange: 16,
    falloffEnd: 44,
    maxRange: 85,
    headMult: 2.55,
    armorDamage: 20,
    falloffExponent: 1.05,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 400,
  },

  // === FUZIS DE ASSALTO (Fuzileiro) — Médio/Longo alcance estilo Warface (alto HS) ===
  M4_CARBINE: {
    baseDamage: 36,
    minDamage: 22,
    effectiveRange: 25,
    falloffEnd: 65,
    maxRange: 130,
    headMult: 2.8,
    armorDamage: 28,
    falloffExponent: 1.0,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 880,
  },
  CARBINE_AR: {
    baseDamage: 35,
    minDamage: 23,
    effectiveRange: 27,
    falloffEnd: 70,
    maxRange: 135,
    headMult: 2.85,
    armorDamage: 28,
    falloffExponent: 1.0,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 895,
  },
  S_MILITARY: {
    baseDamage: 38,
    minDamage: 24,
    effectiveRange: 26,
    falloffEnd: 68,
    maxRange: 135,
    headMult: 2.85,
    armorDamage: 30,
    falloffExponent: 1.0,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 875,
  },
  AK12_RIFLE: {
    baseDamage: 40,
    minDamage: 25,
    effectiveRange: 28,
    falloffEnd: 72,
    maxRange: 140,
    headMult: 2.85,
    armorDamage: 32,
    falloffExponent: 1.0,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 900,
  },
  AK47_RIFLE: {
    baseDamage: 46,
    minDamage: 29,
    effectiveRange: 26,
    falloffEnd: 70,
    maxRange: 135,
    headMult: 2.9,
    armorDamage: 36,
    falloffExponent: 1.0,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 715,
  },

  // === METRALHADORA LEVE ===
  L49_LMG: {
    baseDamage: 37,
    minDamage: 24,
    effectiveRange: 28,
    falloffEnd: 75,
    maxRange: 140,
    headMult: 2.6,
    armorDamage: 30,
    falloffExponent: 1.0,
    armorPiercing: false,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 915,
  },

  // === SNIPERS ===
  SNIPER_TACTICAL: {
    baseDamage: 240,
    minDamage: 185,
    effectiveRange: 75,
    falloffEnd: 135,
    maxRange: 220,
    headMult: 2.0,
    armorDamage: 100,
    falloffExponent: 1.0,
    armorPiercing: true,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 860,
  },
  SNIPER_BOLT: {
    baseDamage: 340,
    minDamage: 290,
    effectiveRange: 100,
    falloffEnd: 160,
    maxRange: 260,
    headMult: 2.0,
    armorDamage: 150,
    falloffExponent: 1.0,
    armorPiercing: true,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 940,
  },
  SNIPER_AWP: {
    baseDamage: 360,
    minDamage: 310,
    effectiveRange: 115,
    falloffEnd: 180,
    maxRange: 280,
    headMult: 2.0,
    armorDamage: 165,
    falloffExponent: 1.0,
    armorPiercing: true,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 960,
  },
  SNIPER_HEAVY: {
    baseDamage: 410,
    minDamage: 345,
    effectiveRange: 125,
    falloffEnd: 200,
    maxRange: 300,
    headMult: 2.0,
    armorDamage: 190,
    falloffExponent: 1.0,
    armorPiercing: true,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 1010,
  },

  // === LANÇADOR ANTITANQUE EXPLOSIVO ===
  RPG7_LAUNCHER: {
    baseDamage: 220,
    minDamage: 140,
    effectiveRange: 25,
    falloffEnd: 120,
    maxRange: 150,
    headMult: 1.15,
    armorDamage: 160,
    falloffExponent: 1.0,
    armorPiercing: true,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 295,
  },

  // === CORPO A CORPO ===
  KNIFE_TACTICAL: {
    baseDamage: 130,
    minDamage: 130,
    effectiveRange: 2.4,
    falloffEnd: 2.4,
    maxRange: 2.4,
    headMult: 1.2,
    armorDamage: 60,
    falloffExponent: 1.0,
    armorPiercing: true,
    pelletCount: 1,
    pelletSpreadHip: 0,
    pelletSpreadAds: 0,
    muzzleVelocity: 18,
  },
};

export function getWeaponBallistics(weaponId: WeaponId): WeaponBallisticsDef {
  return BALLISTICS[weaponId] || BALLISTICS.M4_CARBINE;
}

export function computeBallisticDamage(
  weaponId: WeaponId,
  distanceMeters: number,
  hitZone: 'HEAD' | 'TORSO_A' | 'ARMOR',
  suppressorAttached = false
): { damage: number; armorDamage: number; armorPiercing: boolean; velocityMs: number } {
  const b = getWeaponBallistics(weaponId);
  const effRange = suppressorAttached ? b.effectiveRange * 0.9 : b.effectiveRange;
  const endRange = suppressorAttached ? b.falloffEnd * 0.9 : b.falloffEnd;
  const dmgScale = suppressorAttached && !b.armorPiercing ? 0.95 : 1.0;

  let falloffFactor = 1.0;
  if (distanceMeters > effRange && endRange > effRange) {
    const t = Math.min(1, Math.max(0, (distanceMeters - effRange) / (endRange - effRange)));
    falloffFactor = Math.pow(1 - t, b.falloffExponent);
  } else if (distanceMeters > endRange) {
    falloffFactor = 0.0;
  }

  const rawBody =
    (b.minDamage + (b.baseDamage - b.minDamage) * falloffFactor) * dmgScale;

  const damage =
    hitZone === 'HEAD'
      ? Math.max(1, Math.round(rawBody * b.headMult))
      : Math.max(1, Math.round(rawBody));

  const minArmor = b.pelletCount > 1 ? 1 : Math.max(8, Math.round(b.armorDamage * 0.45));
  const armorDamage = b.armorPiercing
    ? b.armorDamage
    : Math.max(
        minArmor,
        Math.round((minArmor + (b.armorDamage - minArmor) * falloffFactor) * dmgScale)
      );

  const velocityMs = Math.round(
    Math.max(
      b.muzzleVelocity * 0.35,
      (b.muzzleVelocity * (suppressorAttached ? 0.96 : 1.0)) - distanceMeters * 2.2
    )
  );

  return {
    damage,
    armorDamage,
    armorPiercing: b.armorPiercing,
    velocityMs,
  };
}
