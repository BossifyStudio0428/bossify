import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DollarSign, ShoppingBag, AlertCircle, PackageX } from "lucide-react";
import { supabase, type OrderRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";

export const Route = createFileRoute("/")({ component: Index });

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function Index() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lowStock, setLowStock] = useState(0);

  const load = async () => {
    const [{ data: o }, { data: inv }] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("inventory").select("stock"),
    ]);
    setOrders((o ?? []) as OrderRow[]);
    setLowStock((inv ?? []).filter((i: any) => i.stock <= 5).length);
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("dash-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const localeMap = { en: "en-MY", ms: "ms-MY", zh: "zh-CN" } as const;
  const today = new Date().toLocaleDateString(localeMap[lang], {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const todayRevenue = todayOrders.filter((o) => o.status === "Paid").reduce((s, o) => s + Number(o.amount), 0);
  const unpaidCount = orders.filter((o) => o.status === "Unpaid").length;

  const stats = [
    { label: t("todays_revenue"), value: `RM ${todayRevenue.toFixed(0)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: t("new_orders"), value: String(todayOrders.length), icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" },
    { label: t("unpaid"), value: String(unpaidCount), icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
    { label: t("low_stock"), value: String(lowStock), icon: PackageX, color: "text-amber-500", bg: "bg-amber-50" },
  ];

  // Weekly chart
  const weekly: { day: string; value: number }[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const total = orders
      .filter((o) => o.status === "Paid" && new Date(o.created_at).toDateString() === d.toDateString())
      .reduce((s, o) => s + Number(o.amount), 0);
    weekly.push({ day: dayNames[d.getDay()], value: total });
  }
  const maxVal = Math.max(1, ...weekly.map((w) => w.value));

  const recent = orders.slice(0, 3);
  const initials = (user?.email ?? "U").slice(0, 2).toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("good_morning") : hour < 18 ? t("good_afternoon") : t("good_evening");

  return (
    <div className="px-5 pt-10 pb-4 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("welcome")} 👋</h1>
          <p className="mt-1 text-xs text-muted-foreground">{today}</p>
        </div>
        <Link
          to="/profile"
          aria-label="Profile & Settings"
          className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-sm font-bold shadow-[var(--shadow-soft)] active:scale-95 transition-transform"
        >
          {initials}
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <p className={`mt-3 text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t("weekly_sales")}
        </p>
        <div className="mt-4 flex items-end justify-between gap-2 h-32">
          {weekly.map((w, i) => {
            const h = Math.max(8, (w.value / maxVal) * 100);
            const isLast = i === weekly.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className={`w-full rounded-t-lg ${isLast ? "bg-gradient-to-t from-primary to-primary/70" : "bg-primary/20"}`}
                  style={{ height: `${h}%` }}
                />
                <span className={`text-[10px] ${isLast ? "text-primary font-semibold" : "text-muted-foreground"}`}>
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
    </div>
  );
}
