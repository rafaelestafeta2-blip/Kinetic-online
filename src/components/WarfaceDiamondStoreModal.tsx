import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  claimFounderWelcomeDiamonds,
  CloudSyncState,
  FOUNDER_WELCOME_DIAMONDS,
  openWarfaceWarboxWithDiamonds,
  purchaseDirectWeaponOfferWithDiamonds,
  purchaseOperatorWithDiamonds,
  purchaseWeaponSkinWithDiamonds,
  WarboxResolvedDropResult,
} from '../firebase/playerCloudSync';
import {
  DIAMOND_EXCLUSIVE_WEAPON_OFFERS,
  loadWarboxPityMap,
  WARBOX_CATALOG,
  WarboxDropItem,
  WarboxRewardRarity,
} from '../progression/diamondWarboxStore';
import {
  equipClassSlotItem,
  equipWeaponOptic,
  equipWeaponSkin,
  GEAR_INVENTORY_CATALOG,
  getEquippedWeaponOptic,
  getEquippedWeaponSkinId,
  getPlayerInventoryState,
  isGearOwnedInInventory,
  isOpticCompatibleWithWeapon,
  isWeaponOwnedInInventory,
  isWeaponSkinOwned,
  purchaseGearWithCash,
  purchaseWeaponSkinWithCash,
  SCOPE_PACK_CATALOG,
  SCOPE_PACK_ORDER,
  subscribePlayerInventory,
  syncEquippedWeaponToInventory,
} from '../progression/loadoutSystem';
import {
  equipOperatorSkin,
  getOperatorOwnershipState,
  OPERATOR_CATALOG,
  OperatorOwnershipState,
  subscribeOperatorOwnership,
} from '../progression/operatorSkinsSystem';
import { getRankForXp, isOpticUnlockedAtXp } from '../progression/ranks';
import { DIAMOND_STORE_PACKS } from '../progression/vipBattlePassSystem';
import { WEAPON_SKIN_CATALOG } from '../progression/weaponSkins';
import { OpticType, WeaponId } from '../types/game';
import { RankedOperator3DCanvas } from './RankedOperator3DCanvas';
import { WeaponPreview3D, WeaponVisualCard } from './WeaponVisualCard';

export type DiamondStoreSectionTab =
  | 'DESTAQUES'
  | 'SKINS'
  | 'ARMAS'
  | 'ACESSORIOS'
  | 'CAIXAS'
  | 'PASSE_VIP'
  | 'RECARGA'
  // Legacy aliases kept for backwards compatibility
  | 'WARBOXES'
  | 'WEAPONS'
  | 'OPERATORS'
  | 'DIAMONDS';

type InternalStoreTab =
  | 'DESTAQUES'
  | 'SKINS'
  | 'ARMAS'
  | 'ACESSORIOS'
  | 'CAIXAS'
  | 'PASSE_VIP'
  | 'RECARGA';

function normalizeInitialSection(
  tab?: DiamondStoreSectionTab
): InternalStoreTab {
  switch (tab) {
    case 'WARBOXES':
    case 'CAIXAS':
      return 'CAIXAS';
    case 'WEAPONS':
    case 'ARMAS':
      return 'ARMAS';
    case 'OPERATORS':
    case 'SKINS':
      return 'SKINS';
    case 'ACESSORIOS':
      return 'ACESSORIOS';
    case 'PASSE_VIP':
      return 'PASSE_VIP';
    case 'DIAMONDS':
    case 'RECARGA':
      return 'RECARGA';
    default:
      return 'DESTAQUES';
  }
}

interface WarfaceDiamondStoreModalProps {
  activeWeapon: WeaponId;
  playerXp: number;
  playerCash: number;
  syncState: CloudSyncState;
  initialSection?: DiamondStoreSectionTab;
  onSelectWeapon: (weaponId: WeaponId) => void;
  onOpenVipPass?: () => void;
  onClose: () => void;
}

const RARITY_STYLES: Record<
  WarboxRewardRarity,
  {
    border: string;
    bg: string;
    badgeBg: string;
    text: string;
    label: string;
  }
> = {
  LENDARIO: {
    border: 'border-amber-400/75',
    bg: 'from-amber-950/75 via-[#1c1306]/90 to-[#0b0e15]',
    badgeBg: 'bg-amber-400 text-slate-950',
    text: 'text-amber-300',
    label: 'LENDÁRIO',
  },
  ELITE: {
    border: 'border-red-500/70',
    bg: 'from-red-950/70 via-[#1d0a10]/90 to-[#0b0e15]',
    badgeBg: 'bg-red-500 text-white',
    text: 'text-red-300',
    label: 'ELITE',
  },
  ESPECIAL: {
    border: 'border-sky-400/60',
    bg: 'from-sky-950/65 via-[#0b1726]/90 to-[#0b0e15]',
    badgeBg: 'bg-sky-400 text-slate-950',
    text: 'text-sky-300',
    label: 'ESPECIAL',
  },
  COMUM: {
    border: 'border-white/15',
    bg: 'from-slate-900/80 via-[#0e131d]/90 to-[#090c12]',
    badgeBg: 'bg-slate-700 text-slate-100',
    text: 'text-slate-300',
    label: 'SUPRIMENTO',
  },
};

/* ========================================================================= */
/* CRISP INLINE ICONS MATCHING THE STORE VISUAL REFERENCE                    */
/* ========================================================================= */

const DiamondGemIcon: React.FC<{ className?: string }> = ({
  className = 'w-4 h-4',
}) => (
  <svg viewBox="0 0 24 24" className={className} fill="none">
    <path d="M5 4H19L23 9.5L12 21.5L1 9.5L5 4Z" fill="#38bdf8" />
    <path d="M5 4H19L16 9.5H8L5 4Z" fill="#bae6fd" />
    <path d="M12 21.5L8 9.5H16L12 21.5Z" fill="#0284c7" />
    <path d="M1 9.5H8L12 21.5L1 9.5Z" fill="#0ea5e9" />
    <path d="M23 9.5H16L12 21.5L23 9.5Z" fill="#0369a1" />
  </svg>
);

const SidebarIcon: React.FC<{ id: InternalStoreTab; active: boolean }> = ({
  id,
  active,
}) => {
  const cls = `w-5 h-5 shrink-0 transition-colors ${
    active ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.65)]' : 'text-slate-300'
  }`;

  switch (id) {
    case 'DESTAQUES':
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
          <path d="M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4 6 20.6l1.3-6.6-4.9-4.6 6.7-.8L12 2.5z" />
        </svg>
      );
    case 'SKINS':
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
          <path d="M16.5 3.5L21 6.5l-2.3 3.8-2.2-1.1V20.5H7.5V9.2l-2.2 1.1L3 6.5l4.5-3 2 1.7a3.2 3.2 0 0 0 5 0l2-1.7z" />
        </svg>
      );
    case 'ARMAS':
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
          <path d="M2 7.5h15.5l1.5 1.5H22v3h-4.5l-1.2 1.5h-4l-1.8 6H6.2l1.6-6H5.5l-.8 1.5H2v-7.5zm10.2 6h2.2l.5-1.5h-2.2l-.5 1.5z" />
        </svg>
      );
    case 'ACESSORIOS':
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
        </svg>
      );
    case 'CAIXAS':
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path d="M12 2.8L20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8z" />
          <path d="M12 12.1L20.5 7.4M12 12.1L3.5 7.4M12 12.1V21.2" />
        </svg>
      );
    case 'PASSE_VIP':
      return (
        <svg
          viewBox="0 0 24 24"
          className={cls}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path d="M6 4h12l4 5.5L12 20.5 2 9.5 6 4z" />
          <path d="M2 9.5h20M8.5 4l3.5 16.5L15.5 4" />
        </svg>
      );
    case 'RECARGA':
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
          <ellipse cx="12" cy="6.5" rx="7.5" ry="2.8" />
          <path d="M4.5 9.6v2.7c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V9.6c-1.7 1.2-4.4 1.8-7.5 1.8s-5.8-.6-7.5-1.8z" />
          <path d="M4.5 14.5v2.7c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-2.7c-1.7 1.2-4.4 1.8-7.5 1.8s-5.8-.6-7.5-1.8z" />
        </svg>
      );
  }
};

/** Gold slanted CTA button matching the exact mockup aesthetic */
const GoldSlantedButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'gold' | 'equipped' | 'emerald';
  className?: string;
}> = ({
  label,
  onClick,
  disabled = false,
  variant = 'gold',
  className = '',
}) => {
  const palette =
    variant === 'equipped'
      ? 'from-emerald-500/30 via-emerald-600/35 to-emerald-700/30 text-emerald-200 border border-emerald-400/70'
      : variant === 'emerald'
        ? 'from-emerald-300 via-emerald-400 to-emerald-500 text-slate-950 shadow-[0_3px_14px_rgba(16,185,129,0.4)]'
        : 'from-[#ffe47a] via-[#f5bd2a] to-[#d98a0b] hover:from-[#fff0a6] hover:to-[#eb9d14] text-[#140d02] shadow-[0_3px_14px_rgba(245,158,11,0.35)]';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full py-1.5 px-3 bg-gradient-to-b ${palette} font-display font-black text-[11px] sm:text-xs tracking-wider uppercase cursor-pointer disabled:opacity-50 transition-all active:scale-[0.98] -skew-x-12 rounded-[3px] ${className}`}
    >
      <span className="inline-block skew-x-12">{label}</span>
    </button>
  );
};

/** Custom Tactical Crate illustration for "CAIXA DE SKINS" card */
const TacticalCrateArtwork: React.FC = () => (
  <svg viewBox="0 0 180 120" className="w-32 h-24 drop-shadow-[0_6px_18px_rgba(239,68,68,0.45)]">
    <defs>
      <linearGradient id="crateTop" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <linearGradient id="crateGlow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="50%" stopColor="#fca5a5" />
        <stop offset="100%" stopColor="#dc2626" />
      </linearGradient>
    </defs>
    {/* Base Shadow */}
    <ellipse cx="90" cy="106" rx="68" ry="10" fill="rgba(239,68,68,0.28)" />
    {/* Crate Body */}
    <polygon points="24,44 90,22 156,44 156,92 90,110 24,92" fill="#0f141e" stroke="#475569" strokeWidth="2" />
    <polygon points="24,44 90,62 156,44 90,22" fill="url(#crateTop)" stroke="#64748b" strokeWidth="1.5" />
    {/* Glowing Crimson Seam */}
    <path d="M26 52 L90 70 L154 52" stroke="url(#crateGlow)" strokeWidth="4" fill="none" />
    <polygon points="56,37 90,26 124,37 90,48" fill="#ef4444" fillOpacity="0.65" />
    {/* Latches & Armor Straps */}
    <rect x="44" y="56" width="10" height="36" rx="2" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.2" />
    <rect x="126" y="56" width="10" height="36" rx="2" fill="#1e293b" stroke="#94a3b8" strokeWidth="1.2" />
    {/* Center Emblem */}
    <polygon points="90,74 100,82 90,94 80,82" fill="#ef4444" stroke="#fecaca" strokeWidth="1" />
  </svg>
);

/** Custom Tactical Backpack & Gear illustration for "ACESSÓRIOS" card */
const TacticalGearArtwork: React.FC = () => (
  <svg viewBox="0 0 160 125" className="w-28 h-24 drop-shadow-[0_6px_16px_rgba(239,68,68,0.4)]">
    <defs>
      <linearGradient id="packBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
    </defs>
    <ellipse cx="80" cy="112" rx="46" ry="8" fill="rgba(239,68,68,0.28)" />
    {/* Top handle */}
    <path d="M62 24 C62 12, 98 12, 98 24" stroke="#64748b" strokeWidth="5" fill="none" strokeLinecap="round" />
    {/* Main Pack */}
    <rect x="42" y="22" width="76" height="86" rx="18" fill="url(#packBody)" stroke="#64748b" strokeWidth="2" />
    {/* Crimson Tactical Trim */}
    <path d="M46 42 H114 M46 72 H114" stroke="#ef4444" strokeWidth="2.5" strokeOpacity="0.85" />
    {/* Molle Pockets */}
    <rect x="52" y="48" width="56" height="46" rx="8" fill="#111827" stroke="#ef4444" strokeWidth="1.4" />
    {/* Shield Crest */}
    <path d="M80 55 L92 61 V74 C92 81 80 87 80 87 C80 87 68 81 68 74 V61 Z" fill="#dc2626" stroke="#fca5a5" strokeWidth="1.2" />
    <path d="M75 68 L80 75 L86 65" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Custom Golden VIP Winged Emblem for "PASSE VIP" card */
const VipCrestArtwork: React.FC = () => (
  <svg viewBox="0 0 180 120" className="w-32 h-24 drop-shadow-[0_6px_20px_rgba(245,158,11,0.55)]">
    <defs>
      <linearGradient id="vipGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef08a" />
        <stop offset="50%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
    </defs>
    {/* Wings */}
    <path d="M22 44 L62 56 L54 78 L26 62 Z M158 44 L118 56 L126 78 L154 62 Z" fill="url(#vipGold)" opacity="0.85" />
    <path d="M32 68 L64 74 L60 92 L38 82 Z M148 68 L116 74 L120 92 L142 82 Z" fill="url(#vipGold)" opacity="0.65" />
    {/* Crown */}
    <path d="M68 38 L74 20 L84 30 L90 16 L96 30 L106 20 L112 38 Z" fill="url(#vipGold)" stroke="#fef9c3" strokeWidth="1" />
    {/* Shield */}
    <path d="M60 44 H120 L114 84 L90 102 L66 84 Z" fill="#1c1205" stroke="url(#vipGold)" strokeWidth="3.5" />
    <text x="90" y="76" textAnchor="middle" fill="url(#vipGold)" fontWeight="900" fontSize="24" fontFamily="sans-serif">
      VIP
    </text>
  </svg>
);

/** Diamond Chest artwork for bottom-right Recharge Banner */
const DiamondChestArtwork: React.FC = () => (
  <svg viewBox="0 0 210 130" className="w-40 sm:w-48 h-28 sm:h-32 drop-shadow-[0_0_24px_rgba(56,189,248,0.65)] shrink-0">
    <defs>
      <linearGradient id="chestBlue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <linearGradient id="chestTrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>
    </defs>
    {/* Aura */}
    <ellipse cx="112" cy="74" rx="76" ry="42" fill="rgba(56,189,248,0.22)" />
    {/* Open Lid */}
    <polygon points="48,46 154,24 182,42 74,64" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
    {/* Pile of Diamonds */}
    <polygon points="74,62 92,38 112,56 96,74" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1" />
    <polygon points="104,54 126,32 146,52 122,70" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1" />
    <polygon points="130,58 152,40 170,58 148,74" fill="#0ea5e9" stroke="#bae6fd" strokeWidth="1" />
    <polygon points="90,68 114,46 134,64 110,80" fill="#e0f2fe" />
    {/* Chest Base */}
    <polygon points="56,64 166,54 162,108 62,116" fill="#0f172a" stroke="url(#chestTrim)" strokeWidth="3" />
    <polygon points="56,64 166,54 165,68 57,78" fill="#334155" />
    {/* Glowing Front Lock */}
    <rect x="103" y="72" width="18" height="22" rx="3" fill="url(#chestBlue)" stroke="#e0f2fe" strokeWidth="1.5" />
    {/* Loose foreground gems */}
    <polygon points="34,98 46,88 58,98 46,112" fill="#38bdf8" stroke="#bae6fd" strokeWidth="1" />
    <polygon points="168,96 182,84 196,96 182,112" fill="#7dd3fc" stroke="#e0f2fe" strokeWidth="1" />
  </svg>
);

const HERO_SLIDES = [
  {
    id: 'legendary_pack',
    eyebrow: 'PACOTE',
    title: 'LENDÁRIO',
    subtitle: 'DOMINE O CAMPO DE BATALHA!',
    timer: '6d 23h',
    primaryOfferId: 'offer_shotgun_aemondir',
    operatorId: 'op_blackwood_spectre',
    operatorWeapon: 'SHOTGUN_12' as WeaponId,
    weaponTop: { id: 'SHOTGUN_12' as WeaponId, skinId: 'shotgun_aemondir_legion' },
    weaponMid: { id: 'SMG_45' as WeaponId, skinId: 'camo_crimson_ops' },
    weaponBot: { id: 'KNIFE_TACTICAL' as WeaponId, skinId: 'camo_crimson_ops' },
  },
  {
    id: 'v18_engineer',
    eyebrow: 'NOVA ARMA ENGENHEIRO',
    title: 'V18 SPECTRE',
    subtitle: 'SILENCIADOR ACÚSTICO INTEGRADO + MIRA TÁTICA!',
    timer: '6d 23h',
    primaryOfferId: 'offer_v18_spectre_eng',
    operatorId: 'op_cobalt_strike',
    operatorWeapon: 'SMG_45' as WeaponId,
    weaponTop: { id: 'SMG_45' as WeaponId, skinId: 'default' },
    weaponMid: { id: 'SMG_45' as WeaponId, skinId: 'camo_crimson_ops' },
    weaponBot: { id: 'RPG7_LAUNCHER' as WeaponId, skinId: 'camo_crimson_ops' },
  },
  {
    id: 'anubis_gold',
    eyebrow: 'COLEÇÃO IMPERIAL',
    title: 'ANUBIS 24K',
    subtitle: 'SNIPER M200 OURO + COMANDANTE AURUM!',
    timer: '5d 14h',
    primaryOfferId: 'offer_m200_anubis',
    operatorId: 'op_aurum_commander',
    operatorWeapon: 'SNIPER_HEAVY' as WeaponId,
    weaponTop: { id: 'SNIPER_HEAVY' as WeaponId, skinId: 'camo_anubis_gold' },
    weaponMid: { id: 'L49_LMG' as WeaponId, skinId: 'camo_carbon_gold' },
    weaponBot: { id: 'CARBINE_AR' as WeaponId, skinId: 'camo_carbon_gold' },
  },
];

export const WarfaceDiamondStoreModal: React.FC<WarfaceDiamondStoreModalProps> = ({
  activeWeapon,
  playerXp,
  playerCash,
  syncState,
  initialSection = 'DESTAQUES',
  onSelectWeapon,
  onOpenVipPass,
  onClose,
}) => {
  const [section, setSection] = useState<InternalStoreTab>(() =>
    normalizeInitialSection(initialSection)
  );
  const [heroSlideIdx, setHeroSlideIdx] = useState(0);
  const [selectedBoxId, setSelectedBoxId] = useState<string>(WARBOX_CATALOG[0].id);
  const [pityMap, setPityMap] = useState<Record<string, number>>(() =>
    loadWarboxPityMap()
  );
  const [opState, setOpState] = useState<OperatorOwnershipState>(() =>
    getOperatorOwnershipState()
  );
  const [invState, setInvState] = useState(() => getPlayerInventoryState());
  const [previewOpId, setPreviewOpId] = useState<string>(
    () => getOperatorOwnershipState().activeOperatorId
  );
  const [previewSkinWeaponId, setPreviewSkinWeaponId] =
    useState<WeaponId>('SHOTGUN_12');

  // Crate opening animation states
  const [isRollingCrate, setIsRollingCrate] = useState(false);
  const [reelStrip, setReelStrip] = useState<WarboxDropItem[]>([]);
  const [reelHighlightIdx, setReelHighlightIdx] = useState(0);
  const [lastCrateResults, setLastCrateResults] = useState<
    WarboxResolvedDropResult[] | null
  >(null);

  const [busy, setBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    kind: 'ok' | 'info' | 'err';
    text: string;
    checkoutUrl?: string;
  } | null>(null);

  useEffect(() => {
    const unsubOp = subscribeOperatorOwnership((next) => setOpState(next));
    const unsubInv = subscribePlayerInventory((next) => setInvState(next));
    return () => {
      unsubOp();
      unsubInv();
    };
  }, []);

  const diamonds = Math.max(0, Math.floor(Number(syncState.profile.diamonds) || 0));
  const playerLevel = getRankForXp(playerXp).level;
  const selectedBox =
    WARBOX_CATALOG.find((b) => b.id === selectedBoxId) || WARBOX_CATALOG[0];
  const currentBoxPity = Math.max(0, Math.floor(pityMap[selectedBox.id] || 0));
  const activeHero = HERO_SLIDES[heroSlideIdx] || HERO_SLIDES[0];

  const isDropItemAlreadyOwned = (drop: WarboxDropItem): boolean => {
    if (drop.kind === 'WEAPON_BUNDLE' && drop.weaponId) {
      const wOwned =
        (syncState.profile.unlockedWeapons || []).includes(drop.weaponId) ||
        isWeaponOwnedInInventory(drop.weaponId, playerXp);
      const sOwned = drop.skinId ? isWeaponSkinOwned(drop.skinId) : true;
      return wOwned && sOwned;
    }
    if (drop.kind === 'OPERATOR' && drop.operatorId) {
      return opState.unlockedOperatorIds.includes(drop.operatorId);
    }
    if (drop.kind === 'SKIN' && drop.skinId) {
      return isWeaponSkinOwned(drop.skinId);
    }
    return false;
  };

  const handleClaimFounderDiamonds = async () => {
    if (busy) return;
    soundEngine.playMenuSelect();
    setBusy(true);
    setStatusBanner(null);
    const res = await claimFounderWelcomeDiamonds();
    setBusy(false);
    if (!res.ok) {
      setStatusBanner({
        kind: 'err',
        text: res.error || 'Não foi possível resgatar o bônus fundador.',
      });
      return;
    }
    setStatusBanner({
      kind: 'ok',
      text: `+${FOUNDER_WELCOME_DIAMONDS.toLocaleString('pt-BR')} DIAMANTES CREDITADOS! Agora você pode comprar a Shotgun Aemondir, a V18 Spectre de Engenheiro, Operadores e Caixas.`,
    });
  };

  const handleOpenWarbox = async (count: 1 | 5) => {
    if (busy || isRollingCrate) return;
    soundEngine.playMenuSelect();
    const cost =
      count === 5 ? selectedBox.price5xDiamonds : selectedBox.price1xDiamonds;

    if (diamonds < cost) {
      setSection('RECARGA');
      setStatusBanner({
        kind: 'info',
        text: `Você precisa de ${cost} 💎 para abrir ${count}x ${selectedBox.name} (saldo atual: ${diamonds} 💎). Resgate seu Bônus Fundador ou recarregue Diamantes abaixo.`,
      });
      return;
    }

    setBusy(true);
    setStatusBanner(null);
    setLastCrateResults(null);

    const res = await openWarfaceWarboxWithDiamonds(
      selectedBox.id,
      count,
      activeWeapon
    );
    if (!res.ok || !res.results || res.results.length === 0) {
      setBusy(false);
      setStatusBanner({
        kind: 'err',
        text: res.error || 'Falha ao abrir Caixa Tática.',
      });
      return;
    }

    const bestResult = [...res.results].sort((a, b) => {
      const rank = { LENDARIO: 4, ELITE: 3, ESPECIAL: 2, COMUM: 1 };
      return rank[b.item.rarity] - rank[a.item.rarity];
    })[0];

    const stripLength = 22;
    const strip: WarboxDropItem[] = [];
    for (let i = 0; i < stripLength - 1; i++) {
      const randDrop =
        selectedBox.drops[Math.floor(Math.random() * selectedBox.drops.length)];
      strip.push(randDrop);
    }
    strip.push(bestResult.item);

    setReelStrip(strip);
    setReelHighlightIdx(0);
    setIsRollingCrate(true);

    let step = 0;
    const stepTimer = window.setInterval(() => {
      step += 1;
      soundEngine.playMenuHover();
      if (step >= stripLength - 1) {
        window.clearInterval(stepTimer);
        setReelHighlightIdx(stripLength - 1);
        soundEngine.playMenuSelect();
        window.setTimeout(() => {
          setIsRollingCrate(false);
          setBusy(false);
          setLastCrateResults(res.results || []);
          setPityMap(loadWarboxPityMap());
          if (res.unlockedWeaponId) {
            syncEquippedWeaponToInventory(res.unlockedWeaponId);
            onSelectWeapon(res.unlockedWeaponId);
          }
          if (res.unlockedOperatorId) {
            setPreviewOpId(res.unlockedOperatorId);
          }
        }, 380);
      } else {
        setReelHighlightIdx(step);
      }
    }, 65);
  };

  const handleBuyDirectWeapon = async (offerId: string) => {
    if (busy) return;
    soundEngine.playMenuSelect();
    const offer = DIAMOND_EXCLUSIVE_WEAPON_OFFERS.find((o) => o.id === offerId);
    if (!offer) return;

    const wOwned =
      (syncState.profile.unlockedWeapons || []).includes(offer.weaponId) ||
      isWeaponOwnedInInventory(offer.weaponId, playerXp);
    const sOwned = isWeaponSkinOwned(offer.skinId);

    if (wOwned && sOwned) {
      equipWeaponSkin(offer.weaponId, offer.skinId);
      syncEquippedWeaponToInventory(offer.weaponId);
      onSelectWeapon(offer.weaponId);
      setStatusBanner({
        kind: 'ok',
        text: `${offer.weaponName} (${offer.skinName}) equipada no seu Loadout!`,
      });
      return;
    }

    if (diamonds < offer.diamondPrice) {
      setSection('RECARGA');
      setStatusBanner({
        kind: 'info',
        text: `Saldo insuficiente (${diamonds} 💎). Necessários ${offer.diamondPrice} 💎 para adquirir ${offer.weaponName}.`,
      });
      return;
    }

    setBusy(true);
    setStatusBanner(null);
    const res = await purchaseDirectWeaponOfferWithDiamonds(offerId);
    setBusy(false);

    if (!res.ok) {
      setStatusBanner({
        kind: 'err',
        text: res.error || 'Falha ao adquirir pacote de arma.',
      });
      return;
    }

    if (res.weaponId) {
      equipWeaponSkin(res.weaponId, offer.skinId);
      syncEquippedWeaponToInventory(res.weaponId);
      onSelectWeapon(res.weaponId);
    }
    setStatusBanner({
      kind: 'ok',
      text: `${offer.weaponName} (${offer.skinName}) desbloqueada permanentemente e equipada! (+${offer.bonusCash} K-Money)`,
    });
  };

  const handleBuyOrEquipOperator = async (operatorId: string) => {
    if (busy) return;
    soundEngine.playMenuSelect();
    const op = OPERATOR_CATALOG.find((o) => o.id === operatorId);
    if (!op) return;

    const unlocked = opState.unlockedOperatorIds.includes(op.id);
    if (unlocked) {
      equipOperatorSkin(op.id);
      setPreviewOpId(op.id);
      setStatusBanner({
        kind: 'ok',
        text: `Operador 3D "${op.name}" equipado no seu Lobby e Combate!`,
      });
      return;
    }

    if (diamonds < op.diamondPrice) {
      setSection('RECARGA');
      setStatusBanner({
        kind: 'info',
        text: `Saldo insuficiente (${diamonds} 💎). Necessários ${op.diamondPrice} 💎 para desbloquear ${op.name}.`,
      });
      return;
    }

    setBusy(true);
    setStatusBanner(null);
    const res = await purchaseOperatorWithDiamonds(op.id);
    setBusy(false);

    if (!res.ok) {
      setStatusBanner({
        kind: 'err',
        text: res.error || 'Falha ao desbloquear Operador.',
      });
      return;
    }

    setPreviewOpId(op.id);
    setStatusBanner({
      kind: 'ok',
      text: `OPERADOR 3D DESBLOQUEADO! "${op.name}" está ativo no seu Lobby 3D!`,
    });
  };

  const handleBuyOrEquipSkin = async (
    skinId: string,
    targetWeaponOverride?: WeaponId,
    useCash = false
  ) => {
    if (busy) return;
    soundEngine.playMenuSelect();
    const skin = WEAPON_SKIN_CATALOG.find((s) => s.id === skinId);
    if (!skin) return;

    const targetWeapon: WeaponId =
      targetWeaponOverride ||
      (skin.weaponIds && skin.weaponIds.length > 0
        ? skin.weaponIds[0]
        : previewSkinWeaponId);

    if (isWeaponSkinOwned(skin.id)) {
      equipWeaponSkin(targetWeapon, skin.id);
      syncEquippedWeaponToInventory(targetWeapon);
      onSelectWeapon(targetWeapon);
      setStatusBanner({
        kind: 'ok',
        text: `Skin "${skin.name}" equipada com sucesso!`,
      });
      return;
    }

    if (useCash) {
      if (playerCash < skin.cashPrice) {
        setStatusBanner({
          kind: 'err',
          text: `K-Money insuficiente ($ ${playerCash.toLocaleString('pt-BR')}). Necessários $ ${skin.cashPrice.toLocaleString('pt-BR')}.`,
        });
        return;
      }
      if (purchaseWeaponSkinWithCash(skin.id)) {
        equipWeaponSkin(targetWeapon, skin.id);
        syncEquippedWeaponToInventory(targetWeapon);
        onSelectWeapon(targetWeapon);
        setStatusBanner({
          kind: 'ok',
          text: `Skin "${skin.name}" adquirida com K-Money e equipada!`,
        });
      }
      return;
    }

    const dPrice = skin.diamondPrice || 220;
    if (diamonds < dPrice) {
      setSection('RECARGA');
      setStatusBanner({
        kind: 'info',
        text: `Diamantes insuficientes (${diamonds} 💎). Necessários ${dPrice} 💎 para desbloquear ${skin.name}.`,
      });
      return;
    }

    setBusy(true);
    setStatusBanner(null);
    const res = await purchaseWeaponSkinWithDiamonds(skin.id, targetWeapon);
    setBusy(false);

    if (!res.ok) {
      setStatusBanner({
        kind: 'err',
        text: res.error || 'Falha ao desbloquear Skin.',
      });
      return;
    }

    syncEquippedWeaponToInventory(targetWeapon);
    onSelectWeapon(targetWeapon);
    setStatusBanner({
      kind: 'ok',
      text: `Skin "${skin.name}" desbloqueada permanentemente e equipada na arma!`,
    });
  };

  const handleBuyOrEquipGear = (gearId: string) => {
    soundEngine.playMenuSelect();
    const item = GEAR_INVENTORY_CATALOG.find((g) => g.id === gearId);
    if (!item) return;

    const owned = isGearOwnedInInventory(item.id, playerXp);
    if (owned) {
      equipClassSlotItem(invState.selectedClass, item.slot, item.id);
      setStatusBanner({
        kind: 'ok',
        text: `${item.name} equipado na classe ${invState.selectedClass}!`,
      });
      return;
    }

    if (playerLevel < item.unlockLevel) {
      setStatusBanner({
        kind: 'info',
        text: `${item.name} requer Nível ${item.unlockLevel} (seu nível atual: ${playerLevel}).`,
      });
      return;
    }

    if (playerCash < item.cashPrice) {
      setStatusBanner({
        kind: 'err',
        text: `K-Money insuficiente ($ ${playerCash.toLocaleString('pt-BR')}). Necessários $ ${item.cashPrice.toLocaleString('pt-BR')}.`,
      });
      return;
    }

    if (purchaseGearWithCash(item.id)) {
      equipClassSlotItem(invState.selectedClass, item.slot, item.id);
      setStatusBanner({
        kind: 'ok',
        text: `${item.name} comprado por $ ${item.cashPrice.toLocaleString('pt-BR')} e equipado!`,
      });
    }
  };

  const handleEquipOptic = (opticId: OpticType) => {
    soundEngine.playMenuSelect();
    const spec = SCOPE_PACK_CATALOG[opticId];
    if (!isOpticCompatibleWithWeapon(activeWeapon, opticId)) {
      setStatusBanner({
        kind: 'info',
        text: `${spec.name} não é compatível com a arma equipada atual (${activeWeapon}).`,
      });
      return;
    }
    if (!isOpticUnlockedAtXp(opticId, playerXp)) {
      setStatusBanner({
        kind: 'info',
        text: `${spec.name} libera no Nível ${spec.unlockLevel}.`,
      });
      return;
    }
    equipWeaponOptic(activeWeapon, opticId);
    setStatusBanner({
      kind: 'ok',
      text: `Mira "${spec.name}" acoplada na arma equipada!`,
    });
  };

  const handleBuyRealDiamondPack = async (packId: string) => {
    if (busy) return;
    soundEngine.playMenuSelect();

    if (
      !syncState.isGoogleLinked ||
      !syncState.profile.uid ||
      syncState.profile.uid === 'local-guest'
    ) {
      setStatusBanner({
        kind: 'err',
        text: 'Vincule sua conta Google no Perfil para comprar pacotes em R$, ou resgate o Pacote Fundador Grátis acima.',
      });
      return;
    }

    setBusy(true);
    setStatusBanner(null);
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: syncState.profile.uid,
          packId,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        checkoutUrl?: string;
        error?: string;
      };
      if (data.ok && data.checkoutUrl) {
        setStatusBanner({
          kind: 'ok',
          text: 'Sessão Stripe Checkout gerada. Clique ao lado para concluir:',
          checkoutUrl: data.checkoutUrl,
        });
      } else {
        setStatusBanner({
          kind: 'info',
          text:
            data.error ||
            'Gateway Stripe / Google Play Billing pronto para produção. Use o Bônus Fundador (+1.500 💎) acima para testar toda a loja!',
        });
      }
    } catch {
      setStatusBanner({
        kind: 'err',
        text: 'Falha ao contatar servidor de pagamentos.',
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedOperatorDef =
    OPERATOR_CATALOG.find((o) => o.id === previewOpId) || OPERATOR_CATALOG[0];

  const SIDEBAR_TABS: Array<{ id: InternalStoreTab; label: string }> = [
    { id: 'DESTAQUES', label: 'DESTAQUES' },
    { id: 'SKINS', label: 'SKINS' },
    { id: 'ARMAS', label: 'ARMAS' },
    { id: 'ACESSORIOS', label: 'ACESSÓRIOS' },
    { id: 'CAIXAS', label: 'CAIXAS' },
    { id: 'PASSE_VIP', label: 'PASSE VIP' },
    { id: 'RECARGA', label: 'RECARGA' },
  ];

  // Featured Row 1 state checks
  const aemondirOwned = isWeaponSkinOwned('shotgun_aemondir_legion');
  const aemondirEquipped =
    activeWeapon === 'SHOTGUN_12' &&
    getEquippedWeaponSkinId('SHOTGUN_12') === 'shotgun_aemondir_legion';

  const v18Owned =
    ((syncState.profile.unlockedWeapons || []).includes('SMG_45') ||
      isWeaponOwnedInInventory('SMG_45', playerXp)) &&
    isWeaponSkinOwned('camo_crimson_ops');
  const v18Equipped = activeWeapon === 'SMG_45';

  const spectreOp =
    OPERATOR_CATALOG.find((o) => o.id === 'op_blackwood_spectre') ||
    OPERATOR_CATALOG[1] ||
    OPERATOR_CATALOG[0];
  const spectreOwned = opState.unlockedOperatorIds.includes(spectreOp.id);
  const spectreEquipped = opState.activeOperatorId === spectreOp.id;

  const akSkinOwned = isWeaponSkinOwned('camo_crimson_ops');
  const akSkinEquipped =
    activeWeapon === 'AK12_RIFLE' &&
    getEquippedWeaponSkinId('AK12_RIFLE') === 'camo_crimson_ops';

  const m4SkinOwned = isWeaponSkinOwned('camo_cyber_cobalt');
  const m4SkinEquipped =
    activeWeapon === 'M4_CARBINE' &&
    getEquippedWeaponSkinId('M4_CARBINE') === 'camo_cyber_cobalt';

  // Sort weapon skins so shotgun_aemondir_legion is always #1 in SKINS tab
  const sortedWeaponSkins = [...WEAPON_SKIN_CATALOG]
    .filter((s) => s.id !== 'default')
    .sort((a, b) => {
      if (a.id === 'shotgun_aemondir_legion') return -1;
      if (b.id === 'shotgun_aemondir_legion') return 1;
      return 0;
    });

  return (
    <div className="w-full h-full bg-[#06080d] pointer-events-auto flex overflow-hidden select-none">
      {/* =================================================================== */}
      {/* LEFT VERTICAL SIDEBAR — EXACTLY MATCHING REFERENCE IMAGE            */}
      {/* =================================================================== */}
      <aside className="w-[152px] sm:w-[196px] lg:w-[216px] shrink-0 h-full bg-gradient-to-b from-[#0b0e15] via-[#080a0f] to-[#06070b] border-r border-white/10 flex flex-col justify-between overflow-y-auto no-scrollbar">
        <div>
          {/* LOJA Header + Back to Menu */}
          <div className="px-3 sm:px-4 pt-3 pb-2.5 border-b border-white/10">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 24 24"
                  className="w-6 h-6 sm:w-7 sm:h-7 text-white shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="9" cy="20" r="1.5" fill="currentColor" />
                  <circle cx="18" cy="20" r="1.5" fill="currentColor" />
                  <path d="M2 3h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h9.4a1.5 1.5 0 0 0 1.4-1.1L21.5 7H6.2" />
                </svg>
                <span className="font-display font-black italic text-xl sm:text-2xl tracking-wider text-white uppercase leading-none">
                  LOJA
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  onClose();
                }}
                className="px-2 py-1 rounded bg-white/10 hover:bg-red-600/80 border border-white/15 text-[9px] font-mono font-bold text-slate-200 hover:text-white uppercase cursor-pointer transition-colors"
                title="Voltar ao Lobby Principal"
              >
                ← MENU
              </button>
            </div>
          </div>

          {/* 7 Vertical Category Tabs */}
          <nav className="flex flex-col divide-y divide-white/[0.06]">
            {SIDEBAR_TABS.map((tab) => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    if (tab.id === 'PASSE_VIP' && onOpenVipPass) {
                      setSection('PASSE_VIP');
                    } else {
                      setSection(tab.id);
                    }
                  }}
                  className={`relative w-full px-3 sm:px-4 py-3 sm:py-3.5 flex items-center gap-2.5 sm:gap-3 text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-gradient-to-r from-[#8b1019]/85 via-[#470910]/60 to-transparent text-white shadow-[inset_4px_0_20px_rgba(239,68,68,0.45)]'
                      : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-0 bottom-0 w-[3.5px] bg-red-500 shadow-[0_0_12px_#ef4444]" />
                  )}
                  <SidebarIcon id={tab.id} active={active} />
                  <span
                    className={`font-display font-black text-xs sm:text-[13px] tracking-wider uppercase ${
                      active ? 'text-white' : 'text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </span>
                  {tab.id === 'RECARGA' && !syncState.profile.founderDiamondsClaimed && (
                    <span className="ml-auto px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-mono font-black text-[8px] animate-pulse">
                      GRÁTIS
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom-Left Golden "SEJA VIP" Promo Card */}
        <div className="p-2.5 sm:p-3">
          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuSelect();
              if (onOpenVipPass) {
                onOpenVipPass();
              } else {
                setSection('PASSE_VIP');
              }
            }}
            className="relative w-full rounded-lg border border-amber-400/75 bg-gradient-to-b from-[#2f1f07] via-[#170f04] to-[#291704] hover:from-[#3d290a] hover:border-amber-300 p-3 text-center overflow-hidden shadow-[0_0_24px_rgba(245,158,11,0.22)] cursor-pointer transition-all group"
          >
            {/* Subtle top red/gold sheen */}
            <div className="pointer-events-none absolute -top-6 -left-6 w-20 h-20 rounded-full bg-red-500/20 blur-xl" />
            <div className="pointer-events-none absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-amber-400/25 blur-xl" />

            {/* Crown SVG */}
            <div className="flex justify-center mb-1">
              <svg
                viewBox="0 0 36 26"
                className="w-8 h-6 drop-shadow-[0_0_10px_rgba(250,204,21,0.65)]"
                fill="none"
              >
                <path
                  d="M4 21L2 7l9 6 7-10 7 10 9-6-2 14H4z"
                  fill="url(#crownGrad)"
                  stroke="#fef08a"
                  strokeWidth="1.2"
                />
                <rect x="5" y="21" width="26" height="3.2" rx="1" fill="#f59e0b" />
                <defs>
                  <linearGradient id="crownGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fef08a" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="font-display font-black italic text-base sm:text-lg tracking-wider text-amber-300 uppercase leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
              SEJA VIP
            </div>
            <div className="mt-1 text-[9px] sm:text-[10px] font-display font-bold text-amber-50/90 uppercase leading-tight">
              E GANHE VANTAGENS
              <br />
              EXCLUSIVAS!
            </div>

            {/* Bottom-right corner gold chevron */}
            <span className="absolute right-2 bottom-1.5 text-amber-400 font-black text-sm group-hover:translate-x-0.5 transition-transform">
              ›
            </span>
          </button>
        </div>
      </aside>

      {/* =================================================================== */}
      {/* RIGHT MAIN STORE CONTENT                                            */}
      {/* =================================================================== */}
      <div className="flex-1 min-w-0 h-full overflow-y-auto bg-[radial-gradient(ellipse_at_top_right,rgba(153,27,27,0.16),transparent_48%),radial-gradient(ellipse_at_bottom_left,rgba(15,23,42,0.5),#05070b_70%)] p-2.5 sm:p-3.5 lg:p-4 flex flex-col gap-3">
        {/* Global Action / Purchase Status Banner */}
        {statusBanner && (
          <div
            className={`px-3.5 py-2 rounded-lg border text-[11px] font-mono flex flex-wrap items-center justify-between gap-2 shrink-0 ${
              statusBanner.kind === 'ok'
                ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
                : statusBanner.kind === 'err'
                  ? 'bg-red-500/15 border-red-400/50 text-red-200'
                  : 'bg-sky-500/15 border-sky-400/45 text-sky-200'
            }`}
          >
            <span>{statusBanner.text}</span>
            <div className="flex items-center gap-2">
              {statusBanner.checkoutUrl && (
                <a
                  href={statusBanner.checkoutUrl}
                  target="_top"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded bg-emerald-400 text-slate-950 font-display font-black text-[10px] uppercase"
                >
                  FINALIZAR PAGAMENTO →
                </a>
              )}
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-slate-400 hover:text-white cursor-pointer text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 1: DESTAQUES — 1:1 LAYOUT FROM ATTACHED REFERENCE IMAGE       */}
        {/* ================================================================= */}
        {section === 'DESTAQUES' && (
          <div className="flex flex-col gap-2.5 flex-1">
            {/* 1. TOP HERO BANNER ("PACOTE LENDÁRIO") */}
            <div className="relative rounded-xl border border-red-500/50 bg-gradient-to-r from-[#3a070f] via-[#130b1f] to-[#1e0717] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.75)] min-h-[168px] sm:min-h-[196px] flex items-center">
              {/* Atmospheric Lightning & Glow Layers */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(239,68,68,0.42),transparent_42%),radial-gradient(circle_at_80%_55%,rgba(139,92,246,0.38),transparent_45%),radial-gradient(circle_at_95%_85%,rgba(239,68,68,0.45),transparent_35%)]" />

              {/* Top-Right "POR TEMPO LIMITADO" Tag */}
              <div className="absolute top-0 right-0 z-20 flex flex-col items-end">
                <div className="bg-gradient-to-r from-red-600 to-red-700 px-3 sm:px-4 py-1 text-[9px] sm:text-[10px] font-display font-black tracking-wider text-white uppercase shadow-[0_4px_16px_rgba(220,38,38,0.65)] rounded-bl-md">
                  POR TEMPO LIMITADO
                </div>
                <div className="mt-1 mr-2 px-2 py-0.5 rounded bg-black/75 border border-red-500/40 text-[10px] font-mono font-bold text-slate-100 flex items-center gap-1">
                  <span>🕒</span>
                  <span>{activeHero.timer}</span>
                </div>
              </div>

              {/* Banner Inner 3-Column Composition */}
              <div className="relative z-10 w-full grid grid-cols-12 items-center px-3 sm:px-5 py-2 gap-2">
                {/* Left: Live 3D Operator Showcase */}
                <div className="hidden sm:block col-span-3 h-[168px] lg:h-[186px] -my-2 relative">
                  <RankedOperator3DCanvas
                    activeWeapon={activeHero.operatorWeapon}
                    weaponSkinId={activeHero.weaponTop.skinId}
                    operatorSkinId={activeHero.operatorId}
                  />
                </div>

                {/* Center: PACOTE LENDÁRIO Headline + Slanted Gold CTA */}
                <div className="col-span-7 sm:col-span-5 flex flex-col items-start sm:items-center text-left sm:text-center py-2">
                  <div className="font-display font-black italic text-xs sm:text-sm tracking-[0.22em] text-white uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                    {activeHero.eyebrow}
                  </div>
                  <h2 className="font-display font-black italic text-3xl sm:text-4xl lg:text-5xl tracking-tight uppercase leading-[0.92] bg-gradient-to-b from-white via-red-100 to-red-500 bg-clip-text text-transparent drop-shadow-[0_4px_18px_rgba(239,68,68,0.65)] -skew-x-6 pr-2">
                    {activeHero.title}
                  </h2>
                  <p className="mt-1.5 font-display font-bold italic text-[10px] sm:text-xs tracking-wider text-slate-100 uppercase drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                    {activeHero.subtitle}
                  </p>

                  <div className="mt-3 w-44 sm:w-48">
                    <GoldSlantedButton
                      label="COMPRE JÁ! ›"
                      disabled={busy}
                      onClick={() =>
                        void handleBuyDirectWeapon(activeHero.primaryOfferId)
                      }
                      className="py-2 text-xs sm:text-sm"
                    />
                  </div>
                </div>

                {/* Right: Glowing Stacked 3D Weapon Showcase */}
                <div className="col-span-5 sm:col-span-4 flex flex-col items-end justify-center gap-1 pr-1 sm:pr-4 pt-4 sm:pt-2">
                  <WeaponPreview3D
                    weaponId={activeHero.weaponTop.id}
                    skinId={activeHero.weaponTop.skinId}
                    className="w-full max-w-[195px] h-14 sm:h-16 drop-shadow-[0_0_16px_rgba(239,68,68,0.75)] -rotate-6"
                  />
                  <WeaponPreview3D
                    weaponId={activeHero.weaponMid.id}
                    skinId={activeHero.weaponMid.skinId}
                    className="w-full max-w-[210px] h-14 sm:h-16 drop-shadow-[0_0_18px_rgba(139,92,246,0.8)] -rotate-3"
                  />
                </div>
              </div>
            </div>

            {/* Carousel Dots */}
            <div className="flex items-center justify-center gap-1.5 py-0.5">
              {HERO_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  aria-label={s.title}
                  onClick={() => {
                    soundEngine.playMenuHover();
                    setHeroSlideIdx(idx);
                  }}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    idx === heroSlideIdx
                      ? 'w-6 bg-red-500 shadow-[0_0_8px_#ef4444]'
                      : 'w-2 bg-white/25 hover:bg-white/45'
                  }`}
                />
              ))}
            </div>

            {/* 2. ROW 1 — 5 FEATURED DARK OBSIDIAN CARDS */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
              {/* CARD 1: SHOTGUN AEMONDIR BUCKY (NEW FIRST SHOTGUN SKIN!) */}
              <div className="relative rounded-lg border border-red-500/45 hover:border-red-400 bg-gradient-to-b from-[#161925] via-[#0e111a] to-[#230a10] p-2.5 flex flex-col justify-between gap-2 overflow-hidden transition-all shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-red-600 text-white font-display font-black text-[8px] tracking-wider uppercase shadow-[0_0_10px_rgba(239,68,68,0.7)]">
                  NOVO
                </span>
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase pr-6">
                  SHOTGUN - AEMONDIR
                </div>
                <div className="h-28 sm:h-32 flex items-center justify-center relative">
                  <div className="pointer-events-none absolute inset-x-4 bottom-1 h-8 rounded-full bg-red-600/25 blur-lg" />
                  <WeaponPreview3D
                    weaponId="SHOTGUN_12"
                    skinId="shotgun_aemondir_legion"
                    className="w-full h-24 sm:h-28 drop-shadow-[0_6px_16px_rgba(245,158,11,0.45)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        350 💎
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-amber-300 uppercase">
                      LENDÁRIA
                    </span>
                  </div>
                  <GoldSlantedButton
                    label={
                      aemondirEquipped
                        ? 'EQUIPADO ✓'
                        : aemondirOwned
                          ? 'EQUIPAR'
                          : 'COMPRAR'
                    }
                    variant={aemondirEquipped ? 'equipped' : 'gold'}
                    disabled={busy}
                    onClick={() =>
                      void handleBuyDirectWeapon('offer_shotgun_aemondir')
                    }
                  />
                </div>
              </div>

              {/* CARD 2: NOVA ARMA DE ENGENHEIRO — V18 SPECTRE SILENCIADA */}
              <div className="relative rounded-lg border border-sky-500/40 hover:border-sky-400 bg-gradient-to-b from-[#141926] via-[#0e111a] to-[#1a0a16] p-2.5 flex flex-col justify-between gap-2 overflow-hidden transition-all shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-sky-500 text-slate-950 font-display font-black text-[8px] tracking-wider uppercase shadow-[0_0_10px_rgba(56,189,248,0.7)]">
                  ENGENHEIRO
                </span>
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase pr-8">
                  V18 SPECTRE SILENCIADA
                </div>
                <div className="h-28 sm:h-32 flex items-center justify-center relative">
                  <div className="pointer-events-none absolute inset-x-4 bottom-1 h-8 rounded-full bg-sky-500/25 blur-lg" />
                  <WeaponPreview3D
                    weaponId="SMG_45"
                    skinId="default"
                    className="w-full h-24 sm:h-28 drop-shadow-[0_6px_16px_rgba(56,189,248,0.45)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        420 💎
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-sky-300 uppercase">
                      NOVA V18
                    </span>
                  </div>
                  <GoldSlantedButton
                    label={
                      v18Equipped
                        ? 'EQUIPADO ✓'
                        : v18Owned
                          ? 'EQUIPAR'
                          : 'COMPRAR'
                    }
                    variant={v18Equipped ? 'equipped' : 'gold'}
                    disabled={busy}
                    onClick={() =>
                      void handleBuyDirectWeapon('offer_v18_spectre_eng')
                    }
                  />
                </div>
              </div>

              {/* CARD 3: SKIN DE PERSONAGEM (3D OPERATOR) */}
              <div className="relative rounded-lg border border-white/15 hover:border-red-500/75 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#210a0f] p-2.5 flex flex-col justify-between gap-2 overflow-hidden transition-all shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase">
                  SKIN DE PERSONAGEM
                </div>
                <div className="h-28 sm:h-32 flex items-center justify-center relative overflow-hidden rounded">
                  <div className="pointer-events-none absolute inset-x-4 bottom-0 h-10 rounded-full bg-red-600/30 blur-lg" />
                  <RankedOperator3DCanvas
                    activeWeapon="AK12_RIFLE"
                    weaponSkinId="camo_crimson_ops"
                    operatorSkinId={spectreOp.id}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        {spectreOp.diamondPrice} 💎
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-red-300 uppercase truncate max-w-[72px]">
                      {spectreOp.codename}
                    </span>
                  </div>
                  <GoldSlantedButton
                    label={
                      spectreEquipped
                        ? 'EQUIPADO ✓'
                        : spectreOwned
                          ? 'EQUIPAR'
                          : 'COMPRAR'
                    }
                    variant={spectreEquipped ? 'equipped' : 'gold'}
                    disabled={busy}
                    onClick={() => void handleBuyOrEquipOperator(spectreOp.id)}
                  />
                </div>
              </div>

              {/* CARD 4: SKIN DE ARMA - AK-12 */}
              <div className="relative rounded-lg border border-white/15 hover:border-red-500/75 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#210a0f] p-2.5 flex flex-col justify-between gap-2 overflow-hidden transition-all shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase">
                  SKIN DE ARMA - AK-12
                </div>
                <div className="h-28 sm:h-32 flex items-center justify-center relative">
                  <div className="pointer-events-none absolute inset-x-4 bottom-1 h-8 rounded-full bg-red-600/25 blur-lg" />
                  <WeaponPreview3D
                    weaponId="AK12_RIFLE"
                    skinId="camo_crimson_ops"
                    className="w-full h-24 sm:h-28 drop-shadow-[0_6px_14px_rgba(239,68,68,0.45)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        220 💎
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-slate-300 uppercase">
                      RUBRO
                    </span>
                  </div>
                  <GoldSlantedButton
                    label={
                      akSkinEquipped
                        ? 'EQUIPADO ✓'
                        : akSkinOwned
                          ? 'EQUIPAR'
                          : 'COMPRAR'
                    }
                    variant={akSkinEquipped ? 'equipped' : 'gold'}
                    disabled={busy}
                    onClick={() =>
                      void handleBuyOrEquipSkin('camo_crimson_ops', 'AK12_RIFLE')
                    }
                  />
                </div>
              </div>

              {/* CARD 5: SKIN DE ARMA - M4A1 */}
              <div className="relative rounded-lg border border-white/15 hover:border-violet-400/75 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#1a0d26] p-2.5 flex flex-col justify-between gap-2 overflow-hidden transition-all shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase">
                  SKIN DE ARMA - M4A1
                </div>
                <div className="h-28 sm:h-32 flex items-center justify-center relative">
                  <div className="pointer-events-none absolute inset-x-4 bottom-1 h-8 rounded-full bg-violet-500/30 blur-lg" />
                  <WeaponPreview3D
                    weaponId="M4_CARBINE"
                    skinId="camo_cyber_cobalt"
                    className="w-full h-24 sm:h-28 drop-shadow-[0_6px_14px_rgba(99,102,241,0.5)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        260 💎
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-sky-300 uppercase">
                      COBALTO
                    </span>
                  </div>
                  <GoldSlantedButton
                    label={
                      m4SkinEquipped
                        ? 'EQUIPADO ✓'
                        : m4SkinOwned
                          ? 'EQUIPAR'
                          : 'COMPRAR'
                    }
                    variant={m4SkinEquipped ? 'equipped' : 'gold'}
                    disabled={busy}
                    onClick={() =>
                      void handleBuyOrEquipSkin('camo_cyber_cobalt', 'M4_CARBINE')
                    }
                  />
                </div>
              </div>
            </div>

            {/* 3. ROW 2 — 3 CARDS + 2-COLUMN RECHARGE BANNER */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
              {/* CARD 6: MOCHILA & ACESSÓRIOS TÁTICOS */}
              <div className="relative rounded-lg border border-white/15 hover:border-red-500/75 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#210a0f] p-2.5 flex flex-col justify-between gap-2 overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase">
                  MOCHILA TÁTICA
                </div>
                <div className="h-24 sm:h-28 flex items-center justify-center">
                  <TacticalGearArtwork />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 px-0.5">
                    <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center">
                      $
                    </span>
                    <span className="font-display font-black text-xs text-white tabular-nums">
                      $ 650+
                    </span>
                  </div>
                  <GoldSlantedButton
                    label="COMPRAR"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      setSection('ACESSORIOS');
                    }}
                  />
                </div>
              </div>

              {/* CARD 7: CAIXA DE SKINS (WARBOXES) */}
              <div className="relative rounded-lg border border-white/15 hover:border-red-500/75 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#210a0f] p-2.5 flex flex-col justify-between gap-2 overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase">
                  CAIXA DE SKINS
                </div>
                <div className="h-24 sm:h-28 flex items-center justify-center">
                  <TacticalCrateArtwork />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        120 💎
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-amber-300 uppercase">
                      BAÚ %
                    </span>
                  </div>
                  <GoldSlantedButton
                    label="COMPRAR"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      setSection('CAIXAS');
                    }}
                  />
                </div>
              </div>

              {/* CARD 8: PASSE VIP */}
              <div className="relative rounded-lg border border-amber-500/35 hover:border-amber-400 bg-gradient-to-b from-[#1a150b] via-[#110e09] to-[#211507] p-2.5 flex flex-col justify-between gap-2 overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.65)]">
                <div className="font-display font-black text-[11px] tracking-wide text-white text-center uppercase">
                  PASSE VIP
                </div>
                <div className="h-24 sm:h-28 flex items-center justify-center">
                  <VipCrestArtwork />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1.5">
                      <DiamondGemIcon className="w-4 h-4" />
                      <span className="font-display font-black text-xs text-white tabular-nums">
                        R$ 29,90
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-amber-300 uppercase">
                      MENSAL
                    </span>
                  </div>
                  <GoldSlantedButton
                    label="COMPRAR"
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      if (onOpenVipPass) {
                        onOpenVipPass();
                      } else {
                        setSection('PASSE_VIP');
                      }
                    }}
                  />
                </div>
              </div>

              {/* BOTTOM-RIGHT 2-COLUMN WIDE BANNER: RECARGA SEUS DIAMANTES */}
              <div className="col-span-2 relative rounded-lg border border-sky-400/45 bg-gradient-to-r from-[#0d111b] via-[#0c1a33] to-[#0a2352] p-3.5 sm:p-4 flex items-center justify-between gap-3 overflow-hidden shadow-[0_8px_28px_rgba(14,165,233,0.2)]">
                <div className="pointer-events-none absolute -right-8 -bottom-8 w-44 h-44 rounded-full bg-sky-400/25 blur-2xl" />
                <div className="relative z-10 flex flex-col items-start justify-between h-full gap-2 max-w-[60%]">
                  <div>
                    <div className="font-display font-black italic text-xl sm:text-2xl tracking-tight text-white uppercase leading-none">
                      RECARGA
                    </div>
                    <div className="font-display font-black italic text-sm sm:text-base tracking-wide text-sky-200 uppercase leading-tight mt-0.5">
                      SEUS DIAMANTES
                    </div>
                    <p className="mt-1.5 text-[10px] sm:text-[11px] font-display font-bold text-slate-200 uppercase leading-tight">
                      E APROVEITE TODAS AS VANTAGENS!
                    </p>
                  </div>

                  {!syncState.profile.founderDiamondsClaimed ? (
                    <div className="w-44 sm:w-48">
                      <GoldSlantedButton
                        label="RESGATAR +1.500 💎 ›"
                        disabled={busy}
                        onClick={() => void handleClaimFounderDiamonds()}
                        className="py-2 text-[11px] animate-pulse"
                      />
                    </div>
                  ) : (
                    <div className="w-44 sm:w-48">
                      <GoldSlantedButton
                        label="RECARGAR AGORA ›"
                        onClick={() => {
                          soundEngine.playMenuSelect();
                          setSection('RECARGA');
                        }}
                        className="py-2 text-[11px]"
                      />
                    </div>
                  )}
                </div>

                <div className="relative z-10 hidden sm:flex items-center justify-end">
                  <DiamondChestArtwork />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: SKINS (SHOTGUN AEMONDIR + TODAS AS SKINS + OPERADORES 3D)  */}
        {/* ================================================================= */}
        {section === 'SKINS' && (
          <div className="flex flex-col gap-4">
            {/* Highlight Banner: Primeira Skin Shotgun Aemondir */}
            <div className="rounded-xl border border-amber-400/55 bg-gradient-to-r from-[#2c0910] via-[#170f16] to-[#1e1408] p-3.5 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-36 sm:w-44 h-24 rounded-lg bg-black/50 border border-amber-400/35 p-2 flex items-center justify-center shrink-0">
                  <WeaponPreview3D
                    weaponId="SHOTGUN_12"
                    skinId="shotgun_aemondir_legion"
                    className="w-full h-full"
                  />
                </div>
                <div className="min-w-0">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-display font-black text-[9px] uppercase tracking-wider">
                    PRIMEIRA SKIN 3D DE SHOTGUN · LENDÁRIA
                  </span>
                  <h3 className="font-display font-black text-base sm:text-xl text-white uppercase mt-1">
                    AEMONDIR BUCKY LEGION (DRAKE-12)
                  </h3>
                  <p className="text-[11px] font-mono text-slate-300 mt-0.5">
                    Chassi dracônico em bronze imperial com runas incandescentes e baioneta acoplada.
                  </p>
                </div>
              </div>
              <div className="w-full md:w-52 shrink-0 flex flex-col gap-1.5">
                <GoldSlantedButton
                  label={
                    aemondirEquipped
                      ? 'EQUIPADA ✓'
                      : aemondirOwned
                        ? 'EQUIPAR NA SHOTGUN'
                        : 'COMPRAR · 350 💎'
                  }
                  variant={aemondirEquipped ? 'equipped' : 'gold'}
                  disabled={busy}
                  onClick={() =>
                    void handleBuyOrEquipSkin('shotgun_aemondir_legion', 'SHOTGUN_12')
                  }
                  className="py-2.5"
                />
              </div>
            </div>

            {/* Seletor de Arma para Preview das Skins Universais */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-2.5">
              <span className="text-[11px] font-display font-bold text-slate-200 uppercase">
                SKINS DE ARMAS (PREVIEW 3D EM TEMPO REAL):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    'SHOTGUN_12',
                    'SMG_45',
                    'M4_CARBINE',
                    'AK12_RIFLE',
                    'SNIPER_HEAVY',
                    'SHOTGUN_SPAS',
                  ] as WeaponId[]
                ).map((wId) => (
                  <button
                    key={wId}
                    type="button"
                    onClick={() => {
                      soundEngine.playMenuHover();
                      setPreviewSkinWeaponId(wId);
                    }}
                    className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold uppercase cursor-pointer transition-colors ${
                      previewSkinWeaponId === wId
                        ? 'bg-red-600 text-white border border-red-400'
                        : 'bg-white/[0.05] text-slate-300 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {wId === 'SMG_45'
                      ? 'V18 SPECTRE'
                      : wId === 'SHOTGUN_12'
                        ? 'SHOTGUN 12'
                        : wId.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid de Skins de Armas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sortedWeaponSkins.map((skin) => {
                const targetW: WeaponId =
                  skin.weaponIds && skin.weaponIds.length > 0
                    ? skin.weaponIds[0]
                    : previewSkinWeaponId;
                const owned = isWeaponSkinOwned(skin.id);
                const equipped = getEquippedWeaponSkinId(targetW) === skin.id;
                const dPrice = skin.diamondPrice || 220;

                return (
                  <div
                    key={skin.id}
                    className="rounded-lg border border-white/15 hover:border-red-500/70 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#1e0a10] p-3 flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-red-600/25 border border-red-400/50 text-[8px] font-display font-black text-red-200 uppercase">
                          {skin.rarity}
                        </span>
                        <div className="flex items-center gap-1">
                          {skin.swatchColors.map((hex, i) => (
                            <span
                              key={i}
                              className="w-2.5 h-2.5 rounded-full border border-white/30"
                              style={{ backgroundColor: hex }}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="font-display font-black text-xs text-white uppercase truncate">
                        {skin.name}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 truncate">
                        {skin.weaponIds?.includes('SHOTGUN_12')
                          ? 'Exclusiva Drake-12 Breacher'
                          : skin.weaponIds?.includes('SHOTGUN_SPAS')
                            ? 'Exclusiva SPAS-12'
                            : 'Camuflagem Universal'}
                      </div>

                      <div className="my-2 h-24 rounded-lg bg-black/40 border border-white/5 flex items-center justify-center p-2">
                        <WeaponPreview3D
                          weaponId={targetW}
                          skinId={skin.id}
                          className="w-full h-full"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {!owned && (
                        <div className="flex items-center justify-between text-xs font-display font-black text-white">
                          <span className="flex items-center gap-1">
                            <DiamondGemIcon className="w-3.5 h-3.5" />
                            {dPrice} 💎
                          </span>
                          {skin.cashPrice > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleBuyOrEquipSkin(skin.id, targetW, true)
                              }
                              className="text-[10px] font-mono text-amber-300 hover:text-amber-200 underline cursor-pointer"
                            >
                              ou $ {skin.cashPrice.toLocaleString('pt-BR')}
                            </button>
                          )}
                        </div>
                      )}

                      <GoldSlantedButton
                        label={
                          equipped
                            ? 'EQUIPADA ✓'
                            : owned
                              ? 'EQUIPAR SKIN'
                              : `COMPRAR · ${dPrice} 💎`
                        }
                        variant={equipped ? 'equipped' : 'gold'}
                        disabled={busy}
                        onClick={() =>
                          void handleBuyOrEquipSkin(skin.id, targetW, false)
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Seção de Operadores 3D (Skins de Personagem) */}
            <div className="pt-2 border-t border-white/10">
              <div className="font-display font-black text-sm text-white uppercase tracking-wider mb-3">
                SKINS DE PERSONAGEM — OPERADORES 3D
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
                <div className="lg:col-span-5 rounded-xl border border-red-500/40 bg-gradient-to-b from-[#1e090e]/85 via-[#0b0f19]/95 to-[#06080d] p-3.5 flex flex-col justify-between min-h-[320px]">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-red-500/25 border border-red-400/50 text-[9px] font-mono font-bold text-red-200 uppercase">
                      {selectedOperatorDef.faction} · {selectedOperatorDef.codename}
                    </span>
                    <h4 className="font-display font-black text-base text-white uppercase mt-1">
                      {selectedOperatorDef.name}
                    </h4>
                    <p className="text-[10px] font-mono text-amber-300">
                      {selectedOperatorDef.perkLabel}
                    </p>
                  </div>
                  <div className="h-[220px] my-1">
                    <RankedOperator3DCanvas
                      activeWeapon={activeWeapon}
                      operatorSkinId={selectedOperatorDef.id}
                    />
                  </div>
                  <GoldSlantedButton
                    label={
                      opState.activeOperatorId === selectedOperatorDef.id
                        ? 'OPERADOR EQUIPADO ✓'
                        : opState.unlockedOperatorIds.includes(
                              selectedOperatorDef.id
                            )
                          ? 'EQUIPAR OPERADOR'
                          : `DESBLOQUEAR · ${selectedOperatorDef.diamondPrice} 💎`
                    }
                    variant={
                      opState.activeOperatorId === selectedOperatorDef.id
                        ? 'equipped'
                        : 'gold'
                    }
                    disabled={busy}
                    onClick={() =>
                      void handleBuyOrEquipOperator(selectedOperatorDef.id)
                    }
                  />
                </div>

                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {OPERATOR_CATALOG.map((op) => {
                    const unlocked = opState.unlockedOperatorIds.includes(op.id);
                    const equipped = opState.activeOperatorId === op.id;
                    const selected = previewOpId === op.id;
                    return (
                      <div
                        key={op.id}
                        onClick={() => {
                          soundEngine.playMenuHover();
                          setPreviewOpId(op.id);
                        }}
                        className={`rounded-lg border p-3 flex flex-col justify-between gap-2 cursor-pointer transition-all ${
                          selected
                            ? 'border-red-400 bg-gradient-to-b from-red-950/50 to-[#0c1018]'
                            : 'border-white/15 bg-white/[0.03] hover:border-white/30'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] font-mono font-bold text-amber-300 uppercase">
                              {op.rarity}
                            </span>
                            <span className="text-[10px] font-mono text-sky-300 font-bold">
                              {unlocked ? 'LIBERADO' : `${op.diamondPrice} 💎`}
                            </span>
                          </div>
                          <div className="font-display font-black text-xs text-white uppercase mt-0.5">
                            {op.name}
                          </div>
                          <p className="text-[10px] font-mono text-slate-400 mt-1 line-clamp-2">
                            {op.description}
                          </p>
                        </div>
                        <GoldSlantedButton
                          label={
                            equipped
                              ? 'EQUIPADO ✓'
                              : unlocked
                                ? 'EQUIPAR'
                                : `COMPRAR · ${op.diamondPrice} 💎`
                          }
                          variant={equipped ? 'equipped' : 'gold'}
                          disabled={busy}
                          onClick={() => void handleBuyOrEquipOperator(op.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: ARMAS (PACOTES DIRETOS COM DIAMANTES)                      */}
        {/* ================================================================= */}
        {section === 'ARMAS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {DIAMOND_EXCLUSIVE_WEAPON_OFFERS.map((offer) => {
              const wOwned =
                (syncState.profile.unlockedWeapons || []).includes(
                  offer.weaponId
                ) || isWeaponOwnedInInventory(offer.weaponId, playerXp);
              const sOwned = isWeaponSkinOwned(offer.skinId);
              const fullyOwned = wOwned && sOwned;
              const isEquipped =
                activeWeapon === offer.weaponId &&
                getEquippedWeaponSkinId(offer.weaponId) === offer.skinId;

              return (
                <div
                  key={offer.id}
                  className={`rounded-lg border p-3 flex flex-col justify-between gap-2.5 ${
                    offer.rarity === 'LENDARIO'
                      ? 'bg-gradient-to-b from-[#1f1609] via-[#0e111a] to-[#210a0f] border-amber-400/55'
                      : 'bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#210a0f] border-white/15'
                  }`}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-display font-black uppercase ${
                          offer.rarity === 'LENDARIO'
                            ? 'bg-amber-400 text-slate-950'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {offer.rarity}
                      </span>
                      <span className="text-[9px] font-mono text-slate-300">
                        {offer.caliber}
                      </span>
                    </div>

                    <div className="font-display font-black text-xs sm:text-sm text-white uppercase leading-tight">
                      {offer.weaponName}
                    </div>
                    <div className="text-[10px] font-mono text-amber-300">
                      Skin: {offer.skinName} · +${offer.bonusCash}
                    </div>

                    <div className="h-28 rounded-lg bg-black/45 border border-white/5 flex items-center justify-center p-2 my-1">
                      <WeaponPreview3D
                        weaponId={offer.weaponId}
                        skinId={offer.skinId}
                        className="w-full h-full"
                      />
                    </div>

                    <p className="text-[10px] font-mono text-slate-300 leading-snug line-clamp-3">
                      {offer.highlightDesc}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-1">
                    {!fullyOwned && (
                      <div className="flex items-center gap-1.5">
                        <DiamondGemIcon className="w-4 h-4" />
                        <span className="font-display font-black text-xs text-white tabular-nums">
                          {offer.diamondPrice} 💎
                        </span>
                      </div>
                    )}
                    <GoldSlantedButton
                      label={
                        isEquipped
                          ? 'EQUIPADA ✓'
                          : fullyOwned
                            ? 'EQUIPAR ARMA + SKIN'
                            : 'COMPRAR'
                      }
                      variant={isEquipped ? 'equipped' : 'gold'}
                      disabled={busy}
                      onClick={() => void handleBuyDirectWeapon(offer.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: ACESSÓRIOS (EQUIPAMENTO TÁTICO + MIRAS ÓPTICAS 3D)         */}
        {/* ================================================================= */}
        {section === 'ACESSORIOS' && (
          <div className="flex flex-col gap-4">
            {/* Miras Ópticas 3D */}
            <div>
              <div className="font-display font-black text-sm text-white uppercase tracking-wider mb-2.5">
                MIRAS ÓPTICAS 3D (PARA ARMA ATUAL: {activeWeapon.replace('_', ' ')})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {SCOPE_PACK_ORDER.filter((id) => id !== 'iron').map((opticId) => {
                  const spec = SCOPE_PACK_CATALOG[opticId];
                  const compatible = isOpticCompatibleWithWeapon(
                    activeWeapon,
                    opticId
                  );
                  const unlocked = isOpticUnlockedAtXp(opticId, playerXp);
                  const equipped =
                    getEquippedWeaponOptic(activeWeapon) === opticId;

                  return (
                    <div
                      key={opticId}
                      className="rounded-lg border border-white/15 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#1a0b12] p-3 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between text-[9px] font-mono">
                          <span className="text-sky-300 font-bold">
                            {spec.magnification}
                          </span>
                          <span className="text-slate-400">
                            Nv. {spec.unlockLevel}
                          </span>
                        </div>
                        <div className="font-display font-black text-xs text-white uppercase mt-1">
                          {spec.name}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 mt-1 line-clamp-2">
                          {spec.reticleLabel}
                        </p>
                      </div>
                      <GoldSlantedButton
                        label={
                          equipped
                            ? 'ACOPLADA ✓'
                            : !compatible
                              ? 'INCOMPATÍVEL'
                              : !unlocked
                                ? `NÍVEL ${spec.unlockLevel}`
                                : 'ACOPLAR MIRA'
                        }
                        variant={equipped ? 'equipped' : 'gold'}
                        disabled={!compatible || !unlocked}
                        onClick={() => handleEquipOptic(opticId)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Equipamentos Táticos (Capacetes, Coletes, Luvas, Botas) */}
            <div>
              <div className="font-display font-black text-sm text-white uppercase tracking-wider mb-2.5">
                EQUIPAMENTOS TÁTICOS (COLETES · CAPACETES · LUVAS · BOTAS)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {GEAR_INVENTORY_CATALOG.map((item) => {
                  const owned = isGearOwnedInInventory(item.id, playerXp);
                  const classLoadout =
                    invState.classLoadouts[invState.selectedClass];
                  const equipped = classLoadout[item.slot] === item.id;
                  const levelOk = playerLevel >= item.unlockLevel;

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-white/15 hover:border-red-500/60 bg-gradient-to-b from-[#151822] via-[#0d1018] to-[#1f0a0f] p-3 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center justify-between text-[9px] font-mono">
                          <span className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-bold uppercase">
                            {item.rarity}
                          </span>
                          <span className="text-slate-400">
                            Nv. {item.unlockLevel}
                          </span>
                        </div>
                        <div className="font-display font-black text-xs text-white uppercase mt-1.5">
                          {item.name}
                        </div>
                        <div className="text-[10px] font-mono text-emerald-300 mt-0.5">
                          {item.perkLabel}
                        </div>
                        <p className="text-[10px] font-mono text-slate-400 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1.5 pt-1">
                        {!owned && (
                          <div className="flex items-center gap-1 text-xs font-display font-black text-amber-300">
                            <span>$</span>
                            <span>{item.cashPrice.toLocaleString('pt-BR')}</span>
                          </div>
                        )}
                        <GoldSlantedButton
                          label={
                            equipped
                              ? 'EQUIPADO ✓'
                              : owned
                                ? 'EQUIPAR'
                                : !levelOk
                                  ? `REQUER NV. ${item.unlockLevel}`
                                  : `COMPRAR · $${item.cashPrice.toLocaleString('pt-BR')}`
                          }
                          variant={equipped ? 'equipped' : 'gold'}
                          disabled={!owned && !levelOk}
                          onClick={() => handleBuyOrEquipGear(item.id)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: CAIXAS (WARFACE RANDOM BOXES COM PORCENTAGEM %)            */}
        {/* ================================================================= */}
        {section === 'CAIXAS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Seletor de Baús */}
            <div className="lg:col-span-3 flex flex-col gap-2">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                SELECIONE A CAIXA TÁTICA
              </div>
              {WARBOX_CATALOG.map((box) => {
                const isSelected = box.id === selectedBox.id;
                const boxPity = Math.max(0, Math.floor(pityMap[box.id] || 0));
                return (
                  <button
                    key={box.id}
                    type="button"
                    disabled={isRollingCrate}
                    onClick={() => {
                      soundEngine.playMenuSelect();
                      setSelectedBoxId(box.id);
                      setLastCrateResults(null);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer flex flex-col gap-1 ${
                      isSelected
                        ? 'border-red-500 bg-gradient-to-r from-red-950/75 to-[#111520] shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                        : 'border-white/15 bg-white/[0.03] hover:border-red-400/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono font-bold text-amber-300 uppercase">
                        {box.code}
                      </span>
                      <span className="text-[10px] font-mono font-black text-sky-300">
                        {box.price1xDiamonds} 💎
                      </span>
                    </div>
                    <div className="font-display font-black text-xs text-white uppercase">
                      {box.name}
                    </div>
                    <div className="text-[9px] font-mono text-slate-400">
                      GARANTIA ELITE: {boxPity}/{box.guaranteeEveryOpens}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Vitrine + Roleta */}
            <div className="lg:col-span-5 rounded-xl border border-red-500/40 bg-gradient-to-b from-[#1a1308]/90 via-[#0e131f]/95 to-[#090c14] p-3.5 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-display font-black text-[9px] uppercase">
                    {selectedBox.code}
                  </span>
                  <span className="text-[10px] font-mono text-amber-300 font-bold">
                    GARANTIA: {currentBoxPity}/{selectedBox.guaranteeEveryOpens}
                  </span>
                </div>
                <h3 className="font-display font-black text-base text-white uppercase">
                  {selectedBox.name}
                </h3>
                <p className="text-[10px] font-mono text-slate-300">
                  {selectedBox.subtitle}
                </p>
              </div>

              <WeaponVisualCard
                weaponId={selectedBox.featuredWeaponId}
                skinId={selectedBox.featuredSkinId}
                selected
                unlocked
                compact={false}
              />

              {/* Barra Pity */}
              <div className="bg-black/45 border border-white/10 rounded-lg p-2">
                <div className="flex justify-between text-[9px] font-mono mb-1">
                  <span className="text-slate-300">GARANTIA LENDÁRIO/ELITE</span>
                  <span className="text-amber-300 font-bold">
                    {currentBoxPity} / {selectedBox.guaranteeEveryOpens}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-red-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (currentBoxPity / selectedBox.guaranteeEveryOpens) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {isRollingCrate && reelStrip.length > 0 && (
                <div className="rounded-lg border-2 border-amber-400 bg-black/80 p-3 text-center">
                  <div className="text-[9px] font-mono text-amber-300 animate-pulse">
                    SORTEANDO...
                  </div>
                  {(() => {
                    const activeItem =
                      reelStrip[reelHighlightIdx] || reelStrip[0];
                    const st = RARITY_STYLES[activeItem.rarity];
                    return (
                      <div
                        className={`mt-1 rounded border p-2 bg-gradient-to-r ${st.bg} ${st.border}`}
                      >
                        <div className="font-display font-black text-xs text-white uppercase">
                          {activeItem.label}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {!isRollingCrate &&
                lastCrateResults &&
                lastCrateResults.length > 0 && (
                  <div className="rounded-lg border border-emerald-400/55 bg-emerald-950/25 p-2.5 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-display font-black text-xs text-emerald-300 uppercase">
                        ✓ ITENS OBTIDOS ({lastCrateResults.length}X)
                      </span>
                      <button
                        type="button"
                        onClick={() => setLastCrateResults(null)}
                        className="text-[10px] font-mono text-slate-400 hover:text-white cursor-pointer"
                      >
                        LIMPAR
                      </button>
                    </div>
                    {lastCrateResults.map((res, idx) => (
                      <div
                        key={`${res.item.id}_${idx}`}
                        className="rounded border border-white/15 bg-black/50 px-2 py-1.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-display font-black text-xs text-white uppercase truncate">
                            {res.item.label}
                          </div>
                          {res.isDuplicate && (
                            <div className="text-[9px] font-mono text-amber-300">
                              DUPLICATA → +{res.grantedCash} $ / +{res.grantedXp}{' '}
                              XP
                            </div>
                          )}
                        </div>
                        {res.item.weaponId && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playMenuSelect();
                              syncEquippedWeaponToInventory(res.item.weaponId!);
                              onSelectWeapon(res.item.weaponId!);
                            }}
                            className="px-2 py-1 rounded bg-amber-400 text-slate-950 font-display font-black text-[9px] uppercase cursor-pointer"
                          >
                            EQUIPAR
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

              <div className="grid grid-cols-2 gap-2.5">
                <GoldSlantedButton
                  label={
                    isRollingCrate
                      ? 'ABRINDO...'
                      : `ABRIR 1X · ${selectedBox.price1xDiamonds} 💎`
                  }
                  disabled={busy || isRollingCrate}
                  onClick={() => void handleOpenWarbox(1)}
                  className="py-2"
                />
                <GoldSlantedButton
                  label={
                    isRollingCrate
                      ? 'ABRINDO...'
                      : `ABRIR 5X · ${selectedBox.price5xDiamonds} 💎`
                  }
                  disabled={busy || isRollingCrate}
                  onClick={() => void handleOpenWarbox(5)}
                  className="py-2"
                />
              </div>
            </div>

            {/* Probabilidades (%) */}
            <div className="lg:col-span-4 flex flex-col gap-1.5">
              <div className="flex justify-between text-[10px] font-mono font-bold">
                <span className="text-slate-300">PROBABILIDADES OFICIAIS (%)</span>
                <span className="text-emerald-300">100.0%</span>
              </div>
              {selectedBox.drops.map((drop) => {
                const st = RARITY_STYLES[drop.rarity];
                const owned = isDropItemAlreadyOwned(drop);
                return (
                  <div
                    key={drop.id}
                    className={`rounded-lg border p-2 bg-gradient-to-r ${st.bg} ${st.border} flex items-center justify-between gap-2`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[8px] font-display font-black uppercase ${st.badgeBg}`}
                        >
                          {st.label}
                        </span>
                        {owned && (
                          <span className="text-[8px] font-mono text-emerald-300 font-bold">
                            ✓ ADQUIRIDO
                          </span>
                        )}
                      </div>
                      <div className="font-display font-black text-[11px] text-white uppercase truncate mt-0.5">
                        {drop.label}
                      </div>
                    </div>
                    <div className={`font-mono font-black text-xs ${st.text}`}>
                      {drop.chancePct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 6: PASSE VIP                                                  */}
        {/* ================================================================= */}
        {section === 'PASSE_VIP' && (
          <div className="rounded-xl border border-amber-400/55 bg-gradient-to-br from-[#291a06] via-[#120d08] to-[#080a0f] p-5 sm:p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col gap-2 max-w-xl">
              <span className="inline-block w-fit px-2.5 py-0.5 rounded bg-amber-400 text-slate-950 font-display font-black text-[10px] tracking-widest uppercase">
                ASSINATURA DE ELITE · KINETIC VIP
              </span>
              <h3 className="font-display font-black italic text-2xl sm:text-3xl text-amber-300 uppercase">
                SEJA VIP E GANHE VANTAGENS EXCLUSIVAS!
              </h3>
              <ul className="mt-2 space-y-1.5 text-xs font-mono text-slate-200">
                <li>✓ +30% XP de Patente e +25% K-Money em todas as partidas online</li>
                <li>✓ Trilha Premium do Passe de Batalha com Armas e Skins Exclusivas</li>
                <li>✓ Insígnia Dourada VIP no Perfil, Lobby e Placar Competitivo</li>
                <li>✓ Bônus Semanal de Diamantes 💎 direto na conta</li>
              </ul>
              <div className="mt-4 w-60">
                <GoldSlantedButton
                  label="ABRIR PASSE VIP COMPLETO ›"
                  onClick={() => {
                    soundEngine.playMenuSelect();
                    if (onOpenVipPass) onOpenVipPass();
                  }}
                  className="py-2.5 text-xs sm:text-sm"
                />
              </div>
            </div>
            <div className="shrink-0">
              <VipCrestArtwork />
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 7: RECARGA DE DIAMANTES                                       */}
        {/* ================================================================= */}
        {section === 'RECARGA' && (
          <div className="flex flex-col gap-3.5">
            {/* Founder Welcome Grant Banner */}
            <div className="rounded-xl border border-amber-400/55 bg-gradient-to-r from-[#2c1c07] via-[#131929] to-[#0b1f3a] p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-display font-black text-[9px] uppercase">
                  BÔNUS FUNDADOR · 1X POR CONTA
                </span>
                <h3 className="font-display font-black text-base sm:text-lg text-white uppercase mt-1">
                  RESGATE +{FOUNDER_WELCOME_DIAMONDS.toLocaleString('pt-BR')} DIAMANTES GRÁTIS
                </h3>
                <p className="text-[11px] font-mono text-slate-300">
                  Teste toda a loja agora: Shotgun Aemondir, V18 Spectre Engenheiro, Operadores 3D e Caixas!
                </p>
              </div>
              <div className="w-56">
                {syncState.profile.founderDiamondsClaimed ? (
                  <GoldSlantedButton
                    label="BÔNUS JÁ RESGATADO ✓"
                    variant="equipped"
                    disabled
                    onClick={() => {}}
                  />
                ) : (
                  <GoldSlantedButton
                    label={`RESGATAR +${FOUNDER_WELCOME_DIAMONDS.toLocaleString('pt-BR')} 💎`}
                    disabled={busy}
                    onClick={() => void handleClaimFounderDiamonds()}
                    className="py-2.5"
                  />
                )}
              </div>
            </div>

            {/* Pacotes de Recarga em R$ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {DIAMOND_STORE_PACKS.map((pack) => (
                <div
                  key={pack.id}
                  className={`rounded-lg border p-3.5 flex flex-col justify-between gap-3 ${
                    pack.badge
                      ? 'border-sky-400/75 bg-gradient-to-b from-sky-950/55 via-[#0d1525] to-[#090d16]'
                      : 'border-white/15 bg-gradient-to-b from-[#131824] via-[#0c1019] to-[#090b12]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono font-bold text-sky-300 uppercase">
                        PACOTE {pack.diamonds.toLocaleString('pt-BR')} 💎
                      </span>
                      {pack.badge && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 font-display font-black text-[8px] uppercase">
                          {pack.badge}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <DiamondGemIcon className="w-7 h-7" />
                      <span className="font-display font-black text-2xl text-white tabular-nums">
                        {pack.diamonds.toLocaleString('pt-BR')}
                      </span>
                      {pack.bonusDiamonds > 0 && (
                        <span className="text-[11px] font-mono font-bold text-emerald-300">
                          +{pack.bonusDiamonds} BÔNUS
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs font-mono text-slate-300">
                      {pack.priceLabel}
                    </div>
                  </div>
                  <GoldSlantedButton
                    label={`RECARREGAR · ${pack.priceLabel}`}
                    disabled={busy}
                    onClick={() => void handleBuyRealDiamondPack(pack.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
