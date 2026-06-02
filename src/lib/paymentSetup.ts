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
    .select("payment_method_1_type,payment_method_1_number,payment_method_2_type,payment_method_2_number")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return { hasMethod: false, type: null, number: null };
  const t1 = (data as any).payment_method_1_type as string | null;
  const n1 = (data as any).payment_method_1_number as string | null;
  const t2 = (data as any).payment_method_2_type as string | null;
  const n2 = (data as any).payment_method_2_number as string | null;
  if (t1 || n1) return { hasMethod: true, type: t1, number: n1 };
  if (t2 || n2) return { hasMethod: true, type: t2, number: n2 };
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
