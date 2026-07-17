import { supabase } from "@/integrations/supabase/client";
import { isPrefEnabled } from "@/lib/notifPrefs";
import { notifySituation } from "@/lib/autoNotify";

const ID_MORNING = 9101;
const ID_EVENING = 9102;
const ID_UNPAID_DAILY = 9103;

async function getPlugin() {
  if (typeof window === "undefined") return null;
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return null;
  } catch { return null; }
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    return LocalNotifications;
  } catch { return null; }
}

async function ensurePermission(plugin: NonNullable<Awaited<ReturnType<typeof getPlugin>>>) {
  try {
    const current = (await plugin.checkPermissions().catch(() => ({}))) as { display?: string };
    if (current.display === "granted") return true;
    const requested = (await plugin.requestPermissions().catch(() => ({}))) as { display?: string };
    return requested.display === "granted";
  } catch {
    return false;
  }
}

async function cancelIds(ids: number[]) {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {}
}

/** Compute yesterday's stats and schedule tomorrow's 9am morning summary. */
async function scheduleMorning(userId: string) {
  const plugin = await getPlugin();
  if (!plugin) return;
  if (!(await ensurePermission(plugin))) return;
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 1);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const { data } = await supabase
    .from("orders").select("amount,status,created_at").eq("user_id", userId)
    .gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
  const orders = data ?? [];
  const revenue = orders.filter((o: any) => o.status === "Paid").reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
  const { count: unpaid } = await supabase
    .from("orders").select("*", { count: "exact", head: true })
    .eq("user_id", userId).eq("status", "Unpaid");
  const body = `Yesterday: ${orders.length} orders · RM ${revenue.toFixed(2)} · ${unpaid ?? 0} unpaid`;
  await plugin.schedule({
    notifications: [{
      id: ID_MORNING,
      title: "Good morning, boss! 🌅",
      body,
      schedule: { on: { hour: 9, minute: 0 }, allowWhileIdle: true, repeats: true },
      extra: { route: "/" },
    }],
  });
}

async function scheduleEvening(userId: string) {
  const plugin = await getPlugin();
  if (!plugin) return;
  if (!(await ensurePermission(plugin))) return;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("orders").select("amount,status,gross_profit,created_at").eq("user_id", userId)
    .gte("created_at", start.toISOString());
  const orders = data ?? [];
  const revenue = orders.filter((o: any) => o.status === "Paid").reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
  const profit = orders.reduce((s: number, o: any) => s + Number(o.gross_profit || 0), 0);
  const body = `Today: ${orders.length} orders · RM ${revenue.toFixed(2)} · profit RM ${profit.toFixed(2)} 🎉`;
  await plugin.schedule({
    notifications: [{
      id: ID_EVENING,
      title: "Daily wrap-up 🌙",
      body,
      schedule: { on: { hour: 21, minute: 0 }, allowWhileIdle: true, repeats: true },
      extra: { route: "/reports" },
    }],
  });
}

async function scheduleUnpaidDaily() {
  const plugin = await getPlugin();
  if (!plugin) return;
  if (!(await ensurePermission(plugin))) return;
  await plugin.schedule({
    notifications: [{
      id: ID_UNPAID_DAILY,
      title: "Bossify",
      body: "Checking unpaid orders…",
      schedule: { on: { hour: 9, minute: 0 }, allowWhileIdle: true, repeats: true },
      extra: { kind: "daily_unpaid_check", route: "/orders" },
    }],
  });
}

/** Cancel all recurring + reschedule those enabled in prefs. Call on app start and after pref changes. */
export async function rescheduleAll(userId: string) {
  await cancelIds([ID_MORNING, ID_EVENING, ID_UNPAID_DAILY]);
  if (isPrefEnabled("notif_morning")) await scheduleMorning(userId).catch(() => {});
  if (isPrefEnabled("notif_evening")) await scheduleEvening(userId).catch(() => {});
  if (isPrefEnabled("notif_unpaid")) await scheduleUnpaidDaily().catch(() => {});
}

/** Run an immediate unpaid scan and notify if there are any 1+ day overdue unpaid orders. */
export async function runUnpaidNotifyNow(userId: string) {
  if (!isPrefEnabled("notif_unpaid")) return;
  const cutoff1 = new Date(Date.now() - 86400000).toISOString();
  const { data } = await supabase
    .from("orders").select("id,created_at").eq("user_id", userId).eq("status", "Unpaid").lte("created_at", cutoff1);
  if (!data || data.length === 0) return;
  const plugin = await getPlugin();
  if (!plugin) return;
  const now3 = Date.now() - 3 * 86400000;
  const now7 = Date.now() - 7 * 86400000;
  const overdue3 = data.filter((o: any) => new Date(o.created_at).getTime() <= now3).length;
  const overdue7 = data.filter((o: any) => new Date(o.created_at).getTime() <= now7).length;
  let body = `${data.length} unpaid order(s) need follow-up`;
  if (overdue7 > 0) body = `⚠️ ${overdue7} order(s) overdue 7+ days · ${data.length} total unpaid`;
  else if (overdue3 > 0) body = `${overdue3} order(s) overdue 3+ days · ${data.length} total unpaid`;
  try {
    await plugin.schedule({
      notifications: [{
        id: Math.floor(Math.random() * 2_000_000_000),
        title: "Payment Reminder ⚠️",
        body,
        extra: { route: "/orders", filter: "Unpaid" },
      }],
    });
  } catch {}
}

/**
 * Run an immediate scan for SKUs where cost > price and push a single
 * digest notification if any are found. Dedupes to once per calendar day
 * per device.
 */
export async function runLosingMoneyScanNow(userId: string) {
  if (!isPrefEnabled("notif_losing")) return;
  const today = new Date().toISOString().slice(0, 10);
  const dedupeKey = `losing_${today}`;
  const { data } = await supabase
    .from("inventory")
    .select("id,name,price,cost")
    .eq("user_id", userId);
  const losing = (data ?? []).filter((r: any) => {
    const p = Number(r.price ?? 0);
    const c = Number(r.cost ?? 0);
    return p > 0 && c > p;
  });
  if (losing.length === 0) return;
  const first = losing[0] as any;
  const extra = losing.length - 1;
  const title = "📉 Losing-money alert";
  const body =
    extra > 0
      ? `${first.name} + ${extra} more SKU(s) cost more than price`
      : `${first.name}: cost is higher than price — every sale loses money`;
  await notifySituation({
    kind: "custom",
    title,
    body,
    link: "/alerts",
    prefKey: "notif_losing",
    dedupeKey,
  }).catch(() => {});
}