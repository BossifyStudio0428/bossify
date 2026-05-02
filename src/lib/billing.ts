// Google Play Billing helper.
// Native billing is intentionally disabled until a Capacitor-8-compatible
// purchase plugin is wired in. Keeping the old Cordova purchase plugin installed
// can crash Android before React renders, so this file must not import it.

export const PRODUCT_IDS = {
  monthly: "bossify_pro_monthly",
  annual: "bossify_pro_annual",
} as const;

export type BillingPlan = keyof typeof PRODUCT_IDS;

export function isNativeBillingAvailable(): boolean {
  return false;
}

export async function purchasePlan(
  plan: BillingPlan,
  onSuccess: (receipt: { productId: string; transactionId: string; purchaseToken?: string }) => Promise<void> | void,
  onError: (msg: string) => void,
): Promise<void> {
  void plan;
  void onSuccess;
  onError("Google Play purchase is temporarily disabled in this Android build.");
}

export async function restorePurchases(onError: (msg: string) => void): Promise<void> {
  void onError;
}