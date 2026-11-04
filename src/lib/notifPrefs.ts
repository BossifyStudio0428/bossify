import { supabase } from "@/integrations/supabase/client";
import { safeLocalStorage } from "@/lib/safeStorage";

export type NotifPrefs = {
  notif_new_order: boolean;
  notif_unpaid: boolean;
  notif_inventory: boolean;
  notif_morning: boolean;
  notif_evening: boolean;
  notif_milestone: boolean;
  notif_losing: boolean;
  low_stock_threshold: number;
  morning_hour: number;
  evening_hour: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: number; // 0-23, local device time
  quiet_hours_end: number; // 0-23, local device time
};

export const DEFAULT_PREFS: NotifPrefs = {
  notif_new_order: true,
  notif_unpaid: true,
  notif_inventory: true,
  notif_morning: true,
  notif_evening: true,
  notif_milestone: true,
  notif_losing: true,
  low_stock_threshold: 5,
  morning_hour: 9,
  evening_hour: 21,
  quiet_hours_enabled: false,
  quiet_hours_start: 22,
  quiet_hours_end: 8,
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
    .select("notif_new_order,notif_unpaid,notif_inventory,notif_morning,notif_evening,notif_milestone,notif_losing,low_stock_threshold,morning_hour,evening_hour,quiet_hours_enabled,quiet_hours_start,quiet_hours_end")
    .eq("id", userId)
    .maybeSingle();
  const prefs: NotifPrefs = { ...DEFAULT_PREFS, ...(data ?? {}) } as NotifPrefs;
  try { safeLocalStorage.setItem(CACHE_KEY, JSON.stringify(prefs)); } catch {}
  return prefs;
}

export async function savePrefs(userId: string, prefs: Partial<NotifPrefs>): Promise<void> {
  await supabase.from("profiles").update(prefs as never).eq("id", userId);
  const merged = { ...getCachedPrefs(), ...prefs };
  try { safeLocalStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
}

export function isPrefEnabled(key: keyof NotifPrefs): boolean {
  return getCachedPrefs()[key] as boolean;
}

/**
 * True if the device's current local time falls inside the seller's
 * configured quiet hours. Handles overnight windows (e.g. 22 → 8) by
 * checking whether start > end, in which case the window wraps past
 * midnight rather than being a same-day range.
 */
export function isWithinQuietHours(): boolean {
  const prefs = getCachedPrefs();
  if (!prefs.quiet_hours_enabled) return false;
  const hour = new Date().getHours();
  const { quiet_hours_start: start, quiet_hours_end: end } = prefs;
  if (start === end) return false; // a zero-width window means "always off" — treat as no quiet hours
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // overnight wraparound
}