// Google Play Billing helper backed by cordova-plugin-purchase (CC.Fovea).
//
// The plugin is auto-loaded by Capacitor on Android (npx cap sync picks up
// the cordova package from package.json and exposes window.CdvPurchase at
// runtime). On web / preview none of the native code runs and we fall back
// to the MYR fallback prices so the UI still renders.

// Google Play Console subscription product IDs.
// Bossify uses ONE subscription with TWO base plans (Google's recommended
// modern setup). Create these in Play Console → Monetize → Subscriptions:
//
//   Subscription product ID:  bossify_pro
//     Base plan #1 ID:        monthly   (RM 49 / month, auto-renewing)
//     Base plan #2 ID:        annual    (RM 399 / year, auto-renewing)
//
// Google Play will automatically convert RM 49 / RM 399 to each user's local
// currency at checkout (USD, IDR, PHP, INR, etc.). The store-localized price
// strings are fetched at runtime via queryProductDetails() and shown in the
// Plans UI, so the in-app price always matches what the user will be charged.
export const SUBSCRIPTION_ID = "bossify_pro";
export const BASE_PLAN_IDS = {
  monthly: "monthly",
  annual: "annual",
} as const;

export type BillingPlan = keyof typeof BASE_PLAN_IDS;

/** Fallback prices (MYR) when the store hasn't returned localized values yet. */
export const FALLBACK_PRICES: Record<BillingPlan, string> = {
  monthly: "RM 49",
  annual: "RM 399",
};

export type PurchaseReceipt = {
  productId: string;
  transactionId: string;
  purchaseToken?: string;
};

export type BillingErrorCode =
  | "not_android"      // Running on web / preview
  | "item_unavailable" // Product not configured in Play Console yet
  | "user_cancelled"
  | "unknown";

export type BillingError = { code: BillingErrorCode; message: string };

/** True only when the app is running inside the Android (Capacitor) shell. */
export function isNativeBillingAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  const cap = w.Capacitor;
  if (!cap) return false;
  try {
    if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) return false;
    if (typeof cap.getPlatform === "function") return cap.getPlatform() === "android";
    return true;
  } catch {
    return false;
  }
  return false;
}

/** Localized price string for a base plan, as returned by Google Play. */
export type ProductPrice = {
  plan: BillingPlan;
  /** e.g. "RM 49.00", "$11.99", "₹999" — already formatted by the store. */
  formattedPrice: string;
  /** ISO 4217 currency code, e.g. "MYR", "USD". */
  currency: string;
};

// ---------------------------------------------------------------------------
// cordova-plugin-purchase integration
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStore = any;

let _initPromise: Promise<AnyStore | null> | null = null;
let _approvedHandlers: Array<(r: PurchaseReceipt) => void> = [];

function getStore(): AnyStore | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdv = (window as any).CdvPurchase;
  return cdv?.store ?? null;
}

/**
 * Initialize the Play Billing connection. Safe to call many times — only the
 * first call actually registers products and connects to Google Play. Call
 * once at app start (AppShell) so prices are ready by the time the user
 * opens the Plans page.
 */
export function initBilling(): Promise<AnyStore | null> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!isNativeBillingAvailable()) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdv = (window as any).CdvPurchase;
    if (!cdv?.store) return null;
    const store = cdv.store as AnyStore;
    try {
      store.register([
        {
          id: SUBSCRIPTION_ID,
          type: cdv.ProductType.PAID_SUBSCRIPTION,
          platform: cdv.Platform.GOOGLE_PLAY,
        },
      ]);

      // Approved → collect receipt → finish so Google marks the order
      // acknowledged. Listeners can react via onPurchaseApproved().
      store.when().approved((transaction: AnyStore) => {
        try {
          const productId: string = transaction?.products?.[0]?.id ?? SUBSCRIPTION_ID;
          const transactionId: string = transaction?.transactionId ?? "";
          const purchaseToken: string | undefined = transaction?.purchaseToken;
          const receipt: PurchaseReceipt = { productId, transactionId, purchaseToken };
          for (const h of _approvedHandlers) { try { h(receipt); } catch {} }
          transaction.finish?.();
        } catch (e) { console.warn("approved handler failed", e); }
      });

      await store.initialize([cdv.Platform.GOOGLE_PLAY]);
      await store.update();
      return store;
    } catch (e) {
      console.warn("billing init failed", e);
      return null;
    }
  })();
  return _initPromise;
}

/** Subscribe to "purchase approved" events globally. */
export function onPurchaseApproved(handler: (r: PurchaseReceipt) => void): () => void {
  _approvedHandlers.push(handler);
  return () => { _approvedHandlers = _approvedHandlers.filter((h) => h !== handler); };
}

/**
 * Ask Google Play for the user's locally-formatted prices. Falls back to MYR
 * defaults whenever the plugin isn't running (web preview, plugin missing,
 * or product not yet approved by Google).
 */
export async function queryProductDetails(): Promise<ProductPrice[]> {
  const store = await initBilling();
  if (!store) return fallbackPrices();
  try {
    const product = store.get(SUBSCRIPTION_ID);
    if (!product?.offers?.length) return fallbackPrices();
    const out: ProductPrice[] = [];
    for (const offer of product.offers) {
      // Match the Play Console base plan id to our local BillingPlan key.
      const offerId: string | undefined = offer.id || offer.basePlanId;
      let plan: BillingPlan | null = null;
      if (offerId?.includes(BASE_PLAN_IDS.monthly)) plan = "monthly";
      else if (offerId?.includes(BASE_PLAN_IDS.annual)) plan = "annual";
      if (!plan) continue;
      const phase = offer.pricingPhases?.[0];
      if (!phase?.price) continue;
      out.push({
        plan,
        formattedPrice: phase.price as string,
        currency: (phase.currency as string) ?? "MYR",
      });
    }
    // Backfill any missing plan with the fallback so the UI never shows blank.
    for (const p of Object.keys(BASE_PLAN_IDS) as BillingPlan[]) {
      if (!out.find((x) => x.plan === p)) {
        out.push({ plan: p, formattedPrice: FALLBACK_PRICES[p], currency: "MYR" });
      }
    }
    return out;
  } catch (e) {
    console.warn("queryProductDetails failed", e);
    return fallbackPrices();
  }
}

function fallbackPrices(): ProductPrice[] {
  return (Object.keys(BASE_PLAN_IDS) as BillingPlan[]).map((plan) => ({
    plan,
    formattedPrice: FALLBACK_PRICES[plan],
    currency: "MYR",
  }));
}

async function tryNativePurchase(_subscriptionId: string, basePlanId: string): Promise<PurchaseReceipt> {
  const store = await initBilling();
  if (!store) {
    throw { code: "item_unavailable", message: "Google Play Billing not available" } as BillingError;
  }
  const product = store.get(_subscriptionId);
  if (!product) {
    throw { code: "item_unavailable", message: "Subscription not yet approved by Google Play" } as BillingError;
  }
  // Pick the offer whose id matches the requested base plan.
  const offer =
    product.offers?.find((o: AnyStore) => (o.id || o.basePlanId)?.includes(basePlanId)) ??
    product.offers?.[0];
  if (!offer) {
    throw { code: "item_unavailable", message: "Base plan not configured" } as BillingError;
  }
  return await new Promise<PurchaseReceipt>((resolve, reject) => {
    const unsub = onPurchaseApproved((r) => { unsub(); resolve(r); });
    try {
      const orderResult = offer.order ? offer.order() : store.order(offer);
      Promise.resolve(orderResult).catch((err: AnyStore) => {
        unsub();
        const code: string | undefined = err?.code;
        if (code === "PaymentCancelled" || /cancel/i.test(err?.message ?? "")) {
          reject({ code: "user_cancelled", message: "Cancelled" } as BillingError);
        } else {
          reject({ code: "unknown", message: err?.message ?? "Purchase failed" } as BillingError);
        }
      });
    } catch (err) {
      unsub();
      reject({ code: "unknown", message: (err as Error)?.message ?? "Purchase failed" } as BillingError);
    }
  });
}

async function tryNativeRestore(): Promise<PurchaseReceipt[]> {
  const store = await initBilling();
  if (!store) return [];
  try {
    await store.restorePurchases();
    const product = store.get(SUBSCRIPTION_ID);
    const owned = product?.owned ? [{
      productId: SUBSCRIPTION_ID,
      transactionId: product.transaction?.id ?? "",
      purchaseToken: product.transaction?.purchaseToken,
    }] : [];
    return owned;
  } catch {
    return [];
  }
}

/**
 * Re-query Google Play for the user's owned subscriptions WITHOUT prompting
 * the user. Safe to call on app launch, on app resume, and after a purchase
 * attempt (whether it succeeded or was cancelled). Returns the active
 * subscription receipt or `null` if the user does not currently own Pro.
 */
export async function verifyActiveSubscription(): Promise<PurchaseReceipt | null> {
  if (!isNativeBillingAvailable()) return null;
  const store = await initBilling();
  if (!store) return null;
  try {
    // Pull fresh owned-product state from Google Play.
    try { await store.restorePurchases(); } catch {}
    try { await store.update(); } catch {}
    const product = store.get(SUBSCRIPTION_ID);
    if (!product) return null;
    // Plugin exposes either `.owned` (boolean) or per-offer ownership.
    const owned: boolean = !!(product.owned || product.offers?.some?.((o: AnyStore) => o?.owned));
    if (!owned) return null;
    const tx = product.transaction ?? {};
    return {
      productId: SUBSCRIPTION_ID,
      transactionId: tx.id ?? tx.transactionId ?? "",
      purchaseToken: tx.purchaseToken,
    };
  } catch {
    return null;
  }
}

// --- Public API ------------------------------------------------------------

export async function purchasePlan(
  plan: BillingPlan,
  onSuccess: (receipt: PurchaseReceipt) => Promise<void> | void,
  onError: (err: BillingError) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError({ code: "not_android", message: "Not running inside Android app" });
    return;
  }
  const basePlanId = BASE_PLAN_IDS[plan];
  try {
    const receipt = await tryNativePurchase(SUBSCRIPTION_ID, basePlanId);
    await onSuccess(receipt);
  } catch (e) {
    const err = e as Partial<BillingError> | undefined;
    const code: BillingErrorCode = err?.code ?? "unknown";
    onError({ code, message: err?.message ?? "Purchase failed" });
  }
}

export async function restorePurchases(
  onRestored: (receipts: PurchaseReceipt[]) => Promise<void> | void,
  onError: (err: BillingError) => void,
): Promise<void> {
  if (!isNativeBillingAvailable()) {
    onError({ code: "not_android", message: "Not running inside Android app" });
    return;
  }
  try {
    const receipts = await tryNativeRestore();
    await onRestored(receipts);
  } catch (e) {
    const err = e as Partial<BillingError> | undefined;
    onError({ code: err?.code ?? "unknown", message: err?.message ?? "Restore failed" });
  }
}