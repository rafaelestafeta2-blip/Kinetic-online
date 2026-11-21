import { Capacitor } from '@capacitor/core';
import { DIAMOND_STORE_PACKS, DiamondStorePack } from '../progression/vipBattlePassSystem';

const PLAY_BILLING_METHOD = 'https://play.google.com/billing';

interface DigitalGoodsService {
  getDetails(itemIds: string[]): Promise<
    Array<{
      itemId: string;
      title: string;
      description: string;
      price: { currency: string; value: string };
    }>
  >;
  listPurchases(): Promise<Array<{ itemId: string; purchaseToken: string }>>;
  consume(purchaseToken: string): Promise<void>;
}

interface CapacitorPlayBillingBridge {
  purchaseProduct?: (options: {
    sku: string;
    packId: string;
  }) => Promise<{ ok?: boolean; purchaseToken?: string; orderId?: string; error?: string }>;
  consumePurchase?: (options: { purchaseToken: string }) => Promise<void>;
}

declare global {
  interface Window {
    getDigitalGoodsService?: (serviceProvider: string) => Promise<DigitalGoodsService | null>;
    KineticPlayBilling?: CapacitorPlayBillingBridge;
  }
}

export interface PlayBillingPurchaseResult {
  ok: boolean;
  provider: 'GOOGLE_PLAY_BILLING' | 'UNAVAILABLE';
  packId: string;
  sku: string;
  totalDiamonds: number;
  purchaseToken?: string;
  cancelled?: boolean;
  error?: string;
}

export function isAndroidNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export async function isGooglePlayBillingSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.KineticPlayBilling?.purchaseProduct) return true;
  if (typeof window.getDigitalGoodsService === 'function') {
    try {
      const svc = await window.getDigitalGoodsService(PLAY_BILLING_METHOD);
      if (svc) return true;
    } catch {
      // Digital Goods API not attached to Play Store session
    }
  }
  return false;
}

/**
 * Launches the native Google Play Billing purchase sheet for the given Diamond Pack SKU
 * (`kinetic_diamonds_400`, `kinetic_diamonds_800`, `kinetic_diamonds_1800`, `kinetic_diamonds_4000`).
 *
 * Supports both:
 * 1. Native Android Capacitor Bridge (`window.KineticPlayBilling`)
 * 2. Official Google Play Billing Digital Goods + PaymentRequest API (`https://play.google.com/billing`)
 */
export async function purchaseDiamondPackWithGooglePlay(
  packId: string
): Promise<PlayBillingPurchaseResult> {
  const pack: DiamondStorePack | undefined = DIAMOND_STORE_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return {
      ok: false,
      provider: 'UNAVAILABLE',
      packId,
      sku: '',
      totalDiamonds: 0,
      error: 'Pacote de Diamantes inválido.',
    };
  }

  const totalDiamonds = pack.diamonds + pack.bonusDiamonds;

  // 1. Check Native Capacitor Android Bridge if registered in MainActivity
  if (typeof window !== 'undefined' && window.KineticPlayBilling?.purchaseProduct) {
    try {
      const res = await window.KineticPlayBilling.purchaseProduct({
        sku: pack.sku,
        packId: pack.id,
      });
      if (res?.ok && res.purchaseToken) {
        if (window.KineticPlayBilling.consumePurchase) {
          try {
            await window.KineticPlayBilling.consumePurchase({
              purchaseToken: res.purchaseToken,
            });
          } catch {}
        }
        return {
          ok: true,
          provider: 'GOOGLE_PLAY_BILLING',
          packId: pack.id,
          sku: pack.sku,
          totalDiamonds,
          purchaseToken: res.purchaseToken,
        };
      }
      return {
        ok: false,
        provider: 'GOOGLE_PLAY_BILLING',
        packId: pack.id,
        sku: pack.sku,
        totalDiamonds: 0,
        error: res?.error || 'Compra cancelada na Google Play.',
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'GOOGLE_PLAY_BILLING',
        packId: pack.id,
        sku: pack.sku,
        totalDiamonds: 0,
        error: err instanceof Error ? err.message : 'Falha na comunicação com Google Play Billing.',
      };
    }
  }

  // 2. Check Official Google Play Digital Goods API + PaymentRequest ('https://play.google.com/billing')
  if (typeof window !== 'undefined' && typeof PaymentRequest !== 'undefined') {
    let dgService: DigitalGoodsService | null = null;
    if (typeof window.getDigitalGoodsService === 'function') {
      try {
        dgService = await window.getDigitalGoodsService(PLAY_BILLING_METHOD);
      } catch {
        dgService = null;
      }
    }

    if (dgService) {
      try {
        const request = new PaymentRequest(
          [
            {
              supportedMethods: PLAY_BILLING_METHOD,
              data: {
                sku: pack.sku,
              },
            },
          ],
          {
            total: {
              label: `${totalDiamonds} Diamantes · KINETIC FPS`,
              amount: {
                currency: 'BRL',
                value: (pack.priceBrlCents / 100).toFixed(2),
              },
            },
          }
        );

        const canPay = await request.canMakePayment().catch(() => false);
        if (canPay) {
          const paymentResponse = await request.show();
          const details = (paymentResponse.details || {}) as {
            purchaseToken?: string;
            token?: string;
          };
          const purchaseToken = String(details.purchaseToken || details.token || `gp_${pack.sku}_${Date.now()}`);

          try {
            await dgService.consume(purchaseToken);
          } catch {}
          await paymentResponse.complete('success');

          return {
            ok: true,
            provider: 'GOOGLE_PLAY_BILLING',
            packId: pack.id,
            sku: pack.sku,
            totalDiamonds,
            purchaseToken,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/abort|cancel/i.test(msg)) {
          return {
            ok: false,
            provider: 'GOOGLE_PLAY_BILLING',
            packId: pack.id,
            sku: pack.sku,
            totalDiamonds: 0,
            cancelled: true,
            error: 'Compra cancelada pelo jogador na Google Play.',
          };
        }
      }
    }
  }

  return {
    ok: false,
    provider: 'UNAVAILABLE',
    packId: pack.id,
    sku: pack.sku,
    totalDiamonds: 0,
  };
}
