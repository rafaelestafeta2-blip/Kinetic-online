import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import { getActivePlayerClanSummary } from '../firebase/clanService';
import { PlayerCloudProfile } from '../firebase/playerProfileModel';
import {
  CALLING_CARD_CATALOG,
  CALLING_CARD_RARITY_META,
  getCallingCardById,
  getEquippedCallingCardId,
  setEquippedCallingCardId,
  subscribeEquippedCallingCard,
} from '../progression/callingCardsSystem';
import { getPlayerInventoryState } from '../progression/loadoutSystem';
import { CallingCardArtBackdrop } from './CallingCardArtBackdrop';
import { ClanEmblemIcon } from './ClanEmblemIcons';
import {
  OperatorTacticalAvatar,
  VanguardTeamEmblem,
  WARFACE_CLASS_META,
  WarfaceClassIcon,
} from './WarfaceClassIcons';
import { WarfaceRankIcon } from './WarfaceRankIcon';

interface PlayerProfileCallingCardsPanelProps {
  profile: PlayerCloudProfile;
}

export const PlayerProfileCallingCardsPanel: React.FC<
  PlayerProfileCallingCardsPanelProps
> = ({ profile }) => {
  const [equippedId, setEquippedId] = useState<string>(() =>
    getEquippedCallingCardId()
  );
  const [filterMode, setFilterMode] = useState<'ALL' | 'ANIMATED' | 'UNLOCKED'>('ALL');

  useEffect(() => {
    return subscribeEquippedCallingCard(setEquippedId);
  }, []);

  const clan = getActivePlayerClanSummary();
  const inv = getPlayerInventoryState();
  const activeCard = getCallingCardById(equippedId);
  const unlockedCount = CALLING_CARD_CATALOG.filter((c) =>
    c.isUnlocked(profile)
  ).length;
  const animatedCount = CALLING_CARD_CATALOG.filter((c) => c.animated).length;
  const filteredCards = CALLING_CARD_CATALOG.filter((c) => {
    if (filterMode === 'ANIMATED') return Boolean(c.animated);
    if (filterMode === 'UNLOCKED') return c.isUnlocked(profile);
    return true;
  });

  const handleEquip = (cardId: string) => {
    const ok = setEquippedCallingCardId(cardId, profile);
    if (ok) {
      soundEngine.playMenuSelect();
    } else {
      soundEngine.playMenuHover();
    }
  };

  return (
    <div className="space-y-3">
      {/* Live Preview Banner matching the Match Loading Calling Card */}
      <div className="rounded-xl bg-[#0b0f17]/95 border border-white/12 p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="space-y-1 text-center sm:text-left">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-amber-400">
            PRÉVIA NA TELA DE LOADING DO MAPA
          </div>
          <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
            <h4 className="font-display font-black text-sm sm:text-base text-white uppercase tracking-wider">
              {activeCard.name}
            </h4>
            {activeCard.animated && (
              <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-orange-500/30 to-fuchsia-500/30 border border-orange-400/60 font-mono text-[8px] font-black text-amber-200 uppercase tracking-wider">
                ✦ ANIMADA
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-slate-400">
            {activeCard.description} ·{' '}
            <span className="text-emerald-300 font-bold">
              {unlockedCount}/{CALLING_CARD_CATALOG.length} DESBLOQUEADAS
            </span>
          </p>
        </div>

        {/* Exact Match Loading Calling Card Preview */}
        <div
          className="relative w-full sm:w-[320px] h-14 rounded-[4px] overflow-hidden flex items-center justify-between border shadow-[0_0_24px_rgba(14,165,233,0.22)] shrink-0"
          style={{ borderColor: activeCard.borderHex }}
        >
          <CallingCardArtBackdrop card={activeCard} />

          <div className="relative z-10 w-14 h-14 shrink-0 border-r border-white/15 bg-[#090d14] overflow-hidden">
            <OperatorTacticalAvatar
              team="VANGUARD"
              classId={inv.selectedClass}
              photoUrl={profile.avatarDataUrl}
            />
            <div className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded-sm bg-black/80 border border-amber-400/50 flex items-center justify-center">
              <WarfaceRankIcon level={profile.rankLevel} className="w-3 h-3" />
            </div>
          </div>

          <div className="relative z-10 flex-1 min-w-0 px-2.5 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-display font-black text-amber-300 tracking-wide truncate drop-shadow">
                {profile.callsign}
              </span>
              <span
                title={WARFACE_CLASS_META[inv.selectedClass]?.label}
                className="inline-flex items-center justify-center w-4 h-4 rounded-[2px] bg-black/60 border border-white/15 shrink-0"
              >
                <WarfaceClassIcon
                  classId={inv.selectedClass}
                  className="w-3 h-3"
                  color="#bae6fd"
                />
              </span>
            </div>
            <div className="text-[9px] font-mono text-slate-300 truncate mt-0.5">
              {clan?.clanName ? `[${clan.clanName}]` : `LV.${profile.rankLevel} · ${profile.rankTitle}`}
            </div>
          </div>

          <div className="relative z-10 pr-2.5 pl-1 shrink-0 flex items-center justify-center">
            {clan?.clanName ? (
              <ClanEmblemIcon
                emblemId={clan.clanEmblemId || 'alpha_wolf'}
                className="w-9 h-9 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]"
              />
            ) : (
              <VanguardTeamEmblem className="w-6 h-6 opacity-65" />
            )}
          </div>
        </div>
      </div>

      {/* Filter bar for All / Animated / Unlocked calling cards */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {([
            { id: 'ALL', label: `TODAS (${CALLING_CARD_CATALOG.length})` },
            { id: 'ANIMATED', label: `✦ ANIMADAS (${animatedCount})` },
            { id: 'UNLOCKED', label: `DESBLOQUEADAS (${unlockedCount})` },
          ] as const).map((tab) => {
            const active = filterMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundEngine.playMenuSelect();
                  setFilterMode(tab.id);
                }}
                className={`px-2.5 py-1 rounded-md border font-mono text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer touch-manipulation ${
                  active
                    ? tab.id === 'ANIMATED'
                      ? 'bg-orange-500/25 border-orange-400/70 text-amber-200'
                      : 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[9px] text-slate-400">
          CLIQUE PARA EQUIPAR · APARECE NO PERFIL E NO LOADING DO MAPA
        </span>
      </div>

      {/* Grid of Premium Calling Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {filteredCards.map((card) => {
          const unlocked = card.isUnlocked(profile);
          const isEquipped = equippedId === card.id;
          const rarityMeta = CALLING_CARD_RARITY_META[card.rarity];
          const progressText = !unlocked && card.getProgressText
            ? card.getProgressText(profile)
            : null;

          return (
            <button
              key={card.id}
              type="button"
              disabled={!unlocked}
              onClick={() => handleEquip(card.id)}
              className={`group relative rounded-lg overflow-hidden border text-left transition-all flex flex-col justify-between min-h-[96px] touch-manipulation ${
                isEquipped
                  ? 'border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.35)] cursor-pointer'
                  : unlocked
                    ? 'border-white/15 hover:border-white/45 cursor-pointer'
                    : 'border-white/10 opacity-65 cursor-not-allowed'
              }`}
            >
              <CallingCardArtBackdrop card={card} />

              <div className="relative z-10 p-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`px-1.5 py-0.5 rounded border text-[8px] font-mono font-bold uppercase tracking-wider ${rarityMeta.badgeClass}`}
                    >
                      {rarityMeta.label}
                    </span>
                    {card.animated && (
                      <span className="px-1.5 py-0.5 rounded bg-black/70 border border-orange-400/60 text-amber-200 font-mono text-[8px] font-black uppercase">
                        ✦ ANIMADA
                      </span>
                    )}
                    {isEquipped && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[8px] font-black uppercase">
                        ✓ EQUIPADA
                      </span>
                    )}
                  </div>
                  <div className="font-display font-black text-xs sm:text-sm text-white uppercase tracking-wide mt-1 truncate drop-shadow">
                    {card.name}
                  </div>
                </div>

                {!unlocked && (
                  <span className="px-1.5 py-0.5 rounded bg-black/75 border border-white/15 font-mono text-[9px] text-slate-300 shrink-0">
                    🔒
                  </span>
                )}
              </div>

              <div className="relative z-10 px-2.5 pb-2 pt-1 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] text-slate-300 truncate">
                  {unlocked
                    ? card.unlockLabel
                    : progressText || card.unlockLabel}
                </span>
                {unlocked && !isEquipped && (
                  <span className="font-display font-black text-[9px] text-amber-300 uppercase tracking-wider shrink-0 group-hover:translate-x-0.5 transition-transform">
                    EQUIPAR »
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
