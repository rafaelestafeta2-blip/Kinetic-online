import React, { useEffect, useState } from 'react';
import { soundEngine } from '../audio/soundEngine';
import {
  CloudSyncState,
  purchaseMonthlyVipBattlePassWithDiamonds,
} from '../firebase/playerCloudSync';
import { syncEquippedWeaponToInventory } from '../progression/loadoutSystem';
import {
  BATTLE_PASS_TIERS,
  claimBattlePassTierReward,
  DIAMOND_STORE_PACKS,
  getCurrentMonthKey,
  getVipBattlePassState,
  getVipRemainingDays,
  getWeaponOfTheMonth,
  isVipBattlePassActive,
  subscribeVipBattlePass,
  VIP_PASS_DIAMOND_PRICE,
  VipBattlePassCloudState,
} from '../progression/vipBattlePassSystem';
import { WeaponId } from '../types/game';

interface VipBattlePassModalProps {
  playerXp: number;
  syncState: CloudSyncState;
  onSelectWeapon: (weaponId: WeaponId) => void;
  onClose: () => void;
}

export const VipBattlePassModal: React.FC<VipBattlePassModalProps> = ({
  playerXp,
  syncState,
  onSelectWeapon,
  onClose,
}) => {
  const [subTab, setSubTab] = useState<'PASS' | 'STORE'>('PASS');
  const [vipState, setVipState] = useState<VipBattlePassCloudState>(() =>
    getVipBattlePassState()
  );
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    kind: 'ok' | 'info' | 'err';
    text: string;
    checkoutUrl?: string;
  } | null>(null);

  useEffect(() => {
    const unsub = subscribeVipBattlePass((next) => setVipState(next));
    return unsub;
  }, []);

  const diamonds = Math.max(0, Math.floor(Number(syncState.profile.diamonds) || 0));
  const vipActive = isVipBattlePassActive(vipState);
  const remainingDays = getVipRemainingDays(vipState);
  const monthKey = getCurrentMonthKey();
  const weaponOfMonth = getWeaponOfTheMonth(monthKey);

  const handleActivateVip = async () => {
    if (busy) return;
    soundEngine.playMenuSelect();

    if (diamonds < VIP_PASS_DIAMOND_PRICE) {
      setSubTab('STORE');
      setStatusMessage({
        kind: 'info',
        text: `Você tem ${diamonds} Diamantes. Adquira um pacote abaixo para ativar o Passe VIP (${VIP_PASS_DIAMOND_PRICE} Diamantes).`,
      });
      return;
    }

    setBusy(true);
    setStatusMessage(null);
    const res = await purchaseMonthlyVipBattlePassWithDiamonds();
    setBusy(false);

    if (!res.ok) {
      setStatusMessage({
        kind: 'err',
        text: res.error || 'Falha ao ativar o Passe VIP.',
      });
      return;
    }

    if (res.weaponId) {
      syncEquippedWeaponToInventory(res.weaponId);
      onSelectWeapon(res.weaponId);
    }
    setStatusMessage({
      kind: 'ok',
      text: `PASSE VIP ATIVADO POR 30 DIAS! ${weaponOfMonth.weaponName} (${weaponOfMonth.skinName}) liberada e equipada + Bônus +50% XP Online ativo!`,
    });
  };

  const handleClaimTier = (tier: number, track: 'FREE' | 'VIP') => {
    const res = claimBattlePassTierReward(tier, track, playerXp);
    if (res.ok) {
      soundEngine.playMenuSelect();
      const parts: string[] = [];
      if (res.cash > 0) parts.push(`+${res.cash} K-Money`);
      if (res.xp > 0) parts.push(`+${res.xp} XP`);
      setStatusMessage({
        kind: 'ok',
        text: `Escalão ${tier} (${track === 'VIP' ? 'VIP' : 'Grátis'}) resgatado: ${parts.join(' · ')}.`,
      });
    }
  };

  const handleBuyDiamondPack = async (packId: string) => {
    if (busy) return;
    soundEngine.playMenuSelect();

    if (!syncState.isGoogleLinked || !syncState.profile.uid || syncState.profile.uid === 'local-guest') {
      setStatusMessage({
        kind: 'err',
        text: 'Vincule sua conta Google no Perfil antes de realizar compras de Diamantes.',
      });
      return;
    }

    setBusy(true);
    setStatusMessage(null);
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
        sku?: string;
      };
      if (data.ok && data.checkoutUrl) {
        setStatusMessage({
          kind: 'ok',
          text: 'Sessão de pagamento segura gerada. Clique no botão abaixo para finalizar em R$:',
          checkoutUrl: data.checkoutUrl,
        });
      } else {
        setStatusMessage({
          kind: 'info',
          text:
            data.error ||
            'Gateway de pagamento real pronto para conexão (Stripe Web / Google Play Billing).',
        });
      }
    } catch {
      setStatusMessage({
        kind: 'err',
        text: 'Servidor de pagamentos indisponível no momento.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-4xl max-h-[86dvh] bg-[#080c13]/96 border border-amber-500/40 rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.92)] backdrop-blur-md pointer-events-auto flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-white/10 bg-gradient-to-r from-[#2b1407] via-[#121622] to-[#0a0d14] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 text-slate-950 font-black text-base flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.5)] shrink-0">
            ♛
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display font-black text-sm sm:text-base tracking-widest text-white uppercase truncate">
                PASSE DE BATALHA VIP · {monthKey}
              </h2>
              {vipActive && (
                <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-300/60 text-[10px] font-mono font-black text-amber-300 uppercase shrink-0">
                  ATIVO · {remainingDays}D
                </span>
              )}
            </div>
            <p className="text-[10px] font-mono text-slate-300 truncate">
              Arma Exclusiva do Mês + Bônus +50% XP Online + +25% K-Money
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Real Diamonds Balance */}
          <div className="px-2.5 py-1 rounded-lg bg-sky-950/70 border border-sky-400/40 flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-xs bg-gradient-to-br from-sky-300 to-blue-600 rotate-45 scale-75 border border-sky-100" />
            <span className="font-mono font-black text-xs text-white tabular-nums">
              {diamonds.toLocaleString('pt-BR')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuSelect();
              onClose();
            }}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-[10px] font-mono font-bold text-slate-200 hover:text-white uppercase cursor-pointer transition-colors"
          >
            FECHAR ✕
          </button>
        </div>
      </div>

      {/* Subtabs */}
      <div className="px-4 sm:px-5 pt-2.5 pb-2 border-b border-white/10 bg-black/30 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuSelect();
            setSubTab('PASS');
          }}
          className={`px-3.5 py-1.5 rounded-lg text-[11px] font-display font-black tracking-wider uppercase cursor-pointer transition-all ${
            subTab === 'PASS'
              ? 'bg-amber-400 text-slate-950 shadow-[0_0_14px_rgba(251,191,36,0.45)]'
              : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
          }`}
        >
          PASSE VIP &amp; TRILHA
        </button>
        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuSelect();
            setSubTab('STORE');
          }}
          className={`px-3.5 py-1.5 rounded-lg text-[11px] font-display font-black tracking-wider uppercase cursor-pointer transition-all ${
            subTab === 'STORE'
              ? 'bg-sky-400 text-slate-950 shadow-[0_0_14px_rgba(56,189,248,0.45)]'
              : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
          }`}
        >
          LOJA DE DIAMANTES (R$)
        </button>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div
          className={`mx-4 sm:mx-5 mt-3 px-3.5 py-2.5 rounded-xl border text-[11px] font-mono leading-snug flex flex-wrap items-center justify-between gap-2 shrink-0 ${
            statusMessage.kind === 'ok'
              ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-200'
              : statusMessage.kind === 'err'
                ? 'bg-red-500/15 border-red-400/50 text-red-200'
                : 'bg-sky-500/15 border-sky-400/45 text-sky-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          {statusMessage.checkoutUrl && (
            <a
              href={statusMessage.checkoutUrl}
              target="_top"
              rel="noopener noreferrer"
              className="px-3 py-1 rounded-lg bg-emerald-400 text-slate-950 font-display font-black text-[10px] uppercase tracking-wider"
            >
              IR PARA PAGAMENTO →
            </a>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4">
        {subTab === 'PASS' ? (
          <>
            {/* Weapon of the Month + VIP Perks Hero Card */}
            <div className="rounded-2xl border border-amber-400/45 bg-gradient-to-br from-[#231407]/90 via-[#111520]/95 to-[#090d14] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-display font-black text-[9px] tracking-widest uppercase">
                    ARMA DO MÊS · {weaponOfMonth.editionLabel}
                  </span>
                  <span className="text-[10px] font-mono text-amber-300/90 uppercase">
                    {weaponOfMonth.category} · {weaponOfMonth.caliber}
                  </span>
                </div>
                <h3 className="font-display font-black text-lg sm:text-xl text-white tracking-wider uppercase">
                  {weaponOfMonth.weaponName}
                </h3>
                <p className="text-[11px] font-mono text-slate-300 mt-0.5">
                  {weaponOfMonth.highlightNote}
                </p>

                {/* VIP Attributes */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg bg-black/45 border border-amber-400/25 px-2.5 py-1.5">
                    <div className="text-[9px] font-mono text-slate-400 uppercase">ATRIBUTO XP</div>
                    <div className="font-display font-black text-xs text-amber-300">+50% XP ONLINE</div>
                  </div>
                  <div className="rounded-lg bg-black/45 border border-amber-400/25 px-2.5 py-1.5">
                    <div className="text-[9px] font-mono text-slate-400 uppercase">ATRIBUTO K-MONEY</div>
                    <div className="font-display font-black text-xs text-emerald-300">+25% BÔNUS</div>
                  </div>
                  <div className="rounded-lg bg-black/45 border border-amber-400/25 px-2.5 py-1.5 col-span-2 sm:col-span-1">
                    <div className="text-[9px] font-mono text-slate-400 uppercase">SKIN EXCLUSIVA</div>
                    <div className="font-display font-black text-xs text-sky-300 truncate">
                      {weaponOfMonth.skinName}
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-56 shrink-0 flex flex-col gap-2">
                {vipActive ? (
                  <>
                    <div className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/45 text-center">
                      <div className="font-display font-black text-xs text-emerald-300 uppercase tracking-wider">
                        ♛ PASSE VIP ATIVO
                      </div>
                      <div className="text-[10px] font-mono text-emerald-200/80 mt-0.5">
                        Expira em {remainingDays} dias · +50% XP ligado
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playMenuSelect();
                        syncEquippedWeaponToInventory(vipState.weaponOfMonthId);
                        onSelectWeapon(vipState.weaponOfMonthId);
                        setStatusMessage({
                          kind: 'ok',
                          text: `${weaponOfMonth.weaponName} equipada no seu loadout principal!`,
                        });
                      }}
                      className="w-full py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-display font-black text-xs tracking-wider uppercase cursor-pointer transition-colors"
                    >
                      EQUIPAR ARMA DO MÊS
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleActivateVip()}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-display font-black text-xs tracking-wider uppercase shadow-[0_0_24px_rgba(245,158,11,0.45)] cursor-pointer disabled:opacity-60 transition-all"
                    >
                      {busy
                        ? 'VALIDANDO...'
                        : diamonds >= VIP_PASS_DIAMOND_PRICE
                          ? `ATIVAR PASSE VIP · ${VIP_PASS_DIAMOND_PRICE} 💎`
                          : `COMPRAR DIAMANTES (${VIP_PASS_DIAMOND_PRICE} 💎)`}
                    </button>
                    <p className="text-[9px] font-mono text-center text-slate-400">
                      Duração: 30 dias · Exclusivo com Diamantes
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* 10-Tier Season Track */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="font-display font-black text-xs tracking-widest text-slate-200 uppercase">
                  TRILHA DE RECOMPENSAS DO MÊS (10 ESCALÕES)
                </h4>
                <span className="text-[10px] font-mono text-amber-300 tabular-nums">
                  SEU XP ATUAL: {playerXp.toLocaleString('pt-BR')} XP
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {BATTLE_PASS_TIERS.map((tier) => {
                  const unlocked = playerXp >= tier.requiredXp;
                  const freeClaimed = vipState.claimedFreeTiers.includes(tier.tier);
                  const vipClaimed = vipState.claimedVipTiers.includes(tier.tier);
                  return (
                    <div
                      key={tier.tier}
                      className={`rounded-xl border p-3 flex flex-col gap-2 ${
                        unlocked
                          ? 'bg-white/[0.04] border-white/15'
                          : 'bg-black/35 border-white/5 opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className="font-display font-black text-xs text-white">
                          ESCALÃO {tier.tier}
                        </span>
                        <span className={unlocked ? 'text-emerald-300 font-bold' : 'text-slate-400'}>
                          {unlocked
                            ? 'LIBERADO'
                            : `${tier.requiredXp.toLocaleString('pt-BR')} XP`}
                        </span>
                      </div>

                      {/* Free row */}
                      <div className="flex items-center justify-between gap-2 bg-black/35 rounded-lg px-2.5 py-1.5 border border-white/10">
                        <div className="min-w-0">
                          <div className="text-[8px] font-mono text-slate-400 uppercase">GRÁTIS</div>
                          <div className="text-[11px] font-mono font-bold text-slate-200 truncate">
                            {tier.freeLabel}
                          </div>
                        </div>
                        {freeClaimed ? (
                          <span className="text-[9px] font-mono font-bold text-emerald-300 uppercase shrink-0">
                            ✓ RESGATADO
                          </span>
                        ) : unlocked ? (
                          <button
                            type="button"
                            onClick={() => handleClaimTier(tier.tier, 'FREE')}
                            className="px-2 py-1 rounded bg-white/15 hover:bg-white/25 text-[9px] font-display font-black text-white uppercase cursor-pointer shrink-0"
                          >
                            RESGATAR
                          </button>
                        ) : (
                          <span className="text-[9px] font-mono text-slate-500 uppercase shrink-0">
                            BLOQUEADO
                          </span>
                        )}
                      </div>

                      {/* VIP row */}
                      <div className="flex items-center justify-between gap-2 bg-amber-500/10 rounded-lg px-2.5 py-1.5 border border-amber-400/35">
                        <div className="min-w-0">
                          <div className="text-[8px] font-mono text-amber-300 uppercase font-bold">
                            ♛ VIP EXCLUSIVO
                          </div>
                          <div className="text-[11px] font-mono font-bold text-amber-100 truncate">
                            {tier.vipLabel}
                          </div>
                        </div>
                        {vipClaimed ? (
                          <span className="text-[9px] font-mono font-bold text-emerald-300 uppercase shrink-0">
                            ✓ RESGATADO
                          </span>
                        ) : unlocked && vipActive ? (
                          <button
                            type="button"
                            onClick={() => handleClaimTier(tier.tier, 'VIP')}
                            className="px-2 py-1 rounded bg-amber-400 hover:bg-amber-300 text-[9px] font-display font-black text-slate-950 uppercase cursor-pointer shrink-0"
                          >
                            RESGATAR
                          </button>
                        ) : (
                          <span className="text-[9px] font-mono text-amber-300/70 uppercase shrink-0">
                            {vipActive ? 'BLOQUEADO' : 'REQUER VIP'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          /* Diamond Real-Money Store */
          <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-sky-950/35 border border-sky-400/35 p-3.5 text-[11px] font-mono text-sky-100 leading-relaxed">
              <b>Diamantes</b> são a moeda premium oficial do KINETIC para ativar o{' '}
              <b>Passe VIP Mensal (800 Diamantes)</b>. Compras em <b>R$</b> são validadas pelo
              servidor via <b>Stripe Checkout (Web)</b> ou <b>Google Play Billing (Android)</b> e
              creditadas automaticamente no seu perfil Firebase.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DIAMOND_STORE_PACKS.map((pack) => {
                const total = pack.diamonds + pack.bonusDiamonds;
                return (
                  <div
                    key={pack.id}
                    className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${
                      pack.id === 'pack_800'
                        ? 'bg-gradient-to-br from-sky-950/65 to-[#0b111c] border-sky-400/65 shadow-[0_0_24px_rgba(56,189,248,0.2)]'
                        : 'bg-white/[0.03] border-white/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-4 h-4 rounded-xs bg-gradient-to-br from-sky-300 to-blue-600 rotate-45 scale-75 border border-sky-100 inline-block" />
                          <span className="font-display font-black text-lg text-white tabular-nums">
                            {total.toLocaleString('pt-BR')} 💎
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-300 mt-1">
                          {pack.diamonds.toLocaleString('pt-BR')} base
                          {pack.bonusDiamonds > 0
                            ? ` + ${pack.bonusDiamonds.toLocaleString('pt-BR')} bônus`
                            : ''}
                        </div>
                      </div>
                      {pack.badge && (
                        <span className="px-2 py-0.5 rounded bg-amber-400/20 border border-amber-300/50 text-[9px] font-mono font-black text-amber-300 uppercase">
                          {pack.badge}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleBuyDiamondPack(pack.id)}
                      className="w-full py-2 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-display font-black text-xs tracking-wider uppercase cursor-pointer disabled:opacity-60 transition-colors"
                    >
                      {busy ? 'CONECTANDO...' : `COMPRAR · ${pack.priceLabel}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
