// Google Play Billing helper using cordova-plugin-purchase
// Only works inside the Capacitor Android app — falls back to a no-op on web.

export const PRODUCT_IDS = {
  monthly: "bossify_pro_monthly",
  annual: "bossify_pro_annual",
} as const;

export type BillingPlan = keyof typeof PRODUCT_IDS;

export function isNativeBillingAvailable(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor sets this global when running inside the native app
  const cap = (window as any).Capacitor;
  return !!(cap && cap.isNativePlatform && cap.isNativePlatform());
}

let initialized = false;

async function getStore(): Promise<any> {
  // The plugin attaches itself as a global when the cordova script loads on Android.
  // We avoid importing it as a module since its types aren't ESM-compatible.
  await import(/* @vite-ignore */ "cordova-plugin-purchase" as any).catch(() => {});
  const CdvPurchase = (window as any).CdvPurchase;
  if (!CdvPurchase) throw new Error("CdvPurchase not available");
  const store = CdvPurchase.store;

  if (!initialized) {
    store.register([
      {
        id: PRODUCT_IDS.monthly,
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform: CdvPurchase.Platform.GOOGLE_PLAY,
      },
      {
        id: PRODUCT_IDS.annual,
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
        platform: CdvPurchase.Platform.GOOGLE_PLAY,
      },
    ]);
    await store.initialize([CdvPurchase.Platform.GOOGLE_PLAY]);
    initialized = true;
  }
  return { store, CdvPurchase };
}

export async function purchasePlan(
  plan: BillingPlan,
  onSuccess: (receipt: { productId: string; transactionId: string; purchaseToken?: string }) => Promise<void> | void,
  onError: (msg: string) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError("In-app purchase only works in the Android app.");
    return;
  }
  try {
    const { store, CdvPurchase } = await getStore();
    const productId = PRODUCT_IDS[plan];
    const product = store.get(productId, CdvPurchase.Platform.GOOGLE_PLAY);
    if (!product) {
      onError("Product not found in Google Play. Make sure it's published.");
      return;
    }
    const offer = product.getOffer();
    if (!offer) {
      onError("No offer available for this product.");
      return;
    }

    store.when()
      .approved(async (transaction: any) => {
        try {
          await onSuccess({
            productId,
            transactionId: transaction.transactionId,
            purchaseToken: transaction.purchaseToken ?? transaction.nativePurchase?.purchaseToken,
          });
          await transaction.verify();
        } catch (e: any) {
          onError(e?.message ?? "Failed to record purchase");
        }
      })
      .verified((receipt: any) => receipt.finish());

    await offer.order();
  } catch (e: any) {
    onError(e?.message ?? "Purchase failed");
  }
}

export async function restorePurchases(onError: (msg: string) => void): Promise<void> {
  if (!isNativeBillingAvailable()) return;
  try {
    const { store } = await getStore();
    await store.restorePurchases();
  } catch (e: any) {
    onError(e?.message ?? "Restore failed");
  }
}