import React, { useState } from 'react';
import {
  getPlayerInventoryState,
  isWeaponOwnedInInventory,
  WARFACE_CLASS_LOADOUT_META,
} from '../progression/loadoutSystem';
import { GrenadeType, HudState, WeaponId } from '../types/game';
import {
  bindTap,
  FireModeIcon,
  FragGrenadeIcon,
  InspectEyeIcon,
  SmokeGrenadeIcon,
  WeaponSilhouette,
} from './hudTapUtils';

interface HudBottomWeaponDockProps {
  hud: HudState;
  onSelectWeapon: (weaponId: WeaponId) => void;
  onToggleWeaponSlot: () => void;
  onInspectWeapon: () => void;
  onCycleFireMode: () => void;
  onResupply: () => void;
  onSupportHeld?: (held: boolean) => void;
  onThrowGrenade: (type: GrenadeType) => void;
}

const SHORT_WEAPON_TAG: Record<WeaponId, string> = {
  M4_CARBINE: 'MX16A4',
  SMG_45: 'SMG .45',
  SMG_MP5: 'MPS5',
  SHOTGUN_12: 'DRAKE-12',
  SHOTGUN_SPAS: 'SPAS-12',
  AK47_RIFLE: 'AK-47',
  AK12_RIFLE: 'AK-200',
  S_MILITARY: 'SCAR-L',
  CARBINE_AR: 'CARBINE',
  L49_LMG: 'LMG 100',
  SNIPER_TACTICAL: 'MK14 EBR',
  SNIPER_BOLT: 'KAR98K',
  SNIPER_AWP: 'AWP .338',
  SNIPER_HEAVY: 'M200 .408',
  RPG7_LAUNCHER: 'RPG-7V',
  P50_PISTOL: 'DGL .50',
  M1911_PISTOL: 'M1911 .45',
  KNIFE_TACTICAL: 'FACA',
};

const PRIMARY_CYCLE_ORDER: WeaponId[] = [
  'M4_CARBINE',
  'SMG_45',
  'SMG_MP5',
  'SHOTGUN_12',
  'SHOTGUN_SPAS',
  'AK47_RIFLE',
  'AK12_RIFLE',
  'S_MILITARY',
  'CARBINE_AR',
  'L49_LMG',
  'SNIPER_TACTICAL',
  'SNIPER_BOLT',
  'SNIPER_AWP',
  'SNIPER_HEAVY',
  'RPG7_LAUNCHER',
];

export const HudBottomWeaponDock: React.FC<HudBottomWeaponDockProps> = ({
  hud,
  onSelectWeapon,
  onToggleWeaponSlot,
  onInspectWeapon,
  onCycleFireMode,
  onResupply,
  onSupportHeld,
  onThrowGrenade,
}) => {
  const [arsenalOpen, setArsenalOpen] = useState(false);

  const reserveAmmo = hud.magazines.reduce((acc, r) => acc + r, 0);
  const currentTotalLoaded = hud.currentMagRounds + hud.chambered;
  const isKnifeActive = hud.activeWeapon === 'KNIFE_TACTICAL';
  const isSecondaryActive =
    hud.activeWeapon === 'P50_PISTOL' || hud.activeWeapon === 'M1911_PISTOL';
  const isPrimaryActive = !isSecondaryActive && !isKnifeActive;

  const handlePrimarySlotTap = () => {
    if (hud.equippedGrenade !== null) {
      onSelectWeapon(hud.primaryWeapon);
      setArsenalOpen(false);
      return;
    }
    if (!isPrimaryActive) {
      onSelectWeapon(hud.primaryWeapon);
      setArsenalOpen(false);
    } else if (hud.drillMode === 'FREE_RANGE') {
      const idx = PRIMARY_CYCLE_ORDER.indexOf(hud.primaryWeapon);
      const nextWeapon =
        PRIMARY_CYCLE_ORDER[(idx + 1) % PRIMARY_CYCLE_ORDER.length];
      onSelectWeapon(nextWeapon);
    } else {
      const selectedClass = getPlayerInventoryState().selectedClass;
      const allowedOwned = WARFACE_CLASS_LOADOUT_META[
        selectedClass
      ].allowedPrimaries.filter((w) => isWeaponOwnedInInventory(w));
      const pool = allowedOwned.length > 0 ? allowedOwned : [hud.primaryWeapon];
      const idx = pool.indexOf(hud.primaryWeapon);
      const nextWeapon = pool[(idx + 1) % pool.length];
      if (nextWeapon !== hud.primaryWeapon) {
        onSelectWeapon(nextWeapon);
      } else {
        onToggleWeaponSlot();
      }
      setArsenalOpen(false);
    }
  };

  const handleSecondarySlotTap = () => {
    const equippedSec = hud.secondaryWeapon || 'P50_PISTOL';
    if (hud.equippedGrenade !== null) {
      onSelectWeapon(equippedSec);
      setArsenalOpen(false);
      return;
    }
    if (isSecondaryActive) {
      onSelectWeapon(hud.primaryWeapon);
    } else {
      onSelectWeapon(equippedSec);
    }
    setArsenalOpen(false);
  };

  const handleKnifeSlotTap = () => {
    if (hud.equippedGrenade !== null) {
      onSelectWeapon('KNIFE_TACTICAL');
      setArsenalOpen(false);
      return;
    }
    if (isKnifeActive) {
      onSelectWeapon(hud.primaryWeapon);
    } else {
      onSelectWeapon('KNIFE_TACTICAL');
    }
    setArsenalOpen(false);
  };

  const hpPct = Math.max(
    0,
    Math.min(100, (hud.health / Math.max(1, hud.maxHealth)) * 100)
  );
  const armorPct = Math.max(
    0,
    Math.min(100, ((hud.armor || 0) / Math.max(1, hud.maxArmor || 1)) * 100)
  );

  return (
    <>
      {/* BOTTOM-LEFT: ANGLED METALLIC VITALITY PLATE (+100 HP & SHIELD 100 ARMOR) MATCHING REFERENCE */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed bottom-2 left-2.5 z-40 pointer-events-none select-none flex flex-col items-start gap-1"
      >
        {hud.supportPrompt ? (
          <div className="text-[9px] font-mono font-bold tracking-wide text-amber-200/95 bg-black/80 border border-amber-400/40 px-2.5 py-0.5 rounded shadow-md max-w-[18rem] truncate">
            {hud.supportPrompt}
          </div>
        ) : null}

        {hud.kitChannelProgress > 0.01 && (
          <div className="w-44 h-1.5 bg-black/80 border border-cyan-400/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-75"
              style={{ width: `${Math.round(hud.kitChannelProgress * 100)}%` }}
            />
          </div>
        )}

        <div
          className="relative w-44 sm:w-48 h-12 px-4 py-1.5 bg-gradient-to-r from-[#23282e]/92 via-[#2c333b]/90 to-[#1d2228]/92 border-t border-b border-white/30 shadow-[0_6px_20px_rgba(0,0,0,0.75)] flex flex-col justify-center gap-1"
          style={{
            clipPath: 'polygon(7% 0%, 91% 0%, 100% 100%, 0% 100%)',
          }}
        >
          {/* Subtle top cyan accent line */}
          <div className="absolute top-0 left-3 right-5 h-[1.5px] bg-gradient-to-r from-sky-400/70 via-cyan-300/80 to-transparent" />

          {/* Health Row (+ 100 + Cyan Bar) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-[3.2rem]">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
                className={
                  hud.health < 35
                    ? 'text-red-400 animate-pulse'
                    : 'text-white drop-shadow'
                }
              >
                <path d="M19 10h-5V5H10v5H5v4h5v5h4v-5h5v-4z" />
              </svg>
              <span
                className={`text-xs sm:text-[13px] font-display font-black tabular-nums leading-none ${
                  hud.health < 35 ? 'text-red-400 animate-pulse' : 'text-white'
                }`}
              >
                {Math.round(hud.health)}
              </span>
            </div>
            <div className="flex-1 h-2 bg-black/55 rounded-xs overflow-hidden border border-white/15">
              <div
                className={`h-full transition-all duration-150 ${
                  hud.health < 35
                    ? 'bg-gradient-to-r from-red-600 to-rose-400 animate-pulse'
                    : 'bg-gradient-to-r from-[#0099ff] to-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.7)]'
                }`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>

          {/* Armor Row (Shield 100 + Cyan Bar) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-[3.2rem]">
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-white drop-shadow"
              >
                <path d="M12 2L4 5.5v6.5c0 5.2 3.4 9.8 8 11 4.6-1.2 8-5.8 8-11V5.5L12 2z" />
              </svg>
              <span className="text-xs sm:text-[13px] font-display font-black tabular-nums text-white leading-none">
                {Math.round(hud.armor || 0)}
              </span>
            </div>
            <div className="flex-1 h-2 bg-black/55 rounded-xs overflow-hidden border border-white/15">
              <div
                className="h-full bg-gradient-to-r from-[#0099ff] to-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.7)] transition-all duration-150"
                style={{ width: `${armorPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT: ANGLED ACTIVE WEAPON PLATE + DISCREET POPUP ARSENAL & CLASS KIT MENU */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed bottom-0.5 right-1.5 z-40 pointer-events-auto select-none font-mono flex flex-col items-end"
        style={{ touchAction: 'manipulation' }}
      >
        {/* Discreet Popup Menu Above Active Weapon Plate */}
        {arsenalOpen && (
          <div className="mb-1.5 bg-[#0e131a]/96 border border-sky-400/45 rounded-xl p-2 shadow-[0_10px_30px_rgba(0,0,0,0.85)] flex flex-col gap-1.5 min-w-[230px] sm:min-w-[260px] animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between border-b border-white/10 pb-1 px-1">
              <span className="text-[9px] font-display font-black tracking-widest text-sky-300 uppercase">
                ARSENAL & KIT DE CLASSE
              </span>
              <button
                type="button"
                {...bindTap(() => setArsenalOpen(false))}
                className="text-[10px] font-bold text-slate-400 hover:text-white px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Row 1: Primary Weapon, Secondary Pistol, Melee Knife */}
            <div className="grid grid-cols-3 gap-1">
              {/* Primary Slot */}
              <button
                type="button"
                {...bindTap(handlePrimarySlotTap)}
                title="Equipar / Trocar Arma Principal [1]"
                className={`relative h-12 rounded-lg px-1.5 flex flex-col items-center justify-center border transition-all active:scale-95 cursor-pointer ${
                  isPrimaryActive && hud.equippedGrenade === null
                    ? 'bg-sky-500/25 border-sky-400 text-white shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                    : 'bg-black/65 border-white/20 text-white/75 hover:text-white'
                }`}
              >
                <span className="text-[8px] font-bold text-amber-300 uppercase leading-none mb-0.5 truncate max-w-full">
                  {SHORT_WEAPON_TAG[hud.primaryWeapon]}
                </span>
                <WeaponSilhouette
                  weaponId={hud.primaryWeapon}
                  className="w-12 h-4"
                />
                <span className="text-[7px] text-slate-300 leading-none mt-0.5">
                  [1] PRINCIPAL
                </span>
              </button>

              {/* Secondary Pistol Slot */}
              <button
                type="button"
                {...bindTap(handleSecondarySlotTap)}
                title="Equipar Pistola Secundária [2]"
                className={`relative h-12 rounded-lg px-1.5 flex flex-col items-center justify-center border transition-all active:scale-95 cursor-pointer ${
                  isSecondaryActive && hud.equippedGrenade === null
                    ? 'bg-sky-500/25 border-sky-400 text-white shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                    : 'bg-black/65 border-white/20 text-white/75 hover:text-white'
                }`}
              >
                <span className="text-[8px] font-bold text-amber-300 uppercase leading-none mb-0.5">
                  {SHORT_WEAPON_TAG[hud.secondaryWeapon || 'P50_PISTOL']}
                </span>
                <WeaponSilhouette
                  weaponId={hud.secondaryWeapon || 'P50_PISTOL'}
                  className="w-9 h-4"
                />
                <span className="text-[7px] text-slate-300 leading-none mt-0.5">
                  [2] PISTOLA
                </span>
              </button>

              {/* Melee Knife Slot */}
              <button
                type="button"
                {...bindTap(handleKnifeSlotTap)}
                title="Equipar Faca de Combate [3]"
                className={`relative h-12 rounded-lg px-1.5 flex flex-col items-center justify-center border transition-all active:scale-95 cursor-pointer ${
                  isKnifeActive && hud.equippedGrenade === null
                    ? 'bg-red-500/30 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.35)]'
                    : 'bg-black/65 border-white/20 text-white/75 hover:text-white'
                }`}
              >
                <span className="text-[8px] font-bold text-red-300 uppercase leading-none mb-0.5">
                  FACA
                </span>
                <WeaponSilhouette
                  weaponId="KNIFE_TACTICAL"
                  className="w-10 h-4"
                />
                <span className="text-[7px] text-slate-300 leading-none mt-0.5">
                  [3] CORPO
                </span>
              </button>
            </div>

            {/* Row 2: Class Support Kit (Ammo Box / Medkit / Armor), Frag Grenade, Smoke Grenade, Fire Mode, Inspect */}
            <div className="flex items-center gap-1">
              {/* Class Support Kit (Fuzileiro = Ammo Box, Médico = Medkit, Engenheiro = Armor Kit) */}
              <ClassSupportButton
                hud={hud}
                onResupply={onResupply}
                onSupportHeld={onSupportHeld}
              />

              {/* Frag Grenade [G] */}
              <button
                type="button"
                {...bindTap(() => {
                  onThrowGrenade('FRAG');
                  setArsenalOpen(false);
                })}
                title="Granada Frag [G]"
                className={`flex-1 h-11 rounded-lg flex flex-col items-center justify-center border transition-all active:scale-95 cursor-pointer ${
                  hud.equippedGrenade === 'FRAG'
                    ? 'bg-orange-500/40 border-orange-400 text-orange-100'
                    : hud.fragGrenades > 0
                      ? 'bg-black/70 border-orange-400/60 text-orange-300 hover:bg-black/90'
                      : 'bg-black/40 border-white/15 text-white/35'
                }`}
              >
                <FragGrenadeIcon />
                <span className="text-[8px] font-bold leading-none mt-0.5">
                  {hud.equippedGrenade === 'FRAG' ? 'JOGAR' : `FRAG x${hud.fragGrenades}`}
                </span>
              </button>

              {/* Smoke Grenade [J] */}
              <button
                type="button"
                {...bindTap(() => {
                  onThrowGrenade('SMOKE');
                  setArsenalOpen(false);
                })}
                title="Granada Smoke [J]"
                className={`flex-1 h-11 rounded-lg flex flex-col items-center justify-center border transition-all active:scale-95 cursor-pointer ${
                  hud.equippedGrenade === 'SMOKE'
                    ? 'bg-sky-500/40 border-sky-400 text-sky-100'
                    : hud.smokeGrenades > 0
                      ? 'bg-black/70 border-sky-400/60 text-sky-300 hover:bg-black/90'
                      : 'bg-black/40 border-white/15 text-white/35'
                }`}
              >
                <SmokeGrenadeIcon />
                <span className="text-[8px] font-bold leading-none mt-0.5">
                  {hud.equippedGrenade === 'SMOKE' ? 'JOGAR' : `SMOKE x${hud.smokeGrenades}`}
                </span>
              </button>

              {/* Fire Mode Toggle [B] */}
              <button
                type="button"
                {...bindTap(onCycleFireMode)}
                title={`Modo de Disparo: ${hud.fireMode} [B]`}
                className="w-10 h-11 rounded-lg bg-black/70 hover:bg-black/90 border border-white/25 text-white flex flex-col items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
              >
                <FireModeIcon mode={hud.fireMode} />
                <span className="text-[7px] font-bold text-amber-300 leading-none">
                  {hud.fireMode}
                </span>
              </button>

              {/* 3D Weapon Inspect [F] */}
              <button
                type="button"
                {...bindTap(() => {
                  onInspectWeapon();
                  setArsenalOpen(false);
                })}
                title="Inspecionar Arma 3D [F]"
                className="w-9 h-11 rounded-lg bg-black/70 hover:bg-black/90 border border-white/25 text-white flex flex-col items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
              >
                <InspectEyeIcon />
                <span className="text-[7px] font-bold text-slate-300 leading-none">
                  VER
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Active Weapon Angled Plate (Compact so Jump/Crouch/Fire touch buttons stay unobstructed) */}
        <button
          type="button"
          {...bindTap(() => setArsenalOpen((prev) => !prev))}
          aria-label="Abrir menu de armas, granadas e kit da classe"
          title="Toque para abrir Arsenal (Pistola, Faca, Kit da Classe e Granadas)"
          className={`relative w-36 sm:w-44 h-9 sm:h-10 px-2.5 sm:px-3 bg-gradient-to-l from-[#23282e]/92 via-[#2c333b]/90 to-[#1d2228]/92 border-t border-b transition-all active:scale-95 cursor-pointer flex items-center justify-between gap-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.75)] ${
            arsenalOpen ? 'border-sky-400' : 'border-white/30 hover:border-sky-300/60'
          }`}
          style={{
            clipPath: 'polygon(9% 0%, 93% 0%, 100% 100%, 0% 100%)',
          }}
        >
          {/* Subtle top cyan accent line */}
          <div className="absolute top-0 left-4 right-2.5 h-[1.5px] bg-gradient-to-l from-sky-400/70 via-cyan-300/80 to-transparent" />

          {/* Left side: Active Weapon Silhouette + discreet upward expand indicator */}
          <div className="flex items-center gap-1 pl-0.5">
            <span className="text-[8px] text-sky-300/90 font-bold leading-none">
              {arsenalOpen ? '▼' : '▲'}
            </span>
            <WeaponSilhouette
              weaponId={hud.activeWeapon}
              className="w-12 sm:w-14 h-4 sm:h-5 text-white drop-shadow"
            />
          </div>

          {/* Right side: 30 / 120 Ammo Counter */}
          <div className="flex items-baseline gap-0.5 pr-1">
            {isKnifeActive ? (
              <span className="text-xs font-display font-black text-white tracking-wider">
                FACA
              </span>
            ) : (
              <>
                <span className="text-sm sm:text-base font-display font-black tabular-nums text-white leading-none">
                  {currentTotalLoaded}
                </span>
                <span className="text-[10px] font-display font-bold text-white/70 leading-none">
                  /
                </span>
                <span className="text-[10px] sm:text-xs font-display font-bold tabular-nums text-white/90 leading-none">
                  {reserveAmmo}
                </span>
              </>
            )}
          </div>

          {/* Reload progress bar along bottom edge when reloading */}
          {hud.reloadPhase !== 'IDLE' && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-amber-500/25 overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-75"
                style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
              />
            </div>
          )}
        </button>
      </div>
    </>
  );
};

const ClassSupportButton: React.FC<{
  hud: HudState;
  onResupply: () => void;
  onSupportHeld?: (held: boolean) => void;
}> = ({ hud, onResupply, onSupportHeld }) => {
  const kind = hud.supportKind || 'NONE';
  const charges = hud.supportCharges ?? 0;
  const cooling = (hud.supportCooldownSec || 0) > 0.05;
  const accent =
    kind === 'HEAL'
      ? 'text-emerald-300 border-emerald-400/60 bg-emerald-950/40'
      : kind === 'ARMOR'
        ? 'text-sky-300 border-sky-400/60 bg-sky-950/40'
        : kind === 'AMMO'
          ? 'text-amber-300 border-amber-400/60 bg-amber-950/40'
          : 'text-white/40 border-white/20 bg-black/50';
  const label =
    kind === 'HEAL'
      ? 'KIT MÉDICO'
      : kind === 'ARMOR'
        ? 'BLINDAGEM'
        : kind === 'AMMO'
          ? 'MUNIÇÃO'
          : 'SEM KIT';
  const title =
    kind === 'HEAL'
      ? 'Kit Médico / Desfibrilador [U]'
      : kind === 'ARMOR'
        ? 'Kit de Blindagem [U]'
        : kind === 'AMMO'
          ? 'Caixa de Munição (Recarregar Munição) [U]'
          : 'Sem kit de suporte';

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onResupply();
        onSupportHeld?.(true);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onSupportHeld?.(false);
      }}
      onPointerCancel={() => onSupportHeld?.(false)}
      onPointerLeave={() => onSupportHeld?.(false)}
      aria-label={title}
      title={title}
      className={`relative px-2 h-11 rounded-lg border ${accent} flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform cursor-pointer ${
        cooling || (charges <= 0 && kind !== 'HEAL') ? 'opacity-55' : ''
      }`}
    >
      {kind === 'HEAL' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11 3h2v8h8v2h-8v8h-2v-8H3v-2h8V3z" />
        </svg>
      ) : kind === 'ARMOR' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6l-8-4z" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" />
          <path d="M8 7V5h8v2" stroke="currentColor" strokeWidth="2" />
          <path d="M12 11v5M9.5 13.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      <span className="text-[7px] font-bold leading-none tabular-nums whitespace-nowrap">
        {kind === 'NONE' ? label : `${label} x${charges}`}
      </span>
    </button>
  );
};
