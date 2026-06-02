import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage, safeSessionStorage } from "@/lib/safeStorage";

const BANNER_DISMISS_KEY = "bossify_payment_banner_dismissed";

export type PaymentSummary = {
  hasMethod: boolean;
  type: string | null;
  number: string | null;
};

export async function loadPaymentSummary(userId: string): Promise<PaymentSummary> {
  const { data } = await supabase
    .from("profiles")
    .select("payment_method_1_type,payment_method_1_number,payment_method_1_name,payment_method_1_bank,payment_method_1_qr_url,payment_method_2_type,payment_method_2_number,payment_method_2_name,payment_method_2_bank,payment_method_2_qr_url")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return { hasMethod: false, type: null, number: null };
  const d = data as any;
  const has1 = !!(d.payment_method_1_type || d.payment_method_1_number || d.payment_method_1_name || d.payment_method_1_bank || d.payment_method_1_qr_url);
  const has2 = !!(d.payment_method_2_type || d.payment_method_2_number || d.payment_method_2_name || d.payment_method_2_bank || d.payment_method_2_qr_url);
  if (has1) return { hasMethod: true, type: d.payment_method_1_type ?? d.payment_method_1_bank ?? null, number: d.payment_method_1_number ?? null };
  if (has2) return { hasMethod: true, type: d.payment_method_2_type ?? d.payment_method_2_bank ?? null, number: d.payment_method_2_number ?? null };
  return { hasMethod: false, type: null, number: null };
}

export function isPaymentBannerDismissed(): boolean {
  return safeSessionStorage.getItem(BANNER_DISMISS_KEY) === "1";
}

export function dismissPaymentBanner() {
  try { safeSessionStorage.setItem(BANNER_DISMISS_KEY, "1"); } catch {}
}

const SETUP_DONE_KEY = "bossify_payment_setup_done";
export function markPaymentSetupDone(userId: string) {
  try { safeLocalStorage.setItem(`${SETUP_DONE_KEY}:${userId}`, "1"); } catch {}
}
export function hasSeenPaymentSetup(userId: string): boolean {
  return safeLocalStorage.getItem(`${SETUP_DONE_KEY}:${userId}`) === "1";
}
