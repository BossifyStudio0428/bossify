import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  DollarSign,
  ShoppingBag,
  AlertCircle,
  PackageX,
  Bell,
  Search,
  Sparkles,
  TrendingUp,
  CreditCard,
  X,
  ChevronRight,
  FileText,
} from "lucide-react";
import { Calendar as CalendarIcon } from "lucide-react";
import { supabase, type OrderRow, type CustomerRow } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { useBusinessType } from "@/contexts/BusinessTypeContext";
import { HOME_GREETING_KEY, hasInventory, type BizType } from "@/lib/businessType";
import { Calendar, Users, Briefcase, CheckCircle2, Clock } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  loadPaymentSummary,
  isPaymentBannerDismissed,
  dismissPaymentBanner,
} from "@/lib/paymentSetup";
import { SetupChecklist } from "@/components/SetupChecklist";
import { TeamBanner } from "@/components/TeamBanner";
import { SuspendedTeamBanner } from "@/components/SuspendedTeamBanner";
import { PendingInviteBanner } from "@/components/PendingInviteBanner";

export const Route = createFileRoute("/")({ component: Index });

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Unpaid: "bg-red-100 text-red-600",
  Pending: "bg-amber-100 text-amber-700",
};

function Index() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { type: bizType } = useBusinessType();
  const {
    hasFullAccess,
    isLifetime,
    isStarter,
    isTeam,
    teamTier,
    ordersUsed,
    ordersLimit,
    refresh: refreshSubscription,
  } = useSubscription();
  const [hydrated, setHydrated] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [lowStock, setLowStock] = useState(0);
  const [topCustomers, setTopCustomers] = useState<CustomerRow[]>([]);
  const [latestClients, setLatestClients] = useState<CustomerRow[]>([]);
  const [followUpsTodayList, setFollowUpsTodayList] = useState<
    { id: string; customer_name: string; note: string | null }[]
  >([]);
  const [todaysViewings, setTodaysViewings] = useState<
    { id: string; listing_title: string; customer_name: string; viewing_at: string; status: string }[]
  >([]);
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [followUpsThisWeek, setFollowUpsThisWeek] = useState(0);
  const [followUpsOverdue, setFollowUpsOverdue] = useState(0);
  const [followUpsToday, setFollowUpsToday] = useState(0);
  const [totalClients, setTotalClients] = useState(0);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [completedThisMonth, setCompletedThisMonth] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [selectedWeeklyIndex, setSelectedWeeklyIndex] = useState<number>(6);
  const [hasPayment, setHasPayment] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    setBannerDismissed(isPaymentBannerDismissed());
    if (!user?.id) return;
    loadPaymentSummary(user.id)
      .then((s) => setHasPayment(s.hasMethod))
      .catch(() => setHasPayment(true));
  }, [user?.id]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const [ordersRes, inventoryRes, customersRes, notificationsRes, profileRes] =
        await Promise.all([
          supabase
            .from("orders")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase.from("inventory").select("stock").eq("user_id", user.id),
          supabase
            .from("customers")
            .select("*")
            .eq("user_id", user.id)
            .order("total_spent", { ascending: false })
            .limit(3),
          supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_read", false),
          supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle(),
        ]);
      for (const [label, result] of Object.entries({
        ordersRes,
        inventoryRes,
        customersRes,
        notificationsRes,
        profileRes,
      })) {
        if (result.error) console.error(`dashboard ${label} failed`, result.error);
      }
      setOrders((ordersRes.data ?? []) as OrderRow[]);
      setLowStock((inventoryRes.data ?? []).filter((i: any) => i.stock <= 5).length);
      setTopCustomers((customersRes.data ?? []) as CustomerRow[]);
      setUnreadNotif(notificationsRes.count ?? 0);
      // Latest clients (recently added)
      const { data: latestC } = await supabase
        .from("customers")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      setLatestClients((latestC ?? []) as CustomerRow[]);
      // Follow-ups: this week + overdue
      const today = new Date(); today.setHours(0,0,0,0);
      const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
      const todayStr = today.toISOString().slice(0, 10);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);
      const { data: fuData } = await supabase
        .from("follow_ups")
        .select("follow_up_date,is_done")
        .eq("user_id", user.id)
        .eq("is_done", false);
      const fus = (fuData ?? []) as { follow_up_date: string; is_done: boolean }[];
      setFollowUpsThisWeek(fus.filter((f) => f.follow_up_date >= todayStr && f.follow_up_date <= weekEndStr).length);
      setFollowUpsOverdue(fus.filter((f) => f.follow_up_date < todayStr).length);
      setFollowUpsToday(fus.filter((f) => f.follow_up_date === todayStr).length);
      // Today's follow-up list (for property dashboard)
      const { data: fuTodayRows } = await supabase
        .from("follow_ups")
        .select("id, note, customer_id")
        .eq("user_id", user.id)
        .eq("is_done", false)
        .eq("follow_up_date", todayStr)
        .limit(5);
      const fuRows = (fuTodayRows ?? []) as { id: string; note: string | null; customer_id: string | null }[];
      const custIds = Array.from(new Set(fuRows.map((r) => r.customer_id).filter(Boolean))) as string[];
      let nameById = new Map<string, string>();
      if (custIds.length) {
        const { data: cs } = await supabase
          .from("customers").select("id,name").in("id", custIds);
        (cs ?? []).forEach((c: any) => nameById.set(c.id, c.name));
      }
      setFollowUpsTodayList(
        fuRows.map((r) => ({
          id: r.id,
          customer_name: (r.customer_id && nameById.get(r.customer_id)) || "—",
          note: r.note,
        })),
      );
      // Customer counts (total + by status)
      const [{ count: totalC }, { count: inProg }, { count: completedC }] = await Promise.all([
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("customer_status", "in_progress"),
        supabase.from("customers").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("customer_status", "completed"),
      ]);
      setTotalClients(totalC ?? 0);
      setInProgressCount(inProg ?? 0);
      setCompletedThisMonth(completedC ?? 0);
      setAvatarUrl(
        (profileRes.data as any)?.avatar_url || (user.user_metadata as any)?.avatar_url || null,
      );
    } catch (error) {
      console.error("dashboard load failed", error);
      setOrders([]);
      setLowStock(0);
      setTopCustomers([]);
      setLatestClients([]);
      setFollowUpsTodayList([]);
      setUnreadNotif(0);
      setAvatarUrl((user.user_metadata as any)?.avatar_url || null);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    setHydrated(true);
    refreshSubscription();
    load();
    const onFocus = () => {
      refreshSubscription();
      load();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [user?.id, refreshSubscription]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("dash-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const localeMap = { en: "en-MY", ms: "ms-MY", zh: "zh-CN" } as const;
  const today = hydrated
    ? new Date().toLocaleDateString(localeMap[lang], {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const todayRevenue = todayOrders
    .filter((o) => o.status === "Paid")
    .reduce((s, o) => s + Number(o.amount), 0);
  const todayGrossProfit = todayOrders
    .filter((o) => o.status === "Paid")
    .reduce((s, o) => s + Number(o.gross_profit ?? 0), 0);
  const unpaidCount = orders.filter((o) => o.status === "Unpaid").length;
  const activeProjects = orders.filter((o) => o.status !== "Paid").length;
  const nowD = new Date();
  const monthStart = new Date(nowD.getFullYear(), nowD.getMonth(), 1);
  const monthRevenue = orders
    .filter((o) => o.status === "Paid" && new Date(o.created_at) >= monthStart)
    .reduce((s, o) => s + Number(o.amount), 0);

  // Comparison vs yesterday
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const isYesterday = (iso: string) => new Date(iso).toDateString() === yest.toDateString();
  const yesterdayRevenue = orders
    .filter((o) => o.status === "Paid" && isYesterday(o.created_at))
    .reduce((s, o) => s + Number(o.amount), 0);
  const revDelta =
    yesterdayRevenue > 0
      ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100)
      : null;

  // Motivational
  let motivMsg = t("motiv_default");
  if (lowStock > 0) motivMsg = t("motiv_low_stock");
  if (unpaidCount > 3) motivMsg = t("motiv_unpaid").replace("{n}", String(unpaidCount));
  if (todayRevenue > yesterdayRevenue && yesterdayRevenue > 0) motivMsg = t("motiv_better");

  const eff: BizType = (bizType ?? "retail") as BizType;
  type Stat = { label: string; value: string; icon: typeof DollarSign; color: string; bg: string };
  const revenueCard: Stat = { label: t("todays_revenue"), value: `RM ${todayRevenue.toFixed(0)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" };
  const profitCard: Stat = { label: t("todays_profit"), value: `RM ${todayGrossProfit.toFixed(0)}`, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" };
  const newOrdersCard: Stat = { label: t("new_orders"), value: String(todayOrders.length), icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" };
  const unpaidCard: Stat = { label: t("unpaid"), value: String(unpaidCount), icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" };
  const lowStockCard: Stat = { label: t("low_stock"), value: String(lowStock), icon: PackageX, color: "text-amber-500", bg: "bg-amber-50" };
  const newCasesCard: Stat = { label: t("stat_new_cases"), value: String(todayOrders.length), icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" };
  const newAppointmentsCard: Stat = { label: t("stat_appointments_today"), value: String(todayOrders.length), icon: Calendar, color: "text-primary", bg: "bg-primary/10" };
  const newLeadsCard: Stat = { label: t("stat_new_leads"), value: String(todayOrders.length), icon: ShoppingBag, color: "text-primary", bg: "bg-primary/10" };
  const totalClientsCard: Stat = { label: t("stat_total_clients"), value: String(totalClients), icon: Users, color: "text-primary", bg: "bg-primary/10" };
  const followupsTodayCard: Stat = { label: t("stat_followups_today"), value: String(followUpsToday), icon: Calendar, color: "text-primary", bg: "bg-primary/10" };
  const followupsWeekCard: Stat = { label: t("followups_this_week"), value: String(followUpsThisWeek), icon: Calendar, color: "text-primary", bg: "bg-primary/10" };
  const inProgressCard: Stat = { label: t("stat_in_progress"), value: String(inProgressCount), icon: Clock, color: "text-amber-600", bg: "bg-amber-50" };
  const completedMonthCard: Stat = { label: t("stat_completed_month"), value: String(completedThisMonth), icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" };
  const activeProjectsCard: Stat = { label: t("stat_active_projects"), value: String(activeProjects), icon: Briefcase, color: "text-primary", bg: "bg-primary/10" };
  const monthRevenueCard: Stat = { label: t("stat_month_revenue"), value: `RM ${monthRevenue.toFixed(0)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" };

  const STATS_BY_TYPE: Record<BizType, Stat[]> = {
    retail:    [revenueCard, profitCard, newOrdersCard, unpaidCard],
    fnb:       [revenueCard, newOrdersCard, unpaidCard],
    education: [newCasesCard, unpaidCard, totalClientsCard, followupsTodayCard],
    beauty:    [newAppointmentsCard, unpaidCard, totalClientsCard, followupsWeekCard],
    property:  [newLeadsCard, inProgressCard, completedMonthCard, followupsTodayCard],
    freelance: [activeProjectsCard, unpaidCard, monthRevenueCard, followupsTodayCard],
  };
  const stats = STATS_BY_TYPE[eff];
  const showLowStockCard = hasInventory(eff);
  const showRevenueDelta = stats[0] === revenueCard;

  // Weekly chart
  const weekly: { day: string; value: number }[] = [];
  const dowKeys = [
    "dow_sun",
    "dow_mon",
    "dow_tue",
    "dow_wed",
    "dow_thu",
    "dow_fri",
    "dow_sat",
  ] as const;
  if (hydrated) {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const total = orders
        .filter(
          (o) => o.status === "Paid" && new Date(o.created_at).toDateString() === d.toDateString(),
        )
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
  const greeting = hydrated
    ? hour < 12
      ? t("good_morning")
      : hour < 18
        ? t("good_afternoon")
        : t("good_evening")
    : "";

  return (
    <div className="px-5 pt-10 pb-4 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{greeting},</p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("welcome")} 👋</h1>
          <p className="text-xs text-muted-foreground mt-1">{t(HOME_GREETING_KEY[bizType ?? "retail"])}</p>
        </div>
        <div className="flex items-start gap-1.5 shrink-0">
          <Link
            to="/search"
            aria-label={t("search")}
            className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          >
            <span className="h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
              <Search className="h-4 w-4 text-foreground" />
            </span>
            <span className="text-[9px] text-muted-foreground leading-none">{t("search")}</span>
          </Link>
          <Link
            to="/notifications"
            aria-label={t("notifications")}
            className="flex flex-col items-center gap-0.5 active:scale-95 transition-transform"
          >
            <span className="relative h-10 w-10 rounded-full bg-card border border-border/60 flex items-center justify-center">
              <Bell className="h-4 w-4 text-foreground" />
              {unreadNotif > 0 && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full" />
              )}
            </span>
            <span className="text-[9px] text-muted-foreground leading-none">
              {t("alerts_label")}
            </span>
          </Link>
          <Link
            to="/profile"
            aria-label={t("profile")}
            className="flex flex-col items-center gap-0.5 active:scale-95"
          >
            <span className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-xs font-bold shadow-[var(--shadow-soft)] overflow-hidden">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </span>
            <span className="text-[9px] text-muted-foreground leading-none">{t("profile")}</span>
          </Link>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 -mt-3">
        <p className="text-xs text-muted-foreground truncate">{today}</p>
        {isStarter ? (
          <Link
            to="/plans"
            aria-label={t("plan_badge_starter")}
            className="h-6 px-2.5 rounded-full bg-gradient-to-r from-sky-500 to-teal-500 text-white inline-flex items-center gap-1 shadow-[var(--shadow-soft)] active:scale-95 transition-transform shrink-0"
          >
            <span className="text-[10px] font-bold leading-none">{t("plan_badge_starter")}</span>
          </Link>
        ) : !hasFullAccess ? (
          <Link
            to="/plans"
            aria-label={t("upgrade_to_pro")}
            className="h-6 px-2.5 rounded-full bg-muted border border-border/60 inline-flex items-center gap-1.5 active:scale-95 transition-transform shrink-0"
          >
            <span className="text-[10px] font-semibold text-muted-foreground leading-none">
              {t("free_plan_badge")} · {ordersUsed}/{ordersLimit}
            </span>
          </Link>
        ) : isLifetime ? (
          <Link
            to="/plans"
            aria-label={t("plan_badge_lifetime")}
            className="h-6 px-2.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white inline-flex items-center gap-1 shadow-[var(--shadow-soft)] active:scale-95 transition-transform shrink-0"
          >
            <span className="text-[10px] font-bold leading-none">{t("plan_badge_lifetime")}</span>
          </Link>
        ) : isTeam && teamTier ? (
          <Link
            to="/team"
            aria-label={t(`plan_badge_${teamTier}` as any)}
            className="h-6 px-2.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white inline-flex items-center gap-1 shadow-[var(--shadow-soft)] active:scale-95 transition-transform shrink-0"
          >
            <span className="text-[10px] font-bold leading-none">{t(`plan_badge_${teamTier}` as any)}</span>
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

      {hasPayment === false && !bannerDismissed && (
        <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <CreditCard className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-amber-900 leading-snug">
              {t("payment_setup_banner")}
            </p>
            <Link
              to="/payment-details"
              className="mt-1 inline-block text-[11px] font-bold text-amber-700 underline"
            >
              {t("set_up_arrow")} →
            </Link>
          </div>
          <button
            type="button"
            aria-label="dismiss"
            onClick={() => {
              dismissPaymentBanner();
              setBannerDismissed(true);
            }}
            className="h-7 w-7 rounded-full text-amber-700 active:bg-amber-100 flex items-center justify-center shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <SetupChecklist />
      <PendingInviteBanner />
      <TeamBanner />
      <SuspendedTeamBanner />

      <section id="tour-stats" className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4"
          >
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <p className={`mt-3 text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            {i === 0 && showRevenueDelta && revDelta !== null && (
              <p
                className={`text-[10px] mt-0.5 font-semibold ${revDelta >= 0 ? "text-emerald-600" : "text-red-500"}`}
              >
                {revDelta >= 0 ? "↑" : "↓"} {Math.abs(revDelta)}% {t("vs_yesterday")}
              </p>
            )}
          </div>
        ))}
      </section>

      {showLowStockCard && (
        <Link
          to="/inventory"
          aria-label={t("low_stock")}
          className="flex items-center gap-3 rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 pr-4 active:scale-[0.99] transition-transform"
        >
          <span className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <PackageX className="h-5 w-5 text-amber-500" />
          </span>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-xl font-bold text-amber-500 leading-none">{lowStock}</span>
            <span className="text-xs text-muted-foreground leading-tight">{t("low_stock")}</span>
          </div>
          <ChevronRight className="h-5 w-5 text-amber-500 shrink-0" />
        </Link>
      )}

      {(followUpsThisWeek > 0 || followUpsOverdue > 0) && (
        <Link
          to="/customers"
          aria-label={t("followup_reminder")}
          className="flex items-center gap-3 rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-3 pr-4 active:scale-[0.99] transition-transform"
        >
          <span className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <CalendarIcon className="h-5 w-5 text-primary" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">
              📅 {followUpsThisWeek} {t("followups_this_week")}
            </p>
            {followUpsOverdue > 0 && (
              <p className="text-[11px] font-semibold text-red-600 mt-0.5">
                {followUpsOverdue} {t("followup_overdue")}
              </p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-primary shrink-0" />
        </Link>
      )}

      <section className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] p-4">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
          {t(eff === "retail" || eff === "fnb" ? "weekly_sales" : "weekly_revenue")}
        </p>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <p className="text-2xl font-bold text-foreground">RM {Number(weeklyTotal).toFixed(0)}</p>
          <p className="text-xs font-medium text-muted-foreground">
            {selectedWeekly?.day || t("this_week") || "This week"}
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
                <span
                  className={`text-[10px] ${highlight ? "text-primary font-semibold" : "text-muted-foreground"}`}
                >
                  {w.day}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section id="tour-analytics" className="grid grid-cols-2 gap-3">
        <Link
          to="/reports"
          className="rounded-2xl bg-card border-2 border-primary/30 p-3 flex flex-col gap-1.5 active:scale-[0.98] transition-transform shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center justify-between">
            <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground leading-tight">
            {t(
              eff === "education" ? "view_case_reports"
              : eff === "beauty"  ? "view_appointment_reports"
              : eff === "property" ? "view_lead_reports"
              : eff === "freelance" ? "view_project_reports"
              : "view_sales_report",
            )}
          </p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {t("daily_weekly_monthly")}
          </p>
        </Link>
        <Link
          to={eff === "education" ? "/university-insights" : "/analytics"}
          className="rounded-2xl bg-card border-2 border-primary/30 p-3 flex flex-col gap-1.5 active:scale-[0.98] transition-transform shadow-[var(--shadow-card)]"
        >
          <div className="flex items-center justify-between">
            <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              {eff === "education" ? <span className="text-base">🎓</span> : <TrendingUp className="h-5 w-5" />}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground leading-tight">
            {t(
              eff === "education" ? "edu_insights"
              : eff === "property" ? "followup_analytics"
              : eff === "beauty" || eff === "freelance" ? "client_analytics"
              : "view_analytics",
            )}
          </p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {t(
              eff === "education" ? "analytics_sub_education"
              : eff === "beauty" ? "analytics_sub_beauty"
              : eff === "property" ? "analytics_sub_property"
              : eff === "freelance" ? "analytics_sub_freelance"
              : "top_products_customers",
            )}
          </p>
        </Link>
      </section>

      <section>
        <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
          {t(
            eff === "education" ? "sec_recent_cases"
            : eff === "beauty"  ? "sec_recent_appointments"
            : eff === "property" ? "sec_recent_leads"
            : eff === "freelance" ? "sec_recent_projects"
            : "recent_orders",
          )}
        </p>
        <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
          {recent.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">{t(eff === "education" ? "no_cases_yet" : eff === "beauty" ? "no_appointments_yet" : eff === "property" ? "no_leads_yet" : eff === "freelance" ? "no_projects_yet" : "no_orders_yet")}</p>
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
                <p className="text-sm font-bold text-foreground">
                  RM {Number(o.amount).toFixed(0)}
                </p>
                <span
                  className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusStyles[o.status]}`}
                >
                  {o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {showLowStockCard && lowStock > 0 && (
        <Link
          to="/inventory"
          className="block rounded-2xl bg-amber-50 border border-amber-200 p-3 active:scale-[0.99] transition-transform"
        >
          <p className="text-xs text-amber-800 font-semibold">
            ⚠️ {lowStock} {t("inventory_alert")}
          </p>
        </Link>
      )}

      {/* Section 2: depends on business type */}
      {(eff === "retail" || eff === "fnb") && topCustomers.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
            {t("top_customers")}
          </p>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
            {topCustomers.map((c) => (
              <Link
                key={c.id}
                to="/customer/$customerId"
                params={{ customerId: c.id }}
                className="flex items-center gap-3 p-4"
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.total_orders} {t("orders_word")}
                  </p>
                </div>
                <p className="text-sm font-bold text-primary">
                  RM {Number(c.total_spent).toFixed(0)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(eff === "education" || eff === "beauty" || eff === "freelance") && latestClients.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
            {t("sec_latest_clients")}
          </p>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
            {latestClients.map((c) => (
              <Link
                key={c.id}
                to="/customer/$customerId"
                params={{ customerId: c.id }}
                className="flex items-center gap-3 p-4"
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {c.phone ?? ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {eff === "property" && (
        <section>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground mb-2 px-1">
            {t("sec_followups_today")}
          </p>
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/60">
            {followUpsTodayList.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">—</p>
            )}
            {followUpsTodayList.map((f) => (
              <Link
                key={f.id}
                to="/customers"
                className="flex items-center gap-3 p-4"
              >
                <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                  📅
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{f.customer_name}</p>
                  {f.note && (
                    <p className="text-[11px] text-muted-foreground truncate">{f.note}</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
