import React, { useMemo } from 'react';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import { getNextRank, getRankForXp } from '../progression/ranks';
import { WeaponId, YardBombHudInfo } from '../types/game';
import { bindTap } from './hudTapUtils';
import { WarfaceRankIcon } from './WarfaceRankIcon';

interface PostMatchRewardsOverlayProps {
  yardBomb: YardBombHudInfo;
  onContinue: () => void;
}

const WEAPON_LABELS: Partial<Record<WeaponId, string>> = {
  M4_CARBINE: 'M4A1 Carbine',
  AK47_RIFLE: 'AK-47',
  AK12_RIFLE: 'AK-12',
  S_MILITARY: 'SCAR-L S-Military',
  SMG_45: 'SMG .45',
  SMG_MP5: 'MP5A3',
  SHOTGUN_12: 'M870',
  SHOTGUN_SPAS: 'SPAS-12',
  CARBINE_AR: 'HK416',
  L49_LMG: 'L49 LMG',
  SNIPER_BOLT: 'Bolt Sniper',
  SNIPER_TACTICAL: 'M110 SASS',
  P50_PISTOL: 'Desert Eagle',
};

export const PostMatchRewardsOverlay: React.FC<PostMatchRewardsOverlayProps> = ({
  yardBomb,
  onContinue,
}) => {
  const profile = getCloudSyncState().profile;
  const startXp = yardBomb.matchStartXp ?? Math.max(0, profile.playerXp - yardBomb.totalMatchXp);
  const startRank = yardBomb.matchStartRank ?? getRankForXp(startXp).level;
  const endXp = profile.playerXp;
  const endRank = getRankForXp(endXp);
  const startCash = yardBomb.matchStartCash ?? Math.max(0, profile.playerCash - yardBomb.totalMatchCash);
  const cashGained = Math.max(yardBomb.totalMatchCash, profile.playerCash - startCash);
  const xpGained = Math.max(yardBomb.totalMatchXp, endXp - startXp);
  const rankedUp = endRank.level > startRank;
  const next = getNextRank(endRank.level);

  const newUnlocks = useMemo(() => {
    const startSet = new Set(yardBomb.matchStartUnlockedWeapons || []);
    const now = profile.unlockedWeapons || [];
    const freshly = now.filter((w) => !startSet.has(w));
    const labels: string[] = freshly.map(
      (w) => WEAPON_LABELS[w] || String(w).replace(/_/g, ' ')
    );
    if (rankedUp && endRank.unlockRewardLabel) {
      labels.unshift(endRank.unlockRewardLabel);
    }
    return labels;
  }, [
    yardBomb.matchStartUnlockedWeapons,
    profile.unlockedWeapons,
    rankedUp,
    endRank.unlockRewardLabel,
  ]);

  const xpIntoRank = endXp - endRank.requiredXp;
  const xpSpan = Math.max(
    1,
    (next?.requiredXp || endRank.requiredXp + 500) - endRank.requiredXp
  );
  const xpPct = Math.min(100, Math.round((xpIntoRank / xpSpan) * 100));
  const isVictory = yardBomb.matchWinner === 'VANGUARD';

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 z-70 bg-[#04070e]/92 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 select-none overflow-y-auto"
    >
      <div className="w-full max-w-lg max-h-[94dvh] flex flex-col rounded-2xl border border-amber-400/35 bg-gradient-to-b from-[#101827] to-[#070b14] shadow-2xl overflow-hidden">
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div>
            <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.26em] text-amber-300/80 uppercase">
              Recompensas da Partida
            </div>
            <h2 className="font-display font-black text-base sm:text-xl text-white tracking-wider uppercase leading-tight">
              {isVictory ? 'Vitória · Progressão' : 'Derrota · Progressão'}
            </h2>
          </div>
          <WarfaceRankIcon level={endRank.level} className="w-9 h-9 sm:w-11 sm:h-11 shrink-0" />
        </div>

        <div className="p-3 sm:p-4 space-y-2.5 sm:space-y-3 overflow-y-auto flex-1 min-h-0">
          <div className="rounded-xl border border-white/10 bg-black/30 p-2.5 sm:p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                Patente {startRank} → {endRank.level}
                {rankedUp && (
                  <span className="ml-2 text-amber-300 font-bold">SUBIU!</span>
                )}
              </span>
              <span className="text-amber-300 font-bold">+{xpGained} XP</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-sky-400"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>{endRank.title}</span>
              <span>
                {xpIntoRank}/{xpSpan} XP
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-2.5 sm:p-3">
              <div className="text-[9px] sm:text-[10px] font-mono text-emerald-300/80 uppercase">
                Créditos
              </div>
              <div className="text-lg sm:text-2xl font-display font-black text-emerald-300 tabular-nums leading-tight">
                +${cashGained.toLocaleString('pt-BR')}
              </div>
              <div className="text-[9px] sm:text-[10px] font-mono text-slate-400">
                Saldo ${profile.playerCash.toLocaleString('pt-BR')}
              </div>
            </div>
            <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-2.5 sm:p-3">
              <div className="text-[9px] sm:text-[10px] font-mono text-sky-300/80 uppercase">
                Experiência
              </div>
              <div className="text-lg sm:text-2xl font-display font-black text-sky-300 tabular-nums leading-tight">
                +{xpGained}
              </div>
              <div className="text-[9px] sm:text-[10px] font-mono text-slate-400">
                Total {endXp.toLocaleString('pt-BR')} XP
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/25 p-2.5 sm:p-3">
            <div className="text-[9px] sm:text-[10px] font-mono tracking-wider text-amber-200 uppercase mb-1">
              Desbloqueios
            </div>
            {newUnlocks.length === 0 ? (
              <p className="text-[11px] font-mono text-slate-400 leading-snug">
                Nenhum item novo nesta partida. Continue jogando para liberar armas e acessórios.
              </p>
            ) : (
              <ul className="space-y-1">
                {newUnlocks.map((label) => (
                  <li
                    key={label}
                    className="text-xs font-mono text-amber-100 flex items-start gap-2"
                  >
                    <span className="text-amber-400 font-black">NEW</span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-3.5 pb-3 pt-2 sm:px-4 sm:pb-4 border-t border-white/10 shrink-0 bg-[#070b14]/90">
          <button
            type="button"
            {...bindTap(onContinue)}
            className="w-full py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-display font-black tracking-wider uppercase text-xs sm:text-sm shadow-[0_0_20px_rgba(245,158,11,0.35)] active:scale-[0.98] cursor-pointer"
          >
            Continuar para o Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
