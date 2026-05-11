// Google Play Billing helper.
//
// A real Google Play Billing plugin is not yet wired in. This module exposes
// a stable API used by the Plans screen so the UI can:
//   - Detect whether we're inside the Android app (Capacitor) vs web/preview.
//   - Attempt a purchase by product ID and surface a friendly message when
//     the product isn't available yet (e.g. before Play Console setup is done).
//   - Restore purchases (no-op until a billing plugin is installed).
//
// When a Capacitor-compatible billing plugin is added later, replace the
// `tryNativePurchase` / `tryNativeRestore` stubs with real plugin calls.
// The product IDs below MUST match the IDs created in Google Play Console.

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

/**
 * Ask Google Play for the user's locally-formatted prices.
 * When no billing plugin is installed (or running on web) we resolve to
 * the MYR fallback so the UI still shows something sensible.
 */
export async function queryProductDetails(): Promise<ProductPrice[]> {
  if (isNativeBillingAvailable()) {
    try {
      // Plugin hook — when a Capacitor billing plugin is wired in (e.g.
      // cordova-plugin-purchase), replace this block with a real call that
      // returns each base plan's `formattedPrice` from the store.
      // const store = (window as any).CdvPurchase?.store;
      // const product = store?.get(SUBSCRIPTION_ID);
      // return product.offers.map(o => ({...}));
      return fallbackPrices();
    } catch {
      return fallbackPrices();
    }
  }
  return fallbackPrices();
}

function fallbackPrices(): ProductPrice[] {
  return (Object.keys(BASE_PLAN_IDS) as BillingPlan[]).map((plan) => ({
    plan,
    formattedPrice: FALLBACK_PRICES[plan],
    currency: "MYR",
  }));
}

// --- Native plugin stubs ---------------------------------------------------
// Replace these two functions when wiring an actual Capacitor billing plugin.
// They must throw a BillingError on failure.

async function tryNativePurchase(_subscriptionId: string, _basePlanId: string): Promise<PurchaseReceipt> {
  // No billing plugin installed yet → treat as item unavailable.
  throw { code: "item_unavailable", message: "Billing plugin not installed" } as BillingError;
}

async function tryNativeRestore(): Promise<PurchaseReceipt[]> {
  return [];
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