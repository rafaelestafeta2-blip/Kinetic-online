import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  claimDailyContractReward,
  DailyContractsSnapshot,
  getDailyContractsSnapshot,
  subscribeDailyContracts,
} from '../progression/dailyContractsSystem';

interface DailyContractsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DailyContractsModal: React.FC<DailyContractsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState<DailyContractsSnapshot>(() =>
    getDailyContractsSnapshot()
  );
  const [recentClaimBanner, setRecentClaimBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsub = subscribeDailyContracts((next) => setSnapshot(next));
    return unsub;
  }, [isOpen]);

  useEffect(() => {
    if (!recentClaimBanner) return;
    const timer = window.setTimeout(() => setRecentClaimBanner(null), 2600);
    return () => window.clearTimeout(timer);
  }, [recentClaimBanner]);

  if (!isOpen) return null;

  const completedTotal = snapshot.contracts.filter((c) => c.claimed).length;

  const handleClaim = (contractId: string) => {
    const res = claimDailyContractReward(contractId);
    if (res.ok) {
      soundEngine.playMenuSelect();
      setRecentClaimBanner(`+${res.xp} XP · +${res.cash} K-MONEY RESGATADOS`);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 pointer-events-auto select-none"
    >
      <div className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-2xl bg-[#090d14]/98 border border-red-500/40 shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/10 bg-gradient-to-r from-[#24090d] via-[#10141f] to-[#0a0e16] flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-black text-sm sm:text-base tracking-widest text-white uppercase">
                CONTRATOS DIÁRIOS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-[10px] font-mono font-bold text-amber-300">
                {completedTotal}/{snapshot.contracts.length}
              </span>
            </div>
            <p className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase">
              ROTAÇÃO DO DIA · {snapshot.state.dayKey}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuSelect();
              onClose();
            }}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-mono font-bold text-slate-200 hover:text-white uppercase cursor-pointer shrink-0 transition-colors"
          >
            FECHAR ✕
          </button>
        </div>

        {/* Claim feedback */}
        {recentClaimBanner && (
          <div className="mx-4 sm:mx-5 mt-3 px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-400/50 text-center text-[11px] font-mono font-bold text-emerald-300 tracking-wider uppercase">
            {recentClaimBanner}
          </div>
        )}

        {/* Contracts List */}
        <div className="p-4 sm:p-5 overflow-y-auto flex flex-col gap-3">
          {snapshot.contracts.map((contract) => {
            const pct = Math.min(
              100,
              Math.round((contract.progress / Math.max(1, contract.target)) * 100)
            );
            return (
              <div
                key={contract.id}
                className={`rounded-xl border p-3.5 transition-colors ${
                  contract.canClaim
                    ? 'bg-amber-500/10 border-amber-400/60 shadow-[0_0_20px_rgba(245,158,11,0.16)]'
                    : contract.claimed
                      ? 'bg-emerald-950/20 border-emerald-500/30 opacity-80'
                      : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-display font-black text-xs sm:text-sm tracking-wider text-white uppercase">
                      {contract.title}
                    </h4>
                    <p className="text-[11px] font-mono text-slate-300 mt-0.5 leading-snug">
                      {contract.description}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/35 text-[10px] font-mono font-bold text-sky-300">
                      +{contract.rewardXp} XP
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/35 text-[10px] font-mono font-bold text-amber-300">
                      +{contract.rewardCash} K$
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span className="text-slate-400 uppercase">PROGRESSO</span>
                      <span
                        className={`font-bold tabular-nums ${
                          contract.completed ? 'text-emerald-300' : 'text-white'
                        }`}
                      >
                        {contract.progress} / {contract.target}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          contract.claimed
                            ? 'bg-emerald-400'
                            : contract.canClaim
                              ? 'bg-amber-400'
                              : 'bg-gradient-to-r from-red-500 to-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="shrink-0">
                    {contract.claimed ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-display font-black tracking-wider text-emerald-300 uppercase">
                        RESGATADO
                      </span>
                    ) : contract.canClaim ? (
                      <button
                        type="button"
                        onClick={() => handleClaim(contract.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-[10px] sm:text-xs tracking-wider uppercase shadow-[0_0_16px_rgba(251,191,36,0.45)] cursor-pointer active:scale-95 transition-transform"
                      >
                        RESGATAR
                      </button>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono font-bold text-slate-400 uppercase">
                        EM ANDAMENTO
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-2.5 border-t border-white/10 bg-black/40 text-[10px] font-mono text-slate-400 flex items-center justify-between gap-2 shrink-0">
          <span>Progresso válido exclusivamente em partidas online PvP.</span>
          <span className="text-slate-500 uppercase shrink-0">SINCRONIZADO NA NUVEM</span>
        </div>
      </div>
    </div>
  );
};
