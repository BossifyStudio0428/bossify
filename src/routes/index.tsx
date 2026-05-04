import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DollarSign, ShoppingBag, AlertCircle, PackageX, Bell, Search, BarChart3, Sparkles, TrendingUp } from "lucide-react";
import { supabase, type OrderRow, type CustomerRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useSubscription } from "@/contexts/SubscriptionContext";

export const Route = createFileRoute("/")({ component: Index });

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function Index() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { isPro, ordersUsed, ordersLimit } = useSubscription();
  const [hydrated, setHydrated] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lowStock, setLowStock] = useState(0);
  const [topCustomers, setTopCustomers] = useState<CustomerRow[]>([]);
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedWeeklyIndex, setSelectedWeeklyIndex] = useState<number>(6);

  const load = async () => {
    if (!user?.id) return;
    try {
      const [ordersRes, inventoryRes, customersRes, notificationsRes, profileRes] = await Promise.all([
        supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("inventory").select("stock").eq("user_id", user.id),
        supabase.from("customers").select("*").eq("user_id", user.id).order("total_spent", { ascending: false }).limit(3),
        supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
        supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
      ]);
      for (const [label, result] of Object.entries({ ordersRes, inventoryRes, customersRes, notificationsRes, profileRes })) {
        if (result.error) console.error(`dashboard ${label} failed`, result.error);
      }
      setOrders((ordersRes.data ?? []) as OrderRow[]);
      setLowStock((inventoryRes.data ?? []).filter((i: any) => i.stock <= 5).length);
      setTopCustomers((customersRes.data ?? []) as CustomerRow[]);
      setUnreadNotif(notificationsRes.count ?? 0);
      setAvatarUrl((profileRes.data as any)?.avatar_url || (user.user_metadata as any)?.avatar_url || null);
    } catch (error) {
      console.error("dashboard load failed", error);
      setOrders([]);
      setLowStock(0);
      setTopCustomers([]);
      setUnreadNotif(0);
      setAvatarUrl((user.user_metadata as any)?.avatar_url || null);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    setHydrated(true);
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("dash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const localeMap = { en: "en-MY", ms: "ms-MY", zh: "zh-CN" } as const;
  const today = hydrated ? new Date().toLocaleDateString(localeMap[lang], {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }) : "";
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const todayRevenue = todayOrders.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.amount), 0);
  const todayGrossProfit = todayOrders.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.gross_profit ?? 0), 0);
  const unpaidCount = orders.filter((o) => o.status === "Unpaid").length;

  // Comparison vs yesterday
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const isYesterday = (iso: string) => new Date(iso).toDateString() === yest.toDateString();
  const yesterdayRevenue = orders.filter((o) => o.status === "Paid" && isYesterday(o.created_at)).reduce((s, o) => s + Number(o.amount), 0);
  const revDelta = yesterdayRevenue > 0 ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100) : null;

  // Motivational
  let motivMsg = t("motiv_default");
  if (lowStock > 0) motivMsg = t("motiv_low_stock");
  if (unpaidCount > 3) motivMsg = t("motiv_unpaid").replace("{n}", String(unpaidCount));
  if (todayRevenue > yesterdayRevenue && yesterdayRevenue > 0) motivMsg = t("motiv_better");

  const stats = [
    { label: t("todays_revenue"), value: `RM ${todayRevenue.toFixed(0)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: t("todays_profit"), value: `RM ${todayGrossProfit.toFixed(0)}`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: t("new_orders"), value: String(todayOrders.length), icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" },
    { label: t("unpaid"), value: String(unpaidCount), icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
    { label: t("low_stock"), value: String(lowStock), icon: PackageX, color: "text-amber-500", bg: "bg-amber-50" },
  ];

  // Weekly chart
  const weekly: { day: string; value: number }[] = [];
  const dowKeys = ["dow_sun", "dow_mon", "dow_tue", "dow_wed", "dow_thu", "dow_fri", "dow_sat"] as const;
  if (hydrated) {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const total = orders
        .filter((o) => o.status === "Paid" && new Date(o.created_at).toDateString() === d.toDateString())
        .reduce((s, o) => s + Number(o.amount), 0);
      weekly.push({ day: t(dowKeys[d.getDay()]), value: total });
    }
  } else {
    for (let i = 6; i >= 0; i--) weekly.push({ day: "", value: 0 });
  }
  const maxVal = Math.max(1, ...weekly.map((w) => w.value));
  const weeklyTotal = weekly.reduce((s, w) => s + w.value, 0);
  const selectedWeekly = weekly[selectedWeeklyIndex] ?? weekly[6];

  const recent = orders.slice(0, 3);
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();
  const hour = hydrated ? new Date().getHours() : 12;
  const greeting = hydrated ? (hour < 12 ? t("good_morning") : hour < 18 ? t("good_afternoon") : t("good_evening")) : "";

  return (
    <div className="px-5 pt-10 pb-4 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("welcome")} 👋</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link to="/analytics" aria-label={t("analytics_label")} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95 transition-transform">
            <BarChart3 className="h-4 w-4 text-foreground" />
          </Link>
          <Link to="/search" aria-label={t("search")} className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95 transition-transform">
            <Search className="h-4 w-4 text-foreground" />
          </Link>
          <Link to="/notifications" aria-label={t("notifications")} className="relative h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center active:scale-95 transition-transform">
            <Bell className="h-4 w-4 text-foreground" />
            {unreadNotif > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />}
          </Link>
          <Link to="/profile" aria-label={t("profile")} className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-xs font-bold shadow-[var(--shadow-soft)] active:scale-95 overflow-hidden">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </Link>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 -mt-3">
        <p className="text-xs text-muted-foreground truncate">{today}</p>
        {!isPro ? (
          <Link
            to="/plans"
            aria-label={t("upgrade_to_pro")}
            className="h-6 px-2.5 rounded-full bg-muted border border-border/60 inline-flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
          >
            <span className="text-[10px] font-semibold text-muted-foreground leading-none">
              {t("free_plan_badge")} · {ordersUsed}/{ordersLimit}
            </span>
          </Link>
        ) : (
          <Link
            to="/plans"
            aria-label={t("pro_plan")}
            className="h-6 px-2.5 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground inline-flex items-center gap-1 shadow-[var(--shadow-soft)] active:scale-95 transition-transform shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            <span className="text-[10px] font-bold leading-none">Pro ✦</span>
          </Link>
        )}
      </div>
      <p className="-mt-3 text-xs font-medium text-primary/90">{motivMsg}</p>

      <section className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div key={s.label} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <p className={`mt-3 text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            {i === 0 && revDelta !== null && (
              <p className={`text-[10px] mt-0.5 font-semibold ${revDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {revDelta >= 0 ? "↑" : "↓"} {Math.abs(revDelta)}% {t("vs_yesterday")}
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("weekly_sales")}
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-2xl font-bold text-foreground">
            RM {Number(weeklyTotal).toFixed(0)}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {selectedWeekly?.day || (t("this_week") || "This week")}
          </p>
        </div>
        <div className="mt-4 flex items-end justify-between gap-2 h-32 min-h-[8rem]">
          {weekly.map((w, i) => {
            const hasValue = w.value > 0;
            const h = hasValue ? Math.max(25, (w.value / maxVal) * 100) : 8;
            const highlight = selectedWeeklyIndex === i;
            return (
              <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-2">
                <button
                  type="button"
                  aria-label={`${w.day} RM ${Number(w.value).toFixed(0)}`}
                  onClick={() => setSelectedWeeklyIndex(i)}
                  className="w-full h-full flex flex-col items-center justify-end gap-1"
                >
                  {highlight && (
                    <span className="text-[10px] font-semibold text-primary leading-none whitespace-nowrap">
                      RM {Number(w.value).toFixed(0)}
                    </span>
                  )}
                  <span
                    className={`w-full rounded-t-lg min-h-[8px] transition-all active:scale-95 ${
                      highlight
                        ? "bg-gradient-to-t from-primary to-primary/70"
                        : hasValue
                        ? "bg-primary/40"
                        : "bg-muted"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                </button>
                <span className={`text-[10px] ${highlight ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  {w.day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
          {t("recent_orders")}
        </p>
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
          {recent.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">{t("no_orders_yet")}</p>
          )}
          {recent.map((o) => (
            <div key={o.id} className="flex items-center gap-3 p-4">
              <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {o.customer_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{o.customer_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {o.product} {o.quantity > 1 ? `(x${o.quantity})` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">RM {Number(o.amount).toFixed(0)}</p>
                <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}>
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {lowStock > 0 && (
        <Link
          to="/inventory"
          className="block rounded-2xl bg-amber-50 border border-amber-200 p-3 active:scale-[0.99] transition-transform"
        >
          <p className="text-xs text-amber-800 font-semibold">
            ⚠️ {lowStock} {t("inventory_alert")}
          </p>
        </Link>
      )}

      {topCustomers.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
            {t("top_customers")}
          </p>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
            {topCustomers.map((c) => (
              <Link
                key={c.id}
                to="/customers/$customerId"
                params={{ customerId: c.id }}
                className="flex items-center gap-3 p-4"
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">{c.total_orders} {t("orders_word")}</p>
                </div>
                <p className="text-sm font-bold text-primary">RM {Number(c.total_spent).toFixed(0)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
