import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft, Sparkles, FlaskConical, Crown, Bot, CheckCircle2, RefreshCw, Users,
  Wallet, Store, AlertTriangle, Copy, Search, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useI18n } from "@/contexts/I18nContext";
import { isNativeWebView } from "@/lib/publicUrl";
import { isPaidStatus } from "@/lib/orderMath";
import {
  getAiUsageStats,
  loadAdminOverview,
  listAdminOrders,
  deleteAdminOrders,
  revokeAdminSubscriptionPlan,
  setAdminSubscriptionPlan,
  type AiUsageStats,
} from "@/lib/admin.functions";
import type { AdminRecentOrder, AdminSummary, AdminUserRow } from "@/lib/admin.server";

// IMPORTANT: this must be the real deployed backend, NOT getPublicOrigin().
// getPublicOrigin() is for customer-facing SHARE links (order/booking/team
// links) and deliberately falls back to the production Cloudflare Workers
// origin on native so those links are shareable outside the app. Using
// getPublicOrigin() for an actual fetch() here previously returned the
// app's own HTML shell instead of JSON when it fell back to a stale
// non-API domain — that's what showed up as raw "<!DOCTYPE html>..." text
// in the admin page's error toast on the native Android build.
const API_ORIGIN = "https://tanstack-start-app.bossifystudio.workers.dev";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Tab = "overview" | "users" | "orders" | "ai";
type UserFilter = "all" | "paying" | "gifted" | "free" | "tiktok";

const rm = (n: number, digits = 2) =>
  `RM ${Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(iso: string | null | undefined, lang: string) {
  if (!iso) return lang === "zh" ? "从未" : lang === "ms" ? "Belum" : "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return lang === "zh" ? "刚刚" : lang === "ms" ? "Baru" : "Just now";
  if (mins < 60) return lang === "zh" ? `${mins} 分钟前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "zh" ? `${hrs} 小时前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === "zh" ? `${days} 天前` : `${days}d ago`;
}

function AdminPage() {
  const { user, session } = useAuth();
  const { refresh: refreshSub } = useSubscription();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const L = useCallback((zh: string, en: string, ms?: string) => (lang === "zh" ? zh : lang === "ms" ? ms ?? en : en), [lang]);

  const loadAdminOverviewFn = useServerFn(loadAdminOverview);
  const setAdminSubscriptionPlanFn = useServerFn(setAdminSubscriptionPlan);
  const revokeAdminSubscriptionPlanFn = useServerFn(revokeAdminSubscriptionPlan);
  const getAiUsageStatsFn = useServerFn(getAiUsageStats);
  const listAdminOrdersFn = useServerFn(listAdminOrders);
  const deleteAdminOrdersFn = useServerFn(deleteAdminOrders);

  const [tab, setTab] = useState<Tab>("overview");
  const [aiStats, setAiStats] = useState<AiUsageStats | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [allOrders, setAllOrders] = useState<AdminRecentOrder[]>([]);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [grantOpen, setGrantOpen] = useState<{ uid: string; name: string } | null>(null);
  const [grantPlan, setGrantPlan] = useState<"pro" | "team_starter" | "team_pro" | "team_business">("pro");
  const [orderFilter, setOrderFilter] = useState<"all" | "paid" | "unpaid" | "other">("all");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [userSearch, setUserSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  // Orders tab: 0 = latest 200; otherwise the oldest orders older than N days.
  const [orderAge, setOrderAge] = useState<0 | 30 | 90 | 180>(0);
  const [agedOrders, setAgedOrders] = useState<AdminRecentOrder[] | null>(null);
  const [agedLoading, setAgedLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [confirmDeleteOrders, setConfirmDeleteOrders] = useState<AdminRecentOrder[] | null>(null);
  const [deletingOrders, setDeletingOrders] = useState(false);

  const callAdminApi = useCallback(
    async (body: Record<string, unknown>) => {
      const token = session?.access_token;
      if (!token) throw new Error("Unauthorized");
      const response = await fetch(`${API_ORIGIN}/api/public/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      const data = (
        text
          ? (() => {
              try {
                return JSON.parse(text);
              } catch {
                return { error: text.slice(0, 180) };
              }
            })()
          : {}
      ) as { error?: string } & Record<string, unknown>;
      if (!response.ok) {
        throw new Error(data.error ?? `Admin API failed (${response.status})`);
      }
      return data;
    },
    [session?.access_token],
  );

  const loadAll = useCallback(async () => {
    const overview = (isNativeWebView()
      ? await callAdminApi({ action: "overview" })
      : await loadAdminOverviewFn()) as { users?: AdminUserRow[]; orders?: AdminRecentOrder[]; summary?: AdminSummary };
    setUsers((overview.users ?? []) as AdminUserRow[]);
    setAllOrders((overview.orders ?? []) as AdminRecentOrder[]);
    setSummary(overview.summary ?? null);
    setLoadedAt(new Date().toISOString());
  }, [callAdminApi, loadAdminOverviewFn]);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("update_failed"));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        await loadAll();
        setIsAdmin(true);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("update_failed"));
        setIsAdmin(false);
        navigate({ to: "/" });
      } finally {
        setChecking(false);
      }
    })();
  }, [loadAll, navigate, t, user]);

  // Refresh when the tab comes back into view, and every minute while open.
  useEffect(() => {
    if (!user || !isAdmin) return;
    const reload = () => loadAll().catch(() => undefined);
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(reload, 60_000);
    return () => {
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [isAdmin, loadAll, user]);

  const loadAiStats = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const r = (isNativeWebView()
        ? await callAdminApi({ action: "ai_usage" })
        : await getAiUsageStatsFn()) as AiUsageStats;
      setAiStats(r);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setAiLoading(false);
    }
  }, [callAdminApi, getAiUsageStatsFn]);

  useEffect(() => {
    if (tab === "ai" && isAdmin && !aiStats && !aiLoading) loadAiStats();
  }, [tab, isAdmin, aiStats, aiLoading, loadAiStats]);

  const loadAgedOrders = useCallback(async (days: number) => {
    setAgedLoading(true);
    try {
      const r = (isNativeWebView()
        ? await callAdminApi({ action: "list_orders", olderThanDays: days })
        : await listAdminOrdersFn({ data: { olderThanDays: days } })) as { orders?: AdminRecentOrder[] };
      setAgedOrders(r.orders ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
      setAgedOrders([]);
    } finally {
      setAgedLoading(false);
    }
  }, [callAdminApi, listAdminOrdersFn]);

  useEffect(() => {
    setSelectedOrders(new Set());
    if (!isAdmin) return;
    if (orderAge === 0) { setAgedOrders(null); return; }
    loadAgedOrders(orderAge);
  }, [orderAge, isAdmin, loadAgedOrders]);

  const deleteOrdersNow = async (list: AdminRecentOrder[]) => {
    setDeletingOrders(true);
    try {
      const orderIds = list.map((o) => o.id);
      const r = (isNativeWebView()
        ? await callAdminApi({ action: "delete_orders", orderIds })
        : await deleteAdminOrdersFn({ data: { orderIds } })) as { deleted?: number };
      toast.success(lang === "zh" ? `已删除 ${r.deleted ?? 0} 张订单` : `Deleted ${r.deleted ?? 0} order(s)`);
      setConfirmDeleteOrders(null);
      setSelectedOrders(new Set());
      await loadAll().catch(() => undefined);
      if (orderAge !== 0) await loadAgedOrders(orderAge);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("update_failed"));
    } finally {
      setDeletingOrders(false);
    }
  };

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.business_name || u.id.slice(0, 8)])), [users]);

  if (checking) return <p className="p-6 text-sm text-muted-foreground">{t("admin_checking")}</p>;
  if (!isAdmin) return null;

  const realUsers = users.filter((u) => !u.is_admin);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const newToday = realUsers.filter((u) => new Date(u.created_at) >= today).length;
  const newWeek = realUsers.filter((u) => new Date(u.created_at) >= weekAgo).length;

  const planLabel = (key: string) => {
    if (key === "gifted") return L("赠送（管理员开通）", "Gifted (by admin)", "Hadiah (admin)");
    if (key === "lifetime") return L("终身版（一次付清）", "Lifetime (one-off)", "Seumur hidup");
    const [plan, cycle] = key.split(":");
    const name = plan.charAt(0).toUpperCase() + plan.slice(1);
    return `${name} · ${cycle === "yearly" ? L("年付", "yearly", "tahunan") : L("月付", "monthly", "bulanan")}`;
  };

  const kindBadge = (u: AdminUserRow) => {
    const plan = (u.plan ?? "free").toUpperCase();
    switch (u.subscription_kind) {
      case "paid":
        return { text: `${plan} · ${u.billing_cycle === "yearly" ? L("年付", "Yearly") : L("月付", "Monthly")}`, cls: "bg-emerald-500/15 text-emerald-700" };
      case "lifetime_paid":
        return { text: `LIFETIME`, cls: "bg-emerald-500/15 text-emerald-700" };
      case "gifted":
        return { text: `${plan} · ${L("赠送", "Gifted")}`, cls: "bg-amber-500/15 text-amber-700" };
      default:
        return { text: "FREE", cls: "bg-muted text-muted-foreground" };
    }
  };
  const providerLabel = (p: string | null) =>
    p === "google_play" ? "Google Play" : p === "stripe" ? "Stripe" : null;

  const tiktokBadge = (u: AdminUserRow) => {
    if (!u.tiktok) return { text: L("未连接", "Not connected", "Belum sambung"), cls: "bg-muted text-muted-foreground", ok: false };
    if (u.tiktok.status === "active" && !u.tiktok.last_error)
      return { text: L("已连接", "Connected", "Bersambung"), cls: "bg-black text-white", ok: true };
    if (u.tiktok.status === "active")
      return { text: L("已连接 · 有错误", "Connected · error", "Bersambung · ralat"), cls: "bg-red-500/15 text-red-600", ok: true };
    return { text: L("已断开", "Disconnected", "Terputus"), cls: "bg-red-500/15 text-red-600", ok: false };
  };

  const userSearchLc = userSearch.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    if (userFilter === "paying" && !(u.subscription_kind === "paid" || u.subscription_kind === "lifetime_paid")) return false;
    if (userFilter === "gifted" && u.subscription_kind !== "gifted") return false;
    if (userFilter === "free" && u.subscription_kind !== "free") return false;
    if (userFilter === "tiktok" && !u.tiktok) return false;
    if (!userSearchLc) return true;
    return (
      (u.business_name ?? "").toLowerCase().includes(userSearchLc) ||
      u.id.toLowerCase().includes(userSearchLc) ||
      (u.plan ?? "").toLowerCase().includes(userSearchLc) ||
      (u.tiktok?.shop_name ?? "").toLowerCase().includes(userSearchLc)
    );
  });
  const tiktokUsers = users
    .filter((u) => !!u.tiktok)
    .sort((a, b) => (b.tiktok?.last_synced_at ?? "").localeCompare(a.tiktok?.last_synced_at ?? ""));

  const orderSearchLc = orderSearch.trim().toLowerCase();
  const ordersSource = orderAge === 0 ? allOrders : (agedOrders ?? []);
  const filteredOrders = ordersSource.filter((o) => {
    if (orderFilter === "paid" && !isPaidStatus(o.status)) return false;
    if (orderFilter === "unpaid" && o.status !== "Unpaid") return false;
    if (orderFilter === "other" && (isPaidStatus(o.status) || o.status === "Unpaid")) return false;
    if (!orderSearchLc) return true;
    const owner = (userMap.get(o.user_id) ?? "").toLowerCase();
    return (
      o.code?.toLowerCase().includes(orderSearchLc) ||
      o.customer_name?.toLowerCase().includes(orderSearchLc) ||
      o.product?.toLowerCase().includes(orderSearchLc) ||
      owner.includes(orderSearchLc)
    );
  });
  const statusText = (s: string) => {
    const map: Record<string, [string, string]> = {
      Paid: ["已付款", "Paid"], Unpaid: ["未付款", "Unpaid"], Pending: ["待处理", "Pending"],
      Shipped: ["已发货", "Shipped"], Delivered: ["已送达", "Delivered"],
      Cancelled: ["已取消", "Cancelled"], Refunded: ["已退款", "Refunded"],
    };
    const m = map[s];
    return m ? L(m[0], m[1]) : s;
  };

  const grantPro = async (
    uid: string,
    months: number | "lifetime",
    plan: "pro" | "team_starter" | "team_pro" | "team_business" = "pro",
  ) => {
    try {
      if (isNativeWebView()) {
        await callAdminApi({ action: "set_plan", userId: uid, months, plan });
      } else {
        await setAdminSubscriptionPlanFn({ data: { userId: uid, months, plan } });
      }
      toast.success(
        `${t("admin_pro_granted")}${months === "lifetime" ? ` (${t("admin_lifetime")})` : ` ${months} ${t("months_short")}`}`,
      );
      if (uid === user?.id) refreshSub();
      loadAll();
      setGrantOpen(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("update_failed"));
    }
  };

  const revokePro = async (uid: string) => {
    if (!confirm(t("admin_revoke_confirm"))) return;
    try {
      if (isNativeWebView()) {
        await callAdminApi({ action: "revoke_plan", userId: uid });
      } else {
        await revokeAdminSubscriptionPlanFn({ data: { userId: uid } });
      }
      toast.success(t("admin_reverted_free"));
      if (uid === user?.id) refreshSub();
      loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("update_failed"));
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(L("已复制用户 ID", "User ID copied", "ID pengguna disalin"));
    } catch {
      toast.info(`${t("admin_user_id_copy")} ${id}`);
    }
  };

  const grantSelfPro = () => user && grantPro(user.id, 1);
  const revokeSelf = () => user && revokePro(user.id);

  const tabs: Array<{ k: Tab; label: string; count?: number }> = [
    { k: "overview", label: L("概览", "Overview", "Ringkasan") },
    { k: "users", label: L("用户", "Users", "Pengguna"), count: users.length },
    { k: "orders", label: L("订单", "Orders", "Pesanan") },
    { k: "ai", label: "AI" },
  ];

  const s = summary;

  return (
    <div className="px-5 pt-8 pb-10 space-y-5 lg:max-w-6xl lg:mx-auto lg:px-8">
      {/* Header */}
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          aria-label={t("back" as any)}
          className="h-10 w-10 shrink-0 rounded-full bg-card border border-border/60 flex items-center justify-center"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            {t("admin_panel")}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {L("更新于", "Updated", "Dikemas kini")} {timeAgo(loadedAt, lang)}
          </p>
        </div>
        <button
          onClick={refreshNow}
          disabled={refreshing}
          className="h-10 px-3.5 shrink-0 rounded-full bg-card border border-border/60 text-xs font-semibold text-foreground flex items-center gap-1.5 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{L("刷新", "Refresh", "Muat semula")}</span>
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 p-1 rounded-2xl bg-muted/60 border border-border/50">
        {tabs.map((tb) => (
          <button
            key={tb.k}
            onClick={() => setTab(tb.k)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
              tab === tb.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {tb.label}
            {tb.count != null && <span className="ml-1 text-[10px] text-muted-foreground">{tb.count}</span>}
          </button>
        ))}
      </nav>

      {/* ============ OVERVIEW ============ */}
      {tab === "overview" && s && (
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Bossify income — the number that actually matters */}
            <section className="lg:col-span-2 rounded-3xl bg-primary text-primary-foreground p-5 space-y-4 shadow-[var(--shadow-soft)]">
              <div>
                <p className="text-xs font-semibold opacity-80 flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> {L("Bossify 订阅收入（每月估算）", "Bossify subscription income (est. / month)", "Pendapatan langganan Bossify (anggaran / bulan)")}
                </p>
                <p className="text-4xl font-bold tracking-tight mt-1">{rm(s.monthly_income)}</p>
                <p className="text-[11px] opacity-75 mt-1">
                  {L(
                    "按现在有效的付费订阅 × 定价算，年付按 ÷12。不含退款、手续费和 Google 抽成；实际到账看 Stripe 和 Play Console。",
                    "Active paid subscriptions × list price (yearly ÷ 12). Excludes refunds, fees and Google's cut — see Stripe and Play Console for money received.",
                  )}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/15 px-3 py-2.5">
                  <p className="text-xl font-bold">{s.paying_users}</p>
                  <p className="text-[10px] opacity-80">{L("付费订阅", "Paying", "Berbayar")}</p>
                </div>
                <div className="rounded-2xl bg-white/15 px-3 py-2.5">
                  <p className="text-xl font-bold">{s.lifetime_paid_users}</p>
                  <p className="text-[10px] opacity-80">{L("终身版", "Lifetime", "Seumur hidup")}</p>
                </div>
                <div className="rounded-2xl bg-white/15 px-3 py-2.5">
                  <p className="text-xl font-bold">{s.gifted_users}</p>
                  <p className="text-[10px] opacity-80">{L("赠送", "Gifted", "Hadiah")}</p>
                </div>
              </div>
            </section>

            {/* Plan breakdown */}
            <section className="rounded-3xl bg-card border border-border/60 p-5 space-y-3 shadow-[var(--shadow-card)]">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{L("各方案", "By plan", "Ikut pelan")}</p>
              {s.plan_breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">{L("还没有付费或赠送的用户。", "No paid or gifted users yet.")}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {s.plan_breakdown.map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-sm text-foreground truncate">{planLabel(b.key)}</span>
                      <span className="text-right shrink-0">
                        <span className="text-sm font-semibold text-foreground">{b.count}</span>
                        {b.monthly > 0 && <span className="block text-[11px] text-muted-foreground">{rm(b.monthly)}/{L("月", "mo")}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={<Users className="h-4 w-4" />}
              label={L("用户总数", "Users", "Pengguna")}
              value={String(realUsers.length)}
              sub={`${L("今天", "today")} +${newToday} · ${L("7 天", "7 days")} +${newWeek}`}
            />
            <Kpi
              icon={<Crown className="h-4 w-4" />}
              label={L("免费用户", "Free users", "Pengguna percuma")}
              value={String(realUsers.filter((u) => u.subscription_kind === "free").length)}
              sub={realUsers.length ? `${Math.round((realUsers.filter((u) => u.subscription_kind === "free").length / realUsers.length) * 100)}%` : "—"}
            />
            <Kpi
              icon={<span className="text-[11px] font-black">TT</span>}
              label={L("已连接 TikTok", "TikTok connected", "TikTok bersambung")}
              value={`${s.tiktok_connected}`}
              sub={s.tiktok_errors > 0 ? `${s.tiktok_errors} ${L("个有问题", "with problems")}` : L("全部正常", "all OK")}
              warn={s.tiktok_errors > 0}
              onClick={() => { setTab("users"); setUserFilter("tiktok"); }}
            />
            <Kpi
              icon={<Store className="h-4 w-4" />}
              label={L("用户店铺总销售额", "Users' shop sales", "Jualan kedai pengguna")}
              value={rm(s.shop_sales_total, 0)}
              sub={L("用户自己的生意，不是 Bossify 收入", "Users' own business, not Bossify income")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* TikTok connections */}
            <section className="rounded-3xl bg-card border border-border/60 p-5 space-y-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">{L("谁连接了 TikTok", "Who connected TikTok", "Siapa sambung TikTok")}</p>
                {tiktokUsers.length > 5 && (
                  <button onClick={() => { setTab("users"); setUserFilter("tiktok"); }} className="text-xs font-semibold text-primary">
                    {L("全部", "All")} ({tiktokUsers.length})
                  </button>
                )}
              </div>
              {tiktokUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{L("还没有用户连接 TikTok Shop。", "No user has connected TikTok Shop yet.")}</p>
              ) : (
                <ul className="divide-y divide-border/50">
                  {tiktokUsers.slice(0, 5).map((u) => {
                    const b = tiktokBadge(u);
                    return (
                      <li key={u.id} className="py-2.5 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {u.business_name || u.id.slice(0, 8)}
                            {u.is_admin && <Crown className="inline-block h-3 w-3 ml-1 text-primary -mt-0.5" />}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {u.tiktok?.shop_name ? `${u.tiktok.shop_name} · ` : ""}
                            {L("上次同步", "Last sync")} {timeAgo(u.tiktok?.last_synced_at, lang)} · {u.tiktok_orders} {L("张 TikTok 订单", "TikTok orders")}
                          </p>
                          {u.tiktok?.last_error && <p className="text-[11px] text-red-600 truncate">{u.tiktok.last_error}</p>}
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${b.cls}`}>{b.text}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Newest sign-ups */}
            <section className="rounded-3xl bg-card border border-border/60 p-5 space-y-3 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">{L("最新注册", "Newest sign-ups", "Pendaftaran terbaru")}</p>
                <button onClick={() => { setTab("users"); setUserFilter("all"); }} className="text-xs font-semibold text-primary">
                  {L("全部用户", "All users")}
                </button>
              </div>
              <ul className="divide-y divide-border/50">
                {realUsers.slice(0, 5).map((u) => {
                  const k = kindBadge(u);
                  return (
                    <li key={u.id} className="py-2.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{u.business_name || u.id.slice(0, 8)}</p>
                        <p className="text-[11px] text-muted-foreground">{shortDate(u.created_at)} · {u.total_orders} {L("张订单", "orders")}</p>
                      </div>
                      {u.tiktok && <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${tiktokBadge(u).cls}`}>TikTok</span>}
                      <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${k.cls}`}>{k.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {/* Test mode */}
          <section className="rounded-3xl border border-dashed border-border p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5"><FlaskConical className="h-4 w-4 text-primary" /> {t("admin_test_mode")}</p>
              <p className="text-xs text-muted-foreground">{t("admin_test_desc")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:w-72">
              <button onClick={grantSelfPro} className="py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs">
                {t("admin_grant_self")}
              </button>
              <button onClick={revokeSelf} className="py-2.5 rounded-xl bg-muted text-muted-foreground font-semibold text-xs">
                {t("admin_revert_self")}
              </button>
            </div>
          </section>
          <p className="text-[11px] text-muted-foreground px-1">
            {L("统计数字不含管理员账号（你自己的测试数据）。", "Totals exclude admin accounts (your own test data).")}
          </p>
        </div>
      )}

      {/* ============ USERS ============ */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder={L("搜索店名、方案、TikTok 店名或 ID", "Search shop, plan, TikTok shop or ID")}
              className="w-full h-11 rounded-2xl bg-card border border-border/60 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
            {([
              { k: "all", label: L("全部", "All"), n: users.length },
              { k: "paying", label: L("付费", "Paying"), n: users.filter((u) => u.subscription_kind === "paid" || u.subscription_kind === "lifetime_paid").length },
              { k: "gifted", label: L("赠送", "Gifted"), n: users.filter((u) => u.subscription_kind === "gifted").length },
              { k: "free", label: L("免费", "Free"), n: users.filter((u) => u.subscription_kind === "free").length },
              { k: "tiktok", label: L("连了 TikTok", "TikTok"), n: users.filter((u) => !!u.tiktok).length },
            ] as const).map((f) => (
              <button
                key={f.k}
                onClick={() => setUserFilter(f.k)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  userFilter === f.k
                    ? f.k === "tiktok" ? "bg-black text-white border-black" : "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border"
                }`}
              >
                {f.label} ({f.n})
              </button>
            ))}
          </div>

          {/* Phone: cards */}
          <div className="space-y-2 lg:hidden">
            {filteredUsers.map((u) => {
              const k = kindBadge(u);
              const tk = tiktokBadge(u);
              const paidPlan = u.subscription_kind !== "free";
              return (
                <div key={u.id} className="rounded-2xl bg-card border border-border/60 p-4 space-y-3 shadow-[var(--shadow-card)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {u.business_name || u.id.slice(0, 12)}
                        {u.is_admin && <Crown className="inline-block h-3.5 w-3.5 ml-1 text-primary -mt-0.5" />}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{t("admin_joined")} {shortDate(u.created_at)}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${k.cls}`}>{k.text}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 border border-border/50 px-3 py-2 text-[11px]">
                    <div>
                      <p className="text-muted-foreground">{L("订单", "Orders")}</p>
                      <p className="font-semibold text-foreground">{u.total_orders}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{L("店铺销售", "Shop sales")}</p>
                      <p className="font-semibold text-foreground">{rm(u.total_revenue, 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{L("到期", "Renews / ends")}</p>
                      <p className="font-semibold text-foreground">{paidPlan ? (u.plan === "lifetime" ? "∞" : shortDate(u.current_period_end ?? u.expires_at)) : "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] min-w-0">
                    <span className={`shrink-0 font-semibold px-2 py-0.5 rounded-full ${tk.cls}`}>TikTok · {tk.text}</span>
                    {u.tiktok && (
                      <span className="text-muted-foreground truncate">
                        {u.tiktok.shop_name ? `${u.tiktok.shop_name} · ` : ""}{L("同步", "sync")} {timeAgo(u.tiktok.last_synced_at, lang)}
                      </span>
                    )}
                    {providerLabel(u.provider) && paidPlan && (
                      <span className="ml-auto shrink-0 text-muted-foreground">{providerLabel(u.provider)}</span>
                    )}
                  </div>
                  {u.tiktok?.last_error && (
                    <p className="text-[11px] text-red-600 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {u.tiktok.last_error}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {u.plan && u.plan !== "free" ? (
                      <button onClick={() => revokePro(u.id)} className="py-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-semibold">
                        {t("admin_revoke_pro")}
                      </button>
                    ) : (
                      <button
                        onClick={() => { setGrantPlan("pro"); setGrantOpen({ uid: u.id, name: u.business_name || u.id.slice(0, 8) }); }}
                        className="py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-semibold"
                      >
                        {t("admin_grant_pro")}
                      </button>
                    )}
                    <button onClick={() => copyId(u.id)} className="py-2 rounded-xl bg-muted text-muted-foreground text-[11px] font-semibold flex items-center justify-center gap-1">
                      <Copy className="h-3 w-3" /> {L("复制 ID", "Copy ID")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/30">
                  <th className="px-4 py-3">{L("用户", "User")}</th>
                  <th className="px-4 py-3">{L("方案", "Plan")}</th>
                  <th className="px-4 py-3">{L("到期", "Renews / ends")}</th>
                  <th className="px-4 py-3">TikTok</th>
                  <th className="px-4 py-3 text-right">{L("订单", "Orders")}</th>
                  <th className="px-4 py-3 text-right">{L("店铺销售", "Shop sales")}</th>
                  <th className="px-4 py-3 text-right">{L("操作", "Action")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const k = kindBadge(u);
                  const tk = tiktokBadge(u);
                  const paidPlan = u.subscription_kind !== "free";
                  return (
                    <tr key={u.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 align-top">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-foreground">
                          {u.business_name || u.id.slice(0, 12)}
                          {u.is_admin && <Crown className="inline-block h-3.5 w-3.5 ml-1 text-primary -mt-0.5" />}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t("admin_joined")} {shortDate(u.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${k.cls}`}>{k.text}</span>
                        {providerLabel(u.provider) && paidPlan && <p className="text-[11px] text-muted-foreground mt-1">{providerLabel(u.provider)}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {paidPlan ? (u.plan === "lifetime" ? "∞" : shortDate(u.current_period_end ?? u.expires_at)) : "—"}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tk.cls}`}>{tk.text}</span>
                        {u.tiktok && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">
                            {u.tiktok.shop_name ? `${u.tiktok.shop_name} · ` : ""}{L("同步", "sync")} {timeAgo(u.tiktok.last_synced_at, lang)}
                          </p>
                        )}
                        {u.tiktok?.last_error && <p className="text-[11px] text-red-600 truncate" title={u.tiktok.last_error}>{u.tiktok.last_error}</p>}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {u.total_orders}
                        {u.tiktok_orders > 0 && <p className="text-[11px] text-muted-foreground">TikTok {u.tiktok_orders}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{rm(u.total_revenue, 0)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {u.plan && u.plan !== "free" ? (
                          <button onClick={() => revokePro(u.id)} className="h-8 px-2.5 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted">
                            {t("admin_revoke_pro")}
                          </button>
                        ) : (
                          <button
                            onClick={() => { setGrantPlan("pro"); setGrantOpen({ uid: u.id, name: u.business_name || u.id.slice(0, 8) }); }}
                            className="h-8 px-2.5 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10"
                          >
                            {t("admin_grant_pro")}
                          </button>
                        )}
                        <button onClick={() => copyId(u.id)} title={L("复制 ID", "Copy ID")} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">{L("没有符合的用户", "No matching users")}</p>}
        </div>
      )}

      {/* ============ ORDERS ============ */}
      {tab === "orders" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
              placeholder={L("搜索订单号、客户、商品或店名", "Search code, customer, product or shop")}
              className="w-full h-11 rounded-2xl bg-card border border-border/60 pl-9 pr-4 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 scrollbar-none">
            {([
              { k: "all", label: L("全部", "All") },
              { k: "paid", label: L("已成交", "Paid / shipped") },
              { k: "unpaid", label: L("未付款", "Unpaid") },
              { k: "other", label: L("其他", "Other") },
            ] as const).map((f) => (
              <button
                key={f.k}
                onClick={() => setOrderFilter(f.k)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  orderFilter === f.k ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {/* How old */}
          <div className="flex gap-1 p-1 rounded-2xl bg-muted/60 border border-border/50 w-max max-w-full overflow-x-auto scrollbar-none">
            {([
              { k: 0, label: L("最新", "Latest") },
              { k: 30, label: L("超过 30 天", "Over 30 days") },
              { k: 90, label: L("超过 90 天", "Over 90 days") },
              { k: 180, label: L("超过 180 天", "Over 180 days") },
            ] as const).map((f) => (
              <button
                key={f.k}
                onClick={() => setOrderAge(f.k)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${orderAge === f.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground px-1">
            {orderAge === 0
              ? L("显示最近 200 张订单。", "Showing the latest 200 orders.")
              : L(`显示 ${orderAge} 天前最旧的 200 张订单。`, `Showing the oldest 200 orders from over ${orderAge} days ago.`)}
          </p>

          {/* Select / delete bar */}
          {filteredOrders.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={filteredOrders.length > 0 && filteredOrders.every((o) => selectedOrders.has(o.id))}
                  onChange={(e) => {
                    const next = new Set(selectedOrders);
                    for (const o of filteredOrders) {
                      if (e.target.checked) next.add(o.id); else next.delete(o.id);
                    }
                    setSelectedOrders(next);
                  }}
                />
                {L("全选", "Select all")} ({filteredOrders.length})
              </label>
              {selectedOrders.size > 0 && (
                <button
                  onClick={() => setConfirmDeleteOrders(ordersSource.filter((o) => selectedOrders.has(o.id)))}
                  className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold active:scale-95 transition-transform"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {L(`删除所选（${selectedOrders.size}）`, `Delete selected (${selectedOrders.size})`)}
                </button>
              )}
            </div>
          )}

          {agedLoading && <p className="text-center text-sm text-muted-foreground py-4">Loading…</p>}
          <div className="rounded-2xl bg-card border border-border/60 shadow-[var(--shadow-card)] divide-y divide-border/50 overflow-hidden">
            {filteredOrders.map((o) => (
              <div key={o.id} className={`px-4 py-3 flex items-start gap-3 ${selectedOrders.has(o.id) ? "bg-red-500/5" : ""}`}>
                <input
                  type="checkbox"
                  aria-label={o.code}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  checked={selectedOrders.has(o.id)}
                  onChange={(e) => {
                    const next = new Set(selectedOrders);
                    if (e.target.checked) next.add(o.id); else next.delete(o.id);
                    setSelectedOrders(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{o.code}</span>
                    {o.order_source === "tiktok" && <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-black text-white">TikTok</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{o.customer_name} · {o.product}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{userMap.get(o.user_id) ?? o.user_id.slice(0, 8)} · {shortDate(o.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">{rm(o.amount)}</p>
                  <p className={`text-[11px] font-semibold ${isPaidStatus(o.status) ? "text-emerald-600" : o.status === "Unpaid" ? "text-red-600" : "text-muted-foreground"}`}>{statusText(o.status)}</p>
                </div>
                <button
                  onClick={() => setConfirmDeleteOrders([o])}
                  aria-label={L("删除", "Delete")}
                  title={L("删除这张订单", "Delete this order")}
                  className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {filteredOrders.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">{L("没有订单", "No orders")}</p>}
          </div>
        </div>
      )}

      {/* ============ AI ============ */}
      {tab === "ai" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-1.5"><Bot className="h-4 w-4" /> {L("AI 用量", "AI usage")}</h3>
            <button onClick={loadAiStats} className="text-xs px-3 py-1.5 rounded-full bg-card border border-border/60 font-semibold flex items-center gap-1">
              <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} /> {L("刷新", "Refresh")}
            </button>
          </div>
          {aiLoading && !aiStats && <p className="text-xs text-muted-foreground">Loading…</p>}
          {aiError && <p className="text-xs text-destructive">{aiError}</p>}
          {aiStats && (
            <>
              <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
                <Kpi label={L("今天次数", "Today calls")} value={String(aiStats.today.calls)} />
                <Kpi label={L("本月次数", "Month calls")} value={String(aiStats.this_month.calls)} />
                <Kpi label={L("总次数", "Total calls")} value={String(aiStats.total.calls)} />
                <Kpi label={L("今天费用", "Today $")} value={`$${aiStats.today.cost_usd.toFixed(4)}`} />
                <Kpi label={L("本月费用", "Month $")} value={`$${aiStats.this_month.cost_usd.toFixed(4)}`} accent />
                <Kpi label={L("免费额度剩余", "Free left")} value={`$${Math.max(0, 1 - aiStats.this_month.cost_usd).toFixed(4)}`} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-2 shadow-[var(--shadow-card)]">
                  <p className="text-xs font-bold">{L("按功能", "By feature")}</p>
                  {aiStats.by_feature.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{L("还没有 AI 调用。", "No AI calls yet.")}</p>
                  ) : (
                    aiStats.by_feature.map((f) => (
                      <div key={f.feature} className="flex items-center justify-between text-[11px] border-t border-border/40 first:border-t-0 pt-1.5 first:pt-0">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{f.feature}</p>
                          <p className="text-muted-foreground">
                            {f.calls} calls · {f.input_tokens.toLocaleString()} in / {f.output_tokens.toLocaleString()} out
                          </p>
                        </div>
                        <span className="font-bold">${f.cost_usd.toFixed(4)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="rounded-2xl bg-card border border-border/60 p-4 space-y-2 shadow-[var(--shadow-card)]">
                  <p className="text-xs font-bold">{L("最近失败", "Recent failures")}</p>
                  {aiStats.recent_failures.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> {L("没有失败", "No failures")}</p>
                  ) : (
                    aiStats.recent_failures.map((r) => (
                      <div key={r.id} className="text-[11px] border-t border-border/40 first:border-t-0 pt-1.5 first:pt-0">
                        <div className="flex justify-between">
                          <span className="font-semibold">{r.feature}</span>
                          <span className="text-destructive">{r.status}</span>
                        </div>
                        <p className="text-muted-foreground truncate">
                          {new Date(r.created_at).toLocaleString()} · {r.model}
                          {r.error_msg ? ` · ${r.error_msg}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {confirmDeleteOrders && confirmDeleteOrders.length > 0 && (() => {
        const list = confirmDeleteOrders;
        const total = list.reduce((sum, o) => sum + Number(o.amount ?? 0), 0);
        const shops = new Set(list.map((o) => o.user_id)).size;
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => !deletingOrders && setConfirmDeleteOrders(null)}>
            <div className="w-full max-w-[420px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold flex items-center gap-2 text-red-600">
                <Trash2 className="h-4 w-4" /> {L(`永久删除 ${list.length} 张订单？`, `Permanently delete ${list.length} order(s)?`)}
              </h3>
              <div className="rounded-2xl bg-muted/40 border border-border/50 p-3 text-xs space-y-1">
                {list.slice(0, 5).map((o) => (
                  <p key={o.id} className="flex justify-between gap-2">
                    <span className="truncate">{o.code} · {userMap.get(o.user_id) ?? o.user_id.slice(0, 8)}</span>
                    <span className="shrink-0 font-semibold">{rm(o.amount)}</span>
                  </p>
                ))}
                {list.length > 5 && <p className="text-muted-foreground">… {L(`还有 ${list.length - 5} 张`, `and ${list.length - 5} more`)}</p>}
                <p className="pt-1 border-t border-border/50 flex justify-between font-semibold">
                  <span>{L(`共 ${shops} 个店`, `${shops} shop(s)`)}</span>
                  <span>{rm(total)}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {L(
                  "这些是用户自己的生意记录，删了就找不回来，他们的报表和利润也会跟着变。扣过库存的订单会把库存加回去。",
                  "These are the users' own business records. Deleting them can't be undone and changes their reports and profit. Orders that took stock out give it back.",
                )}
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button disabled={deletingOrders} onClick={() => setConfirmDeleteOrders(null)} className="py-3 rounded-xl bg-muted text-foreground font-semibold text-sm">
                  {t("cancel")}
                </button>
                <button disabled={deletingOrders} onClick={() => deleteOrdersNow(list)} className="py-3 rounded-xl bg-red-600 text-white font-semibold text-sm disabled:opacity-60">
                  {deletingOrders ? "…" : L("永久删除", "Delete")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {grantOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setGrantOpen(null)}>
          <div className="w-full max-w-[390px] bg-card rounded-t-3xl sm:rounded-3xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">
              {t("admin_grant_to")} {grantOpen.name}
            </h3>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">{t("admin_choose_plan")}</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "pro", label: "Pro" },
                  { key: "team_starter", label: "Team Starter" },
                  { key: "team_pro", label: "Team Pro" },
                  { key: "team_business", label: "Team Business" },
                ] as const).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setGrantPlan(p.key)}
                    className={`py-2 rounded-xl text-xs font-semibold border ${grantPlan === p.key ? "bg-primary text-primary-foreground border-transparent" : "bg-card text-foreground border-border/60"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">{t("admin_choose_duration")}</p>
            <div className="grid grid-cols-2 gap-2">
              {[1, 3, 6, 12].map((m) => (
                <button key={m} onClick={() => grantPro(grantOpen.uid, m, grantPlan)} className="py-3 rounded-xl bg-primary/10 text-primary font-semibold text-sm">
                  {m} {m > 1 ? t("months_many") : t("month_one")}
                </button>
              ))}
              <button
                onClick={() => grantPro(grantOpen.uid, "lifetime", grantPlan)}
                className="col-span-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles className="h-4 w-4" /> {t("admin_lifetime")}
              </button>
            </div>
            <button onClick={() => setGrantOpen(null)} className="w-full py-3 rounded-xl bg-muted text-muted-foreground font-semibold text-sm">
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label, value, sub, icon, accent, warn, onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  accent?: boolean;
  warn?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={`text-left rounded-2xl border p-4 shadow-[var(--shadow-card)] ${
        accent ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border/60"
      } ${onClick ? "active:scale-[0.99] transition-transform" : ""}`}
    >
      <p className={`text-[11px] font-medium flex items-center gap-1.5 ${accent ? "opacity-80" : "text-muted-foreground"}`}>
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className={`text-xl font-bold mt-1 truncate ${accent ? "" : "text-foreground"}`}>{value}</p>
      {sub && <p className={`text-[11px] mt-0.5 truncate ${warn ? "text-red-600 font-semibold" : accent ? "opacity-75" : "text-muted-foreground"}`}>{sub}</p>}
    </Tag>
  );
}
