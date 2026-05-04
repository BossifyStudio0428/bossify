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

export const PRODUCT_IDS = {
  monthly: "bossify_pro_monthly",
  annual: "bossify_pro_annual",
} as const;

export type BillingPlan = keyof typeof PRODUCT_IDS;

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

// --- Native plugin stubs ---------------------------------------------------
// Replace these two functions when wiring an actual Capacitor billing plugin.
// They must throw a BillingError on failure.

async function tryNativePurchase(_productId: string): Promise<PurchaseReceipt> {
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
  const productId = PRODUCT_IDS[plan];
  try {
    const receipt = await tryNativePurchase(productId);
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