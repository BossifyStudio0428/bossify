import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage } from "@/lib/safeStorage";

export type NotifPrefs = {
  notif_new_order: boolean;
  notif_unpaid: boolean;
  notif_inventory: boolean;
  notif_morning: boolean;
  notif_evening: boolean;
  notif_milestone: boolean;
};

export const DEFAULT_PREFS: NotifPrefs = {
  notif_new_order: true,
  notif_unpaid: true,
  notif_inventory: true,
  notif_morning: true,
  notif_evening: true,
  notif_milestone: true,
};

const CACHE_KEY = "bossify_notif_prefs";

export function getCachedPrefs(): NotifPrefs {
  try {
    const raw = safeLocalStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PREFS;
}

export async function loadPrefs(userId: string): Promise<NotifPrefs> {
  const { data } = await supabase
    .from("profiles")
    .select("notif_new_order,notif_unpaid,notif_inventory,notif_morning,notif_evening,notif_milestone")
    .eq("id", userId)
    .maybeSingle();
  const prefs: NotifPrefs = { ...DEFAULT_PREFS, ...(data ?? {}) } as NotifPrefs;
  try { safeLocalStorage.setItem(CACHE_KEY, JSON.stringify(prefs)); } catch {}
  return prefs;
}

export async function savePrefs(userId: string, prefs: Partial<NotifPrefs>): Promise<void> {
  await supabase.from("profiles").update(prefs).eq("id", userId);
  const merged = { ...getCachedPrefs(), ...prefs };
  try { safeLocalStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
}

export function isPrefEnabled(key: keyof NotifPrefs): boolean {
  return getCachedPrefs()[key];
}