import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  GEAR_INVENTORY_CATALOG,
  WARFACE_CLASS_LOADOUT_META,
  WEAPON_INVENTORY_CATALOG,
  EquipmentSlotId,
  GearItemDefinition,
  PlayerInventoryState,
  SCOPE_PACK_CATALOG,
  equipClassSlotItem,
  equipWeaponOptic,
  equipWeaponSkin,
  getClassCombatModifiers,
  getCompatibleOpticsForWeapon,
  getEquippedWeaponOptic,
  getEquippedWeaponSkinId,
  getPlayerInventoryState,
  isGearOwnedInInventory,
  isWeaponOwnedInInventory,
  isWeaponSkinOwned,
  purchaseGearWithCash,
  purchaseWeaponSkinWithCash,
  purchaseWeaponWithCash,
  setSelectedWarfaceClass,
  subscribePlayerInventory,
} from '../progression/loadoutSystem';
import {
  getAvailableSkinsForWeapon,
  getSkinDefinition,
  WeaponSkinDefinition,
} from '../progression/weaponSkins';
import {
  getRequiredXpForOptic,
  getRequiredXpForWeapon,
  isOpticUnlockedAtXp,
} from '../progression/ranks';
import { OpticType, WeaponId } from '../types/game';
import { RankedOperator3DCanvas } from './RankedOperator3DCanvas';
import {
  preloadAllScopeThumbnails3D,
  preloadAllWeaponThumbnails3D,
  useScopeThumbnail3D,
} from '../three/weaponThumbnail3D';
import {
  VanguardTeamEmblem,
  WARFACE_CLASS_META,
  WarfaceClassIcon,
  WarfaceClassId,
} from './WarfaceClassIcons';
import { GrenadePreview3D, WeaponPreview3D } from './WeaponVisualCard';
import { preloadGrenadeThumbnails3D } from '../three/grenadeThumbnail3D';

const InventoryScopeOpticCard: React.FC<{
  opticId: OpticType;
  shortLabel: string;
  magnification: string;
  title: string;
  active: boolean;
  unlocked: boolean;
  requiredLevel: number;
  onClick: () => void;
}> = ({
  opticId,
  shortLabel,
  magnification,
  title,
  active,
  unlocked,
  requiredLevel,
  onClick,
}) => {
  const thumbUrl = useScopeThumbnail3D(opticId);
  return (
    <button
      type="button"
      disabled={!unlocked}
      title={title}
      onClick={onClick}
      className={`rounded-[2px] border px-1 py-1 flex flex-col items-center justify-between gap-0.5 text-center transition-colors ${
        active
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 cursor-pointer shadow-[0_0_8px_rgba(34,211,238,0.22)]'
          : unlocked
            ? 'bg-[#11151e] border-white/12 hover:border-cyan-400/50 text-slate-200 cursor-pointer'
            : 'bg-[#0e1118] border-white/5 text-slate-500 opacity-60 cursor-not-allowed'
      }`}
    >
      <div className="w-full h-7 flex items-center justify-center overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={shortLabel}
            draggable={false}
            className={`w-full h-7 object-contain select-none ${
              unlocked
                ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'
                : 'grayscale opacity-50'
            }`}
          />
        ) : (
          <div className="w-4 h-3 rounded-sm border border-white/20 bg-white/5" />
        )}
      </div>
      <span
        className={`text-[7px] font-mono font-bold truncate w-full ${
          active ? 'text-cyan-300' : 'text-slate-200'
        }`}
      >
        {shortLabel}
      </span>
      <div className="flex items-center justify-center gap-0.5 text-[7px] font-mono leading-tight">
        {unlocked ? (
          <span className={active ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
            {active ? '✓' : magnification}
          </span>
        ) : (
          <span className="text-amber-400 font-bold">🔒NV.{requiredLevel}</span>
        )}
      </div>
    </button>
  );
};

interface InventoryLoadoutModalProps {
  playerXp: number;
  playerCash: number;
  onSyncEquippedWeapon: (weaponId: WeaponId) => void;
  onOpenWeaponGunsmith: () => void;
  onClose: () => void;
}

type InventorySubTab = 'ARMAS' | 'ARMADURA' | 'BOOSTERS';
type ActiveSlotKey = EquipmentSlotId | 'specialGadget';

const ALL_CLASSES: WarfaceClassId[] = [
  'FUZILEIRO',
  'MEDICO',
  'ENGENHEIRO',
  'FRANCO_ATIRADOR',
];

const CLASS_TAB_SHORT: Record<WarfaceClassId, string> = {
  FUZILEIRO: 'FUZILEIRO',
  MEDICO: 'MÉDICO',
  ENGENHEIRO: 'ENGENHEIRO',
  FRANCO_ATIRADOR: 'SNIPER',
};

const GearIconSvg: React.FC<{
  kind: 'helmet' | 'vest' | 'gloves' | 'boots' | 'grenadePack' | 'special' | 'frag' | 'smoke';
  className?: string;
  accent?: string;
}> = ({ kind, className = 'w-10 h-10', accent = '#e2e8f0' }) => {
  if (kind === 'helmet') {
    return (
      <svg viewBox="0 0 64 40" fill="none" className={className}>
        <path
          d="M14 27 C14 13 22 6 33 6 C44 6 51 14 51 24 L47 30 L21 30 L14 27 Z"
          fill="#262c36"
          stroke={accent}
          strokeWidth="1.6"
        />
        <path d="M22 14 H44" stroke="#f97316" strokeWidth="1.5" strokeOpacity="0.8" />
        <rect x="44" y="13" width="6" height="5" rx="1" fill="#475569" stroke={accent} strokeWidth="1" />
      </svg>
    );
  }
  if (kind === 'vest') {
    return (
      <svg viewBox="0 0 64 40" fill="none" className={className}>
        <path
          d="M21 6 L27 6 L29 11 H35 L37 6 L43 6 L47 16 V34 H17 V16 L21 6 Z"
          fill="#262c36"
          stroke={accent}
          strokeWidth="1.6"
        />
        <rect x="23" y="16" width="18" height="13" fill="#171c24" stroke="#f97316" strokeWidth="1" strokeOpacity="0.7" />
        <line x1="23" y1="21" x2="41" y2="21" stroke={accent} strokeOpacity="0.45" strokeWidth="1" />
        <line x1="23" y1="25" x2="41" y2="25" stroke={accent} strokeOpacity="0.45" strokeWidth="1" />
      </svg>
    );
  }
  if (kind === 'gloves') {
    return (
      <svg viewBox="0 0 64 40" fill="none" className={className}>
        <path
          d="M18 16 L22 8 H26 V18 H28 V7 H32 V18 H34 V9 H38 V19 H41 V13 H45 V28 L39 34 H22 L18 27 Z"
          fill="#262c36"
          stroke={accent}
          strokeWidth="1.5"
        />
        <rect x="23" y="21" width="17" height="4" fill="#f97316" fillOpacity="0.7" />
      </svg>
    );
  }
  if (kind === 'boots') {
    return (
      <svg viewBox="0 0 64 40" fill="none" className={className}>
        <path
          d="M20 7 H33 V23 L47 26 V33 H19 V7 Z"
          fill="#262c36"
          stroke={accent}
          strokeWidth="1.6"
        />
        <rect x="18" y="30" width="30" height="4" fill="#11161f" stroke="#f97316" strokeWidth="1" strokeOpacity="0.65" />
      </svg>
    );
  }
  if (kind === 'frag') {
    return (
      <svg viewBox="0 0 40 40" fill="none" className={className}>
        <rect x="16" y="6" width="8" height="4" fill="#94a3b8" />
        <path d="M24 8 H29 L31 14" stroke="#f97316" strokeWidth="1.5" />
        <ellipse cx="20" cy="23" rx="9.5" ry="11" fill="#3f4a3c" stroke={accent} strokeWidth="1.5" />
        <line x1="12" y1="20" x2="28" y2="20" stroke="#1e293b" strokeWidth="1.2" />
        <line x1="12" y1="26" x2="28" y2="26" stroke="#1e293b" strokeWidth="1.2" />
        <line x1="20" y1="12" x2="20" y2="34" stroke="#1e293b" strokeWidth="1.2" />
      </svg>
    );
  }
  if (kind === 'smoke') {
    return (
      <svg viewBox="0 0 40 40" fill="none" className={className}>
        <rect x="16" y="5" width="8" height="4" fill="#94a3b8" />
        <rect x="13" y="9" width="14" height="25" rx="2" fill="#334155" stroke={accent} strokeWidth="1.5" />
        <rect x="13" y="16" width="14" height="5" fill="#38bdf8" fillOpacity="0.65" />
      </svg>
    );
  }
  if (kind === 'special') {
    return (
      <svg viewBox="0 0 64 40" fill="none" className={className}>
        <rect x="15" y="10" width="34" height="22" rx="2" fill="#2a1912" stroke="#f97316" strokeWidth="1.6" />
        <path d="M26 10 V7 H38 V10" stroke="#fb923c" strokeWidth="1.6" />
        <line x1="32" y1="15" x2="32" y2="27" stroke="#fbbf24" strokeWidth="2.5" />
        <line x1="26" y1="21" x2="38" y2="21" stroke="#fbbf24" strokeWidth="2.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 40" fill="none" className={className}>
      <ellipse cx="23" cy="22" rx="8" ry="10" fill="#3f4a3c" stroke={accent} strokeWidth="1.4" />
      <rect x="36" y="10" width="12" height="22" rx="1.5" fill="#334155" stroke="#38bdf8" strokeWidth="1.4" />
      <rect x="36" y="16" width="12" height="4" fill="#38bdf8" fillOpacity="0.6" />
    </svg>
  );
};

export const InventoryLoadoutModal: React.FC<InventoryLoadoutModalProps> = ({
  playerXp,
  playerCash,
  onSyncEquippedWeapon,
  onOpenWeaponGunsmith,
  onClose,
}) => {
  const [inventory, setInventory] = useState<PlayerInventoryState>(() =>
    getPlayerInventoryState()
  );
  const [subTab, setSubTab] = useState<InventorySubTab>('ARMAS');
  const [selectedSlot, setSelectedSlot] =
    useState<ActiveSlotKey>('primaryWeapon');
  const [inspectedWeaponId, setInspectedWeaponId] = useState<WeaponId>(
    () => getPlayerInventoryState().classLoadouts[getPlayerInventoryState().selectedClass].primaryWeapon
  );
  const [inspectedGearId, setInspectedGearId] = useState<string>('helm_vanguard_std');
  const [rotateSignal, setRotateSignal] = useState<{ nonce: number; delta: number }>({
    nonce: 0,
    delta: 0,
  });

  useEffect(() => {
    // Defer thumbnail studio warm so the left RankedOperator3DCanvas claims its
    // pinned WebGL slot first (otherwise thumbs evict the operator on open).
    const warmId = window.setTimeout(() => {
      preloadAllWeaponThumbnails3D([
        ...(Object.keys(WEAPON_INVENTORY_CATALOG) as WeaponId[]),
      ]);
      preloadAllScopeThumbnails3D();
      preloadGrenadeThumbnails3D();
    }, 280);
    const unsub = subscribePlayerInventory((next) => setInventory(next));
    return () => {
      window.clearTimeout(warmId);
      unsub();
    };
  }, []);

  const activeClass = inventory.selectedClass;
  const classMeta = WARFACE_CLASS_META[activeClass];
  const classCombat = WARFACE_CLASS_LOADOUT_META[activeClass];
  const classLoadout = inventory.classLoadouts[activeClass];
  const modifiers = getClassCombatModifiers(activeClass);

  // Mantém a arma inspecionada sempre válida dentro das restrições da classe atual
  useEffect(() => {
    if (selectedSlot === 'primaryWeapon') {
      if (!classCombat.allowedPrimaries.includes(inspectedWeaponId)) {
        setInspectedWeaponId(classLoadout.primaryWeapon);
      }
    } else if (selectedSlot === 'secondaryWeapon') {
      if (inspectedWeaponId !== 'P50_PISTOL' && inspectedWeaponId !== 'M1911_PISTOL') {
        setInspectedWeaponId(classLoadout.secondaryWeapon);
      }
    } else if (selectedSlot === 'meleeWeapon') {
      if (inspectedWeaponId !== 'KNIFE_TACTICAL') {
        setInspectedWeaponId(classLoadout.meleeWeapon);
      }
    }
  }, [activeClass, selectedSlot, classLoadout.primaryWeapon, classLoadout.secondaryWeapon, classLoadout.meleeWeapon, classCombat.allowedPrimaries, inspectedWeaponId]);

  const handleSelectClass = (classId: WarfaceClassId) => {
    soundEngine.playMenuSelect();
    setSubTab('ARMAS');
    setSelectedSlot('primaryWeapon');
    const classPrimary = setSelectedWarfaceClass(classId);
    setInspectedWeaponId(classPrimary);
    onSyncEquippedWeapon(classPrimary);
  };

  const handleSwitchSubTab = (tab: InventorySubTab) => {
    soundEngine.playMenuSelect();
    setSubTab(tab);
    if (tab === 'ARMAS') {
      setSelectedSlot('primaryWeapon');
      setInspectedWeaponId(classLoadout.primaryWeapon);
    } else if (tab === 'ARMADURA') {
      setSelectedSlot('helmet');
      setInspectedGearId(classLoadout.helmet);
    } else if (tab === 'BOOSTERS') {
      setSelectedSlot('grenadePack');
      setInspectedGearId(classLoadout.grenadePack);
    }
  };

  const handleSelectSlot = (slot: ActiveSlotKey) => {
    soundEngine.playMenuSelect();
    setSelectedSlot(slot);
    if (slot === 'primaryWeapon') {
      setInspectedWeaponId(classLoadout.primaryWeapon);
    } else if (slot === 'secondaryWeapon') {
      setInspectedWeaponId(classLoadout.secondaryWeapon);
    } else if (slot === 'meleeWeapon') {
      setInspectedWeaponId(classLoadout.meleeWeapon);
    } else if (slot === 'helmet') {
      setInspectedGearId(classLoadout.helmet);
    } else if (slot === 'vest') {
      setInspectedGearId(classLoadout.vest);
    } else if (slot === 'gloves') {
      setInspectedGearId(classLoadout.gloves);
    } else if (slot === 'boots') {
      setInspectedGearId(classLoadout.boots);
    } else if (slot === 'grenadePack') {
      setInspectedGearId(classLoadout.grenadePack);
    }
  };

  const isWeaponSlot =
    selectedSlot === 'primaryWeapon' ||
    selectedSlot === 'secondaryWeapon' ||
    selectedSlot === 'meleeWeapon';

  const weaponOptionsForSlot: WeaponId[] =
    selectedSlot === 'primaryWeapon'
      ? classCombat.allowedPrimaries
      : selectedSlot === 'secondaryWeapon'
        ? ['P50_PISTOL', 'M1911_PISTOL']
        : selectedSlot === 'meleeWeapon'
          ? ['KNIFE_TACTICAL']
          : [];

  const gearOptionsForSlot: GearItemDefinition[] =
    isWeaponSlot || selectedSlot === 'specialGadget'
      ? []
      : GEAR_INVENTORY_CATALOG.filter((g) => g.slot === selectedSlot);

  const handleEquipOrBuyWeapon = (wId: WeaponId) => {
    setInspectedWeaponId(wId);
    const owned = isWeaponOwnedInInventory(wId, playerXp);
    if (!owned) {
      const ok = purchaseWeaponWithCash(wId);
      if (!ok) {
        soundEngine.playMenuHover();
        return;
      }
    }
    soundEngine.playMenuSelect();
    if (isWeaponSlot) {
      equipClassSlotItem(activeClass, selectedSlot as EquipmentSlotId, wId);
      if (selectedSlot === 'primaryWeapon') {
        onSyncEquippedWeapon(wId);
      }
    }
  };

  const handleEquipOrBuyGear = (gear: GearItemDefinition) => {
    setInspectedGearId(gear.id);
    const owned = isGearOwnedInInventory(gear.id, playerXp);
    if (!owned) {
      const ok = purchaseGearWithCash(gear.id);
      if (!ok) {
        soundEngine.playMenuHover();
        return;
      }
    }
    soundEngine.playMenuSelect();
    if (selectedSlot !== 'specialGadget') {
      equipClassSlotItem(activeClass, selectedSlot, gear.id);
    }
  };

  const handleSelectOrBuyWeaponSkin = (
    wId: WeaponId,
    skin: WeaponSkinDefinition
  ) => {
    const owned = isWeaponSkinOwned(skin.id);
    if (!owned) {
      const bought = purchaseWeaponSkinWithCash(skin.id);
      if (!bought) {
        soundEngine.playMenuHover();
        return;
      }
    }
    soundEngine.playMenuSelect();
    equipWeaponSkin(wId, skin.id);
  };

  const currentEquippedForSlot =
    selectedSlot === 'primaryWeapon'
      ? classLoadout.primaryWeapon
      : selectedSlot === 'secondaryWeapon'
        ? classLoadout.secondaryWeapon
        : selectedSlot === 'meleeWeapon'
          ? classLoadout.meleeWeapon
          : selectedSlot === 'helmet'
            ? classLoadout.helmet
            : selectedSlot === 'vest'
              ? classLoadout.vest
              : selectedSlot === 'gloves'
                ? classLoadout.gloves
                : selectedSlot === 'boots'
                  ? classLoadout.boots
                  : classLoadout.grenadePack;

  const inspectedWeaponSpec =
    WEAPON_INVENTORY_CATALOG[inspectedWeaponId] ||
    WEAPON_INVENTORY_CATALOG[classLoadout.primaryWeapon];
  const inspectedWeaponOwned = isWeaponOwnedInInventory(
    inspectedWeaponSpec.id,
    playerXp
  );
  const inspectedWeaponReq = getRequiredXpForWeapon(inspectedWeaponSpec.id);
  const isInspectedWeaponEquipped =
    currentEquippedForSlot === inspectedWeaponSpec.id;
  const inspectedWeaponSkinId =
    inventory.equippedWeaponSkins[inspectedWeaponSpec.id] ||
    getEquippedWeaponSkinId(inspectedWeaponSpec.id);
  const inspectedWeaponSkinSpec = getSkinDefinition(inspectedWeaponSkinId);
  const availableSkinsForInspected = getAvailableSkinsForWeapon(
    inspectedWeaponSpec.id
  );
  const compatibleOpticsForInspected = getCompatibleOpticsForWeapon(
    inspectedWeaponSpec.id
  );
  const inspectedWeaponOptic: OpticType =
    inventory.equippedWeaponOptics?.[inspectedWeaponSpec.id] ||
    getEquippedWeaponOptic(inspectedWeaponSpec.id, playerXp);
  const inspectedWeaponOpticSpec =
    SCOPE_PACK_CATALOG[inspectedWeaponOptic] || SCOPE_PACK_CATALOG.iron;

  const handleSelectWeaponOptic = (wId: WeaponId, optic: OpticType) => {
    if (!isOpticUnlockedAtXp(optic, playerXp)) {
      soundEngine.playMenuHover();
      return;
    }
    soundEngine.playMenuSelect();
    equipWeaponOptic(wId, optic, playerXp);
  };
  const previewOperatorWeapon = isWeaponSlot
    ? inspectedWeaponId
    : classLoadout.primaryWeapon;
  const previewOperatorSkinId =
    inventory.equippedWeaponSkins[previewOperatorWeapon] ||
    getEquippedWeaponSkinId(previewOperatorWeapon);

  const inspectedGearItem =
    GEAR_INVENTORY_CATALOG.find((g) => g.id === inspectedGearId) ||
    gearOptionsForSlot[0];
  const isInspectedGearOwned = inspectedGearItem
    ? isGearOwnedInInventory(inspectedGearItem.id, playerXp)
    : false;
  const isInspectedGearEquipped =
    inspectedGearItem && currentEquippedForSlot === inspectedGearItem.id;

  const handleConfirmAndClose = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    soundEngine.playMenuSelect();
    let finalPrimary = classLoadout.primaryWeapon;
    if (
      selectedSlot === 'primaryWeapon' &&
      isWeaponOwnedInInventory(inspectedWeaponSpec.id, playerXp) &&
      classCombat.allowedPrimaries.includes(inspectedWeaponSpec.id)
    ) {
      equipClassSlotItem(activeClass, 'primaryWeapon', inspectedWeaponSpec.id);
      finalPrimary = inspectedWeaponSpec.id;
    } else if (
      selectedSlot === 'secondaryWeapon' &&
      isWeaponOwnedInInventory(inspectedWeaponSpec.id, playerXp)
    ) {
      equipClassSlotItem(activeClass, 'secondaryWeapon', inspectedWeaponSpec.id);
    }
    try {
      onSyncEquippedWeapon(finalPrimary);
    } catch {
      // Never block closing the inventory modal
    }
    onClose();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="relative z-30 w-full h-full max-w-[1440px] min-h-0 flex bg-[#0a0d12]/96 border border-white/15 rounded-[2px] overflow-hidden shadow-2xl pointer-events-auto text-slate-100"
    >
      {/* ================================================================= */}
      {/* ESQUERDA: PALCO 3D DO OPERADOR COM SETAS DE ROTAÇÃO (COMPACTO)    */}
      {/* ================================================================= */}
      <div className="hidden md:flex md:w-[25%] lg:w-[27%] min-h-0 relative flex-col justify-between bg-[radial-gradient(ellipse_at_center,_#18202c_0%,_#0b0e14_65%,_#06080c_100%)] border-r border-white/12 overflow-hidden">
        {/* Identificação compacta da classe no topo esquerdo */}
        <div className="relative z-10 px-2.5 pt-2 flex items-center justify-between gap-1.5 pointer-events-none">
          <div className="min-w-0">
            <div className="font-display font-black text-xs lg:text-sm tracking-wider uppercase text-white truncate">
              {classMeta.label}
            </div>
            <div className="font-mono text-[8px] lg:text-[9px] text-[#fb923c] uppercase tracking-wide truncate">
              {classCombat.characterModelLabel}
            </div>
          </div>
          <span className="shrink-0 px-1.5 py-0.5 rounded bg-black/50 border border-white/10 font-mono text-[9px] text-emerald-300 font-bold tabular-nums">
            {modifiers.totalMaxHealth} PV
          </span>
        </div>

        {/* Modelo 3D Interativo */}
        <div className="flex-1 min-h-0 relative">
          <RankedOperator3DCanvas
            activeWeapon={previewOperatorWeapon}
            weaponSkinId={previewOperatorSkinId}
            operatorClass={activeClass}
            team="VANGUARD"
            externalRotateSignal={rotateSignal}
          />
        </div>

        {/* Controles compactos abaixo dos pés do personagem */}
        <div className="relative z-10 px-2.5 pb-2 pt-0.5 flex flex-col gap-1">
          <div className="flex items-center justify-center gap-2.5">
            <button
              type="button"
              title="Girar Operador à Esquerda"
              onClick={() => {
                soundEngine.playMenuSelect();
                setRotateSignal((p) => ({
                  nonce: p.nonce + 1,
                  delta: -Math.PI / 3,
                }));
              }}
              className="w-7 h-7 flex items-center justify-center rounded-[2px] bg-[#141923]/85 hover:bg-[#ea580c]/25 border border-white/15 hover:border-[#f97316] text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M9 14L4 9l5-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 9h10.5a5.5 5.5 0 1 1 0 11H11" strokeLinecap="round" />
              </svg>
            </button>

            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#11151d]/90 border border-white/10 rounded-[2px]">
              <WarfaceClassIcon
                classId={activeClass}
                className="w-4 h-4"
                color="#f97316"
              />
              <VanguardTeamEmblem className="w-4 h-4" />
            </div>

            <button
              type="button"
              title="Girar Operador à Direita"
              onClick={() => {
                soundEngine.playMenuSelect();
                setRotateSignal((p) => ({
                  nonce: p.nonce + 1,
                  delta: Math.PI / 3,
                }));
              }}
              className="w-7 h-7 flex items-center justify-center rounded-[2px] bg-[#141923]/85 hover:bg-[#ea580c]/25 border border-white/15 hover:border-[#f97316] text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M15 14l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20 9H9.5a5.5 5.5 0 1 0 0 11H13" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="bg-[#0d1118]/90 border border-white/10 rounded-[2px] px-2 py-1 flex items-center justify-between text-[9px] font-mono">
            <span className="text-slate-400 truncate">
              PASSIVA: <strong className="text-slate-100">{classCombat.passiveTitle}</strong>
            </span>
            <span className="text-[#f97316] font-bold shrink-0 ml-1.5 truncate max-w-[95px]">
              {WEAPON_INVENTORY_CATALOG[classLoadout.primaryWeapon]?.name}
            </span>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* DIREITA: HEADER CLASSES + SUB-TABS + 3 COLUNAS COMPACTAS PREMIUM  */}
      {/* ================================================================= */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#0d1016]">
        {/* ROW 1: SELETOR DAS 4 CLASSES EM GRID HORIZONTAL (SEM SOBREPOSIÇÃO) + BOTÃO CONFIRMAR */}
        <div className="shrink-0 bg-gradient-to-r from-[#090d14] via-[#101622] to-[#090d14] border-b border-white/15 px-2.5 sm:px-3.5 py-1.5 flex items-center justify-between gap-2.5">
          {/* 4 Classes em grid-cols-4 com min-w-0 para nunca encostar no botão Confirmar */}
          <div className="grid grid-cols-4 gap-1.5 flex-1 min-w-0 max-w-[540px]">
            {ALL_CLASSES.map((cId) => {
              const isSelected = activeClass === cId;
              return (
                <button
                  key={cId}
                  type="button"
                  onClick={() => handleSelectClass(cId)}
                  className={`min-w-0 h-7 sm:h-8 px-1.5 sm:px-2.5 rounded border flex flex-row items-center justify-center gap-1.5 transition-all cursor-pointer overflow-hidden ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#f97316]/25 via-[#1c2433] to-[#f97316]/15 border-[#f97316] text-white shadow-[0_0_12px_rgba(249,115,22,0.25)]'
                      : 'bg-[#121722]/90 border-white/12 text-slate-400 hover:text-white hover:border-white/30 hover:bg-[#171e2c]'
                  }`}
                >
                  <WarfaceClassIcon
                    classId={cId}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0"
                    color={isSelected ? '#fb923c' : '#94a3b8'}
                  />
                  <span
                    className={`font-display font-black text-[9px] sm:text-[11px] tracking-wider uppercase truncate ${
                      isSelected ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    {CLASS_TAB_SHORT[cId]}
                  </span>
                  {isSelected && (
                    <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-[#fb923c] shadow-[0_0_5px_#fb923c] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Botão Confirmar separado e compacto */}
          <button
            type="button"
            onClick={(e) => handleConfirmAndClose(e)}
            className="relative z-20 min-h-[30px] h-8 sm:h-9 px-3 sm:px-4 rounded bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#f97316] hover:to-[#fb923c] active:scale-95 border border-amber-300/60 text-[10px] sm:text-[11px] font-display font-black tracking-wider text-slate-950 uppercase whitespace-nowrap shrink-0 cursor-pointer transition-all shadow-[0_0_12px_rgba(249,115,22,0.3)]"
          >
            CONFIRMAR ✕
          </button>
        </div>

        {/* ROW 2: SUB-NAVEGAÇÃO COMPACTA (ARMAS | ARMADURA | GRANADAS / BOOSTERS | INSPEÇÃO 3D) */}
        <div className="shrink-0 bg-[#11151d] border-b border-white/15 px-2.5 sm:px-3.5 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-3.5 sm:gap-6">
            {(
              [
                { id: 'ARMAS', label: 'ARMAS' },
                { id: 'ARMADURA', label: 'ARMADURA' },
                { id: 'BOOSTERS', label: 'GRANADAS / BOOSTERS' },
              ] as const
            ).map((tab) => {
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSwitchSubTab(tab.id)}
                  className={`py-1.5 text-[10px] sm:text-xs font-display font-bold tracking-wider uppercase border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-[#f97316] border-[#f97316]'
                      : 'text-slate-300 border-transparent hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                soundEngine.playMenuSelect();
                onOpenWeaponGunsmith();
              }}
              className="py-1.5 text-[10px] sm:text-xs font-display font-bold tracking-wider uppercase border-b-2 border-transparent text-amber-300/90 hover:text-[#fbbf24] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              INSPEÇÃO 3D ↗
            </button>
          </div>

          <span className="hidden xl:inline font-mono text-[9px] text-slate-400 whitespace-nowrap truncate">
            {classCombat.allowedWeaponRuleLabel}
          </span>
        </div>

        {/* ROW 3: CORPO EM 3 COLUNAS COMPACTAS (TUDO VISÍVEL NA TELA) */}
        <div className="flex-1 min-h-0 grid grid-cols-12 overflow-hidden">
          {/* --------------------------------------------------------------- */}
          {/* COLUNA 1: SLOTS EQUIPADOS DO OPERADOR (COMPACTOS)               */}
          {/* --------------------------------------------------------------- */}
          <div className="col-span-4 min-h-0 overflow-y-auto border-r border-white/10 bg-[#0b0e13] p-1.5 sm:p-2 flex flex-col gap-1">
            {subTab === 'ARMAS' && (
              <>
                {/* PRIMÁRIA */}
                <button
                  type="button"
                  onClick={() => handleSelectSlot('primaryWeapon')}
                  className={`w-full rounded-[2px] border px-2 py-1.5 text-left transition-colors cursor-pointer ${
                    selectedSlot === 'primaryWeapon'
                      ? 'bg-[#181e28] border-[#f97316]'
                      : 'bg-[#12161f] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 text-[9px] font-mono">
                    <span className="text-slate-400 font-bold uppercase">PRIMÁRIA</span>
                    <span className="text-[#fb923c] font-bold truncate">
                      {WEAPON_INVENTORY_CATALOG[classLoadout.primaryWeapon]?.name}
                    </span>
                  </div>
                  <div className="h-8 sm:h-9 flex items-center justify-center px-1 my-0.5">
                    <WeaponPreview3D
                      weaponId={classLoadout.primaryWeapon}
                      className="w-full h-8"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[8px] text-slate-300 tabular-nums">
                      100%
                    </span>
                    <div className="flex-1 h-[2px] bg-white/15">
                      <div className="h-full w-full bg-emerald-400/80" />
                    </div>
                  </div>
                </button>

                {/* PISTOLA + FACA LADO A LADO PARA CABER TUDO NA TELA */}
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => handleSelectSlot('secondaryWeapon')}
                    className={`rounded-[2px] border px-1.5 py-1 text-left transition-colors cursor-pointer ${
                      selectedSlot === 'secondaryWeapon'
                        ? 'bg-[#181e28] border-[#f97316]'
                        : 'bg-[#12161f] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[8px] font-mono">
                      <span className="text-slate-400 font-bold uppercase">PISTOLA</span>
                      <span className="text-slate-300">∞</span>
                    </div>
                    <div className="h-7 flex items-center justify-center my-0.5">
                      <WeaponPreview3D
                        weaponId={classLoadout.secondaryWeapon}
                        className="w-full h-6 max-w-[88px]"
                      />
                    </div>
                    <div className="font-mono text-[8px] text-white font-bold truncate">
                      {WEAPON_INVENTORY_CATALOG[classLoadout.secondaryWeapon]?.name}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectSlot('meleeWeapon')}
                    className={`rounded-[2px] border px-1.5 py-1 text-left transition-colors cursor-pointer ${
                      selectedSlot === 'meleeWeapon'
                        ? 'bg-[#181e28] border-[#f97316]'
                        : 'bg-[#12161f] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[8px] font-mono">
                      <span className="text-slate-400 font-bold uppercase">FACA</span>
                      <span className="text-slate-300">100%</span>
                    </div>
                    <div className="h-7 flex items-center justify-center my-0.5">
                      <WeaponPreview3D
                        weaponId={classLoadout.meleeWeapon}
                        className="w-full h-6 max-w-[88px]"
                      />
                    </div>
                    <div className="font-mono text-[8px] text-white font-bold truncate">
                      {WEAPON_INVENTORY_CATALOG[classLoadout.meleeWeapon]?.name}
                    </div>
                  </button>
                </div>

                {/* ESPECIAL DA CLASSE (COMPACTO HORIZONTAL) */}
                <button
                  type="button"
                  onClick={() => handleSelectSlot('specialGadget')}
                  className={`w-full rounded-[2px] border px-2 py-1 text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    selectedSlot === 'specialGadget'
                      ? 'bg-[#181e28] border-[#f97316]'
                      : 'bg-[#12161f] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[8px] font-mono text-slate-400 font-bold uppercase">
                      SUPORTE DE CLASSE
                    </div>
                    <div className="text-[9px] font-mono text-[#fb923c] font-bold truncate">
                      {classCombat.specialSlotTitle}
                    </div>
                  </div>
                  <GearIconSvg kind="special" className="w-9 h-6 shrink-0" />
                </button>

                {/* BOLSOS (GRANADAS FRAG & FUMAÇA) */}
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => handleSwitchSubTab('BOOSTERS')}
                    className="rounded-[2px] border border-white/10 hover:border-[#f97316] bg-[#12161f] px-1.5 py-1 text-left cursor-pointer transition-colors flex items-center justify-between gap-1"
                  >
                    <div className="min-w-0">
                      <div className="text-[8px] font-mono text-slate-400">
                        FRAG <strong className="text-white">x{modifiers.fragCount}</strong>
                      </div>
                      <div className="font-mono text-[8px] text-slate-200 font-bold truncate">
                        M67
                      </div>
                    </div>
                    <GrenadePreview3D type="FRAG" className="w-7 h-7 shrink-0" alt="Frag M67" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSwitchSubTab('BOOSTERS')}
                    className="rounded-[2px] border border-white/10 hover:border-[#f97316] bg-[#12161f] px-1.5 py-1 text-left cursor-pointer transition-colors flex items-center justify-between gap-1"
                  >
                    <div className="min-w-0">
                      <div className="text-[8px] font-mono text-slate-400">
                        SMOKE <strong className="text-white">x{modifiers.smokeCount}</strong>
                      </div>
                      <div className="font-mono text-[8px] text-slate-200 font-bold truncate">
                        M18
                      </div>
                    </div>
                    <GrenadePreview3D type="SMOKE" className="w-7 h-7 shrink-0" alt="Fumaça M18" />
                  </button>
                </div>
              </>
            )}

            {subTab === 'ARMADURA' && (
              <div className="grid grid-cols-2 gap-1">
                {(
                  [
                    {
                      slot: 'helmet' as const,
                      label: 'CAPACETE',
                      kind: 'helmet' as const,
                      itemName: modifiers.helmetName,
                    },
                    {
                      slot: 'vest' as const,
                      label: 'COLETE',
                      kind: 'vest' as const,
                      itemName: modifiers.vestName,
                    },
                    {
                      slot: 'gloves' as const,
                      label: 'LUVAS',
                      kind: 'gloves' as const,
                      itemName: modifiers.glovesName,
                    },
                    {
                      slot: 'boots' as const,
                      label: 'BOTAS',
                      kind: 'boots' as const,
                      itemName: modifiers.bootsName,
                    },
                  ] as const
                ).map((armorSlot) => {
                  const active = selectedSlot === armorSlot.slot;
                  return (
                    <button
                      key={armorSlot.slot}
                      type="button"
                      onClick={() => handleSelectSlot(armorSlot.slot)}
                      className={`w-full rounded-[2px] border p-1.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#181e28] border-[#f97316]'
                          : 'bg-[#12161f] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="text-[8px] font-mono text-slate-400 font-bold uppercase">
                        {armorSlot.label}
                      </div>
                      <div className="h-7 flex items-center justify-center my-0.5">
                        <GearIconSvg kind={armorSlot.kind} className="w-10 h-6" />
                      </div>
                      <div className="text-[8px] font-mono text-[#fb923c] font-bold truncate">
                        {armorSlot.itemName}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {subTab === 'BOOSTERS' && (
              <>
                <button
                  type="button"
                  onClick={() => handleSelectSlot('grenadePack')}
                  className={`w-full rounded-[2px] border p-2 text-left transition-colors cursor-pointer ${
                    selectedSlot === 'grenadePack'
                      ? 'bg-[#181e28] border-[#f97316]'
                      : 'bg-[#12161f] border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                    <span className="text-slate-400 uppercase font-bold">
                      KIT GRANADAS
                    </span>
                    <span className="text-[#fb923c] font-bold tabular-nums">
                      {modifiers.fragCount}F / {modifiers.smokeCount}S
                    </span>
                  </div>
                  <div className="h-10 flex items-center justify-center gap-2">
                    <GrenadePreview3D type="FRAG" className="w-10 h-9" alt="Frag M67" />
                    <GrenadePreview3D type="SMOKE" className="w-10 h-9" alt="Fumaça M18" />
                  </div>
                  <div className="font-mono text-[9px] text-slate-300 truncate">
                    M67 Fragmentação + M18 Fumaça
                  </div>
                </button>

                <div className="rounded-[2px] border border-white/10 bg-[#12161f] p-2 space-y-1">
                  <div className="font-mono text-[8px] text-slate-400 uppercase">
                    BÔNUS PASSIVO DA CLASSE
                  </div>
                  <div className="font-display font-bold text-[11px] text-[#f97316]">
                    {classCombat.passiveTitle}
                  </div>
                  <p className="font-mono text-[9px] text-slate-300 leading-snug">
                    {classCombat.passiveDesc}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COLUNA 2: ARSENAL DA CLASSE (CARDS COMPACTOS E ELEGANTES)       */}
          {/* --------------------------------------------------------------- */}
          <div className="col-span-4 min-h-0 flex flex-col border-r border-white/10 bg-[#0d1118]">
            <div className="shrink-0 px-2 py-1 border-b border-white/10 bg-[#131822]">
              <div className="font-mono text-[8px] sm:text-[9px] text-[#fb923c] font-bold uppercase tracking-wide truncate">
                {selectedSlot === 'primaryWeapon'
                  ? classCombat.allowedWeaponRuleLabel
                  : selectedSlot === 'specialGadget'
                    ? 'EQUIPAMENTO DE CLASSE'
                    : 'ITENS DISPONÍVEIS NO INVENTÁRIO'}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1">
              {isWeaponSlot &&
                weaponOptionsForSlot.map((wId) => {
                  const spec = WEAPON_INVENTORY_CATALOG[wId];
                  const isEquipped = currentEquippedForSlot === wId;
                  const isInspected = inspectedWeaponId === wId;
                  const isOwned = isWeaponOwnedInInventory(wId, playerXp);
                  const req = getRequiredXpForWeapon(wId);

                  return (
                    <button
                      key={wId}
                      type="button"
                      onClick={() => {
                        if (isOwned) {
                          handleEquipOrBuyWeapon(wId);
                        } else {
                          soundEngine.playMenuSelect();
                          setInspectedWeaponId(wId);
                        }
                      }}
                      className={`w-full text-left rounded-[2px] border px-2 py-1 transition-colors cursor-pointer ${
                        isEquipped
                          ? 'bg-[#191f2a] border-[#f97316]'
                          : isInspected
                            ? 'bg-[#151a24] border-white/40'
                            : 'bg-[#10141c] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`w-3 h-3 rounded-[1px] border flex items-center justify-center text-[8px] font-bold shrink-0 ${
                            isEquipped
                              ? 'border-[#f97316] bg-[#f97316]/20 text-[#f97316]'
                              : isOwned
                                ? 'border-white/30 bg-black/40 text-transparent'
                                : 'border-white/15 bg-black/50 text-slate-400'
                          }`}
                        >
                          {isEquipped ? '✓' : !isOwned ? '×' : ''}
                        </span>
                        <span
                          className={`font-display font-bold text-[10px] sm:text-[11px] truncate ${
                            isEquipped
                              ? 'text-[#fb923c]'
                              : isOwned
                                ? 'text-white'
                                : 'text-slate-400'
                          }`}
                        >
                          {spec.name}
                        </span>
                      </div>

                      <div className="h-7 sm:h-8 flex items-center justify-center px-1 my-0.5">
                        <WeaponPreview3D
                          weaponId={wId}
                          locked={!isOwned}
                          alt={spec.name}
                          className="w-full h-7"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[8px] font-mono">
                        {isOwned ? (
                          <>
                            <span className="text-emerald-300 font-bold uppercase">
                              {isEquipped ? 'EQUIPADA' : 'LIBERADA'}
                            </span>
                            <span className="text-slate-400 tabular-nums">100%</span>
                          </>
                        ) : (
                          <>
                            <span className="text-[#fbbf24] font-bold tabular-nums">
                              $ {spec.cashPrice}
                            </span>
                            <span className="text-slate-400">
                              NÍV. {req.requiredLevel}
                            </span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}

              {!isWeaponSlot && selectedSlot === 'specialGadget' && (
                <div className="rounded-[2px] border border-[#f97316] bg-[#191f2a] p-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="w-3 h-3 rounded-[1px] border border-[#f97316] bg-[#f97316]/20 text-[#f97316] flex items-center justify-center text-[8px] font-bold">
                      ✓
                    </span>
                    <span className="font-display font-bold text-[11px] text-[#fb923c]">
                      {classCombat.specialSlotTitle}
                    </span>
                  </div>
                  <div className="h-9 flex items-center justify-center">
                    <GearIconSvg kind="special" className="w-12 h-8" />
                  </div>
                  <p className="mt-1 font-mono text-[9px] text-slate-300 leading-snug">
                    {classCombat.specialSlotDesc}
                  </p>
                </div>
              )}

              {!isWeaponSlot &&
                selectedSlot !== 'specialGadget' &&
                gearOptionsForSlot.map((gear) => {
                  const isEquipped = currentEquippedForSlot === gear.id;
                  const isInspected = inspectedGearId === gear.id;
                  const isOwned = isGearOwnedInInventory(gear.id, playerXp);
                  const gearKind =
                    gear.slot === 'grenadePack' ? 'grenadePack' : gear.slot;

                  return (
                    <button
                      key={gear.id}
                      type="button"
                      onClick={() => {
                        if (isOwned) {
                          handleEquipOrBuyGear(gear);
                        } else {
                          soundEngine.playMenuSelect();
                          setInspectedGearId(gear.id);
                        }
                      }}
                      className={`w-full text-left rounded-[2px] border px-2 py-1.5 transition-colors cursor-pointer ${
                        isEquipped
                          ? 'bg-[#191f2a] border-[#f97316]'
                          : isInspected
                            ? 'bg-[#151a24] border-white/40'
                            : 'bg-[#10141c] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`w-3 h-3 rounded-[1px] border flex items-center justify-center text-[8px] font-bold shrink-0 ${
                            isEquipped
                              ? 'border-[#f97316] bg-[#f97316]/20 text-[#f97316]'
                              : isOwned
                                ? 'border-white/30 bg-black/40 text-transparent'
                                : 'border-white/15 bg-black/50 text-slate-400'
                          }`}
                        >
                          {isEquipped ? '✓' : !isOwned ? '×' : ''}
                        </span>
                        <span
                          className={`font-display font-bold text-[11px] truncate ${
                            isEquipped
                              ? 'text-[#fb923c]'
                              : isOwned
                                ? 'text-white'
                                : 'text-slate-400'
                          }`}
                        >
                          {gear.name}
                        </span>
                      </div>

                      <div className="h-8 flex items-center justify-center gap-2 my-0.5">
                        {gear.slot === 'grenadePack' ? (
                          <>
                            <GrenadePreview3D type="FRAG" className="w-8 h-7" />
                            <GrenadePreview3D type="SMOKE" className="w-8 h-7" />
                          </>
                        ) : (
                          <GearIconSvg
                            kind={gearKind}
                            className="w-10 h-6"
                            accent={isOwned ? '#e2e8f0' : '#64748b'}
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[8px] font-mono">
                        <span className="text-emerald-300 truncate">
                          {gear.perkLabel}
                        </span>
                        {!isOwned ? (
                          <span className="text-[#fbbf24] font-bold tabular-nums shrink-0">
                            $ {gear.cashPrice}
                          </span>
                        ) : (
                          <span className="text-slate-400 tabular-nums shrink-0">
                            100%
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* COLUNA 3: INFORMAÇÕES DA ARMA + 6 BARRAS DE STATUS (COMPACTO)   */}
          {/* --------------------------------------------------------------- */}
          <div className="col-span-4 min-h-0 flex flex-col justify-between bg-[#0a0d12] p-2 sm:p-2.5 overflow-y-auto">
            {isWeaponSlot ? (
              <div className="space-y-1.5">
                {/* Topo compacto: Preview 3D lateral + Nome + Categoria + Botão 360° */}
                <div className="rounded-[2px] border border-white/12 bg-[radial-gradient(ellipse_at_center,_#18202c_0%,_#0b0e14_100%)] p-1.5 flex items-center gap-2">
                  <div className="w-20 sm:w-24 h-11 shrink-0 flex items-center justify-center">
                    <WeaponPreview3D
                      weaponId={inspectedWeaponSpec.id}
                      locked={!inspectedWeaponOwned}
                      alt={inspectedWeaponSpec.name}
                      className="w-full h-10"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="font-display font-black text-xs sm:text-sm text-[#f97316] uppercase tracking-wide truncate">
                        {inspectedWeaponSpec.name}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playMenuSelect();
                          onOpenWeaponGunsmith();
                        }}
                        className="shrink-0 px-1.5 py-0.5 rounded-[2px] bg-[#141923] hover:bg-[#ea580c] border border-white/15 text-[8px] font-mono font-bold text-slate-200 hover:text-white uppercase cursor-pointer transition-colors"
                      >
                        3D ↗
                      </button>
                    </div>
                    <div className="text-[9px] font-mono text-slate-400 truncate">
                      {inspectedWeaponSpec.category} · {inspectedWeaponSpec.caliber}
                    </div>
                    <div className="text-[8px] font-mono text-slate-300 truncate">
                      <span className="text-[#fb923c] font-bold">Slots: </span>
                      {inspectedWeaponSpec.attachmentSlots}
                    </div>
                  </div>
                </div>

                <p className="text-[9px] font-sans text-slate-300 leading-snug line-clamp-2">
                  {inspectedWeaponSpec.description}
                </p>

                {/* 6 BARRAS HORIZONTAIS WARFACE COMPACTAS (SEMPRE VISÍVEIS) */}
                <div className="space-y-1 pt-1 border-t border-white/10">
                  {[
                    {
                      label: 'Dano:',
                      value: String(inspectedWeaponSpec.damageStat),
                      pct: inspectedWeaponSpec.damagePct,
                    },
                    {
                      label: 'Alcance:',
                      value: inspectedWeaponSpec.rangeLabel,
                      pct: inspectedWeaponSpec.rangePct,
                    },
                    {
                      label: 'Cadência:',
                      value: `${inspectedWeaponSpec.rpmLabel} RPM`,
                      pct: inspectedWeaponSpec.rpmPct,
                    },
                    {
                      label: 'Precisão (Mira):',
                      value: `${inspectedWeaponSpec.aimAcc}%`,
                      pct: inspectedWeaponSpec.aimAcc,
                    },
                    {
                      label: 'Precisão (Hip):',
                      value: `${inspectedWeaponSpec.hipAcc}%`,
                      pct: inspectedWeaponSpec.hipAcc,
                    },
                    {
                      label: 'Carregador:',
                      value: inspectedWeaponSpec.clipLabel,
                      pct: inspectedWeaponSpec.clipPct,
                    },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono mb-0.5">
                        <span className="text-slate-300">{stat.label}</span>
                        <span className="text-white font-bold tabular-nums">
                          {stat.value}
                        </span>
                      </div>
                      <div className="w-full h-[3px] bg-[#1e2531] overflow-hidden rounded-full">
                        <div
                          className="h-full bg-gradient-to-r from-[#ea580c] to-[#f97316]"
                          style={{ width: `${Math.min(100, Math.max(8, stat.pct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* MIRAS & SCOPES 3D (DESBLOQUEIO POR NÍVEL) */}
                {compatibleOpticsForInspected.length > 1 && (
                  <div className="pt-1.5 border-t border-white/10 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[9px] font-mono">
                      <span className="text-slate-400 font-bold uppercase tracking-wider">
                        MIRAS & SCOPES 3D (NÍVEL)
                      </span>
                      <span className="text-cyan-300 font-bold truncate">
                        {inspectedWeaponOpticSpec.shortLabel} ·{' '}
                        {inspectedWeaponOpticSpec.magnification}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {compatibleOpticsForInspected.map((scopeSpec) => {
                        const opticId = scopeSpec.id;
                        const active = inspectedWeaponOptic === opticId;
                        const unlocked = isOpticUnlockedAtXp(opticId, playerXp);
                        const reqOptic = getRequiredXpForOptic(opticId);
                        return (
                          <InventoryScopeOpticCard
                            key={opticId}
                            opticId={opticId}
                            shortLabel={scopeSpec.shortLabel}
                            magnification={scopeSpec.magnification}
                            title={`${scopeSpec.name} (${scopeSpec.magnification}) — ${scopeSpec.description} · Desbloqueia no Nível ${reqOptic.requiredLevel}`}
                            active={active}
                            unlocked={unlocked}
                            requiredLevel={reqOptic.requiredLevel}
                            onClick={() =>
                              handleSelectWeaponOptic(
                                inspectedWeaponSpec.id,
                                opticId
                              )
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* SKINS & CAMUFLAGEM DA ARMA */}
                <div className="pt-1.5 border-t border-white/10 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[9px] font-mono">
                    <span className="text-slate-400 font-bold uppercase tracking-wider">
                      SKINS & CAMUFLAGEM
                    </span>
                    <span className="text-[#fb923c] font-bold truncate">
                      {inspectedWeaponSkinSpec.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1">
                    {availableSkinsForInspected.map((skin) => {
                      const active = inspectedWeaponSkinId === skin.id;
                      const owned = isWeaponSkinOwned(skin.id);
                      const canAfford = playerCash >= skin.cashPrice;
                      return (
                        <button
                          key={skin.id}
                          type="button"
                          title={`${skin.name} — ${skin.description}`}
                          disabled={!owned && !canAfford}
                          onClick={() =>
                            handleSelectOrBuyWeaponSkin(
                              inspectedWeaponSpec.id,
                              skin
                            )
                          }
                          className={`rounded-[2px] border p-1 flex flex-col items-stretch gap-0.5 text-left transition-colors ${
                            active
                              ? 'bg-[#191f2a] border-[#f97316] cursor-pointer'
                              : owned || canAfford
                                ? 'bg-[#11151e] border-white/12 hover:border-white/35 cursor-pointer'
                                : 'bg-[#0e1118] border-white/5 opacity-55 cursor-not-allowed'
                          }`}
                        >
                          <div
                            className="w-full h-2.5 rounded-[1px] border border-white/15 relative overflow-hidden"
                            style={{
                              background: `linear-gradient(135deg, ${skin.swatchColors[0]} 0% 34%, ${skin.swatchColors[1]} 34% 68%, ${skin.swatchColors[2]} 68% 100%)`,
                            }}
                          >
                            {skin.category === 'SKIN_EXCLUSIVA' && (
                              <span className="absolute right-0.5 top-0 text-[7px] font-black text-white drop-shadow">
                                ★
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-0.5 text-[7px] font-mono leading-tight">
                            <span
                              className={`truncate font-bold ${
                                active ? 'text-[#fb923c]' : 'text-slate-200'
                              }`}
                            >
                              {skin.shortName}
                            </span>
                            {!owned ? (
                              <span className="text-[#fbbf24] shrink-0">
                                ${skin.cashPrice}
                              </span>
                            ) : active ? (
                              <span className="text-emerald-400 shrink-0">✓</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : selectedSlot === 'grenadePack' ? (
              <div className="space-y-2">
                <div className="relative rounded-[2px] border border-white/12 bg-[radial-gradient(ellipse_at_center,_#18202c_0%,_#0b0e14_100%)] p-2 flex items-center justify-center gap-4 h-20">
                  <div className="flex flex-col items-center">
                    <GrenadePreview3D type="FRAG" className="w-12 h-12" alt="Frag M67" />
                    <span className="font-mono text-[8px] text-orange-300 font-bold">
                      M67 ×{modifiers.fragCount}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <GrenadePreview3D type="SMOKE" className="w-12 h-12" alt="Fumaça M18" />
                    <span className="font-mono text-[8px] text-sky-300 font-bold">
                      M18 ×{modifiers.smokeCount}
                    </span>
                  </div>
                </div>
                <div>
                  <h3 className="font-display font-black text-xs sm:text-sm text-[#f97316] uppercase">
                    Kit de Granadas Táticas
                  </h3>
                  <div className="text-[9px] font-mono text-slate-400">
                    Frag M67 + Fumaça M18
                  </div>
                </div>
                <p className="text-[10px] text-slate-300 leading-snug border-t border-white/10 pt-1.5">
                  Frag M67 para limpar cantos e sites. Fumaça M18 para cruzar corredores e cobrir plant/defuse.
                </p>
              </div>
            ) : selectedSlot === 'specialGadget' ? (
              <div className="space-y-2">
                <div>
                  <h3 className="font-display font-black text-xs sm:text-sm text-[#f97316] uppercase">
                    {classCombat.specialSlotTitle}
                  </h3>
                  <div className="text-[9px] font-mono text-slate-400">
                    Equipamento Exclusivo · {classMeta.label}
                  </div>
                </div>
                <p className="text-[10px] text-slate-300 leading-snug border-t border-white/10 pt-1.5">
                  {classCombat.specialSlotDesc}
                </p>
                <div className="border-t border-white/10 pt-1.5 space-y-1 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vida + Colete Total:</span>
                    <strong className="text-emerald-400 tabular-nums">
                      {modifiers.totalMaxHealth} PV
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Colete Balístico Base:</span>
                    <strong className="text-white tabular-nums">
                      +{modifiers.armorBonus} AP
                    </strong>
                  </div>
                </div>
              </div>
            ) : inspectedGearItem ? (
              <div className="space-y-2">
                <div>
                  <h3 className="font-display font-black text-xs sm:text-sm text-[#f97316] uppercase">
                    {inspectedGearItem.name}
                  </h3>
                  <div className="text-[10px] font-mono text-emerald-300 font-bold">
                    {inspectedGearItem.perkLabel}
                  </div>
                  <div className="text-[9px] font-mono text-slate-400">
                    {inspectedGearItem.code} · {inspectedGearItem.rarity}
                  </div>
                </div>
                <p className="text-[10px] text-slate-300 leading-snug border-t border-white/10 pt-1.5">
                  {inspectedGearItem.description}
                </p>
                <div className="space-y-1 border-t border-white/10 pt-1.5 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vida + Colete Total:</span>
                    <strong className="text-emerald-400 tabular-nums">
                      {modifiers.totalMaxHealth} PV
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bônus Recarga:</span>
                    <strong className="text-white tabular-nums">
                      +{Math.round((modifiers.reloadSpeedMult - 1) * 100)}%
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Bônus Sprint:</span>
                    <strong className="text-white tabular-nums">
                      +{Math.round((modifiers.sprintSpeedMult - 1) * 100)}%
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Proteção Cabeça:</span>
                    <strong className="text-white tabular-nums">
                      +{modifiers.headshotReductionPct}%
                    </strong>
                  </div>
                </div>
              </div>
            ) : null}

            {/* BARRA DE AÇÃO INFERIOR COMPACTA EM LINHA ÚNICA */}
            <div className="pt-1.5 mt-1.5 border-t border-white/10 flex items-center gap-1.5 shrink-0">
              {isWeaponSlot && (
                <div className="flex-1 min-w-0">
                  {isInspectedWeaponEquipped ? (
                    <button
                      type="button"
                      onClick={(e) => handleConfirmAndClose(e)}
                      className="w-full py-1.5 px-2 rounded-[2px] border border-[#f97316]/75 bg-[#f97316]/20 hover:bg-[#f97316]/35 text-center font-mono font-bold text-[9px] sm:text-[10px] text-[#fb923c] uppercase truncate cursor-pointer transition-colors"
                    >
                      ✓ EQUIPADA · CONFIRMAR ({CLASS_TAB_SHORT[activeClass]})
                    </button>
                  ) : inspectedWeaponOwned ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEquipOrBuyWeapon(inspectedWeaponSpec.id);
                      }}
                      className="w-full py-1.5 px-2 rounded-[2px] bg-[#ea580c] hover:bg-[#f97316] text-white font-display font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors truncate"
                    >
                      EQUIPAR {inspectedWeaponSpec.name}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={playerCash < inspectedWeaponSpec.cashPrice}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEquipOrBuyWeapon(inspectedWeaponSpec.id);
                      }}
                      className={`w-full py-1.5 px-2 rounded-[2px] font-display font-black text-[9px] sm:text-[10px] uppercase tracking-wider transition-colors truncate ${
                        playerCash >= inspectedWeaponSpec.cashPrice
                          ? 'bg-[#ea580c] hover:bg-[#f97316] text-white cursor-pointer'
                          : 'bg-[#1a202c] border border-white/10 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {playerCash >= inspectedWeaponSpec.cashPrice
                        ? `COMPRAR ($ ${inspectedWeaponSpec.cashPrice})`
                        : `NÍV. ${inspectedWeaponReq.requiredLevel} ($ ${inspectedWeaponSpec.cashPrice})`}
                    </button>
                  )}
                </div>
              )}

              {!isWeaponSlot && selectedSlot !== 'specialGadget' && inspectedGearItem && (
                <div className="flex-1 min-w-0">
                  {isInspectedGearEquipped ? (
                    <button
                      type="button"
                      onClick={(e) => handleConfirmAndClose(e)}
                      className="w-full py-1.5 px-2 rounded-[2px] border border-[#f97316]/75 bg-[#f97316]/20 hover:bg-[#f97316]/35 text-center font-mono font-bold text-[9px] sm:text-[10px] text-[#fb923c] uppercase truncate cursor-pointer transition-colors"
                    >
                      ✓ EQUIPADO · CONFIRMAR ({CLASS_TAB_SHORT[activeClass]})
                    </button>
                  ) : isInspectedGearOwned ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEquipOrBuyGear(inspectedGearItem);
                      }}
                      className="w-full py-1.5 px-2 rounded-[2px] bg-[#ea580c] hover:bg-[#f97316] text-white font-display font-black text-[10px] uppercase tracking-wider cursor-pointer transition-colors truncate"
                    >
                      EQUIPAR ITEM
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={playerCash < inspectedGearItem.cashPrice}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEquipOrBuyGear(inspectedGearItem);
                      }}
                      className={`w-full py-1.5 px-2 rounded-[2px] font-display font-black text-[9px] sm:text-[10px] uppercase tracking-wider transition-colors truncate ${
                        playerCash >= inspectedGearItem.cashPrice
                          ? 'bg-[#ea580c] hover:bg-[#f97316] text-white cursor-pointer'
                          : 'bg-[#1a202c] border border-white/10 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {playerCash >= inspectedGearItem.cashPrice
                        ? `COMPRAR ($ ${inspectedGearItem.cashPrice})`
                        : `NÍV. ${inspectedGearItem.unlockLevel} ($ ${inspectedGearItem.cashPrice})`}
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={(e) => handleConfirmAndClose(e)}
                className="py-1.5 px-2.5 rounded-[2px] bg-[#161b24] hover:bg-[#1e2532] border border-white/15 text-[9px] sm:text-[10px] font-mono font-bold text-slate-200 uppercase cursor-pointer transition-colors shrink-0"
              >
                PRONTO ✓
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
